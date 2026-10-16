import { expect, test } from "bun:test";
import type { Story } from "../shared/types";
import { buildState, nextUnlock } from "./game";
import type { World } from "./world";

const quest = (chapter: number, id: string, shared = true) => ({
  chapter,
  id,
  path: `ch${chapter}/${id}`,
  title: id,
  description: "",
  shared,
  frame: "task" as const,
  icon: "",
  flag: `#q.ch${chapter}.${id}`,
});

const story: Story = {
  title: "t",
  intro: [],
  howItWorks: [],
  tornPage: [],
  pages: ["p1", "p2", "p3"],
  letter: ["secret letter"],
  ending: ["secret ending"],
  chapters: [
    { n: 1, name: "one", text: [] },
    { n: 2, name: "two", text: ["spoiler"] },
  ],
  quests: [quest(1, "start"), quest(1, "bell"), quest(1, "end"), quest(2, "start"), quest(2, "camp"), quest(2, "end")],
  finales: { "1": ["bell"], "2": ["camp"] },
};

const world = { members: async () => [], stats: async () => null, advancements: async () => [] } as unknown as World;

test("hides chapters, pages and the letter the group hasn't reached", async () => {
  const live = {
    up: true,
    online: [],
    max: 7,
    scores: new Map([
      ["#chapter", 1],
      ["#pages", 1],
    ]),
  };
  const state = await buildState(world, story, live, 0);
  expect(state.chapters[1]).toMatchObject({ open: false, text: [], quests: [] });
  expect(state.journal).toMatchObject({ pages: ["p1"], letter: null, ending: null });
});

test("next chapter time only once the current chapter is done", async () => {
  const now = Date.UTC(2026, 9, 17, 12); // saturday
  const open = await buildState(world, story, { up: true, online: [], max: 7, scores: new Map([["#chapter", 1]]) }, now);
  expect(open.nextChapterAt).toBeNull();
  const done = await buildState(
    world,
    story,
    {
      up: true,
      online: [],
      max: 7,
      scores: new Map([
        ["#chapter", 1],
        ["#q.ch1.end", 1],
      ]),
    },
    now,
  );
  expect(done.nextChapterAt).toBe(Date.UTC(2026, 9, 23, 17));
});

test("friday unlock: later the same friday, or next week once 17:00 has passed", () => {
  expect(nextUnlock(Date.UTC(2026, 9, 16, 9))).toBe(Date.UTC(2026, 9, 16, 17));
  expect(nextUnlock(Date.UTC(2026, 9, 16, 17))).toBe(Date.UTC(2026, 9, 23, 17));
});
