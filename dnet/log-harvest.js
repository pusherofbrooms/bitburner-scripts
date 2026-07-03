import { HINT_DB, ensureDnetFiles, mergeObjectFile, parseArgs, pullHomeState, pushHomeState, safeAsync } from "/dnet/lib.js";

/** Non-BN15 helper: uses heartbleed/log leakage. @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  await ensureDnetFiles(ns);
  if (opts.once) return await tick(ns, opts);
  while (true) { await tick(ns, opts); await ns.sleep(opts.sleepMs); }
}
async function tick(ns, opts) {
  pullHomeState(ns, [HINT_DB]);
  for (const target of ns.dnet.probe()) {
    const d = ns.dnet.getServerDetails(target);
    if (d.hasSession) continue;
    const hb = await safeAsync(() => ns.dnet.heartbleed(target), null);
    const text = typeof hb === "string" ? hb : JSON.stringify(hb ?? "");
    mergeObjectFile(ns, HINT_DB, target, { ...d, lastLogs: text.slice(0, 4000), lastLogTime: Date.now() });
    if (opts.verbose) ns.print(`${target}: harvested ${text.length} chars`);
  }
  pushHomeState(ns, [HINT_DB]);
}
