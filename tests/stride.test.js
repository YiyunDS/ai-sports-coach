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

test("a skate on the ice slides the way its blade points (late in the push it may skid a little)", function () {
  var speed = St.STRIDE.metersPerCycle, dt = 0.001;
  eachMoment(function (t) {
    var rp = at(t), rq = at(t + dt), p = rp.pose, q = rq.pose;
    ["l", "r"].forEach(function (s) {
      if (!onIce(rp, s) || !onIce(rq, s)) return;
      var move = M.pt((q[s + "Ankle"].x - p[s + "Ankle"].x) / dt + speed, 0, (q[s + "Ankle"].z - p[s + "Ankle"].z) / dt);
      var blade = M.sub(p[s + "Toe"], p[s + "Heel"]); blade.y = 0;
      var off = M.angleBetween(move, blade);
      // While gliding: no skid. While the blade turns out in the push: a little.
      var own = s === "r" ? t : (t + 0.5) % 1;
      var allowed = 3 + 40 * St.track(St.STRIDE.pushTurnOut, own);
      assert.ok(off < allowed, s + " skate skids " + off.toFixed(1) + "° at " + t.toFixed(3));
    });
  });
});

test("the push blade stays turned out until it leaves the ice", function () {
  [0.35, 0.45, 0.55, St.STRIDE.liftOff].forEach(function (s) {
    var p = at(s).pose, blade = M.sub(p.rToe, p.rHeel);
    var toeOut = Math.atan2(blade.z, blade.x) * DEG;
    assert.ok(toeOut > 12 && toeOut < 45, "toe-out " + toeOut.toFixed(0) + " at " + s);
  });
});

test("the skate turns smoothly (no sudden twists)", function () {
  eachMoment(function (t) {
    var a = at(t).pose, b = at(t + 1 / STEPS).pose;
    ["l", "r"].forEach(function (s) {
      var u = M.sub(a[s + "Toe"], a[s + "Heel"]), v = M.sub(b[s + "Toe"], b[s + "Heel"]);
      assert.ok(M.angleBetween(u, v) < 4, s + " skate twists " + M.angleBetween(u, v).toFixed(1) + "° at " + t.toFixed(3));
    });
  });
});

