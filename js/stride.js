// =====================================================================
//  stride.js  --  HOW THE PRO SKATES
//
//  A skating stride repeats over and over. One full "cycle" is a push
//  with the RIGHT leg and then a push with the LEFT leg. We describe one
//  cycle with a few "keyframes" (snapshots), like the drawings an
//  animator makes, and the computer fills in the moments between them
//  with smooth curves.
//
//  What a real stride looks like (and what this file copies):
//    1. TOUCHDOWN  the skate lands under the body, a little in front.
//    2. GLIDE      the skater rides that skate with a deep knee bend.
//                  The hips slide sideways over it (weight shift).
//    3. PUSH       the leg drives out to the side and back until it is
//                  almost straight, and the skate rolls onto its inside
//                  edge. The other skate has already landed, so for a
//                  short time both skates are on the ice.
//    4. RECOVERY   the skate lifts a little and swings back in under the
//                  body, low over the ice, ready to land again.
//  The free arm swings forward and back, opposite to the pushing leg,
//  and the shoulders turn a little with it. The top hand stays on the
//  stick. The head stays up.
//
//  A skate can only slide the way its blade points. So we turn each
//  skate to point the way it is actually moving over the ice.
//
//  The numbers come from skating studies where we could find them
//  (see SOURCES.md). The rest are our best estimates, and we plan to
//  check them against a video of a strong skater.
//
//  No drawing in this file, so we can test it:  node tests/stride.test.js
// =====================================================================
(function (root) {
  "use strict";
  var M = (typeof module !== "undefined" && module.exports) ? require("./angles.js") : root.CoachMath;
  var pt = M.pt, add = M.add, sub = M.sub, scale = M.scale, len = M.len, norm = M.norm;
  var DEG = 180 / Math.PI;

  // ---------- The keyframes (kids can change these!) -----------------
  // Times are parts of ONE LEG's cycle, from 0 (its skate touches the ice)
  // to 1 (it touches down again). Distances are in meters, for a skater
  // with legs about 0.8 m long (the size of BODY in angles.js).
  var STRIDE = {
    secondsPerCycle: 2.0,   // one right push and one left push (shown a bit slower than real life)
    metersPerCycle: 2.2,    // how far the skater travels in one cycle

    liftOff: 0.6,           // the skate leaves the ice at this part of its cycle
                            // (each skate is on the ice 60% of the time, so both
                            //  are on the ice 2 x 10% = 20% of the time; studies
                            //  of full-speed skating find about 15 to 25%)
    deepest: 0.3,           // the glide knee is bent the most here
    pushOutDegrees: 55,     // the push goes this far out to the side (0 = straight back, 90 = straight out)

    // Where the skate is, compared with the middle of the skater's path.
    //   forward = toward where the skater is going (+) or behind (-)
    //   out     = out to its own side (+) or across under the body (-)
    //   lift    = how high off the ice
    // The skate's spot at lift-off is worked out by the computer, so the
    // push leg ends EXACTLY at the "push" angle from targets.json.
    forward: [[0, 0.1], [0.15, 0.06], [0.3, 0.0], [0.45, -0.1], [0.75, -0.17], [0.9, -0.02]],
    out:     [[0, 0.04], [0.15, 0.05], [0.3, 0.08], [0.45, 0.2], [0.75, 0.3], [0.9, 0.13]],
    lift:    [[0, 0], [0.15, 0], [0.3, 0], [0.45, 0], [0.6, 0], [0.68, 0.03], [0.8, 0.065], [0.92, 0.03], [0.98, 0.004]],
    // How far the skate rolls onto its inside edge (degrees).
    edge:    [[0, -2], [0.15, 2], [0.3, 6], [0.45, 18], [0.6, 36], [0.7, 12], [0.85, 0]],

    weightShift: 0.06,      // how far the hips slide sideways over the glide skate (m)
    hipBob: 0.012,          // how much the hips rise and sink (m)
    shoulderTurn: 8,        // how far the shoulders turn with the arm swing (degrees)
    armSwing: 0.24,         // how far the free hand swings forward and back (m)
    stickHandSwing: 0.06,   // the top hand on the stick moves much less (m)
    stickSway: 8,           // the stick blade sways side to side (degrees)
    stickLength: 1.15       // from the top hand to the blade (m)
  };

  // ---------- Smooth curves through keyframes -----------------------
  // keys = [[time, value], ...] with times from 0 to 1. The curve loops
  // around: after time 1 it starts again at time 0. Between keyframes we
  // draw a smooth "Hermite" curve, which passes exactly through every
  // keyframe and bends gently.
  function curve(keys, s) {
    s = ((s % 1) + 1) % 1;
    var n = keys.length;
    function key(i) { // keyframe i, wrapping around past the ends
      var k = keys[((i % n) + n) % n], loops = Math.floor(i / n);
      return [k[0] + loops, k[1]];
    }
    var i = n - 1;
    for (var j = 0; j < n; j++) if (keys[j][0] <= s) i = j;
    var a = key(i), b = key(i + 1), before = key(i - 1), after = key(i + 2);
    var h = b[0] - a[0], u = (s - a[0]) / h;
    // How steep the curve is at each keyframe (the slope between its neighbors).
    var ma = (b[1] - before[1]) / (b[0] - before[0]) * h;
    var mb = (after[1] - a[1]) / (after[0] - a[0]) * h;
    var u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * ma + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * mb;
  }

  // The same keyframes with one more keyframe put in (keeps them in order).
  function withKey(keys, s, value) {
    return keys.filter(function (k) { return Math.abs(k[0] - s) > 1e-9; }).concat([[s, value]])
      .sort(function (a, b) { return a[0] - b[0]; });
  }

  // How far apart the hip and ankle are when the knee is bent to this angle.
  function legReach(kneeDegrees) {
    var a = M.BODY.thigh, b = M.BODY.shin, k = kneeDegrees / DEG;
    return Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(k));
  }

  // ---------- Building the pro's pose for one moment ----------------
  //   t    = where we are in the cycle, 0 to 1 (0 = right skate touches down)
  //   opts = { kneeBend, forwardLean, strideExtension } in degrees
  // Returns { pose, edges, glideSide, pushSide, feet }.
  //   pose      = joint positions (the skater faces +x, left is -z)
  //   edges     = how far each skate rolls onto its inside edge (degrees)
  //   glideSide = the leg carrying the weight, pushSide = the leg pushing (or null)
  function makeStridePose(t, opts) {
    var B = M.BODY, S = STRIDE;
    t = ((t % 1) + 1) % 1;
    var knee = opts.kneeBend, ext = opts.strideExtension, lean = opts.forwardLean / DEG;

    // Each leg's own clock: the right leg's cycle starts at t = 0, the
    // left leg's half a cycle later.
    function legTime(side, at) { return (((side === "r" ? at : at + 0.5) % 1) + 1) % 1; }

    // The hips slide toward the glide skate: right at t = 0.3, left at 0.8.
    function hipsSide(at) { return S.weightShift * Math.cos(2 * Math.PI * (at - S.deepest)); }
    // The hips sink lowest while the glide knee is bent the most.
    function hipsBob(at) { return -S.hipBob * Math.cos(4 * Math.PI * (at - S.deepest)); }

    // How high must the hips be so the glide knee bends to exactly
    // "kneeBend" at its deepest moment? (Pythagoras, with the skate's
    // spot at that moment.)
    var deepFootF = curve(S.forward, S.deepest), deepFootOut = curve(S.out, S.deepest);
    var deepHipZ = hipsSide(S.deepest) + B.hipHalf;   // right hip at t = deepest
    var across = deepFootOut - deepHipZ;
    var flatGap = Math.sqrt(deepFootF * deepFootF + across * across);
    var reach = legReach(knee);
    var hipHeight0 = B.ankleHeight + Math.sqrt(Math.max(0, reach * reach - flatGap * flatGap)) - hipsBob(S.deepest);
    function hipHeight(at) { return hipHeight0 + hipsBob(at); }

    // Where does the skate leave the ice? Exactly where the push leg is
    // straightened to "strideExtension", pushing out at pushOutDegrees.
    var outAngle = S.pushOutDegrees / DEG;
    var liftT = { r: S.liftOff, l: (S.liftOff + 0.5) % 1 }; // the cycle time of each lift-off
    function liftOffSpot(side) {
      var drop = hipHeight(liftT[side]) - B.ankleHeight, r = legReach(ext);
      var flat = Math.sqrt(Math.max(0, r * r - drop * drop));
      var hipOut = B.hipHalf + (side === "r" ? 1 : -1) * hipsSide(liftT[side]);
      return { forward: -flat * Math.cos(outAngle), out: hipOut + flat * Math.sin(outAngle) };
    }
    var keysFor = {};
    ["l", "r"].forEach(function (side) {
      var spot = liftOffSpot(side);
      keysFor[side] = {
        forward: withKey(S.forward, S.liftOff, spot.forward),
        out: withKey(S.out, S.liftOff, spot.out)
      };
    });

    // The ankle's spot for one leg at cycle time "at" (on the path; the
    // path's middle line is z = 0).
    function ankleAt(side, at) {
      var s = legTime(side, at), k = keysFor[side], sign = side === "r" ? 1 : -1;
      return pt(curve(k.forward, s), B.ankleHeight + Math.max(0, curve(S.lift, s)), sign * curve(k.out, s));
    }

    var p = {}, edges = {};
    var hipMid = pt(0, hipHeight(t), hipsSide(t));
    var speed = S.metersPerCycle; // meters per cycle (t goes up by 1 per cycle)

    ["l", "r"].forEach(function (side) {
      var sign = side === "r" ? 1 : -1, s = legTime(side, t);
      var hip = add(hipMid, pt(0, 0, sign * B.hipHalf));
      var ankle = ankleAt(side, t);
      var leg = M.solveTwoBone(hip, ankle, B.thigh, B.shin, pt(1, 0, sign * 0.15));
      p[side + "Hip"] = hip;
      p[side + "Knee"] = leg.mid;
      p[side + "Ankle"] = leg.end;

      // Which way is this skate moving over the ice? The ice slides
      // backward under the skater at "speed", so add that.
      var dt = 0.002;
      var before = ankleAt(side, t - dt), after = ankleAt(side, t + dt);
      var move = pt((after.x - before.x) / (2 * dt) + speed, 0, (after.z - before.z) / (2 * dt));
      var lifted = curve(S.lift, s) > 0.003;
      // In the air the skate does not have to follow its blade, so it
      // mostly points forward.
      var heading = norm(lifted ? add(scale(norm(move), 0.4), pt(0.6, 0, 0)) : move);
      var lift = Math.max(0, curve(S.lift, s));
      var toeY = 0.03 + lift * (lifted ? 0.6 : 1), heelY = 0.03 + lift * (lifted ? 1.3 : 1);
      p[side + "Toe"] = pt(leg.end.x + B.footFront * heading.x, toeY, leg.end.z + B.footFront * heading.z);
      p[side + "Heel"] = pt(leg.end.x - B.footBack * heading.x, heelY, leg.end.z - B.footBack * heading.z);
      edges[side] = curve(S.edge, s);
    });

    // ---- Upper body: lean forward, shoulders turn with the arm swing ----
    var swing = Math.cos(2 * Math.PI * t);   // +1 = right arm forward, -1 = right arm back
    var leanNow = lean + (1.2 / DEG) * Math.sin(4 * Math.PI * t);
    var neck = add(hipMid, pt(B.trunk * Math.sin(leanNow), B.trunk * Math.cos(leanNow), 0));
    p.neck = neck;
    var turn = (S.shoulderTurn / DEG) * swing;
    var acrossShoulders = pt(B.shoulderHalf * Math.sin(turn), 0, B.shoulderHalf * Math.cos(turn));
    p.lShoulder = sub(neck, acrossShoulders);
    p.rShoulder = add(neck, acrossShoulders);
    // The head looks up the ice, so it tips only half as much as the back.
    p.head = add(neck, pt(B.neckToHead * Math.sin(lean * 0.5), B.neckToHead * Math.cos(lean * 0.5), 0));

    // ---- Arms ----
    // Free (right) hand: swings forward and back, a little higher in front.
    var freeHand = add(p.rShoulder, pt(0.05 + S.armSwing * swing, -0.4 + 0.1 * Math.max(0, swing), 0.1 + 0.04 * Math.max(0, -swing)));
    var rArm = M.solveTwoBone(p.rShoulder, freeHand, B.upperArm, B.foreArm, pt(-0.3, -0.5, 0.6));
    // Top (left) hand on the stick, in front of the hips.
    var topHand = add(hipMid, pt(0.22 - S.stickHandSwing * swing, 0.02, -0.02));
    var lArm = M.solveTwoBone(p.lShoulder, topHand, B.upperArm, B.foreArm, pt(-0.3, -0.5, -0.6));
    p.lElbow = lArm.mid; p.lWrist = lArm.end;
    p.rElbow = rArm.mid; p.rWrist = rArm.end;

    // ---- Stick: always the same length, blade flat on the ice ----
    var yaw = (28 + S.stickSway * Math.sin(2 * Math.PI * t)) / DEG; // which way the stick points, seen from above
    var drop = lArm.end.y - 0.02;
    var flatStick = Math.sqrt(Math.max(0, S.stickLength * S.stickLength - drop * drop));
    p.stickTop = lArm.end;
    p.stickBlade = pt(lArm.end.x + flatStick * Math.cos(yaw), 0.02, lArm.end.z + flatStick * Math.sin(yaw));

    // ---- Which leg is gliding, which is pushing? ----
    var sR = legTime("r", t), sL = legTime("l", t);
    var glideSide = sR < 0.5 ? "r" : "l";
    var other = glideSide === "r" ? "l" : "r";
    var sOther = other === "r" ? sR : sL;
    // The other leg counts as "pushing" while both skates are on the ice.
    var pushSide = sOther >= 0.5 && sOther <= S.liftOff + 0.02 ? other : null;

    return { pose: p, edges: edges, glideSide: glideSide, pushSide: pushSide };
  }

  // The sample skater and the video give us "which leg is pushing and how
  // far through the push" (see strideSignal in angles.js). This turns
  // that into a time in the pro's cycle, so the pro pushes with the same
  // leg at the same moment.
  //   side  = "r" or "l"
  //   phase = 0 to 0.5 while the leg goes out, 0.5 to 1 while it comes back
  function cycleTimeFor(side, phase) {
    var s = phase < 0.5 ? 0.3 + (STRIDE.liftOff - 0.3) * (phase / 0.5)
      : STRIDE.liftOff + (1 - STRIDE.liftOff) * ((phase - 0.5) / 0.5);
    return side === "r" ? s % 1 : (s + 0.5) % 1;
  }

  var api = { STRIDE: STRIDE, curve: curve, legReach: legReach, makeStridePose: makeStridePose, cycleTimeFor: cycleTimeFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachStride = api;
})(typeof window !== "undefined" ? window : this);
