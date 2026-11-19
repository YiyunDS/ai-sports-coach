// =====================================================================
//  refplays.js  --  THE PLAYS AND THE RULES OF "YOU MAKE THE CALL"
//
//  In this game YOU are the referee. You watch a short play and decide:
//  offside, icing, or a good play?
//
//  This file does two separate jobs:
//    1. makePlay  builds a little play: who skates where and where the
//                 puck goes, moment by moment.
//    2. judge     looks ONLY at where the skates and the puck were, and
//                 makes the call from the rule book. It does not know
//                 what the play was "meant" to be.
//  Because the two are separate, the tests can check that the judge
//  really agrees with every play we build.
//
//  THE RULES WE USE (USA Hockey, for players 12 and under):
//    OFFSIDE  An attacker may not be in the other team's zone before
//             the puck. We look at the moment the whole puck is over
//             the blue line. A player is offside when BOTH skates are
//             completely over the line by then. One skate still on the
//             line is fine. The stick does not count. The whistle blows
//             right away (there is no "tag-up" at this age).
//    ICING    A player shoots the puck from their own half of the rink
//             (behind the center red line) and it goes all the way
//             over the far goal line without anyone touching it.
//             Not icing: it goes in the net (a goal!), someone on the
//             other team plays it first, or it stops before the line.
//             In youth hockey a team that is short a player (killing a
//             penalty) is NOT allowed to ice the puck either.
//
//  We measure the rink in feet, like positions.js:
//     a = across (0 to 85), d = up the ice (0 to 200). The blue team
//     attacks UP the ice, toward the net at d = 189.
//
//  No drawing in this file, so we can test it:
//      node tests/refplays.test.js
// =====================================================================
(function (root) {
  "use strict";

  var W = 85;
  var BLUE = 126;        // the far edge of the attacking blue line (the line is 1 foot wide: 125 to 126)
  var RED = 99.5;        // the edge of the center red line on the shooter's own side
  var GOAL_LINE = 189.2; // the far edge of their goal line
  var NET = { from: 39.5, to: 45.5 };  // the goal mouth, across the ice
  var PUCK = 0.125;      // half the width of a puck (it is 3 inches wide)
  // A skater's two skates: one a bit ahead of the body, one behind.
  // "heel" = the back end of a skate. A skate is 1 foot long.
  var FRONT_HEEL = 0.5, BACK_HEEL = -1.5, SKATE_LENGTH = 1, SKATE_APART = 0.9;

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // ---------- Things that move ------------------------------------------
  // A "track" is a list of moments: [{ t: seconds, a, d }, ...].
  // Between two moments the thing moves in a straight line.
  function where(track, t) {
    if (t <= track[0].t) return { a: track[0].a, d: track[0].d };
    for (var i = 1; i < track.length; i++) {
      if (t <= track[i].t) {
        var p = track[i - 1], q = track[i], k = (t - p.t) / (q.t - p.t || 1);
        return { a: p.a + (q.a - p.a) * k, d: p.d + (q.d - p.d) * k };
      }
    }
    var last = track[track.length - 1];
    return { a: last.a, d: last.d };
  }
  // Where the two skates of a skater are. Each: { a, heel, toe }.
  function skatesOf(body) {
    return [
      { a: body.a - SKATE_APART, heel: body.d + BACK_HEEL, toe: body.d + BACK_HEEL + SKATE_LENGTH },
      { a: body.a + SKATE_APART, heel: body.d + FRONT_HEEL, toe: body.d + FRONT_HEEL + SKATE_LENGTH }
    ];
  }
  // Everything at one moment of a play: the puck and every skater.
  function at(play, t) {
    return {
      puck: where(play.tracks.puck, t),
      skaters: play.skaters.map(function (s) {
        var p = where(play.tracks[s.id], t);
        return { id: s.id, team: s.team, label: s.label, name: s.name, a: p.a, d: p.d, skates: skatesOf(p) };
      })
    };
  }

  // =====================================================================
  //  THE JUDGE
  //  Looks at a play moment by moment (100 looks per second) and makes
  //  the call. Returns:
  //    { call: "offside" | "icing" | "ok",
  //      reason: a short word for WHY (see REASONS below),
  //      t: the moment that decided it, who: the skater it is about,
  //      spot: where on the ice to look }
  // =====================================================================
  function judge(play) {
    var step = 0.01, touches = play.touches.slice().sort(function (x, y) { return x.t - y.t; });
    var shot = null;          // the last time the attacking team shot the puck away
    var entry = null;         // what we saw when the puck crossed the blue line
    var before = at(play, 0), next = 0;

    for (var t = 0; t <= play.duration + step; t += step) {
      var now = at(play, t);
      // Who played the puck in this moment?
      while (next < touches.length && touches[next].t <= t) {
        var touch = touches[next++];
        if (touch.type === "shot") shot = { t: touch.t, from: where(play.tracks.puck, touch.t), touched: false };
        else if (shot && touch.t > shot.t) shot.touched = touch;   // somebody got to the shot
      }

      // OFFSIDE: the moment the whole puck is over the blue line.
      if (!entry && before.puck.d - PUCK <= BLUE && now.puck.d - PUCK > BLUE) {
        var deepest = null, offside = null;
        now.skaters.forEach(function (s) {
          if (s.team !== "att") return;
          var bothOver = s.skates[0].heel > BLUE && s.skates[1].heel > BLUE;
          if (bothOver && (!offside || s.d > offside.d)) offside = s;
          if (!deepest || s.d > deepest.d) deepest = s;
        });
        if (offside) return { call: "offside", reason: "offside", t: t, who: offside.id, spot: { a: offside.a, d: BLUE } };
        // Nobody was offside. Was it close (one skate over, one still on the line)?
        var oneOver = deepest.skates[1].toe > BLUE;
        entry = { t: t, who: deepest.id, reason: oneOver ? "onside-close" : "onside", spot: { a: deepest.a, d: BLUE } };
      }

      // ICING: a shot that goes all the way over the goal line.
      if (shot && !shot.touched && before.puck.d - PUCK <= GOAL_LINE && now.puck.d - PUCK > GOAL_LINE) {
        var spot = { a: now.puck.a, d: GOAL_LINE };
        if (now.puck.a > NET.from && now.puck.a < NET.to) return { call: "ok", reason: "goal", t: t, spot: spot, from: shot.from };
        if (shot.from.d + PUCK < RED) {
          return { call: "icing", reason: play.shorthanded ? "icing-shorthanded" : "icing", t: t, spot: spot, from: shot.from };
        }
        return { call: "ok", reason: "past-red", t: t, spot: spot, from: shot.from };
      }
      before = now;
    }

    // No whistle. Say what the play was about.
    if (shot) {
      var end = where(play.tracks.puck, play.duration);
      if (shot.touched) return { call: "ok", reason: "touched", t: shot.touched.t, who: shot.touched.who, spot: where(play.tracks.puck, shot.touched.t), from: shot.from };
      if (shot.from.d + PUCK >= RED) return { call: "ok", reason: "past-red", t: shot.t, spot: shot.from, from: shot.from };
      return { call: "ok", reason: "short", t: play.duration, spot: end, from: shot.from };
    }
    if (entry) return { call: "ok", reason: entry.reason, t: entry.t, who: entry.who, spot: entry.spot };
    return { call: "ok", reason: "nothing", t: play.duration, spot: where(play.tracks.puck, play.duration) };
  }

  // Why, in words a young player can read.
  var REASONS = {
    "offside": "Offside. The blue {who} had BOTH skates all the way over the blue line before the puck got there. At your age the whistle blows right away.",
    "onside": "Good play. When the puck crossed the blue line, every blue player was still behind it. The puck must go in first.",
    "onside-close": "Good play, and a close one! One skate of the blue {who} was already over the blue line, but the other was not all the way over yet. You are only offside when BOTH skates are completely over.",
    "icing": "Icing. The puck was shot from blue's own half of the rink and went all the way over the far goal line with nobody touching it.",
    "icing-shorthanded": "Icing. Blue is killing a penalty. In the NHL a team that is short a player may ice the puck, but in youth hockey (14 and under) it may not.",
    "past-red": "Good play. The shooter was already over the center red line, so shooting the puck deep is allowed. That is called a dump-in.",
    "touched": "Good play. A player from the other team got to the puck before it reached the goal line, so it is not icing.",
    "goal": "Goal! A puck that goes into the net is never icing, no matter how far away it was shot from.",
    "short": "Good play. The puck stopped before the goal line. It is only icing when the puck goes all the way over the line.",
    "nothing": "Good play. Nothing happened that needs a whistle."
  };
  var CALL_WORDS = { offside: "Offside", icing: "Icing", ok: "Good play" };
  function explain(play, result) {
    var who = play.skaters.filter(function (s) { return s.id === result.who; })[0];
    return REASONS[result.reason].replace("{who}", who ? who.name : "player");
  }

  // =====================================================================
  //  BUILDING THE PLAYS
  //  level 1 = clear calls, 2 = close calls and trickier ones,
  //  3 = everything, and faster.
  // =====================================================================
  var KINDS = {
    "offside-carry": { call: "offside", level: 1, rule: "offside" },
    "onside-carry": { call: "ok", level: 1, rule: "offside" },
    "offside-pass": { call: "offside", level: 1, rule: "offside" },
    "onside-pass": { call: "ok", level: 1, rule: "offside" },
    "icing": { call: "icing", level: 1, rule: "icing" },
    "dump-in": { call: "ok", level: 1, rule: "icing" },
    "icing-touched": { call: "ok", level: 2, rule: "icing" },
    "icing-short": { call: "ok", level: 2, rule: "icing" },
    "icing-goal": { call: "ok", level: 2, rule: "icing" },
    "icing-shorthanded": { call: "icing", level: 3, rule: "icing" }
  };

  function makePlay(kind, level, dice) {
    if (!KINDS[kind]) throw new Error("No such play: " + kind);
    level = level || 1;
    function rnd(lo, hi) { return lo + (hi - lo) * dice(); }
    var fast = level >= 3 ? 1.2 : 1;
    var play = { kind: kind, level: level, rule: KINDS[kind].rule, skaters: [], tracks: {}, touches: [], shorthanded: false, duration: 3 };
    function add(id, team, label, name, track) {
      play.skaters.push({ id: id, team: team, label: label, name: name });
      play.tracks[id] = track;
    }
    // A skater going straight up the ice from one depth to another.
    function straight(a, from, to, speed, t0) {
      t0 = t0 || 0;
      return [{ t: 0, a: a, d: from }, { t: t0, a: a, d: from }, { t: t0 + Math.abs(to - from) / speed, a: a, d: to }];
    }
    // How far inside (+) or behind (-) the line is the other attacker
    // when the puck crosses? Level 1: plain to see. Higher: a close call.
    function margin(offside) {
      if (level === 1) return offside ? rnd(5, 11) : -rnd(5, 12);
      return offside ? rnd(0.8, 2.5) : -rnd(0.5, 2.2);
    }
    var allOver = BLUE - BACK_HEEL;   // a body this deep has both skates completely over the line (127.5)

    if (kind === "offside-carry" || kind === "onside-carry") {
      // The center carries the puck over the blue line. Where is the winger?
      var v = rnd(22, 26) * fast, a0 = rnd(32, 44);
      add("C", "att", "C", "center", straight(a0, 96, 156, v));
      play.tracks.puck = play.tracks.C.map(function (p) { return { t: p.t, a: p.a, d: p.d + 3 }; });
      var cross = (BLUE + PUCK - 99) / v;                       // when the puck is over the line
      var deep = allOver + margin(kind === "offside-carry"), vw = v * rnd(0.92, 1.04);
      add("W", "att", "W", "winger", [{ t: 0, a: a0 - 24, d: deep - vw * cross }, { t: cross + (166 - deep) / vw, a: a0 - 24, d: 166 }]);
      add("D", "att", "D", "defender", straight(a0 + 16, 78, 120, v * 0.8));
      add("X1", "def", "", "", straight(a0 - 6, 138, 168, v * 0.6));
      add("X2", "def", "", "", straight(a0 + 18, 142, 170, v * 0.6));
      play.touches.push({ t: 0, team: "att", who: "C", type: "carry" });
      play.duration = cross + 1.1;
    } else if (kind === "offside-pass" || kind === "onside-pass") {
      // A pass over the blue line. Was the receiver already in the zone?
      var a1 = rnd(22, 34), lane = a1 + rnd(26, 32), passAt = 0.8, speed = 62;
      var d0 = rnd(104, 110), deepR = allOver + margin(kind === "offside-pass"), vr = 24 * fast;
      var target = Math.max(deepR + 9, 135);                     // where the pass is aimed
      var reach = Math.sqrt((lane - a1) * (lane - a1) + (target - d0) * (target - d0));
      var flight = reach / speed, arrive = passAt + flight;
      var crossP = passAt + flight * (BLUE + PUCK - d0) / (target - d0);
      add("P", "att", "D", "defender", [{ t: 0, a: a1, d: d0 - 6 }, { t: passAt, a: a1, d: d0 - 3 }, { t: arrive + 1, a: a1, d: d0 + 8 }]);
      // The receiver skates at a steady speed, so we know exactly where
      // they are when the puck crosses the line. Then they pick up the pass.
      var there = crossP + (target - 3 - deepR) / vr, catchAt = Math.max(arrive, there) + 0.01;
      add("R", "att", "W", "winger", [{ t: 0, a: lane, d: deepR - vr * crossP }, { t: there, a: lane, d: target - 3 },
                                      { t: catchAt, a: lane, d: target - 3 }, { t: catchAt + 0.9, a: lane, d: target + 12 }]);
      play.tracks.puck = [{ t: 0, a: a1, d: d0 - 3 }, { t: passAt, a: a1, d: d0 }, { t: arrive, a: lane, d: target },
                          { t: catchAt, a: lane, d: target }, { t: catchAt + 0.9, a: lane, d: target + 15 }];
      add("C", "att", "C", "center", straight((a1 + lane) / 2, 100, 123, 14 * fast));
      add("X1", "def", "", "", straight(a1 + 8, 136, 160, 12));
      add("X2", "def", "", "", straight(lane - 9, 150, 172, 12));
      play.touches.push({ t: 0, team: "att", who: "P", type: "carry" }, { t: passAt, team: "att", who: "P", type: "pass" },
                        { t: catchAt, team: "att", who: "R", type: "receive" });
      play.duration = catchAt + 0.9;
    } else {
      // A long shot down the ice.
      var past = kind === "dump-in";
      var from = past ? (level === 1 ? rnd(106, 118) : rnd(103.5, 108)) : (level === 1 ? rnd(48, 84) : rnd(70, 95.5));
      var aS = rnd(20, 38), shootAt = 0.7, puckSpeed = 88 * fast;
      var wide = dice() < 0.5 ? rnd(9, 30) : rnd(55, 76);        // where it crosses the goal line: beside the net
      var endSpot = { a: wide, d: 197 };
      if (kind === "icing-goal") endSpot = { a: rnd(40.7, 44.3), d: 191.6 };
      add("S", "att", "D", "defender", [{ t: 0, a: aS, d: from - 8 }, { t: shootAt, a: aS, d: from - 3 }, { t: shootAt + 2, a: aS, d: from + 2 }]);
      add("C", "att", "C", "center", straight(aS + 22, Math.min(from + 14, 120), Math.min(from + 40, 124), 15));
      add("W", "att", "W", "winger", straight(aS + 42, Math.min(from + 10, 118), Math.min(from + 36, 123), 15));
      // The other team: two defenders well away from where the puck goes.
      var away = wide < W / 2 ? 62 : 22;
      add("X1", "def", "", "", straight(away, 150, 168, 9));
      add("X2", "def", "", "", straight(away + (away > 40 ? -14 : 14), 140, 158, 9));
      var start = { a: aS, d: from };
      var puck = [{ t: 0, a: aS, d: from - 5 }, { t: shootAt, a: start.a, d: start.d }];
      function along(k) { return { a: start.a + (endSpot.a - start.a) * k, d: start.d + (endSpot.d - start.d) * k }; }
      var whole = Math.sqrt(Math.pow(endSpot.a - start.a, 2) + Math.pow(endSpot.d - start.d, 2)) / puckSpeed;
      play.touches.push({ t: 0, team: "att", who: "S", type: "carry" }, { t: shootAt, team: "att", who: "S", type: "shot" });
      if (kind === "icing-touched") {
        // A defender is standing in the way and stops the puck.
        var k = (rnd(142, 170) - start.d) / (endSpot.d - start.d), stop = along(k), tStop = shootAt + whole * k;
        play.tracks.X1 = [{ t: 0, a: stop.a + 6, d: stop.d + 2 }, { t: tStop, a: stop.a + 1, d: stop.d + 1.5 }, { t: tStop + 1, a: stop.a + 3, d: stop.d - 6 }];
        puck.push({ t: tStop, a: stop.a, d: stop.d }, { t: tStop + 1, a: stop.a + 2, d: stop.d - 8 });
        play.touches.push({ t: tStop, team: "def", who: "X1", type: "touch" });
        play.duration = tStop + 1;
      } else if (kind === "icing-short") {
        // Not hard enough: the puck slows down and stops before the goal line.
        var kStop = (rnd(174, 185) - start.d) / (endSpot.d - start.d), mid = along(kStop * 0.8), rest = along(kStop);
        puck.push({ t: shootAt + whole * kStop * 0.9, a: mid.a, d: mid.d }, { t: shootAt + whole * kStop * 0.9 + 1.2, a: rest.a, d: rest.d });
        play.duration = shootAt + whole * kStop * 0.9 + 1.7;
      } else {
        puck.push({ t: shootAt + whole, a: endSpot.a, d: endSpot.d });
        play.duration = shootAt + whole + 0.6;
      }
      play.tracks.puck = puck;
      if (kind === "icing-shorthanded") {
        // Blue is killing a penalty: one skater fewer on the ice.
        play.shorthanded = true;
        play.skaters = play.skaters.filter(function (s) { return s.id !== "W"; });
        delete play.tracks.W;
      }
    }

    // Half of the plays happen on the other side of the ice.
    if (dice() < 0.5) {
      Object.keys(play.tracks).forEach(function (id) {
        play.tracks[id] = play.tracks[id].map(function (p) { return { t: p.t, a: W - p.a, d: p.d }; });
      });
    }
    // Nobody skates through the boards.
    Object.keys(play.tracks).forEach(function (id) {
      play.tracks[id].forEach(function (p) { p.a = clamp(p.a, 3, W - 3); p.d = clamp(p.d, 3, 197); });
    });
    return play;
  }

  // Pick the next play for a level: about half need a whistle, and not
  // the same kind twice in a row.
  function deal(level, dice, lastKind) {
    var kinds = Object.keys(KINDS).filter(function (k) { return KINDS[k].level <= level && k !== lastKind; });
    var whistle = dice() < 0.5;
    var pool = kinds.filter(function (k) { return (KINDS[k].call !== "ok") === whistle; });
    if (!pool.length) pool = kinds;
    return makePlay(pool[Math.floor(dice() * pool.length)], level, dice);
  }

  var api = {
    BLUE: BLUE, RED: RED, GOAL_LINE: GOAL_LINE, NET: NET, KINDS: KINDS, CALL_WORDS: CALL_WORDS, REASONS: REASONS,
    where: where, skatesOf: skatesOf, at: at, judge: judge, explain: explain, makePlay: makePlay, deal: deal
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachRef = api;
})(typeof window !== "undefined" ? window : globalThis);
