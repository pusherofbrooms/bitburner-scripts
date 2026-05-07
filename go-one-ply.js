/**
 * IPvGO heuristic player with actual one-ply move scoring.
 *
 * Usage:
 *   run go-one-ply.js "Netburners" 5 10
 *   run go-one-ply.js "Daedalus" 7 1 true
 *
 * Args:
 *   0: opponent/faction name: Netburners, Slum Snakes, The Black Hand, Tetrads,
 *      Daedalus, Illuminati, ????????????, No AI
 *   1: board size: 5, 7, 9, or 13. Default 5.
 *   2: number of games. Default 1. Use 0 for forever.
 *   3: verbose move logging. Default false. Use true/1/verbose.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  if (ns.args.length < 1) {
    printUsage(ns);
    return;
  }

  const opponent = String(ns.args[0]);
  const size = Number(ns.args[1] ?? 5);
  const games = Number(ns.args[2] ?? 1);
  const verbose = parseVerbose(ns.args[3]);

  if (![5, 7, 9, 13].includes(size)) {
    ns.tprintf("ERROR: board size must be 5, 7, 9, or 13; got %s", size);
    return;
  }

  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();
  ns.ui.setTailTitle(`IPvGO ${opponent} ${size}x${size}`);
  ns.ui.resizeTail(900, 500);

  let played = 0;
  while (games === 0 || played < games) {
    played++;
    ns.print(`Starting IPvGO game ${played}${games ? `/${games}` : ""}: ${opponent}, ${size}x${size}`);

    try {
      ns.go.resetBoardState(opponent, size);
    } catch (e) {
      ns.tprintf("ERROR: could not start IPvGO game: %s", String(e));
      return;
    }

    let passes = 0;
    let turns = 0;
    while (ns.go.getCurrentPlayer() !== "None") {
      const current = ns.go.getCurrentPlayer();
      if (current === "White") {
        await ns.go.opponentNextTurn(false);
        await ns.sleep(5);
        continue;
      }

      const board = ns.go.getBoardState();
      const valid = ns.go.analysis.getValidMoves();
      const move = chooseMove(board, valid);

      if (!move) {
        const result = await ns.go.passTurn();
        passes++;
        if (verbose) ns.print(`Pass (${result.type})`);
      } else {
        const result = await ns.go.makeMove(move.x, move.y);
        turns++;
        passes = 0;
        if (verbose) ns.print(`Move ${turns}: ${coord(move.x, move.y)} score=${move.score.toFixed(2)} (${move.reason}) -> ${result.type}`);
      }

      // Safety valve: if something goes weird, pass out rather than spin forever.
      if (turns > size * size * 2 || passes > 3) {
        ns.print("Safety pass/end condition reached.");
        await ns.go.passTurn();
      }
      await ns.sleep(5);
    }

    const state = ns.go.getGameState();
    const stats = ns.go.analysis.getStats()[opponent];
    ns.printf(
      "IPvGO %s complete: black=%s white=%s streak=%s wins=%s losses=%s bonus=%s%s",
      opponent,
      state.blackScore,
      state.whiteScore,
      stats?.winStreak ?? "?",
      stats?.wins ?? "?",
      stats?.losses ?? "?",
      (stats?.bonusPercent ?? 0).toFixed ? stats.bonusPercent.toFixed(3) : "?",
      "%",
    );
  }
}

function chooseMove(board, valid) {
  const current = evaluateBoard(board);
  let best = null;
  const moves = [];

  for (let x = 0; x < valid.length; x++) {
    for (let y = 0; y < valid[x].length; y++) {
      if (!valid[x][y]) continue;
      const sim = simulateMove(board, x, y, "X");
      if (!sim) continue;

      const evalScore = evaluateBoard(sim.board);
      const shape = moveShapeBonus(board, x, y, "X");
      const tactics = tacticalBonus(board, sim, x, y, "X");
      const score = evalScore + shape + tactics;
      const reason = `eval ${evalScore.toFixed(1)}, shape ${shape.toFixed(1)}, tactics ${tactics.toFixed(1)}, cap ${sim.captured}`;

      moves.push({ x, y, score, evalScore, reason, captured: sim.captured });
      if (!best || score > best.score) best = moves[moves.length - 1];
    }
  }

  if (!best) return null;

  // If ahead and the best move appears to make our position worse, pass.
  // This helps finish games instead of filling our own territory forever.
  const rawBoardScore = boardScore(board);
  if (rawBoardScore.black > rawBoardScore.white && best.evalScore < current - 2 && !best.captured) return null;

  // Randomize among near-equal top moves so play is less deterministic.
  const near = moves.filter((m) => m.score >= best.score - 0.5);
  return near[Math.floor(Math.random() * near.length)];
}

function simulateMove(board, x, y, color) {
  const b = board.map((col) => col.split(""));
  if (b[x]?.[y] !== ".") return null;
  b[x][y] = color;

  const opponent = color === "X" ? "O" : "X";
  let captured = 0;
  for (const [nx, ny] of neighbors(b, x, y)) {
    if (b[nx][ny] !== opponent) continue;
    const group = collectGroup(b, nx, ny);
    if (countLiberties(b, group) === 0) {
      captured += group.length;
      for (const p of group) b[p.x][p.y] = ".";
    }
  }

  const own = collectGroup(b, x, y);
  if (countLiberties(b, own) === 0) return null;

  return { board: b.map((col) => col.join("")), captured };
}

function evaluateBoard(board) {
  const score = boardScore(board);
  const groups = allGroups(board);
  let value = 0;

  value += (score.black - score.white) * 10;
  value += score.blackStones * 1.2 - score.whiteStones * 1.3;
  value += score.blackTerritory * 4 - score.whiteTerritory * 4.5;

  for (const g of groups) {
    const libs = countLibertiesFromBoard(board, g.points);
    if (g.color === "X") {
      value += Math.min(libs, 6) * 1.4;
      if (libs === 1) value -= 25;
      if (libs === 2) value -= 6;
    } else if (g.color === "O") {
      value -= Math.min(libs, 6) * 1.1;
      if (libs === 1) value += 18;
      if (libs === 2) value += 4;
    }
  }

  return value;
}

function tacticalBonus(before, sim, x, y, color = "X") {
  const opponent = color === "X" ? "O" : "X";
  const beforeArray = before.map((c) => c.split(""));
  const afterArray = sim.board.map((c) => c.split(""));
  let bonus = 0;
  if (sim.captured) bonus += 35 * sim.captured;

  const afterGroup = collectGroup(afterArray, x, y);
  const libs = countLibertiesFromBoard(sim.board, afterGroup);
  const adjacent = countAdjacentColors(before, x, y, color, opponent);
  if (libs === 1 && !sim.captured) bonus -= 35;
  if (libs === 2 && adjacent.enemy && !adjacent.own && !sim.captured) bonus -= 12;
  else if (libs === 2 && adjacent.enemy && !sim.captured) bonus -= 5;
  if (libs >= 3) bonus += 3;

  // Defend: if the move was a liberty of one of this color's endangered groups, reward it.
  const defended = new Set();
  for (const [nx, ny] of neighborsFromBoard(before, x, y)) {
    if (before[nx][ny] !== color) continue;
    const group = collectGroup(beforeArray, nx, ny);
    const key = groupKey(group);
    if (defended.has(key)) continue;
    defended.add(key);
    if (countLibertiesFromBoard(before, group) === 1) bonus += 22 + group.length * 6;
  }

  // Attack: putting an adjacent enemy group into atari is forcing, but less valuable
  // than an immediate capture because the opponent often gets to answer.
  const attacked = new Set();
  for (const [nx, ny] of neighborsFromBoard(sim.board, x, y)) {
    if (sim.board[nx][ny] !== opponent) continue;
    const group = collectGroup(afterArray, nx, ny);
    const key = groupKey(group);
    if (attacked.has(key)) continue;
    attacked.add(key);
    if (countLibertiesFromBoard(sim.board, group) === 1) bonus += 8 + group.length * 3;
  }

  return bonus;
}

function countAdjacentColors(board, x, y, color, opponent) {
  let own = 0, enemy = 0;
  for (const [nx, ny] of neighborsFromBoard(board, x, y)) {
    if (board[nx][ny] === color) own++;
    else if (board[nx][ny] === opponent) enemy++;
  }
  return { own, enemy };
}

function groupKey(group) {
  return group.map((p) => `${p.x},${p.y}`).sort().join(";");
}

function moveShapeBonus(board, x, y, color = "X") {
  const n = board.length;
  let bonus = 0;
  const corner = (x === 0 || x === n - 1) && (y === 0 || y === n - 1);
  const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
  if (corner) bonus += 8;
  else if (edge) bonus += 3;

  let own = 0, enemy = 0, empty = 0;
  for (const [nx, ny] of neighborsFromBoard(board, x, y)) {
    if (board[nx][ny] === color) own++;
    else if (board[nx][ny] !== ".") enemy++;
    else if (board[nx][ny] === ".") empty++;
  }
  bonus += own * 4 + enemy * 2 + empty * 0.5;

  // Opening: avoid first-line-only crawling on larger boards, but don't overdo it on 5x5.
  if (n >= 7 && !edge) bonus += 1;
  return bonus;
}

function boardScore(board) {
  const n = board.length;
  let blackStones = 0, whiteStones = 0, blackTerritory = 0, whiteTerritory = 0;
  const seen = Array.from({ length: n }, () => Array(n).fill(false));

  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const c = board[x][y];
      if (c === "X") blackStones++;
      else if (c === "O") whiteStones++;
      else if (c === "." && !seen[x][y]) {
        const region = floodEmpty(board, x, y, seen);
        if (region.borderX && !region.borderO) blackTerritory += region.size;
        else if (region.borderO && !region.borderX) whiteTerritory += region.size;
      }
    }
  }
  return {
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    black: blackStones + blackTerritory,
    white: whiteStones + whiteTerritory,
  };
}

function floodEmpty(board, sx, sy, seen) {
  const q = [{ x: sx, y: sy }];
  seen[sx][sy] = true;
  let size = 0, borderX = false, borderO = false;
  while (q.length) {
    const p = q.pop();
    size++;
    for (const [nx, ny] of neighborsFromBoard(board, p.x, p.y)) {
      const c = board[nx][ny];
      if (c === "." && !seen[nx][ny]) {
        seen[nx][ny] = true;
        q.push({ x: nx, y: ny });
      } else if (c === "X") borderX = true;
      else if (c === "O") borderO = true;
    }
  }
  return { size, borderX, borderO };
}

function allGroups(board) {
  const n = board.length;
  const seen = Array.from({ length: n }, () => Array(n).fill(false));
  const groups = [];
  const b = board.map((c) => c.split(""));
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const c = board[x][y];
      if ((c !== "X" && c !== "O") || seen[x][y]) continue;
      const points = collectGroup(b, x, y);
      for (const p of points) seen[p.x][p.y] = true;
      groups.push({ color: c, points });
    }
  }
  return groups;
}

function collectGroup(b, sx, sy) {
  const color = b[sx][sy];
  const q = [{ x: sx, y: sy }];
  const seen = new Set([`${sx},${sy}`]);
  const out = [];
  while (q.length) {
    const p = q.pop();
    out.push(p);
    for (const [nx, ny] of neighbors(b, p.x, p.y)) {
      const key = `${nx},${ny}`;
      if (!seen.has(key) && b[nx][ny] === color) {
        seen.add(key);
        q.push({ x: nx, y: ny });
      }
    }
  }
  return out;
}

function countLiberties(b, group) {
  const libs = new Set();
  for (const p of group) {
    for (const [nx, ny] of neighbors(b, p.x, p.y)) {
      if (b[nx][ny] === ".") libs.add(`${nx},${ny}`);
    }
  }
  return libs.size;
}

function countLibertiesFromBoard(board, group) {
  const libs = new Set();
  for (const p of group) {
    for (const [nx, ny] of neighborsFromBoard(board, p.x, p.y)) {
      if (board[nx][ny] === ".") libs.add(`${nx},${ny}`);
    }
  }
  return libs.size;
}

function neighbors(b, x, y) {
  const n = b.length;
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, c]) => a >= 0 && c >= 0 && a < n && c < n && b[a][c] !== "#");
}

function neighborsFromBoard(board, x, y) {
  const n = board.length;
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, c]) => a >= 0 && c >= 0 && a < n && c < n && board[a][c] !== "#");
}

function coord(x, y) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function printUsage(ns) {
  ns.tprintf("Usage: run go-one-ply.js <opponent> [boardSize] [games] [verbose]");
  ns.tprintf("  boardSize: 5, 7, 9, or 13. Default: 5");
  ns.tprintf("  games: number of games to play. Default: 1. Use 0 for forever.");
  ns.tprintf("  verbose: log every move. Default: false. Use true/1/verbose.");
  ns.tprintf("Playable opponents:");
  for (const opponent of OPPONENTS) ns.tprintf(`  - ${opponent}`);
  ns.tprintf("Examples:");
  ns.tprintf('  run go-one-ply.js "Netburners" 5 10');
  ns.tprintf('  run go-one-ply.js "Daedalus" 7 0 true');
}

function parseVerbose(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return false;
  return ["1", "true", "yes", "verbose", "v"].includes(String(value).toLowerCase());
}

const OPPONENTS = [
  "Netburners",
  "Slum Snakes",
  "The Black Hand",
  "Tetrads",
  "Daedalus",
  "Illuminati",
  "????????????",
  "No AI",
];
