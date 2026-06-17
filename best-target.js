import { getAllServers } from "getServers.js";

/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["limit", 10],
    ["all", false],
    ["minChance", 0.05],
    ["help", false],
  ]);

  if (flags.help) {
    ns.tprint("Usage: run best-target.js [--limit 10] [--all] [--minChance 0.05]");
    ns.tprint("Scores rooted money servers by maxMoney * hackChance * growthFactor / weakenTime.");
    return;
  }

  const playerHack = ns.getPlayer().skills.hacking;
  const portOpeners = countPortOpeners();
  const rows = getAllServers(ns)
    .filter((host) => host !== "home" && !host.startsWith("pserv-") && !host.startsWith("hacknet-server-"))
    .map((host) => scoreServer(host))
    .filter((row) => row.maxMoney > 0)
    .filter((row) => flags.all || row.rooted)
    .filter((row) => row.requiredHack <= playerHack)
    .filter((row) => row.portsRequired <= portOpeners)
    .filter((row) => row.chance >= Number(flags.minChance))
    .sort((a, b) => b.score - a.score);

  if (rows.length === 0) {
    ns.tprint(`No viable targets. hacking=${playerHack}, portOpeners=${portOpeners}. Try --all or --minChance 0.`);
    return;
  }

  const limit = Math.max(1, Number(flags.limit));
  ns.tprint(`Best targets for hacking=${playerHack}, portOpeners=${portOpeners}:`);
  for (const row of rows.slice(0, limit)) {
    ns.tprint(
      `${row.host.padEnd(18)} score=${ns.format.number(row.score, 3).padStart(9)} ` +
      `money=${ns.format.number(row.maxMoney, 2).padStart(9)} ` +
      `chance=${ns.format.percent(row.chance, 1).padStart(7)} ` +
      `growth=${String(row.growth).padStart(3)} ` +
      `weak=${formatSeconds(row.weakenTime).padStart(7)} ` +
      `req=${String(row.requiredHack).padStart(3)} ports=${row.portsRequired}`
    );
  }
  ns.tprint(`Recommended: ${rows[0].host}`);

  function scoreServer(host) {
    const maxMoney = ns.getServerMaxMoney(host);
    const chance = ns.hackAnalyzeChance(host);
    const growth = ns.getServerGrowth(host);
    const weakenTime = ns.getWeakenTime(host);
    const requiredHack = ns.getServerRequiredHackingLevel(host);
    const portsRequired = ns.getServerNumPortsRequired(host);
    const rooted = ns.hasRootAccess(host);

    // getServerGrowth is an inherent server stat; use log1p so high-growth servers
    // are favored without drowning out money/chance/time. getWeakenTime is the
    // pacing limit for HWGW/basic loops, and hackAnalyzeChance reflects current
    // player skill vs current server security.
    const growthFactor = Math.log1p(Math.max(0, growth));
    const score = (maxMoney * chance * growthFactor) / Math.max(1, weakenTime);
    return { host, score, maxMoney, chance, growth, weakenTime, requiredHack, portsRequired, rooted };
  }

  function countPortOpeners() {
    return ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"]
      .filter((program) => ns.fileExists(program, "home"))
      .length;
  }

  function formatSeconds(ms) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
