import { LABYRINTH_SCRIPT, PASSWORD_DB, ensureDnetFiles, argsEqual, parseArgs, pullHomeState, readJson, safe, trySecret } from "/dnet/lib.js";

const CHILDREN = [
  ["/dnet/sync-files.js", []],
  ["/dnet/scout.js", []],
  ["/dnet/static-solve.js", []],
  ["/dnet/brute-worker.js", []],
  ["/dnet/repair.js", []]
];
const LABYRINTH_HOSTS = new Set(["th3_l4byr1nth", "cru3l_l4byr1nth", "m3rc1l3ss_l4byr1nth", "ub3r_l4byr1nth", "et3rn4l_l4byr1nth", "end13ss_l4byr1nth", "f1n4l_l4byr1nth", "b0nus_l4byr1nth"]);

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  await ensureDnetFiles(ns);
  if (opts.once) return await tick(ns, opts);
  while (true) { await tick(ns, opts); await ns.sleep(opts.sleepMs); }
}

async function tick(ns, opts) {
  if (!ns.dnet) return ns.tprint("ERROR: ns.dnet unavailable");
  pullHomeState(ns);
  await launchLocalHelpers(ns, opts);
  for (const target of safe(() => ns.dnet.probe(), [])) {
    const d = safe(() => ns.dnet.getServerDetails(target), null);
    if (!d || !d.isOnline || !d.isConnectedToCurrentServer) continue;
    if (d.hasSession) { await replicate(ns, target, opts); continue; }
    const known = readJson(ns, PASSWORD_DB, {})[target];
    if (known && await trySecret(ns, target, known, d)) { await replicate(ns, target, opts); continue; }
    if (isLabyrinth(target, d)) await launchLabyrinth(ns, target);
  }
}
async function launchLocalHelpers(ns, opts) {
  for (const [file, args] of CHILDREN) {
    if (!ns.fileExists(file) || ns.ps().some(p => p.filename === file && argsEqual(p.args, args))) continue;
    if (freeRam(ns) >= ns.getScriptRam(file)) ns.exec(file, ns.getHostname(), 1, ...args);
  }
}
async function replicate(ns, target, opts) {
  const files = CHILDREN.map(x => x[0]).concat(["/dnet/lib.js", LABYRINTH_SCRIPT, "/dnet/unlock-ram.js"]);
  safe(() => ns.scp(files.filter(f => ns.fileExists(f, "home")), target, "home"), false);
  safe(() => ns.scp([PASSWORD_DB, "/data/dnet-hints.txt", "/data/dnet-map.txt"].filter(f => ns.fileExists(f)), target, ns.getHostname()), false);
  const args = ["--sleep", opts.sleepMs];
  const file = "/dnet/bootstrap.js";
  safe(() => ns.scp(file, target, "home"), false);
  if (!ns.ps(target).some(p => p.filename === file)) ns.exec(file, target, 1, ...args);
}
async function launchLabyrinth(ns, lab) {
  if (!ns.fileExists(LABYRINTH_SCRIPT)) safe(() => ns.scp(LABYRINTH_SCRIPT, ns.getHostname(), "home"), false);
  if (ns.ps().some(p => p.filename === LABYRINTH_SCRIPT && argsEqual(p.args, [lab]))) return;
  const threads = Math.max(1, Math.floor(freeRam(ns) / ns.getScriptRam(LABYRINTH_SCRIPT)));
  if (threads > 0) ns.exec(LABYRINTH_SCRIPT, ns.getHostname(), threads, lab);
}
function isLabyrinth(host, d) { return d?.modelId === "(The Labyrinth)" || LABYRINTH_HOSTS.has(String(host)); }
function freeRam(ns) { return ns.getServerMaxRam(ns.getHostname()) - ns.getServerUsedRam(ns.getHostname()); }
