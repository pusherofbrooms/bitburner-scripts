import { parseArgs, safeAsync } from "/dnet/lib.js";
const DAEMONS = [["/dnet/sync-files.js", []], ["/dnet/scout.js", []], ["/dnet/static-solve.js", []]];
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  if (opts.once) return await tick(ns, opts);
  while (true) { await tick(ns, opts); await ns.sleep(opts.sleepMs); }
}
async function tick(ns, opts) {
  if (ns.dnet?.isDarknetServer(ns.getHostname())) {
    for (let i = 0; i < 20 && ns.dnet.getBlockedRam() > 0; i++) {
      const r = await safeAsync(() => ns.dnet.memoryReallocation(), null);
      if (!r?.success) break;
    }
    if (opts.phish) await safeAsync(() => ns.dnet.phishingAttack(), null);
  }
  for (const [file, args] of DAEMONS) {
    if (!ns.fileExists(file) || ns.ps().some(p => p.filename === file)) continue;
    if (ns.getServerMaxRam(ns.getHostname()) - ns.getServerUsedRam(ns.getHostname()) >= ns.getScriptRam(file)) ns.exec(file, ns.getHostname(), 1, ...args);
  }
}
