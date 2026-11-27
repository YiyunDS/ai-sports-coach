// =====================================================================
//  gamereport.js  --  THE COACH'S REPORT AFTER A GAME
//
//  A score says who won. It does not say how YOU played. So while you
//  play, this file quietly keeps notes about your skater, and at the
//  end it writes a short report, the way a coach would on the bench:
//
//      What you did well          (the two best things)
//      Work on this next          (the ONE weakest thing, with a tip)
//      and a card for each part of your game:
//        Position       were you where your position should be?
//        Passing        did your passes arrive? did you pass in time?
//        Shooting       did you shoot from good spots? on the net?
//        Taking         did you get close before you tried to take?
//        Whistles       offside and icing that were your doing
//        Face-offs      (only when you are the center)
//
//  HOW IT KNOWS
//    * gamesim.js sends a note each time something happens: a pass
//      leaves, somebody gets it, a shot, a miss, a take, a whistle.
//    * A few times a second we also look where you are standing and
//      where the Positioning playbook wants your position to be
//      (the same spots the computer players skate to).
//
//  The limits below (12 feet, 24 feet, and so on) are our own choices.
//  Change them here if the report is too strict or too kind.
//
//  No drawing in this file, so we can test it:
//      node tests/gamereport.test.js
// =====================================================================
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var P = node ? require("./positions.js") : root.CoachPositions;
  var G = node ? require("./gamesim.js") : root.CoachGame;
  var B = node ? require("./gamebrain.js") : root.CoachBrain;

  var ROLES = P.ROLES;
  var NEAR = 12;        // this close to your spot (feet) = at your spot
  var CLOSE = 24;       // this close = close to it
  var GOOD_SHOT = 0.1;  // a spot where at least 1 shot in 10 would score = a good spot to shoot from
  var OPEN = 0.75;      // a teammate who would get at least 3 passes in 4 = open
  var LOOK_EVERY = 12;  // look at your position every 12 steps (5 times a second)

  function feet(p, q) { return P.feetBetween(p, q); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function times(n) { return n === 1 ? "Once" : n === 2 ? "Twice" : n + " times"; }

  // ---------- Keeping notes ---------------------------------------------
  // Start the notes for a new game.
  function start(s) {
    return {
      you: s.you, steps: 0, withPuck: 0, hold: 0, needPass: 0, slotTime: 0,
      pos: { n: 0, good: 0, close: 0, ahead: 0, aside: 0 },
      passes: [], shots: [], pass: null, shot: null,
      takes: { far: 0, miss: 0, won: 0 },
      lost: { total: 0, open: 0 },
      offside: { early: 0, brought: 0 }, icing: 0,
      faceoffs: { won: 0, lost: 0, early: 0 }
    };
  }

  // Call this after every step of the game.
  //   t = the notes, s = the game, events = what just happened, dt = seconds
  function watch(t, s, events, dt) {
    var you = t.you, me = s.us[you], p = s.puck;
    function mine(who) { return !!who && who.team === "us" && who.role === you; }

    (events || []).forEach(function (e) {
      if (e.kind === "pass" && mine(e)) {
        t.pass = { to: e.to, power: e.power, lift: e.lift, offside: e.offside, result: null };
        t.passes.push(t.pass);
      } else if (e.kind === "shot" && mine(e)) {
        t.shot = { feet: e.feet, chance: e.chance, power: e.power, lift: e.lift, result: null };
        t.shots.push(t.shot);
      } else if (e.kind === "catch" && mine(e.sent)) {
        // Somebody got the puck you sent.
        if (e.shot) { if (t.shot && !t.shot.result) t.shot.result = e.team === "them" ? "blocked" : "teammate"; }
        else if (t.pass && !t.pass.result) t.pass.result = e.team === "them" ? "picked" : "caught";
      } else if (e.kind === "goal" && mine(e.by)) {
        if (t.shot && !t.shot.result) t.shot.result = "goal";
      } else if ((e.kind === "save" || e.kind === "cover") && mine(e.by)) {
        if (t.shot && !t.shot.result) t.shot.result = "saved";
        else if (t.pass && !t.pass.result) t.pass.result = "missed";      // a pass that ended up at their goalie
      } else if (e.kind === "wide" && mine(e)) {
        if (t.shot && !t.shot.result) t.shot.result = e.over ? "over" : "wide";
      } else if (e.kind === "offside" && e.team === "us") {
        if (e.role === you) t.offside.early++;                            // YOU were in too early
        else if (e.by === you) {                                          // you brought the puck in on a teammate
          t.offside.brought++;
          if (t.pass && !t.pass.result) t.pass.result = "offside";
        }
      } else if (e.kind === "icing" && e.team === "us" && e.by === you) {
        t.icing++;
        if (t.pass && !t.pass.result) t.pass.result = "missed";
      } else if (e.kind === "take" && mine(e)) {
        t.takes[e.result]++;
      } else if (e.kind === "steal") {
        if (mine(e)) t.takes.won++;
        else if (e.team === "them" && e.from === you) {
          t.lost.total++;
          if (t.needPass > 0) t.lost.open++;      // a teammate was open and a defender was on you: pass!
        }
      } else if (e.kind === "faceoff" && e.you) {
        t.faceoffs[e.you]++;
      }
    });
    if (s.phase !== "play") return;
    t.steps++;

    if (G.youHavePuck(s)) {
      t.withPuck += dt; t.hold += dt;
      // Is a teammate open, and is a defender coming at you?
      var open = ROLES.some(function (r) {
        return r !== you && !G.passIsOffside(s, "us", r) && G.passChance(p, s.us[r], s.them, 0) >= OPEN;
      });
      var pressed = G.nearest(s.them, me).feet < 10;
      if (t.hold > 1.5 && open && pressed) t.needPass = 0.6; else t.needPass = Math.max(0, t.needPass - dt);
      // Are you standing in a good spot to shoot from?
      if (G.shotChance(p, s.them, false) >= GOOD_SHOT) t.slotTime += dt;
      return;
    }
    t.hold = 0;
    t.needPass = Math.max(0, t.needPass - dt);
    if (t.steps % LOOK_EVERY) return;
    // Without the puck: are you where your position should be?
    // (Going for the puck is right when a pass is coming to you, or when
    // you are the nearest of your team to a puck we do not have. Those
    // moments do not count for or against you.)
    var chasing = (p.pass && p.pass.team === "us" && p.pass.to === you) ||
                  (p.owner !== "us" && G.nearest(s.us, p).role === you);
    if (chasing) return;
    var want = B.spots(s, "us").spots[you], f = feet(me, want);
    t.pos.n++;
    if (f <= NEAR) t.pos.good++; else if (f <= CLOSE) t.pos.close++;
    t.pos.ahead += me.d - want.d;                  // + = farther up the ice than your spot
    t.pos.aside += Math.abs(me.a - want.a);
  }

  // ---------- Writing the report ------------------------------------------
  var WORDS = { good: "Good", close: "Close", far: "Work on this", none: "Not seen" };
  function count(list, what) { return list.filter(function (x) { return x.result === what; }).length; }

  // One card each. Every card: { id, title, grade, score (0 to 1, for
  // ranking), line (what happened), tip (what to do), praise }.
  function position(t, s) {
    var q = t.pos, role = P.ROLE_NAMES[t.you].toLowerCase();
    if (q.n < 8) return { id: "position", title: "Position", grade: "none", line: "You were on the puck almost all the time, so there was too little to see of your position without it.", tip: "" };
    var at = Math.round(100 * q.good / q.n), near = Math.round(100 * q.close / q.n);
    var ahead = q.ahead / q.n, aside = q.aside / q.n;
    var line = "Without the puck, you were at the spot for a " + role + " " + at + "% of the time" + (near ? ", and close to it another " + near + "%" : "") + ".";
    var tip = "Watch where the puck is, then skate to your spot. The Positioning tab shows the spot for every situation.";
    if (ahead > 10) { line += " Your usual slip: too far up the ice."; tip = /defense/.test(role) ? "A defender stays between the puck and our net. Come back before you chase." : "Do not wait up the ice for the puck. Come back and be the easy pass."; }
    else if (ahead < -10) { line += " Your usual slip: too far back."; tip = "Skate up with the play, so you are close enough for a pass."; }
    else if (aside > 14) { line += " Your usual slip: on the wrong side of the ice."; tip = "Keep to your own lane, so a teammate always knows where you are."; }
    var score = (q.good + 0.5 * q.close) / q.n;
    return { id: "position", title: "Position", score: score, line: line, tip: tip,
             grade: q.good / q.n >= 0.5 ? "good" : (q.good + q.close) / q.n >= 0.55 ? "close" : "far",
             praise: "You held your position: at your spot " + at + "% of the time without the puck." };
  }

  function passing(t) {
    var n = t.passes.length, caught = count(t.passes, "caught"), picked = count(t.passes, "picked"), offside = count(t.passes, "offside");
    var nobody = n - caught - picked - offside, needed = t.lost.open;
    var late = needed ? " " + times(needed) + " a defender took the puck from you while a teammate was open. That was the moment to pass." : "";
    if (!n) {
      if (t.withPuck < 6 && !needed) return { id: "passing", title: "Passing", grade: "none", line: "You did not pass, and you hardly had the puck.", tip: "" };
      return { id: "passing", title: "Passing", grade: needed ? "far" : "close", score: needed ? 0.1 : 0.4,
               line: "You had the puck for about " + Math.round(t.withPuck) + " seconds and never passed." + late,
               tip: "A pass moves the puck faster than any skater. Steer toward a teammate and tap Pass twice." };
    }
    var line = "You passed " + plural(n, "time", "times") + ": " + caught + " reached a teammate" +
      (picked ? ", " + picked + " " + (picked === 1 ? "was" : "were") + " picked off" : "") +
      (offside ? ", " + offside + " " + (offside === 1 ? "was" : "were") + " offside" : "") +
      (nobody ? ", " + nobody + " went to nobody" : "") + "." + late;
    var rate = caught / n, score = Math.max(0, rate - 0.15 * needed);
    var tip = "Keep passing to the open teammate.";
    if (offside) tip = "Before you pass, look where your teammate is. A teammate inside their blue line before the puck makes it offside.";
    else if (needed) tip = "When a defender comes at you and a teammate is open, pass early.";
    else if (picked >= caught && picked) tip = "Pass when the lane is empty, or lift the pass over the stick with the Height bar.";
    else if (nobody > caught) tip = "Stop the Power mark in the green: a pass that is too hard is difficult to catch.";
    return { id: "passing", title: "Passing", score: score, line: line, tip: tip,
             grade: score >= 0.7 ? "good" : score >= 0.45 ? "close" : "far",
             praise: caught + " of your " + plural(n, "pass", "passes") + " reached a teammate." };
  }

  function shooting(t, s) {
    var n = t.shots.length, waited = Math.round(t.slotTime);
    if (!n) {
      if (waited >= 2) return { id: "shooting", title: "Shooting", grade: "close", score: 0.35,
        line: "You did not shoot, but you had the puck in a good spot in front of their net for about " + plural(waited, "second", "seconds") + ".",
        tip: "From there, shoot: tap Shoot twice." };
      return { id: "shooting", title: "Shooting", grade: "none", line: "You did not shoot in this game.", tip: "" };
    }
    var goals = count(t.shots, "goal"), over = count(t.shots, "over"), wide = count(t.shots, "wide"), blocked = count(t.shots, "blocked");
    var fromGood = t.shots.filter(function (x) { return x.chance >= GOOD_SHOT; }).length, poor = n - fromGood;
    var green = G.greens(s.lv, "shoot").power, soft = t.shots.filter(function (x) { return x.power < green[0]; }).length;
    var line = "You shot " + plural(n, "time", "times") + " and scored " + goals + ". " +
      (fromGood ? fromGood + " " + (fromGood === 1 ? "shot was" : "shots were") + " from a good spot in front of the net" : "None of them was from a good spot") +
      (poor && fromGood ? ", " + poor + " from far out or from the side" : "") + "." +
      (over ? " " + times(over) + " the puck went over the net." : "") +
      (wide ? " " + times(wide) + " it missed beside the net." : "") +
      (blocked ? " " + times(blocked) + " a defender blocked it." : "");
    var onNet = (n - over - wide) / n, spot = fromGood / n, score = 0.6 * spot + 0.4 * onNet;
    var tip = "Keep shooting from in front of the net.";
    if (spot < 0.5) tip = "Skate to the middle, in front of their net, before you shoot. Or pass to the teammate who is there.";
    else if (over >= 1 && over >= wide) tip = "Stop the Height mark lower: the top of the green part is just under the crossbar.";
    else if (wide >= 2) tip = "Stop the Power mark in the green: past it, a shot is harder to aim.";
    else if (soft > n / 2) tip = "Shoot harder: stop the Power mark in the green part, not below it.";
    else if (blocked >= 2) tip = "A defender in the way blocks a low shot. Move sideways first, or lift it.";
    return { id: "shooting", title: "Shooting", score: score, line: line, tip: tip,
             grade: score >= 0.7 ? "good" : score >= 0.45 ? "close" : "far",
             praise: goals ? "You scored " + plural(goals, "goal", "goals") + "." : fromGood + " of your " + plural(n, "shot", "shots") + " came from a good spot." };
  }

  function taking(t) {
    var k = t.takes, tries = k.far + k.miss + k.won;
    if (!tries) return { id: "taking", title: "Taking the puck", grade: "none", line: "You did not try to take the puck from the other team.", tip: t.lost.total ? "" : "When they have the puck, skate to the player who has it and press Take." };
    var line = "You tried to take the puck " + plural(tries, "time", "times") + " and won it " + plural(k.won, "time", "times") + "." +
      (k.far ? " " + times(k.far) + " you were too far away." : "");
    var score = Math.max(0, k.won / tries + (k.far / tries > 0.5 ? -0.3 : 0));
    var tip = "Keep going at the puck carrier from the front.";
    if (k.far >= Math.max(1, tries / 3)) tip = "Get close first: Take only works within a stick's length of the player with the puck.";
    else if (k.won < tries / 3) tip = "Come at the puck carrier from the front, not from behind. And wait a moment after their quick move.";
    return { id: "taking", title: "Taking the puck", score: score, line: line, tip: tip,
             grade: k.far / tries > 0.5 ? "far" : score >= 0.4 ? "good" : score >= 0.2 ? "close" : "far",
             praise: "You took the puck away " + plural(k.won, "time", "times") + "." };
  }

  function whistles(t) {
    var early = t.offside.early, brought = t.offside.brought, total = early + brought + t.icing;
    if (!total) return { id: "whistles", title: "Whistles on you", grade: "good", score: 1, line: "No whistle was your doing: no offside, no icing.", tip: "",
                         praise: "No offside and no icing was your doing." };
    var line = (early ? times(early) + " you were inside their blue line before the puck (offside). " : "") +
      (brought ? times(brought) + " you brought or passed the puck in while a teammate was still inside (offside). " : "") +
      (t.icing ? times(t.icing) + " your puck went all the way down the ice untouched (icing)." : "");
    var tip = early >= brought && early ? "Wait at their blue line until the puck has crossed it. Then go."
      : brought ? "Look at your teammates before you cross their blue line. If one is inside, wait for them to come out."
      : "From your own half, pass to a teammate instead of sending the puck all the way down.";
    return { id: "whistles", title: "Whistles on you", score: total === 1 ? 0.5 : Math.max(0, 0.4 - 0.1 * total), line: line.trim(), tip: tip,
             grade: total === 1 ? "close" : "far" };
  }

  function faceoffs(t) {
    var f = t.faceoffs, n = f.won + f.lost + f.early;
    if (!n) return null;
    var line = "You won " + f.won + " of " + plural(n, "face-off", "face-offs") + "." + (f.early ? " " + times(f.early) + " you moved before the puck dropped." : "");
    var score = f.won / n;
    return { id: "faceoffs", title: "Face-offs", score: score, line: line,
             tip: f.early ? "Wait for the puck to leave the referee's hand, then tap Pass." : score < 0.5 ? "Watch the puck, not the other center, and tap Pass the moment it drops." : "Keep watching the puck.",
             grade: score >= 0.5 ? "good" : score >= 0.3 ? "close" : "far",
             praise: "You won " + f.won + " of " + plural(n, "face-off", "face-offs") + "." };
  }

  // Write the report.
  //   Returns { well: [sentences], next: { title, tip }, cards: [ ... ] }
  function build(t, s) {
    var cards = [position(t, s), passing(t), shooting(t, s), taking(t), whistles(t), faceoffs(t)].filter(Boolean);
    cards.forEach(function (c) { c.word = WORDS[c.grade]; });
    var seen = cards.filter(function (c) { return c.grade !== "none"; });
    // The two best things.
    var well = seen.filter(function (c) { return c.grade === "good"; })
      .sort(function (x, y) { return y.score - x.score; }).slice(0, 2).map(function (c) { return c.praise; });
    if (!well.length) well = ["You played the whole game and kept going."];
    // The one weakest thing.
    var weak = seen.filter(function (c) { return c.grade !== "good"; }).sort(function (x, y) { return x.score - y.score; })[0];
    var next = weak ? { title: weak.title, tip: weak.tip }
      : { title: "A harder game", tip: "Every part of your game was good. Try the next age group." };
    return { well: well, next: next, cards: cards };
  }

  var api = { start: start, watch: watch, build: build, NEAR: NEAR, CLOSE: CLOSE, GOOD_SHOT: GOOD_SHOT, OPEN: OPEN, WORDS: WORDS };
  if (node) module.exports = api;
  else root.CoachReport = api;
})(typeof window !== "undefined" ? window : globalThis);
