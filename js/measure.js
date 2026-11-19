// =====================================================================
//  measure.js  --  MEASURING A SKATER'S STRIDE FROM A VIDEO
//
//  We use this to measure a strong skater (a pro), so the blue "pro" on
//  the page can skate with real numbers instead of our guesses.
//
//  One push is never exactly like the next, and the pose-finding AI is
//  a bit wobbly. So we do what scientists do with many measurements:
//    1. cut the clip into single pushes (right push, left push, ...),
//    2. throw away the broken ones (far too short or too long, or with
//       a hole where the skater was lost),
//    3. stretch every push onto the same clock (0 = start, 1 = end),
//    4. flip the left pushes into right pushes, so both legs count,
//    5. take the MIDDLE value of all pushes at every moment (one wild
//       push cannot pull the middle value far),
//    6. read off the numbers we care about, and how much the pushes
//       disagree (the "spread"). A small spread means we can trust it.
//
//  No drawing and no video in this file, so we can test it:
//      node tests/measure.test.js
// =====================================================================
(function (root) {
  "use strict";
  var M = (typeof module !== "undefined" && module.exports) ? require("./angles.js") : root.CoachMath;
  var STEPS = 24; // every push is stretched onto 24 equal steps

  // ---------- 1 and 2. Cut the clip into pushes -----------------------
  // frames = cleaned-up poses (from normalizeFrames), times = seconds,
  // rhythm = from strideSignal (which leg is pushing in each pose).
  // Returns a list of { side, from, to, seconds } (from/to = positions
  // in the list of poses) and how many were thrown away.
  function splitStrides(frames, times, rhythm) {
    var all = [], start = 0;
    for (var i = 1; i <= rhythm.length; i++) {
      if (i === rhythm.length || rhythm[i].stride !== rhythm[start].stride) {
        all.push({ side: rhythm[start].side, from: start, to: i - 1, seconds: times[i - 1] - times[start] });
        start = i;
      }
    }
    // The first and the last push are cut off by the ends of the clip.
    var whole = all.slice(1, -1);
    // A hole: two poses in a row that are much farther apart in time
    // than usual (the skater was lost for a moment).
    var gaps = [];
    for (var g = 1; g < times.length; g++) gaps.push(times[g] - times[g - 1]);
    var usualGap = M.percentile(gaps, 0.5) || 0.05;
    whole = whole.filter(function (s) {
      for (var j = s.from + 1; j <= s.to; j++) if (times[j] - times[j - 1] > 2.5 * usualGap) return false;
      return s.to - s.from >= 4 && s.seconds >= 0.2;   // a real push, not a flicker
    });
    var usual = M.percentile(whole.map(function (s) { return s.seconds; }), 0.5);
    var good = whole.filter(function (s) { return s.seconds > 0.6 * usual && s.seconds < 1.6 * usual; });
    return { strides: good, dropped: all.length - good.length };
  }

  // ---------- 3. Stretch one push onto the same clock -----------------
  // Returns STEPS + 1 poses, evenly spaced from the start to the end.
  function resampleStride(frames, times, stride) {
    var out = [], t0 = times[stride.from], t1 = times[stride.to], j = stride.from;
    for (var k = 0; k <= STEPS; k++) {
      var t = t0 + (t1 - t0) * k / STEPS;
      while (j < stride.to - 1 && times[j + 1] <= t) j++;
      var span = times[j + 1] - times[j];
      out.push(M.lerpPose(frames[j], frames[j + 1], span > 0 ? M.clamp((t - times[j]) / span, 0, 1) : 0));
    }
    return out;
  }

  // ---------- 4. Flip a pose left-to-right ----------------------------
  // The left leg becomes the right leg, like looking in a mirror.
  function mirrorPose(pose) {
    var swapped = M.swapSides(pose);
    return M.mapPose(swapped, function (q) { return M.pt(q.x, q.y, -q.z); });
  }

  // ---------- 5. The middle pose of many pushes -----------------------
  // strides = list of resampled pushes, all with the RIGHT leg pushing.
  function averageStrides(strides) {
    var out = [];
    for (var k = 0; k <= STEPS; k++) {
      var pose = {};
      Object.keys(strides[0][k]).forEach(function (joint) {
        var pts = strides.map(function (s) { return s[k][joint]; });
        pose[joint] = M.pt(
          M.percentile(pts.map(function (q) { return q.x; }), 0.5),
          M.percentile(pts.map(function (q) { return q.y; }), 0.5),
          M.percentile(pts.map(function (q) { return q.z; }), 0.5));
      });
      out.push(pose);
    }
    return out;
  }

  // ---------- 6. The numbers of ONE push (right leg pushing) ----------
  function knee(p, s) { return M.angleAt(p[s + "Hip"], p[s + "Knee"], p[s + "Ankle"]); }
  function numbersOf(steps, seconds) {
    var glide = steps.map(function (p) { return knee(p, "l"); });   // the standing leg
    var push = steps.map(function (p) { return knee(p, "r"); });    // the pushing leg
    var lean = steps.map(function (p) { return M.measurePose(p).forwardLean; });
    function rel(p, joint) { return M.sub(p[joint], M.mid(p.lHip, p.rHip)); }
    var ankleX = steps.map(function (p) { return rel(p, "rAnkle").x; });
    var ankleY = steps.map(function (p) { return p.rAnkle.y; });
    var ankleZ = steps.map(function (p) { return rel(p, "rAnkle").z; });
    var hand = steps.map(function (p) { return M.sub(p.rWrist, p.rShoulder).x; });
    function max(a) { return Math.max.apply(null, a); }
    function min(a) { return Math.min.apply(null, a); }
    function where(a, v) { return a.indexOf(v) / STEPS; }
    var deepest = min(glide), straightest = max(push);
    return {
      secondsPerPush: seconds,
      glideKneeDeepest: deepest,            // the standing knee at its most bent (degrees)
      glideKneeDeepestWhen: where(glide, deepest),   // 0 = start of the push, 1 = end
      pushKneeStraightest: straightest,     // the pushing knee at its straightest (degrees)
      pushKneeStraightestWhen: where(push, straightest),
      leanAverage: M.percentile(lean, 0.5), // degrees
      leanSwing: max(lean) - min(lean),
      skateFarthestBack: -min(ankleX),      // how far behind the hips the push skate gets (m)
      skateFarthestForward: max(ankleX),    // how far in front (m)
      skateFarthestOut: max(ankleZ),        // how far out to the side (m; rough from a side camera)
      skateLift: max(ankleY) - min(ankleY), // how high the skate lifts (m)
      handSwing: max(hand) - min(hand)      // how far the hand swings forward and back (m)
    };
  }

  // ---------- Everything together -------------------------------------
  // Returns:
  //   numbers = { name: { value: the middle value over all pushes,
  //                        spread: how much the pushes disagree } }
  //   curves  = the middle push as lists over the 25 steps (for charts)
  //   used, dropped = how many pushes went in, how many were thrown away
  function measureStride(frames, times, rhythm) {
    var cut = splitStrides(frames, times, rhythm);
    if (cut.strides.length < 2) return { used: cut.strides.length, dropped: cut.dropped, numbers: null, curves: null };
    var seconds = [];
    var resampled = cut.strides.map(function (s) {
      var steps = resampleStride(frames, times, s);
      seconds.push(s.seconds);
      return s.side === "l" ? steps.map(mirrorPose) : steps;
    });
    var each = resampled.map(function (steps, i) { return numbersOf(steps, seconds[i]); });
    var numbers = {};
    Object.keys(each[0]).forEach(function (name) {
      var values = each.map(function (e) { return e[name]; });
      numbers[name] = {
        value: M.percentile(values, 0.5),
        // Half the distance between the low quarter and the high quarter.
        spread: (M.percentile(values, 0.75) - M.percentile(values, 0.25)) / 2
      };
    });
    var middle = averageStrides(resampled);
    var curves = {
      glideKnee: middle.map(function (p) { return knee(p, "l"); }),
      pushKnee: middle.map(function (p) { return knee(p, "r"); }),
      lean: middle.map(function (p) { return M.measurePose(p).forwardLean; }),
      skateForward: middle.map(function (p) { return p.rAnkle.x - M.mid(p.lHip, p.rHip).x; }),
      skateHeight: middle.map(function (p) { return p.rAnkle.y; })
    };
    return { used: cut.strides.length, dropped: cut.dropped, numbers: numbers, curves: curves, middle: middle };
  }

  // ---------- When left and right cannot be trusted --------------------
  // A TV camera rarely films from exactly the side. Then the AI mixes up
  // the left and the right leg, and the careful method above does not
  // work. But one thing is still easy to see: in a strong push, one knee
  // is very straight while the other is clearly bent. So we look for
  // those moments.
  //   rows = [[seconds, the more bent knee, the straighter knee, lean], ...]
  // A "push" is a run of pictures where the straighter knee is at least
  // 150 degrees and the other knee is at most 125. We ignore knees of
  // 179-180: that is the clean-up forcing a leg straight, not a real reading.
  // Returns the pushes, and the middle value and spread of each number.
  function pushesFromKnees(rows) {
    var runs = [], run = null;
    rows.forEach(function (r) {
      var isPush = r[2] >= 150 && r[1] <= 125;
      if (isPush && run && r[0] - run.to <= 0.4) { run.rows.push(r); run.to = r[0]; }
      else if (isPush) { run = { from: r[0], to: r[0], rows: [r] }; runs.push(run); }
    });
    var pushes = runs.filter(function (u) { return u.rows.length >= 4; }).map(function (u) {
      var real = u.rows.filter(function (r) { return r[2] < 179; });
      function col(k, list) { return (list || u.rows).map(function (r) { return r[k]; }); }
      return {
        from: u.from, to: u.to, pictures: u.rows.length,
        pushKnee: M.percentile(col(2, real), 0.75),   // near its straightest
        glideKnee: M.percentile(col(1), 0.5),
        lean: M.percentile(col(3), 0.5)
      };
    });
    function sum(name) {
      var v = pushes.map(function (p) { return p[name]; });
      if (!v.length) return null;
      return { value: M.percentile(v, 0.5), spread: (Math.max.apply(null, v) - Math.min.apply(null, v)) / 2 };
    }
    return { pushes: pushes, pushKnee: sum("pushKnee"), glideKnee: sum("glideKnee"), lean: sum("lean") };
  }

  var api = {
    STEPS: STEPS, splitStrides: splitStrides, resampleStride: resampleStride, mirrorPose: mirrorPose,
    averageStrides: averageStrides, numbersOf: numbersOf, measureStride: measureStride,
    pushesFromKnees: pushesFromKnees
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachMeasure = api;
})(typeof window !== "undefined" ? window : this);
