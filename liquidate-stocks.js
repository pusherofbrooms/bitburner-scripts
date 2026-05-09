/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([
    ["help", false],
    ["quiet", false],
  ]);

  if (flags.help) {
    ns.tprint("Usage: run liquidate-stocks.js [--quiet]");
    ns.tprint("Sells every long and short stock position immediately.");
    return;
  }

  const symbols = ns.stock.getSymbols();
  let longCount = 0;
  let shortCount = 0;
  let longSharesSold = 0;
  let shortSharesSold = 0;

  for (const sym of symbols) {
    const [longShares, , shortShares] = ns.stock.getPosition(sym);

    if (longShares > 0) {
      const soldAt = ns.stock.sellStock(sym, longShares);
      if (soldAt > 0) {
        longCount++;
        longSharesSold += longShares;
        if (!flags.quiet) ns.tprint(`Sold long ${sym}: ${ns.format.number(longShares)} shares @ ${ns.format.number(soldAt)}`);
      } else if (!flags.quiet) {
        ns.tprint(`WARN: Failed to sell long ${sym}: ${ns.format.number(longShares)} shares`);
      }
    }

    if (shortShares > 0) {
      const soldAt = ns.stock.sellShort(sym, shortShares);
      if (soldAt > 0) {
        shortCount++;
        shortSharesSold += shortShares;
        if (!flags.quiet) ns.tprint(`Covered short ${sym}: ${ns.format.number(shortShares)} shares @ ${ns.format.number(soldAt)}`);
      } else if (!flags.quiet) {
        ns.tprint(`WARN: Failed to cover short ${sym}: ${ns.format.number(shortShares)} shares`);
      }
    }
  }

  ns.tprint(`Liquidated ${longCount} long positions (${ns.format.number(longSharesSold)} shares) and ${shortCount} short positions (${ns.format.number(shortSharesSold)} shares).`);
}
