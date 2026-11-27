// Run with:  node tests/gamesim.test.js
// Checks js/gamesim.js: the rules and the chances of the live hockey game.
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

test("flipping the rink twice changes nothing, and each team sees the rink from its own side", function () {
  var p = pt(12, 150);
  assert.deepStrictEqual(G.flip(G.flip(p)), p);
  assert.deepStrictEqual(G.flip(pt(42.5, 11)), pt(42.5, 189));     // our net <-> their net
  assert.deepStrictEqual(G.see("us", p), p);
  assert.deepStrictEqual(G.see("them", p), G.flip(p));
  assert.deepStrictEqual(G.see("them", G.see("them", p)), p);      // turning twice = the first picture
  assert.deepStrictEqual(G.toward(pt(10, 10), pt(10, 110), 45), pt(10, 55));
  assert.deepStrictEqual(G.toward(pt(10, 10), pt(10, 20), 45), pt(10, 20));
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

// =====================================================================
//  THE LIVE GAME
// =====================================================================
var ROLES = P.ROLES, DT = 1 / 60;
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || "") + " got " + a + ", wanted " + b); }
// Dice that give these rolls first, and then always "rest".
function rolls(list, rest) {
  var i = 0;
  return function () { return i < list.length ? list[i++] : (rest === undefined ? 0.5 : rest); };
}
// A game in the middle of play with everybody parked by the left boards
// (ours at d = 88, theirs at d = 112), so a test can put the few
// players it needs where it wants them.
function quiet(you, age) {
  var s = G.newGame({ you: you || "C", age: age === undefined ? 3 : age, minutes: 3 });
  G.startPlay(s);
  ROLES.forEach(function (r, i) { put(s, "us", r, 4 + 4 * i, 88); put(s, "them", r, 4 + 4 * i, 112); });
  return s;
}
function put(s, team, role, a, d) {
  var k = s[team][role];
  k.a = a; k.d = d; k.va = 0; k.vd = 0; k.fa = 0; k.fd = team === "us" ? 1 : -1;
  return k;
}
// Play on for some seconds. "input" may be a function of the step number.
// Stops early when "until" says so. Returns everything that happened.
function run(s, seconds, input, dice, intents, until) {
  var all = [];
  for (var i = 0; i < Math.round(seconds * 60); i++) {
    var inp = typeof input === "function" ? input(i) : (i === 0 ? input : keepMoving(input));
    var ev = G.tick(s, inp, typeof intents === "function" ? intents(i) : intents, DT, dice || G.makeDice(3));
    all = all.concat(ev);
    if (until && until(s, ev)) break;
  }
  return all;
}
// A button is "pressed" in one step only; the steering stays.
function keepMoving(input) { return input && input.move ? { move: input.move } : {}; }
// What you would read in the play-by-play. (The quiet notes for the
// coach's report, like "pass" and "catch", are left out here.)
var LOUD = ["goal", "save", "cover", "offside", "icing", "faceoff", "steal", "end"];
function kinds(events) { return events.map(function (e) { return e.kind; }).filter(function (k) { return LOUD.indexOf(k) >= 0; }); }
function notes(events, kind) { return events.filter(function (e) { return e.kind === kind; }); }
function everybodyOnTheIce(s, what) {
  ["us", "them"].forEach(function (t) { ROLES.forEach(function (r) { onTheIce(s[t][r], what + " " + t + " " + r); }); });
  assert.ok(s.puck.a >= 0 && s.puck.a <= 85 && s.puck.d >= 0 && s.puck.d <= 200, what + ": the puck left the rink");
}

// ---------- The age groups and the bars ---------------------------------
test("seven age groups, from 4-5 to 16+, and every dial goes one way", function () {
  assert.deepStrictEqual(G.AGE_NAMES, ["4-5", "6-7", "8-9", "10-11", "12-13", "14-15", "16+"]);
  var harder = ["youSpeed", "mateSpeed", "themSpeed", "checkSkill", "theirGoalie", "early", "icing", "barSpeed"];
  var easier = ["think", "ourGoalie", "green", "catchFeet", "faceoff"];
  Object.keys(G.DIALS).forEach(function (k) { assert.strictEqual(G.DIALS[k].length, 7, k); });
  for (var i = 1; i < 7; i++) {
    harder.forEach(function (k) { assert.ok(G.DIALS[k][i] > G.DIALS[k][i - 1], k + " must go up at " + G.AGE_NAMES[i]); });
    easier.forEach(function (k) { assert.ok(G.DIALS[k][i] < G.DIALS[k][i - 1], k + " must go down at " + G.AGE_NAMES[i]); });
    assert.ok(!(G.DIALS.warn[i] && !G.DIALS.warn[i - 1]), "the offside warning never comes back for older players");
  }
  assert.strictEqual(harder.length + easier.length + 1, Object.keys(G.DIALS).length, "a dial is not checked");
  var young = G.levelFor(0), old = G.levelFor(6);
  assert.strictEqual(young.name, "4-5"); assert.strictEqual(old.name, "16+");
  assert.ok(young.warn && !old.warn);
  assert.ok(young.themSpeed < young.youSpeed * 0.7, "the youngest can always outskate the other team");
  assert.strictEqual(G.levelFor(99).name, "16+"); assert.strictEqual(G.levelFor(-3).name, "4-5");
});

test("a bar's marker runs 0 -> 1 -> 0, and the green part is inside the bar", function () {
  near(G.barAt(0, 2), 0, 1e-9); near(G.barAt(0.25, 2), 0.5, 1e-9); near(G.barAt(0.5, 2), 1, 1e-9);
  near(G.barAt(0.75, 2), 0.5, 1e-9); near(G.barAt(1, 2), 0, 1e-9); near(G.barAt(1.25, 2), 0.5, 1e-9);
  for (var t = 0; t < 9; t += 0.137) { var x = G.barAt(t, 1.3); assert.ok(x >= 0 && x <= 1); }
  for (var age = 0; age < 7; age++) {
    var lv = G.levelFor(age);
    ["pass", "shoot"].forEach(function (kind) {
      var g = G.greens(lv, kind);
      [g.power, g.lift].forEach(function (z) { assert.ok(z[0] >= 0 && z[1] <= 1 && z[1] > z[0]); });
      near(g.power[1] - g.power[0], lv.green, 1e-9);
    });
    assert.strictEqual(G.greens(lv, "pass").lift[0], 0, "the best pass is flat on the ice");
    assert.ok(G.greens(lv, "shoot").lift[1] < 0.77, "the green part of the height bar never sends a shot over the net");
  }
  assert.ok(G.passSpeed(1) > G.passSpeed(0) && G.shotSpeed(1) > G.shotSpeed(0) && G.shotSpeed(0.5) > G.passSpeed(0.5));
});

