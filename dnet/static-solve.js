import { HINT_DB, candidateFits, ensureDnetFiles, parseArgs, pullHomeState, readJson, trySecret } from "/dnet/lib.js";

const DEFAULT_PASSWORDS = ["admin", "password", "0000", "12345"];
const DOG_NAMES = ["fido", "spot", "rover", "max"];
const EU_COUNTRIES = ["Austria","Belgium","Bulgaria","Croatia","Republic of Cyprus","Czech Republic","Denmark","Estonia","Finland","France","Germany","Greece","Hungary","Ireland","Italy","Latvia","Lithuania","Luxembourg","Malta","Netherlands","Poland","Portugal","Romania","Slovakia","Slovenia","Spain","Sweden"];
const COMMON_PASSWORDS = ["123456","password","12345678","qwerty","123456789","12345","1234","111111","1234567","dragon","123123","baseball","abc123","football","monkey","letmein","696969","shadow","master","666666","qwertyuiop","123321","mustang","1234567890","michael","654321","superman","1qaz2wsx","7777777","121212","0","qazwsx","123qwe","trustno1","jordan","jennifer","zxcvbnm","asdfgh","hunter","buster","soccer","harley","batman","andrew","tigger","sunshine","iloveyou","2000","charlie","robert","thomas","hockey","ranger","daniel","starwars","112233","george","computer","michelle","jessica","pepper","1111","zxcvbn","555555","11111111","131313","freedom","777777","pass","maggie","159753","aaaaaa","ginger","princess","joshua","cheese","amanda","summer","love","ashley","6969","nicole","chelsea","biteme","matthew","access","yankees","987654321","dallas","austin","thunder","taylor","matrix"];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const opts = parseArgs(ns.args);
  await ensureDnetFiles(ns);
  if (opts.once) return await tick(ns);
  while (true) { await tick(ns); await ns.sleep(opts.sleepMs); }
}
async function tick(ns) {
  pullHomeState(ns);
  for (const target of ns.dnet.probe()) {
    const d = ns.dnet.getServerDetails(target);
    if (d.hasSession) continue;
    const hints = readJson(ns, HINT_DB, {});
    const candidates = unique(makeCandidates(d, hints[target] || {}));
    for (const c of candidates) if (await trySecret(ns, target, c, d)) break;
  }
}
function makeCandidates(d, h) {
  const text = `${d.passwordHint || ""} ${d.data || ""} ${h.lastLogs || ""}`;
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
  if (d.modelId === "OctantVoxel" && d.data?.includes(",")) { const [base, enc] = d.data.split(","); out.push(...baseConversionCandidates(enc, Number(base))); }
  if (d.modelId === "MathML" && d.data) out.push(String(parseArithmetic(d.data)));
  if (d.modelId === "PrimeTime 2" && d.data) out.push(String(largestPrimeFactor(Number(d.data))));
  if (d.modelId === "BellaCuore" && d.data && !d.data.includes(",")) out.push(String(romanToInt(d.data)));
  out.push(...literalHints(text), ...extractSecretsFromText(text));
  return out.filter(x => candidateFits(d, x)).map(String);
}
function unique(a) { return [...new Set(a)]; }
function literalHints(text) { const out = []; for (const re of [/password is\s+([^\s]+)/ig,/pin is\s+([^\s]+)/ig,/key is\s+([^\s]+)/ig,/secret is\s+([^\s]+)/ig]) { let m; while ((m = re.exec(text))) out.push(m[1].replace(/["'.:,;]+$/g, "")); } return out; }
function extractSecretsFromText(text) { return String(text).match(/[A-Za-z0-9■]{1,50}/g) || []; }
function decodeXor(s) { return String(s).split("").map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(""); }
function romanToInt(s) { const v = {I:1,V:5,X:10,L:50,C:100,D:500,M:1000}; let n=0,p=0; for (const c of String(s).toUpperCase().split("").reverse()) { const x=v[c]||0; n += x < p ? -x : x; p = Math.max(p, x); } return n; }
function baseConversionCandidates(s, base) { const n = parseInt(String(s).trim(), base); return Number.isFinite(n) ? [String(n), n.toString(16), n.toString(8), n.toString(2)] : []; }
function largestPrimeFactor(n) { let best=1; for (let d=2; d*d<=n; d += d===2 ? 1 : 2) while (n%d===0) { best=d; n/=d; } return n>1?n:best; }
function parseArithmetic(s) { try { if (!/^[\d+\-*/%() .]+$/.test(s)) return NaN; return Function(`return (${s})`)(); } catch { return NaN; } }
