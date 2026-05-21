/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    if (ns.args.includes("--help")) {
        printUsage(ns);
        return;
    }

    const script = "stanek-charge-loop.js";
    const deployAll = ns.args.includes("--all");
    const threadArg = ns.args.find((arg) => !String(arg).startsWith("--"));
    const threads = Math.max(1, Math.floor(Number(threadArg ?? 1)));

    const coords = ns.stanek
        .activeFragments()
        .filter((fragment) => fragment.type !== 18)
        .flatMap((fragment) => [fragment.x, fragment.y]);

    if (coords.length === 0) {
        ns.tprint("No chargeable Stanek fragments found.");
        return;
    }

    if (deployAll) {
        await deployToAllServers(ns, script, coords);
        return;
    }

    const pid = ns.run(script, threads, ...coords);
    if (pid === 0) {
        ns.tprint(`Failed to launch ${script} with ${threads} threads.`);
        return;
    }

    ns.tprint(`Launched ${script} pid=${pid} threads=${threads} fragments=${coords.length / 2}.`);
}

function printUsage(ns) {
    ns.tprint([
        "Usage:",
        "  run stanek-charge-init.js [threads]",
        "  run stanek-charge-init.js --all",
        "",
        "Options:",
        "  threads  Local-only thread count. Defaults to 1.",
        "  --all    Deploy stanek-charge-loop.js to all rooted servers using available RAM.",
        "  --help   Show this help text.",
        "",
        "Notes:",
        "  Booster fragments are skipped because they cannot be charged.",
    ].join("\n"));
}

async function deployToAllServers(ns, script, coords) {
    const scriptRam = ns.getScriptRam(script);
    let totalThreads = 0;
    let launched = 0;

    for (const server of getAllServers(ns)) {
        if (!ns.hasRootAccess(server)) continue;

        const freeRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
        const threads = Math.floor(freeRam / scriptRam);
        if (threads < 1) continue;

        await ns.scp(script, server);
        const pid = ns.exec(script, server, threads, ...coords);
        if (pid === 0) {
            ns.tprint(`Failed to launch ${script} on ${server} with ${threads} threads.`);
            continue;
        }

        launched += 1;
        totalThreads += threads;
        ns.tprint(`Launched ${script} on ${server} pid=${pid} threads=${threads}.`);
    }

    ns.tprint(`Stanek charge deployment complete: ${launched} servers, ${totalThreads} total threads, ${coords.length / 2} fragments.`);
}

function getAllServers(ns, start = "home", visited = new Set()) {
    visited.add(start);

    for (const server of ns.scan(start)) {
        if (!visited.has(server) && server !== "darkweb") {
            getAllServers(ns, server, visited);
        }
    }

    return Array.from(visited);
}
