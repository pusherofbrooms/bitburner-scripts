import { HINT_DB, MAP_DB, ensureDnetFiles, mergeObjectFile, parseArgs, pullHomeState, pushHomeState, readJson, safe, writeJson } from "/dnet/lib.js";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  await ensureDnetFiles(ns);
  if (opts.once) return tick(ns, opts);
  while (true) { await tick(ns, opts); await ns.sleep(opts.sleepMs); }
}

function tick(ns, opts) {
  pullHomeState(ns);
  const here = ns.getHostname();
  if (!ns.dnet) return ns.tprint("ERROR: ns.dnet unavailable");
  const neighbors = safe(() => ns.dnet.probe(), []);
  const map = readJson(ns, MAP_DB, {});
  map[here] = { ...(map[here] || {}), neighbors, lastSeen: Date.now(), from: here };
  for (const target of neighbors) {
    const d = safe(() => ns.dnet.getServerDetails(target), null);
    if (!d) continue;
    map[target] = { ...(map[target] || {}), ...d, seenFrom: here, lastSeen: Date.now() };
    mergeObjectFile(ns, HINT_DB, target, d);
    if (opts.verbose) ns.print(`${target}: ${d.modelId} ${d.passwordFormat}/${d.passwordLength} session=${d.hasSession}`);
  }
  writeJson(ns, MAP_DB, map);
  pushHomeState(ns);
}
