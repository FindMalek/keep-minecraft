#!/usr/bin/env python3
"""Build the client pack (Modrinth .mrpack) for the keep's Minecraft server: minecraft/out/the-keep-<mc>.mrpack.

Friends import it in the Modrinth App or Prism Launcher (one click), and the server is already in their list.
Mods are resolved from Modrinth for the exact game + loader versions the server runs; required dependencies are
added, and a dependency pinned by another mod (Iris → Sodium) wins over "latest".
"""

import hashlib
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from build import nbt

MINECRAFT = "26.3"
LOADER = "0.19.5"  # same as the server (FABRIC_LOADER_VERSION in stacks/minecraft/docker-compose.yml)
VERSION = "1.0.0"
OUT = Path(__file__).parent / "out" / f"the-keep-{MINECRAFT}.mrpack"

# Order matters: a mod listed earlier can pin the version of one listed later (iris pins sodium).
MODS = [
    "fabric-api",
    "iris",  # shaders (pick any shader pack in-game)
    "sodium",  # fps
    "immediatelyfast",
    "entityculling",
    "ferrite-core",
    "continuity",  # connected glass textures
    "distanthorizons",  # far terrain, sent by the server
    "simple-voice-chat",  # proximity voice
    "waystones",
    "xaeros-minimap",
    "xaeros-world-map",
    "jei",  # recipes
    "jade",  # what am I looking at
    "appleskin",
    "ok-zoomer",
    "3dskinlayers",
    "modmenu",
]
SERVER = {"name": "The Keep", "ip": "mc.findmalek.engineer"}


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "findmalek/the-keep (minecraft pack)"})
    with urllib.request.urlopen(request) as response:
        return response.read()


def api(path, **query):
    url = f"https://api.modrinth.com/v2/{path}" + (f"?{urllib.parse.urlencode(query)}" if query else "")
    return json.loads(get(url))


def latest(slug):
    versions = api(f"project/{slug}/version", game_versions=json.dumps([MINECRAFT]), loaders=json.dumps(["fabric"]))
    if not versions:
        raise SystemExit(f"{slug}: no {MINECRAFT} fabric build")
    return ([v for v in versions if v["version_type"] == "release"] or versions)[0]


def resolve():
    chosen, pinned = {}, {}

    def add(project_id_or_slug, version=None):
        version = version or (api(f"version/{pinned[project_id_or_slug]}") if project_id_or_slug in pinned
                              else latest(project_id_or_slug))
        project = version["project_id"]
        if project in chosen:
            return
        chosen[project] = version
        for dependency in version["dependencies"]:
            if dependency["dependency_type"] != "required" or not dependency["project_id"]:
                continue
            if dependency.get("version_id"):
                pinned[dependency["project_id"]] = dependency["version_id"]
            add(dependency["project_id"])

    for slug in MODS:
        project = api(f"project/{slug}")["id"]
        add(slug, api(f"version/{pinned[project]}") if project in pinned else None)
    return list(chosen.values())


def entry(version):
    file = next((f for f in version["files"] if f["primary"]), version["files"][0])
    return {
        "path": f"mods/{file['filename']}",
        "hashes": {"sha1": file["hashes"]["sha1"], "sha512": file["hashes"]["sha512"]},
        "env": {"client": "required", "server": "unsupported"},
        "downloads": [file["url"]],
        "fileSize": file["size"],
    }


def servers_dat():
    _, payload = nbt({"servers": [SERVER]})
    return bytes([10]) + b"\x00\x00" + payload


def main():
    versions = resolve()
    index = {
        "formatVersion": 1,
        "game": "minecraft",
        "versionId": VERSION,
        "name": "The Keep",
        "summary": "the last keepers: vanilla+ for the keep's server",
        "files": [entry(v) for v in versions],
        "dependencies": {"minecraft": MINECRAFT, "fabric-loader": LOADER},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as pack:
        pack.writestr("modrinth.index.json", json.dumps(index, indent=2))
        pack.writestr("overrides/servers.dat", servers_dat())
    for v in sorted(versions, key=lambda v: v["files"][0]["filename"].lower()):
        print(f"  {v['files'][0]['filename']}")
    print(f"{OUT} ({len(versions)} mods, sha1 {hashlib.sha1(OUT.read_bytes()).hexdigest()[:12]})")


def install():
    """Copies the pack to the companion site's data dir, where /pack.mrpack serves it."""
    host = os.environ.get("MC_SSH", "the-keep")
    target = os.environ.get("SITE_DATA", "/srv/minecraft/site") + "/the-keep.mrpack"
    subprocess.run(["ssh", host, f"sudo tee {target} >/dev/null && sudo chown 1000:1000 {target}"],
                   input=OUT.read_bytes(), check=True)
    print(f"installed {host}:{target}")


if __name__ == "__main__":
    main()
    if "--install" in sys.argv:
        install()
