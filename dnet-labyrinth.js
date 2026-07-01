/**
 * Graph-search solver for darknet labyrinth servers.
 * Run this on a solved darknet server directly connected to the labyrinth.
 * Usage: run dnet-labyrinth.js th3_l4byr1nth --tail
 * Persists discovered graph data to /data/dnet-labyrinth-map.json on home.
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");
  const lab = String(ns.args[0] ?? "th3_l4byr1nth");
  if (!ns.dnet) return ns.tprint("ERROR: ns.dnet is unavailable.");

  const state = loadState(ns, lab);
  const seen = new Set();
  const path = [];
  const ok = await dfs(ns, lab, state, seen, path, 0);
  if (ok) { state.solved = true; saveState(ns, lab, state); }
  ns.tprint(ok ? `Solved ${lab}` : `No path found for ${lab}; visited ${seen.size} nodes`);
}

const MAP_FILE = "/data/dnet-labyrinth-map.json";
const DIRS = [
  { name: "north", short: "N", dx: 0, dy: -2, open: "north", back: "south" },
  { name: "east", short: "E", dx: 2, dy: 0, open: "east", back: "west" },
  { name: "south", short: "S", dx: 0, dy: 2, open: "south", back: "north" },
  { name: "west", short: "W", dx: -2, dy: 0, open: "west", back: "east" },
];

async function dfs(ns, lab, state, seen, path, depth) {
  const report = await safeAsync(() => ns.dnet.labreport(), null);
  if (!report?.success || !Array.isArray(report.coords)) {
    ns.print(`labreport failed at depth ${depth}: ${JSON.stringify(report)}`);
    return false;
  }

  const [x, y] = report.coords;
  const key = `${x},${y}`;
  recordNode(ns, lab, state, key, report);
  if (seen.has(key)) return false;
  seen.add(key);
  ns.print(`at ${key}; path=${path.join("") || "<start>"}; visited=${seen.size}; known=${Object.keys(state.nodes).length}`);

  for (const dir of orderedDirs(state, key)) {
    if (!report[dir.open]) continue;
    const nextKey = `${x + dir.dx},${y + dir.dy}`;
    if (seen.has(nextKey)) continue;

    const moved = await move(ns, lab, dir.name);
    if (moved.success) return true;
    if (!moved.moved) continue;

    path.push(dir.short);
    if (await dfs(ns, lab, state, seen, path, depth + 1)) return true;
    path.pop();

    const back = await move(ns, lab, dir.back);
    if (back.success) return true;
    if (!back.moved) {
      ns.print(`WARNING: failed to backtrack ${dir.back} from ${nextKey}: ${back.message}`);
      return false;
    }
  }
  return false;
}

function orderedDirs(state, key) {
  return [...DIRS].sort((a, b) => {
    const ak = neighborKey(key, a), bk = neighborKey(key, b);
    return Number(!!state.nodes[ak]) - Number(!!state.nodes[bk]);
  });
}
function neighborKey(key, dir) { const [x, y] = key.split(",").map(Number); return `${x + dir.dx},${y + dir.dy}`; }

function recordNode(ns, lab, state, key, report) {
  state.nodes[key] = { north: !!report.north, east: !!report.east, south: !!report.south, west: !!report.west, seen: Date.now() };
  state.updated = Date.now();
  saveState(ns, lab, state);
}

async function move(ns, lab, direction) {
  const r = await safeAsync(() => ns.dnet.authenticate(lab, `go ${direction}`), { success: false, message: "authenticate threw" });
  const message = String(r?.message ?? "");
  const moved = /You have moved to /.test(message);
  if (r?.success || /successfully navigated|discovered the end/i.test(message)) {
    ns.print(`SUCCESS via ${direction}: ${message}`);
    return { success: true, moved: true, message };
  }
  if (/cannot go that way|don't know how|lost and confused|need more/i.test(message)) ns.print(`blocked ${direction}: ${message}`);
  return { success: false, moved, message };
}

function loadState(ns, lab) {
  if (ns.getHostname() !== "home") safe(() => ns.scp(MAP_FILE, ns.getHostname(), "home"), false);
  const all = readJson(ns, MAP_FILE, {});
  return all[lab] ?? { nodes: {}, solved: false, updated: 0 };
}
function saveState(ns, lab, state) {
  const all = readJson(ns, MAP_FILE, {});
  all[lab] = { ...(all[lab] ?? {}), ...state, updated: Date.now() };
  ns.write(MAP_FILE, JSON.stringify(all, null, 2), "w");
  if (ns.getHostname() !== "home") safe(() => ns.scp(MAP_FILE, "home", ns.getHostname()), false);
}
function readJson(ns, file, fallback) { try { return JSON.parse(ns.read(file) || JSON.stringify(fallback)); } catch { return fallback; } }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
async function safeAsync(fn, fallback) { try { return await fn(); } catch (e) { return fallback ?? { success: false, message: String(e) }; } }
export function autocomplete() { return ["th3_l4byr1nth", "cru3l_l4byr1nth", "m3rc1l3ss_l4byr1nth", "ub3r_l4byr1nth", "--tail"]; }
