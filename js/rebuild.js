// =====================================================================
//  rebuild.js  --  YOUR STRIDE, REBUILT SMOOTHLY
//
//  The AI looks at every picture of the video on its own, and every
//  picture comes out a little different. If the orange skater copies
//  the pictures one by one, it twitches.
//
//  One picture is wobbly, but MANY pictures together are trustworthy.
//  So we do this instead:
//    1. THE CLOCK: find the moments the skater changes legs. From one
//       leg change to the next is one push, and two pushes are one full
//       stride. That gives a steady clock for the whole clip: "how far
//       through the stride is the skater right now?"
//    2. THE NUMBERS: around every moment, take the MIDDLE value of the
//       knee bend and the lean of all the pictures nearby (one wild
//       picture cannot pull the middle value far), and the middle value
//       of the nearest pushes.
//    3. THE SKATER: give the clock and the numbers to the same stride
//       builder the blue pro uses (makeStridePose in stride.js).
//
//  The orange skater is then a MODEL of how you skate, not a recording.
//  Yours: knee bend, lean, how far you push, your rhythm, and your left
//  push compared with your right push. Not yours (the camera cannot
//  measure them well): the arms, the stick and how the skates tip.
//
//  No drawing and no video in this file, so we can test it:
//      node tests/rebuild.test.js
// =====================================================================
(function (root) {
  "use strict";
  var inNode = typeof module !== "undefined" && module.exports;
  var M = inNode ? require("./angles.js") : root.CoachMath;
  var St = inNode ? require("./stride.js") : root.CoachStride;

  function middle(list) { return M.percentile(list, 0.5); }
  function frac(x) { return ((x % 1) + 1) % 1; }

  // ---------- Where is a leg change in the model's stride? ------------
  // Our clock comes from leg changes, so we must know at which part of
  // the stride cycle (0 to 1, see stride.js) the model changes legs.
  // We find out by letting the model skate and watching it with the
  // very same leg-change finder we use on the video (strideSignal).
  //   angles = { kneeBend, forwardLean, strideExtension }
  // Returns the cycle time where the RIGHT leg becomes the pushing leg
  // (the left leg does the same half a cycle later).
  var changeMemo = {};
  function changeMoment(angles) {
    var key = [angles.kneeBend, angles.forwardLean, angles.strideExtension].map(function (v) { return Math.round(v / 2) * 2; }).join("|");
    if (changeMemo[key] !== undefined) return changeMemo[key];
    var N = 100, frames = [];
    for (var i = 0; i < 3 * N; i++) frames.push(St.makeStridePose(i / N, angles).pose);
    var rhythm = M.strideSignal(frames), found = 0.33; // (0.33 = the usual spot, if the model barely strides)
    for (var j = N; j < 3 * N; j++) {
      if (rhythm[j].side === "r" && rhythm[j - 1].side === "l") { found = frac((j - 0.5) / N); break; }
    }
    return (changeMemo[key] = found);
  }

  // ---------- 1. The clock --------------------------------------------
  //   times   = the second of each pose
  //   rhythm  = from strideSignal: which leg pushes in each pose
  //   changeR = from changeMoment (where a change to the right leg sits)
  // Returns { ok, cycle, secondsPerCycle, pushes }:
  //   cycle[i] = how many strides the skater has done at pose i. It only
  //              ever goes up. The part after the point (0.25, 0.9, ...)
  //              is the moment in the stride, the same clock as the pro's.
  //   ok = false when we could not find the rhythm (too few leg changes).
  function strideClock(times, rhythm, changeR) {
    var n = times.length, none = { ok: false, cycle: [], secondsPerCycle: NaN, pushes: 0 };
    if (n < 4 || rhythm.length !== n) return none;
    if (changeR === undefined) changeR = 0.33;

    // A hole: two poses much farther apart in time than usual.
    var gaps = [];
    for (var g = 1; g < n; g++) gaps.push(times[g] - times[g - 1]);
    var holeGap = Math.max(2.5 * (middle(gaps) || 0.05), 0.25);

    // Every leg change: when, to which leg, and in which piece of the
    // clip (a new piece starts after every hole).
    var events = [], piece = 0;
    for (var i = 1; i < n; i++) {
      var hole = times[i] - times[i - 1] > holeGap;
      if (hole) piece++;
      // A change that happens inside a hole: we cannot say when it was.
      if (rhythm[i].stride !== rhythm[i - 1].stride && !hole) {
        events.push({ t: (times[i - 1] + times[i]) / 2, side: rhythm[i].side, piece: piece });
      }
    }

    // How long is one push? The middle value of the times between two
    // leg changes in a row (in the same piece).
    function pushTimes(list) {
      var d = [];
      for (var k = 1; k < list.length; k++) if (list[k].piece === list[k - 1].piece) d.push(list[k].t - list[k - 1].t);
      return d;
    }
    var all = pushTimes(events);
    if (!all.length) return none;
    var rough = middle(all);
    var fair = all.filter(function (d) { return d > 0.6 * rough && d < 1.6 * rough; });
    var push = middle(fair.length ? fair : all);
    if (!(push >= 0.2 && push <= 2.5)) return none;   // not a skating rhythm

    // A flicker: the legs seem to change and change right back, much
    // faster than a real push. Both of those changes are thrown away.
    for (var f = 0; f + 1 < events.length;) {
      var a = events[f], b = events[f + 1];
      if (a.piece === b.piece && b.t - a.t < 0.5 * push) events.splice(f, 2); else f++;
    }
    if (events.length < 2) return none;

    // Count the strides. A change to the right leg is always at changeR
    // (plus a whole number of strides), a change to the left leg half a
    // stride later. We pick the whole number that fits the time passed.
    var perCycle = 2 * push;
    function spot(side) { return side === "r" ? changeR : changeR + 0.5; }
    var marks = [{ t: events[0].t, c: spot(events[0].side) }];
    for (var e = 1; e < events.length; e++) {
      var before = marks[e - 1];
      var guess = before.c + (events[e].t - before.t) / perCycle;
      var c = spot(events[e].side) + Math.round(guess - spot(events[e].side));
      while (c < before.c + 0.25) c += 1;   // the clock never goes backward
      marks.push({ t: events[e].t, c: c, piece: events[e].piece });
    }
    // Our leg-change times are only as exact as the pictures are close
    // together. Evening them out a little makes the clock run steadier.
    var even = marks.map(function (m, k) {
      var p = marks[k - 1], q = marks[k + 1];
      var steady = p && q && Math.abs(m.c - p.c - 0.5) < 1e-9 && Math.abs(q.c - m.c - 0.5) < 1e-9 &&
        events[k - 1].piece === events[k].piece && events[k].piece === events[k + 1].piece;
      return { t: steady ? (p.t + 2 * m.t + q.t) / 4 : m.t, c: m.c };
    });

    // The clock at every pose: evenly from one mark to the next. Before
    // the first mark and after the last one, it runs at the usual pace.
    var cycle = [], k = 0, last = even.length - 1;
    for (var j = 0; j < n; j++) {
      var t = times[j];
      while (k < last - 1 && t >= even[k + 1].t) k++;
      if (t <= even[0].t) cycle.push(even[0].c - (even[0].t - t) / perCycle);
      else if (t >= even[last].t) cycle.push(even[last].c + (t - even[last].t) / perCycle);
      else {
        var m0 = even[k], m1 = even[k + 1];
        cycle.push(m0.c + (m1.c - m0.c) * (t - m0.t) / (m1.t - m0.t));
      }
    }
    // Start counting near zero (only the part after the point matters).
    var whole = Math.floor(cycle[0]);
    return { ok: true, cycle: cycle.map(function (c) { return c - whole; }), secondsPerCycle: perCycle, pushes: events.length };
  }

  // ---------- 2. The numbers ------------------------------------------
  // The middle value of the values near each moment.
  //   values, times = one for each pose
  //   half  = how many seconds to each side count as "near"
  //   use   = (optional) which poses may be used at all
  function runningMiddle(values, times, half, use) {
    var usable = [];
    values.forEach(function (v, i) { if (isFinite(v) && (!use || use[i])) usable.push(i); });
    if (!usable.length) return values.map(function () { return NaN; });
    return times.map(function (t) {
      var near = usable.filter(function (i) { return Math.abs(times[i] - t) <= half; });
      if (near.length < 3) {
        // Too few right here: take the 5 nearest we do have.
        near = usable.slice().sort(function (a, b) { return Math.abs(times[a] - t) - Math.abs(times[b] - t); }).slice(0, 5);
      }
      return middle(near.map(function (i) { return values[i]; }));
    });
  }
  // Round off the corners: each value moves a little toward its neighbors.
  function soften(list) {
    return list.map(function (v, i) {
      var a = list[Math.max(0, i - 1)], b = list[Math.min(list.length - 1, i + 1)];
      return (a + 2 * v + b) / 4;
    });
  }

  // The top of every single push: how straight the pushing knee got.
  //   rhythm = from strideSignal (which push each pose belongs to)
  // Returns a list of { t, side, value }.
  function pushTops(perFrame, times, rhythm) {
    if (!rhythm) return [];
    var groups = {}, order = [];
    perFrame.forEach(function (f, i) {
      var id = rhythm[i].stride;
      if (!groups[id]) { groups[id] = []; order.push(id); }
      // It only counts while the push leg is clearly straighter than the standing leg.
      if (f.m.strideExtension - f.m.knee3D >= 8) groups[id].push({ t: times[i], side: rhythm[i].side, value: f.m.strideExtension });
    });
    var out = [];
    order.forEach(function (id) {
      var g = groups[id].slice().sort(function (a, b) { return b.value - a.value; });
      if (g.length < 3) return;                // a flicker, not a push
      // The second straightest picture: the very straightest one is
      // often a wobble of the AI.
      out.push(g.length >= 5 ? g[1] : g[0]);
    });
    return out;
  }

  //   perFrame = analysis.perFrame from analyzeFrames (angles.js)
  //   opts = { secondsPerCycle, sideOnly, rhythm }
  //          sideOnly = the report only trusts the side-view pictures
  // Returns { kneeBend[], forwardLean[], pushRight[], pushLeft[],
  //           pushSeen, sidesApart } with one value for each pose.
  function strideAngles(perFrame, times, opts) {
    opts = opts || {};
    var half = Math.max(0.5, (opts.secondsPerCycle || St.STRIDE.secondsPerCycle) / 2);
    var use = opts.sideOnly ? perFrame.map(function (f) { return !!f.m.fromPicture; }) : null;
    function column(name) { return perFrame.map(function (f) { return f.m[name]; }); }
    var knee = soften(runningMiddle(column("kneeBend"), times, half, use));
    var lean = soften(runningMiddle(column("forwardLean"), times, half, use));

    // The pushes: the tops of the pushes the report found.
    var peaks = [];
    perFrame.forEach(function (f, i) { if (f.isPeak) peaks.push({ t: times[i], side: f.m.pushSide, value: f.m.strideExtension }); });
    function near(list, t) {
      // The middle value of the 3 pushes nearest in time.
      var s = list.slice().sort(function (a, b) { return Math.abs(a.t - t) - Math.abs(b.t - t); }).slice(0, 3);
      return middle(s.map(function (p) { return p.value; }));
    }
    function valueOf(list) { return middle(list.map(function (p) { return p.value; })); }

    // LEFT PUSH AND RIGHT PUSH. The report only counts pushes close to
    // the best one, so a weaker leg would not show up there. Here we
    // look at every push by itself: how straight did the pushing knee
    // get? (Only if that leg was clearly straighter than the other one.)
    var tops = pushTops(perFrame, times, opts.rhythm);
    function of(side) { return tops.filter(function (p) { return p.side === side; }); }
    var right = of("r"), left = of("l");
    // The two legs are only shown apart if we saw each at least twice
    // and they really differ. Otherwise every push counts for both legs.
    var apart = right.length >= 2 && left.length >= 2 && Math.abs(valueOf(right) - valueOf(left)) >= 4;
    var pushRight = [], pushLeft = [];
    times.forEach(function (t, i) {
      // No push seen at all: a small one, just past the knee bend.
      if (!peaks.length) { pushRight.push(Math.min(178, knee[i] + 8)); pushLeft.push(Math.min(178, knee[i] + 8)); return; }
      pushRight.push(near(apart ? right : peaks, t));
      pushLeft.push(near(apart ? left : peaks, t));
    });
    return {
      kneeBend: knee, forwardLean: lean, pushRight: soften(pushRight), pushLeft: soften(pushLeft),
      pushSeen: peaks.length > 0, sidesApart: apart
    };
  }

  // ---------- Everything together -------------------------------------
  //   frames, times, rhythm = the cleaned-up poses of the clip
  //   analysis = from analyzeFrames (the report's numbers)
  // Returns { ok, why, clock, angles, overall, rhythmFound, pictures }.
  //   ok = false: we cannot rebuild a stride (why says so in words).
  //   rhythmFound = false: we have the numbers but not the rhythm; the
  //                 skater then strides at a standard, even pace.
  function build(frames, times, rhythm, analysis) {
    if (!frames || frames.length < 8) return { ok: false, why: "There are too few good pictures to rebuild a stride." };
    if (!analysis || !analysis.peaks || !analysis.peaks.length) {
      return { ok: false, why: "No full push was seen in this clip, so there is no stride to rebuild." };
    }
    var s = analysis.summary;
    var overall = {
      kneeBend: s.kneeBend.value, forwardLean: s.forwardLean.value,
      strideExtension: s.strideExtension ? s.strideExtension.value : Math.min(178, s.kneeBend.value + 8)
    };
    var clock = strideClock(times, rhythm, changeMoment(tidy(overall)));
    var rhythmFound = clock.ok;
    if (!clock.ok) {
      // No rhythm found (too few leg changes). The skater then strides at
      // a standard, even pace. We still line it up with the one thing we
      // did see: the top of a push, where the pushing knee is straightest.
      // In the model that is the moment the push skate lifts off.
      var pace = St.STRIDE.secondsPerCycle;
      var top = analysis.peaks[Math.floor(analysis.peaks.length / 2)];
      var topCycle = St.STRIDE.liftOff + (analysis.perFrame[top].m.pushSide === "l" ? 0.5 : 0);
      var first = topCycle + (times[0] - times[top]) / pace;
      var shift = topCycle - Math.floor(first);   // start counting near zero
      clock = {
        ok: false, secondsPerCycle: pace, pushes: 0,
        cycle: times.map(function (t) { return shift + (t - times[top]) / pace; })
      };
    }
    var angles = strideAngles(analysis.perFrame, times, { secondsPerCycle: clock.secondsPerCycle, sideOnly: analysis.sideOn > 0, rhythm: rhythm });
    return { ok: true, why: "", clock: clock, angles: angles, overall: overall, rhythmFound: rhythmFound, pictures: frames.length };
  }

  // The clock and the numbers at one moment of the replay.
  //   i = which pose, blend = how far toward the next pose (0 to 1)
  function at(rebuilt, i, blend) {
    var n = rebuilt.clock.cycle.length, j = Math.min(n - 1, i + 1), A = rebuilt.angles;
    blend = i >= n - 1 ? 0 : (blend || 0);
    function mix(list) { return M.lerpNum(list[i], list[j], blend); }
    return {
      cycle: mix(rebuilt.clock.cycle), kneeBend: mix(A.kneeBend), forwardLean: mix(A.forwardLean),
      pushRight: mix(A.pushRight), pushLeft: mix(A.pushLeft)
    };
  }

  // ---------- 3. The skater -------------------------------------------
  // Which push counts right now? The right leg's push from just after
  // the left skate lifts off until the right skate lifts off, then the
  // left leg's. We slide from one to the other while the next leg is
  // still bent, so nothing jumps.
  function pushFor(cycle, pushRight, pushLeft) {
    var t = frac(cycle), L = St.STRIDE.liftOff, slide = 0.12;
    // u goes 0 -> 1 just after the right skate lifts off (t = L), and
    // 1 -> 0 just after the left skate lifts off (t = L - 0.5).
    function ramp(from) { var x = M.clamp(frac(t - from) / slide, 0, 1); return x * x * (3 - 2 * x); }
    var toLeft = frac(t - L) < 0.5 ? ramp(L) : 1 - ramp(L - 0.5);
    return M.lerpNum(pushRight, pushLeft, toLeft);
  }

  // Keep the numbers where a body can be (so a bad reading cannot fold
  // the skater up), and the push leg always straighter than the knee bend.
  function tidy(a) {
    var knee = M.clamp(a.kneeBend, 70, 172);
    return {
      kneeBend: knee, forwardLean: M.clamp(a.forwardLean, 0, 70),
      strideExtension: M.clamp(a.strideExtension, knee + 4, 179)
    };
  }

  // The rebuilt skater at one moment.
  //   cycle = the clock,  a = { kneeBend, forwardLean, pushRight, pushLeft }
  // Returns what makeStridePose returns: { pose, edges, glideSide, pushSide }.
  function poseAt(cycle, a) {
    return St.makeStridePose(frac(cycle), tidy({
      kneeBend: a.kneeBend, forwardLean: a.forwardLean, strideExtension: pushFor(cycle, a.pushRight, a.pushLeft)
    }));
  }

  var api = {
    changeMoment: changeMoment, strideClock: strideClock, runningMiddle: runningMiddle, strideAngles: strideAngles,
    build: build, at: at, pushFor: pushFor, poseAt: poseAt
  };
  if (inNode) module.exports = api;
  else root.CoachRebuild = api;
})(typeof window !== "undefined" ? window : this);
