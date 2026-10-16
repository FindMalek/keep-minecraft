import { readdir, stat } from "node:fs/promises";
import type { PlayerStats, Story } from "../shared/types";
import { readNbt } from "./nbt";

/*
 * Reads the server's files (mounted read-only): who's whitelisted, the story the datapack exported, and each
 * player's advancements and stats. The game writes those on autosave and logout, so they lag by a few minutes.
 */

export interface Member {
  uuid: string;
  name: string;
}

async function json<T>(path: string, fallback: T): Promise<T> {
  try {
    return (await Bun.file(path).json()) as T;
  } catch {
    return fallback;
  }
}

export class World {
  constructor(
    private root: string,
    private level: string,
  ) {}

  members(): Promise<Member[]> {
    return json<Member[]>(`${this.root}/whitelist.json`, []);
  }

  story(): Promise<Story | null> {
    return json<Story | null>(`${this.root}/${this.level}/datapacks/the-keep/story.json`, null);
  }

  /** The `keep` objective as last saved (autosave, stop); what the site shows while the server sleeps. */
  async savedScores(): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    try {
      const file = await Bun.file(`${this.root}/${this.level}/data/minecraft/scoreboard.dat`).bytes();
      const root = readNbt(file) as { data?: { PlayerScores?: { Objective?: string; Name?: string; Score?: number }[] } };
      for (const entry of root.data?.PlayerScores ?? []) {
        if (entry.Objective === "keep" && entry.Name) scores.set(entry.Name, entry.Score ?? 0);
      }
    } catch {
      // No world yet.
    }
    return scores;
  }

  /** Advancement ids each player has finished, e.g. "the_keep:ch1/bell". */
  async advancements(uuid: string): Promise<string[]> {
    const data = await json<Record<string, { done?: boolean }>>(`${this.root}/${this.level}/players/advancements/${uuid}.json`, {});
    return Object.entries(data)
      .filter(([, value]) => typeof value === "object" && value?.done)
      .map(([id]) => id);
  }

  async stats(uuid: string): Promise<PlayerStats | null> {
    const path = `${this.root}/${this.level}/players/stats/${uuid}.json`;
    const data = await json<{ stats?: Record<string, Record<string, number>> } | null>(path, null);
    if (!data?.stats) return null;
    return summarize(data.stats, (await stat(path)).mtimeMs);
  }

  async hasPlayed(uuid: string): Promise<boolean> {
    try {
      return (await readdir(`${this.root}/${this.level}/players/stats`)).includes(`${uuid}.json`);
    } catch {
      return false;
    }
  }
}

const TRAVEL = [
  "walk_one_cm",
  "sprint_one_cm",
  "crouch_one_cm",
  "swim_one_cm",
  "walk_on_water_one_cm",
  "walk_under_water_one_cm",
  "climb_one_cm",
  "fly_one_cm",
  "aviate_one_cm",
  "boat_one_cm",
  "horse_one_cm",
  "minecart_one_cm",
  "pig_one_cm",
  "strider_one_cm",
  "happy_ghast_one_cm",
];

function total(group: Record<string, number> | undefined): number {
  return Object.values(group ?? {}).reduce((sum, value) => sum + value, 0);
}

export function summarize(stats: Record<string, Record<string, number>>, savedAt: number): PlayerStats {
  const custom = stats["minecraft:custom"] ?? {};
  const get = (key: string): number => custom[`minecraft:${key}`] ?? 0;
  return {
    playMinutes: Math.round(get("play_time") / 20 / 60),
    deaths: get("deaths"),
    km: Math.round(TRAVEL.reduce((sum, key) => sum + get(key), 0) / 100_000),
    mobKills: get("mob_kills"),
    blocksMined: total(stats["minecraft:mined"]),
    fish: get("fish_caught"),
    savedAt,
  };
}
