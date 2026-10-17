import { readdir, stat } from "node:fs/promises";
import type { AdminOverview } from "../shared/types";
import type { Store } from "./db";
import { parseList, parseScore, type Rcon } from "./rcon";
import type { World } from "./world";

/*
 * The owner's side of the site (/admin): one account from the environment (ADMIN_USER + a password hash), its own
 * session cookie, and a few fixed server actions. The console is the one free-form thing, and it's admin-only.
 */

const NAME = /^[A-Za-z0-9_]{3,16}$/;
const LOCK_AFTER = 10;
const LOCK_MS = 15 * 60_000;

export class AdminAuth {
  private failures = new Map<string, number[]>();

  constructor(
    private user: string | null,
    private hash: string | null,
  ) {}

  get enabled(): boolean {
    return Boolean(this.user && this.hash);
  }

  locked(address: string): boolean {
    const recent = (this.failures.get(address) ?? []).filter((at) => Date.now() - at < LOCK_MS);
    this.failures.set(address, recent);
    return recent.length >= LOCK_AFTER;
  }

  /** Checks the login; a wrong one counts towards a 15-minute lock for that address. */
  async verify(address: string, user: string, password: string): Promise<boolean> {
    if (!this.user || !this.hash || this.locked(address)) return false;
    const ok = (await Bun.password.verify(password, this.hash).catch(() => false)) && user === this.user;
    // locked() above made sure there's a list for this address.
    if (!ok) this.failures.get(address)?.push(Date.now());
    return ok;
  }
}

export type PlayerAction = "whitelist-add" | "whitelist-remove" | "op" | "deop" | "kick";

const PLAYER_COMMANDS: Record<PlayerAction, (name: string) => string> = {
  "whitelist-add": (name) => `whitelist add ${name}`,
  "whitelist-remove": (name) => `whitelist remove ${name}`,
  op: (name) => `op ${name}`,
  deop: (name) => `deop ${name}`,
  kick: (name) => `kick ${name} kicked by the admin`,
};

export function playerCommand(action: string, name: string): string | null {
  if (!NAME.test(name) || !(action in PLAYER_COMMANDS)) return null;
  return PLAYER_COMMANDS[action as PlayerAction](name);
}

async function json<T>(path: string, fallback: T): Promise<T> {
  try {
    return (await Bun.file(path).json()) as T;
  } catch {
    return fallback;
  }
}

export async function overview(rcon: Rcon, world: World, mcData: string, backups: string, store: Store): Promise<AdminOverview> {
  let up = true;
  let online: string[] = [];
  let max = 0;
  let chapter: number | null = null;
  let pages: number | null = null;
  try {
    ({ online, max } = parseList(await rcon.command("list")));
    chapter = parseScore(await rcon.command("scoreboard players get #chapter keep"));
    pages = parseScore(await rcon.command("scoreboard players get #pages keep"));
  } catch {
    up = false;
    const saved = await world.savedScores();
    chapter = saved.get("#chapter") ?? null;
    pages = saved.get("#pages") ?? null;
  }
  const whitelist = await json<{ name: string; uuid: string }[]>(`${mcData}/whitelist.json`, []);
  const ops = await json<{ name: string }[]>(`${mcData}/ops.json`, []);
  let files: AdminOverview["backups"] = [];
  try {
    files = await Promise.all(
      (await readdir(backups))
        .filter((name) => !name.startsWith("."))
        .map(async (name) => {
          const info = await stat(`${backups}/${name}`);
          return { name, bytes: info.size, at: info.mtimeMs };
        }),
    );
    files.sort((a, b) => b.at - a.at);
  } catch {
    // No backups yet.
  }
  return {
    server: { up, online, max },
    chapter,
    pages,
    whitelist: whitelist.map((m) => ({ name: m.name, uuid: m.uuid, op: ops.some((o) => o.name === m.name) })),
    backups: files,
    events: store.events(),
  };
}

/** The last lines of the server log (logs/latest.log), newest last. */
export async function logTail(mcData: string, lines = 200): Promise<string[]> {
  try {
    const text = await Bun.file(`${mcData}/logs/latest.log`).text();
    return text.trimEnd().split("\n").slice(-lines);
  } catch {
    return [];
  }
}
