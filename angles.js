// =====================================================================
//  angles.js  -  The math part of Angle Coach
// =====================================================================
//
//  This file does the "measuring with a protractor" part, but with
//  numbers instead of a real protractor.
//
//  The AI gives us dots (called "landmarks") for body parts, like
//  "your left knee is here". Each dot has an x (how far across the
//  picture) and a y (how far DOWN the picture).
//
//  IMPORTANT picture fact: on a computer screen, y gets BIGGER as you
//  go DOWN. That is upside-down from graph paper in math class!
//
//  This file works in two places:
//    1. In the web page (it puts its tools on window.AngleMath)
//    2. In Node, for our little test (it uses module.exports)
// =====================================================================

(function () {
  // -------------------------------------------------------------------
  //  Turn radians into degrees.
  //  Computers measure turning in "radians". A full circle is about
  //  6.28 radians, but we know it as 360 degrees. So we convert.
  // -------------------------------------------------------------------
  function toDegrees(radians) {
    return (radians * 180) / Math.PI;
  }

  // -------------------------------------------------------------------
  //  angleAt(a, b, c)
  //  The angle at the MIDDLE dot b, made by the lines b->a and b->c.
  //
  //  Example: a = hip, b = knee, c = ankle gives the knee angle.
  //    - A straight leg is about 180 degrees.
  //    - A deep squat is about 90 degrees (like the corner of a book).
  //
  //  How it works: we make two arrows that start at b. The "dot
  //  product" tells us how much the arrows point the same way. Then
  //  "arc-cosine" turns that into an angle between 0 and 180.
  // -------------------------------------------------------------------
  function angleAt(a, b, c) {
    // Arrow 1 goes from b to a.
    const ux = a.x - b.x;
    const uy = a.y - b.y;
    // Arrow 2 goes from b to c.
    const vx = c.x - b.x;
    const vy = c.y - b.y;

    // How long is each arrow?
    const lenU = Math.hypot(ux, uy);
    const lenV = Math.hypot(vx, vy);

    // If two dots are on top of each other, there is no angle to measure.
    if (lenU === 0 || lenV === 0) return NaN;

    // Dot product divided by both lengths gives the cosine of the angle.
    let cos = (ux * vx + uy * vy) / (lenU * lenV);

    // Tiny rounding errors can make this 1.0000001, which breaks acos,
    // so we keep it between -1 and 1.
    cos = Math.max(-1, Math.min(1, cos));

    return toDegrees(Math.acos(cos));
  }

  // -------------------------------------------------------------------
  //  leanFromVertical(top, bottom)
  //  How far a body line tips away from standing straight up.
  //
  //  We use top = shoulders and bottom = hips.
  //    - Standing tall = 0 degrees.
  //    - Lying flat    = 90 degrees.
  //  It does not matter if you lean left or right in the picture;
  //  we only care HOW MUCH you lean.
  // -------------------------------------------------------------------
  function leanFromVertical(top, bottom) {
    // "Straight up" on a screen means y goes DOWN (smaller), so the
    // straight-up arrow is (0, -1). We pretend there is a dot right
    // above the hips and measure the angle at the hips.
    const straightUp = { x: bottom.x, y: bottom.y - 1 };
    return angleAt(straightUp, bottom, top);
  }

  // -------------------------------------------------------------------
  //  midpoint(p, q)
  //  The spot exactly halfway between two dots.
  //  We use it to find the "middle of the hips" and "middle of the
  //  shoulders" from the left and right dots.
  // -------------------------------------------------------------------
  function midpoint(p, q) {
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  }

  // -------------------------------------------------------------------
  //  distance(p, q)
  //  How far apart two dots are (a straight ruler line).
  // -------------------------------------------------------------------
  function distance(p, q) {
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  // -------------------------------------------------------------------
  //  median(list)
  //  The middle number when you line the numbers up from small to big.
  //  We use the middle instead of the average because one silly frame
  //  (where the AI got confused) can't pull the middle very far.
  // -------------------------------------------------------------------
  function median(list) {
    const nums = list.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (nums.length === 0) return NaN;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  // -------------------------------------------------------------------
  //  scoreInRange(value, range, pointsPerDegree)
  //  Gives 0 to 100 points for one measurement.
  //    - Inside the target range: 100 points!
  //    - Outside: lose some points for every degree you are away.
  //  Default: lose 3 points per degree, so 10 degrees off = 70 points.
  // -------------------------------------------------------------------
  function scoreInRange(value, range, pointsPerDegree) {
    if (!Number.isFinite(value)) return NaN;
    const perDegree = pointsPerDegree === undefined ? 3 : pointsPerDegree;
    let degreesOff = 0;
    if (value < range.min) degreesOff = range.min - value;
    if (value > range.max) degreesOff = value - range.max;
    return Math.max(0, Math.round(100 - degreesOff * perDegree));
  }

  // -------------------------------------------------------------------
  //  whereIs(value, range)
  //  Says if a number is "low", "good" or "high" compared to its range.
  //  The tips use this to decide what to say.
  // -------------------------------------------------------------------
  function whereIs(value, range) {
    if (!Number.isFinite(value)) return "unknown";
    if (value < range.min) return "low";
    if (value > range.max) return "high";
    return "good";
  }

  // Put all our tools in one toolbox.
  const AngleMath = {
    toDegrees,
    angleAt,
    leanFromVertical,
    midpoint,
    distance,
    median,
    scoreInRange,
    whereIs,
  };

  // Share the toolbox with Node (for tests) or with the web page.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AngleMath;
  } else {
    window.AngleMath = AngleMath;
  }
})();
