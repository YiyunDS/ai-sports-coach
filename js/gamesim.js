// =====================================================================
//  gamesim.js  --  THE RULES OF THE LIVE HOCKEY GAME
//
//  The Positioning tab asks "where should you stand?". In this game the
//  play never stops: you skate one skater yourself, and the computer
//  plays your four teammates, the other team and both goalies.
//
//  HOW THE GAME RUNS
//    The game moves forward in tiny steps, 60 of them every second
//    (see "tick" below). In every step each skater skates a little,
//    the puck slides a little, and we check the rules:
//      * a GOAL        the puck goes over the goal line into the net
//      * a SAVE        the goalie stops it. If the goalie covers the
//                      puck the whistle blows; a rebound plays on
//      * OFFSIDE       the puck goes into the attacking zone while an
//                      attacker is already in there
//      * ICING         a puck sent from a team's own half goes all the
//                      way over the far goal line with nobody touching it
//    After a whistle there is a face-off.
//
//  WHY CHANCE?
//    Nobody can know if one shot will go in. A shot from the slot
//    scores much more often than a shot from the corner, and a goalie
//    who is in the right place stops most pucks, but not all of them.
//    So we still roll dice, the way real hockey does.
//
//  HOW WE MEASURE THE RINK: in feet, exactly like positions.js.
//     a = across the ice (0 = left boards, 85 = right boards)
//     d = up the ice (11 = our goal line, 189 = their goal line)
//  Speeds are in feet per second, times in seconds.
//
//  No drawing in this file, and no computer players either (they are
//  in gamebrain.js). So we can test it:
//      node tests/gamesim.test.js
// =====================================================================
(function (root) {
  "use strict";
  var P = (typeof module !== "undefined" && module.exports) ? require("./positions.js") : root.CoachPositions;

  var W = P.RINK.width, L = P.RINK.length;
  var ROLES = P.ROLES;
  var GOAL = { a: 42.5, d: 189 };   // the net a team shoots at, seen from that team's side
  var OUR_BLUE = 75, THEIR_BLUE = 125;
  // The lines, seen from the side of the team that attacks up the ice:
  var ZONE = 126;        // past the far edge of their blue line = inside the attacking zone
  var INSIDE = ZONE + 1.5; // a SKATER is inside once both skates are over the line (a foot and a half past it)
  var CENTER = 100;      // the center red line
  var GOAL_LINE = 189;   // their goal line
  var POST = 3;          // the net is 6 feet wide: 3 feet each side of the middle
  var BAR = 4;           // and 4 feet high
  var TICK = 1 / 60;     // one step of the game, in seconds

  // ---------- Dice we can repeat ---------------------------------------
  // Real dice are different every time. For testing we want dice that
  // give the same rolls again when we start from the same "seed" number.
  // Each call gives a number from 0 up to (not including) 1.
  function makeDice(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Small helpers --------------------------------------------
  function pt(a, d) { return { a: a, d: d }; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function feet(p, q) { return P.feetBetween(p, q); }
  function onIce(p) { return pt(clamp(p.a, 3, W - 3), clamp(p.d, 3, L - 3)); }
  // The same spot seen from the other team's side (their left is our right).
  function flip(p) { return pt(W - p.a, L - p.d); }
  function flipSide(p) { return pt(W - p.a, p.d); }
  // Walk from one spot toward another, but no farther than "most" feet.
  function toward(from, to, most) {
    var dist = feet(from, to);
    if (dist <= most) return pt(to.a, to.d);
    var k = most / dist;
    return pt(from.a + (to.a - from.a) * k, from.d + (to.d - from.d) * k);
  }
  // How far is spot p from the straight line between a and b?
  function feetFromLine(p, a, b) {
    var ab = { a: b.a - a.a, d: b.d - a.d }, len2 = ab.a * ab.a + ab.d * ab.d;
    var t = len2 > 0 ? clamp(((p.a - a.a) * ab.a + (p.d - a.d) * ab.d) / len2, 0, 1) : 0;
    return feet(p, pt(a.a + ab.a * t, a.d + ab.d * t));
  }
  // Who of a team is nearest to a spot? Returns { role, feet }.
  function nearest(team, spot, skip) {
    var best = null;
    ROLES.forEach(function (r) {
      if (r === skip) return;
      var f = feet(team[r], spot);
      if (!best || f < best.feet) best = { role: r, feet: f };
    });
    return best;
  }
  function mapTeam(team, fn) {
    var out = {};
    ROLES.forEach(function (r) { out[r] = fn(team[r], r); });
    return out;
  }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }

  // =====================================================================
  //  WHERE EVERYONE SHOULD BE  (the playbook, for any puck position)
  //
  //  Written for a team attacking UP the ice with the puck on the LEFT
  //  half. For the right half we flip left and right, like positions.js.
  //  Five patterns come straight from the Positioning tab's playbook.
  // =====================================================================
  var SWAP = { LW: "RW", RW: "LW", LD: "RD", RD: "LD", C: "C" };

  function fromPlaybook(id) {
    var s = P.getSituation(id, "left"), out = {};
    ROLES.forEach(function (r) { out[r] = { a: s.spots[r].a, d: s.spots[r].d, tip: s.jobs[r] }; });
    return out;
  }
  function spot(a, d, tip) { return { a: a, d: d, tip: tip }; }

  // Our team has the puck.
  function attackLeft(puck) {
    var d = puck.d;
    if (d < 20) return fromPlaybook("breakout");
    if (d < OUR_BLUE) return {                  // skating it out of our zone
      LW: spot(8, Math.min(d + 22, 96), "Stay wide on the boards on the puck side, ahead of the puck. You are the easy pass up the wall."),
      C: spot(40, d + 10, "Skate up the middle just ahead of the puck, close enough for a short pass."),
      RW: spot(76, Math.min(d + 25, 99), "Stay wide on the far boards and get moving. Once we are out, a pass across is yours."),
      LD: spot(25, Math.max(d - 18, 9), "Follow the play up behind the puck. You are the safe pass back."),
      RD: spot(58, Math.max(d - 20, 14), "Trail the play on the far side, between the puck and our net.")
    };
    if (d < THEIR_BLUE) return {                // the rush through the middle
      LW: spot(10, Math.min(d + 12, 122), "Drive wide down your lane, but stay behind the puck at their blue line or it is offside."),
      C: spot(42.5, Math.min(d + 6, 122), "Take the middle lane a step ahead of the puck. Never cross their blue line before the puck does."),
      RW: spot(75, Math.min(d + 12, 122), "Fill the far lane with speed. Wait at their blue line until the puck crosses."),
      LD: spot(28, d - 28, "Follow the rush a few strides behind. You are the late pass, and the first one back."),
      RD: spot(57, d - 28, "Trail on the far side. If we lose the puck you are already between it and our net.")
    };
    if (d < 165) return {                       // puck up high in their zone
      LW: spot(10, 172, "Go to the half wall on the puck side. You are the short pass down the boards."),
      C: spot(36, 158, "Find the high slot between the circles. A pass there is our best shot."),
      RW: spot(47, 181, "Go to the front of their net where the goalie cannot see past you. Rebounds are yours."),
      LD: spot(14, 129, "Hold the blue line by the boards and keep the puck in their zone."),
      RD: spot(52, 129, "Slide to the middle of the blue line: an open pass across, and ready to get back.")
    };
    return fromPlaybook("oz-attack");
  }

  // The other team has the puck (we defend the net at the bottom).
  function defendLeft(puck) {
    var d = puck.d;
    if (d < OUR_BLUE) {
      if (d < 13 && puck.a > 25) return fromPlaybook("dz-behind");
      if (d < 38) return fromPlaybook("dz-corner");
      return fromPlaybook("dz-point");
    }
    if (d < THEIR_BLUE) return {                // they are coming through the middle
      LD: spot(30, Math.max(d - 24, 58), "Back up between the puck and our net. Keep the puck carrier to the outside."),
      RD: spot(55, Math.max(d - 24, 58), "Back up on the far side, level with your partner. Watch for a pass across."),
      C: spot(42.5, d - 9, "Skate back hard through the middle and pick up their trailing player."),
      LW: spot(15, d - 4, "Come back on the puck side and take their winger on the boards."),
      RW: spot(70, d - 4, "Come back on the far side and take away the pass across.")
    };
    return {                                    // they have it in their own zone: forecheck
      LW: spot(clamp(puck.a + 3, 4, 40), puck.d - 7, "You are first in. Skate at the puck carrier and take away the easy pass up the boards."),
      C: spot(38, Math.min(150, d - 14), "Stay high in the slot. Read where the puck goes and jump on the next pass."),
      RW: spot(60, Math.min(143, d - 18), "Stay high on the far side. Take away the pass across and be the first forward back."),
      LD: spot(26, Math.min(118, d - 26), "Stay on our side of their blue line by the boards. Do not get caught too deep."),
      RD: spot(58, Math.min(112, d - 32), "Stay back in the middle. You are the safety if they break out.")
    };
  }

  // Use a left-side pattern for a puck on either side.
  function bothSides(pattern, puck) {
    if (puck.a <= W / 2) return pattern(puck);
    var left = pattern(flipSide(puck)), out = {};
    ROLES.forEach(function (r) { out[SWAP[r]] = { a: W - left[r].a, d: left[r].d, tip: left[r].tip }; });
    return out;
  }

  // The attacking team's best spots. The player with the puck is AT the
  // puck. If that is not the player the playbook expected there, the two
  // trade places: somebody always fills the open spot.
  function attackSpots(puck, carrier) {
    var spots = bothSides(attackLeft, puck);
    if (carrier) {
      var expected = nearest(spots, puck).role;
      if (expected !== carrier) { var open = spots[carrier]; spots[carrier] = spots[expected]; spots[expected] = open; }
      spots[carrier] = spot(puck.a, puck.d, "You have the puck. Head up: look for the open teammate before you choose.");
    }
    return spots;
  }
  function defendSpots(puck) { return bothSides(defendLeft, puck); }

  // =====================================================================
  //  THE CHANCES
  //  All of these look at the rink from the side of the team WITH the
  //  puck (they attack the net at d = 189). Each returns a chance from
  //  0 (never) to 1 (always).
  // =====================================================================

  // Will a pass get there?
  //   Longer passes are harder. A defender standing in the lane makes it
  //   much harder. A pass across the front of your own net is the most
  //   dangerous pass in hockey, so it loses a bit more.
  //   bonus = extra for the receiver (the player being open or not)
  function passChance(from, to, defenders, bonus) {
    var p = 0.96 - 0.0036 * feet(from, to);
    var lane = 99;
    ROLES.forEach(function (r) { lane = Math.min(lane, feetFromLine(defenders[r], from, to)); });
    if (lane < 5) p -= 0.25; else if (lane < 10) p -= 0.1;
    var middle = (from.d + to.d) / 2;
    if (from.d < 70 && to.d < 70 && (from.a - W / 2) * (to.a - W / 2) < 0 && middle > 14) p -= 0.12;
    return clamp(p + (bonus || 0), 0.1, 0.96);
  }

  // Will a stickhandle get past? Lots of open ice = easy. A defender
  // right on top of you = you lose the puck about half the time.
  function carryChance(from, defenders) {
    return clamp(0.45 + 0.011 * nearest(defenders, from).feet, 0.3, 0.92);
  }

  // Will a shot go in?
  //   Close and straight in front is best. Far away, or from the side,
  //   the goalie sees it and has it covered.
  //   screen = a teammate is standing in front of the goalie
  function shotChance(from, defenders, screen) {
    var along = GOAL.d - from.d;
    if (along <= 0) return 0.004;                 // from behind the goal line
    var dist = feet(from, GOAL), straight = along / Math.max(dist, 1);
    var p = 0.40 * Math.exp(-dist / 28) * (0.1 + 0.9 * straight);
    if (defenders && nearest(defenders, from).feet < 6) p *= 0.7;  // a defender in the way
    if (screen) p *= 1.25;
    return clamp(p, 0.004, 0.6);
  }

  // A loose puck: which team gets there first? The team with the closer
  // skater usually does. Returns the chance for the "first" team.
  function looseChance(spotOnIce, first, second) {
    return clamp(0.5 + (nearest(second, spotOnIce).feet - nearest(first, spotOnIce).feet) / 40, 0.15, 0.85);
  }

  // =====================================================================
  //  THE AGE GROUPS
  //  You pick your age group before the game. The rules are the same for
  //  everybody; what changes is how hard it is. Read each row from left
  //  (4-5 years) to right (16 and up).
  // =====================================================================
  var AGE_NAMES = ["4-5", "6-7", "8-9", "10-11", "12-13", "14-15", "16+"];
  var DIALS = {
    youSpeed:    [21, 22, 23, 24, 25, 26, 27],                  // how fast you skate (feet per second)
    mateSpeed:   [18, 19, 20.5, 22, 23.5, 25, 26],              // your teammates
    themSpeed:   [12.5, 15, 17.5, 20, 22.5, 24.5, 26.5],        // the other team
    think:       [1.6, 1.3, 1.1, 0.9, 0.75, 0.6, 0.5],          // seconds the other team needs to decide
    checkSkill:  [0.14, 0.2, 0.27, 0.34, 0.41, 0.48, 0.55],     // how good their stick checks are
    theirGoalie: [0.6, 0.66, 0.72, 0.77, 0.82, 0.86, 0.9],      // how good their goalie is (1 = stops everything)
    ourGoalie:   [0.92, 0.89, 0.86, 0.83, 0.81, 0.79, 0.77],    // and ours
    early:       [0.02, 0.04, 0.07, 0.1, 0.13, 0.16, 0.2],      // how often a computer player goes offside
    icing:       [0.02, 0.03, 0.05, 0.07, 0.09, 0.11, 0.13],    // how often a pressured player ices the puck
    barSpeed:    [0.55, 0.7, 0.85, 1, 1.15, 1.3, 1.5],          // how fast the markers on your bars sweep
    green:       [0.5, 0.44, 0.38, 0.33, 0.28, 0.24, 0.2],      // how wide the green (good) part of a bar is
    catchFeet:   [7, 6.5, 6, 5.5, 5, 4.6, 4.2],                 // how near a pass must come to be caught
    faceoff:     [0.9, 0.75, 0.62, 0.5, 0.42, 0.35, 0.3],       // seconds their center needs at a face-off
    warn:        [true, true, true, false, false, false, false] // mark the pass line when that pass would be offside
  };
  function levelFor(age) {
    var i = clamp(Math.round(age), 0, AGE_NAMES.length - 1), lv = { age: i, name: AGE_NAMES[i] };
    Object.keys(DIALS).forEach(function (k) { lv[k] = DIALS[k][i]; });
    return lv;
  }

  // =====================================================================
  //  THE TWO BARS  (power and height)
  //  While you have the puck a marker sweeps up and down the power bar.
  //  Tap Pass or Shoot: the power stops there and the height marker
  //  starts. Tap again: the height stops and the puck goes.
  // =====================================================================
  // Where is a marker after t seconds? It runs 0 -> 1 -> 0 -> 1 ...
  function barAt(t, speed) {
    var x = (t * speed) % 2;
    return x <= 1 ? x : 2 - x;
  }
  function zone(center, width) {
    var lo = clamp(center - width / 2, 0, 1 - width);
    return [lo, lo + width];
  }
  // The green (good) part of each bar.
  //   power: medium-hard is best for a pass and for a shot
  //   height: a shot is best in the top half of the net; a pass is best flat on the ice
  function greens(lv, kind) {
    // (The top of the green part for a shot is 0.7: just under the crossbar.)
    return { power: zone(0.65, lv.green), lift: kind === "shoot" ? [0.7 - lv.green, 0.7] : [0, lv.green * 0.8] };
  }
  function passSpeed(power) { return 22 + 50 * power; }   // feet per second
  function shotSpeed(power) { return 45 + 65 * power; }

  // =====================================================================
  //  THE GAME
  // =====================================================================
  function other(team) { return team === "us" ? "them" : "us"; }
  // The rink as a team sees it when it attacks UP the ice. For us that is
  // the rink as it is. For them we turn it around. (Turning twice gives
  // the first picture again, so "see" also turns a spot back.)
  function see(team, p) { return team === "us" ? pt(p.a, p.d) : flip(p); }
  function eachSkater(s, fn) {
    ["us", "them"].forEach(function (team) { ROLES.forEach(function (r) { fn(s[team][r], team, r); }); });
  }
  function speedOf(k) { return Math.sqrt(k.va * k.va + k.vd * k.vd); }

  // The rink has round corners. Push a spot back onto the ice if it is
  // off it ("margin" feet from the boards). Returns which way the boards
  // pushed (so the puck can bounce), or null.
  function keepIn(p, margin) {
    var r = 28, hit = null;
    var ca = p.a < r ? r : p.a > W - r ? W - r : null, cd = p.d < r ? r : p.d > L - r ? L - r : null;
    if (ca !== null && cd !== null) {                       // in one of the four corners
      var da = p.a - ca, dd = p.d - cd, dist = Math.sqrt(da * da + dd * dd), most = r - margin;
      if (dist > most) { p.a = ca + da / dist * most; p.d = cd + dd / dist * most; hit = { a: da / dist, d: dd / dist }; }
    } else {
      if (p.a < margin) { p.a = margin; hit = { a: -1, d: 0 }; } else if (p.a > W - margin) { p.a = W - margin; hit = { a: 1, d: 0 }; }
      if (p.d < margin) { p.d = margin; hit = { a: 0, d: -1 }; } else if (p.d > L - margin) { p.d = L - margin; hit = { a: 0, d: 1 }; }
    }
    return hit;
  }

  // ---------- Saying what happened, in words ---------------------------
  function nameOf(s, team, role) {
    if (team === "us" && role === s.you) return "You";
    return (team === "us" ? "Our " : "Their ") + P.ROLE_NAMES[role].toLowerCase();
  }
  // "You pass" but "Our center passes".
  function does(who, verb, verbS) { return who + " " + (who === "You" ? verb : verbS); }

  // ---------- Starting a game -------------------------------------------
  function makeSkater(p) {
    return { a: p.a, d: p.d, va: 0, vd: 0, fa: 0, fd: 1,   // where, how fast, which way they face
             slow: 0, burst: 0, tired: 0, cool: 0, miss: 0 }; // little timers (seconds left)
  }
  function pair() { return { us: 0, them: 0 }; }

  // Where everybody lines up for a face-off at "spot".
  function lineUp(spot) {
    var out = { us: {}, them: {} };
    ["us", "them"].forEach(function (team) {
      var c = see(team, spot);
      var mine = { C: pt(c.a, c.d - 2), LW: pt(c.a - 20, c.d - 4), RW: pt(c.a + 20, c.d - 4),
                   LD: pt(c.a - 9, c.d - 17), RD: pt(c.a + 9, c.d - 17) };
      ROLES.forEach(function (r) {
        var q = see(team, pt(clamp(mine[r].a, 5, W - 5), clamp(mine[r].d, 14, L - 14)));
        keepIn(q, 3);
        out[team][r] = q;
      });
    });
    return out;
  }

  // Start a game.
  //   opts.you     = your position ("LW", "C", "RW", "LD" or "RD")
  //   opts.age     = which age group, 0 (4-5) to 6 (16+)
  //   opts.minutes = how long the game is
  function newGame(opts) {
    opts = opts || {};
    var minutes = opts.minutes || 3;
    var s = {
      you: opts.you || "C", lv: levelFor(opts.age === undefined ? 2 : opts.age), minutes: minutes,
      time: 0, clock: minutes * 60,
      phase: "set",          // "dead" (whistle) -> "set" (line up) -> "drop" -> "draw" -> "play" ... "over"
      stop: null, us: {}, them: {},
      goalie: { us: pt(42.5, 15.2), them: pt(42.5, 184.8) },
      puck: { a: 42.5, d: 100, va: 0, vd: 0, h: 0, vh: 0,     // h = how high off the ice (feet)
              owner: null, carrier: null,                      // who has it on the stick
              last: null,                                      // the team that touched it last
              pass: null, shot: null, sent: null,              // what kind of trip it is on
              tried: {}, goalieTried: false },
      side: null,            // the team that had the puck last (the others defend)
      aim: null,             // your two bars
      called: 0,             // seconds left of "I am open, pass to me!"
      ref: pt(6, 92), score: pair(),
      stats: { shots: pair(), saves: pair(), offside: pair(), icing: pair(), steals: pair(), passes: pair(), faceoffs: pair() },
      brain: { us: {}, them: {} }      // what the computer players remember (gamebrain.js)
    };
    var spots = lineUp(pt(42.5, 100));
    eachSkaterOf(spots, function (q, team, r) { s[team][r] = makeSkater(q); if (team === "them") s[team][r].fd = -1; });
    s.stop = { t: 0, dead: 0, spot: pt(42.5, 100), reason: "start", early: false, wait: 0, their: 0 };
    return s;
  }
  function eachSkaterOf(spots, fn) {
    ["us", "them"].forEach(function (team) { ROLES.forEach(function (r) { fn(spots[team][r], team, r); }); });
  }

  // For tests and for trying things out: skip the face-off.
  //   startPlay(s)               play goes on with a loose puck
  //   startPlay(s, "us", "C")    that skater has the puck
  function startPlay(s, team, role) {
    s.phase = "play"; s.stop = null;
    if (team) gain(s, team, role);
    return s;
  }

  function youHavePuck(s) { return s.puck.owner === "us" && s.puck.carrier === s.you; }

  // ---------- The puck changes hands ------------------------------------
  // This skater now has the puck on the stick.
  function gain(s, team, role) {
    var p = s.puck;
    p.owner = team; p.carrier = role; p.last = team; s.side = team;
    p.pass = null; p.shot = null; p.sent = null; p.tried = {}; p.goalieTried = false;
    p.h = 0; p.vh = 0;
    s.called = 0;
    s.aim = team === "us" && role === s.you ? { stage: 0, t: 0, kind: null, power: 0 } : null;
    // The new carrier needs a moment before deciding what to do with it
    // (older age groups: the other team decides faster).
    s.brain[team].think = team === "them" ? s.lv.think * 0.4 : 0.35;
    hold(s);
  }
  // The puck sits on the carrier's stick, a little in front.
  function hold(s) {
    var p = s.puck, k = s[p.owner][p.carrier];
    p.a = k.a + k.fa * 2.4; p.d = k.d + k.fd * 2.4;
    keepIn(p, 1);
    p.va = k.va; p.vd = k.vd;
  }
  // The puck leaves the stick.
  function letGo(s) {
    var p = s.puck;
    s[p.owner][p.carrier].miss = 0.45;               // the sender cannot grab it right back
    p.sent = { team: p.owner, role: p.carrier, from: pt(p.a, p.d), at: s.time };
    p.last = p.owner; p.owner = null; p.carrier = null;
    p.tried = {}; p.goalieTried = false; p.pass = null; p.shot = null;
    s.aim = null;
  }
  // Send the free puck toward a spot.  up = how fast it rises (0 = flat on the ice)
  function fly(s, to, speed, up) {
    var p = s.puck, da = to.a - p.a, dd = to.d - p.d, n = Math.sqrt(da * da + dd * dd) || 1;
    p.va = da / n * speed; p.vd = dd / n * speed;
    p.h = 0.2; p.vh = up || 0;
  }

  // A pass to a teammate.  power, lift = 0 to 1 (the two bars)
  //   Aimed a little ahead of the teammate, where they will be.
  //   A lifted pass flies over sticks, but is harder to catch.
  function launchPass(s, team, role, toRole, power, lift) {
    var p = s.puck, k = s[team][toRole], speed = passSpeed(power);
    var time = Math.min(feet(p, k) / speed, 1.2);
    var to = pt(k.a + k.va * time * 0.9, k.d + k.vd * time * 0.9);
    letGo(s);
    p.pass = { team: team, to: toRole };
    fly(s, to, speed, lift > 0.3 ? (lift - 0.3) / 0.7 * 14 : 0);
    s.stats.passes[team]++;
  }
  // A shot at the net.
  //   side = -1 or 1 to pick a side of the net, 0 = the side the goalie left open
  //   Harder shots are harder to stop but, past the green part of the
  //   bar, harder to aim. The height bar picks how high it arrives:
  //   past about three quarters it sails over the net.
  function launchShot(s, team, role, power, lift, side, dice) {
    var p = s.puck, from = see(team, p), goalie = see(team, s.goalie[other(team)]);
    if (!side) side = goalie.a > GOAL.a ? -1 : 1;
    var g = greens(s.lv, "shoot"), dist = feet(from, GOAL);
    var spread = (0.4 + dist * 0.028) * (power > g.power[1] ? 1.7 : 1);
    var aim = pt(GOAL.a + side * 2.2 + (dice() - 0.5) * 2 * spread, GOAL_LINE);
    var speed = shotSpeed(power), time = Math.max(feet(from, aim) / speed, 0.05);
    var high = Math.max(0, lift * 5.2 + (dice() - 0.5) * 0.6);
    letGo(s);
    p.shot = { team: team, role: role };
    // (How fast must it rise to be "high" feet up when it gets there? Gravity pulls it down.)
    fly(s, see(team, aim), speed, (high - 0.2 + 16 * time * time) / time);
    s.stats.shots[team]++;
  }
  // Just send it somewhere: a dump into the corner, or a clear up the ice.
  //   to = the spot, seen from the sender's side
  function launchTo(s, team, to, speed, lift) {
    letGo(s);
    fly(s, see(team, to), speed, (lift || 0) * 10);
  }

  // A stick check: poke the puck off the carrier's stick.
  //   It works best from close and from the front. It hardly works
  //   during the carrier's quick move. A miss leaves the checker slow
  //   for a moment, so you cannot just hammer the button.
  function tryCheck(s, team, role, dice, ev) {
    var p = s.puck, k = s[team][role];
    if (k.cool > 0 || p.owner !== other(team)) return;
    k.cool = 0.9;
    var c = s[p.owner][p.carrier], dist = feet(k, c);
    if (dist > 6.5) { k.slow = 0.35; return; }      // a swing at nothing
    var front = ((k.a - c.a) * c.fa + (k.d - c.d) * c.fd) / Math.max(dist, 0.1);   // 1 = right in front, -1 = from behind
    var skill = team === "them" ? s.lv.checkSkill / 0.34 : role === s.you ? 1.15 : 1;
    var chance = clamp((0.22 + 0.2 * (front + 1) / 2 + 0.2 * (1 - dist / 6.5)) * skill * (c.burst > 0 ? 0.3 : 1), 0.04, 0.85);
    if (dice() >= chance) { k.slow = 0.6; return; }
    s.stats.steals[team]++;
    c.miss = 0.7; c.slow = 0.4;
    ev.push({ kind: "steal", team: team, spot: pt(p.a, p.d), text: does(nameOf(s, team, role), "take", "takes") + " the puck away." });
    if (dice() < 0.6) { gain(s, team, role); return; }
    // Knocked loose: it slides a few feet away.
    var turn = dice() * 6.283;
    p.owner = null; p.carrier = null; p.last = team; p.sent = null; p.pass = null; p.shot = null; p.tried = {};
    p.va = Math.cos(turn) * 14; p.vd = Math.sin(turn) * 14;
  }

  // Who would your pass go to? The teammate nearest to the way you are
  // steering (or facing, if you are not steering).
  function passTarget(s, steer) {
    var me = s.us[s.you], best = null;
    var way = steer && Math.abs(steer.a) + Math.abs(steer.d) > 0.3 ? steer : { a: me.fa, d: me.fd };
    var n = Math.sqrt(way.a * way.a + way.d * way.d) || 1;
    ROLES.forEach(function (r) {
      if (r === s.you) return;
      var k = s.us[r], f = feet(me, k) || 1;
      var score = ((k.a - me.a) * way.a + (k.d - me.d) * way.d) / (f * n) - f / 400;   // the direction; nearer wins a tie
      if (!best || score > best.score) best = { role: r, score: score };
    });
    return best.role;
  }
  // Would a pass to this teammate be offside right now? (The puck is
  // still outside the attacking zone, and they are already inside.)
  function passIsOffside(s, team, toRole) {
    return see(team, s.puck).d <= ZONE && see(team, s[team][toRole]).d > INSIDE;
  }

  // What the page needs to draw your two bars.
  function bars(s) {
    if (!s.aim || s.phase !== "play") return null;
    var a = s.aim, speed = s.lv.barSpeed, g = greens(s.lv, a.kind || "shoot");
    return { stage: a.stage, kind: a.kind,
             power: a.stage === 0 ? barAt(a.t, speed) : a.power,
             lift: a.stage === 1 ? barAt(a.t, speed) : 0,
             greenPower: g.power, greenLift: a.stage === 1 ? g.lift : null };
  }

  // ---------- Your own skater ---------------------------------------------
  var STILL = { move: { a: 0, d: 0 }, act: null };
  //   input.move  = { a, d }: which way to skate (no longer than 1)
  //   input.pass, shoot, call, burst = true in the step where you pressed it
  function yourWant(s, input, dt) {
    var act = null, move = input.move || STILL.move;
    var n = Math.sqrt(move.a * move.a + move.d * move.d);
    if (n > 1) move = { a: move.a / n, d: move.d / n };
    if (youHavePuck(s)) {
      var aim = s.aim || (s.aim = { stage: 0, t: 0, kind: null, power: 0 });
      aim.t += dt;
      var pressed = input.pass ? "pass" : input.shoot ? "shoot" : null;
      if (pressed && aim.stage === 0) {                // first tap: the power stops
        aim.power = barAt(aim.t, s.lv.barSpeed); aim.stage = 1; aim.kind = pressed; aim.t = 0;
      } else if (pressed && pressed === aim.kind) {    // second tap: the height stops, and off it goes
        var lift = barAt(aim.t, s.lv.barSpeed);
        act = pressed === "pass" ? { kind: "pass", to: passTarget(s, move), power: aim.power, lift: lift }
          : { kind: "shoot", power: aim.power, lift: lift, side: Math.abs(move.a) > 0.4 ? (move.a > 0 ? 1 : -1) : 0 };
      } else if (pressed) {                            // the other button: start over
        s.aim = { stage: 0, t: 0, kind: null, power: 0 };
      }
      if (!act && input.burst) act = { kind: "burst" };
    } else {
      s.aim = null;
      if (input.pass && s.puck.owner === "them") act = { kind: "check" };
    }
    return { move: move, act: act };
  }

  function doAct(s, team, role, a, dice, ev) {
    var p = s.puck, k = s[team][role], has = p.owner === team && p.carrier === role;
    if (a.kind === "check") { if (!has) tryCheck(s, team, role, dice, ev); return; }
    if (!has) return;
    if (a.kind === "pass") launchPass(s, team, role, a.to, a.power, a.lift || 0);
    else if (a.kind === "shoot") launchShot(s, team, role, a.power, a.lift, a.side || 0, dice);
    else if (a.kind === "send") launchTo(s, team, a.to, a.speed, a.lift);
    else if (a.kind === "burst" && k.burst <= 0 && k.tired <= 0) k.burst = 0.9;   // the quick move
  }

  // ---------- Skating ------------------------------------------------------
  function topSpeed(s, k, team, role) {
    var lv = s.lv, v = team === "them" ? lv.themSpeed : role === s.you ? lv.youSpeed : lv.mateSpeed;
    if (s.puck.owner === team && s.puck.carrier === role) v *= 0.92;   // a little slower with the puck
    if (k.burst > 0) v *= 1.35; else if (k.tired > 0) v *= 0.75;
    if (k.slow > 0) v *= 0.5;
    return v;
  }
  // One step of skating toward where the skater wants to go. Speeding
  // up is quick; with no push the skater glides and slows down gently.
  function skate(k, want, top, dt) {
    var ta = want.a * top, td = want.d * top;
    var da = ta - k.va, dd = td - k.vd, n = Math.sqrt(da * da + dd * dd);
    var step = (want.a || want.d ? 62 : 26) * dt;
    if (n <= step) { k.va = ta; k.vd = td; } else { k.va += da / n * step; k.vd += dd / n * step; }
    k.a += k.va * dt; k.d += k.vd * dt;
    var hit = keepIn(k, 2.5);
    if (hit) { var out = k.va * hit.a + k.vd * hit.d; if (out > 0) { k.va -= out * hit.a; k.vd -= out * hit.d; } }
    var v = speedOf(k);
    if (v > 3) { k.fa = k.va / v; k.fd = k.vd / v; }
  }
  // Two skaters cannot stand on the same spot, and nobody skates
  // through a goalie.
  function apart(s) {
    var all = [];
    eachSkater(s, function (k) { all.push(k); });
    for (var i = 0; i < all.length; i++) {
      for (var j = i + 1; j < all.length; j++) {
        var da = all[j].a - all[i].a, dd = all[j].d - all[i].d, dist = Math.sqrt(da * da + dd * dd);
        if (dist < 3.6 && dist > 0.01) {
          var push = (3.6 - dist) / 2;
          all[i].a -= da / dist * push; all[i].d -= dd / dist * push;
          all[j].a += da / dist * push; all[j].d += dd / dist * push;
        }
      }
      ["us", "them"].forEach(function (t) {
        var g = s.goalie[t], ga = all[i].a - g.a, gd = all[i].d - g.d, gap = Math.sqrt(ga * ga + gd * gd);
        if (gap < 3.4 && gap > 0.01) { all[i].a = g.a + ga / gap * 3.4; all[i].d = g.d + gd / gap * 3.4; }
      });
    }
  }

  // ---------- The free puck -------------------------------------------------
  // It slides (slowing down a little), or flies and comes down again,
  // and it bounces off the boards.
  function slide(s, dt) {
    var p = s.puck;
    p.a += p.va * dt; p.d += p.vd * dt;
    if (p.h > 0 || p.vh > 0) {
      p.h += p.vh * dt; p.vh -= 32 * dt;                 // gravity
      if (p.h <= 0) { p.h = 0; p.vh = 0; }
    } else {
      var v = speedOf(p), slower = Math.max(0, v - (2 + 0.22 * v) * dt);
      if (v > 0) { p.va *= slower / v; p.vd *= slower / v; }
    }
    var hit = keepIn(p, 0.6);
    if (hit) {
      var out = p.va * hit.a + p.vd * hit.d;
      if (out > 0) { p.va -= 1.55 * out * hit.a; p.vd -= 1.55 * out * hit.d; p.va *= 0.9; p.vd *= 0.9; }
    }
  }

  // Does a skater get the free puck? Whoever it comes close to gets one
  // try. A slow puck is easy. A fast pass is easy for the player it was
  // meant for, hard for anyone else. A low shot can be blocked.
  function takes(s, dice) {
    var p = s.puck;
    if (p.owner || p.h > 1.3) return;                    // too high: it flies over the sticks
    var v = speedOf(p), near = [];
    eachSkater(s, function (k, team, role) {
      var id = team + role;
      if (k.miss > 0 || p.tried[id]) return;
      var meant = !!p.pass && p.pass.team === team && p.pass.to === role;
      var reach = meant ? (team === "us" ? s.lv.catchFeet : 5) : (team === "us" && role === s.you ? 4.6 : 4.2);
      var f = feet(k, p);
      if (f <= reach) near.push({ k: k, team: team, role: role, id: id, f: f, meant: meant });
    });
    near.sort(function (x, y) { return x.f - y.f; });
    for (var i = 0; i < near.length; i++) {
      var n = near[i], chance;
      if (v < 18) chance = 1;
      else if (n.meant) chance = 0.97 - clamp((v - 60) / 45, 0, 0.45) - (p.h > 0.3 ? 0.12 : 0);
      else if (n.team === p.last) chance = 0.7 - clamp((v - 60) / 45, 0, 0.4);
      else if (p.shot) chance = p.h < 0.8 ? 0.22 : 0;                       // a block
      else chance = clamp(0.42 * (n.team === "them" ? s.lv.checkSkill / 0.34 : 1), 0.05, 0.8);   // picking off a pass
      p.tried[n.id] = true;
      if (dice() < chance) { gain(s, n.team, n.role); return; }
      n.k.miss = 0.5;
    }
  }

  // ---------- The goalies -----------------------------------------------------
  // A goalie stands between the puck and the middle of the net and
  // follows the puck from side to side. When a puck comes at the net
  // the goalie gets one try (see "beaten" below for what makes a shot
  // hard to stop). Returns true if the whistle blew.
  function goalies(s, dt, dice, ev) {
    var p = s.puck, lv = s.lv, stopped = false;
    ["us", "them"].forEach(function (att) {
      if (stopped) return;
      var def = other(att), skill = def === "them" ? lv.theirGoalie : lv.ourGoalie;
      var g = see(att, s.goalie[def]), q = see(att, p);
      // 1. Follow the puck.
      var want;
      if (q.d >= GOAL_LINE - 0.8) want = pt(GOAL.a + clamp(q.a - GOAL.a, -2.6, 2.6), GOAL_LINE - 1);
      else { var n = feet(q, GOAL); want = pt(GOAL.a + (q.a - GOAL.a) / n * 4.2, GOAL.d + (q.d - GOAL.d) / n * 4.2); }
      g = toward(g, want, (7 + 9 * skill) * dt);
      s.goalie[def] = see(att, g);
      if (s.phase !== "play") return;
      var faceOff = pt(q.a < W / 2 ? 20.5 : 64.5, 169), words = (def === "us" ? "Our" : "Their") + " goalie covers the puck.";
      function cover(text) {
        whistle(s, ev, { kind: "cover", team: def, spot: pt(p.a, p.d), text: text }, see(att, faceOff), 1.5);
        stopped = true;
      }
      // 2. A puck carrier who skates right into the goalie loses the puck.
      if (p.owner === att && feet(see(att, s[att][p.carrier]), g) < 3.7) { cover(words); return; }
      if (p.owner) return;
      var v = speedOf(p), up = att === "us" ? p.vd : -p.vd, gap = feet(q, g);
      // 3. A puck flying at the net.
      if (!p.goalieTried && up > 6 && gap < 2.9 && p.h < 4.6) {
        p.goalieTried = true;
        // How far from the goalie's middle does the puck pass?
        var va = att === "us" ? p.va : -p.va, miss = Math.abs((g.a - q.a) * up - (g.d - q.d) * va) / Math.max(v, 1);
        var screen = ROLES.some(function (r) { var k = see(att, s[att][r]); return feet(k, GOAL) < 14 && k.d < GOAL_LINE && feet(k, q) > 6; });
        // How long has the goalie seen it coming? A quarter of a second is
        // needed just to react; after that the goalie slides into the way.
        var seen = Math.max(0, (p.sent ? s.time - p.sent.at : 0.3) - 0.25);
        miss = Math.max(0, miss - (7 + 9 * skill) * seen);
        // "skill" is how many plain shots the goalie stops. A shot is harder
        // to stop when it passes far from the goalie's middle, when it is
        // fast, when it is high, and when somebody stands in front. It is
        // easier when the goalie had time to see it (a shot from far away).
        var beaten = (1 - skill) * (1 + 0.6 * Math.pow(miss / 2.9, 2)) * (1 + 0.25 * clamp((v - 60) / 50, 0, 1)) *
                     (p.h > 2.2 ? 1.15 : 1) * (screen ? 1.3 : 1) / (1 + 6 * seen);
        var save = 1 - clamp(beaten, 0.02, 0.95);
        if (dice() < save) {
          s.stats.saves[def]++;
          var low = p.h < 1.2;
          // Most saves bounce back out. A slow or low shot is easier to hold on to.
          if (dice() < 0.14 + (v < 70 ? 0.1 : 0) + (low ? 0.06 : 0)) { cover("Save! " + words); return; }
          // A rebound: the puck bounces back out in front.
          var turn = (dice() - 0.5) * 2.1, speed = 18 + 14 * dice(), sign = att === "us" ? 1 : -1;
          p.va = Math.sin(turn) * speed * sign; p.vd = -Math.cos(turn) * speed * sign;
          p.h = 0; p.vh = 0; p.sent = null; p.pass = null; p.shot = null; p.tried = {}; p.last = def; p.goalieTried = false;
          ev.push({ kind: "save", team: def, spot: pt(p.a, p.d), text: "Save by " + (def === "us" ? "our" : "their") + " goalie. Rebound!" });
        }
        return;
      }
      // 4. A slow, loose puck right at the goalie: cover it if an attacker
      //    is near, otherwise pass it to a defender.
      if (v < 14 && gap < 3.8 && p.h < 1) {
        var danger = ROLES.some(function (r) { return feet(see(att, s[att][r]), g) < 8; });
        if (danger) { cover(words); return; }
        var to = feet(s[def].LD, p) < feet(s[def].RD, p) ? "LD" : "RD";
        p.last = def; p.sent = null; p.shot = null; p.tried = {}; p.goalieTried = false;
        p.pass = { team: def, to: to };
        fly(s, s[def][to], 40, 0);
      }
    });
    return stopped;
  }

  // ---------- The lines: offside, icing and goals --------------------------------
  // "before" is where the puck was one step ago. Returns true if the
  // whistle blew.
  function lines(s, before, ev) {
    var p = s.puck, blew = false;
    ["us", "them"].forEach(function (att) {
      if (blew) return;
      var was = see(att, before), now = see(att, p);
      // OFFSIDE: the puck goes into the attacking zone, sent or carried
      // by the attackers, and an attacker is already in there. (The one
      // who carries the puck may cross ahead of it.)
      if (was.d <= ZONE && now.d > ZONE && p.last === att) {
        var who = null;
        ROLES.forEach(function (r) {
          if (p.owner === att && p.carrier === r) return;
          var k = see(att, s[att][r]);
          if (k.d > INSIDE && (!who || k.d > who.d)) who = { role: r, d: k.d };
        });
        if (who) {
          var name = nameOf(s, att, who.role), line = att === "us" ? "their" : "our";
          s.stats.offside[att]++;
          whistle(s, ev, { kind: "offside", team: att, role: who.role, spot: pt(p.a, p.d),
            text: "Offside. " + name + (name === "You" ? " were" : " was") + " inside " + line + " blue line before the puck." +
                  (name === "You" ? " Wait at the line until the puck crosses." : "") },
            see(att, pt(now.a < W / 2 ? 20.5 : 64.5, 120)), 1.6);
          blew = true;
          return;
        }
      }
      // The puck goes over the goal line.
      if (!p.owner && was.d <= GOAL_LINE && now.d > GOAL_LINE) {
        var t = (GOAL_LINE - was.d) / (now.d - was.d), across = was.a + (now.a - was.a) * t;
        if (Math.abs(across - GOAL.a) < POST && p.h < BAR) {
          // GOAL!
          s.score[att]++;
          var scorer = p.sent && p.sent.team === att ? nameOf(s, att, p.sent.role) : (att === "us" ? "We" : "They");
          whistle(s, ev, { kind: "goal", team: att, spot: pt(p.a, p.d),
            text: scorer === "You" ? "Goal! You score!" : scorer === "We" || scorer === "They" ? "Goal! " + scorer + " score." : "Goal! " + scorer + " scores." },
            pt(42.5, 100), 2.2);
          blew = true;
        } else if (p.sent && p.sent.team === att && see(att, p.sent.from).d < CENTER) {
          // ICING: sent from their own half, over the far goal line, untouched.
          s.stats.icing[att]++;
          whistle(s, ev, { kind: "icing", team: att, spot: pt(p.a, p.d),
            text: "Icing. " + (att === "us" ? "We" : "They") + " sent the puck from " + (att === "us" ? "our" : "their") +
                  " own half all the way over the far goal line, and nobody touched it." },
            see(att, pt(now.a < W / 2 ? 20.5 : 64.5, 31)), 1.6);
          blew = true;
        }
      }
    });
    return blew;
  }

  // ---------- Whistles and face-offs ------------------------------------------------
  // The referee blows the whistle: play stops, then there is a face-off.
  function whistle(s, ev, event, faceOffAt, dead) {
    var p = s.puck;
    event.whistle = true;
    ev.push(event);
    s.phase = "dead";
    s.stop = { t: 0, dead: dead, spot: faceOffAt, reason: event.kind, early: false, wait: 0, their: 0 };
    p.owner = null; p.carrier = null; p.pass = null; p.shot = null; p.sent = null;
    p.va = 0; p.vd = 0; p.vh = 0; p.h = 0;
    s.aim = null; s.called = 0;
    eachSkater(s, function (k) { k.va = 0; k.vd = 0; k.burst = 0; k.tired = 0; k.slow = 0; k.miss = 0; k.cool = 0; });
  }
  // Somebody wins the face-off: their center draws the puck back to a defender.
  function winFaceoff(s, team, ev, text) {
    var p = s.puck;
    s.phase = "play"; s.stop = null;
    s.stats.faceoffs[team]++;
    p.last = team; s.side = team;
    p.pass = { team: team, to: "LD" }; p.tried = {}; p.goalieTried = false; p.sent = null; p.shot = null;
    s.us.C.miss = 0.5; s.them.C.miss = 0.5;
    fly(s, s[team].LD, 34, 0);
    ev.push({ kind: "faceoff", team: team, spot: pt(p.a, p.d), text: text || (team === "us" ? "We win the face-off." : "They win the face-off.") });
  }
  // What happens while play is stopped.
  function stoppage(s, input, dt, dice, ev) {
    var st = s.stop, p = s.puck;
    st.t += dt;
    goalies(s, dt, dice, ev);
    if (s.phase === "dead") {                       // everybody stops where they are for a moment
      if (st.t >= st.dead) { s.phase = "set"; st.t = 0; }
      return;
    }
    if (s.phase === "set") {                        // everybody glides to the face-off
      var spots = lineUp(st.spot), done = st.t >= 1.3;
      p.a = st.spot.a; p.d = st.spot.d;
      eachSkater(s, function (k, team, r) {
        var q = spots[team][r], part = done ? 1 : Math.min(1, 5 * dt);
        k.a += (q.a - k.a) * part; k.d += (q.d - k.d) * part;
        k.fa = 0; k.fd = team === "us" ? 1 : -1;
      });
      if (done) { s.phase = "drop"; st.t = 0; st.wait = 0.7 + 0.9 * dice(); }
      return;
    }
    if (s.phase === "drop") {                       // the referee holds the puck... and drops it
      if (input.pass && s.you === "C" && !input.auto) st.early = true;
      if (st.t < st.wait) return;
      if (s.you !== "C" || input.auto) { winFaceoff(s, dice() < 0.5 ? "us" : "them", ev); return; }
      if (st.early) { winFaceoff(s, "them", ev, "You moved before the puck dropped. They win the face-off."); return; }
      s.phase = "draw"; st.t = 0; st.their = s.lv.faceoff * (0.75 + 0.5 * dice());
      return;
    }
    // "draw": you are the center. Tap Pass before their center does.
    if (input.pass) winFaceoff(s, "us", ev, "You win the face-off!");
    else if (st.t >= st.their) winFaceoff(s, "them", ev);
  }

  // ---------- The referee ----------------------------------------------------------
  // The referee skates along the boards, on the side away from the
  // puck and a little behind the play. For an offside the referee
  // stands on the blue line.
  function refSpot(puck, last, reason) {
    var side = last.a < W / 2 ? 6 : 79;
    if (Math.abs(puck.a - side) < 14) side = side === 6 ? 79 : 6;    // the play came too close: cross over
    var d = clamp(puck.d + (puck.d > CENTER ? -10 : 10), 14, L - 14);
    if (reason === "offside") d = puck.d > CENTER ? 125.5 : 74.5;
    return pt(side, d);
  }
  function moveRef(s, dt) {
    var want = refSpot(s.puck, s.ref, s.stop && s.phase === "dead" ? s.stop.reason : null);
    s.ref = toward(s.ref, want, 30 * dt);
  }

  // =====================================================================
  //  ONE STEP OF THE GAME
  //    input   = what you are doing (see yourWant). input.auto = true
  //              lets the computer play your skater too.
  //    intents = what the computer players want (from gamebrain.js):
  //              { us: { LW: { move, act }, ... }, them: { ... } }
  //    dt      = how long the step is (1/60 of a second)
  //  Changes "s" and returns what happened in this step: a list of
  //  { kind, team, text, spot, whistle }.
  //  kinds: goal, save, cover, offside, icing, faceoff, steal, end
  // =====================================================================
  function tick(s, input, intents, dt, dice) {
    var ev = [];
    if (s.phase === "over") return ev;
    input = input || {};
    dt = dt || TICK;
    s.time += dt;
    moveRef(s, dt);
    if (s.phase !== "play") { stoppage(s, input, dt, dice, ev); return ev; }

    s.clock -= dt;
    if (s.clock <= 0) {
      s.clock = 0; s.phase = "over"; s.aim = null;
      ev.push({ kind: "end", whistle: true, spot: pt(s.puck.a, s.puck.d),
                text: "Time! Final score: us " + s.score.us + ", them " + s.score.them + "." });
      return ev;
    }
    var p = s.puck;
    if (s.called > 0) s.called -= dt;
    if (input.call && p.owner === "us" && p.carrier !== s.you) s.called = 1.2;

    // 1. What does everybody want to do?
    var wants = { us: {}, them: {} };
    eachSkater(s, function (k, team, role) {
      ["slow", "tired", "cool", "miss"].forEach(function (timer) { if (k[timer] > 0) k[timer] = Math.max(0, k[timer] - dt); });
      if (k.burst > 0) { k.burst -= dt; if (k.burst <= 0) { k.burst = 0; k.tired = 1.2; } }   // after the quick move you are slow for a bit
      var mine = team === "us" && role === s.you && !input.auto;
      wants[team][role] = mine ? yourWant(s, input, dt) : (intents && intents[team] && intents[team][role]) || STILL;
    });
    // 2. Passes, shots, stick checks and quick moves.
    eachSkater(s, function (k, team, role) {
      var w = wants[team][role];
      if (w.act && s.phase === "play") doAct(s, team, role, w.act, dice, ev);
    });
    // 3. Everybody skates.
    eachSkater(s, function (k, team, role) { skate(k, wants[team][role].move, topSpeed(s, k, team, role), dt); });
    apart(s);
    // 4. The puck moves: on a stick, or free.
    var before = pt(p.a, p.d);
    if (p.owner) hold(s); else slide(s, dt);
    // 5. The goalies, who gets a free puck, and the lines.
    if (goalies(s, dt, dice, ev)) return ev;
    takes(s, dice);
    lines(s, before, ev);
    return ev;
  }

  var api = {
    // the rink and the helpers
    GOAL: GOAL, OUR_BLUE: OUR_BLUE, THEIR_BLUE: THEIR_BLUE, ZONE: ZONE, INSIDE: INSIDE, CENTER: CENTER, GOAL_LINE: GOAL_LINE, TICK: TICK,
    makeDice: makeDice, flip: flip, flipSide: flipSide, toward: toward, feetFromLine: feetFromLine, nearest: nearest,
    see: see, other: other, keepIn: keepIn,
    // the playbook and the chances
    attackSpots: attackSpots, defendSpots: defendSpots,
    passChance: passChance, carryChance: carryChance, shotChance: shotChance, looseChance: looseChance,
    // the age groups and the bars
    AGE_NAMES: AGE_NAMES, DIALS: DIALS, levelFor: levelFor, barAt: barAt, greens: greens, passSpeed: passSpeed, shotSpeed: shotSpeed,
    // the game
    newGame: newGame, startPlay: startPlay, tick: tick, gain: gain, lineUp: lineUp, refSpot: refSpot,
    youHavePuck: youHavePuck, passTarget: passTarget, passIsOffside: passIsOffside, bars: bars, nameOf: nameOf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachGame = api;
})(typeof window !== "undefined" ? window : globalThis);
