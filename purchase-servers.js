/** @param {NS} ns */
export async function main(ns) {
  // args:
  // RAM in GB: integer
  // number of servers: integer
  const ram = Number(ns.args[0]);
  const numServers = Number(ns.args[1] ?? 1);

  // print powers of 2 up to max if no args.
  if (! ram){
    ns.tprint("Powers of 2 above 8192");
    for (let i=12; i < 21; i++){
      ns.tprint(`2 ^ ${i}: ${2 ** i}`);
    }
    ns.exit();
  }

  const cost = ns.cloud.getServerCost(ram) * numServers;
  const coin = ns.getPlayer().money;
  if (coin < cost){
    ns.tprint(
      `You don't have enough coin to buy all servers.\n` +
      `coin: ${formatMoney(coin)}, cost: ${formatMoney(cost)}\n`
    );
    return;
  }

  for (let i=0; i < numServers; i++){
    let name = "pserv-" + i;
    ns.cloud.purchaseServer(name, ram);
  }

  function formatMoney(n) {
    if (n === 0) return "$0";
    const negative = n < 0;
    n = Math.abs(n);
    if (n >= 1e12) return (negative ? "-" : "") + "$" + (n / 1e12).toFixed(2) + "t";
    if (n >= 1e9) return (negative ? "-" : "") + "$" + (n / 1e9).toFixed(2) + "b";
    if (n >= 1e6) return (negative ? "-" : "") + "$" + (n / 1e6).toFixed(2) + "m";
    if (n >= 1e3) return (negative ? "-" : "") + "$" + (n / 1e3).toFixed(2) + "k";
    return (negative ? "-" : "") + "$" + n.toFixed(0);
  }
}
