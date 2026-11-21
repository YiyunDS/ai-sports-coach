// Run with:  node tests/chart.test.js
// Checks the math in js/chart.js: where an angle sits on the curve,
// which picture is under a finger, where the line is cut at a hole,
// and that the paint of the line agrees with the grades of the report.
var Ch = require("../js/chart.js");
var M = require("../js/angles.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= (tol || 1e-9), (msg || "") + " expected " + b + ", got " + a); }

var RANGE = { min: 120, max: 145 }, ZONE = 10;

test("the chart shows every value and the whole target, rounded to tens", function () {
  var b = Ch.bounds([150, 163, 171, 138], RANGE, ZONE);
  assert.ok(b.lo <= 110 && b.hi >= 171, JSON.stringify(b));   // 110 = target minus the yellow zone
  assert.strictEqual(b.lo % 10, 0);
  assert.strictEqual(b.hi % 10, 0);
  // Values inside the target: the chart still shows the yellow zones.
  var c = Ch.bounds([130, 131], RANGE, ZONE);
  assert.ok(c.lo <= 110 && c.hi >= 155, JSON.stringify(c));
  // A broken value (not a number) does not break the chart.
  var d = Ch.bounds([130, NaN, undefined, 131], RANGE, ZONE);
  assert.deepStrictEqual(d, c);
  // No values at all: just the target.
  assert.deepStrictEqual(Ch.bounds([], RANGE, ZONE), c);
});

test("a bigger angle sits higher on the chart", function () {
  var b = { lo: 100, hi: 180 };
  near(Ch.yOf(100, b, 10, 130), 130);   // the lowest value = the bottom edge
  near(Ch.yOf(180, b, 10, 130), 10);    // the highest value = the top edge
  near(Ch.yOf(140, b, 10, 130), 70);    // halfway
  assert.ok(Ch.yOf(150, b, 10, 130) < Ch.yOf(120, b, 10, 130));
  // A value outside the chart stays on its edge.
  near(Ch.yOf(250, b, 10, 130), 10);
  near(Ch.yOf(20, b, 10, 130), 130);
});

test("every picture has its own slot, and a finger finds the right one", function () {
  var n = 64, left = 40, right = 640;
  // The slots go from left to right, evenly.
  near(Ch.xOf(0, n, left, right), left + 600 / 64 / 2);
  near(Ch.xOf(n - 1, n, left, right), right - 600 / 64 / 2);
  for (var i = 0; i < n; i++) {
    // The middle of slot i belongs to picture i...
    assert.strictEqual(Ch.indexAt(Ch.xOf(i, n, left, right), n, left, right), i);
    // ...and so does a spot a little to either side of it.
    assert.strictEqual(Ch.indexAt(Ch.xOf(i, n, left, right) + 4, n, left, right), i);
    assert.strictEqual(Ch.indexAt(Ch.xOf(i, n, left, right) - 4, n, left, right), i);
  }
  // Outside the chart: the first or the last picture.
  assert.strictEqual(Ch.indexAt(-50, n, left, right), 0);
  assert.strictEqual(Ch.indexAt(5000, n, left, right), n - 1);
  // One single picture works too.
  assert.strictEqual(Ch.indexAt(300, 1, left, right), 0);
});

test("the line is cut where moments were left out", function () {
  // Pictures every 0.05 s, with a hole of 0.6 s after the 4th one.
  var times = [0, 0.05, 0.1, 0.15, 0.75, 0.8, 0.85];
  assert.deepStrictEqual(Ch.runs(times, 0.3), [[0, 3], [4, 6]]);
  // No hole: one piece.
  assert.deepStrictEqual(Ch.runs([0, 0.1, 0.2], 0.3), [[0, 2]]);
  // A lonely picture between two holes is its own piece.
  assert.deepStrictEqual(Ch.runs([0, 0.1, 1, 2, 2.1], 0.3), [[0, 1], [2, 2], [3, 4]]);
  assert.deepStrictEqual(Ch.runs([], 0.3), []);
  assert.deepStrictEqual(Ch.runs([4], 0.3), [[0, 0]]);
});

test("the drawing words: one 'move the pen' for each piece", function () {
  var points = [{ x: 0, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 5 }, { x: 30, y: 7 }];
  assert.strictEqual(Ch.linePath(points, [[0, 3]]), "M0.0,10.0L10.0,20.0L20.0,5.0L30.0,7.0");
  var two = Ch.linePath(points, [[0, 1], [2, 3]]);
  assert.strictEqual(two.split("M").length - 1, 2, two);   // the pen is lifted once
  assert.strictEqual(two, "M0.0,10.0L10.0,20.0M20.0,5.0L30.0,7.0");
  // A piece of one picture still leaves a mark.
  assert.ok(/M20\.0,5\.0h0\.1/.test(Ch.linePath(points, [[0, 1], [2, 2], [3, 3]])));
});

test("the paint of the line agrees with the grades of the report", function () {
  var b = Ch.bounds([95, 178], RANGE, ZONE);
  var stripes = Ch.gradeStripes(b, RANGE, ZONE);
  // The stripes cover the chart from top to bottom with no gap.
  near(stripes[0].from, 0);
  near(stripes[stripes.length - 1].to, 1);
  for (var k = 1; k < stripes.length; k++) near(stripes[k].from, stripes[k - 1].to);
  assert.deepStrictEqual(stripes.map(function (s) { return s.grade; }), ["far", "close", "good", "close", "far"]);
  // For every angle (in half degrees, never exactly on an edge): the
  // stripe at its height has the same grade as the report gives it.
  for (var v = b.lo + 0.25; v < b.hi; v += 0.5) {
    var down = (b.hi - v) / (b.hi - b.lo);
    var stripe = stripes.filter(function (s) { return down >= s.from && down < s.to; })[0];
    assert.strictEqual(stripe.grade, M.scoreAngle(v, RANGE, ZONE).grade, "at " + v + " degrees");
  }
  // A chart that ends inside the target has fewer stripes, but still no gap.
  var cut = Ch.gradeStripes({ lo: 125, hi: 140 }, RANGE, ZONE);
  assert.deepStrictEqual(cut, [{ from: 0, to: 1, grade: "good" }]);
});

test("the pretend kid: the curve says the same as the report", function () {
  var fs = require("fs"), path = require("path");
  var targets = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "targets.json"), "utf8"));
  var target = M.getTarget(targets, 9, "beginner");
  var r = M.analyzeFrames(M.normalizeFrames(M.makeDemoFrames()), target, targets.yellowZone);
  var values = r.perFrame.map(function (f) { return f.scores.kneeBend.value; });
  var b = Ch.bounds(values, target.kneeBend, targets.yellowZone);
  var stripes = Ch.gradeStripes(b, target.kneeBend, targets.yellowZone);
  r.perFrame.forEach(function (f, i) {
    var v = f.scores.kneeBend.value;
    assert.ok(v >= b.lo && v <= b.hi, "picture " + i + " is on the chart");
    var down = (b.hi - v) / (b.hi - b.lo);
    var onEdge = stripes.some(function (s) { return Math.abs(down - s.from) < 1e-9 || Math.abs(down - s.to) < 1e-9; });
    if (onEdge) return;
    var stripe = stripes.filter(function (s) { return down >= s.from && down < s.to; })[0];
    assert.strictEqual(stripe.grade, f.scores.kneeBend.grade, "picture " + i);
  });
});

console.log("All curve tests passed!");
