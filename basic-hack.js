/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];

  const moneyTarget = ns.getServerMaxMoney(target) * 0.9;
  const securityTarget = ns.getServerMinSecurityLevel(target) + 2;

  while (true) {
    if (ns.getServerSecurityLevel(target) > securityTarget) {
      await ns.weaken(target);
    } else if(ns.getServerMoneyAvailable(target) < moneyTarget){
      await ns.grow(target);
    } else {
      await ns.hack(target);
    }
  }
}