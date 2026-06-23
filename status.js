/**
 * Mud-safe common status. Keep this script tiny for fresh BN1.1 home RAM.
 * Avoid expensive/special-system APIs here; use status-*.js probes for details.
 * @param {NS} ns
 */
export async function main(ns) {
  const opts = parseArgs(ns.args);
  if (opts.help) {
    ns.tprint([
      "Usage: run status.js [--json]",
      "Prints a minimal common status intended to run in fresh BitNode RAM.",
      "Optional detail probes:",
      "  run status-servers.js",
      "  run status-cloud.js",
    ].join("\n"));
    return;
  }

  const programs = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];
  const ownedPrograms = programs.filter((program) => ns.fileExists(program, "home"));
  const data = {
    money: ns.getServerMoneyAvailable("home"),
    hacking: ns.getHackingLevel(),
    homeRamUsed: ns.getServerUsedRam("home"),
    homeRamMax: ns.getServerMaxRam("home"),
    tor: ns.hasTorRouter(),
    portOpeners: ownedPrograms.length,
    programs: ownedPrograms,
    formulas: ns.fileExists("Formulas.exe", "home"),
    darkscape: ns.fileExists("DarkscapeNavigator.exe", "home"),
  };

  if (opts.json) {
    ns.tprint(JSON.stringify(data));
    return;
  }

  const lines = [];
  lines.push("Status");
  lines.push(`Money: ${money(ns, data.money)}`);
  lines.push(`Hacking: ${data.hacking}`);
  lines.push(`Home RAM: ${ram(ns, data.homeRamUsed)} / ${ram(ns, data.homeRamMax)}`);
  lines.push(`TOR: ${yes(data.tor)}`);
  lines.push(`Port openers: ${data.portOpeners}/5${data.programs.length ? ` (${data.programs.join(", ")})` : ""}`);
  lines.push(`Formulas: ${yes(data.formulas)}  Darkscape: ${yes(data.darkscape)}`);
  lines.push("");
  lines.push("Useful probes:");
  lines.push("  run status-servers.js     # rooted/server/RAM summary");
  lines.push("  run status-cloud.js       # cloud server summary");
  lines.push("  run best-target.js        # target recommendation");
  lines.push("");
  lines.push("Common next steps:");
  lines.push("  run rootall.js");
  lines.push("  run deployall.js basic-hack.js n00dles");
  if (data.formulas) lines.push("  run fleet-hwgw-formulas.js --all --targetLimit 8 --reserve 8");
  else lines.push("  run fleet-hwgw.js <target> --reserve 8");

  ns.tprint(lines.join("\n"));
}

function parseArgs(args) {
  return {
    help: args.includes("--help") || args.includes("-h"),
    json: args.includes("--json"),
  };
}

function yes(value) {
  return value ? "yes" : "no";
}

function money(ns, value) {
  return `$${ns.format.number(value, 2)}`;
}

function ram(ns, value) {
  return ns.format.ram(value, 2);
}
