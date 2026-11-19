/*
 * angles.js  --  the MATH part of the coach. No camera, no web page, just numbers.
 *
 * A "landmark" is a dot the AI puts on your body (like a knee or a hip).
 * Each dot is { x, y } measured in pixels, with y getting BIGGER going DOWN the picture.
 * Everything here is plain JavaScript so we can also test it with Node.
 */
(function (root) {
  const toDeg = (rad) => (rad * 180) / Math.PI;

  // The angle at point b made by the lines b->a and b->c.
  // Example: a=hip, b=knee, c=ankle gives the KNEE angle.
  // 180 = leg perfectly straight. Smaller = knee more bent.
  function angleAt(a, b, c) {
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const len = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (len === 0) return null;                       // two dots on top of each other
    const cos = (v1x * v2x + v1y * v2y) / len;
    return toDeg(Math.acos(Math.max(-1, Math.min(1, cos))));  // clamp avoids tiny rounding errors
  }

  // How far the line from hip up to shoulder tips away from straight-up.
  // 0 = standing tall, 90 = lying flat. We don't care left vs right, only "how much".
  function leanFromVertical(shoulder, hip) {
    const dx = Math.abs(shoulder.x - hip.x);
    const dyUp = hip.y - shoulder.y;                  // positive when shoulder is above hip
    return toDeg(Math.atan2(dx, dyUp));
  }

  // Stride: the angle between the two legs, measured at the middle of the hips.
  // Bigger angle = legs spread wider = longer stride.
  function strideAngle(hipL, hipR, ankleL, ankleR) {
    const mid = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };
    return angleAt(ankleL, mid, ankleR);
  }

  // Give 100 points if the number is inside the good range [min, max].
  // Outside the range, lose points slowly: 0 points once you're `tolerance` degrees away.
  function scoreInRange(value, min, max, tolerance) {
    if (value === null || value === undefined) return null;
    const off = value < min ? min - value : value > max ? value - max : 0;
    return Math.max(0, Math.round(100 * (1 - off / tolerance)));
  }

  // Look up the targets for one kid. Older/younger kids and Beginner/Experienced
  // get different numbers, all stored in targets.json so kids can edit them.
  function targetsFor(targets, age, level) {
    const base = JSON.parse(JSON.stringify(targets.skating[level]));
    const adj = (targets.ageAdjust || []).find((a) => age >= a.minAge && age <= a.maxAge) || {};
    const add = adj.kneeAngleAdd || 0, scale = adj.strideScale || 1;
    base.kneeAngle.min += add; base.kneeAngle.max += add;
    base.strideAngle.min *= scale; base.strideAngle.max *= scale;
    return { skating: base, kneeAngleAdd: add };
  }

  // Count reps (squats/lunges) from a list of {t, knee, lean}.
  // A rep = knee bends below `down` degrees, then stands back up above `up` degrees.
  // For each rep we remember the deepest bend and how the back looked at the bottom.
  function findReps(series, opts) {
    const down = (opts && opts.down) || 140, up = (opts && opts.up) || 155;
    const reps = [];
    let cur = null;
    for (const s of series) {
      if (s.knee === null || s.knee === undefined) continue;
      if (!cur && s.knee < down) cur = { startT: s.t, bottomKnee: s.knee, bottomT: s.t, lean: s.lean };
      else if (cur) {
        if (s.knee < cur.bottomKnee) { cur.bottomKnee = s.knee; cur.bottomT = s.t; cur.lean = s.lean; }
        if (s.knee > up) { cur.endT = s.t; reps.push(cur); cur = null; }
      }
    }
    return reps;
  }

  // Does form get sloppy when heart rate is high?
  //  scorePoints: [{t, score}]   hrPoints: [{t, bpm}] sorted by t
  function interpolate(points, t) {
    if (!points.length) return null;
    if (t <= points[0].t) return t >= points[0].t - 30 ? points[0].bpm : null;
    const last = points[points.length - 1];
    if (t >= last.t) return t <= last.t + 30 ? last.bpm : null;
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i].t) {
        const p = points[i - 1], q = points[i];
        return p.bpm + ((q.bpm - p.bpm) * (t - p.t)) / (q.t - p.t || 1);
      }
    }
    return null;
  }

  function formVsHeartRate(scorePoints, hrPoints, age) {
    const pairs = scorePoints
      .map((s) => ({ t: s.t, score: s.score, bpm: interpolate(hrPoints, s.t) }))
      .filter((p) => p.bpm !== null && p.score !== null);
    if (pairs.length < 4) return { enough: false };
    const sorted = pairs.map((p) => p.bpm).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const avg = (arr) => (arr.length ? arr.reduce((s, p) => s + p.score, 0) / arr.length : null);
    const calm = pairs.filter((p) => p.bpm < median), high = pairs.filter((p) => p.bpm >= median);
    const calmAvg = avg(calm), highAvg = avg(high);
    const drop = calmAvg - highAvg;
    const roughMax = 220 - age;                       // a common rough guess of a top heart rate
    const peak = Math.max(...pairs.map((p) => p.bpm));
    const firstSloppy = high.find((p) => p.score < 60);
    return {
      enough: true, calmAvg, highAvg, drop, median, peak, roughMax,
      sloppy: drop >= 10,                             // 10+ points worse when heart is racing
      veryHigh: peak >= 0.9 * roughMax,
      firstSloppyTime: firstSloppy ? firstSloppy.t : null,
    };
  }

  const api = { angleAt, leanFromVertical, strideAngle, scoreInRange, targetsFor, findReps, interpolate, formVsHeartRate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoachMath = api;
})(this);
