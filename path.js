/** @param {NS} ns **/
export async function main(ns) {
    const args = ns.args.map(String);

    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
        ns.tprint("Usage: run path.js <target> [--from <server>]");
        ns.tprint("Prints copy/pasteable connect commands from the start server to target.");
        return;
    }

    let from = ns.getHostname();
    const fromEq = args.find(a => a.startsWith("--from="));
    if (fromEq) from = fromEq.slice("--from=".length);

    const cleaned = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--from") {
            if (i + 1 < args.length) from = args[++i];
            continue;
        }
        if (args[i].startsWith("--from=")) continue;
        cleaned.push(args[i]);
    }

    const target = cleaned[0];
    const path = findPath(ns, from, target);

    if (!path) {
        ns.tprint(`No path found from ${from} to ${target}`);
        return;
    }

    ns.tprint(`Path: ${path.join(" -> ")}`);
    ns.tprint("Copy/paste:");
    ns.tprint(path.slice(1).map(host => `connect ${host}`).join("; "));
}

function findPath(ns, from, target) {
    const visited = new Set([from]);
    const queue = [[from]];

    while (queue.length > 0) {
        const path = queue.shift();
        const cur = path[path.length - 1];
        if (cur === target) return path;

        for (const next of ns.scan(cur)) {
            if (visited.has(next)) continue;
            visited.add(next);
            queue.push([...path, next]);
        }
    }

    return null;
}
