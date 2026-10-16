#!/usr/bin/env python3
"""Build the "the-keep" datapack (26.3, data format 121) into minecraft/out/the-keep.

  python3 minecraft/build.py            # build
  python3 minecraft/build.py --install  # build + copy into the world on the-keep + /reload

Everything here is generated: the ruined Keep (structure NBT), the quest tab (advancements), journal pages and
rewards (loot tables), dialogs, and the functions tying them together. Quests marked shared count for the whole
group: the first player to do one grants it to everyone, and players who were offline get it when they join.
"""

import gzip
import io
import json
import os
import random
import shutil
import struct
import subprocess
import sys
from pathlib import Path

import story

NS = "the_keep"
OUT = Path(__file__).parent / "out" / "the-keep"
DATA_VERSION = 5023  # 26.3
PACK_FORMAT = 121

# The Keep sits on a rise over the river at the world center. Template origin = its min corner; GROUND is the
# template's grass layer, so world ground level = ORIGIN y + GROUND.
ORIGIN = (-11, 63, -3)
SIZE = (23, 28, 23)
GROUND = 5


def world(x, y, z):
    return (ORIGIN[0] + x, ORIGIN[1] + y, ORIGIN[2] + z)


G = GROUND
BRAZIER = world(11, G + 17, 6)  # tower top, the first fire
SOCKET = world(11, G + 17, 4)  # tower top, the third fire (beacon)
BELL = world(11, G + 3, 17)  # under the bell frame's beam
GARDEN = (world(3, G + 1, 13), world(5, G + 1, 15))
CELLAR = (world(9, G - 4, 4), world(13, G - 1, 8))
INSIDE = (world(1, G - 5, 1), world(21, G + 20, 21))
SPAWN = world(11, G + 1, 18)


# ---------------------------------------------------------------- the Keep (structure template)

