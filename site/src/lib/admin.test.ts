import { expect, test } from "bun:test";
import { AdminAuth, playerCommand } from "./admin";

test("admin login locks an address after 10 wrong tries, even with the right password", async () => {
  const auth = new AdminAuth("owner", await Bun.password.hash("right"));
  expect(await auth.verify("1.2.3.4", "owner", "right")).toBe(true);
  for (let i = 0; i < 10; i++) await auth.verify("1.2.3.4", "owner", "wrong");
  expect(await auth.verify("1.2.3.4", "owner", "right")).toBe(false);
  expect(await auth.verify("5.6.7.8", "owner", "right")).toBe(true);
});

test("player actions only take a real minecraft name", () => {
  expect(playerCommand("whitelist-add", "Steve_1")).toBe("whitelist add Steve_1");
  expect(playerCommand("whitelist-add", "Steve; stop")).toBeNull();
  expect(playerCommand("ban", "Steve")).toBeNull();
});