test("the skate tips with the shin: rolled as far as the shin leans in, toe down after the push", function () {
  eachMoment(function (t) {
    var r = at(t), lim = St.STRIDE.edgeLimits;
    var want = M.clamp(r.shin.r.side, lim[0], lim[1]);
    assert.ok(Math.abs(r.edges.r - want) < 4, "roll " + r.edges.r.toFixed(1) + " but shin " + want.toFixed(1) + " at " + t.toFixed(3));
  });
  // Just after the push, the skate trails behind with its toe pointing down.
  var p = at(0.75).pose, blade = M.sub(p.rToe, p.rHeel);
  assert.ok(blade.y < -0.05, "toe down after the push");
  // And the tipped blade never goes under the ice. (Toe and heel are the
  // bottom of the boot; the steel reaches 3 cm below them.)
  eachMoment(function (t) {
    var r = at(t), q = r.pose;
    ["l", "r"].forEach(function (s) {
      var lowest = Math.min(q[s + "Toe"].y, q[s + "Heel"].y);
      assert.ok(lowest > 0.03 * Math.cos(r.edges[s] / DEG) - 0.004, s + " blade under the ice at " + t.toFixed(3));
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

test("the free arm swings back behind the body and forward across the chest", function () {
  var back = at(0.55).pose, front = at(0.05).pose;
  // At the back: the upper arm is behind the line of the back (the skater
  // leans forward, so hanging straight down would still be in front of it),
  // and the hand is behind the hips, a little out to the side.
  var hip = M.mid(back.lHip, back.rHip), trunk = M.sub(back.neck, hip), arm = M.sub(back.rElbow, back.rShoulder);
  var behind = trunk.x * arm.y - trunk.y * arm.x; // which side of the back line the arm is on (side view)
  assert.ok(behind > 0, "the free arm does not reach behind the line of the back");
  assert.ok(back.rWrist.x < hip.x - 0.03, "the hand is not behind the hips");
  assert.ok(back.rWrist.z > back.rShoulder.z, "the hand swings back and out");
  // At the front: the hand is in front of the shoulder and toward the middle.
  assert.ok(front.rWrist.x > front.rShoulder.x + 0.25, "the hand is not in front");
  assert.ok(front.rWrist.z < front.rShoulder.z - 0.08, "the hand does not come across toward the middle");
  // The shoulders turn with the arm: the free arm's shoulder is ahead when the arm is in front.
  assert.ok(front.rShoulder.x > front.lShoulder.x && back.rShoulder.x < back.lShoulder.x, "the shoulders do not turn with the arm");
});

test("the top hand on the stick swings too, the other way from the free hand", function () {
  var rightPush = at(0.5).pose, leftPush = at(0).pose;
  // Forward of the hips while the free hand is back, and back while it is in front.
  var fwd = rightPush.lWrist.x - M.mid(rightPush.lHip, rightPush.rHip).x;
  var back = leftPush.lWrist.x - M.mid(leftPush.lHip, leftPush.rHip).x;
  assert.ok(fwd - back > 0.25, "the top hand swings " + (fwd - back).toFixed(2) + " m");
  // It swings less than the free hand, because the stick drags on the ice.
  var free = rightPush.rWrist.x - leftPush.rWrist.x;
  assert.ok(fwd - back < Math.abs(free), "the top hand swings less than the free hand");
  // And the stick blade stays down on the ice the whole time.
  eachMoment(function (t) { assert.ok(Math.abs(at(t).pose.stickBlade.y - 0.02) < 1e-9, "blade on the ice at " + t); });
});

test("the top hand holds the end of the stick in its fist", function () {
  eachMoment(function (t) {
    var p = at(t).pose, shaft = M.norm(M.sub(p.stickBlade, p.stickTop));
    var fist = M.gripPoint(p.lWrist, p.lElbow, shaft);
    // The shaft goes through the middle of the fist...
    var rel = M.sub(fist, p.stickTop), along = M.dot(rel, shaft);
    assert.ok(M.len(M.sub(rel, M.scale(shaft, along))) < 0.01, "the stick misses the fist at " + t);
    // ...and only the knob sticks out past it.
    assert.ok(Math.abs(along - M.KNOB_OUT) < 0.01, "knob " + along.toFixed(3) + " at " + t);
  });
});

test("a hand wraps around the stick like a real grip", function () {
  [[M.pt(1, 0, 0), M.pt(0.9, -0.4, 0.1)], [M.pt(0.6, -0.8, 0), M.pt(0.5, -0.85, 0.2)], [M.pt(1, 0, 0), M.pt(1, 0, 0)]].forEach(function (c) {
    var g = M.gripFrame(c[0], c[1]), shaft = M.norm(c[1]);
    assert.ok(Math.abs(M.dot(g.fingers, g.knuckles)) < 1e-9, "fingers square to the knuckles");
    assert.ok(M.angleBetween(g.fingers, c[0]) <= 35 + 1e-6, "the wrist cocks at most 35 degrees");
    assert.ok(M.dot(g.knuckles, shaft) > 0, "the index finger points down the stick");
  });
});

test("in the stance both hands hold the stick", function () {
  var p = M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 171, withStick: true });
  var shaft = M.norm(M.sub(p.stickBlade, p.stickTop));
  ["l", "r"].forEach(function (s) {
    var fist = M.gripPoint(p[s + "Wrist"], p[s + "Elbow"], shaft), rel = M.sub(fist, p.stickTop);
    var off = M.len(M.sub(rel, M.scale(shaft, M.dot(rel, shaft))));
    assert.ok(off < 0.03, s + " hand is " + off.toFixed(3) + " m off the stick");
  });
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
