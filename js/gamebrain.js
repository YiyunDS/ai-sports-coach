// =====================================================================
//  gamebrain.js  --  THE COMPUTER PLAYERS OF THE LIVE GAME
//
//  gamesim.js knows the rules. This file is the "brain" of everybody
//  you do not control: your four teammates and the five skaters of the
//  other team. Sixty times a second it answers two questions for each
//  of them:
//      1. Where do you want to skate?
//      2. Do you want to do something right now (pass, shoot, check)?
//
//  WHERE THEY SKATE
//    To the spot the Positioning playbook gives their position for
//    where the puck is now (attackSpots and defendSpots in gamesim.js).
//    The skater nearest to a loose puck goes and gets it, and one
//    defender always goes at the puck carrier.
//
//  WHAT THE PUCK CARRIER DOES
//    Every little while the carrier looks at the choices (pass to each
//    teammate, skate with it, shoot, dump it in) and picks one. Better
//    chances are picked more often, but not always: real players do not
//    make the perfect play every time either.
//
//  MISTAKES, ON PURPOSE
//    Real players go offside and ice the puck. So here, now and then, a
//    forward crosses the blue line too early, and a defender under
//    pressure fires the puck the length of the ice. How often depends
//    on the age group (the "early" and "icing" dials in gamesim.js).
//
//  Like gamesim.js, each team is looked at from its own side: it
//  attacks UP the ice toward d = 189.
//
//  No drawing here, so we can test it:  node tests/gamebrain.test.js
// =====================================================================
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var P = node ? require("./positions.js") : root.CoachPositions;
  var G = node ? require("./gamesim.js") : root.CoachGame;

  var ROLES = P.ROLES, W = P.RINK.width;
  var FORWARDS = ["LW", "C", "RW"];
  function pt(a, d) { return { a: a, d: d }; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function feet(p, q) { return P.feetBetween(p, q); }

  // Where a skater with the puck heads (seen from the attacking side):
  // up the ice, and once inside their zone, toward the net.
  function carryTarget(from) {
    if (from.d >= 150) return G.toward(from, pt(42.5, 176), 22);
    if (from.d >= G.THEIR_BLUE) return G.toward(from, pt(42.5, 170), 26);
    return pt(clamp(from.a + (W / 2 - from.a) * 0.25, 5, W - 5), from.d + 28);
  }

  // How hard a computer player passes: harder for a longer pass.
  function passPower(dist) { return clamp((clamp(28 + dist * 0.75, 30, 68) - 22) / 50, 0, 1); }

  // Everything the puck carrier could do, each with a weight: the
  // bigger the weight, the more often it is picked.
  //   mine, theirs = the two teams, seen from the carrier's side
  function choices(s, team, role, mine, theirs, puck, dice) {
    var lv = s.lv, list = [];
    var pressure = G.nearest(theirs, puck).feet;
    ROLES.forEach(function (r) {
      if (r === role) return;
      var to = mine[r], chance = G.passChance(puck, to, theirs, 0);
      // That teammate is already inside their blue line and the puck is
      // not: a pass there is offside. Players usually see that.
      if (G.passIsOffside(s, team, r) && dice() > lv.early * 1.5) return;
      var worth = to.d >= G.THEIR_BLUE ? 0.6 + 22 * G.shotChance(to, null, false) : clamp(1 + (to.d - puck.d) / 20, 0.15, 3.5);
      // Teammates look for YOU a little more, and a lot more when you call for it.
      var you = team === "us" && r === s.you ? (s.called > 0 ? 10 : 1.3) : 1;
      list.push({ kind: "pass", to: r, weight: 0.6 * chance * worth * you });
    });
    list.push({ kind: "carry", weight: G.carryChance(puck, theirs) * (puck.d < G.THEIR_BLUE ? 2.2 : puck.d < 165 ? 0.9 : 0.5) });
    if (puck.d >= G.ZONE) {
      var screen = ROLES.some(function (r) { return r !== role && feet(mine[r], G.GOAL) < 14 && mine[r].d < G.GOAL.d; });
      var goal = G.shotChance(puck, theirs, screen);
      list.push({ kind: "shoot", weight: (45 * goal + 0.3) * (feet(puck, G.GOAL) < 22 ? 2 : 1) });
    }
    // Past center a dump into the corner is safe. From your own half it
    // can be icing, so players only do that under pressure, by mistake.
    if (puck.d > G.CENTER + 2 && puck.d < G.THEIR_BLUE - 5) list.push({ kind: "dump", weight: 0.2 });
    if (puck.d < 70 && pressure < 9) list.push({ kind: "clear", weight: lv.icing * 8 });
    return list;
  }
  function pick(list, dice) {
    var total = list.reduce(function (sum, o) { return sum + o.weight; }, 0), roll = dice() * total;
    for (var i = 0; i < list.length; i++) { roll -= list[i].weight; if (roll <= 0) return list[i]; }
    return list[list.length - 1];
  }

  // What one team's computer players want in this step.
  //   out = { LW: { move: { a, d }, act }, ... }  (filled in here)
  function teamWants(s, team, dice, dt, out) {
    var p = s.puck, lv = s.lv, foe = G.other(team), mem = s.brain[team];
    if (!mem.early) { mem.early = {}; mem.wait = {}; mem.think = mem.think || 0; mem.plan = mem.plan || null; mem.rush = false; }
    var mine = {}, theirs = {};
    ROLES.forEach(function (r) { mine[r] = G.see(team, s[team][r]); theirs[r] = G.see(team, s[foe][r]); });
    var puck = G.see(team, p);
    var has = p.owner === team, coming = !p.owner && !!p.pass && p.pass.team === team;
    var loose = !p.owner && !p.pass;
    var attacking = has || coming || (loose && s.side === team);
    var targets = {}, acts = {};

    // A new rush up the ice: now and then a forward will go in too early.
    if (attacking && puck.d > G.CENTER && !mem.rush) {
      mem.rush = true;
      FORWARDS.forEach(function (r) { mem.early[r] = dice() < lv.early * 0.6 ? 2.5 : 0; });
    }
    if (!attacking || puck.d < 90) mem.rush = false;
    FORWARDS.forEach(function (r) { if (mem.early[r] > 0 && puck.d > G.THEIR_BLUE - 25) mem.early[r] -= dt; });

    // Who goes for the puck? The nearest skater (not YOU: you decide that yourself).
    var chaser = null;
    ROLES.forEach(function (r) {
      if (team === "us" && r === s.you && !s.auto) return;
      var f = feet(mine[r], puck);
      if (!chaser || f < chaser.feet) chaser = { role: r, feet: f };
    });

    if (attacking) {
      var carrier = has ? p.carrier : coming ? p.pass.to : G.nearest(mine, puck).role;
      var spots = G.attackSpots(puck, carrier);
      ROLES.forEach(function (r) {
        var to = pt(spots[r].a, spots[r].d);
        // ONSIDE: until the puck is inside their blue line, wait just
        // outside it. (A player who is "early" drifts in: a mistake.)
        if (puck.d <= G.ZONE) to.d = mem.early[r] > 0 ? G.ZONE + 7 : Math.min(to.d, G.ZONE - 3.5);
        targets[r] = to;
      });
      if (coming) targets[p.pass.to] = puck;                   // skate to meet the pass
      if (loose) targets[chaser.role] = pt(puck.a, puck.d);    // go and get it
      if (has) {
        var role = p.carrier;
        mem.think -= dt;
        if (!(team === "us" && role === s.you && !s.auto)) {
          var called = team === "us" && s.called > 0 && role !== s.you;
          if (mem.think <= 0 || called) {
            var plan = called && G.passChance(puck, mine[s.you], theirs, 0) >= 0.2
              ? { kind: "pass", to: s.you } : pick(choices(s, team, role, mine, theirs, puck, dice), dice);
            mem.think = (team === "them" ? lv.think : 0.85) * (0.6 + 0.8 * dice());
            mem.plan = { to: carryTarget(puck) };
            if (plan.kind === "pass") {
              var dist = feet(puck, mine[plan.to]);
              var blocked = ROLES.some(function (r) { return G.feetFromLine(theirs[r], puck, mine[plan.to]) < 4; });
              acts[role] = { kind: "pass", to: plan.to, power: passPower(dist), lift: blocked && dice() < 0.5 ? 0.65 : 0 };
            } else if (plan.kind === "shoot") {
              acts[role] = { kind: "shoot", power: 0.55 + 0.4 * dice(), lift: 0.15 + 0.6 * dice(), side: 0 };
            } else if (plan.kind === "dump") {
              acts[role] = { kind: "send", to: pt(puck.a < W / 2 ? 9 : 76, 191), speed: 55, lift: 0 };
            } else if (plan.kind === "clear") {
              acts[role] = { kind: "send", to: pt(20 + 45 * dice(), 197), speed: 95, lift: 0.3 };
            } else {
              // Skating with it. A teammate inside their blue line before the
              // puck would make it offside: most players wait for them.
              var ahead = ROLES.some(function (r) { return r !== role && mine[r].d > G.INSIDE; });
              if (puck.d <= G.ZONE && ahead && dice() > lv.early * 1.5) mem.plan.to = pt(puck.a, Math.min(puck.d, G.ZONE - 7));
              // A defender right in front: sometimes try the quick move.
              var near = G.nearest(theirs, puck);
              if (near.feet < 8 && theirs[near.role].d > puck.d && dice() < 0.25) acts[role] = { kind: "burst" };
            }
          }
          targets[role] = (mem.plan && mem.plan.to) || carryTarget(puck);
        }
      }
    } else {
      // DEFENDING: everybody to their spot, and one skater at the puck.
      var cover = G.defendSpots(puck);
      ROLES.forEach(function (r) { targets[r] = pt(cover[r].a, cover[r].d); });
      targets[chaser.role] = pt(puck.a, puck.d);
      ROLES.forEach(function (r) {
        // Close to the carrier for a moment: try a stick check.
        var close = p.owner === foe && feet(mine[r], puck) < 5.6 && !(team === "us" && r === s.you && !s.auto);
        mem.wait[r] = close ? (mem.wait[r] || 0) + dt : 0;
        if (close && mem.wait[r] > (team === "them" ? lv.think * 0.7 : 0.5) && s[team][r].cool <= 0) {
          acts[r] = { kind: "check" };
          mem.wait[r] = 0;
        }
      });
    }

    // Turn "where to" into "which way", and back into the real rink.
    var turn = team === "us" ? 1 : -1;
    ROLES.forEach(function (r) {
      var to = targets[r] || mine[r], da = to.a - mine[r].a, dd = to.d - mine[r].d, n = Math.sqrt(da * da + dd * dd);
      var push = n < 1.5 ? 0 : Math.min(1, n / 6);            // slow down when nearly there
      out[r] = { move: n ? { a: da / n * push * turn, d: dd / n * push * turn } : { a: 0, d: 0 }, act: acts[r] || null };
    });
  }

  // The spot the playbook wants for every position of a team right now,
  // in the real rink: { attacking: true or false, spots: { LW: { a, d, tip }, ... } }.
  // These are the spots the computer players skate to (before one of
  // them leaves to chase the puck). The coach's report uses them to
  // say how well YOU held your position.
  function spots(s, team) {
    var p = s.puck, mine = {}, out = {};
    ROLES.forEach(function (r) { mine[r] = G.see(team, s[team][r]); });
    var puck = G.see(team, p);
    var has = p.owner === team, coming = !p.owner && !!p.pass && p.pass.team === team;
    var attacking = has || coming || (!p.owner && !p.pass && s.side === team);
    var plan = attacking ? G.attackSpots(puck, has ? p.carrier : coming ? p.pass.to : G.nearest(mine, puck).role) : G.defendSpots(puck);
    ROLES.forEach(function (r) {
      var to = pt(plan[r].a, plan[r].d);
      if (attacking && puck.d <= G.ZONE) to.d = Math.min(to.d, G.ZONE - 3.5);   // onside: wait outside their blue line
      out[r] = G.see(team, to);
      out[r].tip = plan[r].tip;
    });
    return { attacking: attacking, spots: out };
  }

  // What all the computer players want in this step.
  function decide(s, dice, dt) {
    var out = { us: {}, them: {} };
    if (s.phase !== "play") return out;
    teamWants(s, "us", dice, dt || G.TICK, out.us);
    teamWants(s, "them", dice, dt || G.TICK, out.them);
    return out;
  }

  // One step of the whole game: the computer players decide, then the
  // rules play it out. Returns what happened (see tick in gamesim.js).
  //   input.auto = true lets the computer play your skater too.
  function play(s, input, dt, dice) {
    s.auto = !!(input && input.auto);
    return G.tick(s, input, decide(s, dice, dt), dt, dice);
  }

  var api = { decide: decide, play: play, choices: choices, spots: spots, carryTarget: carryTarget, passPower: passPower };
  if (node) module.exports = api;
  else root.CoachBrain = api;
})(typeof window !== "undefined" ? window : globalThis);
