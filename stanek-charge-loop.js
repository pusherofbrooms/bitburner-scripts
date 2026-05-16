/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const coords = [];
    for (let i = 0; i < ns.args.length; i += 2) {
        coords.push([Number(ns.args[i]), Number(ns.args[i + 1])]);
    }

    if (coords.length === 0) {
        ns.tprint("No Stanek fragment coordinates supplied.");
        return;
    }

    while (true) {
        for (const [x, y] of coords) {
            await ns.stanek.chargeFragment(x, y);
        }
    }
}
