"""Story text for "The Last Keepers": intro, chapter dialogs, journal pages, quests. build.py turns this into the datapack."""

TITLE = "The Last Keepers"

INTRO = [
    "Forty years ago the Keepers walked out of the Keep and never came back.",
    "The fire on the tower went cold. The gate was left open.",
    "They didn't vanish all at once. Out in the wilderness their camps are still standing: cold fire pits, "
    "half-full barrels, maps pointing somewhere further. Every camp a little further from home than the last.",
    "You wake up at the foot of the ruined Keep with one torn page in your pocket.",
]

TORN_PAGE = [
    "If you are reading this, the Keep is yours now.\n\nLight the fire on the tower so the others know someone came back.\n\n"
    "Then follow the maps. We left them for you.",
    "Do not open the cellar before the second fire.\n\nDo not dig where the ground hums.\n\n"
    "And whatever you find past the gate at the end of the world, don't be sad about it. We weren't.",
]

HOW_IT_WORKS = [
    "Quests live in your advancements screen (L), in the tab called The Last Keepers.",
    "A new chapter opens on the Friday after you finish the current one. Nothing expires and nothing is timed: "
    "play when you can.",
    "Gold quests count for everyone. If one of you does it, the whole group moves on, even whoever wasn't online.",
    "Dying leaves a grave with your things in it. One person sleeping skips the night.",
]

# Found one per abandoned camp chest, in order, from chapter 2 on.
PAGES = [
    "Day 3.\n\nWe left the Keep at dawn. Mara says the camps will be our road home if we ever need one. "
    "Every camp gets a fire, a barrel, and a map to the next.",
    "Day 11.\n\nRain for a week. Tobin found a forest where the leaves stay red all year. He wants to build there. "
    "I want to keep moving.",
    "Day 19.\n\nWe lit the second fire in the red wood. From the top of a poplar you could see the tower's fire, "
    "if anyone had lit it. Nobody did.",
    "Day 30.\n\nUnder the Keep there are doors we never built. The chambers go deeper than our cellar ever did. "
    "Something down there makes keys.",
    "Day 47.\n\nThe vaults open once for each of us. Mara thinks they were built to test whoever comes next. "
    "I think they were built to keep us busy.",
    "Day 62.\n\nThe ground hums near the mountains. Tobin says it's a city. I told him cities make noise.",
    "Day 80.\n\nIt's a city. It doesn't make noise. Something in it listens. We go down in our socks.",
    "Day 91.\n\nThe walls of the city show a gate at the end of the world. And the fire on the Keep can't be lit "
    "with wood. It needs a star.",
    "Day 120.\n\nLast page. We found the gate and we're going through.\n\nIf you're reading this, light the third "
    "fire. Then come and find us. Or don't. Either way, the Keep is yours.",
]

LAST_LETTER = [
    "To whoever lit the fires,\n\nWe read the walls down here for a long time. They're not a warning. "
    "They're directions.",
    "The Keep was built to hold a fire that can be seen from the end of the world. Wood won't do it. "
    "Take a star from the thing that should never have been made, and put it on the tower.",
    "Then look up.\n\n- M.",
]

ENDING = [
    "The ship is still there, floating over the void. Forty names are carved into the deck, "
    "and under the last one there is room left.",
    "You're the Keepers now. The fires are lit and there's no trail left to follow. Except the one you leave.",
]

# Chapter intros, shown as a dialog when a chapter opens. Chapter 1 opens with the intro instead.
CHAPTERS = {
    1: ("Landfall", []),
    2: ("The Cold Trail", [
        "The fire on the tower is burning. Somewhere out there, the Keepers' camps are still waiting.",
        "Each camp chest holds a page of their journal, and a map to somewhere further. Find three pages.",
    ]),
    3: ("The Red Wood", [
        "The journal keeps coming back to a forest where the leaves stay red all year. The Keepers' last camp is there.",
        "Light the second fire in the red wood, and bring a sapling home for the Keep's garden. "
        "Everyone gets a map to a camp in that forest.",
    ]),
    4: ("Below the Keep", [
        "Two fires are burning. The cellar is yours to open.",
        "The Keepers didn't build the chambers down there. They found them, and something in there kept them busy "
        "for years.",
    ]),
    5: ("The Silent City", [
        "The last pages are written in a shaky hand. Deep under the mountains there is a city that makes no sound. "
        "The Keepers went down to read its walls.",
        "Everyone gets a map. Go quietly.",
    ]),
    6: ("The Third Fire", [
        "The letter was clear. The fire on the Keep was never meant to burn wood.",
        "It needs a star, and the star has to be taken from something that should never have been made.",
    ]),
    7: ("Through the Gate", [
        "With three fires lit you can see it from the tower. The Keepers didn't disappear.",
        "They went through the gate at the end of the world, and they left the door open behind them.",
    ]),
}
