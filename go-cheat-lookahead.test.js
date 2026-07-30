import assert from "node:assert/strict";
import test from "node:test";

import {
  isAheadAfterKomi as cheatIsAheadAfterKomi,
  shouldUseCheat,
  simulateTwoMoves,
} from "./go-cheat-lookahead.js";
import { isAheadAfterKomi as normalIsAheadAfterKomi } from "./go-lookahead.js";

test("both players account for Illuminati's 7.5 komi before passing", () => {
  for (const isAhead of [normalIsAheadAfterKomi, cheatIsAheadAfterKomi]) {
    assert.equal(isAhead({ black: 20, white: 13 }, "Illuminati"), false);
    assert.equal(isAhead({ black: 21, white: 13 }, "Illuminati"), true);
  }
});

test("komi comparison uses the selected opponent", () => {
  const score = { black: 15, white: 13 };
  assert.equal(normalIsAheadAfterKomi(score, "Netburners"), true);
  assert.equal(normalIsAheadAfterKomi(score, "Slum Snakes"), false);
});

test("cheat threshold requires 100% for the opener and 95% thereafter", () => {
  assert.equal(shouldUseCheat(1, 0), true);
  assert.equal(shouldUseCheat(0.999999, 0), false);
  assert.equal(shouldUseCheat(0.95, 1), true);
  assert.equal(shouldUseCheat(0.949999, 1), false);
});

test("two-move simulation places simultaneously before capturing enemies", () => {
  const board = [".X.", "XO.", ".X."];
  const result = simulateTwoMoves(board, { x: 1, y: 2 }, { x: 0, y: 0 }, "X");

  assert.equal(result.captured, 1);
  assert.equal(result.board[1][1], ".");
  assert.equal(result.board[1][2], "X");
  assert.equal(result.board[0][0], "X");
});

test("two-move simulation removes friendly suicide when nothing is captured", () => {
  const board = [".....", "..O..", ".O.O.", "..O..", "....."];
  const result = simulateTwoMoves(board, { x: 2, y: 2 }, { x: 0, y: 0 }, "X");

  assert.equal(result.captured, 0);
  assert.equal(result.board[2][2], ".");
  assert.equal(result.board[0][0], "X");
});
