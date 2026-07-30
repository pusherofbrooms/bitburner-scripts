const CITIES = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"];
const BOOSTS = ["Hardware", "AI Cores", "Robots", "Real Estate"];

/** Maximize product((1 + .002 * finalAmount) ^ industryFactor) for new purchases,
 * subject to both incremental space and cash. KKT active sets naturally drop materials
 * whose existing holdings are above their constrained optimum. */
export function optimizeBoostMaterials(capacity, industry, materials, budget = Infinity, existing = {}) {
  const zero = () => Object.fromEntries(BOOSTS.map((x) => [x, 0]));
  if (!(capacity > 0) || !(budget > 0)) return zero();
  const factors = { Hardware: industry.hardwareFactor, "AI Cores": industry.aiCoreFactor, Robots: industry.robotFactor, "Real Estate": industry.realEstateFactor };
  const active = BOOSTS.filter((x) => factors[x] > 0 && materials[x]?.size > 0 && materials[x]?.marketPrice > 0);
  if (!active.length) return zero();
  const amounts = (spacePenalty, cashPenalty) => Object.fromEntries(BOOSTS.map((name) => {
    if (!active.includes(name)) return [name, 0];
    const m = materials[name];
    const denominator = spacePenalty * m.size + cashPenalty * m.marketPrice;
    const unconstrained = denominator ? factors[name] / denominator - 500 : Infinity;
    return [name, Math.max(0, unconstrained - Math.max(0, existing[name] || 0))];
  }));
  const total = (xs, field) => active.reduce((sum, name) => sum + xs[name] * materials[name][field], 0);
  // For each cash multiplier, select the space multiplier (possibly zero). Then
  // bisect cash. This solves both KKT equations and handles low-space active sets.
  const forCash = (cashPenalty) => {
    if (total(amounts(0, cashPenalty), "size") <= capacity) return amounts(0, cashPenalty);
    let lo = 0, hi = 1;
    while (total(amounts(hi, cashPenalty), "size") > capacity) hi *= 2;
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (total(amounts(mid, cashPenalty), "size") > capacity) lo = mid; else hi = mid; }
    return amounts(hi, cashPenalty);
  };
  let result = forCash(0);
  if (total(result, "marketPrice") <= budget) return result;
  let lo = 0, hi = 1;
  while (total(forCash(hi), "marketPrice") > budget) hi *= 2;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (total(forCash(mid), "marketPrice") > budget) lo = mid; else hi = mid; }
  return forCash(hi);
}

export function staffingTransition(employeeJobs, researchStage) {
  const desired = researchStage ? { "Research & Development": 4 } : { Operations: 1, Engineer: 1, Business: 1, Management: 1 };
  const assigned = Object.entries(employeeJobs).filter(([job, count]) => job !== "Unassigned" && count > 0);
  const matches = Object.entries(desired).every(([job, count]) => employeeJobs[job] === count) && assigned.length === Object.keys(desired).length;
  if (matches) return "ready";
  if (!researchStage && assigned.length === 1 && employeeJobs["Research & Development"] === 4) return "clear-rd";
  return assigned.length ? "pause" : "assign";
}

export function affordable(funds, reserve, costs) {
  return costs.reduce((n, x) => n + Math.max(0, x), 0) <= Math.max(0, funds - reserve);
}

export function teaCost(constants, numEmployees) {
  return constants.teaCostPerEmployee * numEmployees;
}

/** Give each remaining city an equal claim on currently available funds. Unspent
 * shares remain available and are redistributed when the next city is reached. */
export function cityPurchaseBudget(funds, reserve, citiesRemaining) {
  return Math.max(0, funds - reserve) / Math.max(1, citiesRemaining);
}

export function boostTargetReady(industry, held, desiredAdditions, current) {
  const factors = { Hardware: industry.hardwareFactor, "AI Cores": industry.aiCoreFactor, Robots: industry.robotFactor, "Real Estate": industry.realEstateFactor };
  return BOOSTS.every((name) => factors[name] <= 0 ||
    (held[name] + desiredAdditions[name] > 0 && current[name] + 1e-6 >= held[name] + desiredAdditions[name]));
}

