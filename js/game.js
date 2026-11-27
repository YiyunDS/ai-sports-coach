// =====================================================================
//  game.js  --  THE LIVE HOCKEY GAME ON THE PAGE
//
//  This draws the rink from above and lets you PLAY: you skate one
//  skater yourself (keys, a touch joystick or a game controller, see
//  controls.js), and the computer plays everybody else (gamebrain.js).
//  The rules are in gamesim.js. This file only draws, listens, and
//  keeps the game running.
//
//  HOW A GAME RUNS ON THE PAGE
//    The browser calls "frame" each time it is ready to paint, about
//    60 times a second. Each time we
//      1. ask the controls what you are doing,
//      2. move the game forward by the time that has passed, in steps
//         of 1/60 of a second (so the game is the same on a fast and
//         on a slow device),
//      3. say what happened (the play-by-play, the whistle),
//      4. move the shapes on the rink to where everything is now.
//
//  We draw in FEET, like the positioning board. The rink lies on its
//  side on a wide screen (our net on the left) and stands up on a
//  phone (our net at the bottom). A phone shows the 120 feet of ice
//  around the play, like a TV camera following the puck.
//
//  MOVEMENT: this game is the one place on the page where things must
//  move to work. With "reduce motion" it still plays, but without the
//  extras: the camera steps instead of gliding, and rings do not grow.
// =====================================================================
(function () {
  "use strict";
  var G = window.CoachGame, B = window.CoachBrain, P = window.CoachPositions, R = window.CoachRink;
  var Keys = window.CoachControls, Sound = window.CoachSound;
  var svg = document.getElementById("game-rink");
  if (!G || !B || !P || !R || !Keys || !svg) return;
  var shape = R.shape, words = R.words;   // the drawing helpers from rink.js

  function $(id) { return document.getElementById(id); }
  var el = {
    view: $("view-game"), us: $("game-us"), them: $("game-them"), clock: $("game-clock"), info: $("game-info"),
    log: $("game-log"), age: $("game-age"), begin: $("game-new"), pause: $("game-pause"), end: $("game-end"),
    sound: $("game-sound"), setup: $("game-setup"), playing: $("game-playing"), pad: $("game-pad"),
    bars: $("game-bars"), power: $("game-power"), lift: $("game-lift"), powerGreen: $("game-power-green"), liftGreen: $("game-lift-green"),
    barWord: $("game-bar-word"), call: $("game-call-word"), card: $("game-card"), cardKind: $("game-card-kind"),
    cardText: $("game-card-text"), cardMore: $("game-card-more"), cardGo: $("game-card-go"), passBtn: $("game-btn-pass")
  };

  // What the page remembers.
  var game = null;            // the state from gamesim.js (null before the first game)
  var role = "C";             // the position you picked
  var minutes = 3;            // how long a game is
  var dice = G.makeDice(Date.now());
  var paused = false;
  var lastTime = null;        // when the last picture was painted
  var owed = 0;               // game time we still have to play (seconds)
  var held = {};              // buttons pressed while no step was played yet

  var tall = window.matchMedia("(max-width: 700px)");
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  var rink = null;            // the rink drawing (from rink.js)
  var live = null;            // the layer with everything that moves
  var parts = null;           // the shapes on that layer
  var camera = 40;            // phone: the first foot of ice in the picture
  var SHOW = 120;             // phone: how many feet of the rink's length we show

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function running() { return !!game && game.phase !== "over" && !paused; }

  // ---------- Drawing the rink and everything on it --------------------------
  function marker(label, className) {
    var g = shape("g", { class: "marker " + className }, live);
    shape("circle", { r: 3.1 }, g);
    if (label) words(label, { y: "0.35em" }, g);
    return g;
  }
  function build() {
    rink = R.build(svg, { upright: tall.matches });
    // The goalies move in this game, so we draw our own and take the
    // painted ones off this rink.
    Array.prototype.forEach.call(svg.querySelectorAll(".goalie"), function (g) { g.parentNode.removeChild(g); });
    live = shape("g", {}, rink.root);
    parts = { us: {}, them: {}, goalie: {} };
    parts.passLine = shape("line", { class: "pass-line", x1: 0, y1: 0, x2: 0, y2: 0 }, live);
    parts.ring = shape("circle", { class: "whistle-ring", r: 7, cx: 0, cy: 0 }, live);
    parts.goalie.us = shape("circle", { class: "goalie ours", r: 2.2 }, live);
    parts.goalie.them = shape("circle", { class: "goalie theirs", r: 2.2 }, live);
    // The referee: a striped marker, no letter.
    parts.ref = shape("g", { class: "marker ref" }, live);
    shape("circle", { r: 2.6 }, parts.ref);
    [-1.3, 0, 1.3].forEach(function (x) { shape("rect", { x: x - 0.3, y: -2.2, width: 0.6, height: 4.4, class: "stripe" }, parts.ref); });
    P.ROLES.forEach(function (r) { parts.them[r] = marker(r, "opp"); });
    P.ROLES.forEach(function (r) { parts.us[r] = marker(r, r === role ? "you" : "mate"); });
    parts.puck = shape("circle", { class: "puck", r: 1.4 }, live);
    // Phone only: a small arrow at the edge of the picture when you are outside it.
    parts.away = shape("path", { class: "you-away", d: "M2.8,0 L-1.8,-2.6 L-1.8,2.6 Z", visibility: "hidden" }, live);
    look(true);
    draw();
  }
  // The phone's camera: keep the puck and you in the picture.
  function look(jump) {
    if (!rink.upright) return;
    var want = 40;
    if (game) {
      var me = game.us[game.you], puck = game.puck;
      var mid = (puck.d * 2 + me.d) / 3;                    // mostly the puck, a little bit you
      want = clamp(mid - SHOW / 2, puck.d - SHOW + 16, puck.d - 16);
      want = clamp(want, 0, 200 - SHOW);
    }
    if (jump) camera = want;
    else if (calm.matches) { if (Math.abs(want - camera) > 14) camera = Math.round(want / 10) * 10; }   // in steps
    else camera += (want - camera) * 0.12;                                                           // a smooth glide
    // (The standing rink is the lying one turned a quarter turn: depth d is at 200 - d from the top.)
    svg.setAttribute("viewBox", "0 " + (200 - camera - SHOW).toFixed(2) + " 85 " + SHOW);
  }
  function draw() {
    if (!parts) return;
    var s = game;
    live.setAttribute("visibility", s ? "visible" : "hidden");
    if (!s) return;
    ["us", "them"].forEach(function (team) {
      P.ROLES.forEach(function (r) { parts[team][r].setAttribute("transform", rink.place(s[team][r])); });
      parts.goalie[team].setAttribute("cx", s.goalie[team].d);
      parts.goalie[team].setAttribute("cy", s.goalie[team].a);
    });
    parts.ref.setAttribute("transform", rink.place(s.ref));
    var p = s.puck;
    parts.puck.setAttribute("cx", p.d); parts.puck.setAttribute("cy", p.a);
    parts.puck.setAttribute("r", (1.4 + Math.min(p.h, 5) * 0.14).toFixed(2));   // a puck in the air looks a little bigger
    // A ring around whoever has the puck.
    var has = p.owner ? p.owner + p.carrier : "";
    if (has !== parts.has) {
      if (parts.hasEl) parts.hasEl.classList.remove("has-puck");
      parts.hasEl = p.owner ? parts[p.owner][p.carrier] : null;
      if (parts.hasEl) parts.hasEl.classList.add("has-puck");
      parts.has = has;
    }
    // The pass line: who would get your pass right now?
    var mine = G.youHavePuck(s) && s.phase === "play";
    parts.passLine.setAttribute("visibility", mine ? "visible" : "hidden");
    if (mine) {
      var me = s.us[s.you], to = G.passTarget(s, steer), mate = s.us[to];
      parts.passLine.setAttribute("x1", me.d); parts.passLine.setAttribute("y1", me.a);
      parts.passLine.setAttribute("x2", mate.d); parts.passLine.setAttribute("y2", mate.a);
      // For the younger age groups the line turns red when that pass would be offside.
      parts.passLine.setAttribute("class", "pass-line" + (s.lv.warn && G.passIsOffside(s, "us", to) ? " warn" : ""));
    }
    look(false);
    // The camera follows the puck. If that leaves YOU outside the picture,
    // an arrow at the edge shows where you are.
    var my = s.us[s.you], above = my.d > camera + SHOW - 2, below = my.d < camera + 2;
    var lost = rink.upright && (above || below);
    parts.away.setAttribute("visibility", lost ? "visible" : "hidden");
    if (lost) parts.away.setAttribute("transform", "translate(" + (above ? camera + SHOW - 4 : camera + 4) + "," + my.a.toFixed(1) + ")" + (above ? "" : " scale(-1,1)"));
  }

  // ---------- The words around the rink ------------------------------------------
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function clockText(seconds) {
    var whole = Math.ceil(seconds), m = Math.floor(whole / 60), sec = whole % 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }
  function addLog(text, className) {
    var li = document.createElement("li");
    li.textContent = text;
    if (className) li.className = className;
    el.log.insertBefore(li, el.log.firstChild);
    while (el.log.children.length > 40) el.log.removeChild(el.log.lastChild);
  }
  // The one line under the clock: what is going on right now.
  function statusLine() {
    var s = game;
    if (!s) return "Press Start game";
    if (s.phase === "over") return "Final score";
    if (paused) return "Paused";
    if (s.phase === "dead") return CALL_WORDS[s.stop.reason] || "Whistle";
    if (s.phase === "set") return "Face-off";
    if (s.phase === "drop") return s.you === "C" ? "Wait for the drop..." : "Face-off";
    if (s.phase === "draw") return "Now! Tap Pass";
    if (G.youHavePuck(s)) return s.aim && s.aim.stage === 1 ? "Tap " + (s.aim.kind === "pass" ? "Pass" : "Shoot") + " again" : "You have the puck";
    if (s.puck.owner === "us") return "We have the puck";
    if (s.puck.owner === "them") return "They have the puck";
    return "Loose puck";
  }
  var CALL_WORDS = { goal: "Goal", cover: "Save", offside: "Offside", icing: "Icing", end: "Time" };

  // The two bars. The markers move with "transform" only.
  var barTall = 0;
  function drawBars() {
    var b = game && !paused ? G.bars(game) : null;
    el.bars.classList.toggle("live", !!b);
    if (!b) { setText(el.barWord, ""); return; }
    if (!barTall) barTall = el.power.parentNode.clientHeight;
    el.power.style.transform = "translateY(" + (-b.power * barTall).toFixed(1) + "px)";
    el.lift.style.transform = "translateY(" + (-b.lift * barTall).toFixed(1) + "px)";
    green(el.powerGreen, b.greenPower);
    green(el.liftGreen, b.greenLift);
    el.bars.classList.toggle("second", b.stage === 1);
    setText(el.barWord, b.stage === 1 ? (b.kind === "pass" ? "Pass" : "Shoot") : "");
  }
  function green(node, zone) {
    var key = zone ? zone.join() : "";
    if (node.zone === key) return;
    node.zone = key;
    node.style.opacity = zone ? "" : "0";
    if (zone) { node.style.bottom = (zone[0] * 100) + "%"; node.style.height = ((zone[1] - zone[0]) * 100) + "%"; }
  }

  // Everything that only changes now and then: the score, which buttons show.
  function refresh() {
    var s = game, on = !!s && s.phase !== "over";
    setText(el.us, String(s ? s.score.us : 0));
    setText(el.them, String(s ? s.score.them : 0));
    el.setup.hidden = on;
    el.playing.hidden = !on;
    el.pad.hidden = !on;
    el.view.classList.toggle("in-game", on);
    setText(el.pause, paused ? "Resume" : "Pause");
    el.pause.setAttribute("aria-pressed", String(paused));
    setText(el.begin, s ? "Play again" : "Start game");
    // The card over the rink: before a game, while paused, and at the end.
    var kind = "", text = "", more = "", go = "";
    if (!s) { kind = "Live game"; text = "Pick your age group and your position, then press Start game."; }
    else if (s.phase === "over") {
      kind = s.score.us > s.score.them ? "You win" : s.score.us < s.score.them ? "They win" : "A tie";
      text = "Final score: us " + s.score.us + ", them " + s.score.them + ".";
      var t = s.stats;
      more = "Shots " + t.shots.us + " to " + t.shots.them + ". Saves by our goalie " + t.saves.us + ", by theirs " + t.saves.them +
        ". Offside: us " + t.offside.us + ", them " + t.offside.them + ". Icing: us " + t.icing.us + ", them " + t.icing.them +
        ". Face-offs won: " + t.faceoffs.us + " of " + (t.faceoffs.us + t.faceoffs.them) + ".";
    } else if (paused) { kind = "Paused"; text = "The game waits for you."; go = "Resume"; }
    el.card.hidden = !kind;
    el.card.className = "game-card" + (s && s.phase === "over" ? (s.score.us > s.score.them ? " good" : s.score.us < s.score.them ? " far" : " close") : "");
    setText(el.cardKind, kind); setText(el.cardText, text); setText(el.cardMore, more);
    el.cardMore.hidden = !more;
    el.cardGo.hidden = !go; setText(el.cardGo, go);
  }
  function showSound() {
    if (!el.sound || !Sound) return;
    setText(el.sound, Sound.on() ? "Sound on" : "Sound off");
    el.sound.setAttribute("aria-pressed", String(Sound.on()));
  }

  // ---------- What happened: the story, the whistle, the ring --------------------
  var callTimer = null;
  function tell(e) {
    if (e.kind === "steal") return;                       // too many to read; you see them on the ice
    addLog(e.text, e.kind + (e.team ? " " + e.kind + "-" + e.team : ""));
    if (e.kind === "save") ringAt(game.goalie[e.team]);
    if (!e.whistle) return;
    if (Sound) Sound.blow(e.kind);
    ringAt(game.ref);
    if (e.kind === "end") return;                          // (the card over the rink says how it ended)
    // The call, in big letters over the rink for a moment.
    setText(el.call, CALL_WORDS[e.kind] || "Whistle");
    el.call.className = "game-call show " + (e.kind === "goal" ? (e.team === "us" ? "good" : "far") : "close");
    clearTimeout(callTimer);
    callTimer = setTimeout(function () { el.call.classList.remove("show"); }, 1500);
  }
  // A ring that opens once around a spot (the referee, or a goalie who made a save).
  function ringAt(spot) {
    var r = parts.ring;
    r.setAttribute("cx", spot.d); r.setAttribute("cy", spot.a);
    r.classList.remove("go");
    void r.getBoundingClientRect();                        // (so the browser starts the animation again)
    r.classList.add("go");
  }

  // ---------- The loop --------------------------------------------------------------
  var steer = { a: 0, d: 0 };   // which way you are steering right now (the pass line uses it)
  function frame(now) {
    requestAnimationFrame(frame);
    // The Game tab is not showing, or the whole page is hidden: the game waits.
    if (game && !paused && game.phase !== "over" && (el.view.hidden || document.hidden)) setPaused(true);
    var input = Keys.read(rink.upright);
    if (input.pause && game && game.phase !== "over") { setPaused(!paused); input.pause = false; }
    if (lastTime === null) lastTime = now;
    var passed = Math.min(0.1, (now - lastTime) / 1000);   // (never more than a tenth of a second at once)
    lastTime = now;
    if (!running()) { owed = 0; drawBars(); setText(el.info, statusLine()); return; }
    steer = input.move;
    ["pass", "shoot", "call", "burst"].forEach(function (b) { if (input[b]) held[b] = true; });
    owed += passed;
    var changed = false;
    while (owed >= G.TICK) {
      owed -= G.TICK;
      // A button counts in ONE step; the steering counts in all of them.
      var events = B.play(game, { move: input.move, pass: held.pass, shoot: held.shoot, call: held.call, burst: held.burst }, G.TICK, dice);
      held = {};
      events.forEach(tell);
      if (events.length) changed = true;
      if (game.phase === "over") break;
    }
    if (changed || game.phase === "over") refresh();
    setText(el.clock, clockText(game.clock));
    setText(el.info, statusLine());
    setText(el.passBtn, game.puck.owner === "them" ? "Check" : "Pass");
    drawBars();
    draw();
  }

  function setPaused(next) {
    if (!game || game.phase === "over") return;
    paused = next;
    held = {};
    Keys.letGo();
    refresh();
  }
  function newGame() {
    game = G.newGame({ you: role, age: Number(el.age.value), minutes: minutes });
    paused = false; owed = 0; held = {}; barTall = 0;
    el.log.textContent = "";
    addLog("A new game: ages " + game.lv.name + ", you are the " + P.ROLE_NAMES[role].toLowerCase() + ". Face-off at center.", "start");
    setText(el.clock, clockText(game.clock));
    if (Sound) Sound.wake();        // (the browser lets us make sound now: you just pressed a button)
    build();
    refresh();
    // On a phone, bring the rink to the top so the rink and the controls are both on screen.
    if (tall.matches && el.view.scrollIntoView) el.view.scrollIntoView({ block: "start" });
  }
  function endGame() {
    game = null; paused = false;
    clearTimeout(callTimer);
    el.call.classList.remove("show");
    el.log.textContent = "";
    setText(el.clock, clockText(minutes * 60));
    Keys.letGo();
    refresh();
    draw();
  }

  // ---------- Buttons and choosers ----------------------------------------------------
  G.AGE_NAMES.forEach(function (name, i) {
    var o = document.createElement("option");
    o.value = String(i);
    o.textContent = "Ages " + name.replace("-", " to ").replace("+", " and up");
    if (i === 2) o.selected = true;
    el.age.appendChild(o);
  });
  function group(attr, read, write) {
    var buttons = document.querySelectorAll("[" + attr + "]");
    function sync() {
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute("aria-pressed", String(b.getAttribute(attr) === String(read()))); });
    }
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener("click", function () { write(b.getAttribute(attr)); sync(); });
    });
    sync();
  }
  group("data-grole", function () { return role; }, function (v) { role = v; });
  group("data-gmin", function () { return minutes; }, function (v) { minutes = Number(v); if (!game) setText(el.clock, clockText(minutes * 60)); });
  el.begin.addEventListener("click", newGame);
  el.pause.addEventListener("click", function () { setPaused(!paused); });
  el.cardGo.addEventListener("click", function () { setPaused(false); });
  el.end.addEventListener("click", endGame);
  if (el.sound && Sound) {
    el.sound.addEventListener("click", function () { Sound.wake(); Sound.set(!Sound.on()); });
    Sound.onChange(showSound);
  }
  showSound();

  Keys.attach({
    // The keys and the touch buttons belong to the game while a game is on and this tab is showing.
    active: function () { return !!game && game.phase !== "over" && !el.view.hidden; },
    stickArea: $("game-stick"), base: $("game-stick-base"), knob: $("game-stick-knob"),
    buttons: { pass: el.passBtn, shoot: $("game-btn-shoot"), call: $("game-btn-call"), burst: $("game-btn-burst") }
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) setPaused(true); });

  function rebuild() { barTall = 0; build(); }
  if (tall.addEventListener) tall.addEventListener("change", rebuild); else if (tall.addListener) tall.addListener(rebuild);
  window.addEventListener("resize", function () { barTall = 0; });

  setText(el.clock, clockText(minutes * 60));
  build();
  refresh();
  requestAnimationFrame(frame);
  // For checking in the browser.
  window.CoachGameUI = { state: function () { return game; }, paused: function () { return paused; },
                         start: newGame, setDice: function (d) { dice = d; } };
})();
