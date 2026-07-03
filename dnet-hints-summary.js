/** @param {NS} ns */
export async function main(ns) {
  const file = ns.args[0] || "/data/dnet-hints.txt";
  const raw = ns.read(file);
  if (!raw) return ns.tprint(`${file}: empty or missing`);

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    ns.tprint(`${file}: JSON parse failed: ${String(e)}`);
    ns.tprint(`bytes=${raw.length}`);
    return;
  }

  const entries = Object.entries(data || {});
  const fields = new Map();
  let solved = 0;
  /** @type {[string, number][]} */
  const sizes = [];

  for (const [host, rec] of entries) {
    const text = JSON.stringify(rec);
    sizes.push([host, text.length]);
    if (rec && rec.solved) solved++;
    for (const k of Object.keys(rec || {})) fields.set(k, (fields.get(k) || 0) + 1);
  }

  sizes.sort((a, b) => b[1] - a[1]);
  const fieldSummary = [...fields.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", ");

  ns.tprint(`${file}: bytes=${raw.length}, hosts=${entries.length}, solved=${solved}`);
  ns.tprint(`sample hosts: ${entries.slice(0, 30).map(([h]) => h).join(", ")}`);
  ns.tprint(`fields: ${fieldSummary}`);
  ns.tprint(`largest: ${sizes.slice(0, 20).map(([h, n]) => `${h}:${n}`).join(", ")}`);
}
