// Run with:  node tests/stride.test.js
// Checks the pro's skating stride in js/stride.js.
var M = require("../js/angles.js");
var St = require("../js/stride.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
var B = M.BODY, DEG = 180 / Math.PI;
var PRO = { kneeBend: 110, forwardLean: 45, strideExtension: 171 };
function at(t, opts) { return St.makeStridePose(t, opts || PRO); }
function bone(p, a, b) { return M.len(M.sub(p[a], p[b])); }
// The bottom of the steel blade: 9 cm under the ankle, less when the skate is tipped onto its edge.
function bladeBottom(r, s) { return r.pose[s + "Ankle"].y - B.ankleHeight * Math.cos(r.edges[s] / DEG); }
function onIce(r, s) { return Math.abs(bladeBottom(r, s)) < 1e-6; }
var STEPS = 400;
function eachMoment(fn) { for (var i = 0; i < STEPS; i++) fn(i / STEPS); }

test("smooth curves pass through every keyframe and loop around", function () {
  var keys = [[0, 1], [0.3, 4], [0.7, -2]];
  keys.forEach(function (k) { assert.ok(Math.abs(St.curve(keys, k[0]) - k[1]) < 1e-9); });
  assert.ok(Math.abs(St.curve(keys, 0.999999) - St.curve(keys, 0)) < 1e-4);
  assert.ok(Math.abs(St.curve(keys, 1.3) - 4) < 1e-9);
});

test("bones never change length", function () {
  eachMoment(function (t) {
    var p = at(t).pose;
    ["l", "r"].forEach(function (s) {
      assert.ok(Math.abs(bone(p, s + "Hip", s + "Knee") - B.thigh) < 1e-6, "thigh at " + t);
      assert.ok(Math.abs(bone(p, s + "Knee", s + "Ankle") - B.shin) < 1e-6, "shin at " + t);
      assert.ok(Math.abs(bone(p, s + "Shoulder", s + "Elbow") - B.upperArm) < 1e-6, "upper arm at " + t);
      assert.ok(Math.abs(bone(p, s + "Elbow", s + "Wrist") - B.foreArm) < 1e-6, "forearm at " + t);
    });
    assert.ok(Math.abs(bone(p, "stickTop", "stickBlade") - St.STRIDE.stickLength) < 1e-6, "the stick stretched at " + t);
  });
});

test("there is always a skate on the ice, and never one under it", function () {
  var both = 0;
  eachMoment(function (t) {
    var r = at(t);
    assert.ok(onIce(r, "l") || onIce(r, "r"), "both skates in the air at " + t);
    ["l", "r"].forEach(function (s) { assert.ok(bladeBottom(r, s) > -1e-6, "skate in the ice at " + t); });
    if (onIce(r, "l") && onIce(r, "r")) both++;
  });
  // Studies of full-speed skating: both skates on the ice about 15-25% of the time.
  var share = both / STEPS;
  assert.ok(share > 0.15 && share < 0.25, "both skates down " + Math.round(share * 100) + "% of the time");
});

test("the glide knee bends exactly to the target at its deepest", function () {
  [100, 110, 125, 140].forEach(function (k) {
    var r = at(St.STRIDE.deepest, { kneeBend: k, forwardLean: 40, strideExtension: 168 });
    assert.strictEqual(r.glideSide, "r");
    assert.ok(Math.abs(M.angleAt(r.pose.rHip, r.pose.rKnee, r.pose.rAnkle) - k) < 1e-6, "knee " + k);
  });
});

test("the push leg straightens exactly to the target at lift-off", function () {
  [160, 168, 175].forEach(function (e) {
    var r = at(St.STRIDE.liftOff, { kneeBend: 110, forwardLean: 45, strideExtension: e }), p = r.pose;
    assert.ok(Math.abs(M.angleAt(p.rHip, p.rKnee, p.rAnkle) - e) < 1e-6, "push " + e);
    assert.ok(onIce(r, "r"), "the push skate is still on the ice at lift-off");
  });
});

test("the push goes out to the side and back", function () {
  var p = at(St.STRIDE.liftOff).pose;
  assert.ok(p.rAnkle.z - p.rHip.z > 0.25, "out to the side");
  assert.ok(p.rAnkle.x < p.rHip.x - 0.1, "behind the hip");
});

test("the hips shift over the glide skate", function () {
  // Just after the right skate lands (t = shiftAt) the hips are over it;
  // half a cycle later they are over the left skate.
  var when = St.STRIDE.shiftAt;
  assert.ok(M.mid(at(when).pose.lHip, at(when).pose.rHip).z > 0.04, "over the right skate");
  assert.ok(M.mid(at(when + 0.5).pose.lHip, at(when + 0.5).pose.rHip).z < -0.04, "over the left skate");
  // The weight is already on the standing skate when the other one lifts off.
  var liftOffLeft = St.STRIDE.liftOff - 0.5;
  assert.ok(M.mid(at(liftOffLeft).pose.lHip, at(liftOffLeft).pose.rHip).z > 0.04, "weight not over the right skate at left lift-off");
});

test("a skate on the ice slides only the way its blade points", function () {
  var speed = St.STRIDE.metersPerCycle, dt = 0.001;
  eachMoment(function (t) {
    var rp = at(t), rq = at(t + dt), p = rp.pose, q = rq.pose;
    ["l", "r"].forEach(function (s) {
      if (!onIce(rp, s) || !onIce(rq, s)) return;
      var move = M.pt((q[s + "Ankle"].x - p[s + "Ankle"].x) / dt + speed, 0, (q[s + "Ankle"].z - p[s + "Ankle"].z) / dt);
      var blade = M.sub(p[s + "Toe"], p[s + "Heel"]); blade.y = 0;
      var off = M.angleBetween(move, blade);
      assert.ok(off < 3, s + " skate skids " + off.toFixed(1) + "° at " + t.toFixed(3));
    });
  });
});

test("the pushing leg is almost straight for a good part of the stride (like McDavid's)", function () {
  // Measured on the McDavid clip: the pushing knee stays above 155 degrees
  // for roughly 9 to 20 percent of the stride. Our pro, with his angles:
  var mcdavid = { kneeBend: 97.5, forwardLean: 45, strideExtension: 163 };
  var above155 = 0, above150 = 0;
  eachMoment(function (t) {
    var p = at(t, mcdavid).pose, k = M.angleAt(p.rHip, p.rKnee, p.rAnkle);
    if (k >= 155) above155++;
    if (k >= 150) above150++;
    assert.ok(k <= 163 + 1e-6, "straighter than the push angle at " + t);
  });
  assert.ok(above155 / STEPS > 0.09 && above155 / STEPS < 0.2, "above 155: " + (above155 / STEPS * 100).toFixed(0) + "%");
  assert.ok(above150 / STEPS > 0.13, "above 150: " + (above150 / STEPS * 100).toFixed(0) + "%");
});

test("the knee follows the 'extend' keyframes exactly while the skate is on the ice", function () {
  var o = { kneeBend: 100, forwardLean: 45, strideExtension: 164 };
  [0.3, 0.4, 0.45, 0.5, 0.55].forEach(function (s) {
    var p = at(s, o).pose, want = 100 + 64 * St.track(St.STRIDE.extend, s);
    assert.ok(Math.abs(M.angleAt(p.rHip, p.rKnee, p.rAnkle) - want) < 1e-6, "at " + s);
  });
});

test("a skate on the ice points ahead or a little outward, never backward or far inward", function () {
  var speed = St.STRIDE.metersPerCycle, dt = 0.001;
  [PRO, { kneeBend: 97.5, forwardLean: 45, strideExtension: 163 }, { kneeBend: 146, forwardLean: 17, strideExtension: 163 }].forEach(function (o) {
    eachMoment(function (t) {
      var a = at(t, o), b = at(t + dt, o);
      if (!onIce(a, "r") || !onIce(b, "r")) return;
      var ahead = (b.pose.rAnkle.x - a.pose.rAnkle.x) / dt + speed, outward = (b.pose.rAnkle.z - a.pose.rAnkle.z) / dt;
      var toeOut = Math.atan2(outward, ahead) * DEG;
      assert.ok(ahead > 1.0, "the skate almost stops at " + t);
      assert.ok(toeOut > -5 && toeOut < 50, "toe-out " + toeOut.toFixed(0) + " at " + t.toFixed(3));
    });
  });
});

test("the push skate rolls onto its inside edge", function () {
  var r = at(St.STRIDE.liftOff);
  assert.ok(r.edges.r > 25, "edge " + r.edges.r);
  assert.ok(Math.abs(at(0.1).edges.r) < 10, "the glide skate starts almost flat");
});

test("the free arm swings opposite to the pushing leg", function () {
  var rightPush = at(0.5).pose, leftPush = at(0).pose;
  assert.ok(rightPush.rWrist.x < rightPush.rShoulder.x - 0.1, "right arm back while the right leg pushes");
  assert.ok(leftPush.rWrist.x > leftPush.rShoulder.x + 0.1, "right arm forward while the left leg pushes");
});

test("the lean stays close to the target", function () {
  eachMoment(function (t) {
    var m = M.measurePose(at(t).pose);
    assert.ok(Math.abs(m.forwardLean - 45) < 3, "lean " + m.forwardLean.toFixed(1) + " at " + t);
  });
});

test("the loop joins up and every step is small (no jumps)", function () {
  var a = at(0).pose, b = at(1).pose;
  Object.keys(a).forEach(function (k) { assert.ok(M.len(M.sub(a[k], b[k])) < 1e-9, k); });
  var biggest = 0;
  eachMoment(function (t) {
    var p = at(t).pose, q = at(t + 1 / STEPS).pose;
    Object.keys(p).forEach(function (k) { biggest = Math.max(biggest, M.len(M.sub(p[k], q[k]))); });
  });
  // 400 steps per 2-second cycle: nothing moves more than 3 cm in 5 ms.
  assert.ok(biggest < 0.03, "a joint jumped " + biggest.toFixed(3) + " m");
});

test("the pushing leg is named right for the signs", function () {
  assert.strictEqual(at(0.5).pushSide, "r");
  assert.strictEqual(at(0.5).glideSide, "l");
  assert.strictEqual(at(0.0).pushSide, "l");
  assert.strictEqual(at(0.3).pushSide, null);
});

test("a stride from the video maps to the same leg in the pro's cycle", function () {
  var t = St.cycleTimeFor("r", 0.5);                       // right leg at full push
  assert.ok(Math.abs(t - St.STRIDE.liftOff) < 1e-9);
  assert.strictEqual(at(St.cycleTimeFor("l", 0.45)).pushSide, "l");
  assert.strictEqual(at(St.cycleTimeFor("r", 0.45)).pushSide, "r");
});

test("a skater who stands tall still keeps the skates on the ice and the legs in one piece", function () {
  var tall = { kneeBend: 150, forwardLean: 15, strideExtension: 162 };
  eachMoment(function (t) {
    var r = at(t, tall);
    assert.ok(onIce(r, "l") || onIce(r, "r"), "both skates in the air at " + t);
    ["l", "r"].forEach(function (s) {
      var knee = M.angleAt(r.pose[s + "Hip"], r.pose[s + "Knee"], r.pose[s + "Ankle"]);
      assert.ok(knee <= 162 + 1e-6, s + " leg straighter than the push angle: " + knee.toFixed(1) + " at " + t);
      assert.ok(bladeBottom(r, s) > -1e-6, "skate in the ice at " + t);
    });
  });
});

test("the sample skater strides, stands too tall and tires", function () {
  var targets = require("../js/default-targets.js");
  var frames = M.normalizeFrames(St.makeDemoSession(0.1));
  var rhythm = M.strideSignal(frames);
  assert.ok(rhythm[rhythm.length - 1].stride >= 4, "several strides");
  var r = M.analyzeFrames(frames, M.getTarget(targets, 9, "beginner"), targets.yellowZone, 2, null, rhythm);
  assert.strictEqual(r.summary.kneeBend.grade, "close");
  assert.ok(r.summary.kneeBend.off > 0, "knees too straight");
  assert.ok(r.summary.forwardLean.off < 0, "standing too tall");
  assert.ok(r.peaks.length >= 3 && r.summary.strideExtension, "pushes found");
  assert.ok(Math.abs(r.summary.strideExtension.value - 163) < 4, "push " + r.summary.strideExtension.value);
  assert.ok(r.worstFrame > 38, "the biggest slip is near the tired end");
});

console.log("All stride tests passed!");
