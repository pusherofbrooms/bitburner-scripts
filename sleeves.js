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
      "  homicide, homocide  Commit Homicide with every sleeve",
      "  shock, recovery      Put every sleeve on shock recovery",
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
    default:
      return null;
  }
}

function assignSleeve(ns, sleeveNumber, task) {
  if (task.kind === "crime") return ns.sleeve.setToCommitCrime(sleeveNumber, task.crime);
  if (task.kind === "shock") return ns.sleeve.setToShockRecovery(sleeveNumber);
  return false;
}

function formatTask(task) {
  if (!task) return "Idle";
  if (task.type === "CRIME") return `${task.type}:${task.crimeType}`;
  return task.type;
}