def keep_blocks():
    rng = random.Random(7)
    blocks = {}

    def put(x, y, z, name, **props):
        blocks[(x, y, z)] = (name, tuple(sorted(props.items())))

    def brick():
        r = rng.random()
        return ("minecraft:stone_bricks" if r < 0.55 else "minecraft:mossy_stone_bricks" if r < 0.75
                else "minecraft:cracked_stone_bricks" if r < 0.95 else "minecraft:mossy_cobblestone")

    sx, sy, sz = SIZE
    for x in range(sx):
        for z in range(sz):
            for y in range(sy):
                if y < G - 2:
                    put(x, y, z, "minecraft:stone")
                elif y < G:
                    put(x, y, z, "minecraft:dirt")
                elif y == G:
                    r = rng.random()
                    put(x, y, z, "minecraft:grass_block" if r < 0.8 else "minecraft:coarse_dirt" if r < 0.9
                        else "minecraft:gravel")
                else:
                    put(x, y, z, "minecraft:air")

    # Path from the gate to the tower door.
    for z in range(10, 22):
        put(11, G, z, "minecraft:dirt_path")

    # Curtain wall with crenels, a few collapsed stretches and a breach in the east wall.
    for x in range(1, 22):
        for z in range(1, 22):
            if x not in (1, 21) and z not in (1, 21):
                continue
            height = 5
            if x == 21 and 7 <= z <= 11:
                height = rng.choice((0, 1, 1, 2))
            elif rng.random() < 0.12:
                height = rng.randint(2, 4)
            for y in range(G + 1, G + 1 + height):
                put(x, y, z, brick())
            if height == 5 and (x + z) % 2 == 0:
                put(x, G + 6, z, brick())
    # Rubble from the breach.
    for x, z in ((19, 8), (20, 9), (19, 10), (18, 9), (20, 11)):
        put(x, G + 1, z, rng.choice(("minecraft:cobblestone", "minecraft:mossy_cobblestone", "minecraft:gravel")))

    # Gate: 3 wide, 4 high, flanked by two small towers.
    for x in range(10, 13):
        for y in range(G + 1, G + 5):
            put(x, y, 21, "minecraft:air")
        put(x, G, 21, "minecraft:dirt_path")
    for tx in (7, 13):
        for x in range(tx, tx + 3):
            for z in range(20, 23):
                for y in range(G + 1, G + 9):
                    put(x, y, z, brick())
                if (x + z) % 2 == 0:
                    put(x, G + 9, z, brick())

    # Bell frame in the courtyard: two posts and a beam, the bell hangs under the beam.
    for px in (10, 12):
        for y in range(G + 1, G + 4):
            put(px, y, 17, "minecraft:stone_brick_wall")
    for x in range(10, 13):
        put(x, G + 4, 17, "minecraft:dark_oak_log", axis="x")

    # The garden: a 3x3 bed edged with slabs.
    for x in range(2, 7):
        for z in range(12, 17):
            if 3 <= x <= 5 and 13 <= z <= 15:
                put(x, G, z, "minecraft:grass_block")
            else:
                put(x, G + 1, z, "minecraft:stone_brick_slab", type="bottom")

    # A cold campfire in the courtyard.
    put(15, G + 1, 14, "minecraft:campfire", lit="false", facing="north")

    # The tower: 7x7, 16 high, two inner floors with holes, ladder up the west side, jagged top.
    x0, x1, z0, z1 = 8, 14, 3, 9
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            edge = x in (x0, x1) or z in (z0, z1)
            for y in range(G + 1, G + 17):
                if edge:
                    put(x, y, z, brick())
            if not edge:
                for floor in (G + 6, G + 11):
                    if rng.random() < 0.85:
                        put(x, floor, z, rng.choice(("minecraft:spruce_planks", "minecraft:spruce_planks",
                                                     "minecraft:stripped_spruce_log")))
                put(x, G + 16, z, "minecraft:stone_bricks")
            elif (x + z) % 2 == 0:
                put(x, G + 17, z, brick())
    # Windows.
    for y in (G + 3, G + 8, G + 13):
        for x, z in ((11, z0), (11, z1), (x0, 6), (x1, 6)):
            put(x, y, z, "minecraft:air")
    # Door.
    for y in (G + 1, G + 2):
        put(11, y, z1, "minecraft:air")
    put(11, G, z1, "minecraft:dirt_path")
    # Ladder column at (9, *, 4) against the west wall, through every floor.
    for y in range(G + 1, G + 17):
        put(9, y, 4, "minecraft:ladder", facing="east", waterlogged="false")
    # Brazier plinth and the beacon socket on top.
    put(11, G + 16, 6, "minecraft:chiseled_stone_bricks")
    put(11, G + 16, 4, "minecraft:chiseled_stone_bricks")
    # Inside the ground floor.
    put(13, G + 1, 4, "minecraft:barrel", facing="up", open="false")
    put(13, G + 1, 5, "minecraft:crafting_table")
    put(12, G + 1, 4, "minecraft:cobweb")

    # The cellar under the tower, reached by a trapdoor in the ground floor.
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            for y in range(G - 5, G):
                inside = 9 <= x <= 13 and 4 <= z <= 8 and y >= G - 4
                put(x, y, z, "minecraft:air" if inside else "minecraft:stone_bricks")
    put(13, G, 8, "minecraft:spruce_trapdoor", facing="north", half="top", open="false", powered="false",
        waterlogged="false")
    for y in range(G - 4, G):
        put(13, y, 8, "minecraft:ladder", facing="north", waterlogged="false")
    put(10, G - 1, 6, "minecraft:soul_lantern", hanging="true", waterlogged="false")
    put(9, G - 4, 4, "minecraft:cobweb")
    put(9, G - 4, 8, "minecraft:barrel", facing="up", open="false")
    put(10, G - 4, 8, "minecraft:barrel", facing="up", open="false")
    put(9, G - 3, 8, "minecraft:cobweb")
    return blocks


def nbt(value, tag=None):
    """Minimal NBT encoder for structure files: dict → compound, list → list, str → string, int → int."""
    if isinstance(value, dict):
        out = b""
        for key, item in value.items():
            kind, payload = nbt(item)
            name = key.encode()
            out += bytes([kind]) + struct.pack(">H", len(name)) + name + payload
        return 10, out + b"\x00"
    if isinstance(value, list):
        if not value:
            return 9, bytes([0]) + struct.pack(">i", 0)
        kinds = [nbt(item) for item in value]
        return 9, bytes([kinds[0][0]]) + struct.pack(">i", len(kinds)) + b"".join(p for _, p in kinds)
    if isinstance(value, str):
        data = value.encode()
        return 8, struct.pack(">H", len(data)) + data
    if isinstance(value, int):
        return 3, struct.pack(">i", value)
    raise TypeError(value)


def structure_file(blocks):
    palette, index, entries = [], {}, []
    for pos, state in sorted(blocks.items()):
        if state not in index:
            index[state] = len(palette)
            name, props = state
            palette.append({"id": name, **({"properties": dict(props)} if props else {})})
        entries.append({"pos": list(pos), "state": index[state]})
    root = {"DataVersion": DATA_VERSION, "size": list(SIZE), "palette": palette, "blocks": entries, "entities": []}
    _, payload = nbt(root)
    raw = bytes([10]) + struct.pack(">H", 0) + payload
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as f:
        f.write(raw)
    return buffer.getvalue()


# ---------------------------------------------------------------- quests

def text(value, **style):
    return {"text": value, **style}


def box(a, b):
    return {axis: {"min": min(a[i], b[i]), "max": max(a[i], b[i]) + (0.999 if axis != "y" else 0.999)}
            for i, axis in enumerate("xyz")}