// ---------- Starting, the clock, the face-off ----------------------------
test("a new game lines everybody up for a face-off at center, each team on its own side", function () {
  ROLES.forEach(function (you) {
    var s = G.newGame({ you: you, age: 2, minutes: 2 });
    assert.strictEqual(s.phase, "set"); assert.strictEqual(s.clock, 120);
    ROLES.forEach(function (r) { assert.ok(s.us[r].d < 100, "us " + r); assert.ok(s.them[r].d > 100, "them " + r); });
    near(s.us.C.a, 42.5, 1e-9); near(s.them.C.a, 42.5, 1e-9);
    everybodyOnTheIce(s, "start");
  });
});

test("face-off spots near the boards still put everybody on the ice", function () {
  [[20.5, 31], [64.5, 31], [20.5, 80], [64.5, 120], [20.5, 169], [64.5, 169], [42.5, 100]].forEach(function (q) {
    var spots = G.lineUp(pt(q[0], q[1]));
    ROLES.forEach(function (r) { onTheIce(spots.us[r], "us " + r); onTheIce(spots.them[r], "them " + r); });
    assert.ok(spots.us.C.d < q[1] && spots.them.C.d > q[1], "the centers face each other across the dot");
  });
});

test("the face-off: when you are the center, the fastest tap wins; tapping early loses", function () {
  function faceOff(tapAt) {
    var s = G.newGame({ you: "C", age: 3, minutes: 3 }), dice = G.makeDice(11), out = null, drawStep = -1;
    for (var i = 0; i < 600 && !out; i++) {
      if (s.phase === "draw" && drawStep < 0) drawStep = i;
      var press = tapAt === "early" ? s.phase === "drop" : tapAt === "fast" ? s.phase === "draw" : false;
      var ev = G.tick(s, press ? { pass: true } : {}, null, DT, dice);
      ev.forEach(function (e) { if (e.kind === "faceoff") out = e; });
      assert.ok(s.clock === 180, "the clock does not run before the puck is dropped");
    }
    assert.ok(out, "nobody won the face-off");
    assert.strictEqual(s.phase, "play");
    return out;
  }
  assert.strictEqual(faceOff("fast").team, "us");
  assert.strictEqual(faceOff("never").team, "them");
  var early = faceOff("early");
  assert.strictEqual(early.team, "them");
  assert.ok(/before the puck dropped/.test(early.text));
  // When you are not the center, the dice decide.
  var wins = 0;
  for (var g = 0; g < 200; g++) {
    var s = G.newGame({ you: "LW", age: 3 }), dice = G.makeDice(g + 1), won = null;
    for (var i = 0; i < 600 && !won; i++) G.tick(s, {}, null, DT, dice).forEach(function (e) { if (e.kind === "faceoff") won = e.team; });
    if (won === "us") wins++;
  }
  assert.ok(wins > 70 && wins < 130, "about half: " + wins);
});

test("the clock only runs during play, and the game ends when it reaches zero", function () {
  var s = quiet("C");
  s.clock = 1;
  var ev = run(s, 2, {}, G.makeDice(1));
  assert.strictEqual(s.phase, "over"); assert.strictEqual(s.clock, 0);
  assert.deepStrictEqual(kinds(ev), ["end"]);
  assert.ok(/Final score: us 0, them 0/.test(ev[0].text));
  assert.deepStrictEqual(G.tick(s, { pass: true }, null, DT, G.makeDice(1)), [], "nothing happens after the end");
});

// ---------- Skating ---------------------------------------------------------
test("you skate where you steer, no faster than your top speed, and glide to a stop", function () {
  var s = quiet("C"), me = put(s, "us", "C", 60, 50), lv = s.lv;
  run(s, 1.5, { move: { a: 0, d: 1 } });
  near(Math.sqrt(me.va * me.va + me.vd * me.vd), lv.youSpeed, 0.01);
  assert.ok(me.d > 50 + lv.youSpeed && me.d < 50 + lv.youSpeed * 1.5 && Math.abs(me.a - 60) < 1e-6);
  near(me.fd, 1, 1e-9);                           // facing up the ice
  // Steering harder than "all the way" is not faster.
  var s2 = quiet("C"), me2 = put(s2, "us", "C", 60, 50);
  run(s2, 1.5, { move: { a: 3, d: 4 } });
  near(Math.sqrt(me2.va * me2.va + me2.vd * me2.vd), lv.youSpeed, 0.01);
  // Let go: you keep gliding, slower and slower.
  var before = me.d;
  run(s, 0.5, {});
  assert.ok(me.d > before + 3 && me.vd < lv.youSpeed && me.vd > 0);
  run(s, 3, {});
  near(me.vd, 0, 1e-9);
});

test("nobody skates through the boards, not even in the round corners", function () {
  [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [1, 0]].forEach(function (way) {
    var s = quiet("C"), me = put(s, "us", "C", 42, 100);
    s.clock = 600;
    run(s, 14, { move: { a: way[0], d: way[1] } });
    onTheIce(me, "you, steering " + way);
    // In a corner you end up on the round part, not in the square corner.
    if (way[0] && way[1]) {
      var corner = pt(way[0] < 0 ? 28 : 57, way[1] < 0 ? 28 : 172);
      near(P.feetBetween(me, corner), 28 - 2.5, 0.01);
    }
  });
  var p = pt(-4, 250);
  G.keepIn(p, 1);
  assert.ok(p.a >= 0 && p.d <= 200);
});

