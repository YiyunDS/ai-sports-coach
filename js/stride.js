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
//    1. TOUCHDOWN  the skate lands a little ahead and under the body.
//                  The hips slide over it, and the knee bends deepest.
//    2. PUSH       the leg drives out to the side. It does most of its
//                  straightening early, then rides almost straight, with
//                  the skate rolling onto its inside edge. The other
//                  skate has already landed, so for a short time both
//                  skates are on the ice.
//    3. RECOVERY   the skate lifts a little and swings back in under the
//                  body, low over the ice, ready to land again.
//  The free arm swings forward and back, opposite to the pushing leg,
//  and the shoulders turn a little with it. The top hand stays on the
//  stick and swings the other way, a bit less, so the stick blade
//  sweeps along the ice. The head stays up.
//
//  We do not write down where the skate is. We write down HOW STRAIGHT
//  the leg is at each moment and WHICH WAY the skate is from the hip.
//  The computer works out the rest, so the knee angles are always exact.
//
//  A skate can only slide the way its blade points. So we turn each
//  skate to point the way it is actually moving over the ice.
//
//  Measured from a clip of Connor McDavid (see SOURCES.md): how bent the
//  standing knee is, how straight the pushing knee gets, and that the
//  pushing leg stays almost straight for a good part of the stride.
//  From skating studies: how long both skates are on the ice. The rest
//  (direction of the push, edges, arm swing, timing) are our estimates.
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
    metersPerCycle: 3.0,    // how far the skater travels in one cycle

    liftOff: 0.6,           // the skate leaves the ice at this part of its cycle
                            // (each skate is on the ice 60% of the time, so both
                            //  are on the ice 2 x 10% = 20% of the time; studies
                            //  of full-speed skating find about 15 to 25%)
    deepest: 0.15,          // the standing knee is bent the most here, just after
                            // the other skate has left the ice
    pushOutDegrees: 55,     // at the end, the push points this far out to the side
                            // (0 = straight back, 90 = straight out)

    // HOW STRAIGHT THE LEG IS while its skate is on the ice.
    //   0 = bent to the "knee bend" angle,  1 = straightened to the "push" angle
    // Measured on Connor McDavid (see SOURCES.md): the pushing leg is almost
    // straight for a good part of the stride, not just at the very end. So
    // the leg does most of its straightening early (0.25 to 0.45) and then
    // rides almost straight until the skate lifts off.
    extend: [[0, 0.07], [0.15, 0], [0.25, 0.08], [0.33, 0.34], [0.4, 0.62], [0.45, 0.79], [0.5, 0.9], [0.55, 0.96], [0.6, 1]],
    // WHICH WAY the skate is from the hip while it is on the ice, like a
    // compass: 0 = straight ahead, 90 = straight out to the side, 180 =
    // straight behind, minus = across under the body.
    // It lands a little ahead and under the body, slides under the hip,
    // then goes out to the side and back. (The last value is worked out
    // from pushOutDegrees.)
    direction: [[0, -25], [0.15, 35], [0.25, 96], [0.35, 110], [0.45, 118], [0.55, 123]],

    // How high the skate lifts off the ice on its way back (meters). Right
    // after the push it comes up behind the skater (the toe flicks off the
    // ice last), then it swings forward low over the ice.
    lift:    [[0, 0], [0.15, 0], [0.3, 0], [0.45, 0], [0.6, 0], [0.66, 0.035], [0.73, 0.075], [0.8, 0.085], [0.88, 0.05], [0.94, 0.02], [0.98, 0.004]],
    // A first guess of how far the skate rolls onto its inside edge
    // (degrees). The real roll is worked out from the shin (see below):
    // a skate boot is stiff from side to side, so the skate tips exactly
    // as far as the shin leans in. This guess is only the starting point.
    edge:    [[0, -2], [0.15, 3], [0.3, 14], [0.45, 28], [0.6, 36], [0.7, 12], [0.85, 0]],
    edgeLimits: [-10, 55],  // the skate never rolls farther than this (degrees)

    // THE PUSH. A real skater pushes at a right angle to the blade, so
    // the blade stays turned out ("toe-out") while the leg drives out to
    // the side. A blade slides only the way it points, but late in the
    // push, with the leg almost straight, a skater's blade also skids
    // sideways a little. So during the push we turn the blade part of the
    // way from "the way it slides" toward "at a right angle to the leg".
    pushTurnOut: [[0.22, 0], [0.32, 0.25], [0.42, 0.55], [0.6, 0.6], [0.66, 0.45], [0.76, 0]],

    // THE SKATE IN THE AIR tips with the shin. A boot holds the ankle, so
    // when the shin leans far forward (the skate trailing behind the knee)
    // the toe points down. Right after the push the toe flicks down extra.
    cuffRest: 25,           // in the air, the shin rests this far forward in the boot (degrees)
    toeFlick: [[0.6, 0], [0.64, 22], [0.7, 18], [0.8, 6], [0.9, 0]], // extra toe-down after the push (degrees)

    weightShift: 0.06,      // how far the hips slide sideways over the standing skate (m)
    shiftAt: 0.05,          // the hips are farthest over a skate just after it lands,
                            // so the weight is already on it when the other skate lifts off
    hipBob: 0.012,          // how much the hips rise and sink (m)
    shoulderTurn: 11,       // how far the shoulders turn with the arm swing (degrees)

    // ARMS. Each arm swings like a pendulum from the shoulder, the other
    // way from the leg on its side. We write down which way the hand is
    // from the shoulder at the back and at the front of the swing, and
    // how bent the ELBOW is there (180 = straight). The computer slides
    // between them.
    armPhase: 0.05,         // the free arm is farthest back just before the right push ends
    // Free (right) arm: while the right leg pushes, it drives back almost
    // straight, past the line of the back (the skater leans forward, so
    // "back" means behind the body, not just down), the hand behind and a
    // little above the hip and out to the side. Then it swings forward,
    // bending, and across toward the middle, hand in front of the chest.
    freeArmBack:    { dir: [-0.85, -0.45, 0.25], elbow: 160 },
    freeArmForward: { dir: [0.8, -0.35, -0.35], elbow: 95 },
    // Top (left) hand on the stick: swings the other way. Forward, it
    // reaches out in front at about waist height, the forearm almost
    // level, the wrist cocked so the stick drops toward the ice; back, it
    // comes in by the left hip with the elbow bent.
    stickArmBack:    { dir: [0.05, -1, -0.25], elbow: 100 },
    stickArmForward: { dir: [0.75, -0.62, 0.16], elbow: 132 },
    stickSway: 11,          // the stick blade sways side to side, a moment after the hand (degrees)
    // The stick: for a skater our size (a kid), from the knob to the
    // blade. With one hand the stick rides with its blade on the ice,
    // out in front and a little to the stick side (a right shot: the
    // left hand on top, the blade on the right).
    stickLength: 1.05
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

  // Like curve(), but for keyframes that do NOT loop around (they only
  // cover the time the skate is on the ice). Before the first keyframe
  // and after the last one, the value just stays the same.
  function track(keys, s) {
    var n = keys.length;
    if (s <= keys[0][0]) return keys[0][1];
    if (s >= keys[n - 1][0]) return keys[n - 1][1];
    var i = 0;
    while (i < n - 2 && keys[i + 1][0] <= s) i++;
    var a = keys[i], b = keys[i + 1], before = keys[Math.max(0, i - 1)], after = keys[Math.min(n - 1, i + 2)];
    var h = b[0] - a[0], u = (s - a[0]) / h;
    var ma = (b[1] - before[1]) / (b[0] - before[0]) * h;
    var mb = (after[1] - a[1]) / (after[0] - a[0]) * h;
    var u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * ma + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * mb;
  }

  // How far apart the hip and ankle are when the knee is bent to this angle.
  function legReach(kneeDegrees) {
    var a = M.BODY.thigh, b = M.BODY.shin, k = kneeDegrees / DEG;
    return Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(k));
  }

  // ---------- Building the pro's pose for one moment ----------------
  //   t    = where we are in the cycle, 0 to 1 (0 = right skate touches down)
  //   opts = { kneeBend, forwardLean, strideExtension } in degrees
  // Returns { pose, edges, shin, glideSide, pushSide }.
  //   pose      = joint positions (the skater faces +x, left is -z)
  //   edges     = how far each skate rolls onto its inside edge (degrees)
  //   shin      = how far each shin leans, seen from its skate: { forward, side } (degrees)
  //   glideSide = the leg carrying the weight, pushSide = the leg pushing (or null)
  function makeStridePose(t, opts) {
    return buildPose(t, opts, edgeRule(opts));
  }

  // ---------- How far the skate rolls: as far as the shin leans --------
  // We build the stride with a first guess of the roll, measure how far
  // the shin leans in at 48 moments of the cycle, and use those numbers
  // as the roll. Twice, so the guess settles. (The answer is kept, so
  // this happens only once for each set of angles.)
  var edgeRules = {};
  function edgeRule(opts) {
    var key = opts.kneeBend.toFixed(1) + "|" + opts.strideExtension.toFixed(1);
    if (edgeRules[key]) return edgeRules[key];
    var S = STRIDE, room = roomFor(opts.kneeBend, opts.strideExtension);
    var rule = function (s) { return curve(S.edge, s) * room; };
    for (var round = 0; round < 2; round++) {
      var keys = [];
      for (var k = 0; k < 48; k++) {
        var s = k / 48;
        keys.push([s, M.clamp(buildPose(s, opts, rule).shin.r.side, S.edgeLimits[0], S.edgeLimits[1])]);
      }
      rule = (function (keys) { return function (s) { return curve(keys, s); }; })(keys);
    }
    var names = Object.keys(edgeRules);
    if (names.length > 40) delete edgeRules[names[0]]; // do not keep too many
    return (edgeRules[key] = rule);
  }

  // How much "room" the stride has: a skater who sits low has a push
  // leg much longer than the bent glide leg, so they can rise, sink and
  // sway. A skater who stands tall has almost no room, so those
  // movements get smaller (0.15 to 1).
  function roomFor(knee, ext) { return M.clamp((legReach(ext) - legReach(knee)) / 0.08, 0.15, 1); }

  //   edgeOf(s) = how far the skate rolls at its own clock s (degrees)
  function buildPose(t, opts, edgeOf) {
    var B = M.BODY, S = STRIDE;
    t = ((t % 1) + 1) % 1;
    var knee = opts.kneeBend, ext = opts.strideExtension, lean = opts.forwardLean / DEG;

    // Each leg's own clock: the right leg's cycle starts at t = 0, the
    // left leg's half a cycle later.
    function legTime(side, at) { return (((side === "r" ? at : at + 0.5) % 1) + 1) % 1; }

    // The hips slide over the standing skate: farthest right at t = shiftAt
    // (just after the right skate lands), farthest left half a cycle later.
    // (A skater who stands tall takes small strides and sways less: see "room" below.)
    function hipsSide(at) { return S.weightShift * room * Math.cos(2 * Math.PI * (at - S.shiftAt)); }
    // The hips sink lowest while the glide knee is bent the most.
    var room = roomFor(knee, ext);
    var edgeAt = edgeOf;
    function hipsBob(at) { return -S.hipBob * room * Math.cos(4 * Math.PI * (at - S.deepest)); }

    // How high is the ankle? A skate standing straight up has the ankle
    // BODY.ankleHeight above the ice. A skate tipped onto its edge holds
    // the ankle a little lower (like a tipped-over ruler is less tall).
    function ankleHeightAt(s) {
      return B.ankleHeight * Math.cos(edgeAt(s) / DEG) + Math.max(0, curve(S.lift, s));
    }

    // How high must the hips be so the standing knee bends to exactly
    // "kneeBend" at its deepest moment? At that moment the skate is
    // almost straight under the hip (UNDER meters away, seen from above).
    var UNDER = 0.03;
    var hipHeight0 = ankleHeightAt(S.deepest) + Math.sqrt(Math.pow(legReach(knee), 2) - UNDER * UNDER) - hipsBob(S.deepest);
    function hipHeight(at) { return hipHeight0 + hipsBob(at); }

    // ---- The skate ON the ice ----
    // We know how straight the leg should be (the "extend" keyframes), so
    // we know how far the skate is from the hip. With the hip's height,
    // Pythagoras tells us how far away it is along the ice. The
    // "direction" keyframes say which way. So the knee angles are exact.
    //   side = "l" or "r", s = the leg's own clock (0 to liftOff),
    //   at = the time in the cycle
    // Returns where the skate is, measured from the hip, seen from above:
    //   f = forward (+) or back (-),  o = out to its own side (+)
    var endDirection = 180 - S.pushOutDegrees;
    var directionKeys = S.direction.concat([[S.liftOff, endDirection]]);
    function onIce(s, at) {
      var bend = knee + (ext - knee) * M.clamp(track(S.extend, s), 0, 1);
      var far = legReach(bend), drop = hipHeight(at) - ankleHeightAt(s);
      var along = Math.sqrt(Math.max(UNDER * UNDER, far * far - drop * drop));
      var compass = track(directionKeys, s) / DEG;
      return { f: along * Math.cos(compass), o: along * Math.sin(compass) };
    }

    // ---- The skate IN THE AIR (coming back) ----
    // A smooth path from where it left the ice to where it lands again.
    // It starts out moving the way the skate was moving when it lifted
    // off, and arrives moving the way it will move when it lands, so
    // there is no jerk at either end.
    function inAir(s, at) {
      var L = S.liftOff, span = 1 - L, u = (s - L) / span, e = 0.004;
      var tOff = at - (s - L), tDown = at + (1 - s);          // when it lifted off, when it lands
      var p0 = onIce(L, tOff), p0b = onIce(L - e, tOff - e);
      var p1 = onIce(0, tDown), p1b = onIce(e, tDown + e);
      var u2 = u * u, u3 = u2 * u;
      var h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      function path(a0, a0b, a1, a1b) {
        // (the starting speed is turned down a bit, so the skate does not
        //  keep flying outward after it leaves the ice)
        var m0 = (a0 - a0b) / e * span * 0.35, m1 = (a1b - a1) / e * span;
        return h00 * a0 + h10 * m0 + h01 * a1 + h11 * m1;
      }
      return { f: path(p0.f, p0b.f, p1.f, p1b.f), o: path(p0.o, p0b.o, p1.o, p1b.o) };
    }

    // The ankle's spot for one leg at cycle time "at" (on the path; the
    // path's middle line is z = 0).
    function ankleAt(side, at) {
      var s = legTime(side, at), sign = side === "r" ? 1 : -1;
      var rel = s <= S.liftOff ? onIce(s, at) : inAir(s, at);
      var y = ankleHeightAt(s);
      // Safety: a leg can only reach so far. If the path asks for more
      // (it can, for a moment, in the air), pull the skate in toward the
      // hip so the leg is never straighter than the push angle.
      var drop = hipHeight(at) - y, r = legReach(ext);
      var farthest = Math.sqrt(Math.max(0, r * r - drop * drop));
      var d = Math.sqrt(rel.f * rel.f + rel.o * rel.o);
      if (d > farthest && d > 0) { rel.f *= farthest / d; rel.o *= farthest / d; }
      return pt(rel.f, y, hipsSide(at) + sign * (B.hipHalf + rel.o));
    }

    var p = {}, edges = {}, shin = {};
    var hipMid = pt(0, hipHeight(t), hipsSide(t));

    // How far may the skate tip toe-down (or heel-down, a minus number)
    // before its blade would touch the ice? ankleY = how high the ankle is.
    function tipRoom(ankleY, length) {
      var H = B.ankleHeight, R = Math.sqrt(H * H + length * length), Y = ankleY - 0.004;
      if (Y >= R) return 90;
      return Math.max(0, (Math.atan2(length, H) - Math.acos(Math.min(1, Y / R))) * DEG);
    }
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
      // During the push, turn the blade part of the way toward a right
      // angle to the leg (seen from above), pointing forward.
      var turnOut = track(S.pushTurnOut, s);
      if (turnOut > 0) {
        var legLine = pt(ankle.x - hip.x, 0, ankle.z - hip.z);
        var across = norm(pt(legLine.z * sign, 0, -legLine.x * sign));   // a right angle to the leg, forward
        if (across.x > 0) heading = norm(add(scale(heading, 1 - turnOut), scale(across, turnOut)));
      }

      // How does the shin lean? Forward (toward the toe of the skate) and
      // sideways (in toward the other skate, across the skater's path).
      // The skate's roll comes from the sideways lean (see edgeRule above).
      var shinUp = sub(leg.mid, leg.end);
      shin[side] = {
        forward: Math.atan2(M.dot(shinUp, heading), shinUp.y) * DEG,
        side: Math.atan2(-shinUp.z * sign, shinUp.y) * DEG
      };

      // Tip the skate toe-down in the air: as far as the shin leans past
      // its resting spot in the boot, plus the toe flick after the push,
      // but never so far that the blade touches the ice.
      var tip = 0;
      if (s > S.liftOff) {
        tip = shin[side].forward - S.cuffRest + track(S.toeFlick, s);
        tip = M.clamp(tip, -tipRoom(leg.end.y, B.footBack), tipRoom(leg.end.y, B.footFront));
      }
      var e = edgeAt(s) / DEG, a = tip / DEG;
      // Along the blade (toe-down tips it), and the boot's "up" (tips forward with it).
      var blade = add(scale(heading, Math.cos(a)), pt(0, -Math.sin(a), 0));
      var bootUp = add(pt(0, Math.cos(a), 0), scale(heading, Math.sin(a)));
      // The bottom of the boot is 6 cm under the ankle (less when rolled).
      var sole = sub(leg.end, scale(bootUp, 0.06 * Math.cos(e)));
      p[side + "Toe"] = add(sole, scale(blade, B.footFront));
      p[side + "Heel"] = sub(sole, scale(blade, B.footBack));
      edges[side] = edgeAt(s);
    });

    // ---- Upper body: lean forward, shoulders turn with the arm swing ----
    // The arms swing a moment ahead of the legs' clock (armPhase). The
    // shoulders turn with them: the shoulder of the arm swinging forward
    // comes forward too.
    var armSwing = Math.cos(2 * Math.PI * (t - S.armPhase)); // +1 = free arm forward, -1 = back
    var leanNow = lean + (1.2 / DEG) * Math.sin(4 * Math.PI * t);
    var neck = add(hipMid, pt(B.trunk * Math.sin(leanNow), B.trunk * Math.cos(leanNow), 0));
    p.neck = neck;
    var turn = (S.shoulderTurn / DEG) * armSwing;
    var acrossShoulders = pt(B.shoulderHalf * Math.sin(turn), 0, B.shoulderHalf * Math.cos(turn));
    p.lShoulder = sub(neck, acrossShoulders);
    p.rShoulder = add(neck, acrossShoulders);
    // The head looks up the ice, so it tips only half as much as the back.
    p.head = add(neck, pt(B.neckToHead * Math.sin(lean * 0.5), B.neckToHead * Math.cos(lean * 0.5), 0));

    // ---- Arms ----
    // One arm at "forwardness" u (0 = back of the swing, 1 = front): the
    // hand's direction from the shoulder and the elbow angle slide from
    // the back keyframe to the front one. The elbow angle tells us how
    // far the hand is from the shoulder (the triangle upper arm, forearm,
    // shoulder-to-hand), so the elbow bends to exactly that angle.
    function armAt(shoulder, back, front, u, hint) {
      var d = norm(add(scale(norm(pt.apply(null, back.dir)), 1 - u), scale(norm(pt.apply(null, front.dir)), u)));
      var bend = (back.elbow + (front.elbow - back.elbow) * u) / DEG;
      var a = B.upperArm, b = B.foreArm, reach = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(bend));
      return M.solveTwoBone(shoulder, add(shoulder, scale(d, reach)), a, b, hint);
    }
    var rArm = armAt(p.rShoulder, S.freeArmBack, S.freeArmForward, (1 + armSwing) / 2, pt(-0.3, -0.5, 0.6));
    var lArm = armAt(p.lShoulder, S.stickArmBack, S.stickArmForward, (1 - armSwing) / 2, pt(-0.3, -0.5, -0.6));
    p.lElbow = lArm.mid; p.lWrist = lArm.end;
    p.rElbow = rArm.mid; p.rWrist = rArm.end;

    // ---- Stick: always the same length, blade flat on the ice ----
    var yaw = (28 + S.stickSway * Math.sin(2 * Math.PI * (t - S.armPhase))) / DEG; // which way the stick points, seen from above
    // Where the blade lands if the stick starts at "top".
    function bladeFrom(top) {
      var drop = top.y - 0.02, flat = Math.sqrt(Math.max(0, S.stickLength * S.stickLength - drop * drop));
      return pt(top.x + flat * Math.cos(yaw), 0.02, top.z + flat * Math.sin(yaw));
    }
    // The top hand holds the end of the stick in its fist (see gripPoint
    // in angles.js): the shaft runs across the palm, and only the knob
    // sticks out past the fist. (Twice, because where the fist is and
    // which way the stick goes depend on each other a little.)
    var shaft = norm(sub(bladeFrom(lArm.end), lArm.end)), knob = lArm.end;
    for (var g = 0; g < 2; g++) {
      knob = sub(M.gripPoint(lArm.end, lArm.mid, shaft), scale(shaft, M.KNOB_OUT));
      shaft = norm(sub(bladeFrom(knob), knob));
    }
    p.stickTop = knob;
    p.stickBlade = bladeFrom(knob);

    // ---- Which leg is gliding, which is pushing? ----
    var sR = legTime("r", t), sL = legTime("l", t);
    var glideSide = sR < 0.5 ? "r" : "l";
    var other = glideSide === "r" ? "l" : "r";
    var sOther = other === "r" ? sR : sL;
    // The other leg counts as "pushing" while both skates are on the ice.
    var pushSide = sOther >= 0.5 && sOther <= S.liftOff + 0.02 ? other : null;

    return { pose: p, edges: edges, shin: shin, glideSide: glideSide, pushSide: pushSide };
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

  // ---------- A pretend kid, for trying the page without a video -----
  // A short "video" of poses: a skater with a real skating motion who
  // stands too tall, does not push all the way, and gets tired (even
  // straighter knees, less lean) near the end.
  //   gap = seconds between poses
  function makeDemoSession(gap) {
    var frames = [], n = 64;
    for (var i = 0; i < n; i++) {
      var part = i / n;
      var tired = part > 0.6 ? (part - 0.6) / 0.4 : 0;
      var pose = makeStridePose((i * gap) / STRIDE.secondsPerCycle, {
        kneeBend: 148 + 12 * tired + 2 * Math.sin(i * 0.9),
        forwardLean: 17 - 8 * tired + 1.5 * Math.cos(i * 1.3),
        strideExtension: 163
      }).pose;
      delete pose.stickTop; delete pose.stickBlade;   // the camera does not find sticks
      // Pretend the camera filmed from a funny direction and distance,
      // so we can check that normalizeFrames() fixes it.
      var c = Math.cos(2.1), s = Math.sin(2.1);
      frames.push(M.mapPose(pose, function (q) {
        return pt((q.x * c - q.z * s) * 0.8, q.y * 0.8 - 0.5, (q.x * s + q.z * c) * 0.8);
      }));
    }
    return frames;
  }

  var api = { STRIDE: STRIDE, curve: curve, track: track, legReach: legReach, makeStridePose: makeStridePose, cycleTimeFor: cycleTimeFor, makeDemoSession: makeDemoSession };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachStride = api;
})(typeof window !== "undefined" ? window : this);
