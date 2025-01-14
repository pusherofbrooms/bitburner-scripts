export async function main(ns) {
  const target = ns.args[0];
  const moneyTarget = ns.getServerMaxMoney(target) * 0.9;

  while(true){
    let moneyAvailable = ns.getServerMoneyAvailable(target);
    if (moneyAvailable > moneyTarget){
      await ns.hack(target);
    } else {
      await ns.sleep(1000);
    }
  }
}