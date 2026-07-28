/** Automate the product lifecycle for an existing product division.
 *
 * Usage: run corp/products.js [division=Toba] [options]
 *   --city Sector-12       Product development city
 *   --reserve 100e9        Corporate cash that must remain untouched
 *   --min-budget 20e9      Minimum total investment per product
 *   --max-budget 1e12      Maximum total investment per product
 *   --fraction 0.30        Fraction of cash above reserve to invest
 *   --growth 1.15          Minimum investment relative to the newest product
 *   --design-ratio 0.50    Fraction invested in product design
 *   --prefix Leaf          Optional product-name prefix
 *   --dry-run              Report actions without changing the corporation
 *
 * Pricing is deliberately left to corp/ta2.js. Office staffing, expansion,
 * research, and warehouses are also outside this script's scope.
 * @param {NS} ns
 */
export async function main(ns) {
  const flags = ns.flags([
    ["city", "Sector-12"],
    ["reserve", 100e9],
    ["min-budget", 20e9],
    ["max-budget", 1e12],
    ["fraction", 0.30],
    ["growth", 1.15],
    ["design-ratio", 0.50],
    ["prefix", ""],
    ["dry-run", false],
    ["help", false],
  ]);
  if (flags.help) {
    ns.tprint("Usage: run corp/products.js [division=Toba] [--city Sector-12] [--reserve 100e9] " +
      "[--min-budget 20e9] [--max-budget 1e12] [--fraction 0.30] [--growth 1.15] " +
      "[--design-ratio 0.50] [--prefix Leaf] [--dry-run]");
    return;
  }

  const divisionName = String(flags._[0] ?? "Toba");
  const city = String(flags.city);
  const config = {
    reserve: finiteNonnegative(flags.reserve, "reserve"),
    minBudget: finitePositive(flags["min-budget"], "min-budget"),
    maxBudget: finitePositive(flags["max-budget"], "max-budget"),
    fraction: finitePositive(flags.fraction, "fraction"),
    growth: finitePositive(flags.growth, "growth"),
    designRatio: Number(flags["design-ratio"]),
  };
  if (config.maxBudget < config.minBudget) throw new Error("max-budget must be at least min-budget.");
  if (config.fraction > 1) throw new Error("fraction must be at most 1.");
  if (config.growth < 1) throw new Error("growth must be at least 1.");
  if (!Number.isFinite(config.designRatio) || config.designRatio <= 0 || config.designRatio >= 1) {
    throw new Error("design-ratio must be between 0 and 1.");
  }

  const c = ns.corporation;
  if (!c.hasCorporation()) throw new Error("No corporation found.");
  if (!c.hasUnlock("Office API") || !c.hasUnlock("Warehouse API")) {
    throw new Error("Office API and Warehouse API are required.");
  }
  let division = c.getDivision(divisionName);
  if (!division.makesProducts) throw new Error(`${divisionName} cannot make products.`);
  if (!division.cities.includes(city)) throw new Error(`${divisionName} does not operate in ${city}.`);

  ns.disableLog("sleep");
  ns.tprint(`Product automation running for ${divisionName}; development city ${city}.`);

  while (true) {
    await c.nextUpdate();
    division = c.getDivision(divisionName);
    const products = division.products.map((name) => c.getProduct(divisionName, city, name));

    // Initialize only cities that are not selling yet. Custom TA2 owns prices
    // after this and will replace MP with a calibrated city-specific price.
    for (const product of products) {
      if (product.developmentProgress < 100) continue;
      for (const saleCity of division.cities) {
        const cityProduct = c.getProduct(divisionName, saleCity, product.name);
        if (String(cityProduct.desiredSellAmount) === "MAX") continue;
        report(ns, flags["dry-run"], `Enable MAX sales for ${product.name} in ${saleCity}.`, () =>
          c.sellProduct(divisionName, saleCity, product.name, "MAX", "MP", false));
      }
    }

    if (products.some((product) => product.developmentProgress < 100)) continue;

    const newestInvestment = products.length === 0 ? 0 : totalInvestment(products[products.length - 1]);
    const budget = calculateProductBudget(c.getCorporation().funds, newestInvestment, config);
    if (budget === null) {
      ns.print(`Waiting for product funds: reserve=${ns.format.number(config.reserve)}, newest investment=${ns.format.number(newestInvestment)}.`);
      continue;
    }

    const name = nextTobaccoName(division.products, String(flags.prefix));
    const design = budget * config.designRatio;
    const marketing = budget - design;
    const startMessage = `Start ${name} in ${city}: design=${ns.format.number(design)}, marketing=${ns.format.number(marketing)}, total=${ns.format.number(budget)}.`;

    if (products.length >= division.maxProducts) {
      const oldest = products[0];
      if (!oldest) continue;
      if (flags["dry-run"]) {
        ns.tprint(`DRY RUN: Discontinue oldest product ${oldest.name}.`);
        ns.tprint(`DRY RUN: ${startMessage}`);
      } else {
        ns.tprint(`Discontinue oldest product ${oldest.name}, then ${startMessage}`);
        c.discontinueProduct(divisionName, oldest.name);
        c.makeProduct(divisionName, city, name, design, marketing);
      }
      continue;
    }

    report(ns, flags["dry-run"], startMessage, () =>
      c.makeProduct(divisionName, city, name, design, marketing));
  }
}

export function calculateProductBudget(funds, newestInvestment, config) {
  const available = Math.max(0, funds - config.reserve);
  const desired = Math.min(config.maxBudget, Math.max(
    config.minBudget,
    available * config.fraction,
    newestInvestment > 0 ? newestInvestment * config.growth : 0,
  ));
  return available >= desired ? desired : null;
}

export function nextTobaccoName(existingNames, prefix = "") {
  const themes = [
    "Golden Leaf", "Velvet Ember", "Nightshade Reserve", "Copper Cigar",
    "Silver Virginia", "Midnight Maduro", "Royal Burley", "Crimson Cohiba",
    "Oak & Ash", "Sable Smoke", "Imperial Blend", "Blue Havana",
  ];
  const generations = existingNames
    .map((name) => Number(name.match(/(\d+)$/)?.[1] ?? 0))
    .filter(Number.isFinite);
  const generation = Math.max(0, ...generations) + 1;
  const theme = themes[(generation - 1) % themes.length];
  return `${prefix ? `${prefix} ` : ""}${theme} ${String(generation).padStart(3, "0")}`;
}

function totalInvestment(product) {
  return Math.max(0, Number(product.designInvestment) || 0) + Math.max(0, Number(product.advertisingInvestment) || 0);
}

function report(ns, dryRun, message, action) {
  ns.tprint(`${dryRun ? "DRY RUN: " : ""}${message}`);
  if (!dryRun) action();
}

function finitePositive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a finite positive number.`);
  return number;
}

function finiteNonnegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a finite nonnegative number.`);
  return number;
}
