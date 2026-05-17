export function getAllServers(ns, start = 'home', visited = new Set()) {
    visited.add(start);
    const connections = ns.scan(start);
    
    for (const server of connections) {
        if (!visited.has(server) && server !== "darkweb") {
            getAllServers(ns, server, visited);
        }
    }
    
    return Array.from(visited);
}

export async function main(ns) {
    const allServers = getAllServers(ns).filter((server) => server !== "home");
    
    // Print sorted server information
    for (const serv of allServers) {
      const files = ns.ls(serv);
      if (files.find((name) => name.startsWith("contract-"))){
        ns.tprint(`Name: ${serv}, Files: ${files}\n`);
      }
    }
}