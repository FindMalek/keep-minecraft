import type { Me } from "../shared/types";
import type { Rcon } from "./rcon";
import { parseScore } from "./rcon";
import type { World } from "./world";

/*
 * Sign in with your Minecraft account, no password: the site shows a code, you type `/trigger login set <code>`
 * in game, and the site checks your `login` score over RCON. Only you can set your own trigger score, so the code
 * proves you're that player. Codes last 5 minutes.
 */

const NAME = /^[A-Za-z0-9_]{3,16}$/;
const TTL = 5 * 60_000;

interface Pending {
  me: Me;
  code: number;
  expires: number;
}

export class Logins {
  private pending = new Map<string, Pending>();
  private attempts = new Map<string, number[]>();

  constructor(
    private world: World,
    private rcon: Rcon,
  ) {}

  /** At most 5 new codes a minute per address. */
  limited(address: string): boolean {
    const now = Date.now();
    const recent = (this.attempts.get(address) ?? []).filter((at) => now - at < 60_000);
    recent.push(now);
    this.attempts.set(address, recent);
    return recent.length > 5;
  }

  async start(name: string): Promise<{ id: string; code: number } | { error: string }> {
    if (!NAME.test(name)) return { error: "that isn't a minecraft name" };
    const member = (await this.world.members()).find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (!member || !NAME.test(member.name)) return { error: "that name isn't on the server's whitelist" };
    for (const [id, entry] of this.pending) if (entry.expires < Date.now()) this.pending.delete(id);
    const id = crypto.randomUUID();
    const code = 100_000 + ((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 900_000);
    this.pending.set(id, { me: { uuid: member.uuid, name: member.name }, code, expires: Date.now() + TTL });
    return { id, code };
  }

  /** The signed-in player once the code shows up in their trigger score, else null. */
  async check(id: string): Promise<Me | null | "expired"> {
    const entry = this.pending.get(id);
    if (!entry || entry.expires < Date.now()) return "expired";
    // The name comes from whitelist.json and matched NAME when the code was issued.
    const score = parseScore(await this.rcon.command(`scoreboard players get ${entry.me.name} login`));
    if (score !== entry.code) return null;
    this.pending.delete(id);
    await this.rcon.command(`scoreboard players reset ${entry.me.name} login`);
    await this.rcon.command(`tellraw ${entry.me.name} {"text":"signed in on the site","color":"gray"}`);
    return entry.me;
  }
}
