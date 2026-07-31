import assert from "node:assert/strict";
import test from "node:test";
import { nextWantedCleanup } from "./gang.js";

test("wanted cleanup does not run at the minimum wanted level", () => {
  assert.equal(nextWantedCleanup(false, 1, 0.5), false);
  assert.equal(nextWantedCleanup(true, 1, 0.5), false);
});

test("wanted cleanup retains penalty hysteresis above minimum wanted", () => {
  assert.equal(nextWantedCleanup(false, 2, 0.95), true);
  assert.equal(nextWantedCleanup(true, 2, 0.97), true);
  assert.equal(nextWantedCleanup(true, 2, 0.99), false);
  assert.equal(nextWantedCleanup(false, 2, 0.97), false);
});
