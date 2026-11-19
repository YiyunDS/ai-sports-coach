// Run with:  node tests/tracker.test.js
// Checks the skater-following math in js/tracker.js and the
// "which way is forward" math in js/angles.js.
var T = require("../js/tracker.js");
var M = require("../js/angles.js");
var assert = require("assert");

// --- The box around a person ---
var pts = [];
for (var i = 0; i < 10; i++) pts.push({ x: 100 + i * 2, y: 200 + i * 10, v: 0.9 });
pts.push({ x: 900, y: 900, v: 0.1 }); // a joint the AI is NOT sure about: ignored
var box = T.boxOf(pts, 0.4);
assert.strictEqual(box.w, 18); assert.strictEqual(box.h, 90);
assert.strictEqual(box.cx, 109); assert.strictEqual(box.cy, 245);

// --- The search window always stays inside the picture ---
var win = T.cropWindow(10, 10, 200, 1280, 720);
assert.deepStrictEqual(win, { x: 0, y: 0, size: 200 });
win = T.cropWindow(1270, 700, 200, 1280, 720);
assert.deepStrictEqual(win, { x: 1080, y: 520, size: 200 });
assert.strictEqual(T.cropWindow(640, 360, 5000, 1280, 720).size, 720); // never bigger than the picture

// --- The window grows when the skater is lost ---
var skater = { cx: 500, cy: 300, w: 30, h: 80 };
assert.ok(T.windowSize(skater, 3, 720) > T.windowSize(skater, 0, 720));
assert.strictEqual(T.windowSize(skater, 0, 720), 200);
assert.strictEqual(T.windowSize(skater, 50, 720), 720);

// --- Guessing ahead ---
assert.deepStrictEqual(T.predict(null, skater), { cx: 500, cy: 300 });
assert.deepStrictEqual(T.predict({ cx: 480, cy: 300 }, skater), { cx: 514, cy: 300 });

// --- Picking OUR skater, not somebody else ---
var ours = { cx: 510, cy: 302, w: 32, h: 84 };
var bigKidCloseToCamera = { cx: 505, cy: 330, w: 150, h: 300 };
var farAwayKid = { cx: 900, cy: 300, w: 30, h: 80 };
assert.strictEqual(T.pickCandidate([bigKidCloseToCamera, farAwayKid, ours], { cx: 505, cy: 300 }, skater, 0), 2);
assert.strictEqual(T.pickCandidate([bigKidCloseToCamera, farAwayKid], { cx: 505, cy: 300 }, skater, 0), -1);
assert.strictEqual(T.pickCandidate([], { cx: 505, cy: 300 }, skater, 0), -1);

// --- Which person did you click? ---
assert.strictEqual(T.pickClicked([farAwayKid, ours], 512, 310), 1);
assert.strictEqual(T.pickClicked([farAwayKid, ours], 100, 100), -1);

// --- The list of moments to look at includes the click moment ---
var plan = T.sampleTimes(12.4, 0.1, 3.27);
assert.ok(Math.abs(plan.times[plan.seedIndex] - 3.27) < 0.001);
assert.ok(plan.times[0] > 0 && plan.times[plan.times.length - 1] < 12.4);
assert.ok(plan.times.length > 115 && plan.times.length < 126);

// --- Did the camera jump? ---
var gray = [], white = [], slightly = [];
for (var px = 0; px < 576; px++) { gray.push(120); white.push(240); slightly.push(120 + (px % 10)); }
assert.strictEqual(T.pictureChange(gray, gray), 0);
assert.ok(Math.abs(T.pictureChange(gray, white) - 120 / 255) < 1e-9);
assert.ok(T.pictureChange(gray, slightly) < 0.03);
// Normal following: small changes, never a jump.
assert.strictEqual(T.cameraJumped([0.03, 0.09, 0.05, 0.1, 0.07], 0.05), false);
// A scene cut: one huge change.
assert.strictEqual(T.cameraJumped([0.03, 0.04, 0.3], 0.05), true);
// A fast swing: three big changes in a row (numbers from the real test clip at 10 s).
assert.strictEqual(T.cameraJumped([0.07, 0.116, 0.092, 0.14], 0.05), true);
assert.strictEqual(T.cameraJumped([0.116, 0.05, 0.12], 0.05), false);
// Pictures far apart in time are allowed to change more.
assert.strictEqual(T.cameraJumped([0.18], 0.05), true);
assert.strictEqual(T.cameraJumped([0.18], 0.2), false);

// --- A skater cut off by the edge of the picture is not measured ---
assert.strictEqual(T.touchesEdge({ cx: 640, cy: 360, w: 100, h: 300 }, 1280, 720), false);
assert.strictEqual(T.touchesEdge({ cx: 40, cy: 360, w: 100, h: 300 }, 1280, 720), true);   // off the left side
assert.strictEqual(T.touchesEdge({ cx: 640, cy: 600, w: 100, h: 300 }, 1280, 720), true);  // feet below the bottom

// --- A skater who turns around during the clip still faces forward ---
function spin(pose, angle) {
  var c = Math.cos(angle), s = Math.sin(angle), out = {};
  Object.keys(pose).forEach(function (k) { var q = pose[k]; out[k] = M.pt(q.x * c - q.z * s, q.y, q.x * s + q.z * c); });
  return out;
}
var stance = M.makeStancePose({ kneeBend: 115, forwardLean: 40, strideExtension: 170, push: 0.6, pushSide: "r" });
var turning = [];
for (var k = 0; k < 20; k++) turning.push(spin(stance, k * 0.3)); // spins almost a full circle
var fixed = M.normalizeFrames(turning);
fixed.forEach(function (f) {
  var m = M.measurePose(f), want = M.measurePose(stance);
  assert.ok(Math.abs(m.kneeBend - want.kneeBend) < 0.5, "knee angle changed");
  assert.ok(Math.abs(m.forwardLean - want.forwardLean) < 0.5, "lean changed");
  // The chest must be in front of the hips (+x) in every pose.
  assert.ok(f.neck.x > M.mid(f.lHip, f.rHip).x + 0.1, "skater is not facing forward");
});

// --- If the AI mixes up left and right, we swap them back ---
var mixedUp = M.swapSides(stance);
var repaired = M.normalizeFrames([mixedUp])[0];
// The skater faces +x, so their left side must be at -z.
assert.ok(repaired.lHip.z < repaired.rHip.z, "left and right are still mixed up");
assert.strictEqual(M.measurePose(repaired).pushSide, "r");

// --- Legs with a silly shape are thrown away ---
assert.strictEqual(M.limbsLookRight(stance), true);
var broken = JSON.parse(JSON.stringify(stance));
broken.lAnkle.y -= 2; // a shin two meters long
assert.strictEqual(M.limbsLookRight(broken), false);

console.log("All tracker tests passed!");
