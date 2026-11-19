// =====================================================================
//  rink.js  --  DRAWING THE WHOLE RINK FROM ABOVE
//
//  The Game tab and the Referee tab both need a rink. This file draws
//  it once for both, with SVG (shapes that stay sharp at any size).
//
//  We draw in FEET: inside the drawing, x = feet up the ice (0 to 200)
//  and y = feet across (0 to 85). So 1 unit = 1 foot.
//
//  The rink can lie on its side (wide screens: our net on the left) or
//  stand up (phones: our net at the bottom). Standing up is the same
//  drawing turned a quarter turn, so nothing else has to change.
//  It can also show just a part of the rink, "from" one depth "to"
//  another (for example only the end where the play happens).
// =====================================================================
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  // Make one SVG shape. attrs = { name: value, ... }
  function shape(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    parent.appendChild(e);
    return e;
  }
  function words(text, attrs, parent) {
    var e = shape("text", attrs, parent);
    e.textContent = text;
    return e;
  }

  // Draw the rink into an <svg>.
  //   opts.upright   true = stand the rink up (phones)
  //   opts.from, to  show only this part of the length (feet); default all
  //   opts.ours, opts.theirs   little labels at the two nets ("" = none)
  // Returns helpers for whoever draws the players on top.
  function build(svg, opts) {
    opts = opts || {};
    var upright = !!opts.upright;
    var from = opts.from || 0, to = opts.to || 200, long = to - from;
    svg.textContent = "";
    var whole = upright ? [0, 0, 85, long] : [from, 0, long, 85];
    svg.setAttribute("viewBox", whole.join(" "));
    var root = shape("g", upright ? { transform: "translate(0," + to + ") rotate(-90)" } : {}, svg);
    // Anything with letters on it is turned back, so it stays readable.
    function place(p) { return "translate(" + p.d + "," + p.a + ")" + (upright ? " rotate(90)" : ""); }

    var layer = shape("g", {}, root);
    shape("rect", { x: 0, y: 0, width: 200, height: 85, rx: 28, class: "ice" }, layer);
    // Center line and circle, blue lines, goal lines.
    shape("rect", { x: 99.5, y: 0, width: 1, height: 85, class: "fill-red" }, layer);
    shape("circle", { cx: 100, cy: 42.5, r: 15, class: "line-blue thin" }, layer);
    [74, 125].forEach(function (x) { shape("rect", { x: x, y: 0, width: 1, height: 85, class: "fill-blue" }, layer); });
    [11, 189].forEach(function (x) { shape("line", { x1: x, y1: 5.8, x2: x, y2: 79.2, class: "line-red thin" }, layer); });
    // Faceoff circles and dots.
    [20.5, 64.5].forEach(function (y) {
      [31, 169].forEach(function (x) {
        shape("circle", { cx: x, cy: y, r: 15, class: "line-red thin" }, layer);
        shape("circle", { cx: x, cy: y, r: 1, class: "dot-red" }, layer);
      });
      [80, 120].forEach(function (x) { shape("circle", { cx: x, cy: y, r: 1, class: "dot-red" }, layer); });
    });
    // The creases, the nets and the goalies.
    shape("path", { d: "M11,36.5 A6,6 0 0 1 11,48.5 Z", class: "crease" }, layer);
    shape("path", { d: "M189,36.5 A6,6 0 0 0 189,48.5 Z", class: "crease" }, layer);
    shape("rect", { x: 7.6, y: 39.5, width: 3.4, height: 6, class: "net" }, layer);
    shape("rect", { x: 189, y: 39.5, width: 3.4, height: 6, class: "net" }, layer);
    shape("circle", { cx: 13.2, cy: 42.5, r: 2, class: "goalie ours" }, layer);
    shape("circle", { cx: 186.8, cy: 42.5, r: 2, class: "goalie theirs" }, layer);
    // Little labels so you know which way is which.
    var ours = opts.ours === undefined ? "OUR NET" : opts.ours;
    var theirs = opts.theirs === undefined ? "THEIR NET" : opts.theirs;
    if (ours && from < 20) words(ours, { transform: place(upright ? { a: 42.5, d: 3.4 } : { a: 6, d: 24 }), class: "rink-note" }, layer);
    if (theirs) words(theirs, { transform: place(upright ? { a: 42.5, d: 197.8 } : { a: 6, d: 176 }), class: "rink-note" }, layer);

    // The shape of the ice, so rings and circles can be cut off at the boards.
    var clipId = (svg.id || "rink") + "-ice";
    shape("rect", { x: 0, y: 0, width: 200, height: 85, rx: 28 }, shape("clipPath", { id: clipId }, root));

    return {
      root: root, upright: upright, from: from, to: to, place: place, clip: "url(#" + clipId + ")",
      // Where on the rink (in feet) is the mouse or the finger?
      toRink: function (ev) {
        var m = root.getScreenCTM();
        if (!m) return null;
        var p = svg.createSVGPoint();
        p.x = ev.clientX; p.y = ev.clientY;
        var local = p.matrixTransform(m.inverse());
        return { a: Math.max(3, Math.min(82, local.y)), d: Math.max(3, Math.min(197, local.x)) };
      },
      // Zoom in on one spot, showing "across" feet of the rink's width
      // around it. Call with nothing to see the whole picture again.
      zoom: function (center, across) {
        if (!center) { svg.setAttribute("viewBox", whole.join(" ")); return; }
        var shortSide = across, longSide = across * long / 85;
        var w = upright ? shortSide : longSide, h = upright ? longSide : shortSide;
        var cx = upright ? center.a : center.d, cy = upright ? to - center.d : center.a;
        var x = Math.max(whole[0], Math.min(whole[0] + whole[2] - w, cx - w / 2));
        var y = Math.max(whole[1], Math.min(whole[1] + whole[3] - h, cy - h / 2));
        svg.setAttribute("viewBox", [x, y, w, h].join(" "));
      }
    };
  }

  window.CoachRink = { build: build, shape: shape, words: words };
})();
