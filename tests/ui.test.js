// Run with:  node tests/ui.test.js
// Checks the math in js/ui.js: the "start fast, stop gently" curve, the
// number that counts up, and how much of the report's ring is filled.
var UI = require("../js/ui.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }

test("the curve starts at 0, ends at 1, and never goes backward", function () {
  assert.strictEqual(UI.easeOut(0), 0);
  assert.strictEqual(UI.easeOut(1), 1);
  var before = 0;
  for (var i = 1; i <= 100; i++) {
    var now = UI.easeOut(i / 100);
    assert.ok(now >= before, "went backward at " + i);
    assert.ok(now <= 1, "went past the end at " + i + " (that would be a bounce)");
    before = now;
  }
});

test("the curve starts fast and stops gently", function () {
  // Half the time gone: already most of the way there.
  assert.ok(UI.easeOut(0.5) > 0.9, "halfway: " + UI.easeOut(0.5));
  // The first tenth moves much more than the last tenth.
  var first = UI.easeOut(0.1) - UI.easeOut(0), last = UI.easeOut(1) - UI.easeOut(0.9);
  assert.ok(first > 50 * last, "first " + first + ", last " + last);
});

test("times before the start and after the end are safe", function () {
  assert.strictEqual(UI.easeOut(-3), 0);
  assert.strictEqual(UI.easeOut(7), 1);
});

test("a number counts from the start value to exactly the end value", function () {
  assert.strictEqual(UI.countAt(60, 150, 0), 60);
  assert.strictEqual(UI.countAt(60, 150, 1), 150);
  assert.strictEqual(UI.countAt(60, 150, 2), 150);   // a late picture does not overshoot
  // Whole numbers only, and always between the two ends.
  for (var i = 0; i <= 20; i++) {
    var n = UI.countAt(60, 150, i / 20);
    assert.strictEqual(n, Math.round(n));
    assert.ok(n >= 60 && n <= 150, "showed " + n);
  }
  // Counting down works too (the age changed and the number got smaller).
  assert.strictEqual(UI.countAt(150, 140, 1), 140);
  assert.ok(UI.countAt(150, 140, 0.5) <= 150 && UI.countAt(150, 140, 0.5) >= 140);
});

test("the ring shows the right share", function () {
  var r = 27, around = 2 * Math.PI * r;
  assert.ok(Math.abs(UI.ringDash(0, r).around - around) < 1e-9);
  assert.ok(Math.abs(UI.ringDash(0, r).hidden - around) < 1e-9, "0 of 3: nothing filled");
  assert.ok(Math.abs(UI.ringDash(1, r).hidden) < 1e-9, "3 of 3: all filled");
  assert.ok(Math.abs(UI.ringDash(1 / 3, r).hidden - around * 2 / 3) < 1e-9, "1 of 3: a third filled");
  // A share outside 0..1 is pulled back in.
  assert.ok(Math.abs(UI.ringDash(1.4, r).hidden) < 1e-9);
  assert.ok(Math.abs(UI.ringDash(-1, r).hidden - around) < 1e-9);
});

console.log("All page-movement tests passed!");