test("the quick move: faster for a moment, then slower, and only with the puck", function () {
  var s = quiet("C"), me = put(s, "us", "C", 60, 30), lv = s.lv;
  G.gain(s, "us", "C");
  run(s, 1, { move: { a: 0, d: 1 } });
  var normal = me.vd;
  near(normal, lv.youSpeed * 0.92, 0.01);                       // a little slower with the puck
  run(s, 0.5, { move: { a: 0, d: 1 }, burst: true });
  assert.ok(me.vd > normal * 1.3, "the burst");
  run(s, 1.2, { move: { a: 0, d: 1 } });
  assert.ok(me.vd < normal * 0.8, "tired afterwards");
  run(s, 1.5, { move: { a: 0, d: 1 } });
  near(me.vd, normal, 0.01);
  // Without the puck the button does nothing.
  var s2 = quiet("C"), me2 = put(s2, "us", "C", 60, 30);
  run(s2, 1.2, { move: { a: 0, d: 1 }, burst: true });
  near(me2.vd, lv.youSpeed, 0.01);
});

// ---------- Passing and the two bars ----------------------------------------
test("two taps: the first stops the power, the second stops the height and sends the puck", function () {
  var s = quiet("C"), dice = G.makeDice(2);
  put(s, "us", "C", 60, 50); put(s, "us", "RW", 75, 70);
  G.gain(s, "us", "C");
  assert.strictEqual(G.bars(s).stage, 0);
  run(s, 0.4, {}, dice);
  var sweeping = G.bars(s).power;
  assert.ok(sweeping > 0 && sweeping <= 1);
  G.tick(s, { pass: true }, null, DT, dice);                    // tap 1
  var b = G.bars(s);
  assert.strictEqual(b.stage, 1); assert.strictEqual(b.kind, "pass");
  near(b.power, G.barAt(0.4 + 2 * DT, s.lv.barSpeed), 0.02);
  assert.ok(G.youHavePuck(s), "the puck is still yours after one tap");
  run(s, 0.2, {}, dice);
  near(G.bars(s).power, b.power, 1e-12, "the power stays where you stopped it");
  assert.ok(G.bars(s).lift > 0, "now the height marker moves");
  G.tick(s, { pass: true }, null, DT, dice);                    // tap 2
  assert.ok(!s.puck.owner && s.puck.pass && s.puck.pass.team === "us", "the puck is on its way");
  assert.strictEqual(G.bars(s), null);
  assert.strictEqual(s.stats.passes.us, 1);
  // The other button after the first tap starts over.
  var s2 = quiet("C");
  put(s2, "us", "C", 60, 50); G.gain(s2, "us", "C");
  G.tick(s2, { shoot: true }, null, DT, dice);
  assert.strictEqual(G.bars(s2).kind, "shoot");
  G.tick(s2, { pass: true }, null, DT, dice);
  assert.strictEqual(G.bars(s2).stage, 0); assert.ok(G.youHavePuck(s2));
});

test("your pass goes to the teammate you steer toward", function () {
  var s = quiet("C");
  put(s, "us", "C", 45, 60); put(s, "us", "LW", 20, 62); put(s, "us", "RW", 72, 62); put(s, "us", "LD", 44, 35); put(s, "us", "RD", 46, 85);
  G.gain(s, "us", "C");
  assert.strictEqual(G.passTarget(s, { a: -1, d: 0 }), "LW");
  assert.strictEqual(G.passTarget(s, { a: 1, d: 0 }), "RW");
  assert.strictEqual(G.passTarget(s, { a: 0, d: -1 }), "LD");
  assert.strictEqual(G.passTarget(s, { a: 0, d: 1 }), "RD");
  // Not steering: the way you face (up the ice here).
  assert.strictEqual(G.passTarget(s, { a: 0, d: 0 }), "RD");
  s.us.C.fa = 1; s.us.C.fd = 0;
  assert.strictEqual(G.passTarget(s, null), "RW");
});

test("a good flat pass to an open teammate arrives", function () {
  var s = quiet("C"), dice = G.makeDice(4);
  put(s, "us", "C", 45, 50); put(s, "us", "RW", 72, 70);
  G.gain(s, "us", "C");
  var acts = { us: { C: { move: { a: 0, d: 0 }, act: { kind: "pass", to: "RW", power: 0.6, lift: 0 } } } };
  G.tick(s, { auto: true }, acts, DT, dice);
  run(s, 2, { auto: true }, dice, null, function (s) { return !!s.puck.owner; });
  assert.strictEqual(s.puck.owner, "us"); assert.strictEqual(s.puck.carrier, "RW");
});

test("a defender in the lane can pick off a flat pass; a lifted pass flies over the stick", function () {
  function pass(lift, dice) {
    var s = quiet("C");
    put(s, "us", "C", 45, 50); put(s, "us", "RW", 75, 50); put(s, "them", "C", 60, 50.5);
    G.gain(s, "us", "C");
    G.tick(s, { auto: true }, { us: { C: { move: { a: 0, d: 0 }, act: { kind: "pass", to: "RW", power: 0.6, lift: lift } } } }, DT, dice);
    run(s, 2, { auto: true }, dice, null, function (s) { return !!s.puck.owner; });
    return s.puck.owner + " " + s.puck.carrier;
  }
  assert.strictEqual(pass(0, rolls([], 0)), "them C");         // the dice say: picked off
  assert.strictEqual(pass(0.9, rolls([], 0)), "us RW");        // over the stick, even with the same dice
  assert.strictEqual(pass(0, rolls([], 0.95)), "us RW");       // a lucky flat pass gets through
});

