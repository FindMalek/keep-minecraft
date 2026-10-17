export interface StoryQuest {
  chapter: number;
  id: string;
  path: string;
  title: string;
  description: string;
  shared: boolean;
  frame: "task" | "goal" | "challenge";
  icon: string;
  flag: string;
}

/** Exported by the datapack builder (minecraft/build.py) next to the datapack. */
export interface Story {
  title: string;
  intro: string[];
  howItWorks: string[];
  tornPage: string[];
  pages: string[];
  letter: string[];
  ending: string[];
  chapters: { n: number; name: string; text: string[] }[];
  quests: StoryQuest[];
  finales: Record<string, string[]>;
}

export interface PlayerStats {
  playMinutes: number;
  deaths: number;
  km: number;
  mobKills: number;
  blocksMined: number;
  fish: number;
  /** When the game last wrote this player's stats (on autosave or logout). */
  savedAt: number;
}

export interface Player {
  uuid: string;
  name: string;
  online: boolean;
  stats: PlayerStats | null;
  /** Quests this player finished themselves (personal quests) or got with the group (shared ones). */
  quests: string[];
}

export interface QuestStatus extends StoryQuest {
  done: boolean;
  /** For personal quests: who has done it. */
  by: string[];
}

export interface ChapterView {
  n: number;
  name: string;
  text: string[];
  open: boolean;
  done: boolean;
  quests: QuestStatus[];
}

export interface Me {
  uuid: string;
  name: string;
}

export interface GameEvent {
  id: number;
  title: string;
  description: string;
  startsAt: number;
  createdBy: string;
  going: string[];
}

export interface State {
  title: string;
  chapter: number;
  pages: number;
  chapters: ChapterView[];
  /** Only what the group has reached: journal pages found, the letter and ending once earned. */
  journal: { tornPage: string[]; pages: string[]; letter: string[] | null; ending: string[] | null };
  intro: string[];
  howItWorks: string[];
  players: Player[];
  server: { up: boolean; online: number; max: number };
  /** Next Friday unlock, or null when the current chapter isn't finished (or it was the last). */
  nextChapterAt: number | null;
}

export interface PublicInfo {
  title: string;
  address: string;
  version: string;
  server: { up: boolean; online: number; max: number };
  packUrl: string | null;
}

export interface AdminOverview {
  server: { up: boolean; online: string[]; max: number };
  chapter: number | null;
  pages: number | null;
  whitelist: { name: string; uuid: string; op: boolean }[];
  backups: { name: string; bytes: number; at: number }[];
  events: GameEvent[];
}
