/** @param {NS} ns */
export async function main(ns) {
  // batch hack script. HWGW
  // args:
  // target: string
  const target = ns.args[0];
  
  // script locations
  const hackScript = "batchhack.js";
  const weakenScript = "batchweaken.js";
  const growScript = "batchgrow.js";

  // spacing between threads in milliseconds
  const SPACING = 50;

  // RAM we'd like to reserve on home in GB
  const RESERVE_RAM = 32;

  const moneyTarget = ns.getServerMaxMoney(target) * 0.85;
  const runServer = ns.getHostname();
  const cores = ns.getServer(runServer).cpuCores;

  // timings function
  function getTime(){
    const hackTime = ns.getHackTime(target);
    const growTime = ns.getGrowTime(target);
    const weakenTime = ns.getWeakenTime(target);
    return { hackTime, growTime, weakenTime};
  }
  // threads function
  // calculate the number of hack grow and weaken threads needed.
  // hack first, then grow because it depends on hack, then weaken
  // which relies on both.
  function getThreads(){
    const currentMoney = ns.getServerMoneyAvailable(target);
    const maxMoney = ns.getServerMaxMoney(target);
    const currentSecurity = ns.getServerSecurityLevel(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);

    let heistMoney = currentMoney - moneyTarget;
    if (heistMoney < 0){
      heistMoney = 0
    }

    let hackThreads = 0;
    if (heistMoney > 0) {
      hackThreads = Math.ceil(ns.hackAnalyzeThreads(target, heistMoney));
    }
    // growth scale is the number by which we want to multiply
    // the currentMoney - heistMoney to get to MaxMoney
    let growthScale = maxMoney / (currentMoney - heistMoney);
    if (! isFinite(growthScale)){
      growthScale=2
    }
    const growThreads = Math.ceil(ns.growthAnalyze(target, growthScale, cores));

    // weaken threads rely on current security, raise from hacking
    // and raise from growth.
    const baseWeaken = ns.weakenAnalyze(1, cores);
    const baseSecurity = currentSecurity - minSecurity;
    const hackSecurity = ns.hackAnalyzeSecurity(hackThreads, target);
    const growSecurity = ns.growthAnalyzeSecurity(growThreads, target, cores);
    // for hack, we want to add up current security less min security with 
    // increase from hacking since hack comes first.
    const weakenHackThreads = Math.ceil((baseSecurity + hackSecurity) / baseWeaken);
    // growth is easy. Mitigate grow security.
    const weakenGrowThreads = Math.ceil(growSecurity / baseWeaken);
    return { hackThreads, growThreads, weakenHackThreads, weakenGrowThreads };
  }

  // run batch function
  async function runBatch(){
    const { hackTime, growTime, weakenTime} = getTime();
    const { hackThreads, growThreads, weakenHackThreads, weakenGrowThreads} = getThreads();
    
    // Do we have enough ram?
    let serverRam = ns.getServerMaxRam(runServer) - ns.getServerUsedRam(runServer);
    if (runServer === "home") serverRam = serverRam - RESERVE_RAM;
    const hackScriptRam = ns.getScriptRam(hackScript);
    const growScriptRam = ns.getScriptRam(growScript);
    const weakenScriptRam = ns.getScriptRam(weakenScript);
    const neededRam = hackScriptRam * hackThreads +
                      growScriptRam * growThreads +
                      weakenScriptRam * (weakenHackThreads + weakenGrowThreads);
    if (serverRam < neededRam){
      ns.print(`WARN: not enough memory. Needed: ${neededRam}, Available: ${serverRam}`);
      await ns.sleep(500);
      return;
    }
    // setup timings.
    const weakenDelay1 = 0;
    const hackDelay = weakenTime - hackTime - SPACING;
    const growDelay = weakenTime - growTime + SPACING;
    const weakenDelay2 = SPACING * 2;

    if (weakenHackThreads > 0) ns.exec(weakenScript, runServer, weakenHackThreads, target, weakenDelay1);
    if (hackThreads > 0) ns.exec(hackScript, runServer, hackThreads, target, hackDelay);
    if (growThreads > 0) ns.exec(growScript, runServer, growThreads, target, growDelay);
    if (weakenGrowThreads > 0) ns.exec(weakenScript, runServer, weakenGrowThreads, target, weakenDelay2);

    await ns.sleep(weakenTime + SPACING * 3);
  }

  // main loop
  while(true){
    try{
      await runBatch();
    } catch(err) {
      ns.print(`Error: ${err}`);
      await ns.sleep(100);
    }
  }
}