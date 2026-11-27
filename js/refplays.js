// =====================================================================
//  refplays.js  --  THE PLAYS AND THE RULES OF "YOU MAKE THE CALL"
//
//  In this game YOU are the referee. You watch a short play and decide:
//  offside, icing, or a good play?
//
//  This file does two separate jobs:
//    1. makePlay  builds a little play: who skates where and where the
//                 puck goes, moment by moment.
//    2. judge     looks ONLY at where the skates and the puck were and
//                 who played the puck, and makes the call from the rule
//                 book. It does not know what the play was "meant" to be.
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
//             It does not matter HOW the puck goes in: carried, passed
//             or shot in from far away.
//             When the puck comes OUT of the zone, every attacker has
//             to get a skate back on the blue line before the puck goes
//             in again.
//             Two times it is NOT offside (rule 630 b):
//               - The player who has the puck on the stick may cross
//                 the line ahead of it (for example skating backward).
//                 They must have had the puck before their skates left
//                 the neutral zone.
//               - A player of the OTHER team carries or passes the puck
//                 back into their own zone while an attacker is in there.
//    ICING    A player shoots or passes the puck from their own half of
//             the rink (behind the center red line) and it goes all the
//             way over the far goal line.
//             The LAST touch by that team is the one that counts: if a
//             teammate tips the puck behind the red line it is still
//             icing; if the teammate tips it past the red line it is not.
//             Not icing: it goes in the net (a goal!), someone on the
//             other team plays it first, a teammate catches it, or it
//             stops before the line.
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
  var LINE_WIDE = 1;     // how wide the blue line is
  var RED = 99.5;        // the edge of the center red line on the shooter's own side
  var GOAL_LINE = 189.2; // the far edge of their goal line
  var NET = { from: 39.5, to: 45.5 };  // the goal mouth, across the ice
  var PUCK = 0.125;      // half the width of a puck (it is 3 inches wide)
  // A skater's two skates: one a bit ahead of the body, one behind.
  // "heel" = the back end of a skate. A skate is 1 foot long.
  var FRONT_HEEL = 0.5, BACK_HEEL = -1.5, SKATE_LENGTH = 1, SKATE_APART = 0.9;
  var NAMES = { C: "center", W: "winger", D: "defender" };

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  // How far apart two spots on the ice are, in feet.
  function apart(p, q) { return Math.sqrt((p.a - q.a) * (p.a - q.a) + (p.d - q.d) * (p.d - q.d)); }
  // A list in a new, mixed-up order (the dice decide).
  function mixed(list, dice) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(dice() * (i + 1)), keep = out[i];
      out[i] = out[j]; out[j] = keep;
    }
    return out;
  }

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
  // Are BOTH skates completely over the blue line (inside the zone)?
  function bothOver(skater) { return skater.skates[0].heel > BLUE && skater.skates[1].heel > BLUE; }

  // =====================================================================
  //  THE JUDGE
  //  Looks at a play moment by moment (100 looks per second) and makes
  //  the call. Returns:
  //    { call: "offside" | "icing" | "ok",
  //      reason: a short word for WHY (see REASONS below),
  //      t: the moment that decided it, who: the skater it is about,
  //      spot: where on the ice to look }
  //
  //  What a "touch" in play.touches can be:
  //    carry, receive  the player has the puck on the stick
  //    shot, pass, tip the player sends the puck away (a tip is a puck
  //                    that was already moving and only changes its way)
  //    touch           the player stops or bumps the puck
  // =====================================================================
  function judge(play) {
    var step = 0.01, touches = play.touches.slice().sort(function (x, y) { return x.t - y.t; });
    var shot = null;          // the last time the attacking team sent the puck away
    var holder = null;        // who has the puck on the stick right now
    var last = null;          // the last player who played the puck at all
    var entry = null;         // what we saw the last time the puck crossed the blue line
    var before = at(play, 0), next = 0;
    var inZone = before.puck.d - PUCK > BLUE;   // is the whole puck inside the attacking zone?
    var cameOut = false;                        // was the puck in the zone and did it come out again?
    function find(list, id) { return list.filter(function (s) { return s.id === id; })[0]; }

    for (var t = 0; t <= play.duration + step; t += step) {
      var now = at(play, t);
      // Who played the puck in this moment?
      while (next < touches.length && touches[next].t <= t) {
        var touch = touches[next++];
        var sent = touch.type === "shot" || touch.type === "pass" || touch.type === "tip";
        if (sent && touch.team === "att") {
          // The LAST blue player to send the puck is the one that counts for icing.
          shot = { t: touch.t, from: where(play.tracks.puck, touch.t), who: touch.who, how: touch.type, touched: null };
        } else if (shot && !shot.touched) shot.touched = touch;   // somebody got to the shot
        if (sent) holder = null;
        else if (!holder || holder.who !== touch.who) {
          // Remember if this player had a skate outside the zone when they got the puck.
          var got = find(at(play, touch.t).skaters, touch.who);
          holder = { who: touch.who, outside: !!got && !bothOver(got) };
        }
        last = touch;
      }

      if (inZone && now.puck.d + PUCK < BLUE - LINE_WIDE) {
        // The whole puck is out of the zone again (over the near edge of the line).
        inZone = false;
        cameOut = true;
        // Whoever has the puck now must have a skate outside to go in ahead of it again.
        var has = holder && find(now.skaters, holder.who);
        if (has) holder.outside = !bothOver(has);
      } else if (!inZone && now.puck.d - PUCK > BLUE) {
        // OFFSIDE: the moment the whole puck is over the blue line.
        inZone = true;
        var deepest = null, offside = null, first = null;
        now.skaters.forEach(function (s) {
          if (s.team !== "att") return;
          var over = bothOver(s);
          // The player who has the puck may go in ahead of it.
          if (over && holder && holder.who === s.id && holder.outside) { first = s; return; }
          if (over && (!offside || s.d > offside.d)) offside = s;
          if (!deepest || s.d > deepest.d) deepest = s;
        });
        // Did the OTHER team carry or pass the puck back into their own zone?
        var theirs = last && last.team === "def" && (last.type === "carry" || last.type === "pass" || last.type === "receive");
        var shotIn = shot && !shot.touched && shot.how === "shot";
        if (offside && !theirs) {
          var why = cameOut ? "offside-again" : holder && holder.who === offside.id ? "offside-reach" : shotIn ? "offside-dump" : "offside";
          return { call: "offside", reason: why, t: t, who: offside.id, spot: { a: offside.a, d: BLUE } };
        }
        if (offside) entry = { t: t, who: offside.id, reason: "defender-back", spot: { a: offside.a, d: BLUE } };
        else if (first && !theirs) entry = { t: t, who: first.id, reason: "carrier-first", spot: { a: first.a, d: BLUE } };
        else if (deepest && !theirs) {
          // Nobody was offside. Was it close (one skate over, one still on the line)?
          var oneOver = deepest.skates[1].toe > BLUE;
          var reason = cameOut ? (oneOver ? "onside-again-close" : "onside-again") : oneOver ? "onside-close" : shotIn ? "onside-dump" : "onside";
          entry = { t: t, who: deepest.id, reason: reason, spot: { a: deepest.a, d: BLUE } };
        }
      }

      // ICING: a shot that goes all the way over the goal line.
      if (shot && !shot.touched && before.puck.d - PUCK <= GOAL_LINE && now.puck.d - PUCK > GOAL_LINE) {
        var spot = { a: now.puck.a, d: GOAL_LINE }, tipped = shot.how === "tip";
        if (now.puck.a > NET.from && now.puck.a < NET.to) return { call: "ok", reason: "goal", t: t, spot: spot, from: shot.from };
        if (shot.from.d + PUCK < RED) {
          var icing = play.shorthanded ? "icing-shorthanded" : tipped ? "icing-tipped" : shot.how === "pass" ? "icing-pass" : "icing";
          return { call: "icing", reason: icing, t: t, who: tipped ? shot.who : undefined, spot: spot, from: shot.from };
        }
        return { call: "ok", reason: tipped ? "past-red-tip" : "past-red", t: t, who: tipped ? shot.who : undefined, spot: spot, from: shot.from };
      }
      before = now;
    }

    // No whistle. Say what the play was about.
    if (shot && shot.from.d + PUCK < RED) {
      // A long shot from blue's own half that did not become icing.
      if (shot.touched) {
        var mate = shot.touched.team === "att";
        return { call: "ok", reason: mate ? "caught" : "touched", t: shot.touched.t, who: shot.touched.who,
                 spot: where(play.tracks.puck, shot.touched.t), from: shot.from };
      }
      return { call: "ok", reason: "short", t: play.duration, spot: where(play.tracks.puck, play.duration), from: shot.from };
    }
    if (entry) return { call: "ok", reason: entry.reason, t: entry.t, who: entry.who, spot: entry.spot };
    if (shot) return { call: "ok", reason: "past-red", t: shot.t, spot: shot.from, from: shot.from };
    return { call: "ok", reason: "nothing", t: play.duration, spot: where(play.tracks.puck, play.duration) };
  }

  // Why, in words a young player can read.
  var REASONS = {
    "offside": "Offside. The blue {who} had BOTH skates all the way over the blue line before the puck got there. At your age the whistle blows right away.",
    "offside-dump": "Offside. The puck was shot into the zone, but the blue {who} was already in there with BOTH skates over the blue line. The puck must go in first, even when it is shot in.",
    "offside-again": "Offside. The puck came out of the zone and went back in while the blue {who} was still inside. When the puck comes out, every blue player must get a skate back on the blue line.",
    "offside-reach": "Offside. The blue {who} had BOTH skates over the blue line and reached back with the stick to pull the puck in. The stick does not count: the skates were in before the puck.",
    "onside": "Good play. When the puck crossed the blue line, every blue player was still behind it. The puck must go in first.",
    "onside-close": "Good play, and a close one! One skate of the blue {who} was over the blue line, but the other was not all the way over yet. Offside needs BOTH skates completely over.",
    "onside-dump": "Good play. The puck was shot into the zone, and every blue player was still behind the blue line when it crossed. Now they may chase it.",
    "onside-again": "Good play. The puck came out of the zone, and every blue player got back to the blue line before it went in again.",
    "onside-again-close": "Good play, and a close one! The puck came out, and the blue {who} got one skate back on the blue line just before it went in again. One skate on the line is enough.",
    "carrier-first": "Good play. The blue {who} went over the blue line before the puck, but had the puck on the stick the whole time. The player who controls the puck may cross the line ahead of it.",
    "defender-back": "Good play. A red player took the puck back into their own zone. When the other team carries or passes the puck back in, the blue {who} who is still in there is not offside.",
    "icing": "Icing. The puck was shot from blue's own half of the rink and went all the way over the far goal line with nobody touching it.",
    "icing-pass": "Icing. It was meant as a long pass, but no blue teammate got to it. The puck left the stick in blue's own half of the rink and went all the way over the far goal line.",
    "icing-tipped": "Icing. The blue {who} tipped the puck, but that was still behind the center red line. The last blue touch is the one that counts, and the puck went all the way over the far goal line.",
    "icing-shorthanded": "Icing. Blue is killing a penalty. In the NHL a team that is short a player may ice the puck, but in youth hockey (14 and under) it may not.",
    "past-red": "Good play. The shooter was already over the center red line, so shooting the puck deep is allowed. That is called a dump-in.",
    "past-red-tip": "Good play. The blue {who} tipped the puck after it was over the center red line. The last blue touch is the one that counts, so it is not icing.",
    "touched": "Good play. A player from the other team got to the puck before it reached the goal line, so it is not icing.",
    "caught": "Good play. The blue {who} caught the long pass before it got to the goal line. It is only icing when the puck goes all the way over the goal line.",
    "goal": "Goal! A puck that goes into the net is never icing, no matter how far away it was shot from.",
    "short": "Good play. The puck stopped before the goal line. It is only icing when the puck goes all the way over the line.",
    "nothing": "Good play. Nothing happened that needs a whistle."
  };
  // One more sentence when the offside player was far away from the puck.
  var FAR_AWAY = " Watch the whole blue line, not only the puck.";
  var CALL_WORDS = { offside: "Offside", icing: "Icing", ok: "Good play" };
  function explain(play, result) {
    var who = play.skaters.filter(function (s) { return s.id === result.who; })[0];
    var words = REASONS[result.reason].replace("{who}", who ? who.name : "player");
    if (who && result.reason === "offside") {
      var now = at(play, result.t), here = now.skaters.filter(function (s) { return s.id === result.who; })[0];
      if (Math.abs(here.a - now.puck.a) > 30) words += FAR_AWAY;
    }
    return words;
  }

  // =====================================================================
  //  BUILDING THE PLAYS
  //  level 1 = clear calls, 2 = close calls and trickier ones,
  //  3 = everything, and faster.
  //  call  = what the referee should say.
  //  rule  = which rule the play is about (the page lights up the blue
  //          line for "offside" and the red line for "icing").
  //  from  = the page shows the rink from this depth up. Plays at the
  //          blue line show only that end, so everything is bigger.
  // =====================================================================
  var KINDS = {
    // Level 1: plain to see.
    "offside-carry": { call: "offside", level: 1, rule: "offside" },     // carried in, a teammate is in too early
    "onside-carry": { call: "ok", level: 1, rule: "offside" },
    "offside-pass": { call: "offside", level: 1, rule: "offside" },      // a pass over the line to a teammate who is in too early
    "onside-pass": { call: "ok", level: 1, rule: "offside" },
    "offside-dump": { call: "offside", level: 1, rule: "offside" },      // shot in from the neutral zone, a teammate is in too early
    "onside-dump": { call: "ok", level: 1, rule: "offside" },
    "icing": { call: "icing", level: 1, rule: "icing" },
    "dump-in": { call: "ok", level: 1, rule: "icing" },                  // shot from past the red line: never icing
    "icing-pass": { call: "icing", level: 1, rule: "icing" },            // a long pass nobody reaches
    "pass-caught": { call: "ok", level: 1, rule: "icing" },              // the same long pass, caught by a teammate
    // Level 2: close calls and trickier ones.
    "offside-far": { call: "offside", level: 2, rule: "offside" },       // two wingers: the FAR one decides
    "onside-far": { call: "ok", level: 2, rule: "offside" },
    "offside-again": { call: "offside", level: 2, rule: "offside" },     // the puck comes out and goes back in
    "onside-again": { call: "ok", level: 2, rule: "offside" },
    "offside-long-pass": { call: "offside", level: 2, rule: "offside", from: 28 },   // looks like icing, but the whistle comes at the blue line
    "icing-touched": { call: "ok", level: 2, rule: "icing" },
    "icing-short": { call: "ok", level: 2, rule: "icing" },
    "icing-goal": { call: "ok", level: 2, rule: "icing" },
    "icing-tipped": { call: "icing", level: 2, rule: "icing" },          // a teammate tips it, still behind the red line
    // Level 3: everything, faster, and the rules that surprise people.
    "icing-shorthanded": { call: "icing", level: 3, rule: "icing" },
    "tip-past-red": { call: "ok", level: 3, rule: "icing" },             // a teammate tips it past the red line
    "carrier-first": { call: "ok", level: 3, rule: "offside" },          // the puck carrier crosses ahead of the puck
    "offside-reach": { call: "offside", level: 3, rule: "offside" },     // skates in the zone, the stick reaches back for the puck
    "defender-back": { call: "ok", level: 3, rule: "offside" }           // the other team takes the puck back into their own zone
  };
  function kindsFor(level) {
    return Object.keys(KINDS).filter(function (k) { return KINDS[k].level <= level; });
  }

  function makePlay(kind, level, dice) {
    if (!KINDS[kind]) throw new Error("No such play: " + kind);
    level = level || 1;
    function rnd(lo, hi) { return lo + (hi - lo) * dice(); }
    function pick(list) { return list[Math.floor(dice() * list.length)]; }
    var fast = level >= 3 ? 1.2 : 1;
    // key = the skater the call hangs on. Only the tests read it; the judge never does.
    var play = { kind: kind, level: level, rule: KINDS[kind].rule, from: KINDS[kind].from || (KINDS[kind].rule === "offside" ? 70 : 28),
                 key: null, skaters: [], tracks: {}, touches: [], shorthanded: false, duration: 3 };

    // ----- Putting skaters on the ice -----
    // A team has a center, two wingers and two defenders. "spare" = the
    // blue jobs nobody has yet.
    var spare = ["C", "W", "W", "D", "D"], blues = 0, reds = 0;
    function blue(job, track, extra) {
      var id = "B" + (++blues);
      if (spare.indexOf(job) >= 0) spare.splice(spare.indexOf(job), 1);
      play.skaters.push({ id: id, team: "att", label: job, name: NAMES[job], extra: !!extra });
      play.tracks[id] = track;
      return id;
    }
    function red(track, extra) {
      var id = "R" + (++reds);
      play.skaters.push({ id: id, team: "def", label: "", name: "", extra: !!extra });
      play.tracks[id] = track;
      return id;
    }
    function touch(t, who, type) {
      play.touches.push({ t: t, team: who.charAt(0) === "B" ? "att" : "def", who: who, type: type });
    }
    // Who does what: the three jobs in a mixed-up order.
    function jobs() { return mixed(["C", "W", "D"], dice); }

    // ----- Ways to skate -----
    // A skater going straight up the ice from one depth to another.
    function straight(a, from, to, speed, t0) {
      t0 = t0 || 0;
      return [{ t: 0, a: a, d: from }, { t: t0, a: a, d: from }, { t: t0 + Math.abs(to - from) / speed, a: a, d: to }];
    }
    // A skater going straight up the ice at a steady speed who is exactly
    // at depth "deep" at the moment "when". Never starts below "lo" and
    // never goes past "hi".
    function timed(a, deep, when, speed, lo, hi) {
      var start = Math.max(lo, deep - speed * when);
      speed = (deep - start) / when;
      var track = [{ t: 0, a: a, d: start }, { t: when, a: a, d: deep }];
      var end = Math.min(hi, deep + speed * (play.duration - when));
      if (end > deep) track.push({ t: when + (end - deep) / speed, a: a, d: end });
      return track;
    }
    // A teammate who skates up their lane, is exactly at depth "deep"
    // when the puck crosses the blue line (at the moment "cross"), picks
    // up the pass at "target" and skates on with it.
    function receiver(lane, deep, cross, arrive, target, speed, lo) {
      var start = Math.max(lo, deep - speed * cross);
      speed = (deep - start) / cross;
      var there = cross + (target - 3 - deep) / speed, catchAt = Math.max(arrive, there) + 0.01;
      return { catchAt: catchAt, track: [{ t: 0, a: lane, d: start }, { t: there, a: lane, d: target - 3 },
                                         { t: catchAt, a: lane, d: target - 3 }, { t: catchAt + 0.9, a: lane, d: target + 12 }] };
    }
    // The first moment a track is past a depth.
    function whenOver(track, depth) {
      for (var i = 1; i < track.length; i++) {
        var p = track[i - 1], q = track[i];
        if (p.d <= depth && q.d > depth) return p.t + (q.t - p.t) * (depth - p.d) / (q.d - p.d);
      }
      return null;
    }
    // How far inside (+) or behind (-) the line is the other attacker
    // when the puck crosses? Level 1: plain to see. Higher: a close call.
    function margin(offside) {
      if (level === 1) return offside ? rnd(5, 11) : -rnd(5, 12);
      return offside ? rnd(0.8, 2.5) : -rnd(0.5, 2.2);
    }
    var allOver = BLUE - BACK_HEEL;    // a body this deep has both skates completely over the line (127.5)
    var puckOver = BLUE + PUCK;        // the middle of the puck when the whole puck is just over the line

    // ----- Skaters who only stand around -----
    // Is there room for a skater on this track? Not near the puck (so
    // nobody could say they played it) and not on top of somebody else.
    function hasRoom(track) {
      for (var t = 0; t <= play.duration + 0.05; t += 0.1) {
        var me = where(track, t);
        if (apart(me, where(play.tracks.puck, t)) < 9) return false;
        for (var i = 0; i < play.skaters.length; i++) {
          if (apart(me, where(play.tracks[play.skaters[i].id], t)) < 7) return false;
        }
      }
      return true;
    }
    // Put one more skater somewhere between depth "lo" and "hi",
    // drifting a little. They never touch the puck.
    function place(team, lo, hi, extra) {
      var track;
      for (var tries = 0; tries < 80; tries++) {
        var a = rnd(11, 74), d = rnd(lo, hi), on = team === "att" ? rnd(2, 10) : rnd(-4, 8);
        track = [{ t: 0, a: a, d: d }, { t: play.duration, a: clamp(a + rnd(-3, 3), 10, 75), d: clamp(d + on, lo, hi) }];
        if (hasRoom(track)) break;
      }
      return team === "att" ? blue(pick(spare), track, extra) : red(track, extra);
    }

    if (kind === "offside-carry" || kind === "onside-carry" || kind === "offside-far" || kind === "onside-far" || kind === "carrier-first") {
      // ===== SOMEBODY CARRIES THE PUCK OVER THE BLUE LINE =====
      // Where is the teammate at that moment? In the "far" plays there
      // are two wingers: the near one is fine, the far one decides.
      // In "carrier-first" the carrier turns around and goes in backward,
      // ahead of the puck.
      var far = kind.indexOf("-far") > 0, backward = kind === "carrier-first";
      var cast = far ? [pick(["C", "D"]), "W", "W"] : jobs();
      var v = (backward ? rnd(15, 19) : rnd(19, 27)) * fast;
      var d0 = backward ? rnd(90, 100) : rnd(84, 100), ac = far ? rnd(19, 27) : rnd(30, 55);
      var cross, trail = 4;
      if (backward) {
        // First the puck is in front. Then the carrier turns, and the puck trails behind.
        var tTurn = rnd(6, 10) / v, spin = 0.4;
        cross = (puckOver + trail - d0) / v;
        play.duration = cross + 1;
        play.tracks.puck = [{ t: 0, a: ac, d: d0 + 3 }, { t: tTurn, a: ac, d: d0 + v * tTurn + 3 },
                            { t: tTurn + spin, a: ac, d: d0 + v * (tTurn + spin) - trail },
                            { t: play.duration, a: ac, d: d0 + v * play.duration - trail }];
      } else {
        cross = (puckOver - 3 - d0) / v;                          // when the puck is over the line
        play.duration = cross + 1.1;
        play.tracks.puck = [{ t: 0, a: ac, d: d0 + 3 }, { t: play.duration, a: ac, d: d0 + v * play.duration + 3 }];
      }
      var carrier = blue(cast[0], [{ t: 0, a: ac, d: d0 }, { t: play.duration, a: ac, d: d0 + v * play.duration }]);
      var side = dice() < 0.5 ? -1 : 1;
      var deep = allOver + margin(kind.indexOf("offside") === 0), vw = v * rnd(0.88, 1.06);
      if (far) {
        blue("W", timed(clamp(ac - rnd(10, 13), 6, 79), allOver - rnd(5, 10), cross, v * rnd(0.9, 1.02), 74, 168));
        play.key = blue("W", timed(ac + rnd(42, 50), deep, cross, vw, 74, 168));
      } else {
        var mate = blue(cast[1], timed(clamp(ac + side * rnd(16, 26), 6, 79), deep, cross, vw, 74, 168));
        play.key = backward ? carrier : mate;
        var from3 = Math.max(74, d0 - rnd(6, 14));
        blue(cast[2], straight(clamp(ac - side * rnd(12, 20), 6, 79), from3, Math.min(114, from3 + 0.8 * v * play.duration), 0.8 * v));
      }
      red(straight(clamp(ac - 6 + rnd(-3, 3), 8, 77), rnd(136, 142), 172, v * 0.6));
      red(straight(clamp(ac + (far ? 24 : 17) + rnd(-3, 3), 8, 77), rnd(141, 148), 174, v * 0.6));
      touch(0, carrier, "carry");

    } else if (kind === "offside-pass" || kind === "onside-pass" || kind === "offside-reach") {
      // ===== A PASS OVER THE BLUE LINE =====
      // Was the receiver already in the zone? In "offside-reach" the
      // receiver stands inside and reaches back for the puck with the stick.
      var castP = jobs();
      var a1 = rnd(20, 36), lane = a1 + rnd(24, 34), passAt = rnd(0.6, 1), speed = rnd(52, 68), dP = rnd(101, 112);
      var puckP = [{ t: 0, a: a1, d: dP - 3 }, { t: passAt, a: a1, d: dP }];
      var passer = blue(castP[0], null), catcher = blue(castP[1], null), ends, caughtAt;
      if (kind === "offside-reach") {
        var deepR = allOver + (level === 1 ? rnd(2.2, 3.6) : rnd(0.8, 2.2));
        var stop = { a: lane + 1.2, d: BLUE - rnd(1.5, 2.4) };     // the puck stops here, still outside the zone
        caughtAt = passAt + apart({ a: a1, d: dP }, stop) / speed;
        var pull = caughtAt + rnd(0.3, 0.5) / fast;                // then the stick pulls it over the line
        ends = pull + 0.9;
        play.tracks[catcher] = [{ t: 0, a: lane - 2, d: deepR }, { t: pull, a: lane, d: deepR }, { t: ends, a: lane, d: deepR + 14 }];
        puckP.push({ t: caughtAt, a: stop.a, d: stop.d }, { t: pull, a: stop.a, d: stop.d },
                   { t: pull + 0.35, a: stop.a, d: deepR + 3 }, { t: ends, a: stop.a, d: deepR + 16.5 });
      } else {
        var deepP = allOver + margin(kind === "offside-pass");
        var target = Math.max(deepP + 9, 135);                     // where the pass is aimed
        var flight = apart({ a: a1, d: dP }, { a: lane, d: target }) / speed, arrive = passAt + flight;
        var crossP = passAt + flight * (puckOver - dP) / (target - dP);
        // The receiver skates at a steady speed, so we know exactly where
        // they are when the puck crosses the line. Then they pick up the pass.
        var rec = receiver(lane, deepP, crossP, arrive, target, rnd(21, 26) * fast, 74);
        caughtAt = rec.catchAt;
        ends = caughtAt + 0.9;
        play.tracks[catcher] = rec.track;
        puckP.push({ t: arrive, a: lane, d: target }, { t: caughtAt, a: lane, d: target }, { t: ends, a: lane, d: target + 15 });
      }
      play.tracks.puck = puckP;
      play.tracks[passer] = [{ t: 0, a: a1, d: dP - 6 }, { t: passAt, a: a1, d: dP - 3 }, { t: ends + 0.1, a: a1, d: dP + 8 }];
      play.key = catcher;
      play.duration = ends;
      blue(castP[2], straight(clamp(a1 - rnd(8, 14), 6, 79), rnd(88, 96), 112, 12 * fast));
      red(straight(a1 + 8, 136, 160, 12));
      red(straight(lane - 9, 150, 172, 12));
      touch(0, passer, "carry");
      touch(passAt, passer, "pass");
      touch(caughtAt, catcher, "receive");

    } else if (kind === "offside-dump" || kind === "onside-dump") {
      // ===== THE PUCK IS SHOT INTO THE ZONE FROM THE NEUTRAL ZONE =====
      // (a dump-in). The shooter is past the red line, so it is never
      // icing. But where is the teammate when the puck crosses the blue line?
      var castD = jobs();
      var aD = rnd(20, 58), fromD = level === 1 ? rnd(105, 116) : rnd(103, 119), shootD = rnd(0.6, 1), vD = rnd(14, 20) * fast;
      var corner = { a: dice() < 0.5 ? rnd(6, 15) : rnd(70, 79), d: rnd(168, 184) };
      var speedD = rnd(62, 80) * fast, wayD = apart({ a: aD, d: fromD }, corner);
      var slowAt = shootD + 0.7 * wayD / speedD, restAt = slowAt + 0.3 * wayD / (speedD * 0.45);
      // The puck goes fast at first, then slows down and stops in the corner.
      play.tracks.puck = [{ t: 0, a: aD, d: fromD - vD * shootD }, { t: shootD, a: aD, d: fromD },
                          { t: slowAt, a: aD + (corner.a - aD) * 0.7, d: fromD + (corner.d - fromD) * 0.7 },
                          { t: restAt, a: corner.a, d: corner.d }];
      play.duration = restAt + 0.4;
      var crossD = whenOver(play.tracks.puck, puckOver);
      var shooterD = blue(castD[0], [{ t: 0, a: aD, d: fromD - 3 - vD * shootD }, { t: shootD, a: aD, d: fromD - 3 }, { t: shootD + 1.5, a: aD, d: fromD + 1 }]);
      var sideD = dice() < 0.5 ? -1 : 1;
      play.key = blue(castD[1], timed(clamp(aD + sideD * rnd(16, 30), 6, 79), allOver + margin(kind === "offside-dump"), crossD, rnd(18, 25) * fast, 74, 172));
      var from3D = Math.max(74, fromD - rnd(14, 22));
      blue(castD[2], straight(clamp(aD - sideD * rnd(12, 20), 6, 79), from3D, Math.min(112, from3D + 12), 10));
      // Two red defenders in their zone, not yet at the puck.
      place("def", 140, 160, false);
      place("def", 148, 172, false);
      touch(0, shooterD, "carry");
      touch(shootD, shooterD, "shot");

    } else if (kind === "offside-again" || kind === "onside-again") {
      // ===== THE PUCK COMES OUT OF THE ZONE AND GOES BACK IN =====
      // Blue is attacking. A red player clears the puck out over the blue
      // line. A blue player stops it there and brings it right back in.
      // Did the two blue forwards get back to the line in time?
      var castA = jobs();
      var ax = rnd(30, 55), dx = rnd(134, 144), tClear = rnd(0.35, 0.6);
      var point = { a: ax + (dice() < 0.5 ? -1 : 1) * rnd(6, 14), d: rnd(113, 119) };
      var tGot = tClear + apart({ a: ax, d: dx - 1.5 }, point) / rnd(50, 62);
      var tBack = tGot + (level === 1 ? rnd(0.5, 0.8) : rnd(0.35, 0.6)) / fast;
      var puckA = [{ t: 0, a: ax, d: dx }, { t: tClear, a: ax, d: dx - 1.5 }, { t: tGot, a: point.a, d: point.d }, { t: tBack, a: point.a, d: point.d + 0.8 }];
      var pointMan = blue(castA[0], null), clearer = red(null);
      var manTrack = [{ t: 0, a: point.a + rnd(-3, 3), d: point.d - 5 }, { t: tGot, a: point.a, d: point.d - 2.5 }, { t: tBack, a: point.a, d: point.d - 2.2 }];
      var shootIn = dice() < 0.4, crossA;
      if (shootIn) {
        // Shot back in, toward a corner.
        var cornerA = { a: point.a < W / 2 ? rnd(6, 15) : rnd(70, 79), d: rnd(164, 182) };
        var restA = tBack + apart({ a: point.a, d: point.d + 0.8 }, cornerA) / (rnd(60, 75) * fast);
        puckA.push({ t: restA, a: cornerA.a, d: cornerA.d });
        play.duration = restA + 0.5;
        manTrack.push({ t: play.duration, a: point.a, d: point.d + 2 });
      } else {
        // Carried back in.
        var vb = rnd(16, 22) * fast;
        crossA = tBack + (puckOver - point.d - 0.8) / vb;
        play.duration = crossA + 1;
        puckA.push({ t: play.duration, a: point.a, d: puckOver + vb });
        manTrack.push({ t: play.duration, a: point.a, d: puckOver + vb - 3 });
      }
      play.tracks.puck = puckA;
      play.tracks[pointMan] = manTrack;
      crossA = whenOver(puckA.slice(2), puckOver);                 // when the puck goes IN again
      play.tracks[clearer] = [{ t: 0, a: ax, d: dx + 2.5 }, { t: tClear, a: ax, d: dx + 1 }, { t: play.duration, a: ax, d: dx + 7 }];
      // A forward who was inside the zone and skates out. At the moment
      // the puck goes in again they are exactly at depth "to".
      var tGo = tClear + rnd(0.05, 0.2), offsideA = kind === "offside-again";
      function comesOut(job, way, to, least) {
        // Their lane: beside the red player, and not the lane of the blue player at the line.
        var a = ax + way * rnd(10, 24);
        for (var tries = 0; tries < 20 && Math.abs(a - point.a) < 8; tries++) a = ax + way * rnd(10, 24);
        var start = clamp(to + rnd(15, 22) * fast * (crossA - tGo), Math.max(to + 2, least), 154);
        return blue(job, [{ t: 0, a: clamp(a, 6, 79), d: start + 0.5 }, { t: tGo, a: clamp(a, 6, 79), d: start },
                          { t: crossA, a: clamp(a, 6, 79), d: to }, { t: play.duration, a: clamp(a, 6, 79), d: to + (offsideA ? -1.5 : 4) }]);
      }
      var sideA = dice() < 0.5 ? -1 : 1;
      play.key = comesOut(castA[1], sideA, allOver + margin(offsideA), 133);
      comesOut(castA[2], -sideA, allOver - rnd(4, 9), 129);
      place("def", 146, 170, false);
      touch(0, clearer, "carry");
      touch(tClear, clearer, "shot");
      touch(tGot, pointMan, "receive");
      if (shootIn) touch(tBack, pointMan, "shot");

    } else if (kind === "defender-back") {
      // ===== THE OTHER TEAM TAKES THE PUCK BACK INTO THEIR OWN ZONE =====
      // A red player has the puck just outside their blue line and goes
      // back in with it (or passes it back) while a blue player is still
      // in there. That is NOT offside.
      var castB = jobs();
      var aR = rnd(22, 62), dR = rnd(116, 121), tTurnB = rnd(0.6, 1) / fast, sideB = dice() < 0.5 ? -1 : 1;
      var turnSpot = { a: aR - sideB, d: dR - 2 };
      var puckB = [{ t: 0, a: aR, d: dR }, { t: tTurnB, a: turnSpot.a, d: turnSpot.d }];
      var redOne = red(null), a2 = clamp(aR - sideB * rnd(16, 24), 8, 77), d2 = rnd(137, 146);
      if (dice() < 0.4) {
        // A pass back to the partner, who is waiting in the zone.
        var gotB = tTurnB + apart(turnSpot, { a: a2, d: d2 }) / rnd(45, 55);
        puckB.push({ t: gotB, a: a2, d: d2 }, { t: gotB + 0.8, a: a2 + sideB * 3, d: d2 + 3 });
        play.duration = gotB + 0.8;
        play.tracks[redOne] = [{ t: 0, a: aR, d: dR + 2.5 }, { t: tTurnB, a: turnSpot.a, d: turnSpot.d + 2.5 }, { t: play.duration, a: turnSpot.a, d: dR + 5 }];
        var redTwo = red([{ t: 0, a: a2, d: d2 + 4 }, { t: gotB, a: a2, d: d2 + 2.5 }, { t: play.duration, a: a2 + sideB * 3, d: d2 + 5.5 }]);
        touch(tTurnB, redOne, "pass");
        touch(gotB, redTwo, "receive");
      } else {
        // Carried back in.
        var vR = rnd(15, 20) * fast, crossB = tTurnB + (puckOver - turnSpot.d) / vR;
        play.duration = crossB + 1;
        puckB.push({ t: play.duration, a: aR - sideB * 3, d: puckOver + vR });
        play.tracks[redOne] = [{ t: 0, a: aR, d: dR + 2.5 }, { t: tTurnB, a: turnSpot.a, d: turnSpot.d + 2.5 }, { t: play.duration, a: aR - sideB * 3, d: puckOver + vR + 2.5 }];
        red(straight(a2, d2, d2 + 6, 5));
      }
      play.tracks.puck = puckB;
      var crossBack = whenOver(puckB, puckOver);
      // The blue player who is still inside, close to the play.
      var inside = allOver + (level === 1 ? rnd(2.5, 6) : rnd(0.8, 5));
      play.key = blue(castB[0], [{ t: 0, a: aR + sideB * rnd(6, 8), d: inside + 2 }, { t: crossBack, a: aR + sideB * rnd(6, 8), d: inside },
                                 { t: play.duration, a: aR + sideB * 7, d: inside + 1 }]);
      // Two more blue players chase from the neutral zone.
      blue(castB[1], straight(clamp(aR + rnd(-3, 3), 6, 79), dR - rnd(12, 15), dR - 6.5, 6));
      blue(castB[2], straight(clamp(aR - sideB * rnd(18, 26), 6, 79), rnd(96, 104), 112, 8));
      touch(0, redOne, "carry");

    } else {
      // ===== A LONG SHOT OR A LONG PASS DOWN THE ICE =====
      var castL = jobs();
      var fromL;
      if (kind === "dump-in") fromL = level === 1 ? rnd(106, 118) : rnd(103.5, 108);
      else if (kind === "icing-tipped") fromL = rnd(46, 66);
      else if (kind === "tip-past-red") fromL = rnd(56, 84);
      else if (kind === "pass-caught" || kind === "offside-long-pass") fromL = level === 1 ? rnd(58, 84) : rnd(70, 95.5);
      else fromL = level === 1 ? rnd(48, 84) : rnd(70, 95.5);
      var aS = rnd(18, 40), shootAt = rnd(0.55, 0.85), puckSpeed = rnd(80, 94) * fast, vS = rnd(5, 10);
      var start = { a: aS, d: fromL };
      var shooter = blue(castL[0], [{ t: 0, a: aS, d: fromL - 3 - vS * shootAt }, { t: shootAt, a: aS, d: fromL - 3 }, { t: shootAt + 2, a: aS, d: fromL + 2 }]);
      var puck = [{ t: 0, a: aS, d: fromL - vS * shootAt }, { t: shootAt, a: start.a, d: start.d }];
      var wide = dice() < 0.5 ? rnd(9, 30) : rnd(55, 76);        // where it crosses the goal line: beside the net
      var endSpot = kind === "icing-goal" ? { a: rnd(40.7, 44.3), d: 191.6 } : { a: wide, d: 197 };
      function along(k) { return { a: start.a + (endSpot.a - start.a) * k, d: start.d + (endSpot.d - start.d) * k }; }
      var whole = apart(start, endSpot) / puckSpeed;
      var mates = 2, stopper = null;                               // how many more blue players stand around
      touch(0, shooter, "carry");

      if (kind === "pass-caught") {
        // A long pass to a teammate in the neutral zone, who catches it.
        var dq = rnd(Math.max(101, fromL + 14), 119), spotQ = { a: clamp(aS + rnd(-6, 26), 10, 75), d: dq };
        var tq = shootAt + apart(start, spotQ) / (puckSpeed * 0.8), vm = rnd(14, 20) * fast;
        var carryTo = Math.min(dq + 12, 123.5);                    // then they skate on, but not over the blue line yet
        play.key = blue(castL[1], [{ t: 0, a: spotQ.a, d: Math.max(fromL + 5, dq - 2.5 - vm * tq) }, { t: tq, a: spotQ.a, d: dq - 2.5 },
                                   { t: tq + 0.8, a: spotQ.a, d: carryTo - 2.5 }]);
        puck.push({ t: tq, a: spotQ.a, d: dq }, { t: tq + 0.8, a: spotQ.a, d: carryTo });
        play.duration = tq + 1.1;
        mates = 1;
        touch(shootAt, shooter, "pass");
        touch(tq, play.key, "receive");
      } else if (kind === "offside-long-pass") {
        // A long pass to a teammate who is already inside the zone.
        var laneL = clamp(aS + rnd(8, 30), 10, 75), deepL = allOver + margin(true), targetL = Math.max(deepL + 9, 136);
        var flightL = apart(start, { a: laneL, d: targetL }) / (puckSpeed * 0.85), arriveL = shootAt + flightL;
        var crossL = shootAt + flightL * (puckOver - fromL) / (targetL - fromL);
        var recL = receiver(laneL, deepL, crossL, arriveL, targetL, rnd(21, 26) * fast, fromL + 12);
        play.key = blue(castL[1], recL.track);
        puck.push({ t: arriveL, a: laneL, d: targetL }, { t: recL.catchAt, a: laneL, d: targetL }, { t: recL.catchAt + 0.9, a: laneL, d: targetL + 15 });
        play.duration = recL.catchAt + 0.9;
        mates = 1;
        touch(shootAt, shooter, "pass");
        touch(recL.catchAt, play.key, "receive");
      } else if (kind === "icing-tipped" || kind === "tip-past-red") {
        // A pass to a teammate who only tips it. The puck keeps going,
        // all the way over the goal line. WHERE the tip happened decides.
        var dTip = kind === "icing-tipped" ? (level === 1 ? rnd(fromL + 14, 90) : rnd(91, 97.5)) : (level === 1 ? rnd(106, 116) : rnd(101.5, 106));
        var tipSpot = { a: clamp(aS + rnd(-8, 14), 10, 75), d: dTip };
        var tTip = shootAt + apart(start, tipSpot) / (puckSpeed * 0.75), tOver = tTip + apart(tipSpot, endSpot) / puckSpeed;
        play.key = blue(castL[1], [{ t: 0, a: tipSpot.a + 1.2, d: Math.max(fromL + 4, dTip - 2.5 - 12 * tTip) }, { t: tTip, a: tipSpot.a + 1.2, d: dTip - 2.5 },
                                   { t: tTip + 1.2, a: tipSpot.a + 1.2, d: Math.min(dTip + 8, 121) }]);
        puck.push({ t: tTip, a: tipSpot.a, d: tipSpot.d }, { t: tOver, a: endSpot.a, d: endSpot.d });
        play.duration = tOver + 0.6;
        mates = 1;
        touch(shootAt, shooter, "pass");
        touch(tTip, play.key, "tip");
      } else if (kind === "icing-pass") {
        // A long pass that the teammate cannot reach. It slides on,
        // all the way over the goal line.
        var kMiss = (rnd(Math.max(102, fromL + 16), 120) - start.d) / (endSpot.d - start.d), by = along(kMiss), tBy = shootAt + whole * kMiss;
        var toward = by.a > W / 2 ? -1 : 1, miss = rnd(5, 8);
        play.key = blue(castL[1], [{ t: 0, a: by.a + toward * (miss + 3), d: Math.max(fromL + 5, by.d - 1 - 14 * tBy) }, { t: tBy, a: by.a + toward * miss, d: by.d - 1 },
                                   { t: tBy + 1, a: by.a + toward * miss * 0.6, d: Math.min(by.d + 9, 122) }]);
        puck.push({ t: shootAt + whole, a: endSpot.a, d: endSpot.d });
        play.duration = shootAt + whole + 0.6;
        mates = 1;
        touch(shootAt, shooter, "pass");
      } else {
        touch(shootAt, shooter, "shot");
        if (kind === "icing-touched") {
          // A defender is standing in the way and stops the puck.
          var k = (rnd(142, 170) - start.d) / (endSpot.d - start.d), halt = along(k), tStop = shootAt + whole * k;
          stopper = red([{ t: 0, a: halt.a + 6, d: halt.d + 2 }, { t: tStop, a: halt.a + 1, d: halt.d + 1.5 }, { t: tStop + 1, a: halt.a + 3, d: halt.d - 6 }]);
          puck.push({ t: tStop, a: halt.a, d: halt.d }, { t: tStop + 1, a: halt.a + 2, d: halt.d - 8 });
          touch(tStop, stopper, "touch");
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
        if (kind === "icing-shorthanded") {
          // Blue is killing a penalty: one skater fewer on the ice.
          play.shorthanded = true;
          mates = 1;
        }
      }
      play.tracks.puck = puck;
      // The other blue players are up the ice, but still behind the blue
      // line. The red defenders are well away from where the puck goes.
      for (var m = 0; m < mates; m++) place("att", Math.min(fromL + 8, 108), 119, false);
      for (var r = stopper ? 1 : 0; r < 2; r++) place("def", 136, 178, false);
    }

    // ----- One to three extra skaters -----
    // They make every play look a little different, but they can never
    // change the call: the blue ones stay well behind the blue line and
    // nobody goes near the puck.
    var extras = 1 + Math.floor(dice() * 3), teams = [];
    if (play.shorthanded) {
      // Red always shows one skater more than blue.
      teams = extras === 3 ? ["att", "def", "def"] : ["def"];
    } else {
      for (var e = 0; e < extras; e++) teams.push(dice() < 0.5 ? "att" : "def");
    }
    teams.forEach(function (team) {
      if (team === "att" && blues >= 5) team = "def";
      if (team === "def" && reds >= 5) team = "att";
      if (team === "att") place("att", play.from + 6, 112, true);
      else place("def", play.from === 70 ? 96 : 72, 180, true);
    });

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

  // =====================================================================
  //  DEALING THE PLAYS
  //  Like a deck of cards: one card for every kind of play of the level.
  //  We shuffle the deck and play it card by card, so every kind comes
  //  up once before any kind comes back. About half of the kinds need a
  //  whistle. When the deck is empty we shuffle a new one, and the three
  //  kinds you saw last go to the back, so nothing repeats right away.
  // =====================================================================
  // recent = the kinds that were just played (when you switch levels).
  function makeDeck(level, recent) {
    return { level: level, cards: [], recent: (recent || []).slice(-3) };
  }
  function deal(deck, dice) {
    if (!deck.cards.length) {
      var all = mixed(kindsFor(deck.level), dice);
      var fresh = all.filter(function (k) { return deck.recent.indexOf(k) < 0; });
      var seen = all.filter(function (k) { return deck.recent.indexOf(k) >= 0; });
      // The kinds you just saw go back in, but not among the first three cards.
      seen.forEach(function (k) {
        var first = Math.min(3, fresh.length);
        fresh.splice(first + Math.floor(dice() * (fresh.length - first + 1)), 0, k);
      });
      deck.cards = fresh;
    }
    var kind = deck.cards.shift();
    deck.recent.push(kind);
    if (deck.recent.length > 3) deck.recent.shift();
    return makePlay(kind, deck.level, dice);
  }

  var api = {
    BLUE: BLUE, RED: RED, GOAL_LINE: GOAL_LINE, NET: NET, KINDS: KINDS, CALL_WORDS: CALL_WORDS, REASONS: REASONS,
    where: where, skatesOf: skatesOf, at: at, judge: judge, explain: explain, makePlay: makePlay,
    kindsFor: kindsFor, makeDeck: makeDeck, deal: deal
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachRef = api;
})(typeof window !== "undefined" ? window : globalThis);
