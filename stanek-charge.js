/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");

    const includeBoosters = ns.args.includes("--boosters");

    while (true) {
        const fragments = ns.stanek
            .activeFragments()
            .filter((fragment) => includeBoosters || fragment.type !== 18)
            .sort((a, b) => a.numCharge - b.numCharge);

        if (fragments.length === 0) {
            ns.print("No Stanek fragments to charge.");
            await ns.sleep(10000);
            continue;
        }

        for (const fragment of fragments) {
            ns.print(`Charging fragment ${fragment.id} at (${fragment.x}, ${fragment.y}), charges=${fragment.numCharge}`);
            await ns.stanek.chargeFragment(fragment.x, fragment.y);
        }
    }
}
