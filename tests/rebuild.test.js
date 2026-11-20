// Run with:  node tests/rebuild.test.js
// Checks js/rebuild.js: rebuilding a smooth stride from wobbly pictures.
var M = require("../js/angles.js");
var St = require("../js/stride.js");
var R = require("../js/rebuild.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }

// A dice we can repeat: the same "random" numbers every run.
var seed = 7;
function random() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

var TARGET = { kneeBend: { min: 120, max: 145 }, forwardLean: { min: 20, max: 40 }, strideExtension: { min: 150, max: 180 } };

// A pretend skater we KNOW everything about, filmed as a list of poses.
//   o.seconds   how long the clip is
//   o.perSecond pictures per second (default 20)
//   o.pace      seconds for one full stride (default 1.4)
//   o.angles(t) the skater's numbers at second t:
//               { kneeBend, forwardLean, pushRight, pushLeft }
//   o.wobble    every joint jumps around by up to this many meters
//   o.keep(t)   (optional) false = this picture is missing
// Returns the poses, the times, the true clock, and what the page works
// out from them (rhythm and report), just like coach.js does.
function clip(o) {
  var perSecond = o.perSecond || 20, pace = o.pace || 1.4, start = o.start || 0.1;
  var frames = [], times = [], truth = [];
  for (var i = 0; i < o.seconds * perSecond; i++) {
    var t = i / perSecond;
    if (o.keep && !o.keep(t, i)) continue;
    var cycle = start + t / pace, a = o.angles(t);
    var pose = R.poseAt(cycle, a).pose;
    delete pose.stickTop; delete pose.stickBlade;   // the camera does not find sticks
    if (o.wobble) pose = M.mapPose(pose, function (q) {
      return M.pt(q.x + (random() - 0.5) * o.wobble, q.y + (random() - 0.5) * o.wobble, q.z + (random() - 0.5) * o.wobble);
    });
    frames.push(pose); times.push(t); truth.push(cycle);
  }
  var rhythm = M.strideSignal(frames);
  var span = Math.round(M.clamp(0.2 * perSecond, 2, 6));
  var analysis = M.analyzeFrames(frames, TARGET, 10, span, null, rhythm);
  return { frames: frames, times: times, truth: truth, rhythm: rhythm, analysis: analysis, pace: pace };
}
function steady(knee, lean, push) {
  return function () { return { kneeBend: knee, forwardLean: lean, pushRight: push, pushLeft: push }; };
}
// How far apart two clock readings are, going the short way around.
function apart(a, b) { var d = (((a - b) % 1) + 1.5) % 1 - 0.5; return Math.abs(d); }

function checkClock(c, rebuilt, limit) {
  var cycle = rebuilt.clock.cycle, worst = 0;
  for (var i = 0; i < cycle.length; i++) {
    worst = Math.max(worst, apart(cycle[i], c.truth[i]));
    if (i) assert.ok(cycle[i] >= cycle[i - 1], "the clock goes backward at picture " + i);
  }
  assert.ok(worst < limit, "the clock is off by " + worst.toFixed(3) + " of a stride");
  // It also counts the right number of strides from start to end.
  var counted = cycle[cycle.length - 1] - cycle[0], real = c.truth[c.truth.length - 1] - c.truth[0];
  assert.ok(Math.abs(counted - real) < 0.15, "counted " + counted.toFixed(2) + " strides, really " + real.toFixed(2));
}

test("we know where the model changes legs", function () {
  var c = R.changeMoment({ kneeBend: 148, forwardLean: 17, strideExtension: 163 });
  assert.ok(c > 0.25 && c < 0.45, "change at " + c);
});

test("a clean clip gives a steady clock that matches the real stride", function () {
  var c = clip({ seconds: 8, angles: steady(140, 25, 165) });
  var r = R.build(c.frames, c.times, c.rhythm, c.analysis);
  assert.ok(r.ok && r.rhythmFound, "rhythm not found");
  checkClock(c, r, 0.04);
  assert.ok(Math.abs(r.clock.secondsPerCycle - c.pace) < 0.08 * c.pace, "pace " + r.clock.secondsPerCycle);
});

test("the clock still works with missing pictures, a hole and wobbly joints", function () {
  var c = clip({
    seconds: 9, angles: steady(138, 26, 166), wobble: 0.04,
    keep: function (t) { return !(t > 4.0 && t < 4.6) && random() > 0.3; }   // a 0.6 s hole, and 3 in 10 pictures lost
  });
  var r = R.build(c.frames, c.times, c.rhythm, c.analysis);
  assert.ok(r.ok && r.rhythmFound, "rhythm not found");
  checkClock(c, r, 0.08);
  assert.ok(Math.abs(r.clock.secondsPerCycle - c.pace) < 0.08 * c.pace, "pace " + r.clock.secondsPerCycle);
});

test("a faster skater gets a faster clock", function () {
  var c = clip({ seconds: 6, pace: 0.9, perSecond: 30, angles: steady(135, 30, 168) });
  var r = R.build(c.frames, c.times, c.rhythm, c.analysis);
  checkClock(c, r, 0.05);
  assert.ok(Math.abs(r.clock.secondsPerCycle - 0.9) < 0.08, "pace " + r.clock.secondsPerCycle);
});

test("a skater who gets tired: the smooth knee bend follows", function () {
  // Knee 148 at first, 160 at the end (standing taller), less lean.
  function tired(t) { return t < 5 ? 0 : Math.min(1, (t - 5) / 4); }
  var c = clip({
    seconds: 10, wobble: 0.02,
    angles: function (t) { return { kneeBend: 144 + 10 * tired(t), forwardLean: 24 - 8 * tired(t), pushRight: 168, pushLeft: 168 }; }
  });
  var r = R.build(c.frames, c.times, c.rhythm, c.analysis);
  assert.ok(r.ok);
  var first = R.at(r, 20, 0), end = R.at(r, c.frames.length - 20, 0);
  assert.ok(Math.abs(first.kneeBend - 144) < 4, "knee at the start " + first.kneeBend.toFixed(1));
  assert.ok(Math.abs(end.kneeBend - 154) < 4, "knee at the end " + end.kneeBend.toFixed(1));
  assert.ok(first.forwardLean - end.forwardLean > 4, "the lean does not drop");
  // The overall numbers are the report's numbers.
  assert.strictEqual(r.overall.kneeBend, c.analysis.summary.kneeBend.value);
  assert.strictEqual(r.overall.strideExtension, c.analysis.summary.strideExtension.value);
});

test("a weaker left push is found", function () {
  var c = clip({ seconds: 9, angles: function () { return { kneeBend: 135, forwardLean: 28, pushRight: 170, pushLeft: 156 }; } });
  var r = R.build(c.frames, c.times, c.rhythm, c.analysis);
  assert.ok(r.ok && r.angles.sidesApart, "left and right were not told apart");
  var a = R.at(r, Math.floor(c.frames.length / 2), 0);
  assert.ok(Math.abs(a.pushRight - 170) < 4, "right push " + a.pushRight.toFixed(1));
  assert.ok(Math.abs(a.pushLeft - 156) < 4, "left push " + a.pushLeft.toFixed(1));
});

test("the push number switches legs smoothly, and is the right leg's at the right moment", function () {
  var L = St.STRIDE.liftOff;
  assert.ok(Math.abs(R.pushFor(L - 0.01, 170, 156) - 170) < 1e-9, "right push just before the right skate lifts off");
  assert.ok(Math.abs(R.pushFor(L - 0.51, 170, 156) - 156) < 1e-9, "left push just before the left skate lifts off");
  for (var k = 0; k < 400; k++) {
    var jump = Math.abs(R.pushFor((k + 1) / 400, 170, 156) - R.pushFor(k / 400, 170, 156));
    assert.ok(jump < 1, "the push number jumps " + jump.toFixed(2) + " at " + (k / 400));
  }
});

test("one wild picture hardly moves the smooth numbers", function () {
  var c = clip({ seconds: 6, angles: steady(140, 25, 165) });
  var before = R.strideAngles(c.analysis.perFrame, c.times, { secondsPerCycle: c.pace });
  c.analysis.perFrame[60].m.kneeBend = 60;      // the AI folds the leg up in one picture
  c.analysis.perFrame[60].m.forwardLean = 80;
  var after = R.strideAngles(c.analysis.perFrame, c.times, { secondsPerCycle: c.pace });
  for (var i = 0; i < c.times.length; i++) {
    assert.ok(Math.abs(after.kneeBend[i] - before.kneeBend[i]) < 1, "knee moved at " + i);
    assert.ok(Math.abs(after.forwardLean[i] - before.forwardLean[i]) < 1, "lean moved at " + i);
  }
});

test("no full push seen: the knee and the lean are still yours, the push is the standard one", function () {
  // A skater who only glides in the stance.
  var frames = [], times = [];
  for (var i = 0; i < 40; i++) { frames.push(M.makeStancePose({ kneeBend: 140, forwardLean: 25, strideExtension: 165 })); times.push(i / 20); }
  var rhythm = M.strideSignal(frames), analysis = M.analyzeFrames(frames, TARGET, 10, 4, null, rhythm);
  assert.strictEqual(analysis.peaks.length, 0);
  var glide = R.build(frames, times, rhythm, analysis, { standardPush: 158 });
  assert.ok(glide.ok && !glide.pushSeen && !glide.rhythmFound);
  var a = R.at(glide, 20, 0);
  assert.ok(Math.abs(a.kneeBend - 140) < 2 && Math.abs(a.forwardLean - 25) < 2, "knee " + a.kneeBend + ", lean " + a.forwardLean);
  assert.strictEqual(a.pushRight, 158);
  assert.strictEqual(glide.overall.strideExtension, 158);
  // The clock still runs evenly, so the skater strides instead of standing still.
  for (var k = 1; k < glide.clock.cycle.length; k++) assert.ok(glide.clock.cycle[k] > glide.clock.cycle[k - 1]);
  // The rebuilt skater can be drawn at every moment (no broken numbers).
  for (var j = 0; j < frames.length; j++) {
    var p = R.poseAt(R.at(glide, j, 0).cycle, R.at(glide, j, 0)).pose;
    assert.ok(isFinite(p.lKnee.x) && isFinite(p.rAnkle.y) && isFinite(p.neck.y), "broken pose at " + j);
  }
  // A skater standing very tall: the standard push is still straighter than the knee.
  var tall = frames.map(function () { return M.makeStancePose({ kneeBend: 168, forwardLean: 8, strideExtension: 172 }); });
  var tallRhythm = M.strideSignal(tall), tallReport = M.analyzeFrames(tall, TARGET, 10, 4, null, tallRhythm);
  var t = R.build(tall, times, tallRhythm, tallReport, { standardPush: 158 });
  assert.ok(t.ok && t.overall.strideExtension > t.overall.kneeBend + 7, "push " + t.overall.strideExtension);
});

test("only a few pictures still give a stride; one or two do not", function () {
  var c = clip({ seconds: 0.3, angles: steady(140, 25, 165) });   // 6 pictures
  var few = R.build(c.frames, c.times, c.rhythm, c.analysis, { standardPush: 158 });
  assert.ok(few.ok, "6 pictures should be enough");
  assert.ok(Math.abs(few.overall.kneeBend - c.analysis.summary.kneeBend.value) < 1e-9);
  var two = clip({ seconds: 0.1, angles: steady(140, 25, 165) }); // 2 pictures
  var none = R.build(two.frames, two.times, two.rhythm, two.analysis);
  assert.strictEqual(none.ok, false);
  assert.ok(/too few/.test(none.why));
});

test("numbers but no rhythm: the skater strides at a standard, even pace", function () {
  var c = clip({ seconds: 6, angles: steady(140, 25, 165) });
  // Pretend the leg-change finder saw only one push the whole time.
  var flat = c.rhythm.map(function (r) { return { side: "r", push: r.push, rising: r.rising, stride: 0, peak: r.peak }; });
  var r = R.build(c.frames, c.times, flat, c.analysis);
  assert.ok(r.ok && !r.rhythmFound);
  for (var i = 1; i < r.clock.cycle.length; i++) assert.ok(r.clock.cycle[i] > r.clock.cycle[i - 1]);
  assert.ok(r.clock.cycle[0] >= 0 && r.clock.cycle[0] < 1, "the clock starts at " + r.clock.cycle[0]);
  assert.ok(Math.abs(R.at(r, 50, 0).kneeBend - 140) < 3);
  // It is lined up with a push we saw: at the top of that push, the
  // rebuilt skater's same leg is at the end of its push too.
  var top = c.analysis.peaks[Math.floor(c.analysis.peaks.length / 2)], side = c.analysis.perFrame[top].m.pushSide;
  var want = St.STRIDE.liftOff + (side === "l" ? 0.5 : 0);
  assert.ok(apart(r.clock.cycle[top], want) < 1e-9, "the push top is at " + r.clock.cycle[top]);
  assert.ok(apart(c.truth[top], want) < 0.08, "the real skater was at " + c.truth[top] + " there");
});

test("the rebuilt skater has the numbers we gave it", function () {
  var a = { kneeBend: 150, forwardLean: 16, pushRight: 163, pushLeft: 163 };
  // Film the rebuilt skater and send it through the report.
  var c = clip({ seconds: 6, angles: function () { return a; } });
  var s = c.analysis.summary;
  assert.ok(Math.abs(s.kneeBend.value - 150) < 2, "knee " + s.kneeBend.value);
  assert.ok(Math.abs(s.forwardLean.value - 16) < 2, "lean " + s.forwardLean.value);
  assert.ok(Math.abs(s.strideExtension.value - 163) < 2, "push " + s.strideExtension.value);
});

test("the rebuilt skater moves smoothly from one drawn picture to the next", function () {
  var c = clip({ seconds: 8, wobble: 0.04, angles: steady(140, 25, 165), keep: function () { return random() > 0.3; } });
  var r = R.build(c.frames, c.times, c.rhythm, c.analysis);
  // Draw it 60 times a second, like the page does, and look at the biggest jump of any joint.
  function biggestJump(poseOf) {
    var worst = 0, prev = null;
    for (var t = c.times[0]; t < c.times[c.times.length - 1]; t += 1 / 60) {
      var i = 0;
      while (i < c.times.length - 2 && c.times[i + 1] <= t) i++;
      var blend = M.clamp((t - c.times[i]) / (c.times[i + 1] - c.times[i]), 0, 1), pose = poseOf(i, blend);
      if (prev) ["lKnee", "rKnee", "lAnkle", "rAnkle", "neck"].forEach(function (j) { worst = Math.max(worst, M.len(M.sub(pose[j], prev[j]))); });
      prev = pose;
    }
    return worst;
  }
  var filmed = biggestJump(function (i, blend) { return M.lerpPose(c.frames[i], c.frames[i + 1], blend); });
  var smooth = biggestJump(function (i, blend) { var a = R.at(r, i, blend); return R.poseAt(a.cycle, a).pose; });
  assert.ok(smooth < 0.06, "a joint jumps " + smooth.toFixed(3) + " m in 1/60 s");
  assert.ok(smooth < filmed, "smooth " + smooth.toFixed(3) + " is not better than filmed " + filmed.toFixed(3));
});

console.log("All rebuild tests passed!");
