/** Shared helpers for small darknet scripts. */
export const PASSWORD_DB = "/data/dnet-passwords.txt";
export const HINT_DB = "/data/dnet-hints.txt";
export const MAP_DB = "/data/dnet-map.txt";
export const SYNC_MANIFEST = "/data/dnet-sync-manifest.txt";
export const SYNC_STATUS = "/data/dnet-sync-status.txt";
export const LABYRINTH_SCRIPT = "/dnet/labyrinth.js";

export function safe(fn, fallback = null) { try { return fn(); } catch { return fallback; } }
export async function safeAsync(fn, fallback = null) { try { return await fn(); } catch { return fallback; } }
export async function ensureHomeFile(ns, file, content) { if (!ns.fileExists(file, "home")) await ns.write(file, content, "w"); }
export async function ensureDnetFiles(ns) {
  await ensureHomeFile(ns, PASSWORD_DB, "{}");
  await ensureHomeFile(ns, HINT_DB, "{}");
  await ensureHomeFile(ns, MAP_DB, "{}");
  await ensureHomeFile(ns, SYNC_STATUS, "{}");
}
export function readJson(ns, file, fallback = {}) { try { return JSON.parse(ns.read(file) || JSON.stringify(fallback)); } catch { return fallback; } }
export function writeJson(ns, file, data) { ns.write(file, JSON.stringify(data, null, 2), "w"); }
export function pullHomeState(ns, files = [PASSWORD_DB, HINT_DB, MAP_DB, SYNC_MANIFEST]) {
  if (ns.getHostname() !== "home") safe(() => ns.scp(files.filter(f => ns.fileExists(f, "home")), ns.getHostname(), "home"), false);
}
export function pushHomeState(ns, files = [PASSWORD_DB, HINT_DB, MAP_DB, SYNC_STATUS]) {
  if (ns.getHostname() !== "home") safe(() => ns.scp(files.filter(f => ns.fileExists(f)), "home", ns.getHostname()), false);
}
export function mergeObjectFile(ns, file, key, value) {
  const data = readJson(ns, file, {});
  data[key] = { ...(data[key] || {}), ...value, lastSeen: Date.now(), from: ns.getHostname() };
  writeJson(ns, file, data);
}
export function rememberSecret(ns, target, secret, details = {}) {
  const db = readJson(ns, PASSWORD_DB, {});
  db[target] = String(secret);
  writeJson(ns, PASSWORD_DB, db);
  mergeObjectFile(ns, HINT_DB, target, { ...details, solved: true, secret: String(secret) });
  pushHomeState(ns, [PASSWORD_DB, HINT_DB]);
  return true;
}
export function argsEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export function hashText(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
export function parseArgs(args) {
  const o = { once: false, sleepMs: 60000, maxAttempts: 10000, verbose: false, phish: false };
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a === "--once") o.once = true;
    else if (a === "--verbose") o.verbose = true;
    else if (a === "--phish") o.phish = true;
    else if (a === "--sleep") o.sleepMs = Number(args[++i]);
    else if (a === "--max-attempts") o.maxAttempts = Number(args[++i]);
  }
  return o;
}
export function candidateFits(d, secret) {
  if (secret == null || String(secret).length > 50) return false;
  secret = String(secret);
  if (/[{}"]|passwordAttempted|\bcode\b|\bmessage\b|\bdata\b/.test(secret)) return false;
  if (d.modelId === "ZeroLogon" && secret === "") return true;
  if (d.modelId === "Pr0verFl0") return /^■+$/.test(secret) && secret.length >= d.passwordLength;
  if (secret.length !== d.passwordLength) return false;
  if (d.passwordFormat === "numeric") return /^\d+$/.test(secret);
  if (d.passwordFormat === "alphabetic") return /^[a-z]+$/i.test(secret);
  if (d.passwordFormat === "alphanumeric") return /^[a-z0-9]+$/i.test(secret);
  return true;
}
export async function trySecret(ns, target, secret, details = {}) {
  const r = await safeAsync(() => ns.dnet.authenticate(target, String(secret)), { success: false });
  if (r.success) { ns.print(`SUCCESS ${target} secret='${secret}'`); return rememberSecret(ns, target, secret, details); }
  return false;
}
