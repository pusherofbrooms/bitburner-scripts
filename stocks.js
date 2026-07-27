/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["reserve", 25e6],
    ["minTrade", 5e6],
    ["history", 70],
    ["minHistory", 40],
    ["buy", 0.58],
    ["sell", 0.52],
    ["maxPositions", 10],
    ["maxPaybackTicks", 12],
    ["maxRotationPaybackTicks", 12],
    ["noShorts", false],
    ["auto4s", true],
    ["liquidate", false],
    ["help", false],
  ]);

  if (flags.help) {
    ns.tprint("Usage: run stocks.js [--reserve 25e6] [--minTrade 5e6] [--history 70] [--minHistory 40] [--buy .58] [--sell .52] [--maxPositions 10] [--maxPaybackTicks 12] [--maxRotationPaybackTicks 12] [--noShorts] [--auto4s true] [--liquidate]");
    ns.tprint("Shorts are enabled automatically in BitNode 8 or with active Source-File 8 level 2; --noShorts disables them. maxPositions applies in all modes. Rotation requires its incremental expected dollar profit to repay replacement friction within maxRotationPaybackTicks.");
    return;
  }

  const numericFlags = ["reserve", "minTrade", "history", "minHistory", "buy", "sell", "maxPositions", "maxPaybackTicks", "maxRotationPaybackTicks"];
  for (const name of numericFlags) {
    if (!Number.isFinite(Number(flags[name]))) {
      ns.tprint(`ERROR: --${name} must be a finite number (received ${String(flags[name])}).`);
      return;
    }
  }

  const reserve = Number(flags.reserve);
  const minTrade = Number(flags.minTrade);
  const historyLen = Math.max(5, Math.floor(Number(flags.history)));
  const minHistory = Math.max(5, Math.min(historyLen, Math.floor(Number(flags.minHistory))));
  const buyThreshold = Math.max(0.51, Math.min(0.99, Number(flags.buy)));
  const sellThreshold = Math.max(0.5, Math.min(buyThreshold, Number(flags.sell)));
  const maxPositions = Math.max(1, Math.floor(Number(flags.maxPositions)));
  const maxPaybackTicks = Math.max(1, Number(flags.maxPaybackTicks));
  const maxRotationPaybackTicks = Math.max(1, Number(flags.maxRotationPaybackTicks));
  const reset = ns.getResetInfo();
  const shortsAvailable = reset.currentNode === 8 || (reset.ownedSF.get(8) ?? 0) >= 2;
  const allowShorts = shortsAvailable && !Boolean(flags.noShorts);
  const auto4s = Boolean(flags.auto4s);

  ns.disableLog("ALL");
  ns.ui.openTail();

  const constants = ns.stock.getConstants();
  await ensureMarketAccess(constants);
  const symbols = ns.stock.getSymbols();
  const histories = new Map(symbols.map((sym) => [sym, []]));
  const commission = constants.StockMarketCommission ?? 100e3;

  if (flags.liquidate) {
    liquidateAll(symbols);
    return;
  }

  ns.print(`stocks.js started: reserve=${ns.format.number(reserve)}, shorts=${allowShorts ? "enabled" : shortsAvailable ? "disabled" : "unavailable"}`);

  while (true) {
    await ns.stock.nextUpdate();
    maybeBuy4s();
    recordPrices(symbols);

    const has4s = ns.stock.has4SDataTixApi();
    const data = symbols.map((sym) => analyze(sym, has4s)).filter(Boolean);
    const rotatedSymbols = rebalance(data, has4s);
    buyBestPositions(data, has4s, rotatedSymbols);
    logStatus(data, has4s);
  }

  async function ensureMarketAccess(constants) {
    if (!ns.stock.hasTixApiAccess() && ns.getServerMoneyAvailable("home") > reserve + constants.TixApiCost) ns.stock.purchaseTixApi();
    while (!ns.stock.hasTixApiAccess()) {
      ns.clearLog();
      ns.print("Waiting for TIX API access. Netscript stock trading requires TIX API access.");
      ns.print(`Need about ${ns.format.number(constants.TixApiCost)} plus reserve=${ns.format.number(reserve)}.`);
      await ns.sleep(5000);
      if (!ns.stock.hasTixApiAccess() && ns.getServerMoneyAvailable("home") > reserve + constants.TixApiCost) ns.stock.purchaseTixApi();
    }
  }

  function maybeBuy4s() {
    if (!auto4s || ns.stock.has4SDataTixApi()) return;
    if (ns.getServerMoneyAvailable("home") > reserve + constants.MarketDataTixApi4SCost) ns.stock.purchase4SMarketDataTixApi();
  }

  function recordPrices(symbols) {
    for (const sym of symbols) {
      const history = histories.get(sym);
      history.push(ns.stock.getPrice(sym));
      while (history.length > historyLen) history.shift();
    }
  }

  function analyze(sym, has4s) {
    const price = ns.stock.getPrice(sym);
    const ask = ns.stock.getAskPrice(sym);
    const bid = ns.stock.getBidPrice(sym);
    const [longShares, longAvg, shortShares, shortAvg] = ns.stock.getPosition(sym);
    const maxShares = ns.stock.getMaxShares(sym);
    const spread = Math.max(0, (ask - bid) / price);
    const history = histories.get(sym);
    let forecast, volatility, mode;
    if (has4s) {
      forecast = ns.stock.getForecast(sym);
      volatility = ns.stock.getVolatility(sym);
      mode = "4S";
    } else {
      if (history.length < minHistory) return null;
      ({ forecast, volatility } = estimateFromHistory(history));
      mode = "hist";
    }
    // The market's movement multiplier is uniform in [0, 1), so this score already
    // includes its mean magnitude; it should not be multiplied by two.
    const longRaw = Math.max(0, forecast - 0.5) * volatility;
    const shortRaw = Math.max(0, 0.5 - forecast) * volatility;
    const longScore = has4s ? longRaw : longRaw - spread / 2;
    const shortScore = has4s ? shortRaw : shortRaw - spread / 2;
    return { sym, price, ask, bid, spread, forecast, volatility, mode, longShares, longAvg, shortShares, shortAvg, maxShares, longScore, shortScore };
  }

  function estimateFromHistory(history) {
    let up = 0, down = 0, absLogReturn = 0;
    for (let i = 1; i < history.length; i++) {
      if (history[i] > history[i - 1]) up++;
      else if (history[i] < history[i - 1]) down++;
      absLogReturn += Math.abs(Math.log(history[i] / history[i - 1]));
    }
    const moves = up + down;
    return {
      forecast: moves === 0 ? 0.5 : (up + 3) / (moves + 6),
      volatility: Math.max(1e-6, absLogReturn / Math.max(1, history.length - 1)),
    };
  }

  function opportunities(data, has4s) {
    const result = [];
    for (const stock of data) {
      if (stock.shortShares === 0 && stock.forecast >= buyThreshold && (has4s || stock.longScore > 0)) result.push({ stock, position: "L", score: stock.longScore });
      if (allowShorts && stock.longShares === 0 && stock.forecast <= 1 - buyThreshold && (has4s || stock.shortScore > 0)) result.push({ stock, position: "S", score: stock.shortScore });
    }
    return result.sort((a, b) => b.score - a.score);
  }

  function rebalance(data, has4s) {
    const rotatedSymbols = new Set();
    // First preserve directional sell hysteresis regardless of portfolio ranking.
    for (const stock of data) {
      if (stock.longShares > 0 && stock.forecast < sellThreshold) sellPosition(stock, "L", "weak");
      if (stock.shortShares > 0 && stock.forecast > 1 - sellThreshold) sellPosition(stock, "S", "weak");
    }

    // Positions between buy and sell thresholds remain eligible for retention.
    const held = data.flatMap((stock) => {
      if (stock.longShares > 0) return [{ stock, position: "L", score: stock.longScore }];
      if (stock.shortShares > 0) return [{ stock, position: "S", score: stock.shortScore }];
      return [];
    });
    const newcomers = opportunities(data, has4s).filter((c) => c.stock.longShares === 0 && c.stock.shortShares === 0);
    while (held.length > maxPositions) {
      const weakest = held.reduce((a, b) => a.score <= b.score ? a : b);
      if (!sellPosition(weakest.stock, weakest.position, "position cap")) break;
      held.splice(held.indexOf(weakest), 1);
    }
    const currentBudget = deploymentBudget(ns.getServerMoneyAvailable("home"));
    const canOpenWithoutRotation = newcomers.some((candidate) => {
      const shares = findAffordableShares(candidate.stock.sym, candidate.position, candidate.stock.maxShares, currentBudget);
      return shares > 0 && ns.stock.getPurchaseCost(candidate.stock.sym, shares, candidate.position) >= minTrade
        && viableRoundTrip(candidate.stock, candidate.score, shares);
    });
    if (held.length < maxPositions && canOpenWithoutRotation) return rotatedSymbols;

    // Build a fixed matching from the tick's original incumbents and newcomers.
    // This prevents a replacement bought below from becoming another incumbent.
    const plans = [];
    for (const incumbent of held) {
      for (const candidate of newcomers) {
        const plan = rotationPlan(candidate, incumbent);
        if (plan) plans.push(plan);
      }
    }
    plans.sort((a, b) => b.netBenefit - a.netBenefit);
    const assignedIncumbents = new Set();
    const assignedCandidates = new Set();
    const assignments = [];
    for (const plan of plans) {
      if (assignedIncumbents.has(plan.incumbent) || assignedCandidates.has(plan.candidate)) continue;
      assignedIncumbents.add(plan.incumbent);
      assignedCandidates.add(plan.candidate);
      assignments.push(plan);
    }

    // Execute at most one rotation per update. This keeps later plans from using cash
    // or quotes invalidated by an earlier replacement.
    for (const planned of assignments.slice(0, 1)) {
      const incumbentProfit = planned.incumbentProfit;
      if (!sellPosition(planned.incumbent.stock, planned.incumbent.position, `rotate for ${planned.candidate.stock.sym}`)) continue;
      const plan = postSaleRotationPlan(planned.candidate, incumbentProfit, has4s);
      if (!plan) {
        ns.print(`SKIP replacement ${planned.candidate.stock.sym}: no longer viable after sale`);
        continue;
      }
      const boughtAt = plan.candidate.position === "L"
        ? ns.stock.buyStock(plan.candidate.stock.sym, plan.shares)
        : ns.stock.buyShort(plan.candidate.stock.sym, plan.shares);
      if (boughtAt <= 0) {
        ns.print(`WARN replacement buy failed for ${plan.candidate.stock.sym} after post-sale preflight`);
        continue;
      }
      if (plan.candidate.position === "L") plan.candidate.stock.longShares += plan.shares;
      else plan.candidate.stock.shortShares += plan.shares;
      rotatedSymbols.add(plan.candidate.stock.sym);
      ns.print(`BUY ${plan.candidate.position} ${plan.candidate.stock.sym} x${plan.shares} (rotation; +${ns.format.number(plan.incremental)}/tick, ${plan.payback.toFixed(1)}t payback)`);
    }
    return rotatedSymbols;
  }

  function sellPosition(stock, position, reason) {
    const shares = position === "L" ? stock.longShares : stock.shortShares;
    if (shares <= 0) return false;
    const soldAt = position === "L" ? ns.stock.sellStock(stock.sym, shares) : ns.stock.sellShort(stock.sym, shares);
    if (soldAt > 0) {
      if (position === "L") stock.longShares = 0;
      else stock.shortShares = 0;
      ns.print(`SELL ${position} ${stock.sym} x${shares} fc=${stock.forecast.toFixed(3)} (${reason})`);
      return true;
    }
    return false;
  }

  function rotationPlan(candidate, incumbent) {
    const incumbentShares = incumbent.position === "L" ? incumbent.stock.longShares : incumbent.stock.shortShares;
    const proceeds = ns.stock.getSaleGain(incumbent.stock.sym, incumbentShares, incumbent.position);
    const budget = deploymentBudget(ns.getServerMoneyAvailable("home") + proceeds);
    const shares = findAffordableShares(candidate.stock.sym, candidate.position, candidate.stock.maxShares, budget);
    const incumbentProfit = incumbentShares * incumbent.stock.price * incumbent.score;
    const plan = evaluateRotation(candidate, shares, incumbentProfit);
    return plan && { ...plan, incumbent, incumbentProfit };
  }

  function postSaleRotationPlan(candidate, incumbentProfit, has4s) {
    const stock = candidate.stock;
    stock.price = ns.stock.getPrice(stock.sym);
    stock.ask = ns.stock.getAskPrice(stock.sym);
    stock.bid = ns.stock.getBidPrice(stock.sym);
    stock.spread = Math.max(0, (stock.ask - stock.bid) / stock.price);
    stock.maxShares = ns.stock.getMaxShares(stock.sym);
    const raw = candidate.position === "L" ? Math.max(0, stock.forecast - 0.5) * stock.volatility : Math.max(0, 0.5 - stock.forecast) * stock.volatility;
    candidate.score = has4s ? raw : raw - stock.spread / 2;
    const shares = findAffordableShares(stock.sym, candidate.position, stock.maxShares, deploymentBudget(ns.getServerMoneyAvailable("home")));
    return evaluateRotation(candidate, shares, incumbentProfit);
  }

  function evaluateRotation(candidate, shares, incumbentProfit) {
    if (shares <= 0) return null;
    const cost = ns.stock.getPurchaseCost(candidate.stock.sym, shares, candidate.position);
    if (cost < minTrade || !viableRoundTrip(candidate.stock, candidate.score, shares)) return null;
    const incremental = shares * candidate.stock.price * candidate.score - incumbentProfit;
    if (incremental <= 0) return null;
    // Sale gain already accounts for incumbent exit friction in replacement sizing.
    // Payback therefore charges only the newcomer's complete round-trip friction.
    const friction = shares * (candidate.stock.ask - candidate.stock.bid) + 2 * commission;
    const payback = friction / incremental;
    if (payback > maxRotationPaybackTicks) return null;
    return { candidate, shares, incremental, payback, netBenefit: incremental * maxRotationPaybackTicks - friction };
  }

  function buyBestPositions(data, has4s, rotatedSymbols) {
    let slots = maxPositions - data.filter((s) => s.longShares > 0 || s.shortShares > 0).length;
    let budget = deploymentBudget(ns.getServerMoneyAvailable("home"));
    for (const candidate of opportunities(data, has4s)) {
      const stock = candidate.stock;
      if (rotatedSymbols.has(stock.sym)) continue;
      const isNew = stock.longShares === 0 && stock.shortShares === 0;
      if (isNew && slots <= 0) continue;
      const held = stock.longShares + stock.shortShares;
      let shares = findAffordableShares(stock.sym, candidate.position, stock.maxShares - held, budget);
      if (shares <= 0) continue;
      let cost = ns.stock.getPurchaseCost(stock.sym, shares, candidate.position);
      if (cost < minTrade || !viableRoundTrip(stock, candidate.score, shares)) continue;
      const boughtAt = candidate.position === "L" ? ns.stock.buyStock(stock.sym, shares) : ns.stock.buyShort(stock.sym, shares);
      if (boughtAt <= 0) continue;
      budget -= cost;
      if (candidate.position === "L") stock.longShares += shares;
      else stock.shortShares += shares;
      if (isNew) slots--;
      ns.print(`BUY ${candidate.position} ${stock.sym} x${shares} fc=${stock.forecast.toFixed(3)} edge=${candidate.score.toExponential(2)} payback=${paybackTicks(stock, candidate.score, shares).toFixed(1)}t`);
      if (budget < minTrade + commission) break;
    }
  }

  function viableRoundTrip(stock, score, shares) {
    return score > 0 && paybackTicks(stock, score, shares) <= maxPaybackTicks;
  }

  function paybackTicks(stock, score, shares) {
    // At an unchanged price, long and short round trips have identical friction.
    const friction = shares * (stock.ask - stock.bid) + 2 * commission;
    return friction / Math.max(1e-9, shares * stock.price * score);
  }

  function deploymentBudget(cash) {
    return Math.max(0, cash - reserve);
  }

  function findAffordableShares(sym, position, maxShares, budget) {
    let low = 0, high = Math.max(0, Math.floor(maxShares));
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (ns.stock.getPurchaseCost(sym, mid, position) <= budget) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  function liquidateAll(symbols) {
    for (const sym of symbols) {
      const [longShares, , shortShares] = ns.stock.getPosition(sym);
      if (longShares > 0) ns.stock.sellStock(sym, longShares);
      if (shortShares > 0) ns.stock.sellShort(sym, shortShares);
    }
    ns.tprint("Liquidated all stock positions.");
  }

  function logStatus(data, has4s) {
    const positions = data.filter((s) => s.longShares > 0 || s.shortShares > 0);
    let liquidation = 0, pnl = 0;
    for (const s of positions) {
      if (s.longShares > 0) {
        const gain = ns.stock.getSaleGain(s.sym, s.longShares, "L");
        liquidation += gain;
        pnl += gain - s.longShares * s.longAvg - commission;
      }
      if (s.shortShares > 0) {
        const gain = ns.stock.getSaleGain(s.sym, s.shortShares, "S");
        liquidation += gain;
        pnl += gain - s.shortShares * s.shortAvg - commission;
      }
    }
    const best = opportunities(data, has4s).slice(0, 5);
    ns.clearLog();
    ns.print(`mode=${has4s ? "4S" : "history"} shorts=${allowShorts ? "on" : shortsAvailable ? "off" : "unavailable"} cash=${ns.format.number(ns.getServerMoneyAvailable("home"))} positions=${positions.length}/${maxPositions}`);
    ns.print(`liquidation=${ns.format.number(liquidation)} unrealizedPnL=${ns.format.number(pnl)}`);
    ns.print("best:");
    for (const { stock: s, position, score } of best) ns.print(`${s.sym} ${position} fc=${s.forecast.toFixed(3)} vol=${s.volatility.toFixed(4)} spread=${(s.spread * 100).toFixed(2)}% edge=${score.toExponential(2)}`);
  }
}
