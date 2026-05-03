/** @param {NS} ns */
export async function main(ns) {
  const term = String(ns.args[0] ?? "");
  const host = String(ns.args[1] ?? "home");

  for (const p of ns.ps(host)) {
    const line = `${p.pid} ${p.filename} ${p.threads} ${p.args.join(" ")}`;
    if (!term || line.includes(term)) ns.tprint(line);
  }
}
