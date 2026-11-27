// =====================================================================
//  ref.js  --  "YOU MAKE THE CALL" ON THE PAGE
//
//  You are the referee. A short play runs on the rink. Then you tap:
//  Offside, Icing, or Good play. The game freezes the moment that
//  decided it, zooms in on the skates and the line, and tells you why.
//
//  The plays and the rules are in refplays.js. The rink is drawn by
//  rink.js. This file runs the little movie and counts your score.
// =====================================================================
(function () {
  "use strict";
  var F = window.CoachRef, R = window.CoachRink, G = window.CoachGame;
  var svg = document.getElementById("ref-rink");
  if (!F || !R || !G || !svg) return;
  var shape = R.shape, words = R.words;

  function $(id) { return document.getElementById(id); }
  var el = {
    prompt: $("ref-prompt"), again: $("ref-again"), next: $("ref-next"), result: $("ref-result"),
    verdict: $("ref-verdict"), answer: $("ref-answer"), why: $("ref-why"), right: $("ref-right"),
    total: $("ref-total"), info: $("ref-info"), streak: $("ref-streak"), banner: $("ref-banner"), levelNote: $("ref-level-note")
  };
  var callButtons = document.querySelectorAll("[data-call]");
  var levelButtons = document.querySelectorAll("[data-rlevel]");

  var LEVELS = {
    1: "Rookie: the calls are plain to see.",
    2: "Linesman: close calls at the blue line, the far winger, pucks that come back out, and long shots that get touched, stop short or go in.",
    3: "Pro: everything, faster, teams that are short a player, and the rules that surprise people."
  };

  // What the game remembers.
  var dice = G.makeDice(Date.now() + 7);
  var level = 1;
  var play = null;        // the play on the ice (from refplays.js)
  var truth = null;       // what the judge says about it
  var phase = "idle";     // "playing" -> "ask" -> "answered"
  var picked = null;      // the call you made
  var score = { right: 0, total: 0, streak: 0, best: 0 };
  var deck = null;        // the shuffled deck of plays for this level (see "deal" in refplays.js)
  var rink = null, live = null;
  var run = 0;            // goes up every time a movie starts, so an old one stops itself

  var tall = window.matchMedia("(max-width: 700px)");
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- Drawing one moment of the play ---------------------------
  // t = seconds into the play. frozen = we are showing the key moment.
  function draw(t, frozen) {
    if (!live || !play) return;
    live.textContent = "";
    var now = F.at(play, t);

    if (frozen) {
      if (play.rule === "offside") {
        // The edge of the blue line that counts, lit up.
        shape("line", { x1: F.BLUE, y1: 0, x2: F.BLUE, y2: 85, class: "hl-line" }, live);
      } else {
        // Where the puck was shot from, the red line, and where it went.
        shape("line", { x1: F.RED, y1: 0, x2: F.RED, y2: 85, class: "hl-line" }, live);
        if (truth.from) {
          shape("line", { x1: truth.from.d, y1: truth.from.a, x2: truth.spot.d, y2: truth.spot.a, class: "hl-path" }, live);
          shape("circle", { cx: truth.from.d, cy: truth.from.a, r: 2.2, class: "hl-ring" }, live);
        }
        // The goal line too, but only if the puck got that far.
        if (truth.spot.d >= F.GOAL_LINE) {
          shape("line", { x1: F.GOAL_LINE, y1: 5.8, x2: F.GOAL_LINE, y2: 79.2, class: "hl-line" }, live);
        }
      }
    }

    now.skaters.forEach(function (s) {
      var about = frozen && s.id === truth.who;
      var g = shape("g", { class: "marker " + (s.team === "att" ? "mate" : "opp") + (frozen && play.rule === "offside" ? " faded" : "") }, live);
      // On a phone the rink is small: the players are plain dots, a
      // little bigger, with no letters (they would be too small to read).
      shape("circle", { cx: s.d, cy: s.a, r: rink.upright ? 2.8 : 2.4 }, g);
      if (!rink.upright && !(frozen && play.rule === "offside") && s.label) words(s.label, { transform: rink.place(s), y: "0.35em" }, g);
      // The two skates (you can see them when the picture is zoomed in).
      s.skates.forEach(function (k) {
        shape("rect", { x: k.heel, y: k.a - 0.24, width: k.toe - k.heel, height: 0.48, rx: 0.2, class: "skate" }, live);
      });
      if (about) shape("circle", { cx: s.d, cy: s.a, r: 4.2, class: "hl-ring" }, live);
    });
    shape("circle", { cx: now.puck.d, cy: now.puck.a, r: frozen && play.rule === "offside" ? 0.5 : 1.3, class: "puck" }, live);
  }

  // Build the rink for this play. Plays at the blue line happen at one
  // end, so we only show that end (everything is bigger). Long shots and
  // long passes need the length. The play itself says which (play.from).
  function build() {
    if (!play) { rink = R.build(svg, { upright: tall.matches, ours: "", theirs: "" }); live = shape("g", {}, rink.root); return; }
    var from = play.from;
    rink = R.build(svg, { upright: tall.matches, from: from, to: 200, ours: "", theirs: "" });
    // Words on the ice: which way blue is going. (On a phone they would
    // be too small to read, so the line above the buttons says it instead.)
    if (!tall.matches) words("BLUE ATTACKS THIS WAY", { transform: rink.place({ a: 80.5, d: from + 34 }), class: "rink-note" }, rink.root);
    live = shape("g", {}, rink.root);
  }

  // ---------- The little movie ------------------------------------------
  function watch() {
    var mine = ++run, began = null;
    phase = "playing";
    rink.zoom(null);
    refresh();
    function end() {
      if (mine !== run) return;
      run++;                                   // stop any frame still waiting
      draw(play.duration, false);
      phase = picked ? "answered" : "ask";
      if (picked) freeze();
      refresh();
    }
    if (calm.matches) { end(); return; }
    function frame(nowMs) {
      if (mine !== run) return;
      if (began === null) began = nowMs;
      var t = (nowMs - began) / 1000;
      if (t >= play.duration) { end(); return; }
      draw(t, false);
      requestAnimationFrame(frame);
    }
    draw(0, false);
    requestAnimationFrame(frame);
    // If the page is in the background the browser stops drawing; do not get stuck.
    setTimeout(end, play.duration * 1000 + 700);
  }

  // Show the moment that decided the call. For offside: zoomed in on
  // the skates and the blue line.
  function freeze() {
    draw(truth.t, true);
    if (play.rule === "offside") rink.zoom(truth.spot, tall.matches ? 18 : 26); else rink.zoom(null);
  }

  function nextPlay() {
    // One deck per level: every kind of play comes up once before any
    // comes back. A new level gets a new deck, which knows what you just saw.
    if (!deck || deck.level !== level) deck = F.makeDeck(level, deck ? deck.recent : []);
    play = F.deal(deck, dice);
    truth = F.judge(play);
    picked = null;
    build();
    watch();
  }

  function answer(call) {
    if (phase !== "ask") return;
    picked = call;
    phase = "answered";
    score.total++;
    if (call === truth.call) { score.right++; score.streak++; score.best = Math.max(score.best, score.streak); }
    else score.streak = 0;
    freeze();
    refresh();
  }

  // ---------- The words and the buttons ---------------------------------
  function refresh() {
    el.right.textContent = score.right;
    el.total.textContent = score.total;
    // (The level itself is on the switch right under the scoreboard.)
    el.info.textContent = play ? (play.rule === "offside" ? "Watch the blue line" : "Watch the puck") : "Level " + level;
    el.streak.textContent = score.best ? "In a row: " + score.streak + " (best " + score.best + ")" : "";
    el.banner.hidden = !(play && play.shorthanded);
    el.levelNote.textContent = LEVELS[level];
    Array.prototype.forEach.call(levelButtons, function (b) {
      b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-rlevel")) === level));
    });
    Array.prototype.forEach.call(callButtons, function (b) {
      var call = b.getAttribute("data-call");
      b.disabled = phase !== "ask";
      b.className = "call" + (phase === "answered" && call === truth.call ? " right" : "") +
        (phase === "answered" && call === picked && call !== truth.call ? " wrong" : "");
    });
    el.again.disabled = !play || phase === "playing";
    el.next.textContent = play ? "Next play" : "Start";
    el.next.className = !play || phase === "answered" ? "primary" : "";
    el.next.disabled = phase === "playing";
    el.result.hidden = phase !== "answered";
    if (phase === "answered") {
      var ok = picked === truth.call;
      el.result.className = "pos-result call-result " + (ok ? "good" : "far");
      el.verdict.textContent = ok ? "Correct" : "Not quite";
      el.answer.textContent = "The call: " + F.CALL_WORDS[truth.call];
      el.why.textContent = F.explain(play, truth);
    }
    // (On a phone the rink stands up: blue attacks toward the top.)
    var way = tall.matches ? " Blue attacks toward the top." : "";
    el.prompt.textContent = !play ? "Press Start. Watch the play, then make the call."
      : phase === "playing" ? "Watch the play." + way
      : phase === "ask" ? "What is the call?" + way
      : "This is the moment that decided it.";
  }

  Array.prototype.forEach.call(callButtons, function (b) {
    b.addEventListener("click", function () { answer(b.getAttribute("data-call")); });
  });
  Array.prototype.forEach.call(levelButtons, function (b) {
    b.addEventListener("click", function () {
      level = Number(b.getAttribute("data-rlevel"));
      if (phase === "playing") { refresh(); return; }
      nextPlay();
    });
  });
  el.next.addEventListener("click", function () { if (phase !== "playing") nextPlay(); });
  el.again.addEventListener("click", function () { if (play && phase !== "playing") watch(); });
  function rebuild() {
    if (phase === "playing") return;
    build();
    if (play) { if (phase === "answered") freeze(); else draw(play.duration, false); }
    refresh();   // the words about "the top" follow the rink when it stands up or lies down
  }
  if (tall.addEventListener) tall.addEventListener("change", rebuild); else if (tall.addListener) tall.addListener(rebuild);

  build();
  refresh();
  window.CoachRefUI = { state: function () { return { play: play, truth: truth, phase: phase, score: score, level: level, deck: deck }; } };
})();
