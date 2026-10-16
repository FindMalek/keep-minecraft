import type { ChapterView, Player, State, Story } from "../shared/types";
import { parseList, parseScore, type Rcon } from "./rcon";
import type { World } from "./world";

const NS = "the_keep";
const UNLOCK_DAY = 5; // Friday
const UNLOCK_HOUR_UTC = 17;

/** The next Friday 17:00 UTC after `now` (keep-mc-chapter.timer). */
export function nextUnlock(now: number): number {
  const date = new Date(now);
  date.setUTCHours(UNLOCK_HOUR_UTC, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + ((UNLOCK_DAY - date.getUTCDay() + 7) % 7));
  if (date.getTime() <= now) date.setUTCDate(date.getUTCDate() + 7);
  return date.getTime();
}

export interface Live {
  up: boolean;
  online: string[];
  max: number;
  scores: Map<string, number>;
}

/** Live server state over RCON: who's online, the chapter, pages found and every shared quest flag. */
export async function readLive(rcon: Rcon, story: Story, world: World): Promise<Live> {
  try {
    const { online, max } = parseList(await rcon.command("list"));
    const scores = new Map<string, number>();
    const flags = ["#chapter", "#pages", ...story.quests.filter((q) => q.shared).map((q) => q.flag)];
    for (const flag of flags) {
      const value = parseScore(await rcon.command(`scoreboard players get ${flag} keep`));
      if (value !== null) scores.set(flag, value);
    }
    return { up: true, online, max, scores };
  } catch {
    return { up: false, online: [], max: 0, scores: await world.savedScores() };
  }
}

export async function buildState(world: World, story: Story, live: Live, now: number): Promise<State> {
  const chapter = live.scores.get("#chapter") ?? 1;
  const pages = live.scores.get("#pages") ?? 0;
  const done = (flag: string): boolean => live.scores.get(flag) === 1;

  const members = await world.members();
  const players: Player[] = await Promise.all(
    members.map(async (member) => ({
      uuid: member.uuid,
      name: member.name,
      online: live.online.includes(member.name),
      stats: await world.stats(member.uuid),
      quests: (await world.advancements(member.uuid)).filter((id) => id.startsWith(`${NS}:ch`)),
    })),
  );

  const chapters: ChapterView[] = story.chapters.map((c) => {
    const quests = story.quests.filter((q) => q.chapter === c.n);
    const end = quests.find((q) => q.id === "end");
    return {
      n: c.n,
      name: c.name,
      text: c.n <= chapter ? c.text : [],
      open: c.n <= chapter,
      done: end ? done(end.flag) : false,
      quests:
        c.n <= chapter
          ? quests
              .filter((q) => q.id !== "start")
              .map((q) => {
                const by = players.filter((p) => p.quests.includes(`${NS}:${q.path}`)).map((p) => p.name);
                return { ...q, done: q.shared ? done(q.flag) : by.length > 0, by: q.shared ? [] : by };
              })
          : [],
    };
  });

  const current = chapters.find((c) => c.n === chapter);
  const lastChapter = Math.max(...story.chapters.map((c) => c.n));
  const letter = story.quests.find((q) => q.chapter === 5 && q.id === "letter");
  const finale = story.quests.find((q) => q.chapter === lastChapter && q.id === "end");

  return {
    title: story.title,
    chapter,
    pages,
    chapters,
    journal: {
      tornPage: story.tornPage,
      pages: story.pages.slice(0, pages),
      letter: letter && done(letter.flag) ? story.letter : null,
      ending: finale && done(finale.flag) ? story.ending : null,
    },
    intro: story.intro,
    howItWorks: story.howItWorks,
    players,
    server: { up: live.up, online: live.online.length, max: live.max },
    nextChapterAt: current?.done && chapter < lastChapter ? nextUnlock(now) : null,
  };
}
