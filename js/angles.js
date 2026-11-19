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
  function analyzeFrames(frames, target, yellowZone, span) {
    span = span || 2;
    var CHECKS = ["kneeBend", "forwardLean", "strideExtension"];
    var perFrame = frames.map(function (pose) {
      var m = measurePose(pose);
      var scores = {};
      CHECKS.forEach(function (c) { scores[c] = scoreAngle(m[c], target[c], yellowZone); });
      // "slip" = how far off the form is at this moment.
      // (Stride extension is only fair to judge at the top of a push,
      //  so it is not counted here.)
      var slip = Math.abs(scores.kneeBend.off) + Math.abs(scores.forwardLean.off);
      return { m: m, scores: scores, slip: slip, isPeak: false };
    });

    function column(name) { return perFrame.map(function (f) { return f.m[name]; }); }

    // The best pushes: we look at the straightest the push leg gets.
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
      var legsDiffer = ext[i] - perFrame[i].m.kneeBend >= 12;
      if (isTop && legsDiffer && ext[i] >= bestExt - 8) { peaks.push(i); perFrame[i].isPeak = true; }
    }

    // One number per check for the whole video.
    var summary = {
      kneeBend: scoreAngle(percentile(column("kneeBend"), 0.5), target.kneeBend, yellowZone),
      forwardLean: scoreAngle(percentile(column("forwardLean"), 0.5), target.forwardLean, yellowZone),
      strideExtension: scoreAngle(bestExt, target.strideExtension, yellowZone)
    };

    // Which moment has the biggest slip?
    var worstFrame = 0;
    perFrame.forEach(function (f, idx) { if (f.slip > perFrame[worstFrame].slip) worstFrame = idx; });

    return { perFrame: perFrame, summary: summary, peaks: peaks, worstFrame: worstFrame };
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

  // The middle one of three numbers (throws away one wild value).
  function middleOf3(a, b, c) { return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)); }

  // Make the kid's poses easy to compare with the pro:
  //   1. turn every pose so the kid faces the same way as the pro (+x),
  //      even when the kid turns around during the clip,
  //   2. make the kid's legs the same length as the pro's legs,
  //   3. stand the lowest skate on the ice, hips over the middle.
  // Turning, resizing and sliding do NOT change any joint angles.
  //   opts.smooth = true also calms down jittery joints (for real video).
  function normalizeFrames(frames, opts) {
    if (!frames.length) return [];
    var n = frames.length;

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
      // left and right in this pose. Swap them back.
      if (Math.cos(facingAngle(f) - a) < 0) f = swapSides(f);
      return mapPose(f, function (q) {
        return pt((q.x * ca + q.z * sa) * size, q.y * size, (-q.x * sa + q.z * ca) * size);
      });
    });

    // Step C (real video only): each joint takes the middle value of
    // the pose before, this pose and the pose after.
    if (opts && opts.smooth && n >= 3) {
      out = out.map(function (f, i) {
        if (i === 0 || i === n - 1) return f;
        var before = out[i - 1], after = out[i + 1], calm = {};
        Object.keys(f).forEach(function (k) {
          calm[k] = pt(middleOf3(before[k].x, f[k].x, after[k].x),
                       middleOf3(before[k].y, f[k].y, after[k].y),
                       middleOf3(before[k].z, f[k].z, after[k].z));
        });
        return calm;
      });
      // ...and then blends a little with its neighbors (half itself,
      // a quarter of each neighbor) so the motion flows.
      var sharp = out;
      out = sharp.map(function (f, i) {
        if (i === 0 || i === n - 1) return f;
        var soft = {};
        Object.keys(f).forEach(function (k) {
          soft[k] = add(scale(f[k], 0.5), scale(add(sharp[i - 1][k], sharp[i + 1][k]), 0.25));
        });
        return soft;
      });
    }

    // Stand each pose on the ice with the hips over the middle.
    return out.map(function (turned) {
      var hipMid = mid(turned.lHip, turned.rHip);
      var lowest = Math.min(turned.lHeel.y, turned.rHeel.y, turned.lToe.y, turned.rToe.y);
      var shift = pt(-hipMid.x, 0.03 - lowest, -hipMid.z);
      return mapPose(turned, function (q) { return add(q, shift); });
    });
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
    makeDemoFrames: makeDemoFrames
  };

  // Works in the browser (window.CoachMath) and in node (require).
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachMath = api;
})(typeof window !== "undefined" ? window : this);
