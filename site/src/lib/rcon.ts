import type { Socket } from "bun";

/*
 * Minimal Source RCON client (what Minecraft speaks): one connection, commands run one at a time.
 * Only fixed commands with validated arguments go through here; RCON is the server's full console.
 */

const AUTH = 3;
const COMMAND = 2;

function packet(id: number, type: number, body: string): Uint8Array {
  const text = Buffer.from(body, "utf8");
  const out = Buffer.alloc(14 + text.length);
  out.writeInt32LE(10 + text.length, 0);
  out.writeInt32LE(id, 4);
  out.writeInt32LE(type, 8);
  text.copy(out, 12);
  return out;
}

export class Rcon {
  private socket: Socket<undefined> | null = null;
  private buffer = Buffer.alloc(0);
  private waiting = new Map<number, (body: string) => void>();
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private host: string,
    private port: number,
    private password: string,
  ) {}

  /** Runs a command and returns the server's reply; rejects after 5 s or if the server is down. */
  command(command: string): Promise<string> {
    const run = this.queue.then(() => this.send(command));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async send(command: string): Promise<string> {
    await this.connect();
    return this.request(COMMAND, command);
  }

  private request(type: number, body: string): Promise<string> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        this.close();
        reject(new Error("rcon timeout"));
      }, 5000);
      this.waiting.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      this.socket?.write(packet(id, type, body));
    });
  }

  private async connect(): Promise<void> {
    if (this.socket) return;
    this.socket = await Bun.connect({
      hostname: this.host,
      port: this.port,
      socket: {
        data: (_socket, chunk) => this.receive(chunk),
        close: () => this.close(),
        error: () => this.close(),
      },
    });
    const id = this.nextId;
    await this.request(AUTH, this.password);
    // A failed login answers with id -1, which never resolves `request`; the timeout closes the socket.
    if (this.waiting.has(id)) throw new Error("rcon auth failed");
  }

  private receive(chunk: Uint8Array): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readInt32LE(0);
      if (this.buffer.length < 4 + length) return;
      const id = this.buffer.readInt32LE(4);
      const body = this.buffer.subarray(12, 4 + length - 2).toString("utf8");
      this.buffer = this.buffer.subarray(4 + length);
      const done = this.waiting.get(id);
      this.waiting.delete(id);
      done?.(body);
    }
  }

  private close(): void {
    this.socket?.end();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }
}

/** "There are 2 of a max of 7 players online: Ana, Bo" → names. */
export function parseList(reply: string): { online: string[]; max: number } {
  const match = /of a max of (\d+) players online:(.*)$/s.exec(reply);
  if (!match) return { online: [], max: 0 };
  const names = (match[2] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return { online: names, max: Number(match[1]) };
}

/** "#chapter has 2 [keep]" → 2; "Can't get value…" / "none is set" → null. */
export function parseScore(reply: string): number | null {
  const match = /has (-?\d+) \[/.exec(reply);
  return match ? Number(match[1]) : null;
}
