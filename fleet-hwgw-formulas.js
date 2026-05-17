/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["steal", 0.1],
    ["spacing", 200],
    ["reserve", 32],
    ["batchLimit", 0],
    ["targetLimit", 8],
    ["refreshTargets", 60000],
    ["minMoney", 0.995],
    ["maxSec", 0.05],
    ["skillCap", 1],
    ["all", false],
    ["hacknet", false],
    ["help", false],
  ]);

  if (flags.help || (!flags.all && flags._.length === 0)) {
    ns.tprint("Usage: run fleet-hwgw-formulas.js TARGET... [--all] [--hacknet] [--targetLimit 8] [--refreshTargets 60000] [--skillCap 1] [--steal 0.1] [--spacing 200] [--reserve 32] [--batchLimit 0] [--minMoney 0.995] [--maxSec 0.05]\n  --hacknet allows hacknet servers to be used as workers\n  --skillCap limits --all targets to required hacking <= hacking level * skillCap\n  --batchLimit 0 auto-scales from usable RAM and planned batch size\n  --minMoney/--maxSec control how fully prepped a target must be before launching batches");
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
  const configuredBatchLimit = Math.max(0, Math.floor(Number(flags.batchLimit)));
  const targetLimit = Math.max(1, Math.floor(Number(flags.targetLimit)));
  const targetRefreshMs = Math.max(5000, Number(flags.refreshTargets));
  const minMoneyRatio = Math.max(0.5, Math.min(1, Number(flags.minMoney)));
  const maxSecDrift = Math.max(0, Number(flags.maxSec));
  const skillCap = Math.max(0, Number(flags.skillCap));
  const hackRam = ns.getScriptRam(hackScript);
  const growRam = ns.getScriptRam(growScript);
  const weakenRam = ns.getScriptRam(weakenScript);

  ns.disableLog("ALL");

  let targets = flags.all ? chooseTargets() : flags._.map(String);
  targets = targets.filter((t) => !isHacknetServer(t) && ns.serverExists(t) && ns.hasRootAccess(t) && ns.getServerMaxMoney(t) > 0);
  if (targets.length === 0) {
    ns.tprint("No valid rooted money targets.");
    return;
  }

  ns.tprint(`Formula fleet HWGW: ${targets.join(", ")}; steal=${ns.format.percent(stealFraction, 1)}, spacing=${spacing}ms, batchLimit=${configuredBatchLimit || "auto"}, targetLimit=${targetLimit}, skillCap=${skillCap}, hacknet=${flags.hacknet}`);

  const copiedHosts = new Set();
  let batchId = 0;
  const targetState = new Map(targets.map((target) => [target, newTargetState()]));
  let nextTargetRefresh = Date.now() + targetRefreshMs;

  while (true) {
    await refreshWorkers();
    if (flags.all && Date.now() >= nextTargetRefresh) {
      targets = chooseTargets();
      for (const target of targets) if (!targetState.has(target)) targetState.set(target, newTargetState());
      const activeTargets = new Set(targets);
      for (const [target, state] of targetState) {
        state.doneTimes = state.doneTimes.filter((time) => time > Date.now());
        if (!activeTargets.has(target) && state.doneTimes.length === 0 && state.prepDoneTime <= Date.now()) targetState.delete(target);
      }
      nextTargetRefresh = Date.now() + targetRefreshMs;
      ns.print(`refreshed targets: ${targets.join(", ")}`);
    } else {
      targets = targets.filter((t) => !isHacknetServer(t) && ns.hasRootAccess(t) && ns.getServerMaxMoney(t) > 0);
    }

    let launchedAny = false;
    for (const target of targets.sort((a, b) => scoreTarget(b) - scoreTarget(a))) {
      const state = targetState.get(target) ?? newTargetState();
      targetState.set(target, state);
      const now = Date.now();
      state.doneTimes = state.doneTimes.filter((time) => time > now);
      if (now < state.nextLaunch) continue;

      if (!isReady(target)) {
        // A healthy HWGW pipeline makes the live server briefly look "unready"
        // between hack->grow and hack/grow->weaken completions. Do not launch
        // prep into those transient dips; wait for the pipeline to drain first.
        if (state.doneTimes.length > 0) {
          state.nextLaunch = Date.now() + spacing;
          continue;
        }
        if (now < state.prepDoneTime) continue;
        const prepDoneTime = estimatePrepDoneTime(target);
        if (launchPrep(target, `prep-${batchId++}`)) {
          launchedAny = true;
          state.prepDoneTime = prepDoneTime;
        }
        state.nextLaunch = Date.now() + spacing * 4;
        continue;
      }
      state.prepDoneTime = 0;

      const batch = planBatch(target);
      if (!batch) continue;
      const batchLimit = getBatchLimit(batch);
      while (totalInFlight() < batchLimit && state.doneTimes.length < maxBatchesForTarget(batch)) {
        const batchOffset = state.doneTimes.length * spacing * 4;
        const doneTime = Date.now() + batchOffset + batch.weakenTime + spacing * 4;
        if (!launchBatch(target, batch, batchId++, batchOffset)) break;
        launchedAny = true;
        state.doneTimes.push(doneTime);
      }
      state.nextLaunch = Date.now() + (launchedAny ? spacing : spacing * 4);
    }

    await ns.sleep(launchedAny ? spacing : 500);
  }

  function newTargetState() {
    return { doneTimes: [], nextLaunch: 0, prepDoneTime: 0 };
  }

  function chooseTargets() {
    return getAllServers()
      .filter((host) => !isHacknetServer(host))
      .filter((host) => ns.hasRootAccess(host))
      .filter((host) => ns.getServerMaxMoney(host) > 0)
      .filter((host) => ns.getServerRequiredHackingLevel(host) <= ns.getHackingLevel() * skillCap)
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
    const growThreads = Math.max(1, Math.ceil(ns.formulas.hacking.growThreads(afterHack, player, server.moneyMax, bestWorkerCores())));
    const hackSecurity = ns.hackAnalyzeSecurity(hackThreads);
    // Do not pass host here: growthAnalyzeSecurity(threads, host) caps the security
    // estimate to the target's *current* growth need. In an HWGW batch the grow
    // runs after a future hack, so using the live host underestimates grow sec.
    const growSecurity = ns.growthAnalyzeSecurity(growThreads);
    const weakenHackThreads = Math.max(1, Math.ceil(hackSecurity / bestWeakenEffect()));
    const weakenGrowThreads = Math.max(1, Math.ceil(growSecurity / bestWeakenEffect()));

    const batchRam = hackThreads * hackRam + growThreads * growRam + (weakenHackThreads + weakenGrowThreads) * weakenRam;
    return { hackThreads, growThreads, weakenHackThreads, weakenGrowThreads, hackSecurity, growSecurity, afterHackMoney: afterHack.moneyAvailable, actualSteal, batchRam, weakenTime: ns.formulas.hacking.weakenTime(server, player) };
  }

  function launchBatch(target, batch, id, offset = 0) {
    const server = minServer(target);
    const player = ns.getPlayer();
    const weakenTime = ns.formulas.hacking.weakenTime(server, player);
    const hackTime = ns.formulas.hacking.hackTime(server, player);
    const growTime = ns.formulas.hacking.growTime(server, player);
    const batchStart = Date.now() + offset;
    const jobs = [
      { script: hackScript, threads: batch.hackThreads, endTime: batchStart + weakenTime, duration: hackTime, ram: hackRam },
      { script: weakenScript, threads: batch.weakenHackThreads, weakenSecurity: batch.hackSecurity, endTime: batchStart + weakenTime + spacing, duration: weakenTime, ram: weakenRam },
      { script: growScript, threads: batch.growThreads, growFromMoney: batch.afterHackMoney, growToMoney: server.moneyMax, endTime: batchStart + weakenTime + spacing * 2, duration: growTime, ram: growRam },
      { script: weakenScript, threads: batch.weakenGrowThreads, weakenSecurityFromLastGrow: true, endTime: batchStart + weakenTime + spacing * 3, duration: weakenTime, ram: weakenRam },
    ];
    return launchJobs(target, jobs, id);
  }

  function estimatePrepDoneTime(target) {
    const server = ns.getServer(target);
    const prepTime = server.hackDifficulty > server.minDifficulty + maxSecDrift
      ? ns.getWeakenTime(target)
      : ns.getWeakenTime(target) + spacing;
    return Date.now() + prepTime + spacing;
  }

  function launchPrep(target, id) {
    const server = ns.getServer(target);
    if (server.hackDifficulty > server.minDifficulty + maxSecDrift) {
      const weakenSecurity = server.hackDifficulty - server.minDifficulty;
      const threads = Math.ceil(weakenSecurity / bestWeakenEffect());
      return launchJobs(target, [{ script: weakenScript, threads, weakenSecurity, delay: 0, ram: weakenRam }], id);
    }
    const growServer = { ...server, moneyAvailable: Math.max(1, server.moneyAvailable) };
    const growThreads = Math.ceil(ns.formulas.hacking.growThreads(growServer, ns.getPlayer(), server.moneyMax, bestWorkerCores()));
    const growSecurity = ns.growthAnalyzeSecurity(growThreads);
    const weakenThreads = Math.ceil(growSecurity / bestWeakenEffect());
    const growDelay = Math.max(0, ns.getWeakenTime(target) - ns.getGrowTime(target));
    return launchJobs(target, [
      { script: growScript, threads: growThreads, growFromMoney: growServer.moneyAvailable, growToMoney: server.moneyMax, delay: growDelay, ram: growRam },
      { script: weakenScript, threads: weakenThreads, weakenSecurityFromLastGrow: true, delay: spacing, ram: weakenRam },
    ], id);
  }

  function totalInFlight() {
    const now = Date.now();
    return [...targetState.values()].reduce((sum, state) => sum + state.doneTimes.filter((time) => time > now).length, 0);
  }

  function getBatchLimit(sampleBatch) {
    if (configuredBatchLimit > 0) return configuredBatchLimit;
    const usableRam = getWorkers().reduce((sum, worker) => sum + worker.freeRam, 0);
    const ramLimited = Math.floor(usableRam / Math.max(1, sampleBatch.batchRam));
    return Math.max(1, totalInFlight() + ramLimited);
  }

  function maxBatchesForTarget(batch) {
    return Math.max(1, Math.floor(batch.weakenTime / (spacing * 4)));
  }

  function getAllServers(start = "home", visited = new Set()) {
    visited.add(start);
    for (const server of ns.scan(start)) {
      if (!visited.has(server) && (flags.hacknet || !isHacknetServer(server))) getAllServers(server, visited);
    }
    return [...visited];
  }

  function isHacknetServer(host) {
    return host.startsWith("hacknet-server-");
  }

  function getWorkers() {
    return getAllServers()
      .filter((host) => (flags.hacknet || !isHacknetServer(host)) && ns.hasRootAccess(host) && ns.getServerMaxRam(host) > 0)
      .map((host) => ({ host, freeRam: getFreeRam(host), cores: getCores(host) }))
      .filter((worker) => worker.freeRam >= Math.min(hackRam, growRam, weakenRam))
      .sort((a, b) => b.freeRam - a.freeRam);
  }

  function getFreeRam(host) {
    const reserve = host === "home" ? reserveHomeRam : 0;
    return Math.max(0, ns.getServerMaxRam(host) - ns.getServerUsedRam(host) - reserve);
  }

  function getCores(host) {
    return Math.max(1, ns.getServer(host).cpuCores ?? 1);
  }

  function bestWorkerCores() {
    return Math.max(1, ...getWorkers().map((worker) => worker.cores));
  }

  function bestWeakenEffect() {
    return ns.formulas.hacking.weakenEffect(1, bestWorkerCores());
  }

  async function refreshWorkers() {
    for (const { host } of getWorkers()) {
      if (host === "home" || copiedHosts.has(host)) continue;
      if (await ns.scp(scripts, host, "home")) copiedHosts.add(host);
    }
  }

  function launchJobs(target, jobs, id) {
    const workers = getWorkers();
    const allocations = [];
    let lastGrowSecurity = 0;
    for (const job of jobs) {
      if (job.weakenSecurityFromLastGrow) {
        if (!allocateWeaken({ ...job, weakenSecurity: lastGrowSecurity }, target, workers, allocations)) return false;
      } else if (job.weakenSecurity !== undefined) {
        if (!allocateWeaken(job, target, workers, allocations)) return false;
      } else if (job.growToMoney !== undefined) {
        const result = allocateGrow(job, target, workers, allocations);
        if (!result.ok) return false;
        lastGrowSecurity = result.security;
      } else if (!allocateThreads(job, target, workers, allocations)) {
        return false;
      }
    }

    const pids = [];
    for (const job of allocations) {
      const delay = getDelay(job);
      const pid = ns.exec(job.script, job.host, job.threads, job.target, delay, id);
      if (pid === 0) {
        for (const launched of pids) ns.kill(launched.pid, launched.host);
        return false;
      }
      pids.push({ pid, host: job.host });
    }
    ns.print(`launched ${id} ${target}: ${allocations.length} jobs`);
    return true;
  }

  function allocateThreads(job, target, workers, allocations) {
    let remaining = job.threads;
    for (const worker of workers) {
      const threads = Math.min(remaining, Math.floor(worker.freeRam / job.ram));
      if (threads <= 0) continue;
      allocations.push({ ...job, target, host: worker.host, threads });
      worker.freeRam -= threads * job.ram;
      remaining -= threads;
      if (remaining <= 0) break;
    }
    return remaining <= 0;
  }

  function allocateWeaken(job, target, workers, allocations) {
    let remainingSecurity = job.weakenSecurity;
    if (remainingSecurity <= 0) return true;
    for (const worker of workers) {
      const maxThreads = Math.floor(worker.freeRam / job.ram);
      if (maxThreads <= 0) continue;
      const threads = Math.min(maxThreads, Math.ceil(remainingSecurity / ns.formulas.hacking.weakenEffect(1, worker.cores)));
      if (threads <= 0) continue;
      allocations.push({ ...job, target, host: worker.host, threads });
      worker.freeRam -= threads * job.ram;
      remainingSecurity -= ns.formulas.hacking.weakenEffect(threads, worker.cores);
      if (remainingSecurity <= 0) return true;
    }
    return false;
  }

  function allocateGrow(job, target, workers, allocations) {
    let moneyAvailable = Math.max(1, job.growFromMoney);
    let security = 0;
    const player = ns.getPlayer();
    for (const worker of workers) {
      const maxThreads = Math.floor(worker.freeRam / job.ram);
      if (maxThreads <= 0) continue;
      const growServer = minServer(target);
      growServer.moneyAvailable = moneyAvailable;
      const needed = Math.ceil(ns.formulas.hacking.growThreads(growServer, player, job.growToMoney, worker.cores));
      const threads = Math.min(maxThreads, needed);
      if (threads <= 0) continue;
      allocations.push({ ...job, target, host: worker.host, threads });
      worker.freeRam -= threads * job.ram;
      security += ns.growthAnalyzeSecurity(threads);
      moneyAvailable = Math.min(job.growToMoney, moneyAvailable * ns.formulas.hacking.growPercent(growServer, threads, player, worker.cores));
      if (moneyAvailable >= job.growToMoney) return { ok: true, security };
    }
    return { ok: false, security };
  }

  function getDelay(job) {
    if (job.endTime === undefined || job.duration === undefined) return job.delay ?? 0;
    const delay = Math.max(0, job.endTime - Date.now() - job.duration);
    const lateBy = Date.now() + delay + job.duration - job.endTime;
    if (lateBy > spacing) ns.print(`WARN: ${job.script} ${job.target} launch is ${ns.format.number(lateBy, 1)}ms late`);
    return delay;
  }
}
