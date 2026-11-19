// Run with:  node tests/cleanup.test.js
// Checks the math that cleans up poses from a real video: smoothing,
// fixing swapped legs, fixed bone lengths, and skates on the ice.
var M = require("../js/angles.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }

// A dice we can repeat: the same "random" numbers every run.
var seed = 7;
function random() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
function wobble(size) { return (random() * 2 - 1) * size; }

// A clean pretend skater: 3 seconds, 20 poses per second, striding.
function cleanClip() {
  var frames = [], times = [];
  for (var i = 0; i < 60; i++) {
    var t = i / 20, stride = (t / 0.75) % 1;
    frames.push(M.makeStancePose({
      kneeBend: 115, forwardLean: 35, strideExtension: 165,
      push: Math.pow(Math.sin(stride * Math.PI), 2),
      pushSide: Math.floor(t / 0.75) % 2 ? "l" : "r"
    }));
    times.push(t);
  }
  return { frames: frames, times: times };
}
// The same clip, but every joint wobbles a few centimeters.
function noisy(frames, size) {
  return frames.map(function (f) {
    return M.mapPose(f, function (q) { return M.pt(q.x + wobble(size), q.y + wobble(size), q.z + wobble(size)); });
  });
}
// How far, on average, are the joints from the clean ones?
function meanError(a, b) {
  var total = 0, count = 0;
  a.forEach(function (f, i) {
    Object.keys(f).forEach(function (k) { if (b[i][k]) { total += M.len(M.sub(f[k], b[i][k])); count++; } });
  });
  return total / count;
}
function boneLength(f, a, b) { return M.len(M.sub(f[a], f[b])); }

test("smoothing brings a jittery clip much closer to the real one", function () {
  var clip = cleanClip(), shaky = noisy(clip.frames, 0.04);
  var calm = M.smoothTrack(shaky, clip.times, null);
  assert.ok(meanError(calm, clip.frames) < 0.7 * meanError(shaky, clip.frames),
    "before " + meanError(shaky, clip.frames).toFixed(3) + " after " + meanError(calm, clip.frames).toFixed(3));
});

test("one wild guess hardly moves the smooth path", function () {
  var clip = cleanClip(), shaky = clip.frames.map(function (f) { return M.mapPose(f, function (q) { return q; }); });
  shaky[30].rAnkle = M.add(shaky[30].rAnkle, M.pt(0, 0.5, 0)); // the AI put the skate half a meter up
  var calm = M.smoothTrack(shaky, clip.times, null);
  assert.ok(M.len(M.sub(calm[30].rAnkle, clip.frames[30].rAnkle)) < 0.05);
});

test("joints the AI was not sure about count less", function () {
  var clip = cleanClip(), shaky = clip.frames.map(function (f) { return M.mapPose(f, function (q) { return q; }); });
  shaky[30].lKnee = M.add(shaky[30].lKnee, M.pt(0.08, 0, 0));
  var sure = clip.frames.map(function () { return {}; });
  var unsure = clip.frames.map(function () { return {}; });
  unsure[30].lKnee = 0.05;
  var a = M.smoothTrack(shaky, clip.times, sure), b = M.smoothTrack(shaky, clip.times, unsure);
  assert.ok(M.len(M.sub(b[30].lKnee, clip.frames[30].lKnee)) < M.len(M.sub(a[30].lKnee, clip.frames[30].lKnee)));
});

test("smoothing does not blend across a long gap in time", function () {
  var a = M.makeStancePose({ kneeBend: 110, forwardLean: 40, strideExtension: 170 });
  var b = M.mapPose(a, function (q) { return M.add(q, M.pt(0, 0, 1)); });
  var calm = M.smoothTrack([a, a, a, b, b, b], [0, 0.05, 0.1, 2, 2.05, 2.1], null);
  assert.ok(M.len(M.sub(calm[2].lKnee, a.lKnee)) < 1e-9);
  assert.ok(M.len(M.sub(calm[3].lKnee, b.lKnee)) < 1e-9);
});

test("legs swapped in one pose get swapped back", function () {
  var clip = cleanClip(), frames = clip.frames.slice();
  frames[17] = M.swapLegs(frames[17]);
  var fixed = M.fixLegSwaps(frames, clip.times);
  assert.strictEqual(fixed.swapped[17], true);
  assert.strictEqual(fixed.swapped.filter(Boolean).length, 1, "only the broken pose is touched");
  assert.ok(meanError(fixed.frames, clip.frames) < 1e-9);
});

test("every bone keeps one length, and the angles do not change", function () {
  var clip = cleanClip();
  // Stretch each pose by a different amount, like the AI does.
  var stretchy = clip.frames.map(function (f, i) {
    var s = 0.7 + 0.6 * random();
    var hip = M.mid(f.lHip, f.rHip);
    return M.mapPose(f, function (q) { return M.add(hip, M.scale(M.sub(q, hip), s)); });
  });
  stretchy[5].lAnkle = M.add(stretchy[5].lKnee, M.scale(M.sub(stretchy[5].lAnkle, stretchy[5].lKnee), 2)); // one long shin
  var fixed = M.fixBoneLengths(stretchy);
  [["lHip", "lKnee"], ["lKnee", "lAnkle"], ["rHip", "rKnee"], ["lShoulder", "lElbow"], ["lHip", "rHip"]].forEach(function (b) {
    var lengths = fixed.map(function (f) { return boneLength(f, b[0], b[1]); });
    assert.ok(Math.max.apply(null, lengths) - Math.min.apply(null, lengths) < 1e-9, b.join("-") + " changes length");
  });
  fixed.forEach(function (f, i) {
    var want = M.measurePose(stretchy[i]), got = M.measurePose(f);
    assert.ok(Math.abs(want.leftKnee - got.leftKnee) < 1e-6 && Math.abs(want.forwardLean - got.forwardLean) < 1e-6);
  });
});

test("skates go on the ice and lie flat", function () {
  var p = M.makeStancePose({ kneeBend: 120, forwardLean: 30, strideExtension: 165, push: 0.6, pushSide: "r" });
  // Lift the whole body 20 cm, and the push skate 3 cm more (a wobble).
  var up = M.mapPose(p, function (q) { return M.add(q, M.pt(0.3, 0.2, 0.1)); });
  ["rKnee", "rAnkle", "rHeel", "rToe"].forEach(function (k) { up[k] = M.add(up[k], M.pt(0, 0.03, 0)); });
  var thigh = boneLength(up, "rHip", "rKnee"), shin = boneLength(up, "rKnee", "rAnkle");
  var g = M.plantSkates([up])[0];
  ["l", "r"].forEach(function (s) {
    assert.ok(Math.abs(g[s + "Ankle"].y - M.BODY.ankleHeight) < 1e-6, s + " ankle not on the ice");
    assert.ok(Math.abs(g[s + "Heel"].y - 0.03) < 1e-9 && Math.abs(g[s + "Toe"].y - 0.03) < 1e-9, s + " skate not flat");
  });
  assert.ok(Math.abs(boneLength(g, "rHip", "rKnee") - thigh) < 1e-6 && Math.abs(boneLength(g, "rKnee", "rAnkle") - shin) < 1e-6);
  assert.ok(Math.abs((g.lHip.x + g.rHip.x) / 2) < 1e-9 && Math.abs((g.lHip.z + g.rHip.z) / 2) < 1e-9, "hips centered");
});

test("a skate lifted high stays in the air", function () {
  var p = M.makeStancePose({ kneeBend: 120, forwardLean: 30, strideExtension: 165 });
  p.rAnkle = M.add(p.rAnkle, M.pt(0, 0.15, 0)); p.rHeel = M.add(p.rHeel, M.pt(0, 0.15, 0)); p.rToe = M.add(p.rToe, M.pt(0, 0.15, 0));
  var g = M.plantSkates([p])[0];
  assert.ok(g.rAnkle.y > M.BODY.ankleHeight + 0.1);
});

test("the weight does not flicker between skates", function () {
  var base = M.makeStancePose({ kneeBend: 120, forwardLean: 30, strideExtension: 165 });
  var frames = [0, 0.01, -0.01, 0.01].map(function (d) {
    var f = M.mapPose(base, function (q) { return q; });
    ["rAnkle", "rHeel", "rToe"].forEach(function (k) { f[k] = M.add(f[k], M.pt(0, d, 0)); });
    return f;
  });
  // The right skate goes 1 cm below the left one, but that is not
  // "clearly lower", so the left skate keeps the weight the whole time.
  M.plantSkates(frames).forEach(function (g) { assert.ok(Math.abs(g.lAnkle.y - M.BODY.ankleHeight) < 1e-9); });
});

test("the whole clean-up turns a wobbly clip into a steady skater", function () {
  var clip = cleanClip(), shaky = noisy(clip.frames, 0.05);
  shaky[12] = M.swapLegs(shaky[12]);
  var out = M.normalizeFrames(shaky, { smooth: true, times: clip.times });
  var thighs = out.map(function (f) { return boneLength(f, "lHip", "lKnee"); });
  assert.ok(Math.max.apply(null, thighs) - Math.min.apply(null, thighs) < 1e-9, "thigh changes length");
  out.forEach(function (f) {
    assert.ok(Math.min(f.lHeel.y, f.rHeel.y, f.lToe.y, f.rToe.y) > 0.03 - 1e-9, "a skate went under the ice");
    assert.ok(Math.abs(Math.min(f.lAnkle.y, f.rAnkle.y) - M.BODY.ankleHeight) < 1e-9, "no skate on the ice");
  });
  // The knee angle moves smoothly from pose to pose.
  var raw = M.normalizeFrames(shaky, { times: clip.times });
  function bumpiness(frames) {
    var k = frames.map(function (f) { return M.measurePose(f).kneeBend; }), total = 0;
    for (var i = 1; i < k.length; i++) total += Math.abs(k[i] - k[i - 1]);
    return total / (k.length - 1);
  }
  assert.ok(bumpiness(out) < 0.5 * bumpiness(raw), "knee " + bumpiness(raw).toFixed(1) + " -> " + bumpiness(out).toFixed(1));
});

test("flat-picture angles: a side view is measured right", function () {
  var lm = [];
  for (var i = 0; i < 33; i++) lm.push({ x: 0, y: 0 });
  function put(name, x, y) { lm[M.MP[name]] = { x: x, y: y }; }
  // Picture pixels, y goes down. Skater faces right, knees bent 90°,
  // back leaning 45° forward.
  put("lHip", 100, 100); put("rHip", 100, 100);
  put("lKnee", 140, 100); put("rKnee", 140, 100);
  put("lAnkle", 140, 140); put("rAnkle", 140, 140);
  put("lShoulder", 130, 70); put("rShoulder", 130, 70);
  var m = M.measureFlat(lm);
  assert.ok(Math.abs(m.kneeBend - 90) < 1e-9 && Math.abs(m.forwardLean - 45) < 1e-9);
});

test("side view or not", function () {
  var p = M.makeStancePose({ kneeBend: 115, forwardLean: 35, strideExtension: 165 }); // faces +x = across the picture
  assert.strictEqual(M.seenFromSide(p), true);
  var turned = M.mapPose(p, function (q) { return M.pt(q.z, q.y, q.x); }); // faces the camera
  assert.strictEqual(M.seenFromSide(turned), false);
});

test("the report uses flat-picture angles when it has them", function () {
  var frames = [M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 171, push: 1 })];
  var t = { kneeBend: { min: 100, max: 120 }, forwardLean: { min: 40, max: 50 }, strideExtension: { min: 160, max: 178 } };
  var r = M.analyzeFrames(frames, t, 10, 2, [{ kneeBend: 140, forwardLean: 20 }]);
  assert.strictEqual(Math.round(r.perFrame[0].m.kneeBend), 140);
  assert.strictEqual(r.perFrame[0].m.fromPicture, true);
  assert.strictEqual(r.summary.forwardLean.grade, "far");
});

console.log("All clean-up tests passed!");
