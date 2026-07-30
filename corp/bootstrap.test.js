import assert from "node:assert/strict";
import test from "node:test";
import { affordable, boostTargetReady, cityPurchaseBudget, optimizeBoostMaterials, roundOneMissing, staffingTransition, teaCost } from "./bootstrap.js";

const industry = { hardwareFactor: .2, aiCoreFactor: .3, robotFactor: 0, realEstateFactor: .5 };
const materials = {
  Hardware: { size: .06, marketPrice: 2 }, "AI Cores": { size: .1, marketPrice: 4 },
  Robots: { size: .5, marketPrice: 10 }, "Real Estate": { size: .005, marketPrice: 1 },
};
const used = (result) => Object.entries(result).reduce((n, [name, amount]) => n + amount * materials[name].size, 0);
const cost = (result) => Object.entries(result).reduce((n, [name, amount]) => n + amount * materials[name].marketPrice, 0);

test("boost optimizer handles zero capacity, excluded factors, and extreme low space", () => {
  assert.deepEqual(optimizeBoostMaterials(0, industry, materials), { Hardware: 0, "AI Cores": 0, Robots: 0, "Real Estate": 0 });
  const tiny = optimizeBoostMaterials(1e-6, industry, materials);
  assert.equal(tiny.Robots, 0);
  assert.ok(used(tiny) <= 1e-6 * (1 + 1e-8));
  assert.ok(tiny["Real Estate"] > 0);
});

test("boost optimizer solves shifted constrained objective, space, and live-price budget", () => {
  const result = optimizeBoostMaterials(100, industry, materials, Infinity);
  assert.ok(Math.abs(used(result) - 100) < 1e-7);
  // KKT marginal utility per unit space is equal for active materials.
  const marginal = (name) => industry[{ Hardware:"hardwareFactor", "AI Cores":"aiCoreFactor", "Real Estate":"realEstateFactor" }[name]] * .002 /
    (1 + .002 * result[name]) / materials[name].size;
  assert.ok(Math.abs(marginal("Hardware") - marginal("Real Estate")) < 1e-8);
  const limited = optimizeBoostMaterials(100, industry, materials, 10);
  assert.ok(cost(limited) <= 10 + 1e-8);
});

test("existing holdings consume objective baseline and occupied capacity is caller-controlled", () => {
  const additions = optimizeBoostMaterials(2, industry, materials, Infinity, { "Real Estate": 1e9 });
  assert.equal(additions["Real Estate"], 0); // low-space active-set exclusion
  assert.ok(used(additions) <= 2 + 1e-8);
  assert.ok(used(optimizeBoostMaterials(20, industry, materials)) > used(additions));
});

test("staffing only automates the exact R&D to final transition", () => {
  assert.equal(staffingTransition({ "Research & Development": 4 }, true), "ready");
  assert.equal(staffingTransition({ "Research & Development": 4 }, false), "clear-rd");
  assert.equal(staffingTransition({ Operations: 1, Engineer: 1, Business: 1, Management: 1 }, false), "ready");
  assert.equal(staffingTransition({ "Research & Development": 3, Operations: 1 }, false), "pause");
  assert.equal(staffingTransition({ Unassigned: 4 }, false), "assign");
});

test("budgeting preserves reserve at boundary and uses supplied market-price totals", () => {
  assert.equal(affordable(15, 5, [4, 6]), true);
  assert.equal(affordable(15, 5, [4, 6.01]), false);
  assert.equal(affordable(1, 5, [0]), true);
});

test("tea cost uses the v3 per-employee corporation constant", () => {
  assert.equal(teaCost({ teaCostPerEmployee: 500e3 }, 4), 2e6);
});

test("city budgets fairly reserve funds for all six cities", () => {
  assert.equal(cityPurchaseBudget(65, 5, 6), 10);
  assert.equal(cityPurchaseBudget(55, 5, 5), 10); // first city's unspent share is redistributed
  assert.equal(cityPurchaseBudget(5, 5, 6), 0);
});

test("boost readiness uses the unconstrained target, not a cash-constrained purchase", () => {
  const held = { Hardware: 1e-9, "AI Cores": 1e-9, Robots: 0, "Real Estate": 1e-9 };
  const desired = optimizeBoostMaterials(10, industry, materials, Infinity, held);
  assert.equal(boostTargetReady(industry, held, desired, held), false, "tiny holdings with no budget must not pass");
  const completed = Object.fromEntries(Object.keys(held).map((name) => [name, held[name] + desired[name]]));
  assert.equal(boostTargetReady(industry, held, desired, completed), true);
});

test("offer gate reports every missing prerequisite including minimum and office wellness", () => {
  const missing = roundOneMissing({ cityCount: 1, allWarehouses: false, officesSize4: false, finalJobs: false,
    officeWellness: false, wellnessThreshold: 99, research: 0, smartSupply: false, sales: false, adverts: 0,
    capacityReady: false, offerRound: 2, offerFunds: 1 }, 100);
  assert.equal(missing.length, 12);
  assert.ok(missing.some((x) => x.includes("below minimum")));
  assert.ok(missing.some((x) => x.includes("energy or morale below 99")));
  assert.deepEqual(roundOneMissing({ cityCount: 6, allWarehouses: true, officesSize4: true, finalJobs: true,
    officeWellness: true, wellnessThreshold: 99, research: 55, smartSupply: true, sales: true, adverts: 2,
    capacityReady: true, offerRound: 1, offerFunds: 100 }, 100), []);
});