// ---------- Offside ----------------------------------------------------------
// Skate the puck up the ice from d = 110 and see if the whistle blows.
function carryIn(s, who) {
  var role = who || s.you, mine = role === s.you;
  var steer = { move: { a: 0, d: 1 } }, intents = mine ? null : { us: {} };
  if (!mine) intents.us[role] = { move: { a: 0, d: 1 }, act: null };
  return run(s, 2.5, mine ? steer : {}, G.makeDice(5), intents, function (s) { return s.phase !== "play" || s.puck.d > 140; });
}
test("offside: no whistle when you carry the puck in and nobody is ahead of it", function () {
  var s = quiet("C");
  put(s, "us", "C", 60, 110); put(s, "us", "RW", 75, 118);       // the wing waits outside the line
  G.gain(s, "us", "C");
  assert.deepStrictEqual(kinds(carryIn(s)), []);
  assert.ok(s.puck.d > 126 && s.phase === "play");
});
test("offside: a teammate is inside their blue line when you carry the puck in", function () {
  var s = quiet("C");
  put(s, "us", "C", 60, 110); put(s, "us", "RW", 75, 135);
  G.gain(s, "us", "C");
  var ev = carryIn(s);
  assert.deepStrictEqual(kinds(ev), ["offside"]);
  assert.strictEqual(ev[0].team, "us"); assert.strictEqual(ev[0].role, "RW"); assert.ok(ev[0].whistle);
  assert.ok(/Our right wing was inside their blue line before the puck/.test(ev[0].text), ev[0].text);
  assert.strictEqual(s.phase, "dead"); assert.strictEqual(s.puck.owner, null);
  assert.deepStrictEqual(s.stop.spot, pt(64.5, 120), "the face-off is just outside the line, on the puck's side");
  assert.strictEqual(s.stats.offside.us, 1);
});
test("offside: YOU are inside when a teammate carries the puck in", function () {
  var s = quiet("RW");
  put(s, "us", "C", 50, 110); put(s, "us", "RW", 75, 140);
  G.gain(s, "us", "C");
  var ev = carryIn(s, "C");
  assert.deepStrictEqual(kinds(ev), ["offside"]);
  assert.strictEqual(ev[0].role, "RW");
  assert.ok(/You were inside their blue line before the puck. Wait at the line/.test(ev[0].text), ev[0].text);
});
test("offside: a pass to a teammate who is already inside", function () {
  var s = quiet("C"), dice = G.makeDice(6);
  put(s, "us", "C", 50, 112); put(s, "us", "RW", 70, 140);
  G.gain(s, "us", "C");
  assert.strictEqual(G.passIsOffside(s, "us", "RW"), true);
  assert.strictEqual(G.passIsOffside(s, "us", "LW"), false);
  G.tick(s, { auto: true }, { us: { C: { move: { a: 0, d: 0 }, act: { kind: "pass", to: "RW", power: 0.6, lift: 0 } } } }, DT, dice);
  var ev = run(s, 2, { auto: true }, dice, null, function (s) { return s.phase !== "play"; });
  assert.deepStrictEqual(kinds(ev), ["offside"]);
  assert.ok(s.puck.d > 126 && s.puck.d < 130, "the whistle blows as the puck crosses the line");
});
test("offside: the other team is called too", function () {
  var s = quiet("C");
  put(s, "them", "C", 30, 90); put(s, "them", "LW", 50, 60);     // their wing is already in our zone
  G.gain(s, "them", "C");
  var ev = run(s, 2.5, {}, G.makeDice(5), { them: { C: { move: { a: 0, d: -1 }, act: null } } }, function (s) { return s.phase !== "play"; });
  assert.deepStrictEqual(kinds(ev), ["offside"]);
  assert.strictEqual(ev[0].team, "them");
  assert.ok(/Their left wing was inside our blue line before the puck/.test(ev[0].text), ev[0].text);
  assert.deepStrictEqual(s.stop.spot, pt(20.5, 80));
});
test("offside: not when the defending team brings the puck into its own zone", function () {
  var s = quiet("C");
  put(s, "us", "RW", 75, 150);                                    // one of ours is in their zone
  put(s, "them", "LD", 40, 118);
  G.gain(s, "them", "LD");
  var ev = run(s, 1.5, {}, G.makeDice(5), { them: { LD: { move: { a: 0, d: 1 }, act: null } } });
  assert.deepStrictEqual(kinds(ev), []);
  assert.ok(s.puck.d > 126 && s.phase === "play");
});
test("offside: the puck comes out and goes back in while a teammate is still inside", function () {
  var s = quiet("C");
  put(s, "us", "C", 60, 135); put(s, "us", "RW", 75, 150);
  G.gain(s, "us", "C");
  var ev = run(s, 1.2, { move: { a: 0, d: -1 } }, G.makeDice(5));   // out over the blue line
  assert.deepStrictEqual(kinds(ev), []); assert.ok(s.puck.d < 124);
  ev = run(s, 2, { move: { a: 0, d: 1 } }, G.makeDice(5), null, function (s) { return s.phase !== "play"; });
  assert.deepStrictEqual(kinds(ev), ["offside"]);
});

