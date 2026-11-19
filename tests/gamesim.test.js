// Run with:  node tests/gamesim.test.js
// Checks js/gamesim.js: the rules and the chances of the simulation game.
var G = require("../js/gamesim.js");
var P = require("../js/positions.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
function pt(a, d) { return { a: a, d: d }; }
function onTheIce(p, what) {
  assert.ok(p.a >= 2 && p.a <= 83 && p.d >= 2 && p.d <= 198, what + " is off the ice: " + JSON.stringify(p));
}
// Five defenders far away from everything (so they do not matter).
function nobodyNear() { return { LW: pt(3, 3), C: pt(4, 3), RW: pt(5, 3), LD: pt(6, 3), RD: pt(7, 3) }; }

// ---------- The dice and the small helpers ----------------------------
test("the same seed gives the same dice rolls", function () {
  var a = G.makeDice(42), b = G.makeDice(42), c = G.makeDice(43), same = true, differs = false;
  for (var i = 0; i < 50; i++) {
    var x = a(), y = b(), z = c();
    assert.ok(x >= 0 && x < 1);
    if (x !== y) same = false;
    if (x !== z) differs = true;
  }
  assert.ok(same && differs);
});

test("flipping the rink twice changes nothing, and a skater only gets so far in one beat", function () {
  var p = pt(12, 150);
  assert.deepStrictEqual(G.flip(G.flip(p)), p);
  assert.deepStrictEqual(G.flip(pt(42.5, 11)), pt(42.5, 189));     // our net <-> their net
  var far = G.toward(pt(10, 10), pt(10, 110), G.REACH);
  assert.ok(Math.abs(P.feetBetween(pt(10, 10), far) - G.REACH) < 1e-9);
  assert.deepStrictEqual(G.toward(pt(10, 10), pt(10, 20), G.REACH), pt(10, 20));
});

// ---------- The playbook for any puck position --------------------------
test("wherever the puck is, all five skaters have a spot on the ice and a tip", function () {
  for (var a = 5; a <= 80; a += 7.5) {
    for (var d = 5; d <= 195; d += 10) {
      var att = G.attackSpots(pt(a, d)), def = G.defendSpots(pt(a, d));
      P.ROLES.forEach(function (r) {
        onTheIce(att[r], "attack " + r); onTheIce(def[r], "defend " + r);
        assert.ok(att[r].tip.length > 20 && def[r].tip.length > 20);
      });
      // No two defenders are told to stand on the same spot.
      P.ROLES.forEach(function (r1, i) {
        P.ROLES.slice(i + 1).forEach(function (r2) {
          assert.ok(P.feetBetween(def[r1], def[r2]) >= 5, "defenders on top of each other at " + a + "," + d);
        });
      });
    }
  }
});

test("the right side is the mirror picture of the left side", function () {
  var left = G.attackSpots(pt(20, 140)), right = G.attackSpots(pt(65, 140));
  assert.strictEqual(right.RW.a, 85 - left.LW.a);
  assert.strictEqual(right.RW.d, left.LW.d);
  assert.strictEqual(right.LD.a, 85 - left.RD.a);
  assert.strictEqual(right.C.tip, left.C.tip);
});

test("five patterns are the Positioning tab's own playbook", function () {
  var corner = P.getSituation("oz-attack", "left"), mine = G.attackSpots(pt(10, 190));
  P.ROLES.forEach(function (r) { assert.strictEqual(mine[r].a, corner.spots[r].a); assert.strictEqual(mine[r].tip, corner.jobs[r]); });
  var dz = P.getSituation("dz-corner", "right"), def = G.defendSpots(pt(77, 9));
  P.ROLES.forEach(function (r) { assert.strictEqual(def[r].a, dz.spots[r].a); assert.strictEqual(def[r].d, dz.spots[r].d); });
});

test("on a rush the forwards wait at their blue line (onside)", function () {
  for (var d = 75; d < 125; d += 5) {
    var s = G.attackSpots(pt(30, d));
    ["LW", "C", "RW"].forEach(function (r) { assert.ok(s[r].d < G.THEIR_BLUE, r + " is offside with the puck at " + d); });
  }
});

test("the player with the puck is at the puck, and a teammate fills the open spot", function () {
  var puck = pt(10, 190);                       // the corner: normally the left wing's puck
  var usual = G.attackSpots(puck, "LW"), odd = G.attackSpots(puck, "C");
  assert.deepStrictEqual(pt(odd.C.a, odd.C.d), puck);
  assert.deepStrictEqual(pt(odd.LW.a, odd.LW.d), pt(usual.C.a, usual.C.d)); // the wing takes the center's high slot
  assert.deepStrictEqual(pt(odd.RW.a, odd.RW.d), pt(usual.RW.a, usual.RW.d));
});

// ---------- The chances -------------------------------------------------
test("shots: close and straight in front is best", function () {
  var netFront = G.shotChance(pt(44, 180)), slot = G.shotChance(pt(42.5, 162));
  var point = G.shotChance(pt(14, 129)), corner = G.shotChance(pt(10, 187)), behind = G.shotChance(pt(30, 194));
  assert.ok(netFront > slot && slot > point && point > corner && corner > behind, [netFront, slot, point, corner, behind].join(" "));
  assert.ok(netFront < 0.6 && behind > 0, "always a chance, never a sure thing");
  // A teammate screening the goalie helps; a defender in your face hurts.
  assert.ok(G.shotChance(pt(42.5, 162), null, true) > slot);
  var tight = nobodyNear(); tight.C = pt(42.5, 165);
  assert.ok(G.shotChance(pt(42.5, 162), tight) < slot);
});

test("passes: short and open is best", function () {
  var open = nobodyNear();
  var short = G.passChance(pt(20, 100), pt(40, 100), open), long = G.passChance(pt(5, 100), pt(80, 100), open);
  assert.ok(short > long && short <= 0.96 && long >= 0.1);
  // A defender standing in the passing lane.
  var blocked = nobodyNear(); blocked.C = pt(30, 101);
  assert.ok(G.passChance(pt(20, 100), pt(40, 100), blocked) < short - 0.2);
  // Across the front of your own net is worse than the same pass at center ice.
  var across = G.passChance(pt(20, 30), pt(65, 30), open), safe = G.passChance(pt(20, 100), pt(65, 100), open);
  assert.ok(across < safe - 0.1);
  // Behind our own net, defense to defense, is fine.
  assert.ok(Math.abs(G.passChance(pt(34, 7), pt(52, 7), open) - G.passChance(pt(34, 100), pt(52, 100), open)) < 1e-9);
});

test("stickhandling: open ice is easy, a defender right there is a coin flip", function () {
  var open = nobodyNear(), tight = nobodyNear();
  tight.LD = pt(42, 106);
  var free = G.carryChance(pt(42, 100), open), covered = G.carryChance(pt(42, 100), tight);
  assert.ok(free > 0.85 && covered > 0.4 && covered < 0.6, free + " " + covered);
});

test("a loose puck: the closer team usually gets it", function () {
  var near = nobodyNear(), far = nobodyNear();
  near.LW = pt(12, 188); far.LW = pt(40, 150);
  var p = G.looseChance(pt(9, 191), near, far);
  assert.ok(p > 0.7 && p <= 0.85);
  assert.ok(Math.abs(G.looseChance(pt(9, 191), far, near) - (1 - p)) < 1e-9);
});

// ---------- Starting a shift --------------------------------------------
test("every start puts ten skaters on the ice with someone on the puck", function () {
  G.STARTS.forEach(function (start) {
    P.ROLES.forEach(function (you) {
      var s = G.newShift(start.id, you, G.makeDice(5));
      assert.ok(s.owner === "us" || s.owner === "them");
      P.ROLES.forEach(function (r) { onTheIce(s.us[r], start.id + " us " + r); onTheIce(s.them[r], start.id + " them " + r); });
      assert.deepStrictEqual(s[s.owner][s.carrier], s.puck, start.id + ": nobody is on the puck");
      assert.strictEqual(s.beat, 0);
      assert.strictEqual(s.stats.shifts, 1);
    });
  });
  // The score and the counts carry over to the next shift.
  var first = G.newShift("rush", "C", G.makeDice(1));
  first.score.us = 2;
  var second = G.newShift("faceoff", "C", G.makeDice(1), first);
  assert.strictEqual(second.score.us, 2);
  assert.strictEqual(second.stats.shifts, 2);
});

test("with the puck you get the right choices for where you are", function () {
  function ids(startId, you) { return G.options(G.newShift(startId, you, G.makeDice(1))).map(function (o) { return o.id; }); }
  // At their blue line: four passes, a stickhandle and a shot. No dump-in.
  assert.deepStrictEqual(ids("oz-point", "LD").sort(), ["carry", "pass-C", "pass-LW", "pass-RD", "pass-RW", "shoot"]);
  // In the middle of the ice: you can dump it in, but you cannot shoot yet.
  var rush = ids("rush", "C");
  assert.ok(rush.indexOf("dump") >= 0 && rush.indexOf("shoot") < 0 && rush.indexOf("pass-C") < 0);
  // Behind our own net: only passes and a stickhandle.
  var out = ids("breakout", "LD");
  assert.ok(out.indexOf("dump") < 0 && out.indexOf("shoot") < 0 && out.length === 5);
  G.options(G.newShift("oz-point", "LD", G.makeDice(1))).forEach(function (o) { assert.ok(o.chance > 0 && o.chance < 1); });
});

// ---------- Playing a beat ----------------------------------------------
test("a beat is repeatable, and does not change the state it started from", function () {
  var start = G.newShift("oz-point", "LD", G.makeDice(9)), frozen = JSON.stringify(start);
  var one = G.step(start, { action: "pass-RD" }, G.makeDice(77));
  var two = G.step(start, { action: "pass-RD" }, G.makeDice(77));
  assert.deepStrictEqual(one, two);
  assert.strictEqual(JSON.stringify(start), frozen);
  assert.ok(one.events.length >= 1 && one.events[0].text.indexOf("You pass") === 0);
  assert.strictEqual(one.state.beat, 1);
  assert.strictEqual(one.state.stats.choices, 1);
  // A choice that is not on the list is refused.
  assert.throws(function () { G.step(start, { action: "fly" }, G.makeDice(1)); });
  assert.throws(function () { G.step(start, {}, G.makeDice(1)); });
});

test("without the puck you skate where you choose, but only so far", function () {
  var start = G.newShift("oz-corner", "RD", G.makeDice(9));   // the left wing has the puck
  var from = start.us.RD;
  var r = G.step(start, { moveTo: pt(42, 20) }, G.makeDice(3)); // all the way back to our net: too far for one beat
  assert.ok(Math.abs(P.feetBetween(from, r.state.us.RD) - G.REACH) < 1e-6);
  assert.strictEqual(r.state.lastSpot.grade, "far");
  assert.strictEqual(r.state.stats.spots, 1);
  assert.strictEqual(r.state.stats.onTarget, 0);
  // Staying on the right spot is on target.
  var stay = G.step(start, {}, G.makeDice(3));
  assert.strictEqual(stay.state.lastSpot.grade, "good");
  assert.strictEqual(stay.state.stats.onTarget, 1);
  assert.ok(stay.state.lastSpot.tip.length > 20);
});

test("being open gets you the puck; being out of position does not", function () {
  var s = G.newShift("oz-corner", "C", G.makeDice(9));
  function passToYou(grade) {
    s.lastSpot = { grade: grade };
    return G.options(s).filter(function (o) { return o.id === "pass-C"; })[0].chance;
  }
  assert.ok(passToYou("good") > passToYou("close") && passToYou("close") > passToYou("far") + 0.2);
  // On defense: their shot gets better when you are out of position.
  var d = G.newShift("dz-point", "C", G.makeDice(9));
  function theirShot(grade) {
    d.lastSpot = { grade: grade };
    return G.options(d).filter(function (o) { return o.id === "shoot"; })[0].chance;
  }
  assert.ok(theirShot("far") > theirShot("close") && theirShot("close") > theirShot("good"));
});

test("offside: you may not be inside their blue line before the puck", function () {
  var s = G.newShift("rush", "LW", G.makeDice(9));
  var always = function () { return 0; };       // dice that make everything work
  // You wait at the blue line: the pass to you is fine.
  var fine = G.step(s, {}, always);
  assert.strictEqual(fine.state.over, null);
  // You skate into their zone first: whistle.
  var early = G.step(s, { moveTo: pt(10, 140) }, always);
  assert.strictEqual(early.state.over.kind, "offside");
  assert.ok(/offside/i.test(early.events[early.events.length - 1].text));
});

// ---------- Many whole shifts -------------------------------------------
// Play n shifts with a made-up "you". Returns how the shifts ended.
function playMany(n, seed, startId, you, how) {
  var dice = G.makeDice(seed), keep = null, ended = {}, turnovers = 0, deepestBack = 200, s;
  for (var i = 0; i < n; i++) {
    s = G.newShift(startId, you, dice, keep);
    var guard = 0;
    while (!s.over) {
      assert.ok(++guard <= G.MAX_BEATS, "a shift went on too long");
      var input = G.youHavePuck(s) ? { action: how.choose(s, G.options(s), dice).id } : { moveTo: how.skate(s, dice) };
      var owner = s.owner, r = G.step(s, input, dice);
      s = r.state;
      if (s.owner !== owner) turnovers++;
      assert.ok(r.events.length >= 1 && r.events.every(function (e) { return e.text.length > 5; }));
      r.events.forEach(function (e) { onTheIce(e.puck, "the puck"); });
      onTheIce(s.puck, "the puck");
      if (!s.over) assert.deepStrictEqual(s[s.owner][s.carrier], s.puck, "nobody is on the puck");
      P.ROLES.forEach(function (role) { onTheIce(s.us[role], "us " + role); onTheIce(s.them[role], "them " + role); });
      deepestBack = Math.min(deepestBack, s.puck.d);
    }
    ended[s.over.kind] = (ended[s.over.kind] || 0) + 1;
    keep = s;
  }
  return { ended: ended, score: s.score, stats: s.stats, turnovers: turnovers, deepestBack: deepestBack };
}
var computerChoice = function (s, list, dice) { return G.pickForComputer(s, list, dice); };
var bestSpot = function (s) { var b = G.ideals(s).us[s.you]; return pt(b.a, b.d); };
var GOOD = { choose: computerChoice, skate: bestSpot };                              // always skates to the best spot
var LOST = { choose: computerChoice, skate: function (s) { return s.us[s.you]; } };  // never moves
var HOG = { choose: function (s, list) { return list.filter(function (o) { return o.id === "carry"; })[0]; }, skate: bestSpot };
var WILD = {                                                                          // picks and skates at random
  choose: function (s, list, dice) { return list[Math.floor(dice() * list.length)]; },
  skate: function (s, dice) { return pt(dice() * 85, dice() * 200); }
};

test("2,000 shifts of every kind stay inside the rules", function () {
  G.STARTS.forEach(function (start, i) {
    var r = playMany(300, 100 + i, start.id, P.ROLES[i % 5], i % 2 ? WILD : GOOD);
    var total = 0;
    Object.keys(r.ended).forEach(function (kind) {
      assert.ok(["goal-us", "goal-them", "whistle", "change", "offside"].indexOf(kind) >= 0, "strange ending: " + kind);
      total += r.ended[kind];
    });
    assert.strictEqual(total, 300);
    assert.strictEqual(r.score.us, r.ended["goal-us"] || 0);
    assert.strictEqual(r.score.them, r.ended["goal-them"] || 0);
    assert.strictEqual(r.stats.shifts, 300);
  });
});

test("from their blue line: sometimes we score, and sometimes they come rushing back", function () {
  var r = playMany(3000, 21, "oz-point", "LD", GOOD);
  var goals = r.ended["goal-us"] / 3000, against = (r.ended["goal-them"] || 0) / 3000;
  assert.ok(goals > 0.1 && goals < 0.35, "we score in " + Math.round(goals * 100) + "% of shifts");
  assert.ok(against > 0.002 && against < goals, "they score in " + (against * 100).toFixed(1) + "% of shifts");
  assert.ok(r.turnovers / 3000 > 1.5, "the puck hardly ever changes teams");
  assert.ok(r.deepestBack < 40, "the puck never came back to our end");
});

test("good positioning and sharing the puck pay off over many shifts", function () {
  var good = playMany(4000, 3, "faceoff", "C", GOOD);
  var lost = playMany(4000, 3, "faceoff", "C", LOST);
  var hog = playMany(4000, 3, "faceoff", "C", HOG);
  function diff(r) { return r.score.us - r.score.them; }
  // A player who never gets to the right spot gives up many more goals...
  assert.ok(lost.score.them > good.score.them * 1.4, lost.score.them + " vs " + good.score.them);
  assert.ok(diff(good) > diff(lost) + 40, diff(good) + " vs " + diff(lost));
  // ...and one who always stickhandles and never passes scores far less.
  assert.ok(good.score.us > hog.score.us * 1.5, good.score.us + " vs " + hog.score.us);
  assert.ok(good.stats.onTarget / good.stats.spots > 0.85 && lost.stats.onTarget / lost.stats.spots < 0.4);
});

console.log("All game tests passed!");
