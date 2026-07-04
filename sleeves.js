/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["task", ""],
    ["help", false],
  ]);

  const rawTask = String(flags.task || flags._[0] || "").toLowerCase().replace(/[\s_-]+/g, "");

  if (flags.help || !rawTask) {
    ns.tprint([
      "Usage: run sleeves.js <task>",
      "       run sleeves.js --task <task>",
      "",
      "Tasks:",
      "  homicide, homocide     Commit Homicide with every sleeve",
      "  shock, recovery         Put every sleeve on shock recovery",
      "  travel-<city>, <city>   Travel every sleeve to a city",
      "                         Cities: aevum, chongqing, sector12, newtokyo, ishima, volhaven",
      "  str, def, dex, agi      Train every sleeve at Powerhouse Gym in Sector-12",
      "                         Also: strength, defense, dexterity, agility",
    ].join("\n"));
    return;
  }

  const task = normalizeTask(rawTask);
  if (!task) {
    ns.tprint(`Unknown sleeve task: ${rawTask}. Use --help for options.`);
    return;
  }

  const count = ns.sleeve.getNumSleeves();
  if (count === 0) {
    ns.tprint("No sleeves available.");
    return;
  }

  let success = 0;
  for (let i = 0; i < count; i++) {
    const ok = assignSleeve(ns, i, task);
    if (ok) success++;

    const sleeve = ns.sleeve.getSleeve(i);
    const current = ns.sleeve.getTask(i);
    ns.tprint(
      `Sleeve ${i}: ${ok ? "assigned" : "failed"} | ` +
      `shock ${ns.format.percent(sleeve.shock / 100, 2)} | ` +
      `sync ${ns.format.percent(sleeve.sync / 100, 2)} | ` +
      `task ${formatTask(current)}`,
    );
  }

  ns.tprint(`Assigned ${success}/${count} sleeves to ${task.label}.`);
}

function normalizeTask(task) {
  switch (task) {
    case "homicide":
    case "homocide":
      return { kind: "crime", label: "Homicide", crime: "Homicide" };
    case "shock":
    case "shockrecovery":
    case "recovery":
      return { kind: "shock", label: "Shock Recovery" };
    case "travel-aevum":
    case "travelaevum":
    case "aevum":
      return { kind: "travel", label: "Travel to Aevum", city: "Aevum" };
    case "travel-chongqing":
    case "travelchongqing":
    case "chongqing":
      return { kind: "travel", label: "Travel to Chongqing", city: "Chongqing" };
    case "travel-sector12":
    case "travelsector12":
    case "sector12":
      return { kind: "travel", label: "Travel to Sector-12", city: "Sector-12" };
    case "travel-newtokyo":
    case "travelnewtokyo":
    case "newtokyo":
      return { kind: "travel", label: "Travel to New Tokyo", city: "New Tokyo" };
    case "travel-ishima":
    case "travelishima":
    case "ishima":
      return { kind: "travel", label: "Travel to Ishima", city: "Ishima" };
    case "travel-volhaven":
    case "travelvolhaven":
    case "volhaven":
      return { kind: "travel", label: "Travel to Volhaven", city: "Volhaven" };
    case "str":
    case "strength":
      return { kind: "gym", label: "Powerhouse Gym strength training", stat: "str" };
    case "def":
    case "defense":
      return { kind: "gym", label: "Powerhouse Gym defense training", stat: "def" };
    case "dex":
    case "dexterity":
      return { kind: "gym", label: "Powerhouse Gym dexterity training", stat: "dex" };
    case "agi":
    case "agility":
      return { kind: "gym", label: "Powerhouse Gym agility training", stat: "agi" };
    default:
      return null;
  }
}

function assignSleeve(ns, sleeveNumber, task) {
  if (task.kind === "crime") return ns.sleeve.setToCommitCrime(sleeveNumber, task.crime);
  if (task.kind === "shock") return ns.sleeve.setToShockRecovery(sleeveNumber);
  if (task.kind === "travel") return ns.sleeve.travel(sleeveNumber, task.city);
  if (task.kind === "gym") {
    ns.sleeve.travel(sleeveNumber, "Sector-12");
    return ns.sleeve.setToGymWorkout(sleeveNumber, "Powerhouse Gym", task.stat);
  }
  return false;
}

function formatTask(task) {
  if (!task) return "Idle";
  if (task.type === "CRIME") return `${task.type}:${task.crimeType}`;
  return task.type;
}