// ---------- Icing ----------------------------------------------------------------
// Our defender sends the puck up the right boards from depth "from".
function clearIt(s, from, to, dice) {
  put(s, "us", "RD", 70, from);
  G.gain(s, "us", "RD");
  G.tick(s, {}, { us: { RD: { move: { a: 0, d: 0 }, act: { kind: "send", to: to || pt(74, 197), speed: 95, lift: 0 } } } }, DT, dice || G.makeDice(8));
  return run(s, 6, {}, dice || G.makeDice(8), null, function (s) { return s.phase !== "play" || !!s.puck.owner; });
}
test("icing: from our own half, over their goal line, and nobody touches it", function () {
  var s = quiet("C"), ev = clearIt(s, 60);
  assert.deepStrictEqual(kinds(ev), ["icing"]);
  assert.strictEqual(ev[0].team, "us"); assert.ok(ev[0].whistle);
  assert.ok(/Icing. We sent the puck from our own half/.test(ev[0].text), ev[0].text);
  assert.deepStrictEqual(s.stop.spot, pt(64.5, 31), "the face-off comes back to our end");
  assert.strictEqual(s.stats.icing.us, 1);
});
test("icing: not from past the center line", function () {
  var s = quiet("C");
  assert.deepStrictEqual(kinds(clearIt(s, 104)), []);
  assert.strictEqual(s.phase, "play");
});
test("icing: not when the other team gets to the puck first", function () {
  var s = quiet("C");
  put(s, "them", "LD", 72, 150);
  var ev = clearIt(s, 60, null, rolls([], 0));
  assert.deepStrictEqual(kinds(ev), []);
  assert.strictEqual(s.puck.owner, "them");
});
test("icing: not when it goes in the net (that is a goal), and the other team can ice it too", function () {
  var s = quiet("C");
  var ev = clearIt(s, 60, pt(42.5, 195), rolls([], 0.999));       // straight at the net; the goalie misses it
  assert.deepStrictEqual(kinds(ev), ["goal"]);
  assert.strictEqual(s.score.us, 1);
  var s2 = quiet("C");
  put(s2, "them", "RD", 70, 140);                                   // (their own half is the top half)
  G.gain(s2, "them", "RD");
  // "to" is given the way THEY see the rink: far up the ice, by their left boards = our right corner.
  G.tick(s2, {}, { them: { RD: { move: { a: 0, d: 0 }, act: { kind: "send", to: pt(11, 197), speed: 95, lift: 0 } } } }, DT, G.makeDice(8));
  var ev2 = run(s2, 6, {}, G.makeDice(8), null, function (s) { return s.phase !== "play"; });
  assert.deepStrictEqual(kinds(ev2), ["icing"]);
  assert.strictEqual(ev2[0].team, "them");
  assert.ok(s2.stop.spot.d === 169, "the face-off goes to their end");
});

// ---------- Shots, saves and goals -----------------------------------------------------
// You shoot from the slot. The first two rolls aim the shot; the next
// ones are the goalie's.
function shootFromSlot(diceList, rest, lift) {
  var s = quiet("C"), dice = rolls(diceList, rest);
  put(s, "us", "C", 42.5, 160);
  G.gain(s, "us", "C");
  for (var i = 0; i < 30; i++) G.tick(s, {}, null, DT, dice);    // let the goalie get set
  var first = G.tick(s, { auto: true }, { us: { C: { move: { a: 0, d: 0 }, act: { kind: "shoot", power: 0.7, lift: lift === undefined ? 0.5 : lift, side: 1 } } } }, DT, dice);
  var ev = run(s, 3, { auto: true }, dice, null, function (s, ev) { return ev.length > 0; });
  return { s: s, ev: ev, first: first };
}
test("a shot the goalie stops and covers: whistle, and a face-off in that end", function () {
  var r = shootFromSlot([0.5, 0.5, 0, 0]);
  assert.deepStrictEqual(kinds(r.ev), ["cover"]);
  assert.ok(r.ev[0].whistle); assert.strictEqual(r.ev[0].team, "them");
  assert.ok(/Save! Their goalie covers the puck/.test(r.ev[0].text), r.ev[0].text);
  assert.strictEqual(r.s.phase, "dead"); assert.strictEqual(r.s.stop.spot.d, 169);
  assert.strictEqual(r.s.stats.saves.them, 1); assert.strictEqual(r.s.stats.shots.us, 1);
  assert.strictEqual(r.s.score.us, 0);
});
test("a save with a rebound: no whistle, play goes on", function () {
  var r = shootFromSlot([0.5, 0.5, 0, 0.99]);
  assert.deepStrictEqual(kinds(r.ev), ["save"]);
  assert.ok(!r.ev[0].whistle);
  assert.strictEqual(r.s.phase, "play");
  assert.ok(r.s.puck.vd < 0, "the puck bounces back out, away from the net");
  assert.strictEqual(r.s.stats.saves.them, 1);
});
test("a shot the goalie misses is a goal: whistle, and a face-off at center", function () {
  var r = shootFromSlot([0.5, 0.5, 0.999]);
  assert.deepStrictEqual(kinds(r.ev), ["goal"]);
  assert.ok(r.ev[0].whistle); assert.strictEqual(r.ev[0].team, "us");
  assert.strictEqual(r.ev[0].text, "Goal! You score!");
  assert.strictEqual(r.s.score.us, 1); assert.strictEqual(r.s.score.them, 0);
  assert.deepStrictEqual(r.s.stop.spot, pt(42.5, 100));
});
test("a shot that is lifted too much sails over the net: no goal", function () {
  var r = shootFromSlot([0.5, 0.5], 0.999, 0.98);
  assert.strictEqual(r.s.score.us, 0);
  assert.ok(kinds(r.ev).indexOf("goal") < 0);
});
test("skating the puck into the goalie: the goalie takes it", function () {
  var s = quiet("C");
  put(s, "us", "C", 42.5, 170); G.gain(s, "us", "C");
  var ev = run(s, 3, { move: { a: 0, d: 1 } }, G.makeDice(1), null, function (s) { return s.phase !== "play"; });
  assert.deepStrictEqual(kinds(ev), ["cover"]);
  assert.strictEqual(s.score.us, 0);
});
test("the goalies stay in front of their nets and follow the puck from side to side", function () {
  var s = quiet("C");
  put(s, "us", "C", 10, 150); G.gain(s, "us", "C");
  run(s, 1, {}, G.makeDice(1));
  var g = s.goalie.them;
  assert.ok(g.a < 42.5 && g.d < 189 && g.d > 183, JSON.stringify(g));
  put(s, "us", "C", 75, 150); G.gain(s, "us", "C");
  run(s, 1.5, {}, G.makeDice(1));
  assert.ok(s.goalie.them.a > 42.5);
  assert.ok(s.goalie.us.d > 11 && s.goalie.us.d < 17 && Math.abs(s.goalie.us.a - 42.5) < 3);
});
test("over many shots: the slot beats the corner, and a better goalie stops more", function () {
  function goals(age, a, d, shots) {
    var n = 0, dice = G.makeDice(77);
    for (var i = 0; i < shots; i++) {
      var s = quiet("C", age);
      put(s, "us", "C", a, d); G.gain(s, "us", "C");
      for (var k = 0; k < 20; k++) G.tick(s, {}, null, DT, dice);
      G.tick(s, { auto: true }, { us: { C: { move: { a: 0, d: 0 }, act: { kind: "shoot", power: 0.65, lift: 0.5, side: 0 } } } }, DT, dice);
      run(s, 2.5, { auto: true }, dice, null, function (s) { return s.phase !== "play"; });
      n += s.score.us;
    }
    return n / shots;
  }
  var slot = goals(3, 42.5, 165, 300), point = goals(3, 20, 130, 300), young = goals(0, 42.5, 165, 300), old = goals(6, 42.5, 165, 300);
  assert.ok(slot > point * 1.5, "slot " + slot + " point " + point);
  assert.ok(young > old, "their goalie is easier for the youngest: " + young + " " + old);
  assert.ok(slot > 0.08 && slot < 0.6, "never a sure thing, never hopeless: " + slot);
});

