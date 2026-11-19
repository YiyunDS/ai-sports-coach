// =====================================================================
//  A tiny test for our angle math.
//  Run it with:   node tests/angles.test.js
//
//  A "test" is like checking your homework with an answer key.
//  We give the math some dots where we ALREADY know the answer, and
//  make sure it gets the same answer.
// =====================================================================

const assert = require("node:assert/strict");
const M = require("../angles.js");

// Two numbers are "close enough" if they are within 0.01 of each other.
function close(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${label}: expected ${expected}, got ${actual}`
  );
  console.log(`  ok  ${label} = ${actual.toFixed(2)}`);
}

console.log("angleAt (the knee angle):");
// Straight leg: hip, knee, ankle all in a line going down.
close(M.angleAt({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }), 180, "straight leg");
// Corner of a book: hip is to the left of the knee, ankle is below it.
close(M.angleAt({ x: -1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 2 }), 90, "right angle");
// 45 degrees.
close(M.angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), 45, "45 degrees");
// 120 degrees: arrows at 0 and 120 degrees around the middle dot.
close(
  M.angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: Math.cos((2 * Math.PI) / 3), y: Math.sin((2 * Math.PI) / 3) }),
  120,
  "120 degrees"
);
// Order of the outside dots should not matter.
close(M.angleAt({ x: 0, y: 2 }, { x: 0, y: 1 }, { x: -1, y: 1 }), 90, "swapped order");
// Dots on top of each other give "not a number".
assert.ok(Number.isNaN(M.angleAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })));
console.log("  ok  same dots -> NaN");

console.log("leanFromVertical (forward lean):");
// Shoulders right above hips (remember y goes DOWN the screen).
close(M.leanFromVertical({ x: 0, y: 0 }, { x: 0, y: 1 }), 0, "standing tall");
// Shoulders out to the side, level with hips = lying flat.
close(M.leanFromVertical({ x: 1, y: 1 }, { x: 0, y: 1 }), 90, "lying flat");
// Leaning 45 degrees to the right and to the left give the same answer.
close(M.leanFromVertical({ x: 1, y: 0 }, { x: 0, y: 1 }), 45, "lean right 45");
close(M.leanFromVertical({ x: -1, y: 0 }, { x: 0, y: 1 }), 45, "lean left 45");
// 30 degrees: go up 1, over tan(30).
close(M.leanFromVertical({ x: Math.tan(Math.PI / 6), y: 0 }, { x: 0, y: 1 }), 30, "lean 30");

console.log("median, scoreInRange, whereIs:");
close(M.median([5, 1, 3]), 3, "median odd");
close(M.median([4, 1, 3, 2]), 2.5, "median even");
close(M.median([1, NaN, 3]), 2, "median skips NaN");
const r = { min: 100, max: 120 };
close(M.scoreInRange(110, r), 100, "score inside range");
close(M.scoreInRange(90, r), 70, "score 10 degrees low");
close(M.scoreInRange(200, r), 0, "score never below 0");
assert.equal(M.whereIs(90, r), "low");
assert.equal(M.whereIs(110, r), "good");
assert.equal(M.whereIs(130, r), "high");
console.log("  ok  whereIs low/good/high");

console.log("\nAll angle tests passed!");
