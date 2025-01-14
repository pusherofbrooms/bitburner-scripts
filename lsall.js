/** @param {NS} ns */
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
    
    // Print sorted server information
    for (const serv of allServers) {
        ns.tprint(`Name: ${serv}, Files: ${ns.ls(serv)}\n`);
    }
}