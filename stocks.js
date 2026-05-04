/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["reserve", 25e6],
    ["minTrade", 5e6],
    ["history", 45],
    ["minHistory", 20],
    ["buy", 0.58],
    ["sell", 0.52],
    ["maxPositions", 6],
    ["cashFrac", 0.75],
    ["shorts", false],
    ["auto4s", true],
    ["liquidate", false],
    ["help", false],
  ]);

  if (flags.help) {
    ns.tprint("Usage: run stocks.js [--reserve 25e6] [--minTrade 5e6] [--history 45] [--minHistory 20] [--buy 0.58] [--sell 0.52] [--maxPositions 6] [--cashFrac 0.75] [--shorts false] [--auto4s true] [--liquidate false]");
    return;
  }

  const reserve = Number(flags.reserve);
  const minTrade = Number(flags.minTrade);
  const historyLen = Math.max(5, Math.floor(Number(flags.history)));
  const minHistory = Math.max(5, Math.min(historyLen, Math.floor(Number(flags.minHistory))));
  const buyThreshold = Math.max(0.51, Math.min(0.99, Number(flags.buy)));
  const sellThreshold = Math.max(0.5, Math.min(buyThreshold, Number(flags.sell)));
  const maxPositions = Math.max(1, Math.floor(Number(flags.maxPositions)));
  const cashFrac = Math.max(0.01, Math.min(1, Number(flags.cashFrac)));
  const allowShorts = Boolean(flags.shorts);
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

  ns.print(`stocks.js started: reserve=${ns.format.number(reserve)}, minTrade=${ns.format.number(minTrade)}, shorts=${allowShorts}`);

  while (true) {
    await ns.stock.nextUpdate();
    maybeBuy4s();
    recordPrices(symbols);

    const has4s = ns.stock.has4SDataTixApi();
    const data = symbols.map((sym) => analyze(sym, has4s)).filter(Boolean);

    sellWeakPositions(data);
    buyBestPositions(data);
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
    const money = ns.getServerMoneyAvailable("home");
    const cost = constants.MarketDataTixApi4SCost;
    if (money > reserve + cost) ns.stock.purchase4SMarketDataTixApi();
  }

  function recordPrices(symbols) {
    for (const sym of symbols) {
      const price = ns.stock.getPrice(sym);
      const history = histories.get(sym);
      history.push(price);
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

    let forecast;
    let volatility;
    let mode;
    if (has4s) {
      forecast = ns.stock.getForecast(sym);
      volatility = ns.stock.getVolatility(sym);
      mode = "4S";
    } else {
      if (history.length < minHistory) return null;
      const estimate = estimateFromHistory(history);
      forecast = estimate.forecast;
      volatility = estimate.volatility;
      mode = "hist";
    }

    const longEdge = forecast - 0.5;
    const shortEdge = 0.5 - forecast;
    const longScore = longEdge * Math.max(volatility, 1e-6) - spread / 2;
    const shortScore = shortEdge * Math.max(volatility, 1e-6) - spread / 2;
    return { sym, price, ask, bid, spread, forecast, volatility, mode, longShares, longAvg, shortShares, shortAvg, maxShares, longScore, shortScore };
  }

  function estimateFromHistory(history) {
    let up = 0;
    let down = 0;
    let absLogReturn = 0;
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      if (curr > prev) up++;
      else if (curr < prev) down++;
      absLogReturn += Math.abs(Math.log(curr / prev));
    }

    const moves = up + down;
    // Bayesian smoothing keeps short histories from producing overconfident 0%/100% forecasts.
    const forecast = moves === 0 ? 0.5 : (up + 3) / (moves + 6);
    const volatility = Math.max(1e-6, absLogReturn / Math.max(1, history.length - 1));
    return { forecast, volatility };
  }

  function sellWeakPositions(data) {
    for (const stock of data) {
      if (stock.longShares > 0 && stock.forecast < sellThreshold) {
        const shares = stock.longShares;
        const soldAt = ns.stock.sellStock(stock.sym, shares);
        if (soldAt > 0) {
          stock.longShares = 0;
          ns.print(`SELL L ${stock.sym} x${shares} forecast=${stock.forecast.toFixed(3)}`);
        }
      }
      if (stock.shortShares > 0 && stock.forecast > 1 - sellThreshold) {
        const shares = stock.shortShares;
        const soldAt = ns.stock.sellShort(stock.sym, shares);
        if (soldAt > 0) {
          stock.shortShares = 0;
          ns.print(`SELL S ${stock.sym} x${shares} forecast=${stock.forecast.toFixed(3)}`);
        }
      }
    }
  }

  function buyBestPositions(data) {
    const currentPositions = data.filter((s) => s.longShares > 0 || s.shortShares > 0).length;
    let slots = Math.max(0, maxPositions - currentPositions);

    const candidates = [];
    for (const stock of data) {
      const hasPosition = stock.longShares > 0 || stock.shortShares > 0;
      if (stock.shortShares === 0 && stock.forecast >= buyThreshold) {
        candidates.push({ ...stock, position: "L", score: stock.longScore, isNewPosition: !hasPosition });
      }
      if (allowShorts && stock.longShares === 0 && stock.forecast <= 1 - buyThreshold) {
        candidates.push({ ...stock, position: "S", score: stock.shortScore, isNewPosition: !hasPosition });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    for (const stock of candidates) {
      if (stock.isNewPosition && slots <= 0) continue;
      if (stock.score <= 0) continue;

      const money = ns.getServerMoneyAvailable("home");
      const spend = Math.max(0, (money - reserve) * cashFrac);
      if (spend < minTrade + commission) break;

      const heldShares = stock.longShares + stock.shortShares;
      const maxBuyable = stock.maxShares - heldShares;
      const sharesByCost = findAffordableShares(stock.sym, stock.position, maxBuyable, spend);
      if (sharesByCost <= 0) continue;

      const cost = ns.stock.getPurchaseCost(stock.sym, sharesByCost, stock.position);
      if (cost < minTrade) continue;

      const boughtAt = stock.position === "L"
        ? ns.stock.buyStock(stock.sym, sharesByCost)
        : ns.stock.buyShort(stock.sym, sharesByCost);
      if (boughtAt > 0) {
        ns.print(`BUY ${stock.position} ${stock.sym} x${sharesByCost} forecast=${stock.forecast.toFixed(3)} score=${stock.score.toExponential(2)}${stock.isNewPosition ? "" : " add"}`);
        if (stock.isNewPosition) slots--;
        stock.longShares += stock.position === "L" ? sharesByCost : 0;
        stock.shortShares += stock.position === "S" ? sharesByCost : 0;
      }
    }
  }

  function findAffordableShares(sym, position, maxShares, budget) {
    maxShares = Math.max(0, Math.floor(maxShares));
    if (maxShares <= 0) return 0;

    let low = 0;
    let high = maxShares;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const cost = ns.stock.getPurchaseCost(sym, mid, position);
      if (cost <= budget) low = mid;
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
    const longValue = positions.reduce((sum, s) => sum + s.longShares * s.bid, 0);
    const shortValue = positions.reduce((sum, s) => sum + s.shortShares * Math.max(0, s.shortAvg - s.ask), 0);
    const best = [...data].sort((a, b) => Math.max(b.longScore, b.shortScore) - Math.max(a.longScore, a.shortScore)).slice(0, 5);

    ns.clearLog();
    ns.print(`mode=${has4s ? "4S" : "history"} cash=${ns.format.number(ns.getServerMoneyAvailable("home"))} positions=${positions.length}/${maxPositions}`);
    ns.print(`longValue=${ns.format.number(longValue)} shortPnLValue=${ns.format.number(shortValue)}`);
    ns.print("best:");
    for (const s of best) {
      ns.print(`${s.sym} fc=${s.forecast.toFixed(3)} vol=${s.volatility.toFixed(4)} spread=${(s.spread * 100).toFixed(2)}% score=${Math.max(s.longScore, s.shortScore).toExponential(2)}`);
    }
  }
}
