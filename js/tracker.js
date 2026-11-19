// =====================================================================
//  tracker.js  --  FOLLOWING ONE SKATER THROUGH THE VIDEO
//
//  A hockey video usually has more than one person in it, the camera
//  moves, and the skater can be far away and small. If we just asked
//  the pose-finding AI "where is the person?" on every picture, it
//  would jump between different skaters and miss the small ones.
//
//  So we do what sports-tracking software does:
//    1. YOU click the skater once.
//    2. We cut out a small square "window" of the picture around that
//       skater and zoom in on it, so the AI sees the skater nice and big.
//    3. On the next picture we look near where the skater just was
//       (and guess a bit ahead, in the direction they were moving).
//    4. If we find several people, we keep the one that is in the right
//       place AND about the right size. A much bigger person is someone
//       skating past close to the camera, not our skater.
//
//  This file is only the math for that. No drawing, no video.
//  Test it with:   node tests/tracker.test.js
// =====================================================================
(function (root) {
  "use strict";

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // The box around a person.
  //   pts = their joints as [{ x, y, v }] in picture pixels. v = how sure
  //         the AI is that it can see that joint (0 to 1).
  // Returns { cx, cy, w, h } = the middle, width and height of the box.
  function boxOf(pts, minV) {
    var seen = pts.filter(function (p) { return p.v >= minV; });
    if (seen.length < 6) seen = pts; // not enough sure joints: use them all
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    seen.forEach(function (p) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    });
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }

  // A square window of the picture, centered on (cx, cy) if possible,
  // but always completely inside the picture (W wide, H tall).
  function cropWindow(cx, cy, size, W, H) {
    size = Math.round(clamp(size, 32, Math.min(W, H)));
    return {
      x: Math.round(clamp(cx - size / 2, 0, W - size)),
      y: Math.round(clamp(cy - size / 2, 0, H - size)),
      size: size
    };
  }

  // How big should the window be? About 2.5 skaters wide, and bigger
  // each time we fail to find the skater ("misses").
  function windowSize(box, misses, H) {
    var body = Math.max(box.w, box.h);
    return clamp(body * 2.5 * (1 + 0.3 * misses), 96, H);
  }

  // Guess where the skater is now. If we know the last two places,
  // keep moving the same way (a little less, to be safe).
  function predict(prev, cur) {
    if (!prev) return { cx: cur.cx, cy: cur.cy };
    return { cx: cur.cx + 0.7 * (cur.cx - prev.cx), cy: cur.cy + 0.7 * (cur.cy - prev.cy) };
  }

  // Pick our skater out of the people the AI found in the window.
  //   boxes  = a box for each person found
  //   guess  = where we expect our skater ({ cx, cy })
  //   last   = our skater's last box (for the size check)
  //   misses = how many pictures in a row we failed to find them
  // Returns the position in the list, or -1 if nobody fits.
  function pickCandidate(boxes, guess, last, misses) {
    // The longer we have lost the skater, the less picky we are.
    var smallest = Math.max(0.4, 0.55 - 0.03 * misses);
    var biggest = Math.min(2.6, 1.8 + 0.1 * misses);
    var reach = Math.min(4, 1.2 + 0.3 * misses) * Math.max(last.h, last.w);
    var best = -1, bestDist = Infinity;
    boxes.forEach(function (b, i) {
      var ratio = b.h / Math.max(1, last.h);
      if (ratio < smallest || ratio > biggest) return;       // wrong size
      var d = Math.sqrt((b.cx - guess.cx) * (b.cx - guess.cx) + (b.cy - guess.cy) * (b.cy - guess.cy));
      if (d > reach) return;                                   // too far away
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }

  // Which person did you click on? The closest one whose box (made a
  // little bigger) has the click inside it. -1 if you clicked on nobody.
  function pickClicked(boxes, x, y) {
    var best = -1, bestDist = Infinity;
    boxes.forEach(function (b, i) {
      var inside = Math.abs(x - b.cx) <= b.w * 0.5 * 1.3 + 4 && Math.abs(y - b.cy) <= b.h * 0.5 * 1.3 + 4;
      if (!inside) return;
      var d = Math.sqrt((b.cx - x) * (b.cx - x) + (b.cy - y) * (b.cy - y));
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }

  // The list of video times to look at: every "gap" seconds, lined up so
  // that the moment you clicked (seedTime) is exactly one of them.
  function sampleTimes(duration, gap, seedTime) {
    var times = [], first = seedTime - Math.floor(seedTime / gap) * gap;
    if (first < 0.005) first += gap;
    for (var t = first; t < duration - 0.02; t += gap) times.push(Math.round(t * 1000) / 1000);
    // Which one is the click moment?
    var seedIndex = 0;
    times.forEach(function (t, i) { if (Math.abs(t - seedTime) < Math.abs(times[seedIndex] - seedTime)) seedIndex = i; });
    return { times: times, seedIndex: seedIndex };
  }

  // ---- Did the camera jump? ----
  // If the video cuts to a new scene, or the camera swings fast to
  // somewhere else, the skater we were following is gone. If we kept
  // going, we would grab whoever is standing in the new picture.
  // So we keep a tiny gray copy of each picture (like 32 x 18 dots) and
  // compare it with the one before.

  // How different are two tiny gray pictures? Each is a list of
  // brightness numbers from 0 to 255. Returns 0 (the same) to 1.
  function pictureChange(a, b) {
    if (!a || !b || a.length !== b.length || !a.length) return 0;
    var total = 0;
    for (var i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
    return total / a.length / 255;
  }

  // changes = the picture changes so far, newest last.
  // The camera jumped if the newest change is huge, or if the last
  // three changes are all big (a fast swing). The numbers come from
  // measuring a real handheld clip: normal following stays below 0.10,
  // a fast swing to another spot stays above 0.11 for a second.
  //   gap = seconds between pictures (pictures farther apart change more)
  function cameraJumped(changes, gap) {
    var n = changes.length;
    if (!n) return false;
    var more = Math.sqrt(Math.max(1, (gap || 0.05) / 0.05));
    if (changes[n - 1] > 0.15 * more) return true;
    if (n < 3) return false;
    return (changes[n - 1] + changes[n - 2] + changes[n - 3]) / 3 > 0.11 * more;
  }

  var api = {
    clamp: clamp, boxOf: boxOf, cropWindow: cropWindow, windowSize: windowSize,
    predict: predict, pickCandidate: pickCandidate, pickClicked: pickClicked, sampleTimes: sampleTimes,
    pictureChange: pictureChange, cameraJumped: cameraJumped
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachTracker = api;
})(typeof window !== "undefined" ? window : globalThis);
