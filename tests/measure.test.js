// Run with:  node tests/measure.test.js
// Checks js/measure.js: measuring a stride from many wobbly pushes.
var M = require("../js/angles.js");
var St = require("../js/stride.js");
var Me = require("../js/measure.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }

// A dice we can repeat: the same "random" numbers every run.
var seed = 11;
function random() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

// A pretend pro: we KNOW its numbers, so we can check that measuring
// finds them again. 20 poses per second, like our video reading.
var KNOWN = { kneeBend: 112, forwardLean: 40, strideExtension: 168 };
function clip(seconds, wobble) {
  var frames = [], times = [];
  for (var i = 0; i < seconds * 20; i++) {
    var t = i / 20;
    var pose = St.makeStridePose(t / St.STRIDE.secondsPerCycle, KNOWN).pose;
    delete pose.stickTop; delete pose.stickBlade;
    if (wobble) pose = M.mapPose(pose, function (q) {
      return M.pt(q.x + (random() - 0.5) * wobble, q.y + (random() - 0.5) * wobble, q.z + (random() - 0.5) * wobble);
    });
    frames.push(pose); times.push(t);
  }
  return { frames: frames, times: times, rhythm: M.strideSignal(frames) };
}

test("the clip is cut into single pushes, legs taking turns", function () {
  var c = clip(9, 0);
  var cut = Me.splitStrides(c.frames, c.times, c.rhythm);
  assert.ok(cut.strides.length >= 6, "found " + cut.strides.length);
  for (var i = 1; i < cut.strides.length; i++) assert.notStrictEqual(cut.strides[i].side, cut.strides[i - 1].side);
  cut.strides.forEach(function (s) {
    assert.ok(Math.abs(s.seconds - St.STRIDE.secondsPerCycle / 2) < 0.11, "a push takes " + s.seconds);
  });
});

test("a mirrored left push looks like a right push", function () {
  var left = St.makeStridePose(0.0, KNOWN).pose, right = St.makeStridePose(0.5, KNOWN).pose;
  delete left.stickTop; delete left.stickBlade;
  var flipped = Me.mirrorPose(left);
  ["Hip", "Knee", "Ankle"].forEach(function (j) {
    assert.ok(M.len(M.sub(flipped["r" + j], right["r" + j])) < 1e-9, j);
  });
});

test("measuring finds the numbers we put in", function () {
  var c = clip(11, 0);
  var r = Me.measureStride(c.frames, c.times, c.rhythm);
  assert.ok(r.used >= 8);
  var n = r.numbers;
  assert.ok(Math.abs(n.secondsPerPush.value - 1.0) < 0.06, "seconds " + n.secondsPerPush.value);
  assert.ok(Math.abs(n.glideKneeDeepest.value - 112) < 2.5, "glide knee " + n.glideKneeDeepest.value);
  assert.ok(Math.abs(n.pushKneeStraightest.value - 168) < 2.5, "push knee " + n.pushKneeStraightest.value);
  assert.ok(Math.abs(n.leanAverage.value - 40) < 2, "lean " + n.leanAverage.value);
  assert.ok(n.skateFarthestBack.value > 0.1 && n.skateLift.value > 0.03 && n.handSwing.value > 0.2);
  assert.ok(n.glideKneeDeepest.spread < 1 && n.pushKneeStraightest.spread < 1, "a perfect clip has almost no spread");
  assert.strictEqual(r.curves.glideKnee.length, Me.STEPS + 1);
});

test("wobbly poses still give the right numbers, with a bigger spread", function () {
  var c = clip(11, 0.03); // every joint wobbles up to 1.5 cm
  var r = Me.measureStride(c.frames, c.times, c.rhythm), n = r.numbers;
  assert.ok(Math.abs(n.pushKneeStraightest.value - 168) < 6, "push knee " + n.pushKneeStraightest.value);
  assert.ok(Math.abs(n.glideKneeDeepest.value - 112) < 6, "glide knee " + n.glideKneeDeepest.value);
  assert.ok(Math.abs(n.leanAverage.value - 40) < 3);
  // The middle push is smoother than any single one.
  var curve = r.curves.pushKnee, bumps = 0;
  for (var i = 2; i < curve.length; i++) bumps += Math.abs(curve[i] - 2 * curve[i - 1] + curve[i - 2]);
  assert.ok(bumps / curve.length < 6, "bumpy: " + (bumps / curve.length).toFixed(1));
});

test("a push with a hole in it is thrown away", function () {
  var c = clip(11, 0);
  var before = Me.splitStrides(c.frames, c.times, c.rhythm).strides.length;
  // Lose the skater for 0.4 seconds in the middle of the clip.
  var keep = c.times.map(function (t) { return t < 5.0 || t > 5.4; });
  var frames = c.frames.filter(function (_, i) { return keep[i]; });
  var times = c.times.filter(function (_, i) { return keep[i]; });
  var cut = Me.splitStrides(frames, times, M.strideSignal(frames));
  assert.ok(cut.strides.length < before, "nothing was thrown away");
  cut.strides.forEach(function (s) { assert.ok(times[s.to] < 5.0 || times[s.from] > 5.4, "a push with a hole was kept"); });
});

test("too few pushes: we say so instead of guessing", function () {
  var c = clip(1.5, 0);
  var r = Me.measureStride(c.frames, c.times, c.rhythm);
  assert.strictEqual(r.numbers, null);
});

test("pushes are found from the knees alone (when left and right are mixed up)", function () {
  // 60 pictures per second, like our measuring mode.
  var rows = [];
  for (var i = 0; i < 9 * 60; i++) {
    var p = St.makeStridePose((i / 60) / St.STRIDE.secondsPerCycle, KNOWN).pose;
    var l = M.angleAt(p.lHip, p.lKnee, p.lAnkle), r = M.angleAt(p.rHip, p.rKnee, p.rAnkle);
    rows.push([i / 60, Math.min(l, r), Math.max(l, r), M.measurePose(p).forwardLean]);
  }
  var found = Me.pushesFromKnees(rows);
  assert.ok(found.pushes.length >= 7, "found " + found.pushes.length);
  assert.ok(Math.abs(found.pushKnee.value - 168) < 3, "push knee " + found.pushKnee.value);
  assert.ok(found.glideKnee.value > 105 && found.glideKnee.value < 125, "glide knee " + found.glideKnee.value);
  assert.ok(found.pushKnee.spread < 1);
  // A skater who only glides has no pushes.
  assert.strictEqual(Me.pushesFromKnees(rows.map(function (r) { return [r[0], 150, 155, 20]; })).pushes.length, 0);
});

test("the saved McDavid numbers give four pushes that agree", function () {
  var data = require("../data/pro-stride-measured.json");
  var found = Me.pushesFromKnees(data.rows);
  assert.strictEqual(found.pushes.length, 4);
  // The pushing knee: all four within a few degrees of each other.
  assert.ok(found.pushKnee.value > 158 && found.pushKnee.value < 168, "push knee " + found.pushKnee.value);
  assert.ok(found.pushKnee.spread <= 4, "spread " + found.pushKnee.spread);
  // The standing knee: deeper than our old guess of 110, but the pushes disagree more.
  assert.ok(found.glideKnee.value > 85 && found.glideKnee.value < 105, "glide knee " + found.glideKnee.value);
  // The lean readings disagree a lot (the camera angle changes), so we do not use them.
  assert.ok(found.lean.spread > 8, "lean spread " + found.lean.spread);
  // The pro's target ranges in targets.json come from these numbers.
  var pro = require("../js/default-targets.js").pro;
  assert.ok(pro.strideExtension.min <= found.pushKnee.value && found.pushKnee.value <= pro.strideExtension.max);
  assert.ok(pro.kneeBend.min <= found.glideKnee.value && found.glideKnee.value <= pro.kneeBend.max);
});

console.log("All measuring tests passed!");