def at(pos):
    return box(pos, pos)


def chapter_gate(n):
    return {"type": "minecraft:int_value_check",
            "value": {"type": "minecraft:score", "target": {"type": "minecraft:fixed", "name": "#chapter"},
                      "score": "keep"},
            "test": {"min": n}}


def player_at(location):
    return {"type": "minecraft:entity_properties", "entity": "this", "predicate": {"minecraft:location": location}}


def located(location):
    return {"trigger": "minecraft:location", "conditions": {"player": player_at(location)}}


def placed(blocks, **where):
    return {"trigger": "minecraft:placed_block", "conditions": {
        "location": {"type": "minecraft:location_check", "predicate": {"block": {"blocks": blocks}, **where}}}}


def has(*items):
    return {"trigger": "minecraft:inventory_changed",
            "conditions": {"items": [{"items": list(items) if len(items) > 1 else items[0]}]}}


def killed(entity):
    return {"trigger": "minecraft:player_killed_entity", "conditions": {
        "entity": {"type": "minecraft:entity_properties", "entity": "this",
                   "predicate": {"minecraft:entity_type": entity}}}}


def entered(dimension):
    return {"trigger": "minecraft:changed_dimension", "conditions": {"to": dimension}}


def looted(table):
    return {"trigger": "minecraft:player_generates_container_loot", "conditions": {"loot_tables": table}}


IMPOSSIBLE = None


class Quest:
    def __init__(self, id, chapter, title, description, icon, criteria, shared=False, frame="task", reward=(),
                 xp=0, parent=None):
        self.id, self.chapter, self.title, self.description, self.icon = id, chapter, title, description, icon
        self.criteria = {"done": criteria} if criteria and "trigger" in criteria else criteria
        self.shared, self.frame, self.reward, self.xp, self.parent = shared, frame, list(reward), xp, parent

    @property
    def path(self):
        return f"ch{self.chapter}/{self.id}"


def map_reward(item, destination, decoration, name=None):
    modifiers = []
    if name:
        modifiers.append({"type": "minecraft:set_name", "name": {"translate": name}, "target": "item_name"})
    modifiers += [{"type": "minecraft:exploration_map", "decoration": decoration, "destination": destination,
                   "search_radius": 150, "skip_existing_chunks": False},
                  {"type": "minecraft:filtered", "item_filter": {"predicates": {"minecraft:map_id": {}}},
                   "on_fail": {"type": "minecraft:discard"}}]
    return {"type": "minecraft:item", "name": item, "modifier": modifiers}


def named(item, name, lore, count=1):
    return {"type": "minecraft:item", "name": item, "modifier": [
        {"type": "minecraft:set_count", "count": count},
        {"type": "minecraft:set_name", "name": text(name, italic=False, color="gold"), "target": "custom_name"},
        {"type": "minecraft:set_lore", "lore": [text(lore, color="gray")], "mode": "replace_all"}]}


def plain(item, count=1):
    return {"type": "minecraft:item", "name": item, "modifier": {"type": "minecraft:set_count", "count": count}}


REWARDS = {
    "ch1_end": [named("minecraft:lantern", "Keeper's Lantern", "It was hanging by the gate."),
                plain("minecraft:emerald", 3)],
    "ch2_end": [named("minecraft:spyglass", "Keeper's Spyglass", "Scratched into the brass: look further.")],
    "ch3_map": [map_reward("minecraft:abandoned_camp_map", "#minecraft:on_abandoned_camp_dappled_forest",
                           "minecraft:abandoned_camp", "filled_map.dappled_forest_camp_map")],
    "ch3_end": [named("minecraft:bundle", "Keeper's Satchel", "Smells like red leaves.")],
    "ch4_map": [map_reward("minecraft:buried_trial_chambers_map", "#minecraft:on_buried_trial_chambers_maps",
                           "minecraft:trial_chambers")],
    "ch4_end": [plain("minecraft:golden_apple", 2)],
    "ch5_map": [map_reward("minecraft:buried_ancient_city_map", "#minecraft:on_ancient_city_maps",
                           "minecraft:ancient_city")],
    "ch5_end": [named("minecraft:recovery_compass", "Keeper's Compass", "It points back to where you fell.")],
    "ch6_end": [plain("minecraft:totem_of_undying")],
}

FIRE = ["minecraft:campfire", "minecraft:soul_campfire"]
CAMP_MAPS = ["minecraft:abandoned_camp_map", "minecraft:buried_trial_chambers_map",
             "minecraft:buried_ancient_city_map", "minecraft:woodland_mansion_map"]

