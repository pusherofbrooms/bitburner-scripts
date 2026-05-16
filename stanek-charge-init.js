/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const script = "stanek-charge-loop.js";
    const threads = Math.max(1, Math.floor(Number(ns.args[0] ?? 1)));
    const includeBoosters = ns.args.includes("--boosters");

    const coords = ns.stanek
        .activeFragments()
        .filter((fragment) => includeBoosters || fragment.type !== 18)
        .flatMap((fragment) => [fragment.x, fragment.y]);

    if (coords.length === 0) {
        ns.tprint("No Stanek fragments to charge.");
        return;
    }

    const pid = ns.run(script, threads, ...coords);
    if (pid === 0) {
        ns.tprint(`Failed to launch ${script} with ${threads} threads.`);
        return;
    }

    ns.tprint(`Launched ${script} pid=${pid} threads=${threads} fragments=${coords.length / 2}.`);
}
