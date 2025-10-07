/** @param {NS} ns **/
export async function main(ns) {
    const player = ns.getPlayer();

    ns.tprint(`Karma: ${player.karma}`);
    ns.tprint(`Homicide Count: ${player.numPeopleKilled}`);
    ns.tprint(`City: ${player.city}`);
    ns.tprint(`Money: \$${ns.formatNumber(player.money, 3)}`);

    // You can add more fields you care about below...
}