QUESTS = [
    # Chapter 1: Landfall
    Quest("start", 1, "Landfall", "The Keep is cold and the gate hangs open", "minecraft:campfire", IMPOSSIBLE,
          shared=True),
    Quest("first_light", 1, "First Light", "Light a campfire on the plinth at the top of the tower",
          "minecraft:campfire", placed(FIRE, position=at(BRAZIER)), shared=True, frame="goal", xp=50),
    Quest("bell", 1, "Call Them Home", "Hang a bell under the beam of the bell frame in the courtyard",
          "minecraft:bell", placed("minecraft:bell", position=at(BELL)), shared=True, xp=50),
    Quest("night_watch", 1, "Night Watch", "Sleep a night inside the Keep's walls", "minecraft:red_bed",
          {"trigger": "minecraft:slept_in_bed", "conditions": {"player": player_at({"position": box(*INSIDE)})}}),
    Quest("cushion", 1, "Pull Up a Cushion", "Make a cushion. The Keepers never sat on the floor",
          "minecraft:red_cushion", has("#minecraft:cushions")),
    Quest("end", 1, "The Keep Stands", "Light the tower and hang the bell", "minecraft:lantern", IMPOSSIBLE,
          shared=True, frame="challenge", reward=["ch1_end"]),
    # Chapter 2: The Cold Trail
    Quest("start", 2, "The Cold Trail", "Somewhere out there the camps are still waiting", "minecraft:map",
          IMPOSSIBLE, shared=True),
    Quest("camp", 2, "Cold Ashes", "Find one of the Keepers' abandoned camps", "minecraft:barrel",
          located({"structures": "#minecraft:abandoned_camp"}), shared=True, xp=30),
    Quest("pages", 2, "The Journal", "Recover three pages of the Keepers' journal from camp chests",
          "minecraft:writable_book", IMPOSSIBLE, shared=True, frame="goal", xp=100),
    Quest("rekindle", 2, "Rekindle", "Light a fire again at one of the camps", "minecraft:flint_and_steel",
          placed(FIRE, structures="#minecraft:abandoned_camp")),
    Quest("follow", 2, "Follow the Map", "Take a map from one of the camps", "minecraft:abandoned_camp_map",
          has(*CAMP_MAPS)),
    Quest("end", 2, "The Trail Goes On", "Find a camp and three journal pages", "minecraft:spyglass", IMPOSSIBLE,
          shared=True, frame="challenge", reward=["ch2_end"]),
    # Chapter 3: The Red Wood
    Quest("start", 3, "The Red Wood", "The Keepers' last camp is in a forest that stays red", "minecraft:red_poplar_leaves",
          IMPOSSIBLE, shared=True, reward=["ch3_map"]),
    Quest("forest", 3, "Red All Year", "Walk into a Dappled Forest", "minecraft:poplar_sapling",
          located({"biomes": "minecraft:dappled_forest"}), shared=True, xp=50),
    Quest("second_fire", 3, "The Second Fire", "Light a campfire in the Dappled Forest", "minecraft:campfire",
          placed(FIRE, biomes="minecraft:dappled_forest"), shared=True, frame="goal", xp=50),
    Quest("garden", 3, "Bring It Home", "Plant a poplar sapling in the Keep's garden", "minecraft:poplar_sapling",
          placed("minecraft:poplar_sapling", position=box(*GARDEN)), shared=True, xp=50),
    Quest("mushroom", 3, "Shelf Life", "Pick a shelf mushroom", "minecraft:shelf_mushroom",
          has("minecraft:shelf_mushroom")),
    Quest("boat", 3, "Red River", "Build a poplar boat", "minecraft:poplar_boat", has("minecraft:poplar_boat")),
    Quest("end", 3, "Two Fires", "Light the second fire and plant the red wood at home", "minecraft:bundle",
          IMPOSSIBLE, shared=True, frame="challenge", reward=["ch3_end"]),
    # Chapter 4: Below the Keep
    Quest("start", 4, "Below the Keep", "The cellar is yours to open", "minecraft:spruce_trapdoor", IMPOSSIBLE,
          shared=True),
    Quest("cellar", 4, "The Cellar", "Climb down into the cellar under the tower", "minecraft:ladder",
          located({"position": box(*CELLAR)}), shared=True, reward=["ch4_map"], xp=30),
    Quest("chambers", 4, "Doors We Never Built", "Find the trial chambers", "minecraft:chiseled_tuff",
          located({"structures": "minecraft:trial_chambers"}), shared=True, xp=50),
    Quest("key", 4, "Key Holder", "Earn a trial key", "minecraft:trial_key", has("minecraft:trial_key")),
    Quest("vault", 4, "What They Kept", "Open a vault with a trial key", "minecraft:vault",
          {"trigger": "minecraft:item_used_on_block", "conditions": {"location": {"type": "minecraft:all_of", "terms": [
              {"type": "minecraft:location_check", "predicate": {"block": {"blocks": "minecraft:vault"}}},
              {"type": "minecraft:match_tool", "predicate": {"items": "minecraft:trial_key"}}]}}},
          shared=True, frame="goal", xp=100),
    Quest("breeze", 4, "Catch the Wind", "Get a breeze rod", "minecraft:breeze_rod", has("minecraft:breeze_rod")),
    Quest("end", 4, "The Sealed Door", "Find the chambers and open a vault", "minecraft:golden_apple", IMPOSSIBLE,
          shared=True, frame="challenge", reward=["ch4_end"]),
    # Chapter 5: The Silent City
    Quest("start", 5, "The Silent City", "Deep under the mountains, a city with no sound", "minecraft:sculk",
          IMPOSSIBLE, shared=True, reward=["ch5_map"]),
    Quest("city", 5, "Cities Make Noise", "Find the ancient city", "minecraft:deepslate_tiles",
          located({"structures": "minecraft:ancient_city"}), shared=True, xp=50),
    Quest("hush", 5, "In Our Socks", "Sneak past a sculk sensor without it hearing you", "minecraft:sculk_sensor",
          {"trigger": "minecraft:avoid_vibration"}),
    Quest("shard", 5, "Echoes", "Find an echo shard", "minecraft:echo_shard", has("minecraft:echo_shard")),
    Quest("letter", 5, "The Last Letter", "Open a chest in the city. The Keepers left something", "minecraft:paper",
          looted("minecraft:chests/ancient_city"), shared=True, frame="goal", reward=["letter"], xp=100),
    Quest("end", 5, "What They Found", "Find the city and the Keepers' last letter", "minecraft:recovery_compass",
          IMPOSSIBLE, shared=True, frame="challenge", reward=["ch5_end"]),
    # Chapter 6: The Third Fire
    Quest("start", 6, "The Third Fire", "Wood won't do. It needs a star", "minecraft:nether_star", IMPOSSIBLE,
          shared=True),
    Quest("nether", 6, "Through the Fire", "Go to the Nether", "minecraft:obsidian",
          entered("minecraft:the_nether"), shared=True, xp=30),
    Quest("fortress", 6, "Black Walls", "Find a Nether fortress", "minecraft:nether_bricks",
          located({"structures": "minecraft:fortress"}), shared=True, xp=50),
    Quest("skull", 6, "Three Heads", "Get a wither skeleton skull", "minecraft:wither_skeleton_skull",
          has("minecraft:wither_skeleton_skull")),
    Quest("wither", 6, "The Star", "Defeat the Wither", "minecraft:nether_star", killed("minecraft:wither"),
          shared=True, frame="goal", xp=200),
    Quest("beacon", 6, "The Third Fire", "Place a beacon on the second plinth at the top of the tower",
          "minecraft:beacon", placed("minecraft:beacon", position=at(SOCKET)), shared=True, frame="goal", xp=100),
    Quest("end", 6, "The Keep Burns Bright", "Take the star and put it on the tower", "minecraft:totem_of_undying",
          IMPOSSIBLE, shared=True, frame="challenge", reward=["ch6_end"]),
    # Chapter 7: Through the Gate
    Quest("start", 7, "Through the Gate", "They left the door open behind them", "minecraft:end_portal_frame",
          IMPOSSIBLE, shared=True),
    Quest("end_gate", 7, "The Gate", "Go through the gate at the end of the world", "minecraft:ender_eye",
          entered("minecraft:the_end"), shared=True, xp=50),
    Quest("dragon", 7, "The Last Watcher", "Defeat the dragon", "minecraft:dragon_head",
          killed("minecraft:ender_dragon"), shared=True, frame="goal", xp=300),
    Quest("city", 7, "Where They Went", "Find a city at the end of the world", "minecraft:purpur_block",
          located({"structures": "minecraft:end_city"}), shared=True, xp=100),
    Quest("wings", 7, "Wings", "Find an elytra", "minecraft:elytra", has("minecraft:elytra")),
    Quest("end", 7, "The Last Keepers", "Defeat the dragon and find where they went", "minecraft:lantern",
          IMPOSSIBLE, shared=True, frame="challenge", reward=["ending"]),
]

