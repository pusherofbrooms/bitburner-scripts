/** @param {NS} ns */
export async function main(ns) {
  // args:
  // RAM in GB: integer
  // number of servers: integer
  const ram = ns.args[0];
  const numServers = ns.args[1];

  // print powers of 2 up to max if no args.
  if (! ram){
    ns.tprint("Powers of 2 above 8192");
    for (let i=12; i < 21; i++){
      ns.tprint(`2 ^ ${i}: ${2 ** i}`);
    }
    ns.exit();
  }

  const cost = ns.getPurchasedServerCost(ram) * numServers;
  const coin = ns.getPlayer().money;
  if (coin < cost){
    ns.tprint(
      `You don't have enough coin to buy all servers.\n` +
      `coin: ${coin}, cost: ${cost}\n`
    );
    return;
  }

  for (let i=0; i < numServers; i++){
    let name = "pserv-" + i;
    ns.purchaseServer(name, ram);
  }
}