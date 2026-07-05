import { HINT_DB, PASSWORD_DB, ensureDnetFiles, parseArgs, pullHomeState, readJson, rememberSecret, safeAsync, trySecret } from "/dnet/lib.js";

const SMALL_PRIMES = [2,3,5,7,11,13,17,19,23,29,31];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  await ensureDnetFiles(ns);
  if (opts.once) return await tick(ns, opts);
  while (true) { await tick(ns, opts); await ns.sleep(opts.sleepMs); }
}

async function tick(ns, opts) {
  pullHomeState(ns, [PASSWORD_DB, HINT_DB]);
  for (const target of ns.dnet.probe()) {
    const d = ns.dnet.getServerDetails(target);
    if (!d || d.hasSession || !d.isOnline || !d.isConnectedToCurrentServer) continue;
    const known = readJson(ns, PASSWORD_DB, {})[target];
    if (known !== undefined && await trySecret(ns, target, known, d)) continue;
    const solved = await dynamicSolve(ns, target, d, opts);
    if (solved != null) await trySecret(ns, target, solved, d);
  }
}

async function dynamicSolve(ns, target, d, opts) {
  if (d.modelId === "AccountsManager_4.2") return await solveHigherLower(ns, target, d, opts, false);
  if (d.modelId === "BellaCuore" && String(d.data || "").includes(",")) return await solveHigherLower(ns, target, d, opts, true);
  if (d.modelId === "Factori-Os" || d.modelId === "BigMo%od") return await solveNumericBrute(ns, target, d, opts) ?? await solveDivisibility(ns, target, d);
  if (d.modelId === "NIL") return await solveExactChars(ns, target, d);
  if (d.modelId === "RateMyPix.Auth") return await solveSpiceLevel(ns, target, d);
  if (d.modelId === "2G_cellular") return await solveTiming(ns, target, d);
  if (d.modelId === "DeepGreen") return await solveMastermind(ns, target, d, opts);
  if (d.modelId === "KingOfTheHill") return await solveKingOfTheHill(ns, target, d, opts);
  return null;
}