# What closes each chapter (all must be done, shared).
FINALES = {1: ["first_light", "bell"], 2: ["camp", "pages"], 3: ["forest", "second_fire", "garden"],
           4: ["chambers", "vault"], 5: ["city", "letter"], 6: ["wither", "beacon"], 7: ["dragon", "city"]}

# Journal pages come from the first chest of each abandoned camp.
PAGE_TABLES = ["minecraft:chests/abandoned_camp_common_chest"]


def flag(quest):
    return f"#q.ch{quest.chapter}.{quest.id}"


def by(chapter, id):
    return next(q for q in QUESTS if q.chapter == chapter and q.id == id)


def advancement(quest, parent):
    display = {
        "icon": {"id": quest.icon},
        "title": text(quest.title),
        "description": text(quest.description, color="gold" if quest.shared else "gray"),
        "frame": quest.frame,
        "show_toast": True,
        "announce_to_chat": not quest.shared,
    }
    if quest.criteria is None:
        criteria = {"done": {"trigger": "minecraft:impossible"}}
    else:
        criteria = {}
        for name, criterion in quest.criteria.items():
            criterion = json.loads(json.dumps(criterion))
            conditions = criterion.setdefault("conditions", {})
            gate = chapter_gate(quest.chapter)
            conditions["player"] = ({"type": "minecraft:all_of", "terms": [gate, conditions["player"]]}
                                    if "player" in conditions else gate)
            criteria[name] = criterion
    return {
        "parent": parent,
        "display": display,
        "criteria": criteria,
        "requirements": [list(criteria)],
        "rewards": {"function": f"{NS}:quest/{quest.path}", **({"experience": quest.xp} if quest.xp else {})},
    }


