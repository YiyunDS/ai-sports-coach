// Run with:  node tests/motion.test.js
// Checks the "moving together" math: blending poses, finding the stride
// rhythm, and the pro's natural (not robot-perfect) movement.
var M = require("../js/angles.js");
var assert = require("assert");

// --- Blending two poses gives the pose in between ---
var a = M.makeStancePose({ kneeBend: 110, forwardLean: 40, strideExtension: 170, push: 0 });
var b = M.makeStancePose({ kneeBend: 110, forwardLean: 40, strideExtension: 170, push: 1, pushSide: "r" });
var half = M.lerpPose(a, b, 0.5);
assert.ok(Math.abs(half.rAnkle.z - (a.rAnkle.z + b.rAnkle.z) / 2) < 1e-9);
assert.deepStrictEqual(M.lerpPose(a, b, 0), a);

// --- The stride rhythm of the sample skater: 4 pushes, legs take turns ---
var frames = M.normalizeFrames(M.makeDemoFrames());
var rhythm = M.strideSignal(frames);
assert.strictEqual(rhythm.length, frames.length);
assert.strictEqual(rhythm[rhythm.length - 1].stride, 3, "expected 4 strides (3 leg changes)");
assert.strictEqual(rhythm[5].side, "r");
assert.strictEqual(rhythm[20].side, "l");
rhythm.forEach(function (r) {
  assert.ok(r.push >= 0 && r.push <= 1);
  assert.ok(r.peak >= 0.05 && r.push <= r.peak + 1e-9);
});
// In every stride the leg goes out first, then comes back (never out again).
for (var i = 1; i < rhythm.length; i++) {
  if (rhythm[i].stride === rhythm[i - 1].stride) assert.ok(!(rhythm[i].rising && !rhythm[i - 1].rising), "leg went out twice in one stride");
}

// --- A skater who just glides is not "striding" ---
var glide = [];
for (var g = 0; g < 20; g++) glide.push(M.makeStancePose({ kneeBend: 120, forwardLean: 35, strideExtension: 170, push: 0 }));
M.strideSignal(glide).forEach(function (r) { assert.ok(r.push < 0.1); });

// --- The pro's natural movement never breaks the body ---
["l", "r"].forEach(function (side) {
  for (var phase = 0; phase < 1; phase += 0.05) {
    var push = Math.pow(Math.sin(phase * Math.PI), 2);
    var p = M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 171, push: push, pushSide: side, phase: phase, natural: true, withStick: true });
    Object.keys(p).forEach(function (k) { assert.ok(isFinite(p[k].x + p[k].y + p[k].z), k + " is not a number"); });
    assert.ok(M.limbsLookRight(p), "legs have a silly shape at phase " + phase);
    // Bones keep their length (nothing stretches like rubber).
    assert.ok(Math.abs(M.len(M.sub(p[side + "Hip"], p[side + "Knee"])) - M.BODY.thigh) < 1e-6);
    assert.ok(Math.abs(M.len(M.sub(p.lShoulder, p.rShoulder)) - 2 * M.BODY.shoulderHalf) < 1e-6);
    // Skates never go under the ice.
    assert.ok(p.lAnkle.y > 0 && p.rAnkle.y > 0);
    var m = M.measurePose(p);
    assert.ok(m.kneeBend > 100 && m.kneeBend <= 111 && m.forwardLean >= 44 && m.forwardLean < 50);
  }
});
// The skate lifts off the ice only while the leg is coming back.
var out = M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 171, push: 0.5, pushSide: "r", phase: 0.25, natural: true });
var back = M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 171, push: 0.5, pushSide: "r", phase: 0.75, natural: true });
assert.ok(back.rAnkle.y > out.rAnkle.y + 0.05);
// Without "natural", the pose is exactly the angles we ask for (the old behavior).
var exact = M.measurePose(M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 171, push: 1, pushSide: "r" }));
assert.ok(Math.abs(exact.kneeBend - 110) < 0.01 && Math.abs(exact.strideExtension - 171) < 0.01);

console.log("All motion tests passed!");
