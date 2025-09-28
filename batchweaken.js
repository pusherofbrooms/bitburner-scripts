/** @param {NS} ns */
export async function main(ns) {
  // target of hacking
  const target = ns.args[0];
  // delay before starting action in ms.
  const delay = ns.args[1] || 0;

  if (delay) await ns.sleep(delay);
  await ns.weaken(target);
}
