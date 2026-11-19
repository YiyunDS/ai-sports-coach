// =====================================================================
//  gamesim.js  --  THE RULES OF THE HOCKEY SIMULATION GAME
//
//  The Positioning tab asks "where should you stand?". This game goes
//  one step further: the play keeps going, and what happens next is
//  decided by CHANCE, the way it is in real hockey.
//
//  HOW A SHIFT WORKS
//    The play moves in "beats" (one beat is about two seconds).
//    In every beat exactly one thing happens to the puck: a pass, a
//    stickhandle, a shot or a dump-in.
//      * If YOU have the puck, you choose what to do.
//      * If you do not, you choose where to skate, and the computer
//        chooses for the player who has the puck.
//    Then we roll the dice. A short pass to an open teammate works
//    almost every time. A long pass through a defender often does not.
//
//  WHY CHANCE?
//    Nobody can know if one shot will go in. But over many shots, a
//    shot from the slot scores much more often than a shot from the
//    corner. Good hockey is picking the play with the best chance.
//
//  HOW WE MEASURE THE RINK: in feet, exactly like positions.js.
//     a = across the ice (0 = left boards, 85 = right boards)
//     d = up the ice (11 = our goal line, 189 = their goal line)
//
//  No drawing in this file, so we can test it:
//      node tests/gamesim.test.js
// =====================================================================
(function (root) {
  "use strict";
  var P = (typeof module !== "undefined" && module.exports) ? require("./positions.js") : root.CoachPositions;

  var W = P.RINK.width, L = P.RINK.length;
  var ROLES = P.ROLES;
  var GOAL = { a: 42.5, d: 189 };   // the net a team shoots at, seen from that team's side
  var OUR_BLUE = 75, THEIR_BLUE = 125;
  var REACH = 45;        // how far a skater can get in one beat (feet)
  var GOOD_FEET = 10;    // this close to the best spot = on target
  var CLOSE_FEET = 20;   // this close = close
  var MAX_BEATS = 12;    // a shift ends after this many beats (line change)
  var QUICK_BONUS = 0.2;  // extra chance for the first play after winning the puck

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

  // The best spots for all ten skaters right now, in OUR view of the rink.
  function ideals(state) {
    if (state.owner === "us") {
      return { us: attackSpots(state.puck, state.carrier), them: mapTeam(defendSpots(flip(state.puck)), flip) };
    }
    return { us: defendSpots(state.puck), them: mapTeam(attackSpots(flip(state.puck), state.carrier), flip) };
  }

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

  // How good is your spot? "good" = on target, "close", or "far".
  function gradeSpot(you, best) {
    var f = feet(you, best);
    return { feet: f, grade: f <= GOOD_FEET ? "good" : f <= CLOSE_FEET ? "close" : "far" };
  }

  // =====================================================================
  //  THE GAME
  // =====================================================================

  // Ways to start a shift. "carrier" is who has the puck (for the other
  // team we work it out: whoever the playbook puts nearest the puck).
  var STARTS = [
    { id: "oz-point", name: "Their blue line: our defense has the puck", owner: "us", carrier: "LD", puck: pt(14, 129) },
    { id: "oz-corner", name: "Attacking: puck in their corner", owner: "us", carrier: "LW", puck: pt(10, 190) },
    { id: "rush", name: "Rush: our center carries it up the middle", owner: "us", carrier: "C", puck: pt(42.5, 92) },
    { id: "breakout", name: "Breakout: our defense has it behind our net", owner: "us", carrier: "LD", puck: pt(34, 7) },
    { id: "dz-corner", name: "Defending: they have the puck in our corner", owner: "them", puck: pt(8, 9) },
    { id: "dz-point", name: "Defending: they have the puck at our blue line", owner: "them", puck: pt(14, 71) },
    { id: "faceoff", name: "Faceoff at center ice", owner: "dice", puck: pt(42.5, 100) }
  ];
  function getStart(id) { return STARTS.filter(function (s) { return s.id === id; })[0] || STARTS[0]; }

  function plain(spots) { return mapTeam(spots, function (s) { return pt(s.a, s.d); }); }

  // Start a shift.
  //   you  = your position ("LW", "C", "RW", "LD" or "RD")
  //   dice = from makeDice
  //   keep = { score, stats } from the shift before (or nothing)
  function newShift(startId, you, dice, keep) {
    var start = getStart(startId);
    var state = {
      startId: start.id, you: you, owner: start.owner, carrier: start.carrier || null,
      puck: pt(start.puck.a, start.puck.d), us: null, them: null,
      beat: 0, over: null, lastSpot: null, justWon: false, intro: start.name + ".",
      score: keep && keep.score ? copy(keep.score) : { us: 0, them: 0 },
      stats: keep && keep.stats ? copy(keep.stats) : { shifts: 0, spots: 0, onTarget: 0, choices: 0 }
    };
    state.stats.shifts++;
    if (start.owner === "dice") {               // a faceoff: either team can win it
      state.owner = dice() < 0.5 ? "us" : "them";
      state.carrier = "LD";                     // the center draws it back to a defender
      state.puck = state.owner === "us" ? pt(30, 88) : flip(pt(30, 88));
      state.intro = state.owner === "us" ? "We win the faceoff back to our defense." : "They win the faceoff back to their defense.";
    }
    if (!state.carrier) {
      state.carrier = nearest(attackSpots(flip(state.puck)), flip(state.puck)).role;
    }
    var best = ideals(state);
    state.us = plain(best.us);
    state.them = plain(best.them);
    return state;
  }

  // Is it YOU who has the puck?
  function youHavePuck(state) { return state.owner === "us" && state.carrier === state.you; }

  // The rink as the team with the puck sees it: their own skaters,
  // the defenders, and the puck. "back" turns a spot into our view again.
  function view(state) {
    var ours = state.owner === "us";
    return {
      att: ours ? state.us : mapTeam(state.them, flip),
      def: ours ? state.them : mapTeam(state.us, flip),
      puck: ours ? state.puck : flip(state.puck),
      back: ours ? function (p) { return pt(p.a, p.d); } : flip
    };
  }

  // Where a stickhandle takes the puck (seen from the attacking side).
  function carryTarget(from) {
    if (from.d >= 150) return toward(from, pt(42.5, 176), 22);       // cut to the net
    if (from.d >= THEIR_BLUE) return toward(from, pt(42.5, 170), 26);
    return onIce(pt(from.a + (W / 2 - from.a) * 0.25, from.d + 28));   // up the ice
  }
  function cornerFor(from) { return pt(from.a < W / 2 ? 9 : 76, 191); }

  // Everything the player with the puck could do now, with its chance.
  //   kind "pass": chance the pass arrives      kind "carry": chance to get past
  //   kind "shoot": chance of a GOAL            kind "dump": chance we get it back
  function options(state) {
    var v = view(state), from = v.puck, list = [];
    var youDefend = state.owner === "them", grade = state.lastSpot ? state.lastSpot.grade : "close";
    // Right after the puck changes teams, the team that lost it is still
    // facing the wrong way. The first play the other way is easier.
    var quick = state.justWon ? QUICK_BONUS : 0;
    ROLES.forEach(function (role) {
      if (role === state.carrier) return;
      // Passing to YOU: being in a good spot means being open.
      var bonus = quick;
      if (state.owner === "us" && role === state.you) bonus += grade === "good" ? 0.05 : grade === "far" ? -0.25 : 0;
      list.push({ id: "pass-" + role, kind: "pass", to: role, chance: passChance(from, v.att[role], v.def, bonus) });
    });
    list.push({ id: "carry", kind: "carry", toNet: from.d >= THEIR_BLUE, chance: clamp(carryChance(from, v.def) + quick, 0.3, 0.92) });
    if (from.d >= THEIR_BLUE) {
      var screen = ROLES.some(function (r) { return r !== state.carrier && feet(v.att[r], GOAL) < 14 && v.att[r].d < GOAL.d; });
      var goal = shotChance(from, v.def, screen);
      // When YOU are defending, your spot matters: out of position, their shot is better.
      if (youDefend) goal = clamp(goal * (grade === "good" ? 0.8 : grade === "far" ? 1.3 : 1), 0.004, 0.6);
      list.push({ id: "shoot", kind: "shoot", chance: goal });
    }
    if (from.d >= OUR_BLUE && from.d < THEIR_BLUE) {
      list.push({ id: "dump", kind: "dump", chance: looseChance(cornerFor(from), v.att, v.def) });
    }
    return list;
  }

  // What the computer picks for a player with the puck. Better chances
  // and more dangerous spots are picked more often, but not always:
  // real players do not make the perfect play every time either.
  function pickForComputer(state, list, dice) {
    var v = view(state), from = v.puck;
    var weights = list.map(function (o) {
      if (o.kind === "shoot") return 45 * o.chance + 0.4;
      if (o.kind === "carry") return o.chance * (from.d < THEIR_BLUE ? 1.3 : from.d < 165 ? 0.8 : 0.5);
      if (o.kind === "dump") return 0.35;
      var to = v.att[o.to];
      var worth = to.d >= THEIR_BLUE ? 0.6 + 22 * shotChance(to, null, false) : clamp(1 + (to.d - from.d) / 20, 0.15, 3.5);
      // Teammates look for YOU when you are open (in a good spot).
      var open = 1;
      if (state.owner === "us" && o.to === state.you && state.lastSpot) {
        open = state.lastSpot.grade === "good" ? 4 : state.lastSpot.grade === "close" ? 2 : 0.5;
      }
      return o.chance * worth * open;
    });
    var total = weights.reduce(function (a, b) { return a + b; }, 0), roll = dice() * total;
    for (var i = 0; i < list.length; i++) { roll -= weights[i]; if (roll <= 0) return list[i]; }
    return list[list.length - 1];
  }

  // ---------- Saying what happened, in words ---------------------------
  function nameOf(state, team, role) {
    if (team === "us" && role === state.you) return "You";
    return (team === "us" ? "Our " : "Their ") + P.ROLE_NAMES[role].toLowerCase();
  }
  // "You pass" but "Our center passes".
  function does(who, verb, verbS) { return who + " " + (who === "You" ? verb : verbS); }
  // In the middle of a sentence: "you", "our center", "their center".
  function inside(who) { return who.charAt(0).toLowerCase() + who.slice(1); }

  // You skate to a spot (as far as you can get in one beat), and we
  // check how good that spot is for where the puck is right now.
  function skate(s, moveTo) {
    var best = ideals(s).us[s.you];
    s.us[s.you] = toward(s.us[s.you], onIce(moveTo || s.us[s.you]), REACH);
    var g = gradeSpot(s.us[s.you], best);
    s.lastSpot = { grade: g.grade, feet: g.feet, tip: best.tip, ideal: pt(best.a, best.d) };
  }

  // If you skated to this spot and called for the puck, what is the
  // chance the pass would reach you? (null when you cannot call for it)
  function callChance(state, moveTo) {
    if (state.over || state.owner !== "us" || youHavePuck(state)) return null;
    var s = copy(state);
    skate(s, moveTo);
    return options(s).filter(function (o) { return o.to === s.you; })[0].chance;
  }

  // Play one beat.
  //   input = { action: "pass-C" }      when you have the puck
  //           { moveTo: { a, d } }      when you do not (leave it out to stay)
  //           { moveTo, call: true }    the same, and you call for a pass
  // Returns { state: the new state, events: [{ text, puck }] }: what
  // happened, step by step, and where the puck went each time.
  function step(before, input, dice) {
    if (before.over) return { state: before, events: [] };
    input = input || {};
    var s = copy(before), events = [];
    s.beat++;

    // 1. Your part of the beat.
    var choice;
    if (youHavePuck(s)) {
      var all = options(s);
      choice = all.filter(function (o) { return o.id === input.action; })[0];
      if (!choice) throw new Error("Pick one of: " + all.map(function (o) { return o.id; }).join(", "));
      s.lastSpot = null;
      s.stats.choices++;
    } else {
      skate(s, input.moveTo);
      s.stats.spots++;
      if (s.lastSpot.grade === "good") s.stats.onTarget++;
      // You can CALL for the puck (tap your stick on the ice): then your
      // teammate passes to you. Otherwise the computer picks the play.
      var list = options(s);
      choice = input.call && s.owner === "us"
        ? list.filter(function (o) { return o.to === s.you; })[0]
        : pickForComputer(s, list, dice);
    }

    // 2. Roll the dice for what the puck carrier does.
    var v = view(s), from = v.puck, ownerBefore = s.owner;
    var attTeam = s.owner, defTeam = s.owner === "us" ? "them" : "us";
    var who = nameOf(s, attTeam, s.carrier);
    function say(text, puckSpot) { events.push({ text: text, puck: v.back(puckSpot) }); }
    function give(team, role, at) {              // this skater now has the puck, at this spot
      s.owner = team; s.carrier = role;
      s.puck = v.back(at);
      s[team][role] = pt(s.puck.a, s.puck.d);
    }
    function end(kind, text, puckSpot) {         // the whistle: the shift is over
      s.over = { kind: kind, text: text };
      s.puck = v.back(puckSpot);
    }
    // Offside: YOU were inside their blue line before the puck got there.
    function offside(newSpot) {
      if (attTeam !== "us" || from.d >= THEIR_BLUE || newSpot.d < THEIR_BLUE) return false;
      if (s.carrier === s.you || s.us[s.you].d <= THEIR_BLUE + 1) return false;
      say("Whistle! Offside.", newSpot);
      end("offside", "Offside: you crossed their blue line before the puck did. Wait for the puck next time.", newSpot);
      return true;
    }
    // A loose puck near "at": the closer team usually wins it.
    function loose(at, text, edge) {
      var attGets = dice() < clamp(looseChance(at, v.att, v.def) + (edge || 0), 0.1, 0.9);
      var team = attGets ? attTeam : defTeam, side = attGets ? v.att : v.def;
      var role = nearest(side, at).role;
      give(team, role, at);
      say(text + " " + does(nameOf(s, team, role), "get", "gets") + " to it first.", at);
    }

    if (choice.kind === "pass") {
      var to = v.att[choice.to], target = nameOf(s, attTeam, choice.to);
      if (dice() < choice.chance) {
        say(does(who, "pass", "passes") + " to " + inside(target) + ".", to);
        if (!offside(to)) give(attTeam, choice.to, to);
      } else {
        // The defender closest to the passing lane picks it off.
        var thief = null;
        ROLES.forEach(function (r) {
          var f = feetFromLine(v.def[r], from, to);
          if (!thief || f < thief.feet) thief = { role: r, feet: f };
        });
        var at = v.def[thief.role];
        give(defTeam, thief.role, at);
        say(does(who, "pass", "passes") + " toward " + inside(target) + ", but " +
            inside(does(nameOf(s, defTeam, thief.role), "pick", "picks")) + " it off.", at);
      }
    } else if (choice.kind === "carry") {
      if (dice() < choice.chance) {
        var dest = carryTarget(from);
        say(does(who, "stickhandle", "stickhandles") + (choice.toNet ? " toward the net." : " up the ice."), dest);
        if (!offside(dest)) give(attTeam, s.carrier, dest);
      } else {
        var taker = nearest(v.def, from).role;
        give(defTeam, taker, from);
        say(does(who, "try", "tries") + " to stickhandle through, but " +
            inside(does(nameOf(s, defTeam, taker), "take", "takes")) + " the puck away.", from);
      }
    } else if (choice.kind === "dump") {
      loose(cornerFor(from), does(who, "dump", "dumps") + " the puck into the corner.");
    } else {                                     // a shot
      if (dice() < choice.chance) {
        s.score[attTeam]++;
        say(does(who, "shoot", "shoots") + "... GOAL!", GOAL);
        end(attTeam === "us" ? "goal-us" : "goal-them", attTeam === "us" ? "We score!" : "They score.", GOAL);
      } else if (dice() < 0.25) {
        // Missed the net: the puck goes around the boards to the far corner.
        say(does(who, "shoot", "shoots") + " and misses the net.", pt(GOAL.a + (from.a < W / 2 ? 7 : -7), 196));
        loose(pt(from.a < W / 2 ? 76 : 9, 191), "The puck goes around the boards.");
      } else if (dice() < 0.28) {
        say(does(who, "shoot", "shoots") + ". Save, and the goalie covers the puck. Whistle.", GOAL);
        end("whistle", "The goalie froze the puck.", GOAL);
      } else {
        say(does(who, "shoot", "shoots") + ". Save! There is a rebound.", GOAL);
        // Defenders stand between the rebound and their net, so they get a small edge.
        loose(pt(GOAL.a + (dice() - 0.5) * 22, GOAL.d - 9 - dice() * 12), "The rebound pops out.", -0.05);
      }
    }

    // 3. Everybody skates toward their best spot for the new situation.
    //    (You only move when you choose to. With the puck, you are at the puck.)
    if (!s.over && s.beat >= MAX_BEATS) end("change", "Long shift. Time for a line change.", view(s).puck);
    s.justWon = s.owner !== ownerBefore;         // did the puck change teams in this beat?
    if (s.over) return { state: s, events: events };
    var next = ideals(s);
    ["us", "them"].forEach(function (team) {
      ROLES.forEach(function (r) {
        if (team === s.owner && r === s.carrier) { s[team][r] = pt(s.puck.a, s.puck.d); return; }
        if (team === "us" && r === s.you) return;
        s[team][r] = toward(s[team][r], next[team][r], REACH);
      });
    });
    return { state: s, events: events };
  }

  var api = {
    GOAL: GOAL, REACH: REACH, GOOD_FEET: GOOD_FEET, CLOSE_FEET: CLOSE_FEET, MAX_BEATS: MAX_BEATS,
    OUR_BLUE: OUR_BLUE, THEIR_BLUE: THEIR_BLUE, STARTS: STARTS,
    makeDice: makeDice, flip: flip, flipSide: flipSide, toward: toward, feetFromLine: feetFromLine, nearest: nearest,
    attackSpots: attackSpots, defendSpots: defendSpots, ideals: ideals,
    passChance: passChance, carryChance: carryChance, shotChance: shotChance, looseChance: looseChance, gradeSpot: gradeSpot,
    newShift: newShift, youHavePuck: youHavePuck, options: options, pickForComputer: pickForComputer,
    carryTarget: carryTarget, callChance: callChance, step: step
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachGame = api;
})(typeof window !== "undefined" ? window : globalThis);
