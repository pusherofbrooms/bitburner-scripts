/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["steal", 0.1],
    ["spacing", 80],
    ["reserve", 32],
    ["batchLimit", 80],
    ["targetLimit", 8],
    ["refreshTargets", 60000],
    ["minMoney", 0.98],
    ["maxSec", 0.5],
    ["all", false],
    ["help", false],
  ]);

  if (flags.help || (!flags.all && flags._.length === 0)) {
    ns.tprint("Usage: run fleet-hwgw-formulas.js TARGET... [--all] [--targetLimit 8] [--refreshTargets 60000] [--steal 0.1] [--spacing 80] [--reserve 32] [--batchLimit 80]");
    return;
  }
  if (!ns.fileExists("Formulas.exe", "home")) {
    ns.tprint("Formulas.exe is required for fleet-hwgw-formulas.js");
    return;
  }

  const hackScript = "batchhack.js";
  const growScript = "batchgrow.js";
  const weakenScript = "batchweaken.js";
  const scripts = [hackScript, growScript, weakenScript];
  for (const script of scripts) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`Missing worker script on home: ${script}`);
      return;
    }
  }

  const spacing = Math.max(20, Number(flags.spacing));
  const reserveHomeRam = Number(flags.reserve);
  const stealFraction = Math.max(0.001, Math.min(0.9, Number(flags.steal)));
  const batchLimit = Math.max(1, Number(flags.batchLimit));
  const targetLimit = Math.max(1, Math.floor(Number(flags.targetLimit)));
  const targetRefreshMs = Math.max(5000, Number(flags.refreshTargets));
  const minMoneyRatio = Math.max(0.5, Math.min(1, Number(flags.minMoney)));
  const maxSecDrift = Math.max(0.05, Number(flags.maxSec));
  const hackRam = ns.getScriptRam(hackScript);
  const growRam = ns.getScriptRam(growScript);
  const weakenRam = ns.getScriptRam(weakenScript);

  ns.disableLog("ALL");

  let targets = flags.all ? chooseTargets() : flags._.map(String);
  targets = targets.filter((t) => ns.serverExists(t) && ns.hasRootAccess(t) && ns.getServerMaxMoney(t) > 0);
  if (targets.length === 0) {
    ns.tprint("No valid rooted money targets.");
    return;
  }

  ns.tprint(`Formula fleet HWGW: ${targets.join(", ")}; steal=${ns.format.percent(stealFraction, 1)}, spacing=${spacing}ms, batchLimit=${batchLimit}, targetLimit=${targetLimit}`);

  let batchId = 0;
  const targetState = new Map(targets.map((target) => [target, { doneTimes: [], nextLaunch: 0 }]));
  let nextTargetRefresh = Date.now() + targetRefreshMs;

  while (true) {
    await refreshWorkers();
    if (flags.all && Date.now() >= nextTargetRefresh) {
      targets = chooseTargets();
      for (const target of targets) if (!targetState.has(target)) targetState.set(target, { doneTimes: [], nextLaunch: 0 });
      const activeTargets = new Set(targets);
      for (const [target, state] of targetState) {
        state.doneTimes = state.doneTimes.filter((time) => time > Date.now());
        if (!activeTargets.has(target) && state.doneTimes.length === 0) targetState.delete(target);
      }
      nextTargetRefresh = Date.now() + targetRefreshMs;
      ns.print(`refreshed targets: ${targets.join(", ")}`);
    } else {
      targets = targets.filter((t) => ns.hasRootAccess(t) && ns.getServerMaxMoney(t) > 0);
    }

    let launchedAny = false;
    for (const target of targets.sort((a, b) => scoreTarget(b) - scoreTarget(a))) {
      const state = targetState.get(target) ?? { doneTimes: [], nextLaunch: 0 };
      targetState.set(target, state);
      state.doneTimes = state.doneTimes.filter((time) => time > Date.now());
      if (Date.now() < state.nextLaunch) continue;

      if (!isReady(target)) {
        if (launchPrep(target, `prep-${batchId++}`)) launchedAny = true;
        state.nextLaunch = Date.now() + spacing * 4;
        continue;
      }

      if (totalInFlight() >= batchLimit) break;
      const batch = planBatch(target);
      if (!batch) continue;
      const doneTime = Date.now() + batch.weakenTime + spacing * 4;
      if (launchBatch(target, batch, batchId++)) {
        launchedAny = true;
        state.doneTimes.push(doneTime);
        state.nextLaunch = Date.now() + spacing * 4;
      }
    }

    await ns.sleep(launchedAny ? spacing : 500);
  }

  function chooseTargets() {
    return getAllServers()
      .filter((host) => ns.hasRootAccess(host))
      .filter((host) => ns.getServerMaxMoney(host) > 0)
      .filter((host) => ns.getServerRequiredHackingLevel(host) <= ns.getHackingLevel())
      .sort((a, b) => scoreTarget(b) - scoreTarget(a))
      .slice(0, targetLimit);
  }

  function scoreTarget(target) {
    const server = minServer(target);
    const player = ns.getPlayer();
    const batch = planBatch(target);
    if (!batch) return 0;
    const hackChance = ns.formulas.hacking.hackChance(server, player);
    const profit = server.moneyMax * batch.actualSteal * hackChance;
    const batchSeconds = Math.max(0.001, (batch.weakenTime + spacing * 4) / 1000);
    return profit / batchSeconds;
  }

  function isReady(target) {
    const server = ns.getServer(target);
    return server.hackDifficulty <= server.minDifficulty + maxSecDrift && server.moneyAvailable >= server.moneyMax * minMoneyRatio;
  }

  function minServer(target) {
    const server = ns.getServer(target);
    server.hackDifficulty = server.minDifficulty;
    server.moneyAvailable = server.moneyMax;
    return server;
  }

  function planBatch(target) {
    const server = minServer(target);
    const player = ns.getPlayer();
    const hackPercent = ns.formulas.hacking.hackPercent(server, player);
    if (hackPercent <= 0) return null;
    const hackThreads = Math.max(1, Math.floor(stealFraction / hackPercent));
    const actualSteal = Math.min(0.9, hackThreads * hackPercent);

    const afterHack = { ...server, moneyAvailable: Math.max(1, server.moneyMax * (1 - actualSteal)) };
    const growThreads = Math.max(1, Math.ceil(ns.formulas.hacking.growThreads(afterHack, player, server.moneyMax)));
    const weakenHackThreads = Math.max(1, Math.ceil(ns.hackAnalyzeSecurity(hackThreads, target) / ns.formulas.hacking.weakenEffect(1)));
    const weakenGrowThreads = Math.max(1, Math.ceil(ns.growthAnalyzeSecurity(growThreads, target) / ns.formulas.hacking.weakenEffect(1)));

    const batchRam = hackThreads * hackRam + growThreads * growRam + (weakenHackThreads + weakenGrowThreads) * weakenRam;
    return { hackThreads, growThreads, weakenHackThreads, weakenGrowThreads, actualSteal, batchRam, weakenTime: ns.formulas.hacking.weakenTime(server, player) };
  }

  function launchBatch(target, batch, id) {
    const server = minServer(target);
    const player = ns.getPlayer();
    const weakenTime = ns.formulas.hacking.weakenTime(server, player);
    const hackDelay = Math.max(0, weakenTime - ns.formulas.hacking.hackTime(server, player));
    const growDelay = Math.max(0, weakenTime - ns.formulas.hacking.growTime(server, player) + spacing * 2);
    const jobs = [
      { script: weakenScript, threads: batch.weakenHackThreads, delay: spacing, ram: weakenRam },
      { script: growScript, threads: batch.growThreads, delay: growDelay, ram: growRam },
      { script: weakenScript, threads: batch.weakenGrowThreads, delay: spacing * 3, ram: weakenRam },
      { script: hackScript, threads: batch.hackThreads, delay: hackDelay, ram: hackRam },
    ];
    return launchJobs(target, jobs, id);
  }

  function launchPrep(target, id) {
    const server = ns.getServer(target);
    if (server.hackDifficulty > server.minDifficulty + maxSecDrift) {
      const threads = Math.ceil((server.hackDifficulty - server.minDifficulty) / ns.formulas.hacking.weakenEffect(1));
      return launchJobs(target, [{ script: weakenScript, threads, delay: 0, ram: weakenRam }], id);
    }
    const growServer = { ...server, moneyAvailable: Math.max(1, server.moneyAvailable) };
    const growThreads = Math.ceil(ns.formulas.hacking.growThreads(growServer, ns.getPlayer(), server.moneyMax));
    const weakenThreads = Math.ceil(ns.growthAnalyzeSecurity(growThreads, target) / ns.formulas.hacking.weakenEffect(1));
    const growDelay = Math.max(0, ns.getWeakenTime(target) - ns.getGrowTime(target));
    return launchJobs(target, [
      { script: growScript, threads: growThreads, delay: growDelay, ram: growRam },
      { script: weakenScript, threads: weakenThreads, delay: spacing, ram: weakenRam },
    ], id);
  }

  function totalInFlight() {
    const now = Date.now();
    return [...targetState.values()].reduce((sum, state) => sum + state.doneTimes.filter((time) => time > now).length, 0);
  }

  function getAllServers(start = "home", visited = new Set()) {
    visited.add(start);
    for (const server of ns.scan(start)) if (!visited.has(server)) getAllServers(server, visited);
    return [...visited];
  }

  function getWorkers() {
    return getAllServers()
      .filter((host) => ns.hasRootAccess(host) && ns.getServerMaxRam(host) > 0)
      .map((host) => ({ host, freeRam: getFreeRam(host) }))
      .filter((worker) => worker.freeRam >= Math.min(hackRam, growRam, weakenRam))
      .sort((a, b) => b.freeRam - a.freeRam);
  }

  function getFreeRam(host) {
    const reserve = host === "home" ? reserveHomeRam : 0;
    return Math.max(0, ns.getServerMaxRam(host) - ns.getServerUsedRam(host) - reserve);
  }

  async function refreshWorkers() {
    for (const { host } of getWorkers()) if (host !== "home") await ns.scp(scripts, host, "home");
  }

  function launchJobs(target, jobs, id) {
    const workers = getWorkers();
    const allocations = [];
    for (const job of jobs) {
      let remaining = job.threads;
      for (const worker of workers) {
        const threads = Math.min(remaining, Math.floor(worker.freeRam / job.ram));
        if (threads <= 0) continue;
        allocations.push({ ...job, target, host: worker.host, threads });
        worker.freeRam -= threads * job.ram;
        remaining -= threads;
        if (remaining <= 0) break;
      }
      if (remaining > 0) return false;
    }

    const pids = [];
    for (const job of allocations) {
      const pid = ns.exec(job.script, job.host, job.threads, job.target, job.delay, id);
      if (pid === 0) {
        for (const launched of pids) ns.kill(launched.pid, launched.host);
        return false;
      }
      pids.push({ pid, host: job.host });
    }
    ns.print(`launched ${id} ${target}: ${allocations.length} jobs`);
    return true;
  }
}
