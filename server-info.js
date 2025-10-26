/** @param {NS} ns */
export async function main(ns) {
  // provide info about an arbitrary number of servers.
  // args: target [target]...
  for (const target of ns.args){
    const serverDetails = ns.getServer(target);

    ns.tprint(
      `\n` +
      `Name: ${serverDetails.hostname}\n` +
      `Minimum Security: ${serverDetails.minDifficulty}\n` +
      `Current Security: ${serverDetails.hackDifficulty}\n` +
      `Maximum Server Money: ${serverDetails.moneyMax}\n` +
      `Current Server Money: ${serverDetails.moneyAvailable}\n`
    );
  }
}
