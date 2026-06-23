/**
 * Cloud-server status probe. Separate from status.js so the common dashboard
 * does not pay ns.cloud RAM costs in tiny-memory starts.
 * @param {NS} ns
 */
export async function main(ns) {
  const opts = parseArgs(ns.args);
  if (opts.help) {
    ns.tprint("Usage: run status-cloud.js [--json]\nSummarizes owned cloud servers and likely next upgrades.");
    return;
  }

  const names = ns.cloud.getServerNames();
  const servers = names.map((host) => ({
    host,
    ram: ns.getServerMaxRam(host),
    used: ns.getServerUsedRam(host),
  })).sort((a, b) => a.ram - b.ram || a.host.localeCompare(b.host));
  const ramMax = servers.reduce((sum, server) => sum + server.ram, 0);
  const ramUsed = servers.reduce((sum, server) => sum + server.used, 0);
  const limit = ns.cloud.getServerLimit();
  const ramLimit = ns.cloud.getRamLimit();
  const money = ns.getServerMoneyAvailable("home");
  const nextBuyRam = chooseAffordableRam(ns, money, ramLimit);
  const smallest = servers[0];
  const nextUpgradeRam = smallest ? Math.min(smallest.ram * 2, ramLimit) : 0;
  const nextUpgradeCost = smallest && smallest.ram < ramLimit ? ns.cloud.getServerUpgradeCost(smallest.host, nextUpgradeRam) : -1;

  const data = {
    count: servers.length,
    limit,
    ramUsed,
    ramMax,
    ramLimit,
    servers,
    affordableNewServerRam: nextBuyRam,
    smallestUpgrade: smallest ? { host: smallest.host, from: smallest.ram, to: nextUpgradeRam, cost: nextUpgradeCost } : null,
  };

  if (opts.json) {
    ns.tprint(JSON.stringify(data));
    return;
  }

  const lines = [];
  lines.push("Cloud Status");
  lines.push(`Servers: ${data.count}/${data.limit}`);
  lines.push(`Cloud RAM: ${ns.format.ram(data.ramUsed, 2)} / ${ns.format.ram(data.ramMax, 2)}; per-server cap ${ns.format.ram(data.ramLimit, 2)}`);
  if (servers.length) lines.push(`Smallest: ${smallest.host} ${ns.format.ram(smallest.ram, 2)}`);
  if (servers.length < limit && nextBuyRam > 0) lines.push(`Affordable new server: ${ns.format.ram(nextBuyRam, 2)} via run purchase-servers.js ${nextBuyRam} 1`);
  if (smallest && nextUpgradeCost >= 0) lines.push(`Next smallest upgrade: ${smallest.host} -> ${ns.format.ram(nextUpgradeRam, 2)} costs ${moneyText(ns, nextUpgradeCost)}${money >= nextUpgradeCost ? " (affordable)" : ""}`);
  if (!servers.length) lines.push("No cloud servers. Buy once RAM becomes the hacking bottleneck.");
  ns.tprint(lines.join("\n"));
}

function parseArgs(args) {
  return {
    help: args.includes("--help") || args.includes("-h"),
    json: args.includes("--json"),
  };
}

function chooseAffordableRam(ns, money, ramLimit) {
  let best = 0;
  for (let ram = 2; ram <= ramLimit; ram *= 2) {
    if (ns.cloud.getServerCost(ram) <= money) best = ram;
    else break;
  }
  return best;
}

function moneyText(ns, value) {
  return `$${ns.format.number(value, 2)}`;
}
