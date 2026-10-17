# keep-minecraft

A small story-driven Minecraft server for a group of friends who play after work: a vanilla world with a story on
top, a one-click client pack, and a companion site where everyone follows the story, plans events and sees the map.

Live at **[mc.findmalek.engineer](https://mc.findmalek.engineer)** (the join guide is public; the rest needs a sign-in
with a whitelisted Minecraft account). Built for the keep homelab, Minecraft Java 26.3 on Fabric.

## What's in here

- **`story.py` + `build.py`: the story datapack.** "The Last Keepers": an intro screen, a ruined keep generated at
  spawn, 7 chapters (~40 quests) as an advancements tab, journal pages hidden in the 26.3 abandoned camps, rewards and
  dialogs. Group quests count for everyone the moment one player does them; players who were offline catch up when
  they join. A new chapter opens on the Friday after the group finishes the current one (`the_keep:unlock_next`,
  run from a timer). Everything is generated from `story.py`, so the story can be rewritten without touching JSON.
- **`pack.py`: the client pack.** Resolves the mods for the exact game and loader version from Modrinth (with their
  required dependencies) into a `.mrpack` for the Modrinth App or Prism Launcher, with the server already in the list.
- **`site/`: the companion site.** Bun + React 19, shadcn on Base UI, Tailwind 4, monochrome like the other keep apps.
  - Sign in with your Minecraft account, no password: the site shows a code, you type `/trigger login set <code>`
    in game, the site checks it over RCON.
  - The story so far (only what the group has reached), quests with who did what, events with "i'm in", player
    stats, who's online, the live [BlueMap](https://bluemap.bluecolored.de) map, and the join guide with the pack.
  - The server can sleep when nobody's on; signed-in players wake it from the site.
  - `/admin` for the owner, behind its own username and password: start, stop, restart, whitelist and ops, kick, a
    console, the server log, backups, open the next chapter early, delete any event.

## Use it

```sh
python3 build.py              # datapack → out/the-keep (and out/the-keep/story.json for the site)
python3 build.py --install    # copy it into the world over ssh and /reload (MC_SSH, MC_WORLD)
python3 pack.py --install     # client pack → out/the-keep-26.3.mrpack, copied to the site (SITE_DATA)

cd site && bun install && bun run check
MC_DATA=/srv/minecraft/data LEVEL=world RCON_PASSWORD=… bun run dev
```

Placing the keep is a one-off: `function the_keep:setup` from the server console (it uses the coordinates in
`build.py`, pick a flat spot in your world first). Dialogs are a registry, so a changed dialog needs a server restart,
not just `/reload`.

### The site's environment

| variable | what |
| --- | --- |
| `MC_DATA`, `LEVEL` | the server's data dir (mounted read-only) and world folder name |
| `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD` | the server's console; keep it on a private network |
| `MAP_URL` | BlueMap's web server, proxied at `/bluemap/` for signed-in players |
| `SITE_DATA` | writable: sessions and events (SQLite), the pack, wake requests |
| `SERVER_ADDRESS`, `MC_VERSION`, `PACK_FILE` | shown on the join page |
| `ADMIN_USER`, `ADMIN_PASSWORD_HASH_B64` | the `/admin` login: a `Bun.password.hash` of the password, base64 encoded |
| `BACKUPS_DIR` | where the backups are (read-only), listed on `/admin` |

Waking writes `SITE_DATA/wake/request` (and the admin's restart `SITE_DATA/wake/restart`); something on the host has
to start or restart the server when those files appear (the keep uses a systemd path unit). The site never talks to
Docker.

## Security

- Every page but the join guide needs a sign-in; the map is proxied behind it too.
- `/admin` has its own account: the password is only stored as an argon2 hash, sessions last 7 days
  (SameSite=Strict), and an address gets locked out for 15 minutes after 10 wrong tries.
- RCON only ever gets fixed commands with names checked against `whitelist.json` and `^[A-Za-z0-9_]{3,16}$`.
- Changes need a custom header (no cross-site forms), sessions are HttpOnly + Secure cookies, sign-in codes expire
  after 5 minutes and new codes are rate limited per address.

## License

MIT
