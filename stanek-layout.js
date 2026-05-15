/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const args = ns.args.map(String);
    if (args.includes("--help") || args.includes("-h")) {
        printHelp(ns);
        return;
    }
    if (args.includes("--list")) {
        listFragments(ns);
        return;
    }

    const preferences = args.length > 0 ? args : ["hack", "grow", "strength", "defense", "dexterity", "agility"];
    const fragments = preferredFragments(ns, preferences);

    ns.stanek.clearGift();

    for (const fragment of fragments) {
        const placement = findPlacement(ns, fragment.id);
        if (!placement) {
            ns.tprint(`WARN: Could not place fragment ${fragment.id}: ${fragment.effect}`);
            continue;
        }
        ns.stanek.placeFragment(placement.x, placement.y, placement.rotation, fragment.id);
        ns.tprint(`Placed ${fragment.id} at (${placement.x}, ${placement.y}) r${placement.rotation}: ${fragment.effect}`);
    }
}

function printHelp(ns) {
    ns.tprint(`Usage:
  run stanek-layout.js --help
  run stanek-layout.js --list
  run stanek-layout.js [preference ...]

Clears Stanek's Gift, then greedily places fragments matching preferences.

Preferences can be keywords or exact fragment IDs:
  hack grow combat money rep crime bladeburner
  hack-exp hack-power str def dex agi cha
  id:0 id:5 12

Examples:
  run stanek-layout.js hack grow combat
  run stanek-layout.js id:0 id:1 id:5 id:100

Use --list to see fragment IDs, types, sizes, limits, and effects.`);
}

function listFragments(ns) {
    for (const fragment of ns.stanek.fragmentDefinitions()) {
        const size = `${fragment.shape[0].length}x${fragment.shape.length}`;
        ns.tprint(`id=${fragment.id} type=${fragment.type} size=${size} limit=${fragment.limit} effect=${fragment.effect}`);
    }
}

function preferredFragments(ns, preferences) {
    const all = ns.stanek.fragmentDefinitions();
    const chosen = [];
    const used = new Set();

    for (const preference of preferences) {
        const matches = all.filter((fragment) => !used.has(fragment.id) && matchesPreference(fragment, preference));
        for (const fragment of matches) {
            chosen.push(fragment);
            used.add(fragment.id);
        }
    }

    return chosen;
}

function matchesPreference(fragment, preference) {
    const pref = preference.toLowerCase();
    if (pref.startsWith("id:")) return fragment.id === Number(pref.slice(3));
    if (/^\d+$/.test(pref)) return fragment.id === Number(pref);

    const aliases = {
        hack: ["hack", "hacking", "grow"],
        hacking: ["hack", "hacking", "grow"],
        "hack-exp": ["hacking exp"],
        "hack-xp": ["hacking exp"],
        "hack-power": ["hack"],
        grow: ["grow"],
        combat: ["strength", "defense", "dexterity", "agility"],
        str: ["strength"],
        def: ["defense"],
        dex: ["dexterity"],
        agi: ["agility"],
        cha: ["charisma"],
        rep: ["reputation"],
        money: ["money"],
        crime: ["crime"],
        bladeburner: ["bladeburner"],
    };

    const needles = aliases[pref] || [pref.replaceAll("-", " ")];
    const haystack = `${fragment.effect} ${fragment.type}`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
}

function findPlacement(ns, fragmentId) {
    for (let rotation = 0; rotation < 4; rotation++) {
        for (let y = 0; y < ns.stanek.giftHeight(); y++) {
            for (let x = 0; x < ns.stanek.giftWidth(); x++) {
                if (ns.stanek.canPlaceFragment(x, y, rotation, fragmentId)) {
                    return { x, y, rotation };
                }
            }
        }
    }
    return undefined;
}
