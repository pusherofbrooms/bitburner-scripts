/** Custom corporation Market-TA2-ish pricing.
 *
 * Requires: Warehouse API, Office API, Market Research - Demand, Market Data - Competition.
 * Keeps product markup calibration in /corp/ta2-calibration.txt.
 *
 * Args: [calibrationPriceMultiplier=1e6]
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const c = ns.corporation;
  const calibrationPriceMultiplier = Number(ns.args[0] ?? 1e6);
  const calibrationFile = "/corp/ta2-calibration.txt";

  ns.disableLog("sleep");

  const data = loadJson(ns, calibrationFile, { products: {} });

  requireCorpUnlocks(c, ["Warehouse API", "Office API", "Market Research - Demand", "Market Data - Competition"]);

  ns.tprint(`Custom TA2 running. Calibration file: ${calibrationFile}`);

  while (true) {
    await c.nextUpdate();
    const corp = c.getCorporation();

    for (const divisionName of corp.divisions) {
      const division = c.getDivision(divisionName);
      const industry = c.getIndustryData(division.industry);
      const advertFactor = advertisingFactor(division, industry);
      const salesMult = 1 + 0.01 * c.getUpgradeLevel("ABC SalesBots");
      const divisionSalesMult = 1; // Current source has no sales research multiplier.

      for (const city of division.cities) {
        const office = c.getOffice(divisionName, city);
        const businessFactor = calcEffect(1 + office.employeeProductionByJob.Business, 0.26, 10e3);
        const common = advertFactor * salesMult * divisionSalesMult * businessFactor;

        for (const materialName of industry.producedMaterials ?? []) {
          priceMaterial(ns, c, divisionName, city, materialName, common);
        }

        for (const productName of division.products) {
          priceProduct(ns, c, data, divisionName, city, productName, common, calibrationPriceMultiplier);
        }
      }
    }

    ns.write(calibrationFile, JSON.stringify(data, null, 2), "w");
  }
}

function priceMaterial(ns, c, divisionName, city, materialName, common) {
  const material = c.getMaterial(divisionName, city, materialName);
  if (material.stored <= 0 || material.marketPrice <= 0) return;

  const markupLimit = material.quality / c.getMaterialData(materialName).markup;
  const itemFactor = material.quality + 0.001;
  const marketFactor = Math.max(0.1, (material.demand * (100 - material.competition)) / 100);
  const potential = itemFactor * marketFactor * common;
  const expected = material.stored / 10;
  const price = optimalPrice(material.marketPrice, markupLimit, potential, expected);

  c.sellMaterial(divisionName, city, materialName, "MAX", String(price));
  ns.print(`${divisionName}/${city}/${materialName}: ${ns.formatNumber(price)}`);
}

function priceProduct(ns, c, data, divisionName, city, productName, common, calibrationPriceMultiplier) {
  const product = c.getProduct(divisionName, city, productName);
  if (product.developmentProgress < 100 || product.stored <= 0 || product.productionCost <= 0) return;

  const key = `${divisionName}|${productName}`;
  data.products[key] ??= {};
  const record = data.products[key];

  const marketPrice = product.productionCost;
  const marketFactor = Math.max(0.1, (product.demand * (100 - product.competition)) / 100);
  const itemFactor = 0.5 * Math.pow(Math.max(product.effectiveRating, 0.001), 0.65);
  const potentialWithoutMarkup = itemFactor * marketFactor * common;

  if (!record.markup || !Number.isFinite(record.markup) || record.markup <= 0) {
    calibrateOrObserve(ns, c, record, divisionName, city, productName, product, marketPrice, potentialWithoutMarkup, calibrationPriceMultiplier);
    return;
  }

  const markupLimit = Math.max(product.effectiveRating, 0.001) / record.markup;
  const expected = product.stored / 10;
  const price = optimalPrice(marketPrice, markupLimit, potentialWithoutMarkup, expected);
  c.sellProduct(divisionName, city, productName, "MAX", String(price), false);
  ns.print(`${divisionName}/${city}/${productName}: ${ns.formatNumber(price)} markup=${ns.formatNumber(record.markup)}`);
}

function calibrateOrObserve(ns, c, record, divisionName, city, productName, product, marketPrice, potential, calibrationPriceMultiplier) {
  if (record.calibrationPrice && product.actualSellAmount > 0) {
    const actualPerSecond = product.actualSellAmount / 10;
    const markupLimit = (record.calibrationPrice - marketPrice) * Math.sqrt(actualPerSecond / potential);
    const markup = Math.max(product.effectiveRating, 0.001) / markupLimit;
    if (Number.isFinite(markup) && markup > 0) {
      record.markup = markup;
      delete record.calibrationPrice;
      ns.tprint(`Calibrated ${divisionName}/${productName}: markup=${ns.formatNumber(markup)}`);
      return;
    }
  }

  const price = marketPrice * calibrationPriceMultiplier;
  record.calibrationPrice = price;
  c.sellProduct(divisionName, city, productName, "MAX", String(price), false);
  ns.print(`${divisionName}/${city}/${productName}: calibrating at ${ns.formatNumber(price)}`);
}

function optimalPrice(marketPrice, markupLimit, potential, expected) {
  if (potential <= 0 || expected <= 0 || markupLimit <= 0) return marketPrice + Math.max(0, markupLimit);
  return marketPrice + markupLimit * Math.sqrt(potential / expected);
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