// ---------- Take: taking the puck away ---------------------------------------------------------
// Their center has the puck at (50, 60), skating down the ice. You stand
// "dist" feet in front of them and press Take.
function take(dist, roll, input) {
  var s = quiet("C");
  put(s, "them", "C", 50, 60); G.gain(s, "them", "C");
  var me = put(s, "us", "C", 50, 60 - dist);
  var ev = G.tick(s, input || { take: true }, null, DT, rolls([roll, 0]));
  return { ev: ev, s: s, me: me };
}
test("take: from close it wins the puck, and the game says who took it from whom", function () {
  var won = take(4, 0);
  assert.deepStrictEqual(kinds(won.ev), ["steal"]);
  assert.strictEqual(won.s.puck.owner, "us"); assert.strictEqual(won.s.puck.carrier, "C");
  assert.strictEqual(won.s.stats.steals.us, 1);
  var e = won.ev[0];
  assert.strictEqual(e.team, "us"); assert.strictEqual(e.role, "C"); assert.strictEqual(e.from, "C");
  assert.strictEqual(e.text, "You take the puck away.");
});
test("take: from too far away nothing is taken, and the game notes \"far\"", function () {
  [5.5, 8, 12, 60, 150].forEach(function (dist) {
    var far = take(Math.min(dist, 55), 0);            // (the best dice there are)
    if (dist > 55) put(far.s, "us", "C", 50, 190);     // the other end of the rink
    assert.strictEqual(far.s.puck.owner, "them", "taken from " + dist + " ft away");
    assert.deepStrictEqual(kinds(far.ev), []);
    var n = notes(far.ev, "take");
    assert.strictEqual(n.length, 1); assert.strictEqual(n[0].result, "far");
    assert.ok(n[0].feet > G.TAKE_REACH);
  });
  assert.strictEqual(G.TAKE_REACH, 5);
  // Close enough is close enough, right up to the edge of the reach.
  assert.strictEqual(take(4.9, 0).s.puck.owner, "us");
});
test("take: a miss leaves you slow for a moment, and you cannot hammer the key", function () {
  var missed = take(4, 0.99);
  assert.deepStrictEqual(kinds(missed.ev), []);
  assert.strictEqual(notes(missed.ev, "take")[0].result, "miss");
  assert.strictEqual(missed.s.puck.owner, "them");
  assert.ok(missed.me.slow > 0, "a miss costs you a moment");
  // Right away again: nothing at all happens (there is a short wait).
  var again = G.tick(missed.s, { take: true }, null, DT, rolls([0, 0]));
  assert.deepStrictEqual(again, []);
  assert.strictEqual(missed.s.puck.owner, "them");
});
test("take: only the Take button takes. Pass, Shoot, Call and the quick move do not", function () {
  [{ pass: true }, { shoot: true }, { call: true }, { burst: true }, {}].forEach(function (input) {
    var r = take(3, 0, input);
    assert.strictEqual(r.s.puck.owner, "them", JSON.stringify(input));
    assert.deepStrictEqual(r.ev, []);
  });
  // And Take does nothing when nobody on the other team has the puck.
  var s = quiet("C");
  put(s, "us", "RW", 50, 60); G.gain(s, "us", "RW"); put(s, "us", "C", 50, 57);
  assert.deepStrictEqual(G.tick(s, { take: true }, null, DT, rolls([0, 0])), []);
  assert.strictEqual(s.puck.carrier, "RW");
});
test("take: \"can I take it?\" is yes only within reach of the puck carrier", function () {
  assert.strictEqual(G.canTake(take(4, 0.99, {}).s), true);
  assert.strictEqual(G.canTake(take(9, 0.99, {}).s), false);
  var s = quiet("C");
  put(s, "us", "RW", 50, 60); G.gain(s, "us", "RW"); put(s, "us", "C", 50, 57);
  assert.strictEqual(G.canTake(s), false, "not from a teammate");
});
test("over many takes: from the front beats from behind, and the quick move protects the puck", function () {
  function rate(behind, burst, dist) {
    var wins = 0, dice = G.makeDice(31);
    for (var i = 0; i < 800; i++) {
      var s = quiet("C");
      var c = put(s, "them", "C", 50, 60); G.gain(s, "them", "C");
      if (burst) c.burst = 0.5;
      put(s, "us", "C", 50, behind ? 60 + dist : 60 - dist);
      G.tick(s, { take: true }, null, DT, dice);
      if (s.stats.steals.us) wins++;
    }
    return wins / 800;
  }
  var front = rate(false, false, 3.7), back = rate(true, false, 3.7), deke = rate(false, true, 3.7), edge = rate(true, false, 4.9);
  assert.ok(front > back + 0.15, front + " " + back);
  assert.ok(deke < front * 0.5, deke + " " + front);
  assert.ok(front > 0.65 && front < 0.92, "usually, not always: " + front);
  assert.ok(edge > 0.35 && edge < 0.55, "from behind at arm's length it is about a coin flip: " + edge);
});
test("the computer players take the same way, and the older the age group the better they are at it", function () {
  function theirs(age) {
    var wins = 0, dice = G.makeDice(8);
    for (var i = 0; i < 600; i++) {
      var s = quiet("LW", age);
      put(s, "us", "C", 50, 60); G.gain(s, "us", "C");
      put(s, "them", "C", 50, 64);
      G.tick(s, {}, { them: { C: { move: { a: 0, d: 0 }, act: { kind: "check" } } } }, DT, dice);
      wins += s.stats.steals.them;
    }
    return wins / 600;
  }
  var young = theirs(0), old = theirs(6);
  assert.ok(old > young * 2 && young > 0.02 && old < 0.9, young + " " + old);
});