export function roundOneMissing(state, minimumOffer) {
  const missing = [];
  if (state.cityCount !== 6) missing.push("Agriculture is not in all six cities");
  if (!state.allWarehouses) missing.push("a warehouse is missing");
  if (!state.officesSize4) missing.push("an office is not size 4 and fully staffed");
  if (!state.finalJobs) missing.push("final staffing is not 1 Operations/1 Engineer/1 Business/1 Management per city");
  if (!state.officeWellness) missing.push(`an office has energy or morale below ${state.wellnessThreshold}`);
  if (state.research < 55) missing.push(`division research is ${state.research}, below 55`);
  if (!state.smartSupply) missing.push("Smart Supply is not enabled everywhere");
  if (!state.sales) missing.push("Food/Plants sales are not configured");
  if (state.adverts < 2) missing.push(`only ${state.adverts}/2 AdVerts are owned`);
  if (!state.capacityReady) missing.push("warehouse/boost-material capacity target is incomplete");
  if (state.offerRound !== 1) missing.push(`investment offer is round ${state.offerRound}, not round 1`);
  if (state.offerFunds < minimumOffer) missing.push(`offer is ${state.offerFunds}, below minimum ${minimumOffer}`);
  return missing;
}

/** @param {NS} ns */
export async function main(ns) {
  const c = ns.corporation;
  const a = ns.flags([["help", false], ["reserve", 5e9], ["min-offer", 210e9], ["morale", 99], ["warehouse-level", 2], ["smart-storage", 1], ["fill", 0.8]]);
  if (a.help) { ns.tprint("run corp/bootstrap.js [corp=JCorp] [agri=Agri] [chem=Chem] [--reserve 5e9] [--min-offer 210e9] [--morale 99] [--warehouse-level 2] [--smart-storage 1] [--fill .8]"); return; }
  const [corpName = "JCorp", agri = "Agri", chem = "Chem"] = a._.map(String);
  if (![corpName, agri, chem].every((name) => name.trim())) { ns.tprint("ABORT: corporation and division names must not be empty."); return; }
  if (agri === chem) { ns.tprint("ABORT: division names must differ."); return; }
  const fmt = (n) => `$${ns.format.number(n, 3)}`;
  const info = () => c.getCorporation();
  const div = () => c.getDivision(agri);
  const hasDiv = (n) => info().divisions.includes(n);
  if (c.hasCorporation()) {
    if (hasDiv(agri) && c.getDivision(agri).industry !== "Agriculture") { ns.tprint(`${agri} is not Agriculture.`); return; }
    if (hasDiv(chem) && c.getDivision(chem).industry !== "Chemical") { ns.tprint(`${chem} is not Chemical.`); return; }
  }
  const spend = (label, cost, fn) => {
    if (!affordable(info().funds, Number(a.reserve), [cost])) { ns.tprint(`PAUSED: ${label} costs ${fmt(cost)}; preserving reserve ${fmt(Number(a.reserve))}.`); return false; }
    try { fn(); return true; } catch (e) { ns.tprint(`PAUSED: ${label} failed: ${String(e)}`); return false; }
  };

  if (!c.hasCorporation()) {
    ns.tprint("Startup budget: self-funding takes $150b PLAYER cash and supplies only $150b CORPORATE funds; Office/Warehouse unlock purchases do not fit the documented round-1 plan.");
    if (c.canCreateCorporation(true) !== "Success") { ns.tprint(`Cannot self-fund corporation: ${c.canCreateCorporation(true)}`); return; }
    if (!await ns.prompt(`Create ${corpName} with $150b player cash?`, { type: "boolean" })) return;
    if (!c.createCorporation(corpName, true)) { ns.tprint("Corporation creation failed."); return; }
  }

  // This check deliberately precedes every round-1 division/city purchase: no partial bootstrap.
  const missingApis = ["Office API", "Warehouse API"].filter((x) => !c.hasUnlock(x));
  if (missingApis.length) {
    ns.tprint("STOP: required API unlocks are absent; no round-1 setup was attempted after this check.");
    for (const x of missingApis) ns.tprint(`MISSING: ${x} — ${fmt(c.getUnlockCost(x))}`);
    ns.tprint(
      "Buying these from the $150b startup balance breaks the round-1 budget. Complete round 1 manually in the Corporation UI:\n" +
      " • Expand Agriculture to all six cities and ensure each city has a warehouse.\n" +
      " • Upgrade every office to size 4, hire four employees, and assign all four to R&D until Agriculture has at least 55 RP.\n" +
      " • Then assign 1 Operations, 1 Engineer, 1 Business, and 1 Management employee per city.\n" +
      ` • Buy tea and hold parties until every office has at least ${Number(a.morale)} energy and morale.\n` +
      " • Enable Smart Supply everywhere and sell Food and Plants using MAX at MP.\n" +
      ` • Reach ${Number(a["smart-storage"])} Smart Storage level(s), warehouse level ${Number(a["warehouse-level"])} in every city, and buy two Agriculture AdVerts.\n` +
      " • Fill warehouse boost-material space, especially Real Estate, while retaining room for inputs and outputs.\n" +
      ` • Verify the round-1 offer is at least ${fmt(Number(a["min-offer"]))}, then accept it manually.\n` +
      "See in-game documentation: Corporation > General Advice > Round 1, plus the Office, Warehouse, and Boost Material sections. This script cannot verify or accept the offer without both APIs.",
    );
    return;
  }
  if (!hasDiv(agri) && !spend("Agriculture", c.getIndustryData("Agriculture").startingCost, () => c.expandIndustry("Agriculture", agri))) return;
  for (const city of CITIES) if (!div().cities.includes(city) && !spend(`expand ${city}`, c.getConstants().officeInitialCost, () => c.expandCity(agri, city))) return;
  for (const city of CITIES) if (!c.hasWarehouse(agri, city) && !spend(`warehouse ${city}`, c.getConstants().warehouseInitialCost, () => c.purchaseWarehouse(agri, city))) return;

  // Offices size four, then all-R&D until 55 RP. Preserve surprising nonempty assignments by pausing.
  const researchStage = div().researchPoints < 55;
  for (const city of CITIES) {
    let o = c.getOffice(agri, city);
    if (o.size < 4 && !spend(`office size 4 ${city}`, c.getOfficeSizeUpgradeCost(agri, city, 4 - o.size), () => c.upgradeOfficeSize(agri, city, 4 - o.size))) return;
    while ((o = c.getOffice(agri, city)).numEmployees < 4) if (!c.hireEmployee(agri, city)) { ns.tprint(`Could not hire in ${city}.`); return; }
    const desired = researchStage ? { "Research & Development": 4 } : { Operations: 1, Engineer: 1, Business: 1, Management: 1 };
    const assigned = Object.entries(o.employeeJobs).filter(([k, v]) => k !== "Unassigned" && v > 0);
    const transition = staffingTransition(o.employeeJobs, researchStage);
    if (transition === "pause") { ns.tprint(`PAUSED: ${agri}/${city} has existing assignments (${assigned.map(([k,v]) => `${k}=${v}`).join(", ")}); not overwriting surprising staffing. Set ${researchStage ? "4 R&D" : "1 Ops/1 Engineer/1 Business/1 Management"} or clear assignments, then rerun.`); return; }
    if (transition !== "ready") {
      if (transition === "clear-rd" && !c.setJobAssignment(agri, city, "Research & Development", 0)) { ns.tprint(`Could not clear R&D in ${city}.`); return; }
      for (const [job, n] of Object.entries(desired)) if (!c.setJobAssignment(agri, city, job, n)) { ns.tprint(`Could not assign ${job} in ${city}.`); return; }
    }
    o = c.getOffice(agri, city);
    if (o.avgEnergy < Number(a.morale)) {
      const cost = teaCost(c.getConstants(), o.numEmployees);
      if (!spend(`tea ${city}`, cost, () => c.buyTea(agri, city))) return;
    }
    o = c.getOffice(agri, city);
    if (o.avgMorale < Number(a.morale) && !spend(`party ${city}`, 500000 * o.numEmployees, () => c.throwParty(agri, city, 500000))) return;
    // Both actions are queued until the next corporation cycle, so gate on a fresh office reading below.
    o = c.getOffice(agri, city);
  }
  if (researchStage) { ns.tprint(`R&D stage active: ${ns.format.number(div().researchPoints, 2)}/55 RP. Employees are assigned to R&D; wait and rerun for final staffing.`); return; }

  if (!c.hasUnlock("Smart Supply") && !spend("Smart Supply", c.getUnlockCost("Smart Supply"), () => c.purchaseUnlock("Smart Supply"))) return;
  for (const city of CITIES) { c.setSmartSupply(agri, city, true); c.sellMaterial(agri, city, "Food", "MAX", "MP"); c.sellMaterial(agri, city, "Plants", "MAX", "MP"); }
  while (div().numAdVerts < 2) if (!spend("AdVert", c.getHireAdVertCost(agri), () => c.hireAdVert(agri))) return;
  while (c.getUpgradeLevel("Smart Storage") < Number(a["smart-storage"])) if (!spend("Smart Storage", c.getUpgradeLevelCost("Smart Storage"), () => c.levelUpgrade("Smart Storage"))) return;
  for (const city of CITIES) while (c.getWarehouse(agri, city).level < Number(a["warehouse-level"])) if (!spend(`warehouse upgrade ${city}`, c.getUpgradeWarehouseCost(agri, city), () => c.upgradeWarehouse(agri, city))) return;

  const industry = c.getIndustryData("Agriculture");
  const materialData = Object.fromEntries(BOOSTS.map((x) => [x, c.getMaterialData(x)]));
  const boostReady = {};
  for (const [cityIndex, city] of CITIES.entries()) {
    const w = c.getWarehouse(agri, city);
    const held = Object.fromEntries(BOOSTS.map((name) => [name, c.getMaterial(agri, city, name).stored]));
    const live = Object.fromEntries(BOOSTS.map((name) => [name, { ...materialData[name], marketPrice: c.getMaterial(agri, city, name).marketPrice }]));
    const freeForBoosts = Math.max(0, w.size * Math.min(1, Number(a.fill)) - w.sizeUsed);
    // Readiness is the space-constrained target, never the amount today's cash can buy.
    const desiredAdditions = optimizeBoostMaterials(freeForBoosts, industry, live, Infinity, held);
    let cityBudget = cityPurchaseBudget(info().funds, Number(a.reserve), CITIES.length - cityIndex);
    const additions = optimizeBoostMaterials(freeForBoosts, industry, live, cityBudget, held);
    for (const name of BOOSTS) {
      // Refresh price and funds immediately before every purchase while retaining this city's fair share.
      const price = c.getMaterial(agri, city, name).marketPrice;
      const affordableAmount = Math.min(additions[name], cityBudget / price, Math.max(0, info().funds - Number(a.reserve)) / price);
      if (affordableAmount > 1e-6 && !spend(`${name} in ${city}`, affordableAmount * price, () => c.bulkPurchase(agri, city, name, affordableAmount))) return;
      cityBudget -= affordableAmount * price;
    }
    const current = Object.fromEntries(BOOSTS.map((name) => [name, c.getMaterial(agri, city, name).stored]));
    boostReady[city] = boostTargetReady(industry, held, desiredAdditions, current);
  }

  const offer = info().public ? { round: 0, funds: 0 } : c.getInvestmentOffer();
  const readState = (currentOffer) => ({
    cityCount: div().cities.length, allWarehouses: CITIES.every((x) => c.hasWarehouse(agri, x)),
    officesSize4: CITIES.every((x) => { const o=c.getOffice(agri,x); return o.size >= 4 && o.numEmployees >= 4; }),
    finalJobs: CITIES.every((x) => { const j=c.getOffice(agri,x).employeeJobs; return j.Operations===1&&j.Engineer===1&&j.Business===1&&j.Management===1; }),
    officeWellness: CITIES.every((x) => { const o=c.getOffice(agri,x); return o.avgEnergy >= Number(a.morale) && o.avgMorale >= Number(a.morale); }),
    wellnessThreshold: Number(a.morale), research: div().researchPoints, smartSupply: CITIES.every((x) => c.getWarehouse(agri,x).smartSupplyEnabled),
    sales: CITIES.every((x) => ["Food", "Plants"].every((m) => { const material = c.getMaterial(agri, x, m); return material.desiredSellAmount === "MAX" && material.desiredSellPrice === "MP"; })),
    adverts: div().numAdVerts, capacityReady: CITIES.every((x) => c.getWarehouse(agri,x).level >= Number(a["warehouse-level"]) && boostReady[x]), offerRound: currentOffer.round, offerFunds: currentOffer.funds,
  });
  const state = readState(offer);
  const roundOneAlreadyPast = info().public || offer.round > 1 || hasDiv(chem);
  if (!roundOneAlreadyPast) {
    const missing = roundOneMissing(state, Number(a["min-offer"]));
    if (missing.length) { ns.tprint("STOP: round-1 offer prerequisites are not satisfied:"); missing.forEach((x) => ns.tprint(` • ${x}`)); return; }
    if (!await ns.prompt(`Accept round-1 offer ${fmt(offer.funds)} (minimum ${fmt(Number(a["min-offer"]))})?`, {type:"boolean"})) return;
    const fresh = c.getInvestmentOffer();
    const changed = roundOneMissing(readState(fresh), Number(a["min-offer"]));
    if (changed.length) { ns.tprint("Offer changed; not accepted:\n" + changed.map((x) => ` • ${x}`).join("\n")); return; }
    if (!c.acceptInvestmentOffer()) { ns.tprint("Offer changed; not accepted."); return; }
  } else ns.tprint("Investment round 1 is already past; no later offer will be accepted automatically.");

  if (!hasDiv(chem)) {
    const cost = c.getIndustryData("Chemical").startingCost;
    if (!spend("Chemical division", cost, () => c.expandIndustry("Chemical", chem))) return;
  }
  ns.tprint("Round 1 complete and Chemical created. Rerun-safe bootstrap finished.");
}
