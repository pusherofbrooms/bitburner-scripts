/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["json", false],
    ["help", false],
  ]);

  if (flags.help) {
    ns.tprint("Usage: run player.js [--json]\nPrint current player info from ns.getPlayer().");
    return;
  }

  const player = ns.getPlayer();

  if (flags.json) {
    ns.tprint(JSON.stringify(player, null, 2));
    return;
  }

  const number = (value, digits = 3) => ns.format.number(value, digits);
  const integer = (value) => ns.format.number(value, 0, 1000, true);
  const percent = (value) => ns.format.percent(value, 2);
  const mult = (value) => `x${number(value, 2)}`;
  const list = (values) => values.length ? values.join(", ") : "none";

  const skillNames = ["hacking", "strength", "defense", "dexterity", "agility", "charisma"];
  const lines = [
    "Player",
    `Money: $${number(player.money)}`,
    `HP: ${integer(player.hp.current)} / ${integer(player.hp.max)}`,
    `City: ${player.city}`,
    `Location: ${player.location}`,
    `Karma: ${number(player.karma)}`,
    `Homicide count: ${integer(player.numPeopleKilled)}`,
    `Entropy: ${number(player.entropy)}`,
    `Playtime: ${ns.format.time(player.totalPlaytime)}`,
    `Factions: ${list(player.factions)}`,
  ];

  const jobs = Object.entries(player.jobs).map(([company, job]) => `${company}: ${job}`);
  lines.push(`Jobs: ${list(jobs)}`);

  lines.push("", "Skills:");
  for (const skill of skillNames) {
    lines.push(
      `  ${skill.padEnd(9)} ${integer(player.skills[skill])}` +
      ` | exp ${number(player.exp[skill])}` +
      ` | level ${mult(player.mults[skill])}` +
      ` | exp ${mult(player.mults[`${skill}_exp`])}`,
    );
  }
  lines.push(`  ${"int".padEnd(9)} ${integer(player.skills.intelligence)} | exp ${number(player.exp.intelligence)}`);

  lines.push(
    "",
    "Useful multipliers:",
    `  Hack chance/speed/money/grow: ${mult(player.mults.hacking_chance)} / ${mult(player.mults.hacking_speed)} / ${mult(player.mults.hacking_money)} / ${mult(player.mults.hacking_grow)}`,
    `  Faction/company rep: ${mult(player.mults.faction_rep)} / ${mult(player.mults.company_rep)}`,
    `  Work/crime money: ${mult(player.mults.work_money)} / ${mult(player.mults.crime_money)}`,
    `  Crime success: ${percent(player.mults.crime_success - 1)} bonus (${mult(player.mults.crime_success)})`,
    `  Hacknet production/cost: ${mult(player.mults.hacknet_node_money)} / ${mult(player.mults.hacknet_node_purchase_cost)}`,
  );

  ns.tprint(lines.join("\n"));
}