async function solveHigherLower(ns, target, d, opts, roman) {
  let lo = 0, hi = 10 ** Math.max(1, d.passwordLength);
  if (roman && d.data?.includes(",")) { const [a, b] = d.data.split(",").map(romanToInt); lo = Math.min(a, b); hi = Math.max(a, b); }
  for (let i = 0; i < opts.maxDynamicAttempts && lo <= hi; i++) {
    const guess = Math.floor((lo + hi) / 2);
    const fb = await attemptWithFeedback(ns, target, String(guess));
    if (fb.success) return String(guess);
    const feedback = `${fb.data ?? ""} ${fb.message ?? ""}`;
    if (/Lower|ALTUS NIMIS/i.test(feedback)) hi = guess - 1;
    else if (/Higher|PARUM BREVIS/i.test(feedback)) lo = guess + 1;
    else break;
  }
  return null;
}
async function solveExactChars(ns, target, d) {
  const chars = charset(d); let pass = chars[0].repeat(d.passwordLength);
  for (let i = 0; i < d.passwordLength; i++) {
    let found = false;
    for (const c of chars) {
      const guess = pass.slice(0, i) + c + pass.slice(i + 1);
      const fb = await attemptWithFeedback(ns, target, guess);
      if (fb.success) return guess;
      const yesnt = parseYesnt(fb.data ?? fb.text), spice = parseSpice(fb.data ?? fb.text);
      if ((yesnt && yesnt[i] === true) || (spice != null && spice > i)) { pass = guess; found = true; break; }
    }
    if (!found) return null;
  }
  return pass;
}
async function solveSpiceLevel(ns, target, d) {
  const chars = charset(d); let pass = chars[0].repeat(d.passwordLength);
  let score = await spiceScore(ns, target, pass);
  if (score == null) return null;
  for (let i = 0; i < d.passwordLength; i++) for (const c of chars) {
    if (c === pass[i]) continue;
    const guess = pass.slice(0, i) + c + pass.slice(i + 1);
    const fb = await attemptWithFeedback(ns, target, guess);
    if (fb.success) return guess;
    const next = parseSpice(fb.data ?? fb.text);
    if (next != null && next > score) { pass = guess; score = next; break; }
  }
  return pass;
}
async function spiceScore(ns, target, guess) { const fb = await attemptWithFeedback(ns, target, guess); return fb.success ? guess.length : parseSpice(fb.data ?? fb.text); }
async function solveTiming(ns, target, d) {
  const chars = charset(d); let pass = "";
  for (let i = 0; i < d.passwordLength; i++) for (const c of chars) {
    const guess = (pass + c).padEnd(d.passwordLength, chars[0]);
    const fb = await attemptWithFeedback(ns, target, guess);
    if (fb.success) return guess;
    const mismatch = /mismatch while checking each character \((-?\d+)\)/.exec(`${fb.message ?? ""} ${fb.text}`);
    if (mismatch && Number(mismatch[1]) > i) { pass += c; break; }
  }
  return pass.length === d.passwordLength ? pass : null;
}
async function solveNumericBrute(ns, target, d, opts) {
  const max = Math.min(10 ** d.passwordLength, d.passwordLength <= 4 ? 10000 : opts.maxDynamicAttempts * 20);
  for (let n = 0; n < max; n++) { const guess = String(n).padStart(d.passwordLength, "0"); if (await trySecret(ns, target, guess, d)) return guess; }
  return null;
}
async function solveDivisibility(ns, target, d) {
  let n = 1;
  for (const p of SMALL_PRIMES) while (true) {
    const probe = n * p; if (!Number.isSafeInteger(probe)) break;
    const fb = await attemptWithFeedback(ns, target, String(probe));
    if (fb.success) return String(probe);
    if (/IS divisible/.test(`${fb.message ?? ""} ${fb.text}`)) n = probe; else break;
  }
  return n > 1 ? String(n) : null;
}
async function solveKingOfTheHill(ns, target, d, opts) {
  let best = 0, bestAlt = -Infinity;
  const max = 10 ** d.passwordLength - 1;
  const step = Math.max(1, Math.floor(max / Math.max(10, Math.min(opts.maxDynamicAttempts, 50))));
  for (let x = 0; x <= max; x += step) {
    const fb = await attemptWithFeedback(ns, target, String(x));
    if (fb.success) return String(x);
    const alt = Number(fb.data);
    if (Number.isFinite(alt) && alt > bestAlt) { bestAlt = alt; best = x; }
  }
  const lo = Math.max(0, best - step), hi = Math.min(max, best + step);
  for (let x = lo; x <= hi; x++) if (await trySecret(ns, target, String(x), d)) return String(x);
  return null;
}
async function solveMastermind(ns, target, d, opts) {
  const chars = charset(d);
  if (chars.length ** d.passwordLength > 20000) return null;
  let candidates = enumeratePasswords(chars, d.passwordLength, 20000);
  for (let i = 0; i < opts.maxDynamicAttempts && candidates.length; i++) {
    const guess = candidates[0];
    const fb = await attemptWithFeedback(ns, target, guess);
    if (fb.success) return guess;
    const mm = parseMastermind(fb.data ?? fb.text);
    if (!mm) break;
    candidates = candidates.filter(c => c !== guess && mastermindScore(c, guess)[0] === mm[0] && mastermindScore(c, guess)[1] === mm[1]);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

async function attemptWithFeedback(ns, target, secret) {
  const r = await safeAsync(() => ns.dnet.authenticate(target, String(secret)), { success: false });
  if (r.success) { rememberSecret(ns, target, secret, ns.dnet.getServerDetails(target)); return { success: true, text: "" }; }
  const hb = await safeAsync(() => ns.dnet.heartbleed(target, { peek: true, logsToCapture: 8 }), { logs: [] });
  const text = (hb.logs || []).join("\n");
  const feedback = parseFeedbackLog(text, secret);
  return { success: false, text, data: feedback?.data, message: feedback?.message };
}

function parseFeedbackLog(text, secret) { for (const line of String(text || "").split("\n")) { if (!line.trim().startsWith("{")) continue; try { const o = JSON.parse(line); if (String(o.passwordAttempted) === String(secret)) return o; } catch {} } return null; }
function parseMastermind(text) { const m = /(\d+)\s*,\s*(\d+)/.exec(String(text)); return m ? [Number(m[1]), Number(m[2])] : null; }
function mastermindScore(secret, guess) { const sc = {}, gc = {}; let exact = 0, common = 0; for (let i = 0; i < secret.length; i++) if (secret[i] === guess[i]) exact++; else { sc[secret[i]] = (sc[secret[i]] || 0) + 1; gc[guess[i]] = (gc[guess[i]] || 0) + 1; } for (const c of Object.keys(gc)) common += Math.min(gc[c], sc[c] || 0); return [exact, common]; }
function enumeratePasswords(chars, len, limit, prefix = "", out = []) { if (out.length >= limit) return out; if (!len) { out.push(prefix); return out; } for (const c of chars) enumeratePasswords(chars, len - 1, limit, prefix + c, out); return out; }
function romanToInt(s) { if (String(s).toLowerCase() === "nulla") return 0; const v = { I:1,V:5,X:10,L:50,C:100,D:500,M:1000 }; let total = 0, prev = 0; for (let i = String(s).length - 1; i >= 0; i--) { const cur = v[String(s)[i]] || 0; total += cur < prev ? -cur : cur; prev = cur; } return total; }
function parseYesnt(text) { const m = /data":"([^"]+)"/.exec(String(text)) || /yes(?:n't)?(?:,yes(?:n't)?)*/.exec(String(text)); if (!m) return null; return m[0].replace(/^data":"/, "").replace(/"$/, "").split(",").map(x => x === "yes"); }
function parseSpice(text) { const m = /([^/]*?)\/(\d+)/.exec(String(text)); if (!m || !m[1].includes("🌶")) return null; return (m[1].match(/🌶/g) || []).length; }
function charset(d) { return d.passwordFormat === "numeric" ? "0123456789" : "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"; }
export function autocomplete() { return ["--tail", "--once", "--sleep", "--max-dynamic"]; }
