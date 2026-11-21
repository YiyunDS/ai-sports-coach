// =====================================================================
//  game.js  --  THE SIMULATION GAME ON THE PAGE
//
//  This draws the whole rink from above and lets you play a shift:
//    * pick how the shift starts and which position you play,
//    * when you have the puck, pick a play (each one shows its chance),
//    * when you do not, drag your orange marker to where you should be
//      and press "Play on",
//    * watch what happens, read the play-by-play, keep the score.
//
//  The rules and the chances are in gamesim.js. This file only draws
//  and listens to your clicks.
//
//  We draw in FEET, like the positioning board. The rink lies on its
//  side on a wide screen (our net on the left) and stands up on a
//  phone (our net at the bottom).
// =====================================================================
(function () {
  "use strict";
  var G = window.CoachGame, P = window.CoachPositions, R = window.CoachRink;
  var svg = document.getElementById("game-rink");
  if (!G || !P || !R || !svg) return;
  var shape = R.shape, words = R.words;   // the drawing helpers from rink.js

  function $(id) { return document.getElementById(id); }
  var el = {
    start: $("game-start"), begin: $("game-new"), prompt: $("game-prompt"), choices: $("game-choices"),
    go: $("game-go"), call: $("game-call"), spot: $("game-spot"), spotGrade: $("game-spot-grade"), spotFeet: $("game-spot-feet"),
    spotTip: $("game-spot-tip"), hint: $("game-hint"), log: $("game-log"), us: $("game-us"), them: $("game-them"),
    info: $("game-info"), tally: $("game-tally"), result: $("game-result"),
    resultKind: $("game-result-kind"), resultText: $("game-result-text")
  };

  // What the game remembers.
  var game = null;          // the state from gamesim.js (null before the first shift)
  var role = "LD";          // the position you picked
  var dice = G.makeDice(Date.now());
  var target = null;        // where you dragged your marker for this beat
  var busy = false;         // true while a beat is being played out on screen
  var preview = null;       // the choice your mouse is over (drawn as a dotted line)
  var showRings = null;     // the best spot we are showing rings for (after a beat, or as a hint)
  var lastTrail = null;     // the path the puck took in the last beat (drawn as a thin line)

  var tall = window.matchMedia("(max-width: 700px)");
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  var rink = null;          // the rink drawing (from rink.js)
  var live = null;          // the layer with everything that moves

  function place(p) { return rink.place(p); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function mix(p, q, t) { return { a: p.a + (q.a - p.a) * t, d: p.d + (q.d - p.d) * t }; }
  function ease(t) { return t * t * (3 - 2 * t); }   // start gently, stop gently
  // A path as the drawing wants it: "x,y x,y x,y" (x = feet up the ice, y = feet across).
  function pathOf(spots) {
    return spots.map(function (p) { return p.d.toFixed(1) + "," + p.a.toFixed(1); }).join(" ");
  }

  // The rink lies on its side on a wide screen and stands up on a phone.
  // A phone is small, so there we only show the 120 feet of ice around
  // the play (like a TV camera following the puck). Then the markers are
  // big enough for a finger.
  var SHOW = 120;
  // Make sure these depths (feet up the ice) are in the picture. The
  // first one is the puck: it always is.
  function fit(depths) {
    var from = 0, to = 200;
    if (tall.matches) {
      var mid = (Math.min.apply(null, depths) + Math.max.apply(null, depths)) / 2;
      from = clamp(mid - SHOW / 2, depths[0] - SHOW + 14, depths[0] - 14);
      from = Math.round(clamp(from, 0, 200 - SHOW) / 5) * 5;
      to = from + SHOW;
    }
    if (rink && rink.from === from && rink.to === to && rink.upright === tall.matches) return;
    rink = R.build(svg, { upright: tall.matches, from: from, to: to });
    live = shape("g", {}, rink.root);
  }
  function fitToGame() { fit(game ? [game.puck.d, game.us[game.you].d] : [100]); }
  function build() {
    rink = null;
    fitToGame();
    draw();
  }

  // ---------- The players and the puck ---------------------------------
  function marker(at, label, className) {
    var g = shape("g", { class: "marker " + className, transform: place(at) }, live);
    shape("circle", { r: 3.1 }, g);
    words(label, { y: 0.95 }, g);
    return g;
  }
  var parts = null;   // the shapes on screen right now, so we can slide them

  // Draw everything that moves. "at" lets the animation say where things
  // are right now: { us, them, puck } (leave it out to use the game).
  function draw(at) {
    if (!live) return;
    live.textContent = "";
    parts = null;
    if (!game) return;
    at = at || { us: game.us, them: game.them, puck: game.puck };
    var mine = at.us[game.you];
    var myMove = !busy && !game.over && !G.youHavePuck(game);

    // Rings on the best spot (after a beat, or when the hint is on).
    var under = shape("g", { "clip-path": rink.clip }, live);
    if (showRings) {
      shape("circle", { cx: showRings.d, cy: showRings.a, r: G.CLOSE_FEET, class: "zone-close" }, under);
      shape("circle", { cx: showRings.d, cy: showRings.a, r: G.GOOD_FEET, class: "zone-good" }, under);
    }
    // How far you can skate in this beat.
    if (myMove) {
      var home = game.us[game.you];
      shape("circle", { cx: home.d, cy: home.a, r: G.REACH, class: "reach" }, under);
      if (target) shape("line", { x1: home.d, y1: home.a, x2: target.d, y2: target.a, class: "measure" }, under);
    }
    // The play your mouse is over.
    if (preview && !busy) {
      shape("line", { x1: at.puck.d, y1: at.puck.a, x2: preview.d, y2: preview.a, class: "preview" }, live);
    }

    // The puck's path: a thin line that grows behind the puck while the
    // beat plays, and stays (fainter) so you can see what just happened.
    var trail = shape("polyline", { class: "trail" + (busy ? "" : " done"), points: !busy && lastTrail ? pathOf(lastTrail) : "" }, live);

    parts = { us: {}, them: {}, trail: trail };
    P.ROLES.forEach(function (r) { parts.them[r] = marker(at.them[r], r, "opp"); });
    P.ROLES.forEach(function (r) { if (r !== game.you) parts.us[r] = marker(at.us[r], r, "mate"); });
    parts.us[game.you] = marker(mine, game.you, "you");
    // Standing still, the puck sits just beside whoever has it, so you can see both.
    // (Toward the middle of the rink, so it never ends up in the boards.)
    var puckAt = !busy && !game.over ? G.toward(at.puck, { a: 42.5, d: 100 }, 4) : at.puck;
    parts.puck = shape("circle", { cx: puckAt.d, cy: puckAt.a, r: 1.4, class: "puck" }, live);
    // A ring around whoever has the puck.
    if (!game.over && !busy) parts[game.owner][game.carrier].setAttribute("class",
      parts[game.owner][game.carrier].getAttribute("class") + " has-puck");
  }
  // Slide the shapes without redrawing them (used many times a second).
  function slide(at) {
    if (!parts) return;
    ["us", "them"].forEach(function (team) {
      P.ROLES.forEach(function (r) { parts[team][r].setAttribute("transform", place(at[team][r])); });
    });
    parts.puck.setAttribute("cx", at.puck.d);
    parts.puck.setAttribute("cy", at.puck.a);
    if (at.trail) parts.trail.setAttribute("points", pathOf(at.trail));
  }

  // ---------- The words around the rink --------------------------------
  var KIND = { pass: "Pass to ", carry: "Stickhandle ", shoot: "Shoot", dump: "Dump it into the corner" };
  var GRADE_WORDS = { good: "On target", close: "Close", far: "Out of position" };
  function percent(x) { return Math.round(x * 100) + "%"; }

  function addLog(text, className) {
    var li = document.createElement("li");
    li.textContent = text;
    if (className) li.className = className;
    el.log.insertBefore(li, el.log.firstChild);
    while (el.log.children.length > 40) el.log.removeChild(el.log.lastChild);
  }

  // The buttons for when you have the puck.
  function drawChoices() {
    el.choices.textContent = "";
    if (!game || game.over || busy || !G.youHavePuck(game)) return;
    G.options(game).forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "choice " + (o.kind === "shoot" ? "shot" : o.chance >= 0.7 ? "good" : o.chance >= 0.45 ? "close" : "far");
      var name = document.createElement("span"), odds = document.createElement("span");
      name.textContent = o.kind === "pass" ? KIND.pass + P.ROLE_NAMES[o.to].toLowerCase() + " (" + o.to + ")"
        : o.kind === "carry" ? KIND.carry + (o.toNet ? "to the net" : "up the ice") : KIND[o.kind];
      odds.className = "odds num";
      odds.textContent = (o.kind === "shoot" ? "goal " : o.kind === "dump" ? "we get it " : "") + percent(o.chance);
      b.appendChild(name); b.appendChild(odds);
      // Show on the rink where this play goes while the mouse is on it.
      var goesTo = o.kind === "pass" ? game.us[o.to] : o.kind === "shoot" ? G.GOAL
        : o.kind === "carry" ? G.carryTarget(game.puck) : { a: game.puck.a < 42.5 ? 9 : 76, d: 191 };
      function on() { preview = goesTo; draw(); }
      function off() { preview = null; draw(); }
      b.addEventListener("pointerenter", on); b.addEventListener("focus", on);
      b.addEventListener("pointerleave", off); b.addEventListener("blur", off);
      b.addEventListener("click", function () { play({ action: o.id }); });
      el.choices.appendChild(b);
    });
  }

  function refresh() {
    var has = !!game;
    el.us.textContent = has ? game.score.us : 0;
    el.them.textContent = has ? game.score.them : 0;
    el.info.textContent = has ? "Shift " + game.stats.shifts + " · beat " + Math.min(game.beat + (game.over ? 0 : 1), G.MAX_BEATS) + " of " + G.MAX_BEATS : "Pick a start and press Start shift";
    el.tally.textContent = has && game.stats.spots ? "Your spots: " + game.stats.onTarget + " of " + game.stats.spots + " on target" : "";
    el.begin.textContent = has ? (game.over ? "Next shift" : "Start over") : "Start shift";
    el.begin.className = !has || game.over ? "primary" : "";
    el.result.hidden = !(has && game.over);
    if (has && game.over) {
      // How the shift ended, said like the top of the skating report:
      // a small colored word, then the sentence.
      var kind = game.over.kind;
      el.result.className = "pos-result call-result " + (kind === "goal-us" ? "good" : kind === "goal-them" ? "far" : "close");
      el.resultKind.textContent = kind === "goal-us" ? "Goal" : kind === "goal-them" ? "Goal against" : kind === "offside" ? "Offside"
        : kind === "change" ? "Line change" : "Whistle";
      el.resultText.textContent = game.over.text;
    }
    var mine = has && !game.over && G.youHavePuck(game);
    el.go.hidden = !has || game.over || mine;
    el.go.disabled = busy;
    showCall();
    if (!has) el.prompt.textContent = "Choose how the shift starts and your position. Then the play begins.";
    else if (game.over) el.prompt.textContent = "The shift is over. Press Next shift to play again, or pick another start.";
    else if (busy) el.prompt.textContent = "Watch the play...";
    else if (mine) el.prompt.textContent = "You have the puck. Pick a play: the number is its chance to work. You can also tap a teammate to pass.";
    else if (game.owner === "us") el.prompt.textContent = "Our " + P.ROLE_NAMES[game.carrier].toLowerCase() + " has the puck. Drag your marker to where you should be. Then press Play on, or call for a pass if you are open.";
    else el.prompt.textContent = "They have the puck. Drag your marker to where you should defend, then press Play on.";
    drawChoices();
    if (!busy) fitToGame();
    draw();
  }

  // "Call for a pass" is there when a teammate has the puck. Its number
  // changes as you drag: it is the chance a pass to that spot arrives.
  function showCall() {
    var chance = game && !busy ? G.callChance(game, target) : null;
    el.call.hidden = chance === null;
    el.call.disabled = busy;
    if (chance !== null) el.call.textContent = "Call for a pass · " + percent(chance);
  }

  function showSpot() {
    var s = game && game.lastSpot;
    el.spot.hidden = !s;
    if (!s) return;
    el.spot.className = "pos-result " + s.grade;
    el.spotGrade.textContent = GRADE_WORDS[s.grade];
    el.spotFeet.textContent = Math.round(s.feet) + " ft from the best spot";
    el.spotTip.textContent = s.tip;
  }

  // ---------- Playing a beat -------------------------------------------
  function play(input) {
    if (!game || game.over || busy) return;
    var before = game, result = G.step(game, input, dice);
    var after = result.state;
    // Where everything is when the beat starts (you are already where you dragged to).
    var from = { us: JSON.parse(JSON.stringify(before.us)), them: before.them, puck: before.puck };
    if (!G.youHavePuck(before)) from.us[before.you] = G.toward(before.us[before.you], target || before.us[before.you], G.REACH);
    game = after;
    busy = true; target = null; preview = null; lastTrail = null;
    // Keep the whole beat in the picture: where the puck starts, where it goes, and you.
    fit([before.puck.d].concat(result.events.map(function (e) { return e.puck.d; }), [from.us[before.you].d]));
    showRings = after.lastSpot ? after.lastSpot.ideal : null;
    showSpot();
    refresh();
    animate(from, { us: after.us, them: after.them, puck: after.puck }, result.events, function () {
      busy = false;
      showRings = el.hint.checked ? hintSpot() : null;
      if (game.over) addLog(game.over.text, game.over.kind);
      refresh();
    });
  }

  // Show the beat: the puck follows what happened, step by step, while
  // the skaters glide to their new spots.
  function animate(from, to, events, done) {
    var said = -1, finished = false;
    function say(upTo) { while (said < upTo) { said++; addLog(events[said].text); } }
    // Every spot the puck went through in this beat.
    var stops = [from.puck].concat(events.map(function (e) { return e.puck; }));
    function finish() {
      if (finished) return;
      finished = true;
      say(events.length - 1);
      lastTrail = stops.length > 1 ? stops : null;
      done();
    }
    if (calm.matches || !events.length) { finish(); return; }
    // Each step takes longer when the puck travels farther.
    var spans = events.map(function (e, i) {
      return clamp(260 + 7 * P.feetBetween(i ? events[i - 1].puck : from.puck, e.puck), 420, 950);
    });
    var total = spans.reduce(function (a, b) { return a + b; }, 0), began = null;
    draw(from);
    function frame(now) {
      if (finished) return;
      if (began === null) began = now;
      var t = now - began, k = 0, sofar = 0;
      while (k < spans.length - 1 && t > sofar + spans[k]) { sofar += spans[k]; k++; }
      say(k);
      var puck = mix(k ? events[k - 1].puck : from.puck, events[k].puck, ease(clamp((t - sofar) / spans[k], 0, 1)));
      // The line behind the puck: every stop it has passed, then the puck itself.
      var w = ease(clamp(t / total, 0, 1)), now10 = { us: {}, them: {}, puck: puck, trail: stops.slice(0, k + 1).concat([puck]) };
      P.ROLES.forEach(function (r) {
        now10.us[r] = mix(from.us[r], to.us[r], w);
        now10.them[r] = mix(from.them[r], to.them[r], w);
      });
      slide(now10);
      if (t >= total) finish(); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // If the page is in the background the browser stops drawing; do not get stuck.
    setTimeout(finish, total + 500);
  }

  function hintSpot() {
    if (!game || game.over || G.youHavePuck(game)) return null;
    var best = G.ideals(game).us[game.you];
    return { a: best.a, d: best.d };
  }

  function newShift() {
    if (busy) return;
    game = G.newShift(el.start.value, role, dice, game);   // the score carries over
    target = null; preview = null; lastTrail = null;
    showRings = el.hint.checked ? hintSpot() : null;
    el.spot.hidden = true;
    addLog("Shift " + game.stats.shifts + ": " + game.intro, "shift");
    refresh();
  }

  // ---------- Dragging your marker, tapping a teammate ------------------
  function pointerToRink(ev) { return rink ? rink.toRink(ev) : null; }
  function moveTo(spot) {
    if (!spot || !game || game.over || busy || G.youHavePuck(game)) return;
    target = G.toward(game.us[game.you], spot, G.REACH);
    var at = { us: JSON.parse(JSON.stringify(game.us)), them: game.them, puck: game.puck };
    at.us[game.you] = target;
    draw(at);
    showCall();
  }
  var dragging = false;
  svg.addEventListener("pointerdown", function (ev) {
    if (!game || game.over || busy) return;
    var spot = pointerToRink(ev);
    if (!spot) return;
    ev.preventDefault();
    if (G.youHavePuck(game)) {
      // Tap a teammate to pass to them.
      var near = G.nearest(game.us, spot, game.you);
      if (near.feet <= 7) play({ action: "pass-" + near.role });
      return;
    }
    dragging = true;
    if (svg.setPointerCapture) { try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* fine */ } }
    moveTo(spot);
  });
  svg.addEventListener("pointermove", function (ev) { if (dragging) moveTo(pointerToRink(ev)); });
  function stopDrag() { dragging = false; }
  svg.addEventListener("pointerup", stopDrag);
  svg.addEventListener("pointercancel", stopDrag);

  // Arrow keys move your marker 3 feet at a time. Enter plays on.
  svg.addEventListener("keydown", function (ev) {
    if (!game || game.over || busy || G.youHavePuck(game)) return;
    // On screen: right = up the ice when the rink lies down, up = up the ice when it stands.
    var step = rink.upright
      ? { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] }[ev.key]
      : { ArrowLeft: [0, -3], ArrowRight: [0, 3], ArrowUp: [-3, 0], ArrowDown: [3, 0] }[ev.key];
    if (step) {
      ev.preventDefault();
      var now = target || game.us[game.you];
      moveTo({ a: clamp(now.a + step[0], 3, 82), d: clamp(now.d + step[1], 3, 197) });
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      play({ moveTo: target });
    }
  });

  // ---------- Buttons and choosers -------------------------------------
  G.STARTS.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.id; o.textContent = s.name;
    el.start.appendChild(o);
  });
  var roleButtons = document.querySelectorAll("[data-grole]");
  function syncRole() {
    Array.prototype.forEach.call(roleButtons, function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-grole") === role));
    });
  }
  Array.prototype.forEach.call(roleButtons, function (b) {
    b.addEventListener("click", function () { role = b.getAttribute("data-grole"); syncRole(); });
  });
  // Picking a start where we have the puck puts YOU on the puck (you can still change it).
  el.start.addEventListener("change", function () {
    var s = G.STARTS.filter(function (x) { return x.id === el.start.value; })[0];
    if (s && s.carrier) { role = s.carrier; syncRole(); }
  });
  el.begin.addEventListener("click", newShift);
  $("game-reset").addEventListener("click", function () {
    if (busy) return;
    game = null; target = null; preview = null; showRings = null; lastTrail = null;
    el.log.textContent = "";
    el.spot.hidden = true;
    refresh();
  });
  el.go.addEventListener("click", function () { play({ moveTo: target }); });
  el.call.addEventListener("click", function () { play({ moveTo: target, call: true }); });
  el.hint.addEventListener("change", function () {
    if (!busy) { showRings = el.hint.checked ? hintSpot() : null; draw(); }
  });
  function rebuild() { if (!busy) build(); }
  if (tall.addEventListener) tall.addEventListener("change", rebuild); else if (tall.addListener) tall.addListener(rebuild);

  syncRole();
  build();
  refresh();
  window.CoachGameUI = { state: function () { return game; } };   // for checking in the browser
})();
