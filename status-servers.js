/**
 * Server/root/RAM status probe. Kept separate from status.js so the mud-safe
 * dashboard does not pay scan/root API RAM costs.
 * @param {NS} ns
 */
export async function main(ns) {
  const opts = parseArgs(ns.args);
  if (opts.help) {
    ns.tprint("Usage: run status-servers.js [--json]\nSummarizes discovered servers, root access, money targets, and worker RAM.");
    return;
  }

  const servers = getAllServers(ns);
  const rooted = servers.filter((host) => ns.hasRootAccess(host));
  const moneyTargets = servers.filter((host) => ns.getServerMaxMoney(host) > 0);
  const rootedMoneyTargets = moneyTargets.filter((host) => ns.hasRootAccess(host));
  const ramHosts = servers.filter((host) => ns.getServerMaxRam(host) > 0);
  const rootedRamHosts = ramHosts.filter((host) => ns.hasRootAccess(host));
  const workerRamMax = rootedRamHosts.reduce((sum, host) => sum + ns.getServerMaxRam(host), 0);
  const workerRamUsed = rootedRamHosts.reduce((sum, host) => sum + ns.getServerUsedRam(host), 0);
  const publicWorkers = rootedRamHosts.filter((host) => host !== "home" && !host.startsWith("pserv-") && !host.startsWith("hacknet-server-"));

  const data = {
    servers: servers.length,
    rooted: rooted.length,
    moneyTargets: moneyTargets.length,
    rootedMoneyTargets: rootedMoneyTargets.length,
    ramHosts: ramHosts.length,
    rootedRamHosts: rootedRamHosts.length,
    publicWorkers: publicWorkers.length,
    workerRamUsed,
    workerRamMax,
    newestRootable: servers.filter((host) => !ns.hasRootAccess(host) && canOpenPorts(ns, host)).slice(0, 10),
  };

  if (opts.json) {
    ns.tprint(JSON.stringify(data));
    return;
  }

  const lines = [];
  lines.push("Server Status");
  lines.push(`Servers: ${data.servers}; rooted: ${data.rooted}`);
  lines.push(`Money targets: ${data.moneyTargets}; rooted: ${data.rootedMoneyTargets}`);
  lines.push(`RAM hosts: ${data.ramHosts}; rooted RAM hosts: ${data.rootedRamHosts}`);
  lines.push(`Public deploy workers: ${data.publicWorkers}`);
  lines.push(`Rooted worker RAM: ${ns.format.ram(data.workerRamUsed, 2)} / ${ns.format.ram(data.workerRamMax, 2)}`);
  if (data.newestRootable.length) {
    lines.push(`Rootable now: ${data.newestRootable.join(", ")}`);
    lines.push("Suggested: run rootall.js");
  }
  ns.tprint(lines.join("\n"));
}

function parseArgs(args) {
  return {
    help: args.includes("--help") || args.includes("-h"),
    json: args.includes("--json"),
  };
}

function getAllServers(ns, start = "home", visited = new Set()) {
  visited.add(start);
  for (const server of ns.scan(start)) {
    if (!visited.has(server) && server !== "darkweb") getAllServers(ns, server, visited);
  }
  return [...visited];
}

function canOpenPorts(ns, host) {
  return ns.getServerNumPortsRequired(host) <= countPortOpeners(ns);
}

function countPortOpeners(ns) {
  return ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"]
    .filter((program) => ns.fileExists(program, "home"))
    .length;
}
