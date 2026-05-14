/** @param {NS} ns */
export async function main(ns) {
  const corp = ns.corporation;
  const energyThreshold = Number(ns.args[0] ?? 99.5);
  const moraleThreshold = Number(ns.args[1] ?? 99.5);
  const partySpendPerEmployee = Number(ns.args[2] ?? 500_000);

  ns.disableLog("sleep");

  if (!corp.hasCorporation()) {
    ns.tprint("No corporation found.");
    return;
  }

  if (!corp.hasUnlock("Office API")) {
    ns.tprint("Office API is not unlocked; cannot buy tea or throw parties.");
    return;
  }

  ns.tprint(
    `Maintaining offices: energy >= ${energyThreshold}, morale >= ${moraleThreshold}, party $${ns.formatNumber(partySpendPerEmployee)}/employee`,
  );

  while (true) {
    await corp.nextUpdate();

    const corporation = corp.getCorporation();
    for (const divisionName of corporation.divisions) {
      const division = corp.getDivision(divisionName);
      for (const city of division.cities) {
        const office = corp.getOffice(divisionName, city);
        if (office.numEmployees <= 0) continue;

        if (office.avgEnergy < energyThreshold) {
          const ok = corp.buyTea(divisionName, city);
          if (ok) ns.print(`${divisionName}/${city}: bought tea (${office.avgEnergy.toFixed(2)} energy)`);
        }

        if (office.avgMorale < moraleThreshold) {
          const mult = corp.throwParty(divisionName, city, partySpendPerEmployee);
          if (mult > 0) ns.print(`${divisionName}/${city}: threw party (${office.avgMorale.toFixed(2)} morale, ${mult.toFixed(3)}x)`);
        }
      }
    }
  }
}
