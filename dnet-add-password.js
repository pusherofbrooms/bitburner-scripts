/** @param {NS} ns */
export async function main(ns) {
  const [host, ...parts] = ns.args.map(String);
  if (!host || !parts.length) {
    ns.tprint("Usage: run dnet-add-password.js <host> <password>");
    return;
  }

  const password = parts.join(" ");
  const passFile = "/data/dnet-passwords.txt";
  const hintFile = "/data/dnet-hints.txt";

  const passwords = readJson(ns, passFile, {});
  passwords[host] = password;
  await ns.write(passFile, JSON.stringify(passwords, null, 2), "w");

  const hints = readJson(ns, hintFile, {});
  hints[host] = { ...(hints[host] || {}), solved: true, secret: password, manual: true, lastSeen: Date.now(), from: ns.getHostname() };
  await ns.write(hintFile, JSON.stringify(hints, null, 2), "w");

  ns.tprint(`Recorded password for ${host}: ${JSON.stringify(password)}`);
}

function readJson(ns, file, fallback) {
  try { return JSON.parse(ns.read(file) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
