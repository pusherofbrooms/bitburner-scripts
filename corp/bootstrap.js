/**
 * Safe, self-funded Agriculture -> Chemical corporation bootstrap (Bitburner v3).
 * Usage: run corp/bootstrap.js [corporation-name] [agriculture-name] [chemical-name]
 * A new corporation costs $150b of PLAYER money and starts with $150b of CORPORATE funds.
 * Existing corporations are never renamed or replaced.
 * @param {NS} ns
 */
export async function main(ns) {
  const c = ns.corporation;
  const args = ns.flags([["help", false], ["manual", false]]);
  if (args.help) {
    ns.tprint("Usage: run corp/bootstrap.js [corp=JCorp] [agriculture=Agri] [chemical=Chem] [--manual]\n" +
      "Creates a self-funded corporation and prepares Agriculture before optionally accepting investment round 1. " +
      "Office API and Warehouse API are auto-granted by SF3.3; otherwise this script will not buy them from startup funds. " +
      "Use --manual to confirm the equivalent UI setup explicitly.");
    return;
  }
  const [corpName = "JCorp", agri = "Agri", chem = "Chem"] = args._.map(String);
  const cities = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"];
  ns.disableLog("sleep");
  const fmt = (n) => `$${ns.format.number(n, 3)}`;
  const info = () => c.getCorporation();
  const division = (name) => c.getDivision(name);
  const hasDivision = (name) => info().divisions.includes(name);

  async function proceed(message) {
    ns.tprint(message);
    const answer = await ns.prompt(`${message}\n\nContinue? Cancel/No exits safely; rerun later to resume.`, { type: "boolean" });
    if (!answer) ns.tprint("Cancelled. No later steps or purchases were performed.");
    return answer;
  }
  function enough(label, cost) {
    const available = info().funds;
    if (available >= cost) return true;
    ns.tprint(`PAUSED: ${label} costs ${fmt(cost)} but the corporation has ${fmt(available)}. Let it earn money or accept the appropriate investment, then rerun.`);
    return false;
  }
  function safe(label, action) {
    try { action(); return true; }
    catch (e) { ns.tprint(`PAUSED: ${label} failed: ${String(e)}\nState may have changed. Inspect the Corporation UI and rerun.`); return false; }
  }
  function validate(name, expected) {
    if (!name.trim()) { ns.tprint(`ABORT: the ${expected} division name cannot be empty.`); return false; }
    if (!hasDivision(name)) return true;
    const actual = division(name).industry;
    if (actual !== expected) {
      ns.tprint(`ABORT: existing division “${name}” is ${actual}, not ${expected}. Choose another division name; nothing will be overwritten.`);
      return false;
    }
    return true;
  }
  function expandIndustry(type, name) {
    if (hasDivision(name)) return true;
    const cost = c.getIndustryData(type).startingCost;
    if (!enough(`${type} division “${name}”`, cost)) return false;
    if (!safe(`creating ${type} division “${name}”`, () => c.expandIndustry(type, name))) return false;
    ns.tprint(`Created ${type} division “${name}” for ${fmt(cost)}.`);
    return true;
  }
  function expandCities(name) {
    for (const city of cities) {
      if (division(name).cities.includes(city)) continue;
      // In v3 city expansion creates its initial office; this is the documented replacement for removed getExpandCityCost.
      const cost = c.getConstants().officeInitialCost;
      if (!enough(`expanding ${name} to ${city}`, cost)) return false;
      if (!safe(`expanding ${name} to ${city}`, () => c.expandCity(name, city))) return false;
      ns.tprint(`Expanded ${name} to ${city} for ${fmt(cost)}.`);
    }
    return true;
  }
  function prepareWarehouses(name) {
    for (const city of division(name).cities) {
      if (!c.hasWarehouse(name, city)) {
        const cost = c.getConstants().warehouseInitialCost;
        if (!enough(`warehouse for ${name}/${city}`, cost)) return false;
        if (!safe(`purchasing warehouse for ${name}/${city}`, () => c.purchaseWarehouse(name, city))) return false;
        ns.tprint(`Purchased ${name}/${city} warehouse for ${fmt(cost)}.`);
      }
    }
    return true;
  }
  function staffInitialOffices(name) {
    for (const city of division(name).cities) {
      let office = c.getOffice(name, city);
      if (office.numEmployees > 0) {
        const jobs = office.employeeJobs;
        const ready = office.numEmployees === office.size && jobs.Operations > 0 && jobs.Engineer > 0 && jobs.Business > 0;
        if (!ready) {
          ns.tprint(`PAUSED: ${name}/${city} has existing partial or non-production staffing (${office.numEmployees}/${office.size}). Fill all seats and assign at least one Operations, Engineer, and Business employee in the UI, then rerun; existing assignments were not overwritten.`);
          return false;
        }
        ns.tprint(`${name}/${city}: preserving existing full staffing and production assignments.`);
        continue;
      }
      while (office.numEmployees < office.size) {
        if (!c.hireEmployee(name, city)) {
          ns.tprint(`PAUSED: could not fill all seats in ${name}/${city}.`);
          return false;
        }
        office = c.getOffice(name, city);
      }
      // Fill existing seats only: balanced production/sales, with extra seats shared between Management and R&D.
      const size = office.numEmployees;
      const jobs = ["Operations", "Engineer", "Business", "Management", "Research & Development"];
      const counts = jobs.map(() => 0);
      for (let i = 0; i < size; i++) counts[i < 3 ? i : 3 + ((i - 3) % 2)]++;
      for (let i = 0; i < jobs.length; i++) {
        if (!c.setJobAssignment(name, city, jobs[i], counts[i])) {
          ns.tprint(`PAUSED: could not assign ${counts[i]} ${jobs[i]} employees in ${name}/${city}.`);
          return false;
        }
      }
      ns.tprint(`${name}/${city}: staffed ${size}/${office.size}; jobs ${jobs.map((j, i) => `${j}=${counts[i]}`).join(", ")}.`);
    }
    return true;
  }
  function enableSupply(name) {
    if (!c.hasUnlock("Smart Supply")) {
      const cost = c.getUnlockCost("Smart Supply");
      if (!enough("Smart Supply unlock", cost)) return false;
      if (!safe("purchasing Smart Supply", () => c.purchaseUnlock("Smart Supply"))) return false;
      ns.tprint(`Purchased Smart Supply for ${fmt(cost)}.`);
    }
    for (const city of division(name).cities) {
      try {
        if (c.hasWarehouse(name, city) && !c.getWarehouse(name, city).smartSupplyEnabled) c.setSmartSupply(name, city, true);
      } catch (e) { ns.tprint(`Smart Supply/Warehouse API unavailable at ${name}/${city}: ${String(e)}. Enable it manually in the warehouse UI.`); return false; }
    }
    return true;
  }
  function configureAgriculture(name) {
    if (!prepareWarehouses(name) || !enableSupply(name) || !staffInitialOffices(name)) return false;
    for (const city of division(name).cities) {
      c.sellMaterial(name, city, "Food", "MAX", "MP");
      c.sellMaterial(name, city, "Plants", "MAX", "MP");
    }
    ns.tprint(`Agriculture is configured in all six cities: existing office seats staffed, warehouses present, Smart Supply enabled, and Food/Plants sold MAX at MP.`);
    return true;
  }

  if (!c.hasCorporation()) {
    ns.tprint("SELF-FUNDING EXPLAINER: Creation removes $150b from your PLAYER wallet. The new corporation receives a separate $150b CORPORATE balance used for divisions, cities, warehouses, offices, and upgrades.");
    const check = c.canCreateCorporation(true);
    if (check !== "Success") { ns.tprint(`Cannot create a fully self-funded corporation: ${check}. Usually you need $150b player cash, SF3 access, and a node whose corporation softcap permits creation.`); return; }
    if (!await proceed(`Ready to create “${corpName}” using $150b of PLAYER money. This is always self-funded; no BN3 seed-money path is used.`)) return;
    if (!safe("creating corporation", () => { if (!c.createCorporation(corpName, true)) throw new Error("createCorporation returned false"); })) return;
    ns.tprint(`Created “${corpName}”; corporate funds: ${fmt(info().funds)}.`);
  } else ns.tprint(`Resuming corporation “${info().name}” with ${fmt(info().funds)} corporate funds. Script argument “${corpName}” does not rename it.`);

  if (agri === chem) { ns.tprint("ABORT: Agriculture and Chemical division names must be distinct."); return; }
  if (!validate(agri, "Agriculture") || !validate(chem, "Chemical")) return;
  const chemicalAlreadyExists = hasDivision(chem);
  if (!expandIndustry("Agriculture", agri) || !expandCities(agri)) return;

  const officeApi = c.hasUnlock("Office API");
  const warehouseApi = c.hasUnlock("Warehouse API");
  if (officeApi && warehouseApi) {
    ns.tprint("Detected Office API and Warehouse API unlocks (SF3.3 grants both automatically). No API unlock purchase is needed.");
    if (!configureAgriculture(agri)) return;
  } else if (!args.manual) {
    ns.tprint(`PAUSED: required API unlocks are not available (Office API: ${officeApi}, Warehouse API: ${warehouseApi}).\n` +
      `This script deliberately will not spend startup funds buying those expensive unlocks. Configure Agriculture in the UI, then rerun with --manual to provide the explicit readiness confirmation.`);
    return;
  } else {
    if (!await proceed(
      `MANUAL AGRICULTURE READINESS CONFIRMATION (${agri}):\n` +
      `• Every operating city has a warehouse.\n` +
      `• Every initial office is hired and jobs include Operations, Engineer, and Business (use Management/R&D for extra seats; no office growth is required).\n` +
      `• Smart Supply is purchased and enabled in every warehouse, so Water/Chemicals are supplied.\n` +
      `• Produced Food and Plants are each configured to sell MAX at MP in every city.\n\n` +
      `Confirm only after checking all four items in the Corporation UI. Current corporate funds: ${fmt(info().funds)}.`)) return;
  }

  if (chemicalAlreadyExists) {
    ns.tprint(`Chemical division “${chem}” already exists; skipping all investment-offer inspection and acceptance on this rerun.`);
  } else {
    const corp = info();
    if (corp.public) {
      ns.tprint("Corporation is public; investment offers no longer apply. Continuing without accepting funding.");
    } else {
      const shown = c.getInvestmentOffer();
      if (shown.round === 1 && shown.funds > 0 && shown.shares > 0) {
        const choice = await ns.prompt(
          `EXPECTED INVESTMENT ROUND 1: ${fmt(shown.funds)} for ${ns.format.number(shown.shares, 3)} shares.\n` +
          `Accepting dilutes ownership. Automatic acceptance is strictly limited to round 1; choose Skip to handle it manually.`,
          { type: "select", choices: ["Accept expected round 1", "Skip / handle manually"] },
        );
        if (choice !== "Accept expected round 1") { ns.tprint("Round 1 was not accepted. Stopping before Chemical so the decision remains deliberate."); return; }
        const current = c.getInvestmentOffer();
        if (info().public || current.round !== 1 || current.funds <= 0 || current.shares <= 0) {
          ns.tprint("ABORT: the round-1 offer became unavailable or changed. Refusing acceptance."); return;
        }
        if (!c.acceptInvestmentOffer()) { ns.tprint("Round 1 was not accepted; state changed or the offer was exhausted. Stopping safely."); return; }
        ns.tprint(`Accepted investment round 1 for approximately ${fmt(current.funds)}.`);
      } else {
        ns.tprint(`Investment funding is already beyond round 1 or unavailable (round=${shown.round}). This script will never accept a later round automatically; continuing Chemical setup using current corporate funds.`);
      }
    }
  }

  if (!expandIndustry("Chemical", chem) || !expandCities(chem)) return;
  let chemSetup = "manual setup required";
  if (officeApi && warehouseApi) {
    if (!prepareWarehouses(chem) || !enableSupply(chem) || !staffInitialOffices(chem)) return;
    chemSetup = "initial warehouses, supply, and staffing configured";
  }
  if (!await proceed(
    `CHEMICAL CHECKLIST (${chem}):\n` +
    `• ${chemSetup}. Keep Chemical offices at their existing size until profits justify deliberate growth.\n` +
    `• Chemical consumes Plants and produces Chemicals; Agriculture consumes Chemicals. With Export unlocked, reciprocal same-city routes can reduce market purchases. Otherwise Smart Supply buys inputs.\n` +
    `• Before every office, warehouse, advert, or upgrade purchase, inspect CORPORATE funds and preserve working cash. Employee wages and input purchases continue every cycle.\n` +
    `• Smart Factories improves production; Smart Storage adds capacity. Buy gradually rather than exhausting cash.\n` +
    `Current corporate funds: ${fmt(info().funds)}.`)) return;
  ns.tprint("Bootstrap complete. The corporation is operating; monitor warehouse fullness, profit, morale/energy, and future investment rounds in the UI. Reruns safely recheck completed setup.");
}
