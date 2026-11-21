/* =====================================================================
   chart.js  --  THE CURVE IN THE REPORT
   The replay used to be rows of colored blocks. Now it is ONE line:
   the angle in every picture of the session, drawn over a green band.
   The band is the target for the skater's age. Where the line is
   inside the band, the skater is on target.

   The line paints itself by its height: green inside the band, yellow
   a little outside, red far outside. So the color is always right,
   also between two pictures.

   Part 1 is the math (checked in tests/chart.test.js).
   Part 2 draws the curve on the page.
   ===================================================================== */
(function () {
  "use strict";

  // ---------- 1. The math ----------------------------------------------

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // The lowest and the highest angle the chart must show: every value,
  // and the whole target with its yellow zone, with a little room, and
  // rounded to tens so the chart does not jump around.
  //   values = the angles, range = { min, max } of the target,
  //   zone   = how many degrees outside the target still count as "close"
  function bounds(values, range, zone) {
    var lo = range.min - zone, hi = range.max + zone;
    values.forEach(function (v) {
      if (typeof v !== "number" || !isFinite(v)) return;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    });
    return { lo: Math.floor((lo - 3) / 10) * 10, hi: Math.ceil((hi + 3) / 10) * 10 };
  }

  // How high on the chart is this angle? A bigger angle sits higher.
  //   b = the bounds; top and bottom = the chart's edges in pixels
  function yOf(value, b, top, bottom) {
    var part = clamp((value - b.lo) / (b.hi - b.lo), 0, 1);
    return bottom - part * (bottom - top);
  }

  // Each picture gets a slot of the same width. xOf is the middle of
  // slot number i (of n), between the chart's left and right edge.
  function xOf(i, n, left, right) {
    return left + (i + 0.5) / n * (right - left);
  }

  // The other way around: which picture is under this x? (For a finger
  // or a mouse on the chart.) Outside the chart = the first or the last.
  function indexAt(x, n, left, right) {
    return clamp(Math.floor((x - left) / Math.max(1, right - left) * n), 0, n - 1);
  }

  // A real video has holes: moments that were left out. The line must
  // not be drawn across a hole. runs() cuts the pictures into pieces
  // without a hole: [[0, 12], [13, 40]] = two pieces.
  //   times = the seconds of each picture; hole = a gap longer than this
  function runs(times, hole) {
    var list = [], start = 0;
    for (var i = 1; i <= times.length; i++) {
      if (i === times.length || times[i] - times[i - 1] > hole) {
        list.push([start, i - 1]);
        start = i;
      }
    }
    return times.length ? list : [];
  }

  // The words that tell the browser to draw the line: "M" = move the
  // pen here, "L" = draw a line to here. One "M" for each piece.
  //   points = [{ x, y }, ...]; pieces = from runs()
  function linePath(points, pieces) {
    var d = "";
    pieces.forEach(function (piece) {
      for (var i = piece[0]; i <= piece[1]; i++) {
        d += (i === piece[0] ? "M" : "L") + points[i].x.toFixed(1) + "," + points[i].y.toFixed(1);
        // A piece of one single picture would be invisible: make it a short dash.
        if (piece[0] === piece[1]) d += "h0.1";
      }
    });
    return d;
  }

  // The paint of the line, from the top of the chart to the bottom.
  // Gives back stripes: { from, to, grade }, where from and to are how
  // far down the chart the stripe starts and ends (0 = top, 1 = bottom).
  function gradeStripes(b, range, zone) {
    function down(value) { return clamp((b.hi - value) / (b.hi - b.lo), 0, 1); }
    var edges = [
      { to: down(range.max + zone), grade: "far" },     // far too big
      { to: down(range.max), grade: "close" },          // a little too big
      { to: down(range.min), grade: "good" },           // inside the target
      { to: down(range.min - zone), grade: "close" },   // a little too small
      { to: 1, grade: "far" }                           // far too small
    ];
    var list = [], from = 0;
    edges.forEach(function (e) {
      if (e.to > from) list.push({ from: from, to: e.to, grade: e.grade });
      from = Math.max(from, e.to);
    });
    return list;
  }

  var api = { bounds: bounds, yOf: yOf, xOf: xOf, indexAt: indexAt, runs: runs, linePath: linePath, gradeStripes: gradeStripes };
  // In node (the tests) there is no page, so we stop here.
  if (typeof document === "undefined") { module.exports = api; return; }

  // ---------- 2. Drawing the curve on the page -------------------------
  var NS = "http://www.w3.org/2000/svg";
  function shape(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function box(className, parent) {
    var e = document.createElement("div");
    e.className = className;
    parent.appendChild(e);
    return e;
  }

  // Room around the plot: the target's numbers stand on the left, the
  // little push marks along the bottom.
  var LEFT = 40, RIGHT = 10, TOP = 12, BOTTOM = 20;

  // Make a curve inside "home" (an empty box on the page).
  //   The picture has three layers:
  //   back  = the green band and its numbers
  //   front = the line (it sits behind a "curtain" that slides away, so
  //           the line seems to draw itself from left to right)
  //   now   = the thin marker for the moment the replay is showing
  function Curve(home) {
    this.home = home;
    home.textContent = "";
    this.back = shape("svg", { class: "curve-back", "aria-hidden": "true" }, home);
    this.front = shape("svg", { class: "curve-front", "aria-hidden": "true" }, box("curve-wipe-in", box("curve-wipe", home)));
    this.now = box("curve-now", home);
    this.dot = box("curve-dot", this.now);
    this.tag = box("curve-tag num", this.now);
    this.data = null;
    this.w = 0;
  }

  // Show these numbers.
  //   data = {
  //     values: the angle in every picture,
  //     times: the seconds of every picture, hole: a gap longer than this is a hole,
  //     range: { min, max } the target, zone: the yellow zone in degrees,
  //     graded: true = the line is painted green / yellow / red by its height,
  //     rough: (optional) true for pictures whose number is only rough,
  //     peaks: [{ i, grade }] the top of each push,
  //     peaksOnLine: true = draw the push marks on the line as well
  //   }
  Curve.prototype.set = function (data) {
    this.data = data;
    var home = this.home, n = data.values.length;
    var w = this.w = home.clientWidth || 600, h = this.h = home.clientHeight || 150;
    var left = LEFT, right = w - RIGHT, top = TOP, bottom = h - BOTTOM;
    var b = this.b = bounds(data.values, data.range, data.zone);
    [this.back, this.front].forEach(function (svg) {
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      svg.textContent = "";
    });

    // --- back: the green band (the target) with its two numbers ---
    var yMax = yOf(data.range.max, b, top, bottom), yMin = yOf(data.range.min, b, top, bottom);
    shape("rect", { x: left, y: top, width: right - left, height: bottom - top, rx: 4, class: "curve-plot" }, this.back);
    shape("rect", { x: left, y: yMax, width: right - left, height: Math.max(1, yMin - yMax), class: "curve-band" }, this.back);
    [yMax, yMin].forEach(function (y) {
      shape("line", { x1: left, y1: y, x2: right, y2: y, class: "curve-band-edge" }, this.back);
    }, this);
    // (If the band is very thin, the two numbers would sit on top of each other.)
    var apart = yMin - yMax >= 15;
    var hi = shape("text", { x: left - 7, y: yMax + (apart ? 4 : -2), class: "curve-label" }, this.back);
    hi.textContent = data.range.max + "°";
    var lo = shape("text", { x: left - 7, y: yMin + (apart ? 4 : 10), class: "curve-label" }, this.back);
    lo.textContent = data.range.min + "°";
    // A dotted line where moments were left out in between.
    var pieces = this.pieces = runs(data.times, data.hole);
    pieces.slice(1).forEach(function (piece) {
      var x = left + piece[0] / n * (right - left);
      shape("line", { x1: x, y1: top, x2: x, y2: bottom, class: "curve-hole" }, this.back);
    }, this);

    // --- front: the line ---
    var points = this.points = data.values.map(function (v, i) {
      return { x: xOf(i, n, left, right), y: yOf(v, b, top, bottom) };
    });
    var paint = "";
    if (data.graded) {
      // The paint: stripes of green, yellow and red, by height.
      var grad = shape("linearGradient", { id: "curve-paint", gradientUnits: "userSpaceOnUse", x1: 0, y1: top, x2: 0, y2: bottom },
        shape("defs", {}, this.front));
      gradeStripes(b, data.range, data.zone).forEach(function (s) {
        shape("stop", { offset: s.from, class: "stop-" + s.grade }, grad);
        shape("stop", { offset: s.to, class: "stop-" + s.grade }, grad);
      });
      paint = "url(#curve-paint)";
    }
    var line = shape("path", { d: linePath(points, pieces), class: "curve-line" + (data.graded ? "" : " plain") }, this.front);
    if (paint) line.setAttribute("stroke", paint);
    // Pictures with only a rough number (not seen from the side) are faded.
    if (data.rough) {
      var slot = (right - left) / n;
      for (var i = 0; i < n; i++) {
        if (!data.rough[i]) continue;
        var end = i;
        while (end + 1 < n && data.rough[end + 1]) end++;
        shape("rect", { x: left + i * slot, y: top, width: (end - i + 1) * slot, height: bottom - top, class: "curve-rough" }, this.front);
        i = end;
      }
    }
    // The top of each push: a small mark along the bottom, and (for the
    // push itself) a dot on the line.
    (data.peaks || []).forEach(function (p) {
      var x = points[p.i].x, y = bottom + 5;
      shape("path", { d: "M" + x + "," + y + "l4.5,8h-9z", class: "curve-peak " + p.grade }, this.front);
      if (data.peaksOnLine) shape("circle", { cx: x, cy: points[p.i].y, r: 4.5, class: "curve-peak on-line " + p.grade }, this.front);
    }, this);
    if (data.peaks && data.peaks.length) {
      var word = shape("text", { x: left - 7, y: bottom + 13, class: "curve-label quiet" }, this.back);
      word.textContent = "PUSH";
    }
  };

  // Put the marker on the moment the replay is showing.
  //   i = which picture, blend = how far toward the next one (0 to 1)
  // (No sliding animation here: this runs many times a second while the
  //  replay plays, and it must follow the finger exactly when you drag.)
  Curve.prototype.cursor = function (i, blend) {
    var d = this.data, p = this.points;
    if (!d || !p || !p.length) return;
    i = clamp(i, 0, p.length - 1);
    var x = p[i].x, y = p[i].y, value = d.values[i];
    var sameRun = i + 1 < p.length && d.times[i + 1] - d.times[i] <= d.hole;
    if (blend > 0 && sameRun) {
      x += (p[i + 1].x - x) * blend;
      y += (p[i + 1].y - y) * blend;
      value += (d.values[i + 1] - value) * blend;
    }
    this.now.style.transform = "translateX(" + x.toFixed(1) + "px)";
    this.dot.style.transform = "translateY(" + y.toFixed(1) + "px)";
    // The number tag stays inside the chart: near the right edge it flips to the left.
    var flip = x > this.w - 64, low = y > this.h - BOTTOM - 26;
    this.tag.style.transform = "translate(" + (flip ? "-100%" : "0") + ", " + (y + (low ? -30 : 8)).toFixed(1) + "px)";
    this.tag.classList.toggle("flip", flip);
    var words = Math.round(value) + "°";
    if (this.tag.textContent !== words) this.tag.textContent = words;
  };

  // Which picture is under the mouse or the finger?
  Curve.prototype.indexFrom = function (ev) {
    var r = this.home.getBoundingClientRect();
    return indexAt(ev.clientX - r.left, this.data ? this.data.values.length : 1, LEFT, r.width - RIGHT);
  };

  // Close the curtain (the line is hidden), or open it (the line draws
  // itself from left to right).
  Curve.prototype.shut = function () { this.home.classList.add("shut"); };
  Curve.prototype.open = function () {
    void this.home.offsetWidth;   // the page notes "shut" first, then it opens
    this.home.classList.remove("shut");
  };

  api.Curve = Curve;
  window.CoachChart = api;
})();