# ---------------------------------------------------------------- functions

def tellraw(*parts):
    return f"tellraw @a {json.dumps(list(parts), ensure_ascii=False)}"


PREFIX = text("[the keep] ", color="dark_gray")


def quest_functions(quest):
    """Reward function (runs as each player who gets the advancement) and, for shared quests, the first-time function."""
    own = [f"loot give @s loot {NS}:reward/{name}" for name in quest.reward]
    files = {}
    if quest.id == "start":
        dialog = f"dialog show @s {NS}:chapter_{quest.chapter}"
        own.append(f"execute if score #chapter keep matches {quest.chapter} run {dialog}" if quest.chapter > 1 else "")
    if quest.id == "end" and quest.chapter == 7:
        own += ["team join keepers @s", f"dialog show @s {NS}:ending"]
    if quest.shared:
        own.append(f"execute unless score {flag(quest)} keep matches 1 run function {NS}:quest/{quest.path}_first")
        first = [
            f"scoreboard players set {flag(quest)} keep 1",
            f"advancement grant @a only {NS}:{quest.path}",
        ]
        if quest.id == "start":
            first.append(f'title @a subtitle {json.dumps(text(quest.title, color="gold"))}')
            first.append(f'title @a title {json.dumps(text(f"Chapter {quest.chapter}", color="white"))}')
            first.append("playsound minecraft:event.raid.horn master @a ~ ~ ~ 0.4 1.4")
        else:
            first.append(tellraw(PREFIX, text(quest.title, color="gold"),
                                 text(f": {quest.description}", color="gray"),
                                 *([text(" (", color="dark_gray"), {"selector": "@p"}, text(")", color="dark_gray")]
                                   if quest.criteria is not None else [])))
            first.append("playsound minecraft:ui.toast.challenge_complete master @a ~ ~ ~ 0.6 1")
        if quest.id != "end":
            first.append(f"function {NS}:finales")
        if quest.id == "end" and quest.chapter == 7:
            first.append(f"function {NS}:fireworks")
        files[f"quest/{quest.path}_first"] = first
    files[f"quest/{quest.path}"] = [line for line in own if line]
    return files


