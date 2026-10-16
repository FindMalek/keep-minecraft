import { expect, test } from "bun:test";
import { parseList, parseScore } from "./rcon";

test("reads the online list and scores from the server's replies", () => {
  expect(parseList("There are 2 of a max of 7 players online: Ana, Bo_9")).toEqual({ online: ["Ana", "Bo_9"], max: 7 });
  expect(parseList("There are 0 of a max of 7 players online: ")).toEqual({ online: [], max: 7 });
  expect(parseScore("#chapter has 2 [keep]")).toBe(2);
  expect(parseScore("Can't get value of keep for #q.ch1.bell; none is set")).toBeNull();
});
