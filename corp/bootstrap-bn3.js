/** @param {NS} ns */
export async function main(ns) {
  const c = ns.corporation;
  const corpName = String(ns.args[0] ?? "JCorp");
  const agri = String(ns.args[1] ?? "Agri");
  const chem = String(ns.args[2] ?? "Chem");
  const cities = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"];

  ns.disableLog("sleep");

  async function ok(message) {
    ns.tprint(message);
    return ns.prompt(message, { type: "boolean" });
  }

  function corpInfo() {
    return c.getCorporation();
  }

  function hasDivision(name) {
    if (!c.hasCorporation()) return false;
    return corpInfo().divisions.includes(name);
  }

  function funds() {
    return corpInfo().funds;
  }

  function fmt(n) {
    return ns.formatNumber(n, 3);
  }

  function buyUpgrade(name, maxSpendFraction = 0.25) {
    const cost = c.getUpgradeLevelCost(name);
    if (cost <= funds() * maxSpendFraction) {
      c.levelUpgrade(name);
      ns.tprint(`Bought ${name} level ${c.getUpgradeLevel(name)} for $${fmt(cost)}`);
      return true;
    }
    return false;
  }

  if (!c.hasCorporation()) {
    const check = c.canCreateCorporation(false);
    if (check !== "Success") {
      ns.tprint(`Cannot create seed-funded corporation: ${check}`);
      return;
    }
    if (!c.createCorporation(corpName, false)) {
      ns.tprint("Failed to create corporation.");
      return;
    }
    ns.tprint(`Created corporation ${corpName}.`);
  }

  if (!hasDivision(agri)) {
    c.expandIndustry("Agriculture", agri);
    ns.tprint(`Created Agriculture division: ${agri}`);
  }

  const agriDiv = c.getDivision(agri);
  for (const city of cities) {
    if (!agriDiv.cities.includes(city)) {
      c.expandCity(agri, city);
      ns.tprint(`Expanded ${agri} to ${city}.`);
    }
  }

  await ok(
    `Manual setup needed for ${agri}:\n` +
      `1. Buy warehouses in all 6 cities.\n` +
      `2. Buy Smart Supply.\n` +
      `3. Enable Smart Supply in each warehouse.\n` +
      `4. Upgrade each office to 6 seats and buy 4 employees in each location.\n` +
      `5. Assign 4 employees to R&D in all locations.\n\nClick OK after this is done.`,
  );

  ns.tprint("Waiting for Agriculture to reach ~55 RP...");
  while (c.getDivision(agri).researchPoints < 55) {
    await c.nextUpdate();
    ns.print(`${agri} RP: ${fmt(c.getDivision(agri).researchPoints)}`);
  }

  await ok(
    `Manual setup needed for ${agri}:\n` +
      `1. Reassign Sector-12 employees to 1 Ops / 1 Eng / 1 Bus / 1 Mgmt.\n` +
      `2. Buy/maintain tea and parties as needed.\n` +
      `3. Buy boost materials for Agriculture.\n\nClick OK after this is done.`,
  );

  ns.tprint("Buying conservative early upgrades when affordable...");
  for (let i = 0; i < 20; i++) {
    let bought = false;
    bought ||= buyUpgrade("Smart Storage", 0.20);
    bought ||= buyUpgrade("Smart Factories", 0.10);
    if (!bought) break;
    await ns.sleep(100);
  }

  await ok(
    `Round 1 checkpoint. Current offer: $${fmt(c.getInvestmentOffer().funds)}.\n` +
      `If you are happy with valuation, accept the first investment offer manually or click OK to let this script accept it.`,
  );

  const offer1 = c.getInvestmentOffer();
  c.acceptInvestmentOffer();
  ns.tprint(`Accepted investment offer: $${fmt(offer1.funds)}`);

  if (!c.hasUnlock("Export") && c.getUnlockCost("Export") <= funds()) {
    c.purchaseUnlock("Export");
    ns.tprint("Purchased Export unlock.");
  }

  if (!hasDivision(chem)) {
    c.expandIndustry("Chemical", chem);
    ns.tprint(`Created Chemical division: ${chem}`);
  }

  const chemDiv = c.getDivision(chem);
  for (const city of cities) {
    if (!chemDiv.cities.includes(city)) {
      c.expandCity(chem, city);
      ns.tprint(`Expanded ${chem} to ${city}.`);
    }
  }

  await ok(
    `Round 2 manual setup needed:\n` +
      `1. Buy Chemical warehouses in all 6 cities.\n` +
      `2. Enable Smart Supply in each Chemical warehouse.\n` +
      `3. Grow Agriculture office when affordable; manual office upgrades are +3 seats, so size 9 is the practical UI target near the guide's size 8.\n` +
      `4. Keep Chemical minimal.\n` +
      `5. Set exports if desired. Suggested docs mention Plants routes and Chemical support.\n\nClick OK to finish.`,
  );

  ns.tprint("BN3 bootstrap complete through early round 2.");
}
