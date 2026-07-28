import assert from "node:assert/strict";
import test from "node:test";
import { calculateProductBudget, nextTobaccoName } from "./products.js";

const config = {
  reserve: 100e9,
  minBudget: 20e9,
  maxBudget: 1e12,
  fraction: 0.10,
  growth: 1.15,
};

test("budget preserves reserve and uses fraction of excess funds", () => {
  assert.equal(calculateProductBudget(600e9, 0, config), 50e9);
});

test("budget observes minimum and waits rather than breaking reserve", () => {
  assert.equal(calculateProductBudget(300e9, 0, config), 20e9);
  assert.equal(calculateProductBudget(110e9, 0, config), null);
});

test("budget grows over the newest product and respects maximum", () => {
  assert.ok(Math.abs(calculateProductBudget(1e12, 100e9, config) - 115e9) < 1);
  assert.equal(calculateProductBudget(10e12, 2e12, config), 1e12);
});

test("budget waits when growth target is not affordable", () => {
  assert.equal(calculateProductBudget(200e9, 100e9, config), null);
});

test("names are tobacco themed and generation numbers increase", () => {
  assert.equal(nextTobaccoName([], ""), "Golden Leaf 001");
  assert.equal(nextTobaccoName(["Handmade Starter", "Golden Leaf 001", "Velvet Ember 002"], "Acme"), "Acme Nightshade Reserve 003");
  assert.equal(nextTobaccoName(["Golden Leaf 001", "Nightshade Reserve 003"], ""), "Copper Cigar 004");
});
