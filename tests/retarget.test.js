// Run with:  node tests/retarget.test.js
// Checks js/retarget.js: turning a skeleton's bones so it takes our poses.
var M = require("../js/angles.js");
var St = require("../js/stride.js");
var Rt = require("../js/retarget.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
var I = [0, 0, 0, 1]; // "no turn"

// A pretend model skeleton standing at rest: legs straight, arms hanging
// a little out to the sides (like a real model's "A pose").
var J = {
  pelvis: M.pt(0, 0.9, 0), spine_01: M.pt(-0.02, 0.98, 0), spine_02: M.pt(-0.01, 1.05, 0), spine_03: M.pt(-0.02, 1.12, 0),
  neck_01: M.pt(0, 1.42, 0), head: M.pt(0.03, 1.52, 0)
};
["l", "r"].forEach(function (s) {
  var z = s === "l" ? -1 : 1;
  J["thigh_" + s] = M.pt(0, 0.9, 0.105 * z);
  J["calf_" + s] = M.pt(0.01, 0.49, 0.12 * z);
  J["foot_" + s] = M.pt(0, 0.07, 0.13 * z);
  J["ball_" + s] = M.pt(0.13, 0.01, 0.15 * z);
  J["upperarm_" + s] = M.pt(0, 1.33, 0.18 * z);
  J["lowerarm_" + s] = M.pt(-0.02, 1.13, 0.33 * z);
  J["hand_" + s] = M.pt(0.06, 0.93, 0.42 * z);
});
var Q = {};
Object.keys(J).forEach(function (k) { Q[k] = I; });
var S = Rt.setup({ joints: J, quats: Q });

// Where a bone's far end lands after turning: start + turn x (rest bone).
function tip(out, bone, start, restFrom, restTo) { return M.add(start, Rt.qRotate(out.quats[bone], M.sub(J[restTo], J[restFrom]))); }
function close(a, b, tol) { return M.len(M.sub(a, b)) < tol; }
var poses = [];
for (var i = 0; i < 40; i++) poses.push(St.makeStridePose(i / 40, { kneeBend: 110, forwardLean: 45, strideExtension: 171 }));
poses.push({ pose: M.makeStancePose({ kneeBend: 110, forwardLean: 45, strideExtension: 171, withStick: true }), edges: { l: 0, r: 0 } });

test("turning the same way twice and blending work", function () {
  var q = Rt.turnBetween(M.pt(1, 0, 0), M.pt(0, 0, 1), M.pt(0, 1, 0), M.pt(0, 0, 1)); // a quarter turn
  assert.ok(close(Rt.qRotate(q, M.pt(1, 0, 0)), M.pt(0, 1, 0), 1e-9));
  assert.ok(close(Rt.qRotate(Rt.qMul(q, q), M.pt(1, 0, 0)), M.pt(-1, 0, 0), 1e-9));
  var half = Rt.qSlerp(I, q, 0.5);
  assert.ok(close(Rt.qRotate(half, M.pt(1, 0, 0)), M.norm(M.pt(1, 1, 0)), 1e-9));
});

test("at rest the skeleton does not move", function () {
  var rest = {};
  Object.keys(J).forEach(function (k) {
    if (/^(thigh|calf|foot|ball|upperarm|lowerarm|hand)_/.test(k)) rest[k] = J[k];
  });
  var pose = {};
  ["l", "r"].forEach(function (s) {
    var L = s === "l" ? "l" : "r";
    pose[L + "Hip"] = J["thigh_" + s]; pose[L + "Knee"] = J["calf_" + s]; pose[L + "Ankle"] = J["foot_" + s];
    pose[L + "Heel"] = M.add(J["foot_" + s], M.pt(-0.07, -0.04, 0)); pose[L + "Toe"] = M.add(pose[L + "Heel"], M.pt(J["ball_" + s].x - J["foot_" + s].x + 0.07, 0, J["ball_" + s].z - J["foot_" + s].z));
    pose[L + "Shoulder"] = J["upperarm_" + s]; pose[L + "Elbow"] = J["lowerarm_" + s]; pose[L + "Wrist"] = J["hand_" + s];
  });
  pose.neck = J.neck_01; pose.head = J.head;
  var out = Rt.solve(S, pose);
  ["thigh_l", "calf_r", "upperarm_l", "lowerarm_r", "neck_01"].forEach(function (b) {
    var q = out.quats[b], d = Math.abs(q[3]);
    assert.ok(d > 0.9999, b + " turned at rest");
  });
});

test("legs and arms point exactly where the pose says", function () {
  poses.forEach(function (r) {
    var p = r.pose, out = Rt.solve(S, p, r.edges);
    ["l", "r"].forEach(function (s) {
      var knee = tip(out, "thigh_" + s, p[s + "Hip"], "thigh_" + s, "calf_" + s);
      assert.ok(M.angleBetween(M.sub(knee, p[s + "Hip"]), M.sub(p[s + "Knee"], p[s + "Hip"])) < 1e-3, "thigh");
      var shin = Rt.qRotate(out.quats["calf_" + s], M.sub(J["foot_" + s], J["calf_" + s]));
      assert.ok(M.angleBetween(shin, M.sub(p[s + "Ankle"], p[s + "Knee"])) < 1e-3, "shin");
      var upper = Rt.qRotate(out.quats["upperarm_" + s], M.sub(J["lowerarm_" + s], J["upperarm_" + s]));
      assert.ok(M.angleBetween(upper, M.sub(p[s + "Elbow"], p[s + "Shoulder"])) < 1e-3, "upper arm");
      var fore = Rt.qRotate(out.quats["lowerarm_" + s], M.sub(J["hand_" + s], J["lowerarm_" + s]));
      assert.ok(M.angleBetween(fore, M.sub(p[s + "Wrist"], p[s + "Elbow"])) < 1e-3, "forearm");
    });
  });
});

test("the model's knee angle equals the pose's knee angle", function () {
  poses.forEach(function (r) {
    var p = r.pose, out = Rt.solve(S, p, r.edges);
    ["l", "r"].forEach(function (s) {
      var thigh = Rt.qRotate(out.quats["thigh_" + s], M.sub(J["calf_" + s], J["thigh_" + s]));
      var shin = Rt.qRotate(out.quats["calf_" + s], M.sub(J["foot_" + s], J["calf_" + s]));
      var model = 180 - M.angleBetween(thigh, shin);
      var want = M.angleAt(p[s + "Hip"], p[s + "Knee"], p[s + "Ankle"]);
      assert.ok(Math.abs(model - want) < 1e-3, s + " knee " + model.toFixed(2) + " vs " + want.toFixed(2));
    });
  });
});

test("knees face forward and never flip during a whole stride", function () {
  var prev = null;
  poses.slice(0, 40).forEach(function (r) {
    var out = Rt.solve(S, r.pose, r.edges);
    // The model's knee points where its rest "forward" (+x) is carried to.
    var kneeFace = Rt.qRotate(out.quats.thigh_r, M.pt(1, 0, 0));
    assert.ok(kneeFace.x > 0.2, "knee faces backward");
    if (prev) assert.ok(M.angleBetween(prev, kneeFace) < 25, "knee twisted suddenly");
    prev = kneeFace;
  });
});

test("the skate follows the blade and tips onto its inside edge", function () {
  var r = St.makeStridePose(St.STRIDE.liftOff, { kneeBend: 110, forwardLean: 45, strideExtension: 171 });
  var out = Rt.solve(S, r.pose, r.edges);
  var foot = S.bones.foot_r;
  var blade = Rt.qRotate(out.quats.foot_r, foot.dir);
  var want = M.sub(r.pose.rToe, r.pose.rHeel);
  assert.ok(M.angleBetween(blade, want) < 1e-3);
  var upright = Rt.qRotate(out.quats.foot_r, M.pt(0, 1, 0));
  assert.ok(Math.abs(M.angleBetween(upright, M.pt(0, 1, 0)) - r.edges.r) < 1, "tipped " + M.angleBetween(upright, M.pt(0, 1, 0)).toFixed(1));
  assert.ok(upright.z < 0, "the right skate tips toward the left (inside)");
});

test("the back leans with the pose and the pelvis sits between the hips", function () {
  poses.forEach(function (r) {
    var p = r.pose, out = Rt.solve(S, p, r.edges);
    var restTrunk = M.sub(J.neck_01, M.mid(J.thigh_l, J.thigh_r));
    var chest = Rt.qRotate(out.quats.spine_03, restTrunk);
    assert.ok(M.angleBetween(chest, M.sub(p.neck, M.mid(p.lHip, p.rHip))) < 1e-3, "chest");
    assert.ok(M.len(M.sub(out.pelvis, M.mid(p.lHip, p.rHip))) < 0.01, "pelvis");
  });
});

console.log("All retarget tests passed!");
