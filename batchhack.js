/** @param {NS} ns */
export async function main(ns) {
  // target of hacking
  const target = ns.args[0];
  // delay before starting action in ms.
  const delay = ns.args[1] || 0;

  await ns.hack(target, { additionalMsec: delay });
}