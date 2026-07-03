import { SYNC_MANIFEST, SYNC_STATUS, LABYRINTH_SCRIPT, ensureDnetFiles, hashText, parseArgs, pullHomeState, pushHomeState, readJson, safe, writeJson, argsEqual } from "/dnet/lib.js";

const DEFAULT_FILES = [
  "/dnet/lib.js", "/dnet/bootstrap.js", "/dnet/sync-files.js", "/dnet/scout.js",
  "/dnet/static-solve.js", "/dnet/brute-worker.js", "/dnet/log-harvest.js",
  "/dnet/repair.js", LABYRINTH_SCRIPT, "/dnet/unlock-ram.js"
];
const RESTART_ON_CHANGE = new Set([LABYRINTH_SCRIPT]);

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  await ensureDnetFiles(ns);
  if (opts.once) return await tick(ns);
  while (true) { await tick(ns); await ns.sleep(opts.sleepMs); }
}

async function tick(ns) {
  pullHomeState(ns, [SYNC_MANIFEST]);
  const manifest = readJson(ns, SYNC_MANIFEST, DEFAULT_FILES);
  const files = Array.isArray(manifest) ? manifest : manifest.files || DEFAULT_FILES;
  const changed = [];
  for (const file of files) {
    const before = safe(() => ns.fileExists(file) ? hashText(ns.read(file)) : "", "");
    if (!ns.fileExists(file, "home")) continue;
    safe(() => ns.scp(file, ns.getHostname(), "home"), false);
    const after = safe(() => ns.fileExists(file) ? hashText(ns.read(file)) : "", "");
    if (before !== after) { changed.push(file); await maybeRestart(ns, file); }
  }
  const status = readJson(ns, SYNC_STATUS, {});
  status[ns.getHostname()] = { changed, lastSync: Date.now() };
  writeJson(ns, SYNC_STATUS, status);
  pushHomeState(ns, [SYNC_STATUS]);
}

async function maybeRestart(ns, file) {
  if (!RESTART_ON_CHANGE.has(file)) return;
  const procs = ns.ps(ns.getHostname()).filter(p => p.filename === file);
  for (const p of procs) {
    const args = p.args;
    const threads = Math.max(1, Math.floor((ns.getServerMaxRam(ns.getHostname()) - ns.getServerUsedRam(ns.getHostname()) + ns.getScriptRam(file)) / ns.getScriptRam(file)));
    ns.kill(p.pid);
    await ns.sleep(20);
    if (!ns.ps(ns.getHostname()).some(q => q.filename === file && argsEqual(q.args, args))) ns.exec(file, ns.getHostname(), threads, ...args);
  }
}
