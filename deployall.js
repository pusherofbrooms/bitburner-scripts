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


export async function main(ns) {
    const script = ns.args[0];
    const target = ns.args[1];
    const allServers = getAllServers(ns);
    for (const serv of allServers) {
      if (serv === "home" || serv.startsWith("pserv-")) continue;
      // if we have root access, copy the script,
      // calculate the number of threads we can run,
      // and run the script.
      if (ns.hasRootAccess(serv)) {
        ns.tprint(`deploying to ${serv}\n`);
        let scriptMem = ns.getScriptRam(script);
        let serverMem = ns.getServerMaxRam(serv);
        let threads = Math.floor(serverMem / scriptMem);
        if (threads > 0){
          ns.killall(serv);
          ns.scp(script, serv);
          ns.exec(script, serv, threads, target);
        } else {
          ns.tprint(`Not enough ram on ${serv}`);
        }
      }
    }   
}
