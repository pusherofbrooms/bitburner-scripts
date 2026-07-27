/** Custom corporation Market-TA2-ish pricing.
 *
 * Requires: Warehouse API, Office API, Market Research - Demand, Market Data - Competition.
 * Keeps per-city product markup calibration in /corp/ta2-calibration.txt.
 *
 * Args: [calibrationPriceMultiplier=1e6] [clearanceMultiplier=1.01]
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const c = ns.corporation;
  const calibrationPriceMultiplier = Number(ns.args[0] ?? 1e6);
  const clearanceMultiplier = Number(ns.args[1] ?? 1.01);
  const calibrationFile = "/corp/ta2-calibration.txt";

  if (!Number.isFinite(calibrationPriceMultiplier) || calibrationPriceMultiplier <= 1) {
    throw new Error("calibrationPriceMultiplier must be a finite number greater than 1.");
  }
  if (!Number.isFinite(clearanceMultiplier) || clearanceMultiplier < 1) {
    throw new Error("clearanceMultiplier must be a finite number of at least 1.");
  }

  ns.disableLog("sleep");
  const data = loadJson(ns, calibrationFile, { products: {} });
  data.products ??= {};

  requireCorpUnlocks(c, ["Warehouse API", "Office API", "Market Research - Demand", "Market Data - Competition"]);
  ns.tprint(`Custom TA2 running. Calibration file: ${calibrationFile}`);

  while (true) {
    const completedState = await c.nextUpdate();

    // actualSellAmount is the per-second result of the SALE that just completed.
    // Only inspect it here, so it is paired with the calibration price queued at
    // the immediately preceding EXPORT state.
    if (completedState === "SALE") {
      observeCalibrations(ns, c, data);
      ns.write(calibrationFile, JSON.stringify(data, null, 2), "w");
      continue;
    }
    if (completedState !== "EXPORT") continue;

    const corp = c.getCorporation();
    for (const divisionName of corp.divisions) {
      const division = c.getDivision(divisionName);
      const industry = c.getIndustryData(division.industry);
      const advertFactor = advertisingFactor(division, industry);
      const salesMult = 1 + 0.01 * c.getUpgradeLevel("ABC SalesBots");
      const divisionSalesMult = 1; // Current v3 source has no sales research multiplier.

      for (const city of division.cities) {
        if (!c.hasWarehouse(divisionName, city)) continue;
        const office = c.getOffice(divisionName, city);
        const businessFactor = calcEffect(1 + office.employeeProductionByJob.Business, 0.26, 10e3);
        const common = advertFactor * salesMult * divisionSalesMult * businessFactor;

        for (const materialName of industry.producedMaterials ?? []) {
          priceMaterial(ns, c, divisionName, city, materialName, common, clearanceMultiplier);
        }
        for (const productName of division.products) {
          priceProduct(ns, c, data, divisionName, city, productName, common, calibrationPriceMultiplier, clearanceMultiplier);
        }
      }
    }
    ns.write(calibrationFile, JSON.stringify(data, null, 2), "w");
  }
}

function priceMaterial(ns, c, divisionName, city, materialName, common, clearanceMultiplier) {
  const material = c.getMaterial(divisionName, city, materialName);
  if (material.stored <= 0 || material.marketPrice <= 0) return;

  const markupLimit = material.quality / c.getMaterialData(materialName).baseMarkup;
  const itemFactor = material.quality + 0.001;
  const marketFactor = Math.max(0.1, (material.demand * (100 - material.competition)) / 100);
  const potential = itemFactor * marketFactor * common;
  const expected = inventoryLiquidationPerSecond(material.stored) * clearanceMultiplier;
  const price = optimalPrice(material.marketPrice, markupLimit, potential, expected);

  c.sellMaterial(divisionName, city, materialName, "MAX", String(price));
  ns.print(`${divisionName}/${city}/${materialName}: ${ns.format.number(price)}`);
}

function priceProduct(ns, c, data, divisionName, city, productName, common, calibrationPriceMultiplier, clearanceMultiplier) {
  const product = c.getProduct(divisionName, city, productName);
  if (product.developmentProgress < 100 || product.stored <= 0 || product.productionCost <= 0) return;

  const key = `${divisionName}|${city}|${productName}`;
  const record = (data.products[key] ??= {});
  const marketPrice = product.productionCost;
  const marketFactor = Math.max(0.1, (product.demand * (100 - product.competition)) / 100);
  const itemFactor = 0.5 * Math.pow(Math.max(product.effectiveRating, 0.001), 0.65);
  const potential = itemFactor * marketFactor * common;

  if (!Number.isFinite(record.markup) || record.markup <= 0) {
    const price = marketPrice * calibrationPriceMultiplier;
    if (!Number.isFinite(price) || potential <= 0) return;
    record.pending = {
      price,
      marketPrice,
      potential,
      rating: product.effectiveRating,
      expected: inventoryLiquidationPerSecond(product.stored),
    };
    c.sellProduct(divisionName, city, productName, "MAX", String(price), false);
    ns.print(`${divisionName}/${city}/${productName}: calibrating at ${ns.format.number(price)}`);
    return;
  }

  const markupLimit = Math.max(product.effectiveRating, 0.001) / record.markup;
  const expected = inventoryLiquidationPerSecond(product.stored) * clearanceMultiplier;
  const price = optimalPrice(marketPrice, markupLimit, potential, expected);
  c.sellProduct(divisionName, city, productName, "MAX", String(price), false);
  ns.print(`${divisionName}/${city}/${productName}: ${ns.format.number(price)} markup=${ns.format.number(record.markup)}`);
}

function observeCalibrations(ns, c, data) {
  for (const [key, record] of Object.entries(data.products)) {
    if (!record?.pending || (Number.isFinite(record.markup) && record.markup > 0)) continue;
    const parts = key.split("|");
    if (parts.length !== 3) {
      delete data.products[key]; // Discard records from the old, non-city-specific format.
      continue;
    }
    const [divisionName, city, productName] = parts;
    try {
      if (!c.hasWarehouse(divisionName, city)) continue;
      const product = c.getProduct(divisionName, city, productName);
      const actualPerSecond = product.actualSellAmount; // Already normalized by the game.
      const { price, marketPrice, potential, rating, expected } = record.pending;
      const markupLimit = (price - marketPrice) * Math.sqrt(actualPerSecond / potential);
      const markup = Math.max(rating, 0.001) / markupLimit;
      // If MAX was reached, inventory capped the observation and the markup
      // penalty cannot be inferred. Leave it pending and try another cycle.
      const wasPriceLimited = actualPerSecond > 0 && actualPerSecond < expected * (1 - 1e-9);
      if (wasPriceLimited && Number.isFinite(markup) && markup > 0) {
        record.markup = markup;
        delete record.pending;
        ns.tprint(`Calibrated ${divisionName}/${city}/${productName}: markup=${ns.format.number(markup)}`);
      }
    } catch {
      // Divisions, cities, and products may disappear while the script is running.
    }
  }
}

function optimalPrice(marketPrice, markupLimit, potential, expected) {
  if (potential <= 0 || expected <= 0 || markupLimit <= 0) return marketPrice + Math.max(0, markupLimit);
  return marketPrice + markupLimit * Math.sqrt(potential / expected);
}

// Division.processSaleState evaluates MAX as inventory divided by
// secondsPerMarketCycle (10 in v3), yielding a per-second target. That internal
// constant is not exposed by Netscript, so keep the source-derived fallback in
// one named place rather than scattering fragile `/ 10` conversions.
function inventoryLiquidationPerSecond(stored, secondsPerMarketCycle = 10) {
  return stored / secondsPerMarketCycle;
}

function advertisingFactor(division, industry) {
  const awarenessFactor = Math.pow(division.awareness + 1, industry.advertisingFactor);
  const popularityFactor = Math.pow(division.popularity + 1, industry.advertisingFactor);
  const ratioFactor = division.awareness === 0 ? 0.01 : Math.max((division.popularity + 0.001) / division.awareness, 0.01);
  return Math.pow(awarenessFactor * popularityFactor * ratioFactor, 0.85);
}

function calcEffect(n, expFac, linearFac) {
  return Math.pow(n, expFac) + n / linearFac;
}

function requireCorpUnlocks(c, unlocks) {
  if (!c.hasCorporation()) throw new Error("No corporation found.");
  for (const unlock of unlocks) {
    if (!c.hasUnlock(unlock)) throw new Error(`Missing corporation unlock: ${unlock}`);
  }
}

function loadJson(ns, path, fallback) {
  if (!ns.fileExists(path)) return fallback;
  try {
    return JSON.parse(ns.read(path));
  } catch {
    return fallback;
  }
}
