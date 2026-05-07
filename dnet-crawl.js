/**
 * Self-replicating darknet crawler/cracker.
 * Usage after buying DarkscapeNavigator.exe: run dnet-crawl.js --tail
 * Mirrors durable state through home:
 *   /data/dnet-passwords.txt  - { hostname: passcode }
 *   /data/dnet-hints.txt      - recent auth details and logs for unsolved hosts
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  const host = ns.getHostname();
  if (!ns.dnet) return ns.tprint("ERROR: ns.dnet is unavailable. Buy TOR + DarkscapeNavigator.exe first.");
  await ensureHomeFile(ns, PASSWORD_DB, "{}");
  await ensureHomeFile(ns, HINT_DB, "{}");
  if (host !== "home") pullHomeState(ns);
  if (opts.once) return await tick(ns, opts);
  while (true) { await tick(ns, opts); await ns.sleep(opts.sleepMs); }
}

const SCRIPT = "dnet-crawl.js";
const PASSWORD_DB = "/data/dnet-passwords.txt";
const HINT_DB = "/data/dnet-hints.txt";
const DEFAULT_PASSWORDS = ["admin", "password", "0000", "12345"];
const DOG_NAMES = ["fido", "spot", "rover", "max"];
const EU_COUNTRIES = ["Austria","Belgium","Bulgaria","Croatia","Republic of Cyprus","Czech Republic","Denmark","Estonia","Finland","France","Germany","Greece","Hungary","Ireland","Italy","Latvia","Lithuania","Luxembourg","Malta","Netherlands","Poland","Portugal","Romania","Slovakia","Slovenia","Spain","Sweden"];
const COMMON_PASSWORDS = ["123456","password","12345678","qwerty","123456789","12345","1234","111111","1234567","dragon","123123","baseball","abc123","football","monkey","letmein","696969","shadow","master","666666","qwertyuiop","123321","mustang","1234567890","michael","654321","superman","1qaz2wsx","7777777","121212","0","qazwsx","123qwe","trustno1","jordan","jennifer","zxcvbnm","asdfgh","hunter","buster","soccer","harley","batman","andrew","tigger","sunshine","iloveyou","2000","charlie","robert","thomas","hockey","ranger","daniel","starwars","112233","george","computer","michelle","jessica","pepper","1111","zxcvbn","555555","11111111","131313","freedom","777777","pass","maggie","159753","aaaaaa","ginger","princess","joshua","cheese","amanda","summer","love","ashley","6969","nicole","chelsea","biteme","matthew","access","yankees","987654321","dallas","austin","thunder","taylor","matrix"];
const SMALL_PRIMES = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97];

async function tick(ns, opts) {
  pullHomeState(ns);
  await lootCurrent(ns, opts);
  const neighbors = safe(() => ns.dnet.probe(), []);
  if (opts.verbose && neighbors.length && ns.getHostname() !== "home") ns.print(`${ns.getHostname()} sees ${neighbors.join(", ")}`);
  for (const target of neighbors) if (await solveNeighbor(ns, target, opts)) await replicateTo(ns, target, opts);
}

async function solveNeighbor(ns, target, opts) {
  const details = safe(() => ns.dnet.getServerAuthDetails(target), null);
  if (!details || !details.isOnline || !details.isConnectedToCurrentServer) return false;
  recordHint(ns, target, details);
  if (details.hasSession) return true;
  const db = readJson(ns, PASSWORD_DB, {});
  if (typeof db[target] === "string") {
    const r = safe(() => ns.dnet.connectToSession(target, db[target]), { success: false });
    if (r === true || r.success) return true;
    delete db[target]; writeJson(ns, PASSWORD_DB, db); pushHomeState(ns);
  }
  const candidates = makeCandidates(details);
  ns.print(`${target}: ${details.modelId}, ${details.passwordFormat}/${details.passwordLength}, ${candidates.length} static candidates`);
  for (const secret of unique(candidates)) if (await trySecret(ns, target, secret)) return rememberSecret(ns, target, secret, details);
  const dynamic = await dynamicSolve(ns, target, details, opts);
  if (dynamic != null && await trySecret(ns, target, dynamic)) return rememberSecret(ns, target, dynamic, details);
  await harvestLogs(ns, target, details);
  return false;
}

function makeCandidates(d) {
  const hint = `${d.passwordHint || ""} ${d.data || ""}`;
  const out = [];
  if (d.modelId === "ZeroLogon") out.push("");
  if (d.modelId === "FreshInstall_1.0") out.push(...DEFAULT_PASSWORDS);
  if (d.modelId === "Laika4") out.push(...DOG_NAMES);
  if (d.modelId === "TopPass") out.push(...COMMON_PASSWORDS);
  if (d.modelId === "EuroZone Free") out.push(...EU_COUNTRIES);
  if (d.modelId === "Pr0verFl0" && d.passwordLength > 0) out.push("■".repeat(d.passwordLength * 2));
  if (d.modelId === "CloudBlare(tm)" && d.data) out.push(d.data.replace(/[^0-9]/g, ""));
  if (d.modelId === "110100100" && d.data) out.push(d.data.split(/\s+/).filter(Boolean).map(b => String.fromCharCode(parseInt(b, 2))).join(""));
  if (d.modelId === "OrdoXenos" && d.data) out.push(decodeXor(d.data));
  if (d.modelId === "OctantVoxel" && d.data.includes(",")) { const [base, encoded] = d.data.split(","); out.push(String(parseBaseN(encoded, Number(base)))); }
  if (d.modelId === "MathML" && d.data) out.push(String(parseArithmetic(d.data)));
  if (d.modelId === "PrimeTime 2" && d.data) out.push(String(largestPrimeFactor(Number(d.data))));
  if (d.modelId === "BellaCuore" && d.data && !d.data.includes(",")) out.push(String(romanToInt(d.data)));
  if (d.modelId === "DeskMemo_3.1") out.push(...literalHints(hint));
  if (d.modelId === "PHP 5.4" && d.data) out.push(...permutations(d.data, 2000));
  out.push(...extractSecretsFromText(hint));
  return out.filter(x => candidateFits(d, x)).map(String);
}

async function dynamicSolve(ns, target, d, opts) {
  if (d.modelId === "AccountsManager_4.2") return await solveHigherLower(ns, target, d, opts, false);
  if (d.modelId === "BellaCuore" && d.data.includes(",")) return await solveHigherLower(ns, target, d, opts, true);
  if (d.modelId === "Factori-Os") return await solveDivisibility(ns, target);
  if (d.modelId === "NIL" || d.modelId === "RateMyPix.Auth") return await solveExactChars(ns, target, d);
  if (d.modelId === "2G_cellular") return await solveTiming(ns, target, d);
  if (d.modelId === "DeepGreen") return await solveMastermind(ns, target, d, opts);
  return null;
}

async function solveHigherLower(ns, target, d, opts, roman) {
  let lo = 0, hi = 10 ** Math.max(1, d.passwordLength);
  if (roman && d.data.includes(",")) { const [a, b] = d.data.split(",").map(romanToInt); lo = Math.min(a, b); hi = Math.max(a, b); }
  for (let i = 0; i < opts.maxDynamicAttempts && lo <= hi; i++) {
    const guess = Math.floor((lo + hi) / 2);
    const fb = await attemptWithFeedback(ns, target, String(guess));
    if (fb.success) return String(guess);
    const feedback = `${fb.data ?? ""} ${fb.message ?? ""} ${fb.text}`;
    if (/Lower|ALTUS NIMIS/i.test(feedback)) hi = guess - 1;
    else if (/Higher|PARUM BREVIS/i.test(feedback)) lo = guess + 1;
    else break;
  }
  return null;
}
async function solveExactChars(ns, target, d) {
  const chars = charset(d); let pass = chars[0].repeat(d.passwordLength);
  for (let i = 0; i < d.passwordLength; i++) for (const c of chars) {
    const guess = pass.slice(0, i) + c + pass.slice(i + 1);
    const fb = await attemptWithFeedback(ns, target, guess);
    if (fb.success) return guess;
    const yesnt = parseYesnt(fb.data ?? fb.text), spice = parseSpice(fb.data ?? fb.text);
    if ((yesnt && yesnt[i] === true) || (spice != null && spice > i)) { pass = guess; break; }
  }
  return pass;
}
async function solveTiming(ns, target, d) {
  const chars = charset(d); let pass = "";
  for (let i = 0; i < d.passwordLength; i++) for (const c of chars) {
    const guess = (pass + c).padEnd(d.passwordLength, chars[0]);
    const fb = await attemptWithFeedback(ns, target, guess);
    if (fb.success) return guess;
    const mismatch = /mismatch while checking each character \((-?\d+)\)/.exec(fb.text);
    if (mismatch && Number(mismatch[1]) > i) { pass += c; break; }
  }
  return pass;
}
async function solveDivisibility(ns, target) {
  let n = 1;
  for (const p of SMALL_PRIMES) while (true) {
    const probe = n * p; if (!Number.isSafeInteger(probe)) break;
    const fb = await attemptWithFeedback(ns, target, String(probe));
    if (fb.success) return String(probe);
    if (/IS divisible/.test(`${fb.message ?? ""} ${fb.text}`)) n = probe; else break;
  }
  return String(n);
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

async function trySecret(ns, target, secret) {
  const r = await safeAsync(() => ns.dnet.authenticate(target, secret), { success: false });
  if (r.success) { ns.print(`SUCCESS ${target} secret='${secret}'`); return true; }
  return false;
}
async function attemptWithFeedback(ns, target, secret) {
  const r = await safeAsync(() => ns.dnet.authenticate(target, secret), { success: false });
  if (r.success) return { success: true, text: "" };
  const hb = await safeAsync(() => ns.dnet.heartbleed(target, { peek: true, logsToCapture: 8 }), { logs: [] });
  const text = (hb.logs || []).join("\n"); recordLogText(ns, target, text);
  const feedback = parseFeedbackLog(text, secret);
  return { success: false, text, data: feedback?.data, message: feedback?.message };
}
async function harvestLogs(ns, target, details) {
  const hb = await safeAsync(() => ns.dnet.heartbleed(target, { peek: true, logsToCapture: 12 }), { logs: [] });
  const text = (hb.logs || []).join("\n"); if (!text) return; recordLogText(ns, target, text);
  for (const secret of unique(extractLogCandidates(text, details))) if (await trySecret(ns, target, secret)) { rememberSecret(ns, target, secret, ns.dnet.getServerAuthDetails(target)); return; }
}

async function replicateTo(ns, target, opts) {
  const childArgs = ["--sleep", opts.sleepMs, "--max-dynamic", opts.maxDynamicAttempts];
  if (opts.phish) childArgs.push("--phish");
  if (opts.verbose) childArgs.push("--verbose");

  // Always seed the executable from home. Otherwise old crawlers can re-infect a cleaned node with an old local copy.
  safe(() => ns.scp(SCRIPT, target, "home"), false);
  safe(() => ns.scp([PASSWORD_DB, HINT_DB].filter(f => ns.fileExists(f)), target, ns.getHostname()), false);

  const procs = safe(() => ns.ps(target).filter(p => p.filename === SCRIPT), []);
  const desiredRunning = procs.some(p => argsEqual(p.args, childArgs));
  if (desiredRunning) return;

  // If options changed, replace stale crawler copies instead of leaving them running forever.
  for (const p of procs) safe(() => ns.kill(p.pid), false);
  const pid = safe(() => ns.exec(SCRIPT, target, 1, ...childArgs), 0);
  if (pid) ns.print(`replicated to ${target} pid=${pid}`);
}
async function lootCurrent(ns, opts) {
  const here = ns.getHostname();
  if (ns.dnet.isDarknetServer(here)) {
    for (const file of ns.ls(here, ".cache")) safe(() => ns.dnet.openCache(file, false), null);
    if (safe(() => ns.dnet.getBlockedRam(), 0) > 0) await safeAsync(() => ns.dnet.memoryReallocation(), null);
    if (opts.phish) await safeAsync(() => ns.dnet.phishingAttack(), null);
  }
  pushHomeState(ns);
}

function rememberSecret(ns, target, secret, details) { const db = readJson(ns, PASSWORD_DB, {}); db[target] = secret; writeJson(ns, PASSWORD_DB, db); recordHint(ns, target, { ...details, solved: true, secret }); pushHomeState(ns); return true; }
function recordHint(ns, target, details) { const hints = readJson(ns, HINT_DB, {}); hints[target] = { ...(hints[target] || {}), ...details, lastSeen: Date.now(), from: ns.getHostname() }; writeJson(ns, HINT_DB, hints); pushHomeState(ns); }
function recordLogText(ns, target, text) { if (!text) return; const hints = readJson(ns, HINT_DB, {}); const prev = hints[target] || {}; hints[target] = { ...prev, lastLogs: text.slice(0, 4000), lastLogTime: Date.now(), from: ns.getHostname() }; writeJson(ns, HINT_DB, hints); pushHomeState(ns); }
function pullHomeState(ns) { if (ns.getHostname() !== "home") safe(() => ns.scp([PASSWORD_DB, HINT_DB], ns.getHostname(), "home"), false); }
function pushHomeState(ns) { if (ns.getHostname() !== "home") safe(() => ns.scp([PASSWORD_DB, HINT_DB], "home", ns.getHostname()), false); }
async function ensureHomeFile(ns, file, content) { if (ns.getHostname() === "home" && !ns.fileExists(file, "home")) await ns.write(file, content, "w"); }
function readJson(ns, file, fallback) { try { return JSON.parse(ns.read(file) || JSON.stringify(fallback)); } catch { return fallback; } }
function writeJson(ns, file, data) { ns.write(file, JSON.stringify(data, null, 2), "w"); }
function unique(arr) { return [...new Set(arr)]; }
function enumeratePasswords(chars, len, limit, prefix = "", out = []) { if (out.length >= limit) return out; if (!len) { out.push(prefix); return out; } for (const c of chars) enumeratePasswords(chars, len - 1, limit, prefix + c, out); return out; }
function permutations(str, limit, prefix = "", out = [], rest = String(str).split("")) { if (out.length >= limit) return out; if (!rest.length) { out.push(prefix); return out; } const seen = new Set(); for (let i = 0; i < rest.length; i++) { if (seen.has(rest[i])) continue; seen.add(rest[i]); permutations(str, limit, prefix + rest[i], out, rest.slice(0, i).concat(rest.slice(i + 1))); } return out; }
function candidateFits(d, secret) {
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
function parseFeedbackLog(text, secret) {
  const lines = String(text || "").split("\n");
  for (const line of lines) {
    if (!line.trim().startsWith("{")) continue;
    try { const o = JSON.parse(line); if (String(o.passwordAttempted) === String(secret)) return o; } catch {}
  }
  for (const line of lines) {
    if (!line.trim().startsWith("{")) continue;
    try { return JSON.parse(line); } catch {}
  }
  return null;
}
function extractLogCandidates(text, d) {
  const out = extractSecretsFromText(text);
  for (const line of String(text || "").split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try { const o = JSON.parse(line); if (typeof o.data === "string") out.push(o.data, ...extractSecretsFromText(o.data)); } catch {}
  }
  return out.filter(x => candidateFits(d, x)).map(String);
}
function parseMastermind(text) { const m = /(\d+)\s*,\s*(\d+)/.exec(String(text)); return m ? [Number(m[1]), Number(m[2])] : null; }
function mastermindScore(secret, guess) { const sc = {}, gc = {}; let exact = 0, common = 0; for (let i = 0; i < secret.length; i++) if (secret[i] === guess[i]) exact++; else { sc[secret[i]] = (sc[secret[i]] || 0) + 1; gc[guess[i]] = (gc[guess[i]] || 0) + 1; } for (const c of Object.keys(gc)) common += Math.min(gc[c], sc[c] || 0); return [exact, common]; }
function argsEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
async function safeAsync(fn, fallback) { try { return await fn(); } catch { return fallback; } }
function literalHints(text) { const out = []; for (const re of [/password is\s+([^\s]+)/ig,/pin is\s+([^\s]+)/ig,/remember to use\s+([^\s]+)/ig,/set to\s+([^\s]+)/ig,/key is\s+([^\s]+)/ig,/secret is\s+([^\s]+)/ig]) { let m; while ((m = re.exec(text))) out.push(m[1].replace(/["'.:,;]+$/g, "")); } return out; }
function extractSecretsFromText(text) { const out = []; for (const re of [/passcode:\s*([^\s.]+)/ig,/Connecting to\s+[^:\s]+:([^\s.]+)/ig,/--([^\s-]{1,50})--/g,/\s[^:\s]+:([^\s]{1,50})\s/g]) { let m; while ((m = re.exec(text))) out.push(m[1].replace(/["'.:,;]+$/g, "")); } return out; }
function decodeXor(data) { const [enc, masks] = data.split(";"); if (!enc || !masks) return ""; const mask = masks.split(/\s+/); return enc.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ parseInt(mask[i], 2))).join(""); }
function romanToInt(s) { if (String(s).toLowerCase() === "nulla") return 0; const v = { I:1,V:5,X:10,L:50,C:100,D:500,M:1000 }; let total = 0, prev = 0; for (let i = s.length - 1; i >= 0; i--) { const cur = v[s[i]] || 0; total += cur < prev ? -cur : cur; prev = cur; } return total; }
function parseBaseN(str, base) { const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let result = 0, digit = str.split(".")[0].length - 1; for (const c of str) { if (c === ".") continue; result += chars.indexOf(c) * base ** digit; digit--; } return result; }
function largestPrimeFactor(n) { let ans = 1; for (let p = 2; p * p <= n; p += p === 2 ? 1 : 2) while (n % p === 0) { ans = p; n /= p; } return Math.max(ans, n); }
function parseArithmetic(expr) { const cleaned = expr.replaceAll("ҳ", "*").replaceAll("÷", "/").replaceAll("➕", "+").replaceAll("➖", "-").replaceAll("ns.exit(),", "").split(",")[0]; if (/[^0-9+\-*/().\s]/.test(cleaned)) return NaN; return Function(`"use strict"; return (${cleaned});`)(); }
function parseYesnt(text) { const m = /data":"([^"]+)"/.exec(text) || /yes(?:n't)?(?:,yes(?:n't)?)*/.exec(text); if (!m) return null; return m[0].replace(/^data":"/, "").replace(/"$/, "").split(",").map(x => x === "yes"); }
function parseSpice(text) { const m = /([^/]*?)\/(\d+)/.exec(text); if (!m || !m[1].includes("🌶")) return null; return (m[1].match(/🌶/g) || []).length; }
function charset(d) { return d.passwordFormat === "numeric" ? "0123456789" : "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"; }
function parseArgs(args) { const o = { sleepMs: 5000, maxDynamicAttempts: 80, once: false, phish: false, verbose: false }; for (let i = 0; i < args.length; i++) { if (args[i] === "--sleep") o.sleepMs = Number(args[++i]); else if (args[i] === "--max-dynamic") o.maxDynamicAttempts = Number(args[++i]); else if (args[i] === "--once") o.once = true; else if (args[i] === "--phish") o.phish = true; else if (args[i] === "--verbose") o.verbose = true; } return o; }
export function autocomplete() { return ["--tail", "--once", "--phish", "--verbose", "--sleep", "--max-dynamic"]; }
