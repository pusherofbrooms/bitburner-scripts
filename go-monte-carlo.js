/**
 * IPvGO Monte Carlo playout player.
 *
 * Usage:
 *   run go-monte-carlo.js <opponent> [boardSize] [games] [playoutsPerMove] [verbose]
 *   run go-monte-carlo.js "Slum Snakes" 5 10 40
 *
 * Args:
 *   0: opponent/faction name: Netburners, Slum Snakes, The Black Hand, Tetrads,
 *      Daedalus, Illuminati, ????????????, No AI
 *   1: board size: 5, 7, 9, or 13. Default 5.
 *   2: number of games. Default 1. Use 0 for forever.
 *   3: random playouts per candidate move. Default 32.
 *   4: verbose move logging. Default false. Use true/1/verbose.
 *
 * This intentionally uses a lightweight approximate Go simulator. It ignores
 * superko beyond normal in-game move validation for the real current move, so it
 * is a test bot rather than a perfect Go engine.
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
  const playouts = Math.max(1, Math.floor(Number(ns.args[3] ?? 32)));
  const verbose = parseVerbose(ns.args[4]);

  if (![5, 7, 9, 13].includes(size)) {
    ns.tprintf("ERROR: board size must be 5, 7, 9, or 13; got %s", size);
    return;
  }

  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();
  ns.ui.setTailTitle(`IPvGO MC ${opponent} ${size}x${size}`);
  ns.ui.resizeTail(950, 520);

  let played = 0;
  while (games === 0 || played < games) {
    played++;
    ns.print(`Starting IPvGO MC game ${played}${games ? `/${games}` : ""}: ${opponent}, ${size}x${size}, ${playouts} playouts/move`);

    try {
      ns.go.resetBoardState(opponent, size);
    } catch (e) {
      ns.tprintf("ERROR: could not start IPvGO game: %s", String(e));
      return;
    }

    let turns = 0;
    while (ns.go.getCurrentPlayer() !== "None") {
      if (ns.go.getCurrentPlayer() === "White") {
        await ns.go.opponentNextTurn(false);
        await ns.sleep(5);
        continue;
      }

      const board = ns.go.getBoardState();
      const valid = ns.go.analysis.getValidMoves();
      const komi = ns.go.getGameState().komi;
      const move = chooseMonteCarloMove(board, valid, komi, playouts);

      if (!move) {
        const result = await ns.go.passTurn();
        if (verbose) ns.print(`Pass -> ${result.type}`);
      } else {
        turns++;
        const result = await ns.go.makeMove(move.x, move.y);
        if (verbose) {
          ns.print(
            `Move ${turns}: ${coord(move.x, move.y)} win=${formatPct(move.winRate)} margin=${move.avgMargin.toFixed(2)} sims=${move.playouts} -> ${result.type}`,
          );
        }
      }

      if (turns > size * size * 2) {
        ns.print("Safety pass/end condition reached.");
        await ns.go.passTurn();
      }
      await ns.sleep(5);
    }

    const state = ns.go.getGameState();
    const stats = ns.go.analysis.getStats()[opponent];
    ns.printf(
      "IPvGO MC %s complete: black=%s white=%s streak=%s wins=%s losses=%s bonus=%s%s",
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

function chooseMonteCarloMove(board, valid, komi, playoutsPerMove) {
  const candidates = [];
  for (let x = 0; x < valid.length; x++) {
    for (let y = 0; y < valid[x].length; y++) {
      if (valid[x][y]) candidates.push({ x, y });
    }
  }
  if (!candidates.length) return null;

  // Tactical shortcut: immediate captures are usually excellent and save sim time.
  let bestCapture = null;
  for (const m of candidates) {
    const sim = simulateMove(board, m.x, m.y, "X");
    if (sim && (!bestCapture || sim.captured > bestCapture.captured)) bestCapture = { ...m, captured: sim.captured };
  }
  if (bestCapture?.captured > 0) {
    return { ...bestCapture, winRate: 1, avgMargin: 99 + bestCapture.captured, playouts: 0 };
  }

  let best = null;
  for (const m of candidates) {
    const first = simulateMove(board, m.x, m.y, "X");
    if (!first) continue;

    let wins = 0;
    let marginSum = 0;
    for (let i = 0; i < playoutsPerMove; i++) {
      const result = randomPlayout(first.board, "O", komi);
      if (result.margin > 0) wins++;
      marginSum += result.margin;
    }

    const winRate = wins / playoutsPerMove;
    const avgMargin = marginSum / playoutsPerMove;
    // Prefer win rate, then average margin. Tiny shape bonus breaks ties.
    const rank = winRate * 1000 + avgMargin + moveShapeBonus(board, m.x, m.y) * 0.01;
    const scored = { ...m, winRate, avgMargin, rank, playouts: playoutsPerMove };
    if (!best || scored.rank > best.rank) best = scored;
  }

  if (!best) return null;

  // If we are already ahead, passing may be best. Use a conservative threshold
  // to avoid endless self-filling in won positions.
  const s = areaScore(board, komi);
  if (s.margin > 0 && best.avgMargin < s.margin - 3) return null;

  return best;
}

function randomPlayout(startBoard, colorToMove, komi) {
  let board = startBoard;
  let color = colorToMove;
  let passes = 0;
  let moves = 0;
  const maxMoves = board.length * board.length * 2;

  while (passes < 2 && moves < maxMoves) {
    const legal = getLegalMoves(board, color);
    const currentScore = areaScore(board, komi).margin;

    // Prefer ending when the side to move is already ahead late-ish.
    const shouldConsiderPass = moves > board.length || legal.length === 0;
    const sideAhead = color === "X" ? currentScore > 0 : currentScore < 0;
    if (!legal.length || (shouldConsiderPass && sideAhead && Math.random() < 0.35)) {
      passes++;
      color = other(color);
      moves++;
      continue;
    }

    const move = biasedRandomMove(board, legal, color);
    const sim = simulateMove(board, move.x, move.y, color);
    if (!sim) {
      passes++;
    } else {
      board = sim.board;
      passes = 0;
    }
    color = other(color);
    moves++;
  }

  return areaScore(board, komi);
}

function biasedRandomMove(board, legal, color) {
  // Random playouts are stronger if they are not purely uniform. Bias toward
  // captures, defenses, corners/edges, and contact with stones.
  let best = [];
  let bestScore = -Infinity;
  for (const m of legal) {
    const sim = simulateMove(board, m.x, m.y, color);
    if (!sim) continue;
    const score = sim.captured * 20 + moveShapeBonus(board, m.x, m.y) + Math.random() * 2;
    if (score > bestScore + 0.001) {
      bestScore = score;
      best = [m];
    } else if (Math.abs(score - bestScore) <= 0.001) {
      best.push(m);
    }
  }
  return best.length ? best[Math.floor(Math.random() * best.length)] : legal[Math.floor(Math.random() * legal.length)];
}

function getLegalMoves(board, color) {
  const out = [];
  for (let x = 0; x < board.length; x++) {
    for (let y = 0; y < board[x].length; y++) {
      if (board[x][y] !== ".") continue;
      if (simulateMove(board, x, y, color)) out.push({ x, y });
    }
  }
  return out;
}

function simulateMove(board, x, y, color) {
  const b = board.map((col) => col.split(""));
  if (b[x]?.[y] !== ".") return null;
  b[x][y] = color;

  const opponent = other(color);
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

function areaScore(board, komi) {
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

  const black = blackStones + blackTerritory;
  const white = whiteStones + whiteTerritory + komi;
  return { black, white, margin: black - white };
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

function moveShapeBonus(board, x, y) {
  const n = board.length;
  let bonus = 0;
  const corner = (x === 0 || x === n - 1) && (y === 0 || y === n - 1);
  const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
  if (corner) bonus += 8;
  else if (edge) bonus += 3;

  let own = 0, enemy = 0, empty = 0;
  for (const [nx, ny] of neighborsFromBoard(board, x, y)) {
    if (board[nx][ny] === "X") own++;
    else if (board[nx][ny] === "O") enemy++;
    else if (board[nx][ny] === ".") empty++;
  }
  bonus += own * 4 + enemy * 2 + empty * 0.5;
  if (n >= 7 && !edge) bonus += 1;
  return bonus;
}

function neighbors(b, x, y) {
  const n = b.length;
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, c]) => a >= 0 && c >= 0 && a < n && c < n && b[a][c] !== "#");
}

function neighborsFromBoard(board, x, y) {
  const n = board.length;
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, c]) => a >= 0 && c >= 0 && a < n && c < n && board[a][c] !== "#");
}

function other(color) {
  return color === "X" ? "O" : "X";
}

function coord(x, y) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function formatPct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function printUsage(ns) {
  ns.tprintf("Usage: run go-monte-carlo.js <opponent> [boardSize] [games] [playoutsPerMove] [verbose]");
  ns.tprintf("  boardSize: 5, 7, 9, or 13. Default: 5");
  ns.tprintf("  games: number of games to play. Default: 1. Use 0 for forever.");
  ns.tprintf("  playoutsPerMove: random playouts per legal candidate. Default: 32");
  ns.tprintf("  verbose: log every move. Default: false. Use true/1/verbose.");
  ns.tprintf("Playable opponents:");
  for (const opponent of OPPONENTS) ns.tprintf(`  - ${opponent}`);
  ns.tprintf("Examples:");
  ns.tprintf('  run go-monte-carlo.js "Slum Snakes" 5 10 40');
  ns.tprintf('  run go-monte-carlo.js "Daedalus" 7 0 24 true');
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
