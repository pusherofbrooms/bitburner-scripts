/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["steal", 0.1],
    ["spacing", 150],
    ["reserve", 32],
    ["batchLimit", 25],
    ["help", false],
  ]);

  const target = flags._[0];
  if (flags.help || !target) {
    ns.tprint("Usage: run fleet-hwgw.js TARGET [--steal 0.1] [--spacing 150] [--reserve 32] [--batchLimit 25]");
    return;
  }

  const hackScript = "batchhack.js";
  const growScript = "batchgrow.js";
  const weakenScript = "batchweaken.js";
  const scripts = [hackScript, growScript, weakenScript];
  const spacing = Number(flags.spacing);
  const reserveHomeRam = Number(flags.reserve);
  const stealFraction = Math.max(0.001, Math.min(0.9, Number(flags.steal)));
  const batchLimit = Number(flags.batchLimit);

  for (const script of scripts) {
    if (!ns.fileExists(script, "home")) {
      ns.tprint(`Missing worker script on home: ${script}`);
      return;
    }
  }

  const hackRam = ns.getScriptRam(hackScript);
  const growRam = ns.getScriptRam(growScript);
  const weakenRam = ns.getScriptRam(weakenScript);
  if (hackRam <= 0 || growRam <= 0 || weakenRam <= 0) {
    ns.tprint("Could not calculate worker script RAM.");
    return;
  }

  ns.disableLog("ALL");
  ns.tprint(`Fleet HWGW targeting ${target}; steal=${ns.format.percent(stealFraction, 1)}, spacing=${spacing}ms`);

  const copiedHosts = new Set();

  let batchId = 0;
  let nextBatchDone = 0;
  while (true) {
    await copyScriptsToWorkers();

    const batchInFlight = Date.now() < nextBatchDone + spacing;
    const security = ns.getServerSecurityLevel(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);
    const money = ns.getServerMoneyAvailable(target);
    const maxMoney = ns.getServerMaxMoney(target);

    if (!batchInFlight && security > minSecurity + 1) {
      await prepWeaken();
      continue;
    }

    if (!batchInFlight && money < maxMoney * 0.95) {
      await prepGrow();
      continue;
    }

    if (security > minSecurity + 2 || money < maxMoney * Math.max(0.75, 1 - stealFraction * 1.5)) {
      ns.print("pausing new batches: target drifted from expected state");
      await ns.sleep(spacing * 4);
      continue;
    }

    const batch = planBatch();
    const launched = launchBatch(batch, batchId++);
    if (!launched) {
      await ns.sleep(1000);
      continue;
    }

    nextBatchDone = Math.max(nextBatchDone, Date.now() + ns.getWeakenTime(target) + spacing * 4);
    await ns.sleep(Math.max(spacing * 4, ns.getWeakenTime(target) / batchLimit));
  }

  function getAllServers(start = "home", visited = new Set()) {
    visited.add(start);
    for (const server of ns.scan(start)) {
      if (!visited.has(server) && server !== "darkweb" && !isHacknetServer(server)) getAllServers(server, visited);
    }
    return [...visited];
  }

  function isHacknetServer(host) {
    return host.startsWith("hacknet-server-");
  }

  function getWorkers() {
    return getAllServers()
      .filter((host) => ns.hasRootAccess(host))
      .filter((host) => ns.getServerMaxRam(host) > 0)
      .map((host) => ({ host, freeRam: getFreeRam(host) }))
      .filter((worker) => worker.freeRam >= Math.min(hackRam, growRam, weakenRam))
      .sort((a, b) => b.freeRam - a.freeRam);
  }

  function getFreeRam(host) {
    const reserve = host === "home" ? reserveHomeRam : 0;
    return Math.max(0, ns.getServerMaxRam(host) - ns.getServerUsedRam(host) - reserve);
  }

  async function copyScriptsToWorkers() {
    for (const { host } of getWorkers()) {
      if (host === "home" || copiedHosts.has(host)) continue;
      if (await ns.scp(scripts, host, "home")) copiedHosts.add(host);
    }
  }

  function planBatch(maxHackThreads = undefined) {
    const hackPercent = ns.hackAnalyze(target);
    if (hackPercent <= 0) return { hackThreads: 1, growThreads: 1, weakenHackThreads: 1, weakenGrowThreads: 1 };

    const hackChance = ns.hackAnalyzeChance(target);
    const effectiveSteal = Math.max(0.005, Math.min(stealFraction, stealFraction * Math.max(0.25, hackChance)));
    const desiredHackThreads = Math.max(1, Math.floor(effectiveSteal / hackPercent));
    const maxThreads = Math.max(1, Math.min(desiredHackThreads, maxHackThreads ?? desiredHackThreads));
    let hackThreads = maxThreads;
    let growThreads = getGrowThreads(hackThreads, hackPercent);
    const maxGrowToHackRatio = 8;

    while (hackThreads > 1 && growThreads > hackThreads * maxGrowToHackRatio) {
      hackThreads--;
      growThreads = getGrowThreads(hackThreads, hackPercent);
    }

    const weakenHackThreads = Math.max(1, Math.ceil(ns.hackAnalyzeSecurity(hackThreads, target) / ns.weakenAnalyze(1)));
    const weakenGrowThreads = Math.max(1, Math.ceil(ns.growthAnalyzeSecurity(growThreads) / ns.weakenAnalyze(1)));
    return { hackThreads, growThreads, weakenHackThreads, weakenGrowThreads };
  }

  function getGrowThreads(hackThreads, hackPercent) {
    const actualSteal = Math.min(0.9, hackThreads * hackPercent);
    const growMultiplier = 1 / Math.max(0.01, 1 - actualSteal);
    return Math.max(1, Math.ceil(ns.growthAnalyze(target, growMultiplier)));
  }

  function launchBatch(batch, id) {
    const weakenTime = ns.getWeakenTime(target);
    const hackDelay = Math.max(0, weakenTime - ns.getHackTime(target));
    const growDelay = Math.max(0, weakenTime - ns.getGrowTime(target) + spacing * 2);
    const weaken1Delay = spacing;
    const weaken2Delay = spacing * 3;

    let currentBatch = batch;
    let jobs = makeBatchJobs(currentBatch);
    while (currentBatch.hackThreads > 1 && !canAllocate(jobs)) {
      currentBatch = planBatch(currentBatch.hackThreads - 1);
      jobs = makeBatchJobs(currentBatch);
    }

    if (!canAllocate(jobs)) {
      ns.print("WARN: not enough fleet RAM for even a 1-thread HWGW batch");
      return false;
    }

    if (currentBatch.hackThreads < batch.hackThreads) {
      ns.print(`scaled batch down: hack ${currentBatch.hackThreads}/${batch.hackThreads}, grow ${currentBatch.growThreads}/${batch.growThreads}`);
    }

    return launchJobs(jobs, id);

    function makeBatchJobs(b) {
      return [
        { script: weakenScript, threads: b.weakenHackThreads, delay: weaken1Delay, ram: weakenRam },
        { script: growScript, threads: b.growThreads, delay: growDelay, ram: growRam },
        { script: weakenScript, threads: b.weakenGrowThreads, delay: weaken2Delay, ram: weakenRam },
        { script: hackScript, threads: b.hackThreads, delay: hackDelay, ram: hackRam },
      ];
    }
  }

  async function prepWeaken() {
    const excessSecurity = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
    const threads = Math.ceil(excessSecurity / ns.weakenAnalyze(1));
    if (!launchJobs([{ script: weakenScript, threads, delay: 0, ram: weakenRam }], `prep-w-${batchId++}`)) {
      await ns.sleep(1000);
      return;
    }
    await ns.sleep(ns.getWeakenTime(target) + spacing);
  }

  async function prepGrow() {
    const money = Math.max(1, ns.getServerMoneyAvailable(target));
    const maxMoney = ns.getServerMaxMoney(target);
    const neededGrowThreads = Math.ceil(ns.growthAnalyze(target, maxMoney / money));
    const weakenPerGrow = ns.growthAnalyzeSecurity(1) / ns.weakenAnalyze(1);
    const totalFreeRam = getWorkers().reduce((sum, worker) => sum + worker.freeRam, 0);
    const ramPerGrowWithWeaken = growRam + weakenRam * weakenPerGrow;
    const maxGrowThreads = Math.max(1, Math.floor(totalFreeRam / ramPerGrowWithWeaken));
    let growThreads = Math.min(neededGrowThreads, maxGrowThreads);
    const growDelay = Math.max(0, ns.getWeakenTime(target) - ns.getGrowTime(target));
    let weakenThreads = Math.ceil(ns.growthAnalyzeSecurity(growThreads) / ns.weakenAnalyze(1));
    let jobs = [
      { script: growScript, threads: growThreads, delay: growDelay, ram: growRam },
      { script: weakenScript, threads: weakenThreads, delay: spacing, ram: weakenRam },
    ];

    while (growThreads > 1 && !canAllocate(jobs)) {
      growThreads--;
      weakenThreads = Math.ceil(ns.growthAnalyzeSecurity(growThreads) / ns.weakenAnalyze(1));
      jobs = [
        { script: growScript, threads: growThreads, delay: growDelay, ram: growRam },
        { script: weakenScript, threads: weakenThreads, delay: spacing, ram: weakenRam },
      ];
    }
    if (!launchJobs(jobs, `prep-g-${batchId++}`)) {
      await ns.sleep(1000);
      return;
    }
    ns.print(`prep grow: launched ${growThreads}/${neededGrowThreads} grow threads`);
    await ns.sleep(ns.getWeakenTime(target) + spacing * 2);
  }

  function canAllocate(jobs) {
    const workers = getWorkers();

    for (const job of jobs) {
      let remaining = job.threads;
      for (const worker of workers) {
        const threads = Math.min(remaining, Math.floor(worker.freeRam / job.ram));
        if (threads <= 0) continue;
        worker.freeRam -= threads * job.ram;
        remaining -= threads;
        if (remaining <= 0) break;
      }
      if (remaining > 0) return false;
    }

    return true;
  }

  function launchJobs(jobs, id) {
    const workers = getWorkers();
    const allocations = [];

    for (const job of jobs) {
      let remaining = job.threads;
      for (const worker of workers) {
        const threads = Math.min(remaining, Math.floor(worker.freeRam / job.ram));
        if (threads <= 0) continue;
        allocations.push({ ...job, host: worker.host, threads });
        worker.freeRam -= threads * job.ram;
        remaining -= threads;
        if (remaining <= 0) break;
      }
      if (remaining > 0) {
        ns.print(`WARN: not enough fleet RAM for ${job.script}; missing ${remaining} threads`);
        return false;
      }
    }

    const pids = [];
    for (const job of allocations) {
      const pid = ns.exec(job.script, job.host, job.threads, target, job.delay, id);
      if (pid === 0) {
        ns.print(`WARN: failed to exec ${job.script} x${job.threads} on ${job.host}; killing partial batch`);
        for (const launched of pids) ns.kill(launched.pid, launched.host);
        return false;
      }
      pids.push({ pid, host: job.host });
    }

    ns.print(`launched ${id}: ${allocations.length} jobs`);
    return true;
  }
}
