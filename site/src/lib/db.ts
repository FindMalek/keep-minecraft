import { Database } from "bun:sqlite";
import type { GameEvent, Me } from "../shared/types";

const SESSION_DAYS = 60;
const ADMIN_SESSION_DAYS = 7;

export class Store {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, uuid TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        starts_at INTEGER NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS going (event_id INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY (event_id, name));
    `);
  }

  createSession(me: Me): string {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    this.db.run("INSERT INTO sessions VALUES (?, ?, ?, ?)", [token, me.uuid, me.name, Date.now() + SESSION_DAYS * 864e5]);
    return token;
  }

  session(token: string): Me | null {
    const row = this.db
      .query<{ uuid: string; name: string }, [string, number]>("SELECT uuid, name FROM sessions WHERE token = ? AND expires > ?")
      .get(token, Date.now());
    return row ?? null;
  }

  deleteSession(token: string): void {
    this.db.run("DELETE FROM sessions WHERE token = ? OR expires < ?", [token, Date.now()]);
  }

  createAdminSession(): string {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    this.db.run("DELETE FROM admin_sessions WHERE expires < ?", [Date.now()]);
    this.db.run("INSERT INTO admin_sessions VALUES (?, ?)", [token, Date.now() + ADMIN_SESSION_DAYS * 864e5]);
    return token;
  }

  isAdmin(token: string): boolean {
    return Boolean(this.db.query("SELECT 1 FROM admin_sessions WHERE token = ? AND expires > ?").get(token, Date.now()));
  }

  deleteAdminSession(token: string): void {
    this.db.run("DELETE FROM admin_sessions WHERE token = ?", [token]);
  }

  /** Upcoming events, plus anything from the last day so tonight's event doesn't vanish once it starts. */
  events(): GameEvent[] {
    const rows = this.db
      .query<{ id: number; title: string; description: string; starts_at: number; created_by: string }, [number]>(
        "SELECT * FROM events WHERE starts_at > ? ORDER BY starts_at",
      )
      .all(Date.now() - 864e5);
    const going = this.db.query<{ name: string }, [number]>("SELECT name FROM going WHERE event_id = ? ORDER BY name");
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      createdBy: row.created_by,
      going: going.all(row.id).map((g) => g.name),
    }));
  }

  addEvent(title: string, description: string, startsAt: number, by: string): number {
    const result = this.db.run("INSERT INTO events (title, description, starts_at, created_by, created_at) VALUES (?, ?, ?, ?, ?)", [
      title,
      description,
      startsAt,
      by,
      Date.now(),
    ]);
    this.setGoing(Number(result.lastInsertRowid), by, true);
    return Number(result.lastInsertRowid);
  }

  /** Only whoever created an event can delete it; `by` null is the admin, who can delete any. */
  deleteEvent(id: number, by: string | null): boolean {
    const result =
      by === null
        ? this.db.run("DELETE FROM events WHERE id = ?", [id])
        : this.db.run("DELETE FROM events WHERE id = ? AND created_by = ?", [id, by]);
    if (result.changes) this.db.run("DELETE FROM going WHERE event_id = ?", [id]);
    return result.changes > 0;
  }

  setGoing(id: number, name: string, going: boolean): void {
    if (going) this.db.run("INSERT OR IGNORE INTO going SELECT ?, ? WHERE EXISTS (SELECT 1 FROM events WHERE id = ?)", [id, name, id]);
    else this.db.run("DELETE FROM going WHERE event_id = ? AND name = ?", [id, name]);
  }
}
