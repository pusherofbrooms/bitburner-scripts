export function getAllServers(ns, start = 'home', visited = new Set()) {
    visited.add(start);
    const connections = ns.scan(start);
    
    for (const server of connections) {
        if (!visited.has(server)) {
            getAllServers(ns, server, visited);
        }
    }
    
    return Array.from(visited);
}

/** @param {NS} ns */
export async function main(ns) {
    const allServers = getAllServers(ns);
    ns.tprint(`Total servers discovered: ${allServers.length}`);
    for (const target of allServers) {
      // ns.tprint(`Server: ${target}\n`);
      if (ns.hasRootAccess(target)) {
        continue;
      }

      const numOpenPortsRequired = ns.getServerNumPortsRequired(target);

      if (numOpenPortsRequired >= 5 && ns.fileExists("SQLInject.exe", "home")) {
        ns.sqlinject(target);
      }
      if (numOpenPortsRequired >= 4 && ns.fileExists("HTTPWorm.exe", "home")) {
        ns.httpworm(target);
      }
      if (numOpenPortsRequired >= 3 && ns.fileExists("relaySMTP.exe", "home")) {
        ns.relaysmtp(target);
      }
      if (numOpenPortsRequired >= 2 && ns.fileExists("FTPCrack.exe", "home")) {
        ns.ftpcrack(target);
      }
      if (numOpenPortsRequired >= 1 && ns.fileExists("BruteSSH.exe", "home")) {
        ns.brutessh(target);
      }

      if (ns.nuke(target)) {
        ns.tprint(`Successfully rooted ${target}`);
      } else {
        ns.tprint(`Failed to root ${target}`);
      }
    }     
}
