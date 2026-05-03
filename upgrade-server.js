/** @param {NS} ns */
export async function main(ns) {
  const ram = Number(ns.args[0]);
  const host = String(ns.args[1] ?? "");

  if (!ram || !host) {
    printUsageAndServers();
    return;
  }

  const coin = ns.getPlayer().money;
  const cost = ns.cloud.getServerUpgradeCost(host, ram);
  if (cost < 0) {
    ns.tprint(`Invalid upgrade. host=${host}, ram=${formatRam(ram)}`);
    return;
  }

  if (coin < cost) {
    ns.tprint(
      `Not enough coin.\n` +
      `Cost: ${formatMoney(cost)}\n` +
      `Coin: ${formatMoney(coin)}`
    );
    return;
  }

  const success = ns.cloud.upgradeServer(host, ram);
  ns.tprint(success
    ? `Upgraded ${host} to ${formatRam(ram)} for ${formatMoney(cost)}.`
    : `Upgrade failed for ${host} to ${formatRam(ram)}.`);

  function printUsageAndServers() {
    ns.tprint("Usage: run upgrade-server.js RAM HOST");
    const servers = ns.cloud.getServerNames();
    if (servers.length === 0) {
      ns.tprint("No cloud servers found.");
      return;
    }

    const coin = ns.getPlayer().money;
    ns.tprint(`Cloud servers; on hand: ${formatMoney(coin)}`);
    for (const server of servers) {
      const currentRam = ns.getServerMaxRam(server);
      const nextRam = Math.min(currentRam * 2, ns.cloud.getRamLimit());
      const cost = currentRam >= ns.cloud.getRamLimit() ? -1 : ns.cloud.getServerUpgradeCost(server, nextRam);
      const costText = cost < 0 ? "n/a" : formatMoney(cost);
      const affordText = cost >= 0 && coin >= cost ? "yes" : "no";
      ns.tprint(`${server}: ${Math.floor(currentRam)} -> ${Math.floor(nextRam)}; cost ${costText}; afford ${affordText}`);
    }
  }

  function formatMoney(n) {
    return `$${ns.format.number(n, 2)}`;
  }

  function formatRam(n) {
    return ns.format.ram(n, 2);
  }
}
