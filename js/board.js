// =====================================================================
//  board.js  --  THE POSITIONING BOARD
//
//  This draws half a hockey rink from above, like a coach's whiteboard.
//  You pick a situation and your position, drag your marker to where
//  you think you should stand, and the board checks your spot.
//
//  The playbook itself (where everyone should go) is in positions.js.
//
//  The rink is drawn with SVG. SVG is a way to draw with shapes
//  (lines, circles) that stay sharp at any size. We draw in FEET, so
//  1 unit on the drawing = 1 foot on the ice.
// =====================================================================
(function () {
  "use strict";
  var P = window.CoachPositions;
  var svg = document.getElementById("board");
  if (!P || !svg) return;

  var NS = "http://www.w3.org/2000/svg";
  var W = P.RINK.width;   // 85 feet across
  var H = 100;            // we show 100 feet of the rink's length

  function $(id) { return document.getElementById(id); }
  var el = {
    situation: $("pos-situation"), summary: $("pos-summary"),
    check: $("pos-check"), answer: $("pos-answer"), next: $("pos-next"),
    result: $("pos-result"), grade: $("pos-grade"), feet: $("pos-feet"), job: $("pos-job"),
    tally: $("pos-tally"), roleName: $("pos-role-name")
  };

  // What the board remembers.
  var state = {
    id: P.SITUATIONS[0].id,
    side: "left",
    role: "C",
    guess: { a: 42.5, d: 60 }, // where your marker is now (feet)
    revealed: false,           // are we showing the answer?
    checked: 0,                // how many spots you have checked
    onTarget: 0                // how many were on target
  };

  // ---------- Small helpers for drawing ------------------------------
  // Make one SVG shape. attrs = { name: value, ... }
  function shape(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    (parent || svg).appendChild(e);
    return e;
  }
  function words(text, attrs, parent) {
    var e = shape("text", attrs, parent);
    e.textContent = text;
    return e;
  }

  // Turn rink feet into a place on the drawing.
  //   Defending: our net is at the BOTTOM.   Attacking: their net is at the TOP.
  // Either way "up the ice" is up the screen, so left is left.
  function toScreen(p, zone) {
    var range = P.viewRange(zone);
    return { x: p.a, y: range.to - p.d };
  }
  function toRink(x, y, zone) {
    var range = P.viewRange(zone);
    return { a: x, d: range.to - y };
  }

  // ---------- Drawing the rink ---------------------------------------
  function drawRink(zone, layer) {
    var attacking = zone === "off";
    // The outline: round corners at the end with the net.
    var outline = attacking
      ? "M0,100 V28 A28,28 0 0 1 28,0 H57 A28,28 0 0 1 85,28 V100 Z"
      : "M0,0 H85 V72 A28,28 0 0 1 57,100 H28 A28,28 0 0 1 0,72 Z";
    shape("path", { d: outline, class: "ice" }, layer);

    var goalY = attacking ? 11 : 89;     // goal line
    var blueY = attacking ? 75 : 25;     // blue line
    var centerY = attacking ? 100 : 0;   // red center line (at the edge of the picture)
    var circleY = attacking ? 31 : 69;   // end-zone faceoff circles
    var dotY = attacking ? 80 : 20;      // neutral-zone faceoff dots
    var out = attacking ? -1 : 1;        // which way is "behind the net"

    // Center circle (we only see half of it) and center line.
    shape("circle", { cx: 42.5, cy: centerY, r: 15, class: "line-blue thin" }, layer);
    shape("line", { x1: 0, y1: centerY, x2: W, y2: centerY, class: "line-red wide" }, layer);
    // Blue line.
    shape("line", { x1: 0, y1: blueY, x2: W, y2: blueY, class: "line-blue wide" }, layer);
    // Goal line (it stops where the round corners begin).
    shape("line", { x1: 5.8, y1: goalY, x2: 79.2, y2: goalY, class: "line-red thin" }, layer);

    // Faceoff circles, dots and hash marks.
    [20.5, 64.5].forEach(function (cx) {
      shape("circle", { cx: cx, cy: circleY, r: 15, class: "line-red thin" }, layer);
      shape("circle", { cx: cx, cy: circleY, r: 1, class: "dot-red" }, layer);
      shape("circle", { cx: cx, cy: dotY, r: 1, class: "dot-red" }, layer);
      [-15, 15].forEach(function (dx) {
        var x = cx + dx, sign = dx < 0 ? -1 : 1;
        shape("line", { x1: x, y1: circleY - 2, x2: x + sign * 2, y2: circleY - 2, class: "line-red thin" }, layer);
        shape("line", { x1: x, y1: circleY + 2, x2: x + sign * 2, y2: circleY + 2, class: "line-red thin" }, layer);
      });
    });

    // The crease (the goalie's blue half circle) and the net.
    var sweep = attacking ? 0 : 1;
    shape("path", {
      d: "M36.5," + goalY + " A6,6 0 0 " + sweep + " 48.5," + goalY + " Z", class: "crease"
    }, layer);
    shape("rect", { x: 39.5, y: attacking ? goalY - 3.4 : goalY, width: 6, height: 3.4, class: "net" }, layer);

    // Little labels so you know which way is which.
    words(attacking ? "THEIR NET" : "OUR NET", { x: 42.5, y: goalY + out * 8.4 + 0.9, class: "rink-note" }, layer);
    words(attacking ? "THEIR BLUE LINE" : "OUR BLUE LINE", { x: 83, y: blueY - 1.6, class: "rink-note end" }, layer);
  }

  // ---------- Drawing the players ------------------------------------
  function drawMarker(layer, at, label, className) {
    var g = shape("g", { class: "marker " + className, transform: "translate(" + at.x + "," + at.y + ")" }, layer);
    shape("circle", { r: 3.1 }, g);
    words(label, { y: 0.95 }, g);
    return g;
  }

  var youMarker = null;

  function draw() {
    var sit = P.getSituation(state.id, state.side);
    svg.textContent = "";
    var rink = shape("g", {});
    drawRink(sit.zone, rink);

    // The answer ring (only after you check or ask for the answer).
    if (state.revealed) {
      var ideal = toScreen(sit.spots[state.role], sit.zone);
      shape("circle", { cx: ideal.x, cy: ideal.y, r: P.CLOSE_FEET, class: "zone-close" });
      shape("circle", { cx: ideal.x, cy: ideal.y, r: P.GOOD_FEET, class: "zone-good" });
      var you = toScreen(state.guess, sit.zone);
      shape("line", { x1: you.x, y1: you.y, x2: ideal.x, y2: ideal.y, class: "measure" });
    }

    // The puck, and the opponent who has it (when they do).
    var puck = toScreen(sit.puck, sit.zone);
    // (Drawn first, so our own players sit on top if they are close.)
    if (sit.opponentHasPuck) drawMarker(rink, puck, "X", "opp");
    var puckDot = shape("circle", { cx: puck.x, cy: puck.y, r: 1.3, class: "puck" });

    // Teammates stand on their correct spots.
    P.ROLES.forEach(function (role) {
      if (role === state.role) return;
      drawMarker(svg, toScreen(sit.spots[role], sit.zone), role, "mate");
    });

    svg.appendChild(puckDot); // keep the puck visible on top of the players

    // Your marker goes on top so you can always grab it.
    youMarker = drawMarker(svg, toScreen(state.guess, sit.zone), state.role, "you");
    youMarker.setAttribute("tabindex", "0");
    youMarker.setAttribute("role", "button");
    youMarker.setAttribute("aria-label", "Your marker (" + P.ROLE_NAMES[state.role] +
      "). Drag it, or use the arrow keys, to where you should stand.");

    el.summary.textContent = sit.summary;
    el.roleName.textContent = P.ROLE_NAMES[state.role];
  }

  // ---------- Checking your spot -------------------------------------
  var GRADE_WORDS = { good: "On target", close: "Close", far: "Out of position" };

  function showResult(counts) {
    var sit = P.getSituation(state.id, state.side);
    var r = P.checkSpot(sit, state.role, state.guess);
    // A check only counts the first time (not after you have seen the
    // answer, and not when you press Check again without a new try).
    if (counts && !state.revealed) {
      state.checked++;
      if (r.grade === "good") state.onTarget++;
    }
    state.revealed = true;
    el.result.hidden = false;
    el.result.className = "pos-result " + (counts ? r.grade : "shown");
    el.grade.textContent = counts ? GRADE_WORDS[r.grade] : "Answer";
    el.feet.textContent = counts
      ? Math.round(r.feet) + " ft from the ideal spot"
      : "The rings show the ideal spot";
    el.job.textContent = r.job;
    el.tally.textContent = state.checked
      ? state.onTarget + " of " + state.checked + " on target"
      : "No spots checked yet";
    draw();
  }

  function reset(keepGuess) {
    var sit = P.getSituation(state.id, state.side);
    var range = P.viewRange(sit.zone);
    state.revealed = false;
    // Start your marker in a neutral place, in the middle of the picture.
    if (!keepGuess) state.guess = { a: 42.5, d: (range.from + range.to) / 2 + (sit.zone === "off" ? -8 : 8) };
    el.result.hidden = true;
    draw();
  }

  // ---------- Dragging your marker -----------------------------------
  var dragging = false;

  // Where on the rink (in feet) is the pointer?
  function pointerToRink(ev) {
    var pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    var m = svg.getScreenCTM();
    if (!m) return null;
    var local = pt.matrixTransform(m.inverse());
    var sit = P.getSituation(state.id, state.side);
    return toRink(Math.max(2, Math.min(W - 2, local.x)), Math.max(2, Math.min(H - 2, local.y)), sit.zone);
  }
  function moveTo(spot) {
    if (!spot) return;
    state.guess = spot;
    if (state.revealed) { state.revealed = false; el.result.hidden = true; draw(); return; }
    var sit = P.getSituation(state.id, state.side), at = toScreen(spot, sit.zone);
    youMarker.setAttribute("transform", "translate(" + at.x + "," + at.y + ")");
  }

  svg.addEventListener("pointerdown", function (ev) {
    dragging = true;
    if (svg.setPointerCapture) { try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* fine */ } }
    moveTo(pointerToRink(ev));
    ev.preventDefault();
  });
  svg.addEventListener("pointermove", function (ev) { if (dragging) moveTo(pointerToRink(ev)); });
  function stopDrag() { dragging = false; }
  svg.addEventListener("pointerup", stopDrag);
  svg.addEventListener("pointercancel", stopDrag);

  // Arrow keys move the marker 2 feet at a time. Enter checks the spot.
  svg.addEventListener("keydown", function (ev) {
    var step = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, 2], ArrowDown: [0, -2] }[ev.key];
    if (step) {
      ev.preventDefault();
      var range = P.viewRange(P.getSituation(state.id, state.side).zone);
      moveTo({
        a: Math.max(2, Math.min(W - 2, state.guess.a + step[0])),
        d: Math.max(range.from + 2, Math.min(range.to - 2, state.guess.d + step[1]))
      });
      if (youMarker) youMarker.focus();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      showResult(true);
    }
  });

  // ---------- Buttons and choosers -----------------------------------
  P.SITUATIONS.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.id; o.textContent = s.name;
    el.situation.appendChild(o);
  });
  el.situation.addEventListener("change", function () { state.id = el.situation.value; reset(); });

  // A row of buttons where exactly one is "pressed".
  function segment(attr, key) {
    var buttons = document.querySelectorAll("[" + attr + "]");
    function sync() {
      Array.prototype.forEach.call(buttons, function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute(attr) === state[key]));
      });
    }
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener("click", function () { state[key] = b.getAttribute(attr); sync(); reset(); });
    });
    sync();
  }
  segment("data-side", "side");
  segment("data-role", "role");

  el.check.addEventListener("click", function () { showResult(true); });
  el.answer.addEventListener("click", function () { showResult(false); });
  el.next.addEventListener("click", function () {
    var i = P.SITUATIONS.map(function (s) { return s.id; }).indexOf(state.id);
    state.id = P.SITUATIONS[(i + 1) % P.SITUATIONS.length].id;
    el.situation.value = state.id;
    reset();
  });

  el.tally.textContent = "No spots checked yet";
  reset();
})();
