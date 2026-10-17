import { AdminAuth, logTail, overview, playerCommand } from "./lib/admin";
import { Store } from "./lib/db";
import { buildState, type Live, readLive } from "./lib/game";
import { Logins } from "./lib/login";
import { parseScore, Rcon } from "./lib/rcon";
import { World } from "./lib/world";
import type { Me, PublicInfo } from "./shared/types";
import index from "./web/index.html";

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`set ${name}`);
  return value;
};

const DATA = env("SITE_DATA", "./data");
const ADDRESS = env("SERVER_ADDRESS", "localhost");
const MAP_URL = process.env.MAP_URL ?? null;
const PACK = `${DATA}/${env("PACK_FILE", "pack.mrpack")}`;
const COOKIE = "keep_session";
const ADMIN_COOKIE = "keep_admin";
const MC_DATA = env("MC_DATA", "/mc");
const BACKUPS = env("BACKUPS_DIR", "/backups");
// The hash is base64 so its `$` signs survive compose env interpolation.
const adminAuth = new AdminAuth(
  process.env.ADMIN_USER ?? null,
  process.env.ADMIN_PASSWORD_HASH_B64 ? Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64, "base64").toString("utf8") : null,
);

const world = new World(MC_DATA, env("LEVEL", "world"));
const rcon = new Rcon(env("RCON_HOST", "minecraft"), Number(env("RCON_PORT", "25575")), env("RCON_PASSWORD"));
const store = new Store(`${DATA}/site.db`);
const logins = new Logins(world, rcon);

// RCON answers ~50 small commands per refresh; everyone shares the same few-seconds-old copy.
let live: { at: number; value: Promise<Live> } | null = null;
async function liveState(): Promise<Live> {
  if (!live || Date.now() - live.at > 5000) {
    const story = await world.story();
    live = {
      at: Date.now(),
      value: story ? readLive(rcon, story, world) : Promise.resolve({ up: false, online: [], max: 0, scores: new Map() }),
    };
  }
  return live.value;
}

