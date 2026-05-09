/**
 * IPvGO opponent-aware shallow lookahead player.
 *
 * Usage:
 *   run go-lookahead.js --opponent "Daedalus" --size 7 --games 10
 *   run go-lookahead.js --opponent "Illuminati" --size 7 --games 0 --verbose --candidates 12 --replies 6
 *
 * Named flags:
 *   --opponent     Faction: Netburners, Slum Snakes, The Black Hand, Tetrads, Daedalus, Illuminati, ????????????, No AI
 *   --size         Board size: 5, 7, 9, or 13. Default 5.
 *   --games        Number of games. Default 1. Use 0 for forever.
 *   --verbose      Log every move.
 *   --candidates   Black candidate moves to search. Default auto by board size.
 *   --replies      White reply moves to consider. Default auto by board size.
 *   --three-ply    Selectively search one black answer after forcing white replies. Default true.
 *   --no-three-ply Disable selective 3-ply.
 *   --sleep        Sleep between turns in ms. Default 5.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["opponent", "Netburners"],
    ["size", 5],
    ["games", 1],
    ["verbose", false],
    ["candidates", 0],
    ["replies", 0],
    ["three-ply", true],
    ["no-three-ply", false],
    ["sleep", 5],
    ["help", false],
  ]);

  if (flags.help) {
    printUsage(ns);
    return;
  }

  const opponent = String(flags.opponent);
  const size = Number(flags.size);
  const games = Number(flags.games);
  const verbose = Boolean(flags.verbose);
  const candidates = Number(flags.candidates) || autoCandidateLimit(size);
  const replies = Number(flags.replies) || autoReplyLimit(size);
  const threePly = flags["no-three-ply"] ? false : parseBool(flags["three-ply"]);
  const sleepMs = Number(flags.sleep ?? 5);

  if (!OPPONENTS.includes(opponent)) {
    ns.tprintf("ERROR: unknown opponent '%s'. Use --help for the list.", opponent);
    return;
  }
  if (![5, 7, 9, 13].includes(size)) {
    ns.tprintf("ERROR: board size must be 5, 7, 9, or 13; got %s", size);
    return;
  }

  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();
  ns.ui.setTailTitle(`IPvGO lookahead ${opponent} ${size}x${size}`);
  ns.ui.resizeTail(980, 540);

  const options = { opponent, candidates, replies, threePly };
  let played = 0;
  while (games === 0 || played < games) {
    played++;
    ns.print(
      `Starting IPvGO lookahead game ${played}${games ? `/${games}` : ""}: ${opponent}, ${size}x${size}, candidates=${candidates}, replies=${replies}, threePly=${threePly}`,
    );

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
        await ns.sleep(sleepMs);
        continue;
      }

      const board = ns.go.getBoardState();
      const valid = ns.go.analysis.getValidMoves();
      const move = chooseLookaheadMove(board, valid, options);

      if (!move) {
        const result = await ns.go.passTurn();
        passes++;
        if (verbose) ns.print(`Pass (${result.type})`);
      } else {
        const result = await ns.go.makeMove(move.x, move.y);
        turns++;
        passes = 0;
        if (verbose) {
          ns.print(
            `Move ${turns}: ${coord(move.x, move.y)} score=${move.score.toFixed(2)} reply=${move.reply ? coord(move.reply.x, move.reply.y) : "none"} (${move.reason}) -> ${result.type}`,
          );
        }
      }

      if (turns > size * size * 2 || passes > 3) {
        ns.print("Safety pass/end condition reached.");
        await ns.go.passTurn();
      }
      await ns.sleep(sleepMs);
    }

    const state = ns.go.getGameState();
    const stats = ns.go.analysis.getStats()[opponent];
    ns.printf(
      "IPvGO lookahead %s complete: black=%s white=%s streak=%s wins=%s losses=%s bonus=%s%s",
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

function chooseLookaheadMove(board, valid, options) {
  const current = evaluateBoard(board);
  const rawBoardScore = boardScore(board);
  const candidates = rankMoves(board, valid, "X", options.opponent)
    .sort((a, b) => b.onePly - a.onePly)
    .slice(0, options.candidates);

  if (!candidates.length) return null;

  let best = null;
  const scoredMoves = [];
  for (const move of candidates) {
    const replyInfo = chooseLikelyReply(move.sim.board, options);
    const afterReplyScore = replyInfo ? replyInfo.blackScoreAfterReply : evaluateBoard(move.sim.board);
    const finalScore = afterReplyScore + move.onePly * 0.12 + Math.random() * 0.03;
    const scored = {
      ...move,
      score: finalScore,
      reply: replyInfo?.reply ?? null,
      reason: `1p ${move.onePly.toFixed(1)}, afterReply ${afterReplyScore.toFixed(1)}, cap ${move.sim.captured}`,
    };
    scoredMoves.push(scored);
    if (!best || scored.score > best.score) best = scored;
  }

  if (!best) return null;

  // Pass when ahead and every searched move appears to self-fill or worsen the position after the likely reply.
  if (rawBoardScore.black > rawBoardScore.white && best.score < current - 2 && !best.sim.captured) return null;

  const near = scoredMoves.filter((m) => m.score >= best.score - 0.35);
  return near[Math.floor(Math.random() * near.length)];
}

function chooseLikelyReply(boardAfterBlack, options) {
  const whiteMoves = rankMoves(boardAfterBlack, getLegalMoveGrid(boardAfterBlack, "O"), "O", options.opponent)
    .sort((a, b) => b.replyRank - a.replyRank)
    .slice(0, options.replies);

  if (!whiteMoves.length) return null;

  let worst = null;
  for (const reply of whiteMoves) {
    let blackScore = evaluateBoard(reply.sim.board);
    if (options.threePly && isForcingPosition(boardAfterBlack, reply)) {
      blackScore = Math.max(blackScore, bestSelectiveBlackAnswer(reply.sim.board));
    }

    // Stronger opponents are more likely to find the most punishing reply. We use the minimum
    // black score among their likely top replies rather than expensive probability sampling.
    const scored = { reply, blackScoreAfterReply: blackScore };
    if (!worst || scored.blackScoreAfterReply < worst.blackScoreAfterReply) worst = scored;
  }
  return worst;
}

function bestSelectiveBlackAnswer(board) {
  const moves = rankMoves(board, getLegalMoveGrid(board, "X"), "X", "Illuminati")
    .sort((a, b) => b.onePly - a.onePly)
    .slice(0, 4);
  let best = evaluateBoard(board);
  for (const m of moves) best = Math.max(best, evaluateBoard(m.sim.board) + m.onePly * 0.08);
  return best;
}

function rankMoves(board, valid, color, opponentName) {
  const out = [];
  for (let x = 0; x < valid.length; x++) {
    for (let y = 0; y < valid[x].length; y++) {
      if (!valid[x][y]) continue;
      const sim = simulateMove(board, x, y, color);
      if (!sim) continue;
      const score = scoreMove(board, sim, x, y, color);
      const priority = opponentPriorityBonus(board, sim, x, y, color, opponentName);
      out.push({ x, y, sim, onePly: score + priority.blackBias, replyRank: score + priority.replyBias, priority });
    }
  }
  return out;
}

function scoreMove(before, sim, x, y, color) {
  const sign = color === "X" ? 1 : -1;
  const evalScore = evaluateBoard(sim.board) * sign;
  return (
    evalScore +
    moveShapeBonus(before, x, y, color) +
    tacticalBonus(before, sim, x, y, color) +
    strategicBonus(before, sim, x, y, color)
  );
}

function opponentPriorityBonus(before, sim, x, y, color, opponentName) {
  const opponentColor = color === "X" ? "O" : "X";
  const capture = sim.captured;
  const defend = isDefendingEndangeredGroup(before, x, y, color);
  const attack = countAdjacentEnemyGroupsInAtari(sim.board, x, y, opponentColor);
  const eye = makesLikelyEye(sim.board, x, y, color);
  const blockEye = makesLikelyEye(sim.board, x, y, opponentColor);
  const corner = cornerInfluenceBonus(before, x, y) > 0;
  let replyBias = 0;

  switch (opponentName) {
    case "Netburners":
      replyBias += capture * 30 + (defend ? 8 : 0) + attack * 5 + Math.random() * 8;
      break;
    case "Slum Snakes":
      replyBias += capture * 35 + (defend ? 28 : 0) + attack * 8 + libertyGrowthBonus(before, sim.board, x, y, color, capture) * 1.5;
      break;
    case "The Black Hand":
      replyBias += capture * 55 + attack * 24 + (defend ? 20 : 0);
      break;
    case "Tetrads":
      replyBias += capture * 50 + (defend ? 30 : 0) + attack * 18 + contactCount(before, x, y) * 5;
      break;
    case "Daedalus":
      replyBias += capture * 65 + (defend ? 42 : 0) + (eye ? 22 : 0) + attack * 22 + (blockEye ? 12 : 0) + (corner ? 10 : 0);
      break;
    case "Illuminati":
    case "????????????":
      replyBias += capture * 70 + (defend ? 45 : 0) + (eye ? 28 : 0) + attack * 25 + (blockEye ? 16 : 0) + (corner ? 12 : 0);
      break;
    default:
      replyBias += capture * 40 + (defend ? 25 : 0) + attack * 12;
      break;
  }

  // For black candidate ranking, the generic one-ply score is already primary; this only nudges
  // forcing tactical moves into the searched candidate set.
  const blackBias = capture * 20 + (defend ? 16 : 0) + attack * 6 + (eye ? 5 : 0);
  return { replyBias, blackBias, capture, defend, attack, eye, blockEye };
}

function isForcingPosition(beforeReply, reply) {
  if (reply.sim.captured > 0) return true;
  if (reply.priority.attack > 0 || reply.priority.defend) return true;
  return hasGroupWithFewLiberties(beforeReply, "X", 2) || hasGroupWithFewLiberties(reply.sim.board, "X", 2);
}

function getLegalMoveGrid(board, color) {
  return board.map((col, x) => col.split("").map((c, y) => c === "." && !!simulateMove(board, x, y, color)));
}

function autoCandidateLimit(size) {
  if (size <= 5) return 8;
  if (size <= 7) return 12;
  if (size <= 9) return 14;
  return 16;
}

function autoReplyLimit(size) {
  if (size <= 5) return 5;
  if (size <= 7) return 6;
  if (size <= 9) return 7;
  return 8;
}

function parseBool(value) {
  if (typeof value === "boolean") return value;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
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

function strategicBonus(before, sim, x, y, color = "X") {
  const opponent = color === "X" ? "O" : "X";
  let bonus = 0;

  // Avoid filling points already safely controlled by us unless there is a concrete tactical reason.
  const owner = territoryOwner(before, x, y);
  const adjacent = countAdjacentColors(before, x, y, color, opponent);
  const defending = isDefendingEndangeredGroup(before, x, y, color);
  if (owner === color && !sim.captured && !defending) bonus -= 18;
  else if (owner === opponent && (adjacent.enemy || sim.captured)) bonus += 6;

  bonus += libertyGrowthBonus(before, sim.board, x, y, color, sim.captured);
  bonus += cornerInfluenceBonus(before, x, y);
  return bonus;
}

function moveShapeBonus(board, x, y, color = "X") {
  const n = board.length;
  let bonus = 0;
  const corner = (x === 0 || x === n - 1) && (y === 0 || y === n - 1);
  const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
  if (n <= 5) {
    if (corner) bonus += 8;
    else if (edge) bonus += 3;
  } else {
    if (corner) bonus -= 3;
    else if (edge) bonus -= 1;
  }

  let own = 0, enemy = 0, empty = 0;
  for (const [nx, ny] of neighborsFromBoard(board, x, y)) {
    if (board[nx][ny] === color) own++;
    else if (board[nx][ny] !== ".") enemy++;
    else if (board[nx][ny] === ".") empty++;
  }
  bonus += own * 4 + enemy * 2 + empty * 0.5;

  // Opening: prefer useful interior influence on larger boards instead of first-line crawling.
  if (n >= 7 && !edge) bonus += 1;
  return bonus;
}

function territoryOwner(board, x, y) {
  if (board[x]?.[y] !== ".") return null;
  const region = floodEmpty(board, x, y, Array.from({ length: board.length }, () => Array(board.length).fill(false)));
  if (region.borderX && !region.borderO) return "X";
  if (region.borderO && !region.borderX) return "O";
  return null;
}

function isDefendingEndangeredGroup(board, x, y, color) {
  const b = board.map((c) => c.split(""));
  const seen = new Set();
  for (const [nx, ny] of neighborsFromBoard(board, x, y)) {
    if (board[nx][ny] !== color) continue;
    const group = collectGroup(b, nx, ny);
    const key = groupKey(group);
    if (seen.has(key)) continue;
    seen.add(key);
    if (countLibertiesFromBoard(board, group) <= 1) return true;
  }
  return false;
}

function libertyGrowthBonus(before, after, x, y, color, captured) {
  const beforeArray = before.map((c) => c.split(""));
  const afterArray = after.map((c) => c.split(""));
  const adjacentGroups = [];
  const seen = new Set();
  for (const [nx, ny] of neighborsFromBoard(before, x, y)) {
    if (before[nx][ny] !== color) continue;
    const group = collectGroup(beforeArray, nx, ny);
    const key = groupKey(group);
    if (seen.has(key)) continue;
    seen.add(key);
    adjacentGroups.push(group);
  }

  if (!adjacentGroups.length) return 0;

  const oldLibs = new Set();
  for (const group of adjacentGroups) {
    for (const p of group) {
      for (const [lx, ly] of neighborsFromBoard(before, p.x, p.y)) {
        if (before[lx][ly] === "." && (lx !== x || ly !== y)) oldLibs.add(`${lx},${ly}`);
      }
    }
  }

  const afterGroup = collectGroup(afterArray, x, y);
  const newLibs = countLibertiesFromBoard(after, afterGroup);
  const delta = newLibs - oldLibs.size;
  if (delta > 0) return Math.min(delta, 4) * 2.5;
  if (delta < 0 && !captured) return Math.max(delta, -3) * 2;
  return 0;
}

function cornerInfluenceBonus(board, x, y) {
  const n = board.length;
  if (n < 7) return 0;
  const targets = [
    { x: 2, y: 2, area: [0, 0, 2, 2] },
    { x: 2, y: n - 3, area: [0, n - 3, 2, n - 1] },
    { x: n - 3, y: 2, area: [n - 3, 0, n - 1, 2] },
    { x: n - 3, y: n - 3, area: [n - 3, n - 3, n - 1, n - 1] },
  ];
  const target = targets.find((t) => t.x === x && t.y === y);
  if (!target) return 0;
  const [x1, y1, x2, y2] = target.area;
  let live = 0, stones = 0;
  for (let ax = x1; ax <= x2; ax++) {
    for (let ay = y1; ay <= y2; ay++) {
      if (board[ax]?.[ay] === undefined || board[ax][ay] === "#") continue;
      live++;
      if (board[ax][ay] === "X" || board[ax][ay] === "O") stones++;
    }
  }
  return live >= 7 && stones === 0 ? 10 : 0;
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

function countAdjacentEnemyGroupsInAtari(board, x, y, enemyColor) {
  const b = board.map((c) => c.split(""));
  const seen = new Set();
  let count = 0;
  for (const [nx, ny] of neighborsFromBoard(board, x, y)) {
    if (board[nx][ny] !== enemyColor) continue;
    const group = collectGroup(b, nx, ny);
    const key = groupKey(group);
    if (seen.has(key)) continue;
    seen.add(key);
    if (countLibertiesFromBoard(board, group) === 1) count++;
  }
  return count;
}

function hasGroupWithFewLiberties(board, color, maxLiberties) {
  return allGroups(board).some((g) => g.color === color && countLibertiesFromBoard(board, g.points) <= maxLiberties);
}

function contactCount(board, x, y) {
  let count = 0;
  for (const [nx, ny] of neighborsFromBoard(board, x, y)) {
    if (board[nx][ny] === "X" || board[nx][ny] === "O") count++;
  }
  return count;
}

function makesLikelyEye(board, x, y, color) {
  const neighbors = neighborsFromBoard(board, x, y);
  if (!neighbors.length) return false;
  let friendlyOrWall = 4 - neighbors.length;
  let enemy = 0;
  for (const [nx, ny] of neighbors) {
    if (board[nx][ny] === color) friendlyOrWall++;
    else if (board[nx][ny] !== ".") enemy++;
  }
  return enemy === 0 && friendlyOrWall >= 3;
}

function coord(x, y) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function printUsage(ns) {
  ns.tprintf('Usage: run go-lookahead.js --opponent "Netburners" --size 5 --games 10');
  ns.tprintf('       run go-lookahead.js --opponent "Daedalus" --size 7 --games 0 --verbose --candidates 12 --replies 6');
  ns.tprintf("Flags:");
  ns.tprintf("  --opponent   faction name. Default: Netburners");
  ns.tprintf("  --size       5, 7, 9, or 13. Default: 5");
  ns.tprintf("  --games      number of games. Default: 1. Use 0 for forever.");
  ns.tprintf("  --verbose    log every move.");
  ns.tprintf("  --candidates black moves to search. Default auto.");
  ns.tprintf("  --replies    white replies per black move. Default auto.");
  ns.tprintf("  --three-ply  selectively search black tactical answer. Default true.");
  ns.tprintf("  --no-three-ply disable selective 3-ply.");
  ns.tprintf("Playable opponents / node power bonuses:");
  ns.tprintf("  Netburners    - increased hacknet production (power 1.3)");
  ns.tprintf("  Slum Snakes   - crime success rate (power 1.2)");
  ns.tprintf("  The Black Hand - hacking money (power 0.9)");
  ns.tprintf("  Tetrads       - strength, defense, dexterity, and agility levels (power 0.7)");
  ns.tprintf("  Daedalus      - company and faction reputation gain (power 1.1)");
  ns.tprintf("  Illuminati    - faster hack(), grow(), and weaken() (power 0.7)");
  ns.tprintf("  ????????????  - hacking level (power 2.0)");
  ns.tprintf("  No AI         - practice board; no node power bonus");
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