// ---------- The referee ------------------------------------------------------------------------
test("while the play goes on the referee is on the ice, by the boards, away from the puck", function () {
  var last = pt(6, 100);
  for (var a = 3; a <= 82; a += 4) {
    for (var d = 3; d <= 197; d += 6) {
      var r = G.refSpot(pt(a, d), last, null);
      onTheIce(r, "referee");
      assert.ok(r.a === 6 || r.a === 79, "by the boards");
      assert.ok(Math.abs(r.a - a) >= 14, "the referee is in the play at " + a + "," + d);
      assert.ok(Math.abs(r.d - d) <= 11, "the referee is too far up or down the ice from the puck");
      last = r;
    }
  }
});
test("after a whistle the referee goes where a referee belongs", function () {
  var dot = pt(64.5, 120), by = pt(6, 100);
  // Offside: on that blue line.
  assert.strictEqual(G.refSpot(pt(60, 128), by, { phase: "dead", reason: "offside", spot: dot }).d, 125.5);
  assert.strictEqual(G.refSpot(pt(60, 72), by, { phase: "dead", reason: "offside", spot: pt(64.5, 80) }).d, 74.5);
  // A goal or a covered puck: beside that net, at the goal line.
  ["goal", "cover"].forEach(function (why) {
    var up = G.refSpot(pt(42.5, 189), by, { phase: "dead", reason: why, spot: dot });
    assert.ok(up.d > 185 && up.d < 189 && Math.abs(up.a - 42.5) > 8 && Math.abs(up.a - 42.5) < 22, why + " " + JSON.stringify(up));
    var down = G.refSpot(pt(42.5, 11), by, { phase: "dead", reason: why, spot: dot });
    assert.ok(down.d > 11 && down.d < 15);
  });
  // Icing: the face-off is at the far other end, so the referee sets off for that dot at once.
  var icing = G.refSpot(pt(70, 192), by, { phase: "dead", reason: "icing", spot: pt(64.5, 31) });
  assert.ok(P.feetBetween(icing, pt(64.5, 31)) <= 5, JSON.stringify(icing));
});
test("at a face-off the referee stands right at the dot, a step beside the centers", function () {
  [[20.5, 31], [64.5, 31], [20.5, 80], [64.5, 80], [20.5, 120], [64.5, 120], [20.5, 169], [64.5, 169], [42.5, 100]].forEach(function (q) {
    var dot = pt(q[0], q[1]), spots = G.lineUp(dot);
    ["set", "drop", "draw"].forEach(function (phase) {
      // Wherever the puck and the referee were before.
      [pt(6, 20), pt(79, 180)].forEach(function (last) {
        var r = G.refSpot(pt(42.5, 100), last, { phase: phase, reason: "offside", spot: dot });
        onTheIce(r, "referee");
        assert.ok(P.feetBetween(r, dot) <= 5, "the referee is " + P.feetBetween(r, dot).toFixed(1) + " ft from the dot " + q);
        assert.ok(P.feetBetween(r, spots.us.C) > 3.6 && P.feetBetween(r, spots.them.C) > 3.6, "the referee stands on a center at " + q);
        ROLES.forEach(function (role) { assert.ok(P.feetBetween(r, spots.us[role]) > 3 && P.feetBetween(r, spots.them[role]) > 3); });
      });
    });
  });
});
test("in a game the referee is at the dot when the puck drops, also after a whistle far away", function () {
  // The very first face-off.
  var s = G.newGame({ you: "LW", age: 3 }), dice = G.makeDice(4), dropped = false;
  for (var i = 0; i < 600 && !dropped; i++) {
    var before = { phase: s.phase, ref: pt(s.ref.a, s.ref.d), dot: s.stop && s.stop.spot };
    dropped = notes(G.tick(s, {}, null, DT, dice), "faceoff").length > 0;
    if (dropped) assert.ok(P.feetBetween(before.ref, before.dot) <= 5, "at the first drop the referee is " + P.feetBetween(before.ref, before.dot).toFixed(1) + " ft away");
  }
  assert.ok(dropped);
  // Icing at one end: the face-off is at the far other end, 150 feet away.
  var s2 = quiet("LW");
  clearIt(s2, 60);
  assert.strictEqual(s2.phase, "dead");
  var at = null, far = 0;
  for (i = 0; i < 900 && !at; i++) {
    var was = { ref: pt(s2.ref.a, s2.ref.d), dot: s2.stop && s2.stop.spot, phase: s2.phase };
    if (was.phase === "dead") far = Math.max(far, P.feetBetween(was.ref, was.dot));
    if (notes(G.tick(s2, {}, null, DT, G.makeDice(2)), "faceoff").length) at = was;
    // The referee is already there when the players have lined up, well before the drop.
    if (was.phase === "set" && s2.phase === "drop") assert.ok(P.feetBetween(s2.ref, was.dot) <= 5, "the players were lined up before the referee came: " + P.feetBetween(s2.ref, was.dot).toFixed(1) + " ft");
  }
  assert.ok(far > 100, "this face-off really was far away: " + far.toFixed(0));
  assert.ok(P.feetBetween(at.ref, at.dot) <= 5, "the referee did not get there in time: " + P.feetBetween(at.ref, at.dot).toFixed(1) + " ft");
  // After the drop the referee backs away to the boards again.
  for (i = 0; i < 180; i++) G.tick(s2, {}, null, DT, G.makeDice(2));
  assert.ok(s2.phase !== "play" || s2.ref.a < 10 || s2.ref.a > 75, "the referee stayed in the middle: " + JSON.stringify(s2.ref));
});