function cookie(request: Request, name = COOKIE): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]+)`).exec(request.headers.get("cookie") ?? "");
  return match?.[1] ?? null;
}

function isAdmin(request: Request): boolean {
  const token = cookie(request, ADMIN_COOKIE);
  return Boolean(token && store.isAdmin(token));
}

/** Admin only; every admin call changes or reveals server state, so all need the custom header too. */
function admin(handler: (request: Request) => Response | Promise<Response>) {
  return (request: Request): Response | Promise<Response> => {
    if (!isAdmin(request)) return error("admin only", 401);
    if (request.headers.get("x-keep") !== "1") return error("missing header", 403);
    return handler(request);
  };
}

const sessionCookie = (name: string, token: string, days: number): string =>
  `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${days * 86400}`;

function me(request: Request): Me | null {
  const token = cookie(request);
  return token ? store.session(token) : null;
}

const SECURITY = { "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "SAMEORIGIN" };
const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: SECURITY });
const error = (message: string, status: number): Response => json({ error: message }, status);

/** Signed-in players only; changes also need a custom header, which a cross-site form can't send. */
function guarded(handler: (request: Request, me: Me) => Response | Promise<Response>, mutates = false) {
  return (request: Request): Response | Promise<Response> => {
    const player = me(request);
    if (!player) return error("sign in first", 401);
    if (mutates && request.headers.get("x-keep") !== "1") return error("missing header", 403);
    return handler(request, player);
  };
}

function address(request: Request, server: Bun.Server<unknown>): string {
  return request.headers.get("x-real-ip") ?? server.requestIP(request)?.address ?? "unknown";
}

/*
 * The server stops itself when nobody's on (itzg autostop). Waking it = dropping a file that keep-mc-wake.path on the
 * host watches; the host starts the container. The site itself never touches Docker.
 */
let lastWake = 0;
async function hostRequest(kind: "request" | "restart", by: string): Promise<void> {
  await Bun.write(`${DATA}/wake/${kind}`, `${by} ${new Date().toISOString()}\n`);
  live = null;
}

async function wake(by: string): Promise<boolean> {
  if ((await liveState()).up) return false;
  if (Date.now() - lastWake > 60_000) {
    lastWake = Date.now();
    await Bun.write(`${DATA}/wake/request`, `${by} ${new Date().toISOString()}\n`);
  }
  live = null;
  return true;
}

const heads = new Map<string, { at: number; body: ArrayBuffer; type: string }>();

const server = Bun.serve({
  port: Number(env("PORT", "8080")),
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": index,
    "/story": index,
    "/quests": index,
    "/events": index,
    "/players": index,
    "/world": index,
    "/join": index,
    "/healthz": () => new Response("ok"),

    "/api/public": async () => {
      const state = await liveState();
      const story = await world.story();
      const info: PublicInfo = {
        title: story?.title ?? "the keep",
        address: ADDRESS,
        version: env("MC_VERSION", ""),
        server: { up: state.up, online: state.online.length, max: state.max },
        packUrl: (await Bun.file(PACK).exists()) ? "/pack.mrpack" : null,
      };
      return json(info);
    },
    "/pack.mrpack": async () => {
      const file = Bun.file(PACK);
      if (!(await file.exists())) return new Response("no pack yet", { status: 404 });
      return new Response(file, {
        headers: { "content-type": "application/x-modrinth-modpack+zip", "content-disposition": `attachment; filename="the-keep.mrpack"` },
      });
    },

    "/api/me": (request: Request) => json(me(request)),
    "/api/login/start": {
      POST: async (request: Request, srv: Bun.Server<unknown>) => {
        if (logins.limited(address(request, srv))) return error("too many tries, wait a minute", 429);
        const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
        const result = await logins.start(typeof body?.name === "string" ? body.name.trim() : "");
        if ("error" in result) return error(result.error, 400);
        // Signing in needs the server; a whitelisted name may wake it.
        return json({ ...result, waking: await wake("sign-in") });
      },
    },
    "/api/login/check": {
      POST: async (request: Request) => {
        const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
        if (typeof body?.id !== "string") return error("bad request", 400);
        const result = await logins.check(body.id).catch(() => null);
        if (result === "expired") return error("the code expired, start again", 410);
        if (!result) return json({ ok: false });
        const token = store.createSession(result);
        return new Response(JSON.stringify({ ok: true, me: result }), {
          headers: {
            ...SECURITY,
            "content-type": "application/json",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 86400}`,
          },
        });
      },
    },
    "/api/logout": {
      POST: (request: Request) => {
        const token = cookie(request);
        if (token) store.deleteSession(token);
        return new Response(null, {
          status: 204,
          headers: { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
        });
      },
    },

    "/admin": index,
    "/api/admin/me": (request: Request) => json({ admin: isAdmin(request), enabled: adminAuth.enabled }),
    "/api/admin/login": {
      POST: async (request: Request, srv: Bun.Server<unknown>) => {
        const from = address(request, srv);
        if (adminAuth.locked(from)) return error("too many wrong tries, wait 15 minutes", 429);
        const body = (await request.json().catch(() => null)) as { user?: unknown; password?: unknown } | null;
        const ok =
          typeof body?.user === "string" && typeof body.password === "string" && (await adminAuth.verify(from, body.user, body.password));
        if (!ok) return error("wrong username or password", 401);
        return new Response(JSON.stringify({ admin: true }), {
          headers: {
            ...SECURITY,
            "content-type": "application/json",
            "set-cookie": sessionCookie(ADMIN_COOKIE, store.createAdminSession(), 7),
          },
        });
      },
    },
    "/api/admin/logout": {
      POST: (request: Request) => {
        const token = cookie(request, ADMIN_COOKIE);
        if (token) store.deleteAdminSession(token);
        return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(ADMIN_COOKIE, "", 0) } });
      },
    },
    "/api/admin/overview": { POST: admin(async () => json(await overview(rcon, world, MC_DATA, BACKUPS, store))) },
    "/api/admin/logs": { POST: admin(async () => json(await logTail(MC_DATA))) },
    "/api/admin/server": {
      POST: admin(async (request) => {
        const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
        if (body?.action === "start") return json({ ok: await wake("admin") });
        if (body?.action === "restart") {
          await hostRequest("restart", "admin");
          return json({ ok: true });
        }
        if (body?.action === "stop") {
          // The server saves and exits; it stays stopped until someone wakes it.
          await rcon.command("stop").catch(() => null);
          live = null;
          return json({ ok: true });
        }
        return error("start, stop or restart", 400);
      }),
    },
    "/api/admin/players": {
      POST: admin(async (request) => {
        const body = (await request.json().catch(() => null)) as { action?: unknown; name?: unknown } | null;
        const command = playerCommand(String(body?.action ?? ""), String(body?.name ?? "").trim());
        if (!command) return error("bad action or name", 400);
        const reply = await rcon.command(command).catch(() => null);
        live = null;
        return reply === null ? error("the server is asleep, start it first", 503) : json({ reply });
      }),
    },
    "/api/admin/console": {
      POST: admin(async (request) => {
        const body = (await request.json().catch(() => null)) as { command?: unknown } | null;
        const command = typeof body?.command === "string" ? body.command.trim().replace(/^\//, "") : "";
        if (!command || command.length > 1000) return error("type a command", 400);
        const reply = await rcon.command(command).catch(() => null);
        return reply === null ? error("the server is asleep, start it first", 503) : json({ reply });
      }),
    },
    "/api/admin/chapter": {
      POST: admin(async () => {
        // Opens the next chapter now, finished or not (the Friday timer waits for the current one).
        const current = parseScore(await rcon.command("scoreboard players get #chapter keep").catch(() => "")) ?? 0;
        if (current < 1 || current >= 7) return error(current ? "that was the last chapter" : "the server is asleep, start it first", 400);
        const reply = await rcon.command(`function the_keep:open_chapter {n:${current + 1}}`).catch(() => null);
        live = null;
        return reply === null ? error("the server is asleep, start it first", 503) : json({ reply, chapter: current + 1 });
      }),
    },
    "/api/admin/events/:id": {
      DELETE: admin((request) => {
        const id = Number((request as Bun.BunRequest<"/api/admin/events/:id">).params.id);
        return store.deleteEvent(id, null) ? new Response(null, { status: 204 }) : error("no such event", 404);
      }),
    },

    "/api/wake": { POST: guarded(async (_request, player) => json({ waking: await wake(player.name) }), true) },
    "/api/state": guarded(async () => {
      const story = await world.story();
      if (!story) return error("the story datapack isn't installed", 503);
      return json(await buildState(world, story, await liveState(), Date.now()));
    }),
    "/api/events": {
      GET: guarded(() => json(store.events())),
      POST: guarded(async (request, player) => {
        const body = (await request.json().catch(() => null)) as { title?: unknown; description?: unknown; startsAt?: unknown } | null;
        const title = typeof body?.title === "string" ? body.title.trim() : "";
        const description = typeof body?.description === "string" ? body.description.trim() : "";
        const startsAt = typeof body?.startsAt === "number" ? body.startsAt : NaN;
        if (!title || title.length > 80) return error("a title, up to 80 characters", 400);
        if (description.length > 500) return error("the description is too long", 400);
        if (!(startsAt > Date.now() - 3600_000 && startsAt < Date.now() + 180 * 864e5))
          return error("pick a date in the next 6 months", 400);
        return json({ id: store.addEvent(title, description, startsAt, player.name) }, 201);
      }, true),
    },
    "/api/events/:id": {
      DELETE: guarded((request, player) => {
        const id = Number((request as Bun.BunRequest<"/api/events/:id">).params.id);
        return store.deleteEvent(id, player.name) ? new Response(null, { status: 204 }) : error("only whoever made it can delete it", 403);
      }, true),
    },
    "/api/events/:id/going": {
      POST: guarded(async (request, player) => {
        const id = Number((request as Bun.BunRequest<"/api/events/:id/going">).params.id);
        const body = (await request.json().catch(() => null)) as { going?: unknown } | null;
        store.setGoing(id, player.name, body?.going === true);
        return new Response(null, { status: 204 });
      }, true),
    },

    "/heads/:uuid": async (request: Bun.BunRequest<"/heads/:uuid">) => {
      const uuid = request.params.uuid;
      if (!/^[0-9a-f-]{32,36}$/i.test(uuid)) return new Response("bad uuid", { status: 400 });
      let head = heads.get(uuid);
      if (!head || Date.now() - head.at > 864e5) {
        const response = await fetch(`https://mc-heads.net/avatar/${uuid}/64`).catch(() => null);
        if (!response?.ok) return new Response(null, { status: 404 });
        head = { at: Date.now(), body: await response.arrayBuffer(), type: response.headers.get("content-type") ?? "image/png" };
        heads.set(uuid, head);
      }
      return new Response(head.body, { headers: { "content-type": head.type, "cache-control": "public, max-age=86400" } });
    },
  },

  // The live 3D map (BlueMap), for signed-in players only.
  async fetch(request) {
    const url = new URL(request.url);
    if (MAP_URL && (url.pathname === "/bluemap" || url.pathname.startsWith("/bluemap/"))) {
      if (!me(request)) return new Response("sign in first", { status: 401 });
      if (url.pathname === "/bluemap") return Response.redirect("/bluemap/", 302);
      const upstream = await fetch(`${MAP_URL}${url.pathname.slice("/bluemap".length)}${url.search}`).catch(() => null);
      if (!upstream) return new Response("map unavailable", { status: 502 });
      // fetch already decompressed the body (BlueMap serves gzipped tiles), so drop the encoding headers.
      const headers = new Headers(upstream.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.set("x-frame-options", "SAMEORIGIN");
      return new Response(upstream.body, { status: upstream.status, headers });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`keep minecraft site on :${server.port}`);
