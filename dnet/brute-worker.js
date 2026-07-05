import { PASSWORD_DB, ensureDnetFiles, parseArgs, pullHomeState, readJson, trySecret } from "/dnet/lib.js";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  await ensureDnetFiles(ns);
  if (opts.once) return await tick(ns, opts);
  while (true) { await tick(ns, opts); await ns.sleep(opts.sleepMs); }
}
async function tick(ns, opts) {
  pullHomeState(ns);
  for (const target of ns.dnet.probe()) {
    const d = ns.dnet.getServerDetails(target);
    if (d.hasSession || d.passwordFormat !== "numeric" || d.passwordLength > 4) continue;
    const max = Math.min(10 ** d.passwordLength, opts.maxAttempts);
    for (let n = 0; n < max; n++) {
      if (n % 100 === 0) {
        pullHomeState(ns, [PASSWORD_DB]);
        const known = readJson(ns, PASSWORD_DB, {})[target];
        if (known !== undefined && await trySecret(ns, target, known, d)) break;
        await ns.sleep(1);
      }
      if (await trySecret(ns, target, String(n).padStart(d.passwordLength, "0"), d)) break;
    }
  }
}
