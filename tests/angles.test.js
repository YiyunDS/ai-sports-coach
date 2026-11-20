// A tiny test for the math. Run it with:   node tests/angles.test.js
// It prints OK for each check that passes and stops if one fails.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const M = require("../js/angles.js");
const DEFAULTS = require("../js/default-targets.js");
const targets = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "targets.json"), "utf8"));

function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= (tol || 1e-6), `${msg || ""} expected ${b}, got ${a}`);
}
function test(name, fn) { fn(); console.log("OK  " + name); }

test("a square corner is 90 degrees", () => {
  near(M.angleAt(M.pt(1, 0, 0), M.pt(0, 0, 0), M.pt(0, 1, 0)), 90);
});
test("a straight line is 180 degrees", () => {
  near(M.angleAt(M.pt(0, 2, 0), M.pt(0, 1, 0), M.pt(0, 0, 0)), 180);
});
test("a 3D angle works too (60 degrees in a triangle with equal sides)", () => {
  near(M.angleAt(M.pt(1, 0, 0), M.pt(0, 0, 0), M.pt(0.5, 0, Math.sqrt(3) / 2)), 60);
});

test("the pro stance has exactly the knee angle and lean we asked for", () => {
  for (const knee of [95, 110, 130, 150, 175]) {
    for (const lean of [0, 20, 45, 60]) {
      const m = M.measurePose(M.makeStancePose({ kneeBend: knee, forwardLean: lean }));
      near(m.leftKnee, knee, 1e-6, "left knee");
      near(m.rightKnee, knee, 1e-6, "right knee");
      near(m.forwardLean, lean, 1e-6, "lean");
    }
  }
});
test("skates are on the ice and bones keep their length", () => {
  for (const push of [0, 0.3, 0.7, 1]) {
    const p = M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 170, push, pushSide: "r", withStick: true });
    near(p.lAnkle.y, M.BODY.ankleHeight, 1e-6, "left ankle height");
    near(p.rAnkle.y, M.BODY.ankleHeight, 1e-6, "right ankle height");
    near(M.len(M.sub(p.rHip, p.rKnee)), M.BODY.thigh, 1e-6, "thigh");
    near(M.len(M.sub(p.rKnee, p.rAnkle)), M.BODY.shin, 1e-6, "shin");
    near(M.len(M.sub(p.lShoulder, p.lElbow)), M.BODY.upperArm, 1e-6, "upper arm");
    near(M.len(M.sub(p.rElbow, p.rWrist)), M.BODY.foreArm, 1e-6, "fore arm");
    for (const k of Object.keys(p)) assert.ok(Number.isFinite(p[k].x + p[k].y + p[k].z), k + " is a real number");
  }
});
test("at full push the push leg reaches the stride extension angle", () => {
  const m = M.measurePose(M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 170, push: 1, pushSide: "r" }));
  near(m.rightKnee, 170, 1e-6);
  near(m.leftKnee, 110, 1e-6);
  assert.strictEqual(m.glideSide, "l");
  assert.strictEqual(m.pushSide, "r");
  near(m.kneeBend, 110, 1e-6);
  near(m.strideExtension, 170, 1e-6);
});

test("age bands", () => {
  assert.strictEqual(M.ageBand(targets, 6), "6-8");
  assert.strictEqual(M.ageBand(targets, 8), "6-8");
  assert.strictEqual(M.ageBand(targets, 9), "9-10");
  assert.strictEqual(M.ageBand(targets, 12), "11-12");
  assert.strictEqual(M.ageBand(targets, 4), "6-8");
  assert.strictEqual(M.ageBand(targets, 15), "11-12");
  for (let age = 6; age <= 12; age++) for (const lvl of ["beginner", "experienced"]) {
    const t = M.getTarget(targets, age, lvl);
    for (const c of ["kneeBend", "forwardLean", "strideExtension"]) assert.ok(t[c].min < t[c].max, `${age} ${lvl} ${c}`);
  }
});
test("scoring: green inside, yellow close, red far", () => {
  const r = { min: 110, max: 130 };
  assert.deepStrictEqual(M.scoreAngle(120, r, 10), { value: 120, off: 0, grade: "good" });
  assert.strictEqual(M.scoreAngle(136, r, 10).grade, "close");
  assert.strictEqual(M.scoreAngle(136, r, 10).off, 6);
  assert.strictEqual(M.scoreAngle(95, r, 10).grade, "far");
  assert.strictEqual(M.scoreAngle(95, r, 10).off, -15);
});

test("MediaPipe points are flipped the right way", () => {
  const lm = [];
  for (let i = 0; i < 33; i++) lm.push({ x: 0, y: 0, z: 0, visibility: 0.9 });
  lm[M.MP.lKnee] = { x: 0.1, y: 0.4, z: -0.2, visibility: 0.9 };
  const p = M.mediapipeToPose(lm);
  assert.deepStrictEqual(p.lKnee, { x: 0.1, y: -0.4, z: 0.2 });
  assert.ok(p.head && p.neck && !p.lEar);
  assert.ok(M.poseIsClear(lm, 0.5));
  lm[M.MP.rAnkle].visibility = 0.1;
  assert.ok(!M.poseIsClear(lm, 0.5));
});