def functions():
    files = {}
    shared = [q for q in QUESTS if q.shared]
    for quest in QUESTS:
        files.update(quest_functions(quest))

    files["load"] = [
        "scoreboard objectives add keep dummy",
        "scoreboard objectives add keep.left minecraft.custom:minecraft.leave_game",
        # The site's sign-in: it shows a code, the player types /trigger login set <code>, the site reads it over RCON.
        "scoreboard objectives add login trigger",
        "execute unless score #chapter keep matches 1.. run scoreboard players set #chapter keep 1",
        "execute unless score #pages keep matches 0.. run scoreboard players set #pages keep 0",
        f"execute unless score {flag(by(1, 'start'))} keep matches 1 run scoreboard players set {flag(by(1, 'start'))} keep 1",
        "team add keepers",
        'team modify keepers prefix {"text":"✦ ","color":"gold"}',
        "gamerule players_sleeping_percentage 1",
        "gamerule respawn_radius 2",
        f"schedule function {NS}:second 20t replace",
    ]
    files["second"] = [
        f"execute as @a[tag=!keep.seen] run function {NS}:join",
        f"execute as @a[scores={{keep.left=1..}}] run function {NS}:join",
        "scoreboard players enable @a login",
        f"schedule function {NS}:second 20t replace",
    ]
    files["join"] = [
        "scoreboard players reset @s keep.left",
        f"execute unless entity @s[tag=keep.seen] run function {NS}:welcome",
        *[f"execute if score {flag(q)} keep matches 1 run advancement grant @s only {NS}:{q.path}" for q in shared],
    ]
    files["welcome"] = [
        "tag @s add keep.seen",
        f"advancement grant @s only {NS}:root",
        f"loot give @s loot {NS}:torn_page",
        f"dialog show @s {NS}:intro",
    ]
    files["finales"] = [
        f"execute {' '.join(f'if score {flag(by(ch, q))} keep matches 1' for q in ids)} "
        f"unless score {flag(by(ch, 'end'))} keep matches 1 run function {NS}:quest/ch{ch}/end_first"
        for ch, ids in FINALES.items()
    ]
    # Friday timer: the next chapter opens only once the current one is finished.
    files["unlock_next"] = [
        *[f"execute if score #chapter keep matches {ch} if score {flag(by(ch, 'end'))} keep matches 1 "
          f"run return run function {NS}:open_chapter {{n:{ch + 1}}}" for ch in range(1, 7)],
        'tellraw @a[tag=keep.admin] "nothing to open: the current chapter isn\'t finished"',
    ]
    files["open_chapter"] = [
        "$scoreboard players set #chapter keep $(n)",
        f"$function {NS}:quest/ch$(n)/start_first",
    ]
    files["page"] = [
        f"advancement revoke @s only {NS}:sys/page",
        "execute if score #pages keep matches 9.. run return run tellraw @s "
        + json.dumps(text("The chest is empty of pages. The trail is cold here.", color="gray", italic=True)),
        "scoreboard players add #pages keep 1",
        *[f"execute if score #pages keep matches {n} run loot give @s loot {NS}:page/{n}" for n in range(1, 10)],
        tellraw(PREFIX, {"selector": "@s"}, text(" found a page of the journal (", color="gray"),
                {"score": {"name": "#pages", "objective": "keep"}, "color": "gold"}, text("/9)", color="gray")),
        f"execute if score #pages keep matches 3.. unless score {flag(by(2, 'pages'))} keep matches 1 "
        f"run function {NS}:quest/ch2/pages_first",
    ]
    files["fireworks"] = [
        f"summon firework_rocket {x} {y} {z} {{LifeTime:30,FireworksItem:{{id:\"minecraft:firework_rocket\",count:1,"
        f"components:{{\"minecraft:fireworks\":{{flight_duration:2,explosions:[{{shape:\"large_ball\",colors:[I;{c}],"
        f"has_trail:true}}]}}}}}}}}"
        for (x, y, z), c in ((BRAZIER, 16766720), (SOCKET, 16777215), (SPAWN, 16753920))
    ]
    # One-off: build the Keep and move the world spawn to its gate. Run from the console: function the_keep:setup
    files["setup"] = [
        f"forceload add {INSIDE[0][0]} {INSIDE[0][2]} {INSIDE[1][0]} {INSIDE[1][2]}",
        f"place template {NS}:keep {ORIGIN[0]} {ORIGIN[1]} {ORIGIN[2]}",
        f"setworldspawn {SPAWN[0]} {SPAWN[1]} {SPAWN[2]}",
        f"forceload remove {INSIDE[0][0]} {INSIDE[0][2]} {INSIDE[1][0]} {INSIDE[1][2]}",
    ]
    return files


# ---------------------------------------------------------------- loot, dialogs

def book(title, author, pages):
    return {"type": "minecraft:command", "pools": [{"rolls": 1, "entries": [{
        "type": "minecraft:item", "name": "minecraft:written_book", "modifier": [{
            "type": "minecraft:set_components",
            "components": {"minecraft:written_book_content": {"title": title, "author": author, "pages": pages}}}]}]}]}


def loot_tables():
    tables = {"torn_page": book("A Torn Page", "the last Keeper", story.TORN_PAGE)}
    for n, page in enumerate(story.PAGES, 1):
        tables[f"page/{n}"] = book(f"Journal, page {n}", "the Keepers", [page])
    tables["reward/letter"] = book("The Last Letter", "M.", story.LAST_LETTER)
    tables["reward/ending"] = book("The Ship", "the Keepers", story.ENDING)
    for name, entries in REWARDS.items():
        tables[f"reward/{name}"] = {"type": "minecraft:command",
                                    "pools": [{"rolls": 1, "entries": [entry]} for entry in entries]}
    return tables


def notice(title, paragraphs, button):
    return {
        "type": "minecraft:notice",
        "title": text(title, color="gold"),
        "body": [{"type": "minecraft:plain_message", "contents": text(p), "width": 320} for p in paragraphs],
        "action": {"label": text(button), "width": 160},
    }


