/** @param {NS} ns */
export async function main(ns) {

    const ram = ns.args[0];
    const host = ns.args[1];

    const coin = ns.getPlayer().money;
    const cost = ns.getPurchasedServerUpgradeCost(host, ram);
    if (coin < cost){
      ns.tprint(
        `Not enough coin.\n` +
        `Cost: ${cost}\n` +
        `Coin: ${coin}`
      );
    } else {
      ns.upgradePurchasedServer(host, ram);
    }
}