test("normalizeFrames turns the kid to face +x and keeps the angles", () => {
  const raw = M.makeDemoFrames();
  const frames = M.normalizeFrames(raw);
  assert.strictEqual(frames.length, raw.length);
  frames.forEach((f, i) => {
    const a = M.measurePose(raw[i]), b = M.measurePose(f);
    near(a.kneeBend, b.kneeBend, 1e-6, "knee");
    near(a.forwardLean, b.forwardLean, 1e-6, "lean");
    near(a.strideExtension, b.strideExtension, 1e-6, "ext");
    near(Math.min(f.lHeel.y, f.rHeel.y, f.lToe.y, f.rToe.y), 0.03, 1e-6, "on the ice");
    near((f.lHip.x + f.rHip.x) / 2, 0, 1e-6, "hips centered");
    assert.ok(f.neck.x > 0, "leaning toward +x");
    assert.ok(f.lHip.z < f.rHip.z, "left side is -z");
  });
  near(M.len(M.sub(frames[0].lHip, frames[0].lKnee)), M.BODY.thigh, 1e-6, "resized to pro size");
});

test("analyzing the pretend kid finds the slips", () => {
  const frames = M.normalizeFrames(M.makeDemoFrames());
  const target = M.getTarget(targets, 9, "beginner");
  const r = M.analyzeFrames(frames, target, targets.yellowZone);
  assert.strictEqual(r.perFrame.length, 60);
  assert.strictEqual(r.summary.kneeBend.grade, "close");      // knees a bit too straight
  assert.ok(r.summary.kneeBend.off > 0);
  assert.strictEqual(r.summary.forwardLean.grade, "close");   // standing a bit too tall
  assert.ok(r.summary.forwardLean.off < 0);
  assert.strictEqual(r.summary.strideExtension.grade, "good"); // nice full pushes
  near(r.summary.strideExtension.value, 168, 3, "best push");
  assert.ok(r.peaks.length >= 2 && r.peaks.length <= 4, "a few stride peaks, got " + r.peaks.length);
  assert.ok(r.worstFrame > 36, "the biggest slip is near the tired end, got " + r.worstFrame);
  assert.strictEqual(r.perFrame[r.worstFrame].scores.kneeBend.grade, "far");
  // The pro, compared with pro targets, is all green.
  const mid = (r) => (r.min + r.max) / 2;
  const pro = [M.makeStancePose({ kneeBend: mid(targets.pro.kneeBend), forwardLean: mid(targets.pro.forwardLean), strideExtension: mid(targets.pro.strideExtension), push: 1 })];
  const rp = M.analyzeFrames(pro, targets.pro, targets.yellowZone);
  for (const c of Object.keys(rp.summary)) assert.strictEqual(rp.summary[c].grade, "good", c);
});

test("the report picks ONE thing to work on next: the number farthest from its target", () => {
  const ids = ["kneeBend", "forwardLean", "strideExtension"];
  const s = (grade, off) => ({ value: 0, off: off, grade: grade });
  // Two yellow ones: the one with more degrees to go.
  assert.strictEqual(M.nextFocus({ kneeBend: s("close", 5), forwardLean: s("close", -9), strideExtension: s("good", 0) }, ids), "forwardLean");
  // A red one comes before a yellow one, even with fewer degrees.
  assert.strictEqual(M.nextFocus({ kneeBend: s("close", 9), forwardLean: s("good", 0), strideExtension: s("far", -4) }, ids), "strideExtension");
  // A tie: the first one in the list.
  assert.strictEqual(M.nextFocus({ kneeBend: s("close", 5), forwardLean: s("close", -5), strideExtension: s("good", 0) }, ids), "kneeBend");
  // Everything on target, or a check we could not measure: nothing to pick.
  assert.strictEqual(M.nextFocus({ kneeBend: s("good", 0), forwardLean: s("good", 0), strideExtension: null }, ids), null);
  // The pretend kid: it picks one of the two yellow ones, the one with more degrees to go.
  const target = M.getTarget(targets, 9, "beginner");
  const r = M.analyzeFrames(M.normalizeFrames(M.makeDemoFrames()), target, targets.yellowZone);
  const pick = M.nextFocus(r.summary, ids), other = pick === "kneeBend" ? "forwardLean" : "kneeBend";
  assert.ok(pick === "kneeBend" || pick === "forwardLean", "picked " + pick);
  assert.ok(Math.abs(r.summary[pick].off) >= Math.abs(r.summary[other].off));
});

test("js/default-targets.js is the same as targets.json", () => {
  assert.deepStrictEqual(DEFAULTS, targets);
});

console.log("\nAll math tests passed!");
