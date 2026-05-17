export function getAllServers(ns, start = "home", visited = new Set()) {
  visited.add(start);
  const connections = ns.scan(start);

  for (const server of connections) {
    if (!visited.has(server) && server !== "darkweb") {
      getAllServers(ns, server, visited);
    }
  }

  return Array.from(visited);
}

/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["include-home", false],
    ["help", false],
  ]);

  if (flags.help) {
    ns.tprint("Usage: run killall.js [--include-home]\nKills all scripts on all rooted servers. Skips home unless --include-home is set.");
    return;
  }

  const servers = getAllServers(ns);
  let killed = 0;

  for (const server of servers) {
    if (server === "home" && !flags["include-home"]) continue;
    if (!ns.hasRootAccess(server)) continue;

    if (ns.killall(server)) {
      killed++;
      ns.tprint(`Killed scripts on ${server}`);
    }
  }

  ns.tprint(`killall complete: ${killed} server(s) cleared`);
}
