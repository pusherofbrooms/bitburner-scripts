/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const details = ns.getServer(target);
  ns.tprint(
    `${target}\n` +
    `Maximum Money:    ${details.moneyMax}\n` +
    `Available Money:  ${details.moneyAvailable}\n` +
    `Minimum Security: ${details.minDifficulty}\n` +
    `Current Security: ${details.hackDifficulty}\n`
  );
}