// =====================================================================
//  angles.js  --  THE MATH PART OF THE COACH
//
//  This file has no drawing in it. It only does math with points.
//  A "point" is a spot in space with three numbers:
//      x = forward / backward
//      y = up / down        (y = 0 is the ice)
//      z = left / right
//
//  A "pose" is a list of named points, one for each body joint,
//  like  pose.lKnee  (left knee)  or  pose.rHip  (right hip).
//
//  Because there is no drawing here, we can test this file all by
//  itself with:   node tests/angles.test.js
// =====================================================================
(function (root) {
  "use strict";

  // ---------- Tiny helpers for doing math with points ----------------

  function pt(x, y, z) { return { x: x, y: y, z: z }; }
  function add(a, b) { return pt(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub(a, b) { return pt(a.x - b.x, a.y - b.y, a.z - b.z); }
  function scale(a, s) { return pt(a.x * s, a.y * s, a.z * s); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) {
    return pt(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  // How long is the arrow from (0,0,0) to this point?
  function len(a) { return Math.sqrt(dot(a, a)); }
  // Same direction, but exactly 1 long.
  function norm(a) { var l = len(a); return l > 1e-9 ? scale(a, 1 / l) : pt(0, 0, 0); }
  // The point halfway between a and b.
  function mid(a, b) { return scale(add(a, b), 0.5); }
  // Slide from a (t = 0) to b (t = 1).
  function lerp(a, b, t) { return add(a, scale(sub(b, a), t)); }
  function lerpNum(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  var DEG = 180 / Math.PI; // multiply by this to turn radians into degrees
  var UP = pt(0, 1, 0);

  // ---------- Measuring angles ---------------------------------------

  // The angle between two arrows, in degrees (0 to 180).
  function angleBetween(u, v) {
    var c = dot(norm(u), norm(v));
    return Math.acos(clamp(c, -1, 1)) * DEG;
  }

  // The angle AT the middle point b, made by the lines b->a and b->c.
  // Example: angleAt(hip, knee, ankle) is the knee angle.
  //   180 degrees = leg totally straight
  //    90 degrees = bent like the corner of a square
  function angleAt(a, b, c) {
    return angleBetween(sub(a, b), sub(c, b));
  }

  // Measure everything we care about in ONE pose.
  function measurePose(p) {
    var leftKnee = angleAt(p.lHip, p.lKnee, p.lAnkle);
    var rightKnee = angleAt(p.rHip, p.rKnee, p.rAnkle);
    var hipMid = mid(p.lHip, p.rHip);
    var shoulderMid = mid(p.lShoulder, p.rShoulder);
    // The leg that is bent MORE is the "glide" leg (the one you stand on).
    // The leg that is straighter is the "push" leg.
    var glideSide = leftKnee <= rightKnee ? "l" : "r";
    return {
      leftKnee: leftKnee,
      rightKnee: rightKnee,
      // Check 1: knee bend = the knee angle of the glide leg.
      kneeBend: Math.min(leftKnee, rightKnee),
      glideSide: glideSide,
      // Check 2: forward lean = how far the back tips away from
      // straight up. 0 = standing tall, 90 = flat like a table.
      forwardLean: angleBetween(sub(shoulderMid, hipMid), UP),
      // Check 3: stride extension = the knee angle of the push leg.
      strideExtension: Math.max(leftKnee, rightKnee),
      pushSide: glideSide === "l" ? "r" : "l"
    };
  }

  // ---------- Targets (the "good skater" numbers) --------------------

  // Find the age band (like "9-10") that an age belongs to.
  function ageBand(targets, age) {
    var keys = Object.keys(targets.bands);
    for (var i = 0; i < keys.length; i++) {
      var parts = keys[i].split("-");
      if (age >= Number(parts[0]) && age <= Number(parts[1])) return keys[i];
    }
    // Age not in any band? Use the closest one.
    return age < Number(keys[0].split("-")[0]) ? keys[0] : keys[keys.length - 1];
  }

  // Get the three target ranges for this age and level.
  // level is "beginner" or "experienced".
  function getTarget(targets, age, level) {
    return targets.bands[ageBand(targets, age)][level];
  }

  // Compare one measured angle with its target range.
  //   off   = how many degrees outside the range (0 = inside,
  //           minus = too small, plus = too big)
  //   grade = "good" (green), "close" (yellow) or "far" (red)
  function scoreAngle(value, range, yellowZone) {
    var off = 0;
    if (value < range.min) off = value - range.min;
    if (value > range.max) off = value - range.max;
    var grade = "good";
    if (off !== 0) grade = Math.abs(off) <= yellowZone ? "close" : "far";
    return { value: value, off: off, grade: grade };
  }

  // ---------- Looking at a whole video (many poses) ------------------

  function sorted(nums) { return nums.slice().sort(function (a, b) { return a - b; }); }
  // percentile(nums, 0.5) is the middle number (the "median").
  function percentile(nums, q) {
    var s = sorted(nums);
    if (!s.length) return NaN;
    return s[Math.round(clamp(q, 0, 1) * (s.length - 1))];
  }

  // frames = a list of poses, one for each moment of the video.
  // target = the three ranges from getTarget().
  // span   = how many poses to each side we compare when looking for the
  //          top of a push (2 is right for 10 poses per second).
  // flat   = (optional) for each pose, the knee angles and lean measured
  //          on the flat picture (see measureFlat), or null. When we have
  //          them (side views), we use them instead of the 3D numbers.
  // rhythm = (optional) from strideSignal: which leg is pushing in each
  //          pose. Then "knee bend" is always the knee of the OTHER leg
  //          (the one you stand on), even while the pushing leg folds up
  //          on its way back.
  function analyzeFrames(frames, target, yellowZone, span, flatAngles, rhythm) {
    span = span || 2;
    var CHECKS = ["kneeBend", "forwardLean", "strideExtension"];
    var perFrame = frames.map(function (pose, i) {
      var m = measurePose(pose);
      if (rhythm && rhythm[i]) {
        m.pushSide = rhythm[i].side;
        m.glideSide = m.pushSide === "l" ? "r" : "l";
        m.kneeBend = m.glideSide === "l" ? m.leftKnee : m.rightKnee;
        m.strideExtension = m.pushSide === "l" ? m.leftKnee : m.rightKnee;
      }
      m.knee3D = m.kneeBend; // kept for finding pushes (see below)
      var f2 = flatAngles && flatAngles[i];
      if (f2) {
        // The flat picture cannot tell us which knee is "left". We take
        // the one that is closer to the glide knee we found in 3D.
        var ka = f2.kneeA, kb = f2.kneeB;
        m.kneeBend = Math.abs(ka - m.knee3D) <= Math.abs(kb - m.knee3D) ? ka : kb;
        m.forwardLean = f2.forwardLean;
        m.fromPicture = true;
      }
      var scores = {};
      CHECKS.forEach(function (c) { scores[c] = scoreAngle(m[c], target[c], yellowZone); });
      // "slip" = how far off the form is at this moment.
      // (Stride extension is only fair to judge at the top of a push,
      //  so it is not counted here.)
      var slip = Math.abs(scores.kneeBend.off) + Math.abs(scores.forwardLean.off);
      return { m: m, scores: scores, slip: slip, isPeak: false, peak: -1 };
    });

    function column(name, only) {
      return perFrame.filter(function (f) { return !only || only(f); }).map(function (f) { return f.m[name]; });
    }

    // The pushes: we look for the moments the push leg is straightest.
    var ext = column("strideExtension");
    var bestExt = percentile(ext, 0.9);
    // A "stride peak" is a moment where the push leg is straighter
    // than just before and just after, and close to the best push.
    var peaks = [];
    for (var i = 0; i < ext.length; i++) {
      var isTop = true;
      for (var k = -span; k <= span; k++) {
        var j = i + k;
        if (j < 0 || j >= ext.length || k === 0) continue;
        if (ext[j] > ext[i] || (ext[j] === ext[i] && j < i)) isTop = false;
      }
      // It only counts as a push if one leg is clearly straighter than the other.
      var legsDiffer = ext[i] - perFrame[i].m.knee3D >= 8;
      if (isTop && legsDiffer && ext[i] >= bestExt - 8) { peaks.push(i); perFrame[i].isPeak = true; }
    }
    // The moments right next to a peak belong to that push.
    var reach = Math.ceil(span / 2);
    peaks.forEach(function (pk) {
      for (var j = pk - reach; j <= pk + reach; j++) if (perFrame[j] && perFrame[j].peak < 0) perFrame[j].peak = pk;
    });

    // One number per check for the whole video.
    // Knee bend and lean: the middle value. If enough moments were seen
    // from the side (measured on the flat picture), we only use those,
    // because they are much more trustworthy.
    var sideOn = perFrame.filter(function (f) { return f.m.fromPicture; }).length;
    var only = sideOn >= 8 ? function (f) { return f.m.fromPicture; } : null;
    // Push: the middle value of the real pushes we found. If we found no
    // push at all (the skater only glided), we do not make up a number.
    var push = peaks.length ? percentile(peaks.map(function (pk) { return ext[pk]; }), 0.5) : null;
    var summary = {
      kneeBend: scoreAngle(percentile(column("kneeBend", only), 0.5), target.kneeBend, yellowZone),
      forwardLean: scoreAngle(percentile(column("forwardLean", only), 0.5), target.forwardLean, yellowZone),
      strideExtension: push === null ? null : scoreAngle(push, target.strideExtension, yellowZone)
    };

    // Which moment has the biggest slip?
    var worstFrame = 0;
    perFrame.forEach(function (f, idx) { if (f.slip > perFrame[worstFrame].slip) worstFrame = idx; });

    return { perFrame: perFrame, summary: summary, peaks: peaks, worstFrame: worstFrame, sideOn: only ? sideOn : 0 };
  }

  // ---------- Building a skater pose from angles ---------------------
  //
  // This is how we make the "pro" figure. We do NOT copy a picture.
  // We start at the skate and stack the bones on top of each other,
  // tilting each one by the right amount, so the knee angle and the
  // lean come out exactly as the numbers we ask for.

  // Bone lengths in meters (about the size of a kid).
  var BODY = {
    shin: 0.40, thigh: 0.42, trunk: 0.50, neckToHead: 0.20,
    upperArm: 0.28, foreArm: 0.26, hipHalf: 0.11, shoulderHalf: 0.18,
    ankleHeight: 0.09, footFront: 0.17, footBack: 0.07
  };

  // A two-bone puzzle (like hip -> knee -> ankle, or shoulder -> elbow
  // -> hand). We know where the top is and where we WANT the end to be.
  // This finds where the middle joint has to go. "hint" says which way
  // the middle joint should poke out (knees poke forward).
  function solveTwoBone(top, wantedEnd, lenA, lenB, hint) {
    var toEnd = sub(wantedEnd, top);
    var d = clamp(len(toEnd), Math.abs(lenA - lenB) + 1e-6, lenA + lenB - 1e-6);
    var along = norm(toEnd);
    var end = add(top, scale(along, d)); // if it was too far, reach as far as we can
    // Law of cosines: how far along the line is the middle joint?
    var a = (lenA * lenA - lenB * lenB + d * d) / (2 * d);
    var h = Math.sqrt(Math.max(0, lenA * lenA - a * a));
    // Sideways direction: the hint, with the "along" part taken out.
    var side = norm(sub(hint, scale(along, dot(hint, along))));
    return { mid: add(add(top, scale(along, a)), scale(side, h)), end: end };
  }

  // opts.kneeBend        knee angle of the glide leg (degrees)
  // opts.forwardLean     how far the back leans forward (degrees)
  // opts.strideExtension knee angle of the push leg at full push
  // opts.push            0 = both feet under you, 1 = full push
  // opts.pushSide        "r" or "l" = which leg pushes
  // opts.withStick       true = also add a hockey stick
  // opts.natural         true = move like a real skater, not a robot:
  //                      sink into the push, turn the shoulders, sway the
  //                      stick, and lift the skate while bringing it back
  // opts.phase           where we are in one push, from 0 to 1.
  //                      0 to 0.5 = pushing out, 0.5 to 1 = bringing the leg back
  // The skater faces +x. Their LEFT side is -z, RIGHT side is +z.
  function makeStancePose(opts) {
    var push = clamp(opts.push || 0, 0, 1);
    var pushSide = opts.pushSide || "r";
    var real = opts.natural ? 1 : 0;
    var side = pushSide === "l" ? -1 : 1;   // -1 = left leg pushes, +1 = right
    // "back" goes 0 -> 1 -> 0 while the pushing leg is coming back in.
    var back = real && opts.phase > 0.5 ? Math.sin((opts.phase - 0.5) * 2 * Math.PI) : 0;
    // A real skater sinks a little deeper and leans a little more as they push.
    var knee = opts.kneeBend - real * 4 * push;
    var lean = (opts.forwardLean + real * 3 * push) / DEG;
    var B = BODY, p = {};

    // --- Glide leg: stack shin, then thigh, from the skate up. ---
    // A bent knee means shin and thigh are tilted. Together the two
    // tilts must add up to (180 - knee angle).
    var totalTilt = (180 - knee) / DEG;
    var shinTilt = totalTilt * 0.43;         // shin tips forward
    var thighTilt = totalTilt - shinTilt;    // thigh tips backward
    var kneeX = B.shin * Math.sin(shinTilt);
    var kneeY = B.ankleHeight + B.shin * Math.cos(shinTilt);
    var hipX = kneeX - B.thigh * Math.sin(thighTilt);
    var hipY = kneeY + B.thigh * Math.cos(thighTilt);

    ["l", "r"].forEach(function (s) {
      var z = (s === "l" ? -1 : 1) * B.hipHalf;
      p[s + "Hip"] = pt(hipX, hipY, z);
      p[s + "Knee"] = pt(kneeX, kneeY, z);
      p[s + "Ankle"] = pt(0, B.ankleHeight, z);
      p[s + "Toe"] = pt(B.footFront, 0.03, z);
      p[s + "Heel"] = pt(-B.footBack, 0.03, z);
    });

    // --- Push leg: swing it out to the side and back, and straighten it. ---
    if (push > 0) {
      var s = pushSide, out = s === "l" ? -1 : 1;
      var hip = p[s + "Hip"];
      // Coming back, the knee folds a bit more and the skate lifts off the ice.
      var pushKnee = (lerpNum(knee, opts.strideExtension, push) - 18 * back) / DEG;
      var lift = 0.07 * back;
      // How far is the skate from the hip when the knee is this straight?
      var reach = Math.sqrt(B.thigh * B.thigh + B.shin * B.shin -
        2 * B.thigh * B.shin * Math.cos(pushKnee));
      var drop = hip.y - B.ankleHeight - lift; // the skate stays on the ice while pushing
      var flat = Math.sqrt(Math.max(0, reach * reach - drop * drop));
      var swing = (125 * push) / DEG;    // 0 = straight ahead, 125 = out and back
      var ankle = pt(hip.x + flat * Math.cos(swing), B.ankleHeight + lift, hip.z + out * flat * Math.sin(swing));
      var leg = solveTwoBone(hip, ankle, B.thigh, B.shin, pt(1, 0, out * 0.3 * push));
      p[s + "Knee"] = leg.mid;
      p[s + "Ankle"] = leg.end;
      // The pushing skate turns outward.
      var turn = (50 * push) / DEG;
      var fx = Math.cos(turn), fz = out * Math.sin(turn);
      p[s + "Toe"] = pt(leg.end.x + B.footFront * fx, 0.03 + lift * 0.6, leg.end.z + B.footFront * fz);
      p[s + "Heel"] = pt(leg.end.x - B.footBack * fx, 0.03 + lift * 1.3, leg.end.z - B.footBack * fz);
    }

    // --- Upper body: tip the back forward by the lean angle. ---
    var hipMid = pt(hipX, hipY, 0);
    var neck = add(hipMid, pt(B.trunk * Math.sin(lean), B.trunk * Math.cos(lean), 0));
    p.neck = neck;
    // The shoulders turn against the legs: when the right leg pushes
    // back, the right shoulder comes forward. That keeps you balanced.
    var twist = (real * side * push * 14) / DEG;
    var across = pt(B.shoulderHalf * Math.sin(twist), 0, B.shoulderHalf * Math.cos(twist));
    p.lShoulder = sub(neck, across);
    p.rShoulder = add(neck, across);
    // The head looks up the ice, so it tips only half as much as the back.
    p.head = add(neck, pt(B.neckToHead * Math.sin(lean * 0.5), B.neckToHead * Math.cos(lean * 0.5), 0));

    // --- Arms and stick: both hands in front, blade on the ice. ---
    // With each push the hands and the stick blade sway a little to the side.
    var sway = real * side * push;
    var topHand = add(hipMid, pt(0.22, 0.02, -0.02 - 0.07 * sway));  // left hand, top of the stick
    var blade = pt(hipX + 0.85, 0.02, 0.45 - 0.22 * sway);           // where the blade touches the ice
    var lArm = solveTwoBone(p.lShoulder, topHand, B.upperArm, B.foreArm, pt(-0.3, -0.5, -0.6));
    var stickDir = norm(sub(blade, lArm.end));
    var lowHand = add(lArm.end, scale(stickDir, 0.28));     // right hand, lower on the stick
    var rArm = solveTwoBone(p.rShoulder, lowHand, B.upperArm, B.foreArm, pt(-0.3, -0.5, 0.6));
    p.lElbow = lArm.mid; p.lWrist = lArm.end;
    p.rElbow = rArm.mid; p.rWrist = rArm.end;
    if (opts.withStick) { p.stickTop = lArm.end; p.stickBlade = blade; }
    return p;
  }

  // ---------- Turning camera poses into our kind of pose --------------

  // MediaPipe (the pose-finding AI) gives 33 numbered points.
  // These are the numbers of the ones we use.
  var MP = {
    lEar: 7, rEar: 8, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14,
    lWrist: 15, rWrist: 16, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26,
    lAnkle: 27, rAnkle: 28, lHeel: 29, rHeel: 30, lToe: 31, rToe: 32
  };

  // MediaPipe says "y goes DOWN" and "z goes away from the camera".
  // Our 3D world says "y goes UP", so we flip y and z.
  function mediapipeToPose(landmarks) {
    function get(i) { var l = landmarks[i]; return pt(l.x, -l.y, -l.z); }
    var p = {};
    Object.keys(MP).forEach(function (name) { p[name] = get(MP[name]); });
    p.head = mid(p.lEar, p.rEar);
    p.neck = mid(p.lShoulder, p.rShoulder);
    delete p.lEar; delete p.rEar;
    return p;
  }

  // Can the AI see the legs and body well enough in this frame?
  function poseIsClear(landmarks, minVisibility) {
    var need = [MP.lShoulder, MP.rShoulder, MP.lHip, MP.rHip, MP.lKnee, MP.rKnee, MP.lAnkle, MP.rAnkle];
    return need.every(function (i) {
      var v = landmarks[i].visibility;
      return v === undefined || v >= minVisibility;
    });
  }

  // How sure the AI was about each joint (0 to 1), by joint name.
  function mediapipeConfidence(landmarks) {
    function sure(i) { var v = landmarks[i].visibility; return v === undefined ? 1 : v; }
    var w = {};
    Object.keys(MP).forEach(function (name) { w[name] = sure(MP[name]); });
    w.head = (w.lEar + w.rEar) / 2;
    w.neck = (w.lShoulder + w.rShoulder) / 2;
    delete w.lEar; delete w.rEar;
    return w;
  }

  // Knee bend and forward lean measured on the FLAT video picture.
  // The AI finds joints in the picture much better than it guesses how
  // deep they are, so when we film from the side (where knee bend and
  // lean happen right across the picture) the flat numbers are better.
  //   pts = the AI's 33 points in picture pixels, { x, y } (y goes DOWN)
  function measureFlat(pts) {
    function P(name) { var q = pts[MP[name]]; return pt(q.x, -q.y, 0); }
    var leftKnee = angleAt(P("lHip"), P("lKnee"), P("lAnkle"));
    var rightKnee = angleAt(P("rHip"), P("rKnee"), P("rAnkle"));
    var back = sub(mid(P("lShoulder"), P("rShoulder")), mid(P("lHip"), P("rHip")));
    return { kneeA: leftKnee, kneeB: rightKnee, kneeBend: Math.min(leftKnee, rightKnee), forwardLean: angleBetween(back, UP) };
  }

  // Was this pose filmed from the side? In the AI's 3D guess, x goes
  // across the picture and z goes toward the camera. From the side, the
  // skater's "forward" points mostly across the picture.
  //   maxDegrees = how far from a perfect side view still counts (35)
  function seenFromSide(pose, maxDegrees) {
    var f = flat(forwardVote(pose)), l = len(f);
    if (l < 1e-6) return false;
    return Math.abs(f.x) / l >= Math.cos((maxDegrees || 35) / DEG);
  }

  function mapPose(pose, fn) {
    var out = {};
    Object.keys(pose).forEach(function (k) { out[k] = fn(pose[k]); });
    return out;
  }

  // Which way is this skater facing? Returns an angle in radians
  // (0 = facing +x). We find it from the hips and shoulders:
  // if you know where "left" and "up" are, "forward" is the third way.
  function facingAngle(pose) {
    var left = add(sub(pose.lHip, pose.rHip), sub(pose.lShoulder, pose.rShoulder));
    var fwd = cross(left, UP);
    return Math.atan2(fwd.z, fwd.x);
  }

  // ---- Which way is FORWARD for this skater? ----
  // The AI is good at finding joints but can mix up LEFT and RIGHT,
  // most of all when it sees the skater from behind in a helmet.
  // So we also use something that is always true in hockey: a skater's
  // chest leans forward and their knees point forward.
  function flat(v) { return pt(v.x, 0, v.z); } // forget the up/down part
  function forwardVote(pose) {
    var trunk = flat(sub(mid(pose.lShoulder, pose.rShoulder), mid(pose.lHip, pose.rHip)));
    var lKnee = flat(sub(pose.lKnee, mid(pose.lHip, pose.lAnkle)));
    var rKnee = flat(sub(pose.rKnee, mid(pose.rHip, pose.rAnkle)));
    return add(trunk, add(lKnee, rKnee));
  }
  function legLength(pose) {
    return (len(sub(pose.lHip, pose.lKnee)) + len(sub(pose.lKnee, pose.lAnkle)) +
            len(sub(pose.rHip, pose.rKnee)) + len(sub(pose.rKnee, pose.rAnkle))) / 2;
  }

  // Swap every left joint with its right twin (for when the AI mixed them up).
  function swapSides(pose) {
    var out = {};
    Object.keys(pose).forEach(function (k) {
      var twin = k.charAt(0) === "l" && pose["r" + k.slice(1)] ? "r" + k.slice(1)
        : k.charAt(0) === "r" && pose["l" + k.slice(1)] ? "l" + k.slice(1) : k;
      out[twin] = pose[k];
    });
    return out;
  }

  // Do the legs have a believable shape? When the AI is guessing, it
  // often makes a shin three times longer than a thigh. We skip those.
  function limbsLookRight(pose) {
    return ["l", "r"].every(function (s) {
      var thigh = len(sub(pose[s + "Hip"], pose[s + "Knee"]));
      var shin = len(sub(pose[s + "Knee"], pose[s + "Ankle"]));
      if (thigh < 1e-6 || shin < 1e-6) return false;
      var ratio = shin / thigh;
      return ratio > 0.55 && ratio < 1.8;
    });
  }

  // ---------- Cleaning up poses from a real video ---------------------
  //
  // The pose-finding AI guesses every picture on its own, so from one
  // picture to the next its joints wobble, bones stretch and shrink,
  // and now and then it mixes up the two legs. These helpers fix that.

  // The middle value of a list of points, one direction at a time.
  // One wild point cannot pull the middle value very far.
  function middlePoint(points) {
    return pt(percentile(points.map(function (q) { return q.x; }), 0.5),
              percentile(points.map(function (q) { return q.y; }), 0.5),
              percentile(points.map(function (q) { return q.z; }), 0.5));
  }

  // Which poses are close in time to pose i? (times are in seconds and
  // go up.) Returns the list of their positions in the list.
  function neighbors(times, i, reach, skipSelf) {
    var near = [];
    for (var j = i; j >= 0 && times[i] - times[j] <= reach; j--) if (!(skipSelf && j === i)) near.push(j);
    for (j = i + 1; j < times.length && times[j] - times[i] <= reach; j++) near.push(j);
    return near;
  }

  // The parts of a leg below the hip.
  var LEG_PARTS = ["Knee", "Ankle", "Heel", "Toe"];

  // Swap the two legs (but not the arms or hips).
  function swapLegs(pose) {
    var out = mapPose(pose, function (q) { return q; });
    LEG_PARTS.forEach(function (part) {
      if (pose["l" + part] && pose["r" + part]) { out["l" + part] = pose["r" + part]; out["r" + part] = pose["l" + part]; }
    });
    return out;
  }

  // From the side, one leg hides behind the other, and the AI sometimes
  // swaps them for a picture or two. For every pose we ask: do the legs
  // fit better with the poses around it as they are, or swapped?
  // If swapped fits much better, we swap them back.
  //   Returns { frames, swapped } where swapped[i] = true if we swapped.
  //
  // The AI also sometimes guesses the whole body turned the wrong way for
  // a moment (most of all when it sees the skater from behind). So we
  // also try turning the pose a little left or right around the hips,
  // and keep the turn that fits the poses around it best.
  function fixLegSwaps(frames, times, reach) {
    reach = reach || 0.2;
    var swapped = [];
    // Each joint measured from the middle of the hips, so a skater who
    // moves across the ice still lines up with the poses around it.
    function fromHips(pose) {
      var hipMid = mid(pose.lHip, pose.rHip);
      return mapPose(pose, function (q) { return sub(q, hipMid); });
    }
    function turnAroundHips(pose, angle) {
      var hipMid = mid(pose.lHip, pose.rHip), c = Math.cos(angle), s = Math.sin(angle);
      return mapPose(pose, function (q) {
        var d = sub(q, hipMid);
        return add(hipMid, pt(d.x * c + d.z * s, d.y, -d.x * s + d.z * c));
      });
    }
    var centered = frames.map(fromHips);
    var out = frames.map(function (f, i) {
      var near = neighbors(times, i, reach, true);
      swapped.push(false);
      if (near.length < 2) return f;
      var guess = {};
      Object.keys(f).forEach(function (k) {
        guess[k] = middlePoint(near.map(function (j) { return centered[j][k]; }));
      });
      function misfit(pose) {
        var c = fromHips(pose), total = 0;
        Object.keys(c).forEach(function (k) { total += len(sub(c[k], guess[k])); });
        return total;
      }
      var best = f, bestMisfit = misfit(f), bestSwapped = false;
      [false, true].forEach(function (legs) {
        for (var deg = -90; deg <= 90; deg += 15) {
          if (!legs && deg === 0) continue;
          var tryPose = turnAroundHips(legs ? swapLegs(f) : f, deg / DEG);
          var m = misfit(tryPose);
          if (m < bestMisfit) { best = tryPose; bestMisfit = m; bestSwapped = legs; }
        }
      });
      // Only change the pose if the fix fits MUCH better.
      if (bestMisfit < 0.6 * misfit(f)) { swapped[i] = bestSwapped; return best; }
      return f;
    });
    return { frames: out, swapped: swapped };
  }

  // The best-fitting gentle curve  value = a + b*t + c*t*t  through some
  // points (t = seconds from now, value = one number per point, w = how
  // much each point counts). We only need the curve's value at t = 0,
  // which is "a". (This is the "least squares" method from statistics.)
  // If there are too few points to fit a curve, we use a plain average.
  function fitCurveAtZero(ts, values, ws, fallback) {
    var S = [0, 0, 0, 0, 0], T = [0, 0, 0], total = 0;
    for (var m = 0; m < ts.length; m++) {
      var t = ts[m], w = ws[m], tk = w;
      for (var p = 0; p <= 4; p++) { S[p] += tk; if (p <= 2) T[p] += tk * values[m]; tk *= t; }
      total += w;
    }
    if (total <= 0) return fallback;
    // Solve the three equations with Cramer's rule.
    function det3(a, b, c, d, e, f, g, h, k) { return a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g); }
    var D = det3(S[0], S[1], S[2], S[1], S[2], S[3], S[2], S[3], S[4]);
    if (Math.abs(D) < 1e-18 * Math.max(1, S[0] * S[2] * S[4])) return T[0] / total;
    return det3(T[0], S[1], S[2], T[1], S[2], S[3], T[2], S[3], S[4]) / D;
  }

  // Calm down jittery joints, the way you would smooth a wobbly line by
  // hand. Each joint follows a smooth curve through where it was at the
  // moments around it:
  //   * moments close in time count a lot, moments farther away count
  //     less (a bell curve about "blur" seconds wide),
  //   * joints the AI was sure about count more (weights go 0 to 1),
  //   * a joint that is far from where its neighbors say it should be
  //     (a wild guess) counts almost nothing.
  // Because we look backward AND forward in time, the smooth path does
  // not lag behind the real one.
  //   frames  = poses        times = seconds for each pose
  //   weights = for each pose, { jointName: how sure, 0 to 1 } (or null)
  function smoothTrack(frames, times, weights, opts) {
    opts = opts || {};
    var blur = opts.blur || 0.08;   // seconds
    var wild = opts.wild || 0.12;   // meters away from the neighbors = a wild guess
    var reach = 3 * blur;
    var n = frames.length;
    if (n < 3) return frames;
    var out = frames.map(function () { return {}; });
    Object.keys(frames[0]).forEach(function (k) {
      // Step 1: how much do we trust this joint in each pose?
      var trust = frames.map(function (f, i) {
        var guess = middlePoint(neighbors(times, i, reach, false).map(function (j) { return frames[j][k]; }));
        var off = len(sub(f[k], guess));
        var sure = weights && weights[i] && typeof weights[i][k] === "number" ? weights[i][k] : 1;
        return Math.max(0.02, sure) / (1 + (off / wild) * (off / wild));
      });
      // Step 2: draw the best smooth curve through the nearby moments
      // (counting each one by how much it matters), and read off where
      // the curve is right now. A curve, not a plain average, so a fast
      // push keeps its full reach instead of being rounded off.
      frames.forEach(function (f, i) {
        var near = neighbors(times, i, reach, false);
        var dts = near.map(function (j) { return times[j] - times[i]; });
        var ws = near.map(function (j, m) { return Math.exp(-0.5 * (dts[m] * dts[m]) / (blur * blur)) * trust[j]; });
        function curveAt(axis) {
          return fitCurveAtZero(dts, near.map(function (j) { return frames[j][k][axis]; }), ws, f[k][axis]);
        }
        out[i][k] = pt(curveAt("x"), curveAt("y"), curveAt("z"));
      });
    });
    return out;
  }

  // The bones of the body, from the hips outward:
  // [the joint a bone starts at, the joint it ends at].
  var BONE_CHAIN = [
    ["hipMid", "neck"], ["neck", "head"],
    ["neck", "lShoulder"], ["neck", "rShoulder"],
    ["lShoulder", "lElbow"], ["lElbow", "lWrist"],
    ["rShoulder", "rElbow"], ["rElbow", "rWrist"],
    ["hipMid", "lHip"], ["hipMid", "rHip"],
    ["lHip", "lKnee"], ["lKnee", "lAnkle"], ["lAnkle", "lHeel"], ["lAnkle", "lToe"],
    ["rHip", "rKnee"], ["rKnee", "rAnkle"], ["rAnkle", "rHeel"], ["rAnkle", "rToe"]
  ];

  // Real bones never change length. The AI's guesses do. So we measure
  // each bone's usual (middle) length over the whole clip, and rebuild
  // every pose from the hips outward with those lengths. Each bone keeps
  // the direction it pointed in, so the joint angles do not change.
  function fixBoneLengths(frames) {
    if (!frames.length) return [];
    var withMid = frames.map(function (f) {
      var g = mapPose(f, function (q) { return q; });
      g.hipMid = mid(f.lHip, f.rHip);
      g.neck = mid(f.lShoulder, f.rShoulder); // the neck sits between the shoulders
      return g;
    });
    var middle = {};
    BONE_CHAIN.forEach(function (b) {
      middle[b.join(">")] = percentile(withMid.map(function (f) { return len(sub(f[b[1]], f[b[0]])); }), 0.5);
    });
    // Your left arm is as long as your right arm, so each left bone and
    // its right twin get the same length (the average of the two).
    function twin(name) {
      if (/^l[A-Z]/.test(name)) return "r" + name.slice(1);
      if (/^r[A-Z]/.test(name)) return "l" + name.slice(1);
      return name;
    }
    var lengths = BONE_CHAIN.map(function (b) {
      var other = middle[twin(b[0]) + ">" + twin(b[1])];
      return other === undefined ? middle[b.join(">")] : (middle[b.join(">")] + other) / 2;
    });
    return withMid.map(function (f) {
      var out = mapPose(f, function (q) { return q; });
      BONE_CHAIN.forEach(function (b, k) {
        out[b[1]] = add(out[b[0]], scale(norm(sub(f[b[1]], f[b[0]])), lengths[k]));
      });
      delete out.hipMid;
      return out;
    });
  }

  // Lay a skate flat on the ice under its ankle. The heel and toe keep
  // their distance from the ankle and the way they point.
  function flatSkate(pose, s) {
    var ankle = pose[s + "Ankle"], drop = ankle.y - 0.03;
    ["Toe", "Heel"].forEach(function (part) {
      var q = pose[s + part], arm = sub(q, ankle), reach = len(arm);
      var dir = norm(flat(arm));
      var along = Math.sqrt(Math.max(0, reach * reach - drop * drop));
      pose[s + part] = pt(ankle.x + dir.x * along, 0.03, ankle.z + dir.z * along);
    });
  }

  // Put the skates on the ice.
  //  * The skate carrying the weight (the lower one) stands exactly on
  //    the ice. We only switch to the other skate when it is clearly
  //    lower (2 cm), so the weight does not flicker from skate to skate.
  //  * The other skate: if it is only a little above the ice (or poking
  //    into it), it is really on the ice, pushing. We bend that leg a
  //    tiny bit so the skate sits on the ice. If it is higher than
  //    "snap", or the leg would have to stretch to reach the ice, the
  //    skater lifted it, and we leave it in the air.
  //  * A skate on the ice lies flat.
  //  * The hips go over the middle of the picture.
  function plantSkates(frames, opts) {
    var snap = (opts && opts.snap) || 0.05;
    var A = BODY.ankleHeight, support = null;
    return frames.map(function (f) {
      if (support === null) support = f.lAnkle.y <= f.rAnkle.y ? "l" : "r";
      var other = support === "l" ? "r" : "l";
      if (f[other + "Ankle"].y < f[support + "Ankle"].y - 0.02) { support = other; other = support === "l" ? "r" : "l"; }
      var hipMid = mid(f.lHip, f.rHip);
      var shift = pt(-hipMid.x, A - f[support + "Ankle"].y, -hipMid.z);
      var p = mapPose(f, function (q) { return add(q, shift); });
      flatSkate(p, support);

      var ankle = p[other + "Ankle"];
      var hip = p[other + "Hip"], knee = p[other + "Knee"];
      // Pressing the skate down must not stretch the leg by more than
      // 1.5 cm. If it would, the skate really is in the air (coming
      // back after a push), and we leave it there.
      var stretch = len(sub(pt(ankle.x, A, ankle.z), hip)) - len(sub(ankle, hip));
      if (ankle.y - A < snap && stretch < 0.015) {
        var leg = solveTwoBone(hip, pt(ankle.x, A, ankle.z), len(sub(knee, hip)), len(sub(ankle, knee)), sub(knee, hip));
        var move = sub(leg.end, ankle);
        p[other + "Knee"] = leg.mid;
        p[other + "Ankle"] = leg.end;
        p[other + "Heel"] = add(p[other + "Heel"], move);
        p[other + "Toe"] = add(p[other + "Toe"], move);
        flatSkate(p, other);
      } else {
        // In the air: just make sure the toe and heel do not dip into the ice.
        ["Heel", "Toe"].forEach(function (part) {
          var q = p[other + part];
          if (q.y < 0.03) p[other + part] = pt(q.x, 0.03, q.z);
        });
      }
      return p;
    });
  }

  // Make the kid's poses easy to compare with the pro:
  //   1. turn every pose so the kid faces the same way as the pro (+x),
  //      even when the kid turns around during the clip,
  //   2. make the kid's legs the same length as the pro's legs,
  //   3. (real video only) fix swapped legs and calm down the jitter,
  //   4. give every bone one fixed length,
  //   5. put the skates on the ice, hips over the middle.
  // Turning, resizing and sliding do NOT change any joint angles.
  //   opts.smooth  = true for real video
  //   opts.times   = the time of each pose in seconds
  //   opts.weights = for each pose, how sure the AI was about each joint
  function normalizeFrames(frames, opts) {
    if (!frames.length) return [];
    opts = opts || {};
    var n = frames.length;
    var weights = opts.weights ? opts.weights.slice() : null;

    // Step A: find "forward" in every pose.
    var prevAngle = null;
    var angles = frames.map(function (f) {
      var hips = facingAngle(f);
      var vote = forwardVote(f);
      var a;
      if (len(vote) > 0.12 * legLength(f)) {
        a = Math.atan2(vote.z, vote.x);       // leaning or bent enough to be sure
      } else {
        // Standing tall and straight: trust the hips, but if that is the
        // opposite of where the skater was just facing, flip it around.
        a = hips;
        if (prevAngle !== null && Math.cos(a - prevAngle) < 0) a += Math.PI;
      }
      prevAngle = a;
      return a;
    });

    // Step B: smooth the direction over 5 poses so the figure turns
    // smoothly instead of twitching.
    var smoothAngles = angles.map(function (_, i) {
      var sx = 0, sz = 0;
      for (var j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { sx += Math.cos(angles[j]); sz += Math.sin(angles[j]); }
      return Math.atan2(sz, sx);
    });

    // Average leg length over the whole clip.
    var legSum = 0;
    frames.forEach(function (f) { legSum += legLength(f); });
    var size = (BODY.thigh + BODY.shin) / Math.max(1e-6, legSum / n);

    var out = frames.map(function (f, i) {
      var a = smoothAngles[i], ca = Math.cos(a), sa = Math.sin(a);
      // If the hips say the skater faces the other way, the AI mixed up
      // left and right in this pose. Swap them back (and how sure it
      // was about each joint, too).
      if (Math.cos(facingAngle(f) - a) < 0) {
        f = swapSides(f);
        if (weights && weights[i]) weights[i] = swapSides(weights[i]);
      }
      return mapPose(f, function (q) {
        return pt((q.x * ca + q.z * sa) * size, q.y * size, (-q.x * sa + q.z * ca) * size);
      });
    });

    // Step C (real video only): fix swapped legs, then smooth.
    if (opts.smooth && n >= 3) {
      var times = opts.times || frames.map(function (_, i) { return i * 0.1; });
      var legs = fixLegSwaps(out, times);
      out = legs.frames;
      if (weights) weights = weights.map(function (w, i) { return w && legs.swapped[i] ? swapLegs(w) : w; });
      out = smoothTrack(out, times, weights, { blur: opts.blur });
    }

    // Steps D and E: fixed bone lengths, skates on the ice.
    return plantSkates(fixBoneLengths(out));
  }

  // ---------- Moving smoothly, and finding the rhythm of the stride ---

  // A pose part-way between pose a (t = 0) and pose b (t = 1).
  // We use this to draw the moments BETWEEN two pictures of the video,
  // so the 3D skater glides instead of jumping.
  function lerpPose(a, b, t) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = b[k] ? lerp(a[k], b[k], t) : a[k]; });
    return out;
  }

  // For every pose (already turned to face +x by normalizeFrames), work
  // out the RHYTHM of the stride, so the pro can skate in step with the kid:
  //   side   = which leg is pushing ("l" or "r")
  //   push   = how far into the push, 0 (feet together) to 1 (full push)
  //   rising = true while the leg is going out, false while it comes back
  //   stride = a counter that goes up by 1 with every new push
  //   peak   = how big the push gets at its farthest point in this stride
  // We look at how far each skate is from under the hips. The skate
  // that is farther away is the one pushing.
  function strideSignal(frames) {
    var n = frames.length;
    if (!n) return [];
    var diff = frames.map(function (f) {
      var hipMid = mid(f.lHip, f.rHip);
      var l = len(flat(sub(f.lAnkle, hipMid))), r = len(flat(sub(f.rAnkle, hipMid)));
      return l - r; // plus = left skate is farther out, minus = right skate
    });
    // Smooth it a little so one wobbly pose does not look like a stride.
    var smooth = diff.map(function (d, i) {
      return (diff[Math.max(0, i - 1)] + 2 * d + diff[Math.min(n - 1, i + 1)]) / 4;
    });
    // A full push = about the biggest gap we see (but never less than
    // 25 cm, so a skater who is only gliding does not look like striding).
    var full = Math.max(0.25, percentile(smooth.map(Math.abs), 0.9));
    var side = smooth[0] >= 0 ? "l" : "r", stride = 0;
    var out = smooth.map(function (d) {
      var push = clamp(Math.abs(d) / full, 0, 1);
      var now = d >= 0 ? "l" : "r";
      // Only switch legs when the new leg is clearly out (not on a wobble).
      if (now !== side && push > 0.15) { side = now; stride++; }
      return { side: side, push: now === side ? push : 0, rising: true, stride: stride };
    });
    // In each stride, the leg goes OUT until its farthest point, then
    // comes BACK. Find the farthest point of every stride.
    var top = {};
    out.forEach(function (o, i) { if (top[o.stride] === undefined || o.push > out[top[o.stride]].push) top[o.stride] = i; });
    out.forEach(function (o, i) {
      o.rising = i <= top[o.stride];
      o.peak = Math.max(0.05, out[top[o.stride]].push); // how big this stride's push gets
    });
    return out;
  }

  // ---------- A pretend kid, for trying the page without a video -----

  // Makes a short "video" of poses: a skater who stands too tall,
  // and gets tired (even straighter knees) near the end. The pushes are good.
  function makeDemoFrames() {
    var frames = [], n = 60;
    for (var i = 0; i < n; i++) {
      var t = i / n;
      var tired = t > 0.6 ? (t - 0.6) / 0.4 : 0;
      var stride = (t * 4) % 1;                       // 4 strides
      var push = Math.pow(Math.sin(stride * Math.PI), 2);
      var pose = makeStancePose({
        kneeBend: 148 + 12 * tired + 3 * Math.sin(i),
        forwardLean: 16 - 8 * tired + 2 * Math.cos(i * 1.7),
        strideExtension: 168,
        push: push,
        pushSide: Math.floor(t * 4) % 2 ? "l" : "r"
      });
      // Pretend the camera filmed from a funny direction and distance,
      // so we can check that normalizeFrames() fixes it.
      var c = Math.cos(2.1), s = Math.sin(2.1);
      frames.push(mapPose(pose, function (q) {
        return pt((q.x * c - q.z * s) * 0.8, q.y * 0.8 - 0.5, (q.x * s + q.z * c) * 0.8);
      }));
    }
    return frames;
  }

  var api = {
    pt: pt, add: add, sub: sub, scale: scale, dot: dot, cross: cross, len: len,
    norm: norm, mid: mid, lerp: lerp, clamp: clamp,
    angleBetween: angleBetween, angleAt: angleAt, measurePose: measurePose,
    ageBand: ageBand, getTarget: getTarget, scoreAngle: scoreAngle,
    percentile: percentile, analyzeFrames: analyzeFrames,
    BODY: BODY, solveTwoBone: solveTwoBone, makeStancePose: makeStancePose,
    MP: MP, mediapipeToPose: mediapipeToPose, poseIsClear: poseIsClear,
    facingAngle: facingAngle, normalizeFrames: normalizeFrames,
    forwardVote: forwardVote, swapSides: swapSides, limbsLookRight: limbsLookRight,
    lerpPose: lerpPose, lerpNum: lerpNum, strideSignal: strideSignal,
    mapPose: mapPose, mediapipeConfidence: mediapipeConfidence, measureFlat: measureFlat,
    seenFromSide: seenFromSide, swapLegs: swapLegs, fixLegSwaps: fixLegSwaps,
    smoothTrack: smoothTrack, fixBoneLengths: fixBoneLengths, plantSkates: plantSkates,
    makeDemoFrames: makeDemoFrames
  };

  // Works in the browser (window.CoachMath) and in node (require).
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachMath = api;
})(typeof window !== "undefined" ? window : this);