def dialogs():
    out = {
        "intro": notice(story.TITLE, story.INTRO, "Read the page"),
        "ending": notice("The Last Keepers", story.ENDING, "Go home"),
        "journal": notice("The Keep", story.INTRO + ["How it works"] + story.HOW_IT_WORKS, "Back"),
    }
    for n, (name, paragraphs) in story.CHAPTERS.items():
        if paragraphs:
            out[f"chapter_{n}"] = notice(f"Chapter {n}: {name}", paragraphs, "Go")
    return out


def story_json():
    """Everything the companion site shows; it hides what the group hasn't reached yet."""
    return {
        "title": story.TITLE,
        "intro": story.INTRO,
        "howItWorks": story.HOW_IT_WORKS,
        "tornPage": story.TORN_PAGE,
        "pages": story.PAGES,
        "letter": story.LAST_LETTER,
        "ending": story.ENDING,
        "chapters": [{"n": n, "name": name, "text": text} for n, (name, text) in story.CHAPTERS.items()],
        "quests": [{"chapter": q.chapter, "id": q.id, "path": q.path, "title": q.title, "description": q.description,
                    "shared": q.shared, "frame": q.frame, "icon": q.icon, "flag": flag(q)} for q in QUESTS],
        "finales": {str(ch): ids for ch, ids in FINALES.items()},
    }


# ---------------------------------------------------------------- write

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    data = OUT / "data" / NS
    write_json(OUT / "pack.mcmeta", {"pack": {"description": f"{story.TITLE}: the story of the Keep",
                                              "min_format": PACK_FORMAT, "max_format": PACK_FORMAT}})
    write_json(OUT / "data" / "minecraft" / "tags" / "function" / "load.json", {"values": [f"{NS}:load"]})
    write_json(OUT / "data" / "minecraft" / "tags" / "dialog" / "pause_screen_additions.json",
               {"values": [f"{NS}:journal"]})

    (data / "structure").mkdir(parents=True)
    (data / "structure" / "keep.nbt").write_bytes(structure_file(keep_blocks()))

    write_json(data / "advancement" / "root.json", {
        "display": {"icon": {"id": "minecraft:lantern"}, "title": text(story.TITLE),
                    "description": text("Light the fires. Follow the maps.", color="gray"),
                    "background": "minecraft:block/mossy_stone_bricks", "show_toast": False,
                    "announce_to_chat": False},
        "criteria": {"joined": {"trigger": "minecraft:impossible"}},
        "requirements": [["joined"]]})
    write_json(data / "advancement" / "sys" / "page.json", {
        "criteria": {f"camp_{i}": looted(table) | {"conditions": {"loot_tables": table, "player": chapter_gate(2)}}
                     for i, table in enumerate(PAGE_TABLES)},
        "requirements": [[f"camp_{i}" for i in range(len(PAGE_TABLES))]],
        "rewards": {"function": f"{NS}:page"}})
    parent = f"{NS}:root"
    for quest in QUESTS:
        if quest.id == "start":
            chapter_root = f"{NS}:{quest.path}"
            write_json(data / "advancement" / f"{quest.path}.json", advancement(quest, parent))
        elif quest.id == "end":
            write_json(data / "advancement" / f"{quest.path}.json", advancement(quest, chapter_root))
            parent = f"{NS}:{quest.path}"
        else:
            write_json(data / "advancement" / f"{quest.path}.json", advancement(quest, chapter_root))

    for name, lines in functions().items():
        path = data / "function" / f"{name}.mcfunction"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n")
    for name, table in loot_tables().items():
        write_json(data / "loot_table" / f"{name}.json", table)
    write_json(OUT / "story.json", story_json())
    for name, dialog in dialogs().items():
        write_json(data / "dialog" / f"{name}.json", dialog)
    print(f"built {OUT}")


# Where --install copies the datapack: an ssh host and the world folder of an itzg/minecraft-server data dir.
HOST = os.environ.get("MC_SSH", "the-keep")
WORLD = os.environ.get("MC_WORLD", "/srv/minecraft/data/the-keep")


def install():
    target = f"{WORLD}/datapacks/the-keep"
    # No macOS ._ files: the game rejects them as broken JSON.
    tar = subprocess.run(["tar", "--no-mac-metadata", "--no-xattrs", "-C", str(OUT), "-czf", "-", "."],
                         capture_output=True, check=True, env={"COPYFILE_DISABLE": "1"}).stdout
    subprocess.run(["ssh", HOST, f"sudo rm -rf {target} && sudo install -d -o 1000 -g 1000 {target} && "
                    f"sudo tar -C {target} --no-same-owner -xzf - 2>/dev/null && sudo chown -R 1000:1000 {target} && "
                    "mc 'datapack enable \"file/the-keep\"' >/dev/null; mc reload"],
                   input=tar, check=True)


if __name__ == "__main__":
    build()
    if "--install" in sys.argv:
        install()
