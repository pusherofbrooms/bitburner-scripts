/**
 * Tiny darknet RAM unlock helper. Run on a cracked darknet server, or on an adjacent parent with --host.
 * Usage: run dnet-unlock-ram.js --host n00dles --password secret --target-free 16 --max-attempts 30 --then dnet-crawl-bn15.js --sleep 5000
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  const here = ns.getHostname();
  const host = opts.host || here;
  if (!ns.dnet?.isDarknetServer(host)) return;
  if (opts.passwordSet) ns.dnet.connectToSession(host, opts.password);

  for (let i = 0; i < opts.maxAttempts; i++) {
    const free = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
    const blocked = ns.dnet.getBlockedRam(host);
    const targetFree = opts.all ? ns.getServerMaxRam(host) : opts.targetFree;
    ns.print(`${host}: free=${free.toFixed(2)}GB blocked=${blocked.toFixed(2)}GB target=${targetFree}GB`);
    if (free >= targetFree || blocked <= 0) break;
    const result = await ns.dnet.memoryReallocation(host);
    if (!result?.success) break;
  }

  if (opts.thenScript) {
    if (opts.passwordSet) ns.dnet.connectToSession(host, opts.password);
    const procs = ns.ps(host).filter(p => p.filename === opts.thenScript);
    if (!procs.some(p => JSON.stringify(p.args) === JSON.stringify(opts.thenArgs))) {
      const pid = ns.exec(opts.thenScript, host, 1, ...opts.thenArgs);
      ns.print(pid ? `launched ${opts.thenScript} on ${host} pid=${pid}` : `could not launch ${opts.thenScript} on ${host} from ${here}`);
    }
  }
}

function parseArgs(args) {
  const opts = { host: "", password: "", passwordSet: false, targetFree: 16, maxAttempts: 30, all: false, thenScript: "", thenArgs: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--host") opts.host = String(args[++i] ?? "");
    else if (args[i] === "--password") { opts.password = String(args[++i] ?? ""); opts.passwordSet = true; }
    else if (args[i] === "--target-free") opts.targetFree = Number(args[++i]);
    else if (args[i] === "--max-attempts") opts.maxAttempts = Number(args[++i]);
    else if (args[i] === "--all") opts.all = true;
    else if (args[i] === "--then") { opts.thenScript = String(args[++i] ?? ""); opts.thenArgs = args.slice(i + 1); break; }
  }
  return opts;
}
export function autocomplete() { return ["--host", "--password", "--target-free", "--max-attempts", "--all", "--then", "/dnet/bootstrap.js", "/dnet/labyrinth.js"]; }
