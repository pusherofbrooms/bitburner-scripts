/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    if (ns.args.includes("--help") || ns.args.includes("-h")) {
        ns.tprint(`Usage: run stanek-hacking-layout.js

Clears Stanek's Gift and applies a predefined hacking-focused layout.
Supported board sizes: 6x5, 6x6, 7x7.`);
        return;
    }

    const key = `${ns.stanek.giftWidth()}x${ns.stanek.giftHeight()}`;
    const layout = hackingLayouts[key];
    if (!layout) {
        ns.tprint(`ERROR: No hacking layout for Stanek board ${key}. Supported: ${Object.keys(hackingLayouts).join(", ")}`);
        return;
    }

    ns.stanek.clearGift();
    for (const fragment of layout) {
        if (!ns.stanek.placeFragment(fragment.x, fragment.y, fragment.rotation, fragment.id)) {
            ns.tprint(`ERROR: Failed to place fragment ${fragment.id} at (${fragment.x}, ${fragment.y}) r${fragment.rotation}`);
            return;
        }
    }
    ns.tprint(`Applied Stanek hacking layout for ${key}.`);
}

const hackingLayouts = {
    "6x5": [
        { id: 25, x: 0, y: 3, rotation: 0 },
        { id: 1, x: 0, y: 2, rotation: 0 },
        { id: 0, x: 3, y: 3, rotation: 0 },
        { id: 107, x: 2, y: 1, rotation: 0 },
        { id: 5, x: 4, y: 0, rotation: 1 },
        { id: 6, x: 1, y: 0, rotation: 0 },
        { id: 7, x: 0, y: 0, rotation: 0 },
    ],
    "6x6": [
        { id: 20, x: 0, y: 0, rotation: 0 },
        { id: 25, x: 0, y: 4, rotation: 0 },
        { id: 5, x: 0, y: 1, rotation: 3 },
        { id: 1, x: 1, y: 1, rotation: 0 },
        { id: 0, x: 3, y: 0, rotation: 0 },
        { id: 7, x: 3, y: 4, rotation: 0 },
        { id: 21, x: 1, y: 3, rotation: 0 },
        { id: 6, x: 5, y: 1, rotation: 3 },
        { id: 10, x: 3, y: 2, rotation: 1 },
    ],
    "7x7": [
        { id: 5, x: 0, y: 4, rotation: 3 },
        { id: 0, x: 1, y: 5, rotation: 2 },
        { id: 25, x: 5, y: 4, rotation: 3 },
        { id: 30, x: 3, y: 5, rotation: 2 },
        { id: 106, x: 1, y: 2, rotation: 3 },
        { id: 7, x: 1, y: 1, rotation: 1 },
        { id: 6, x: 0, y: 0, rotation: 1 },
        { id: 20, x: 1, y: 0, rotation: 2 },
        { id: 1, x: 3, y: 3, rotation: 0 },
        { id: 21, x: 3, y: 1, rotation: 0 },
        { id: 101, x: 5, y: 0, rotation: 3 },
    ],
};