// ---------- The quiet notes for the coach's report ---------------------------------------------
test("a pass is noted when it leaves, and again when somebody gets it", function () {
  var s = quiet("C"), dice = G.makeDice(4);
  put(s, "us", "C", 45, 50); put(s, "us", "RW", 72, 70);
  G.gain(s, "us", "C");
  var first = G.tick(s, { auto: true }, { us: { C: { move: { a: 0, d: 0 }, act: { kind: "pass", to: "RW", power: 0.6, lift: 0 } } } }, DT, dice);
  var sent = notes(first, "pass");
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].role, "C"); assert.strictEqual(sent[0].to, "RW"); assert.strictEqual(sent[0].offside, false);
  assert.strictEqual(sent[0].power, 0.6);
  var got = notes(run(s, 2, { auto: true }, dice, null, function (s) { return !!s.puck.owner; }), "catch");
  assert.strictEqual(got.length, 1);
  assert.deepStrictEqual(got[0].sent, { team: "us", role: "C" });
  assert.strictEqual(got[0].team, "us"); assert.strictEqual(got[0].role, "RW"); assert.strictEqual(got[0].meant, true);
  assert.strictEqual(got[0].shot, false);
  // A pass to a teammate who is already inside their blue line is noted as offside the moment it leaves.
  var s2 = quiet("C");
  put(s2, "us", "C", 50, 112); put(s2, "us", "RW", 70, 140); G.gain(s2, "us", "C");
  var risky = notes(G.tick(s2, { auto: true }, { us: { C: { move: { a: 0, d: 0 }, act: { kind: "pass", to: "RW", power: 0.6, lift: 0 } } } }, DT, dice), "pass");
  assert.strictEqual(risky[0].offside, true);
});
test("a pass that is picked off is noted with who sent it and who got it", function () {
  var s = quiet("C"), dice = rolls([], 0);
  put(s, "us", "C", 45, 50); put(s, "us", "RW", 75, 50); put(s, "them", "C", 60, 50.5);
  G.gain(s, "us", "C");
  G.tick(s, { auto: true }, { us: { C: { move: { a: 0, d: 0 }, act: { kind: "pass", to: "RW", power: 0.6, lift: 0 } } } }, DT, dice);
  var got = notes(run(s, 2, { auto: true }, dice, null, function (s) { return !!s.puck.owner; }), "catch");
  assert.strictEqual(got[0].team, "them"); assert.strictEqual(got[0].meant, false);
  assert.deepStrictEqual(got[0].sent, { team: "us", role: "C" });
});
test("a shot is noted with where it was from and how good that spot is; its end says who shot", function () {
  var slot = shootFromSlot([0.5, 0.5, 0.999]);
  var shot = notes(slot.first, "shot")[0];
  assert.strictEqual(shot.team, "us"); assert.strictEqual(shot.role, "C"); assert.strictEqual(shot.power, 0.7); assert.strictEqual(shot.lift, 0.5);
  near(shot.feet, 26.6, 0.1);     // (the puck sits on the stick, 2.4 feet ahead of the skater at 160)
  assert.ok(shot.chance > 0.1, "the slot is a good spot: " + shot.chance);
  assert.deepStrictEqual(slot.ev[0].by, { team: "us", role: "C" }, "the goal says who scored");
  assert.deepStrictEqual(shootFromSlot([0.5, 0.5, 0, 0]).ev[0].by, { team: "us", role: "C" }, "a covered shot says who shot");
  assert.deepStrictEqual(shootFromSlot([0.5, 0.5, 0, 0.99]).ev[0].by, { team: "us", role: "C" }, "a rebound too");
  // From the corner the same shot is a poor chance.
  var s = quiet("C");
  put(s, "us", "C", 8, 186); G.gain(s, "us", "C");
  var poor = notes(G.tick(s, { auto: true }, { us: { C: { move: { a: 0, d: 0 }, act: { kind: "shoot", power: 0.7, lift: 0.5, side: 0 } } } }, DT, rolls([])), "shot")[0];
  assert.ok(poor.chance < shot.chance / 3, poor.chance + " " + shot.chance);
});
test("a shot over the net, or beside it, is noted as a miss", function () {
  var over = shootFromSlot([0.5, 0.5], 0.999, 0.98);
  var w = notes(over.ev, "wide");
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].over, true); assert.strictEqual(w[0].role, "C");
  // Aimed far to the side: the first roll of the dice pushes the shot wide.
  var wide = shootFromSlot([0.999, 0.5], 0.999, 0.3);
  var w2 = notes(wide.ev, "wide");
  if (w2.length) assert.strictEqual(w2[0].over, false);
  assert.strictEqual(wide.s.score.us, 0);
});
test("an offside says who brought the puck in, and a face-off says how YOU did as the center", function () {
  var s = quiet("C");
  put(s, "us", "C", 60, 110); put(s, "us", "RW", 75, 135); G.gain(s, "us", "C");
  var ev = carryIn(s);
  assert.strictEqual(ev[0].role, "RW"); assert.strictEqual(ev[0].by, "C", "you carried it in");
  // The face-off: won, lost, too early.
  function draw(when) {
    var g = G.newGame({ you: "C", age: 3 }), dice = G.makeDice(11), out = null;
    for (var i = 0; i < 600 && !out; i++) {
      var press = when === "early" ? g.phase === "drop" : when === "fast" ? g.phase === "draw" : false;
      out = notes(G.tick(g, press ? { pass: true } : {}, null, DT, dice), "faceoff")[0] || null;
    }
    return out.you;
  }
  assert.strictEqual(draw("fast"), "won"); assert.strictEqual(draw("never"), "lost"); assert.strictEqual(draw("early"), "early");
  var wing = G.newGame({ you: "LW", age: 3 }), d2 = G.makeDice(3), f = null;
  for (var i = 0; i < 600 && !f; i++) f = notes(G.tick(wing, {}, null, DT, d2), "faceoff")[0] || null;
  assert.strictEqual(f.you, null, "a winger does not take the face-off");
});

console.log("All game (gamesim) tests passed!");
