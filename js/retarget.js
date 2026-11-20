// =====================================================================
//  retarget.js  --  MAKING THE 3D MODEL TAKE OUR POSE
//
//  Our poses are lists of joint POINTS (hip here, knee there...).
//  The 3D model is moved differently: it has a skeleton of BONES, and
//  each bone is TURNED (rotated). Moving a bone moves the skin and gear
//  stuck to it. So we have to work out, for every bone, how far to turn
//  it so it points from one of our joints to the next.
//
//  Pointing a bone is not enough: a thigh can point the right way but
//  be twisted, so the knee faces sideways. So for each bone we also give
//  a second direction, the "pole": which way the knee (or elbow) should
//  face. Direction + pole fix the turn completely.
//
//  We describe turns with "quaternions": four numbers [x, y, z, w] that
//  stand for one turn in 3D. They are what 3D programs use, because they
//  blend smoothly and never get stuck.
//
//  No drawing here, so we can test it:  node tests/retarget.test.js
// =====================================================================
(function (root) {
  "use strict";
  var M = (typeof module !== "undefined" && module.exports) ? require("./angles.js") : root.CoachMath;
  var pt = M.pt, add = M.add, sub = M.sub, scale = M.scale, dot = M.dot, cross = M.cross, len = M.len, norm = M.norm, mid = M.mid;
  var UP = pt(0, 1, 0);

  // ---------- Quaternions ([x, y, z, w]) ----------------------------
  function qMul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
  }
  function qConj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
  // Turn a point by q.
  function qRotate(q, v) {
    var p = qMul(qMul(q, [v.x, v.y, v.z, 0]), qConj(q));
    return pt(p[0], p[1], p[2]);
  }
  // Blend from turn a (t = 0) to turn b (t = 1) at an even speed.
  function qSlerp(a, b, t) {
    var c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (c < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; c = -c; }
    if (c > 0.9995) {
      var r = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
      var l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2] + r[3] * r[3]);
      return [r[0] / l, r[1] / l, r[2] / l, r[3] / l];
    }
    var th = Math.acos(c), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
  }
  // The quaternion for a turn written as three arrows (the new x, y, z).
  function qFromAxes(x, y, z) {
    var m00 = x.x, m10 = x.y, m20 = x.z, m01 = y.x, m11 = y.y, m21 = y.z, m02 = z.x, m12 = z.y, m22 = z.z;
    var tr = m00 + m11 + m22, s;
    if (tr > 0) {
      s = 0.5 / Math.sqrt(tr + 1);
      return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
    } else if (m00 > m11 && m00 > m22) {
      s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
    } else if (m11 > m22) {
      s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
    }
    s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }

  // Three arrows at right angles from a direction and a pole.
  function axes(dir, pole) {
    var x = norm(dir);
    var z = sub(pole, scale(x, dot(pole, x)));
    if (len(z) < 1e-6) z = Math.abs(x.y) < 0.9 ? cross(x, UP) : cross(x, pt(1, 0, 0));
    z = norm(z);
    return { x: x, y: cross(z, x), z: z };
  }
  // The turn that carries (dirA, poleA) onto (dirB, poleB).
  function turnBetween(dirA, poleA, dirB, poleB) {
    var a = axes(dirA, poleA), b = axes(dirB, poleB);
    return qMul(qFromAxes(b.x, b.y, b.z), qConj(qFromAxes(a.x, a.y, a.z)));
  }

  // Which way does a knee (or elbow) point? From the middle of the
  // line top -> end, toward the joint. When the limb is almost straight
  // that is unclear, so we slide over to "fallback" (forward for knees,
  // backward for elbows).
  function bendPoint(top, joint, end, fallback) {
    var limb = norm(sub(joint, top));
    var out = sub(joint, mid(top, end));
    var bend = 180 - M.angleAt(top, joint, end);
    var w = M.clamp(bend / 25, 0, 1);
    var f = sub(fallback, scale(limb, dot(fallback, limb)));
    var o = sub(out, scale(limb, dot(out, limb)));
    var p = add(scale(norm(f), 1 - w), scale(norm(o), w));
    return len(p) > 1e-6 ? norm(p) : norm(f);
  }

  // Our joints that each bone runs between.
  var LIMBS = [
    { bone: "thigh", from: "Hip", to: "Knee", end: "Ankle", fallback: 1 },
    { bone: "calf", from: "Knee", to: "Ankle", top: "Hip", fallback: 1 },
    { bone: "upperarm", from: "Shoulder", to: "Elbow", end: "Wrist", fallback: -1 },
    { bone: "lowerarm", from: "Elbow", to: "Wrist", top: "Shoulder", fallback: -1 }
  ];
  var SPINE = [["spine_01", 0.4], ["spine_02", 0.7], ["spine_03", 1]];

  // ---------- Setting up, once, from the model's resting skeleton ----
  // rest.joints = where each bone starts, in our directions (the skater
  //               faces +x, left is -z, up is +y): pelvis, spine_01..03,
  //               neck_01, head, and for "l" and "r": thigh, calf, foot,
  //               ball, upperarm, lowerarm, hand.
  // rest.quats  = how each bone is turned when resting (whole-body turn).
  function setup(rest) {
    var J = rest.joints, S = { rest: rest, bones: {} };
    var fwd = pt(1, 0, 0);
    var hipMid = mid(J.thigh_l, J.thigh_r);
    S.hipMid = hipMid;
    S.pelvisOffset = sub(J.pelvis, hipMid);
    S.restSide = norm(sub(J.thigh_r, J.thigh_l));
    S.restTrunk = norm(sub(J.neck_01, hipMid));
    S.restNeck = norm(sub(J.head, J.neck_01));
    ["l", "r"].forEach(function (s) {
      var hip = J["thigh_" + s], knee = J["calf_" + s], ankle = J["foot_" + s];
      var shoulder = J["upperarm_" + s], elbow = J["lowerarm_" + s], wrist = J["hand_" + s];
      var knees = bendPoint(hip, knee, ankle, fwd), elbows = bendPoint(shoulder, elbow, wrist, scale(fwd, -1));
      S.bones["thigh_" + s] = { dir: sub(knee, hip), pole: knees };
      S.bones["calf_" + s] = { dir: sub(ankle, knee), pole: knees };
      S.bones["upperarm_" + s] = { dir: sub(elbow, shoulder), pole: elbows };
      S.bones["lowerarm_" + s] = { dir: sub(wrist, elbow), pole: elbows };
      var foot = sub(J["ball_" + s], ankle);
      S.bones["foot_" + s] = { dir: pt(foot.x, 0, foot.z), pole: UP };
      // The hand: the fingers point from the wrist to the middle knuckle,
      // and the knuckles run from the little finger to the index finger.
      var m1 = J["middle_01_" + s], i1 = J["index_01_" + s], p1 = J["pinky_01_" + s];
      if (m1 && i1 && p1) S.bones["hand_" + s] = { dir: sub(m1, wrist), pole: sub(i1, p1) };
    });
    return S;
  }

  // ---------- Every frame: the turn of each bone ---------------------
  // pose   = our joints (from angles.js or stride.js)
  // edges  = (optional) { l: degrees, r: degrees } skates tipped onto
  //          their inside edges
  // Returns { pelvis: where the pelvis bone starts, quats: { bone: turn } }
  // (turns are whole-body turns, not "compared with the parent bone").
  function solve(S, pose, edges) {
    var R = S.rest.quats, out = {};
    var hipMid = mid(pose.lHip, pose.rHip);
    var side = norm(sub(pose.rHip, pose.lHip));
    var shoulders = norm(sub(pose.rShoulder, pose.lShoulder));
    var trunk = norm(sub(pose.neck, hipMid));
    var fwd = norm(cross(UP, side));                       // the way the hips face

    // Hips and back: the hips tip forward a little, the chest fully.
    var hipsTurn = turnBetween(UP, S.restSide, norm(add(scale(UP, 0.75), scale(trunk, 0.25))), side);
    var chestTurn = turnBetween(S.restTrunk, S.restSide, trunk, shoulders);
    out.pelvis = qMul(hipsTurn, R.pelvis);
    SPINE.forEach(function (sp) { out[sp[0]] = qMul(qSlerp(hipsTurn, chestTurn, sp[1]), R[sp[0]]); });
    // Neck and head follow the line from the neck to the head.
    var headTurn = turnBetween(S.restNeck, S.restSide, sub(pose.head, pose.neck), shoulders);
    out.neck_01 = qMul(headTurn, R.neck_01);
    out.head = qMul(headTurn, R.head);

    ["l", "r"].forEach(function (s) {
      var P = function (name) { return pose[s + name]; };
      var knees = bendPoint(P("Hip"), P("Knee"), P("Ankle"), fwd);
      var elbows = bendPoint(P("Shoulder"), P("Elbow"), P("Wrist"), scale(fwd, -1));
      var aims = {
        thigh: [sub(P("Knee"), P("Hip")), knees],
        calf: [sub(P("Ankle"), P("Knee")), knees],
        upperarm: [sub(P("Elbow"), P("Shoulder")), elbows],
        lowerarm: [sub(P("Wrist"), P("Elbow")), elbows]
      };
      Object.keys(aims).forEach(function (b) {
        var r = S.bones[b + "_" + s];
        out[b + "_" + s] = qMul(turnBetween(r.dir, r.pole, aims[b][0], aims[b][1]), R[b + "_" + s]);
      });
      // The skate points from the heel to the toe, and tips onto its
      // inside edge (toward the other skate) by edges[s] degrees.
      var blade = sub(P("Toe"), P("Heel"));
      var upright = UP;
      var tip = edges && edges[s] ? edges[s] * Math.PI / 180 : 0;
      if (tip) {
        var across = norm(cross(norm(blade), UP));              // the skate's right side
        var inside = s === "r" ? scale(across, -1) : across;
        upright = add(scale(UP, Math.cos(tip)), scale(inside, Math.sin(tip)));
      }
      var f = S.bones["foot_" + s];
      out["foot_" + s] = qMul(turnBetween(f.dir, f.pole, blade, upright), R["foot_" + s]);

      // A hand that holds the stick (its wrist is right next to the
      // shaft) wraps around it: the shaft crosses the palm, the index
      // finger toward the blade (see gripFrame in angles.js). A free hand
      // just follows the forearm.
      var hb = S.bones["hand_" + s];
      if (hb && R["hand_" + s] && pose.stickTop && pose.stickBlade) {
        var shaft = norm(sub(pose.stickBlade, pose.stickTop));
        var rel = sub(P("Wrist"), pose.stickTop), along = dot(rel, shaft);
        if (len(sub(rel, scale(shaft, along))) < 0.14 && along > -0.12 && along < 0.7) {
          var grip = M.gripFrame(sub(P("Wrist"), P("Elbow")), shaft);
          out["hand_" + s] = qMul(turnBetween(hb.dir, hb.pole, grip.fingers, grip.knuckles), R["hand_" + s]);
        }
      }
    });

    // Where the pelvis bone starts: from the middle of the hips, turned with them.
    var pelvis = add(hipMid, qRotate(hipsTurn, S.pelvisOffset));
    return { pelvis: pelvis, quats: out };
  }

  var api = {
    qMul: qMul, qConj: qConj, qRotate: qRotate, qSlerp: qSlerp, qFromAxes: qFromAxes,
    turnBetween: turnBetween, bendPoint: bendPoint, setup: setup, solve: solve
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachRetarget = api;
})(typeof window !== "undefined" ? window : this);
