/**
 * Tiny darknet RAM unlock helper. Run on a cracked darknet server.
 * Usage: run dnet-unlock-ram.js --target-free 12 --max-attempts 10 --then dnet-crawl-bn15.js --sleep 5000
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  const host = ns.getHostname();
  if (!ns.dnet?.isDarknetServer(host)) return;

  for (let i = 0; i < opts.maxAttempts; i++) {
    const free = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
    const blocked = ns.dnet.getBlockedRam();
    ns.print(`free=${free.toFixed(2)}GB blocked=${blocked.toFixed(2)}GB target=${opts.targetFree}GB`);
    if (free >= opts.targetFree || blocked <= 0) break;
    const result = await ns.dnet.memoryReallocation();
    if (!result?.success) break;
  }

  if (opts.thenScript) {
    const procs = ns.ps(host).filter(p => p.filename === opts.thenScript);
    if (!procs.some(p => JSON.stringify(p.args) === JSON.stringify(opts.thenArgs))) {
      const pid = ns.exec(opts.thenScript, host, 1, ...opts.thenArgs);
      ns.print(pid ? `launched ${opts.thenScript} pid=${pid}` : `could not launch ${opts.thenScript}`);
    }
  }
}

function parseArgs(args) {
  const opts = { targetFree: 12, maxAttempts: 10, thenScript: "", thenArgs: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--target-free") opts.targetFree = Number(args[++i]);
    else if (args[i] === "--max-attempts") opts.maxAttempts = Number(args[++i]);
    else if (args[i] === "--then") { opts.thenScript = String(args[++i] ?? ""); opts.thenArgs = args.slice(i + 1); break; }
  }
  return opts;
}
export function autocomplete() { return ["--target-free", "--max-attempts", "--then", "dnet-crawl-bn15.js", "dnet-crawl.js"]; }
