// Run with:  node tests/gamebrain.test.js
// Checks js/gamebrain.js: the computer players of the live hockey game.
// (The last tests play whole games with only computer players.)
var G = require("../js/gamesim.js");
var B = require("../js/gamebrain.js");
var P = require("../js/positions.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
function pt(a, d) { return { a: a, d: d }; }
var ROLES = P.ROLES, DT = 1 / 60;
// Dice that always give the same roll.
function always(x) { return function () { return x; }; }
function put(s, team, role, a, d) {
  var k = s[team][role];
  k.a = a; k.d = d; k.va = 0; k.vd = 0; k.fa = 0; k.fd = team === "us" ? 1 : -1;
  return k;
}
// A game in the middle of play, everybody on their face-off spot at center.
function game(you, age) {
  var s = G.newGame({ you: you || "C", age: age === undefined ? 3 : age, minutes: 3 });
  return G.startPlay(s);
}
// Everybody parked by the left boards, out of the way.
function quiet(you, age) {
  var s = game(you, age);
  ROLES.forEach(function (r, i) { put(s, "us", r, 4 + 4 * i, 88); put(s, "them", r, 4 + 4 * i, 112); });
  return s;
}
// The face-off dots: the only places a face-off may be.
var DOTS = [];
[20.5, 64.5].forEach(function (a) { [31, 80, 120, 169].forEach(function (d) { DOTS.push(a + "," + d); }); });
DOTS.push("42.5,100");

// ---------- Small pieces ------------------------------------------------
test("a skater with the puck heads up the ice, and toward the net once inside their zone", function () {
  var mid = B.carryTarget(pt(20, 90));
  assert.ok(mid.d > 110 && mid.a > 20, "up the ice and a little to the middle");
  var deep = B.carryTarget(pt(15, 160));
  assert.ok(deep.d > 160 && deep.a > 15 && deep.d < 189);
  for (var a = 3; a <= 82; a += 8) {
    for (var d = 5; d <= 195; d += 10) { var t = B.carryTarget(pt(a, d)); assert.ok(t.a >= 2 && t.a <= 83, "off the ice from " + a + "," + d); }
  }
});

test("computer players pass harder when the teammate is farther away", function () {
  assert.ok(B.passPower(60) > B.passPower(20));
  [0, 5, 30, 90, 300].forEach(function (f) { var p = B.passPower(f); assert.ok(p >= 0 && p <= 1); });
  assert.strictEqual(B.passPower(200), B.passPower(300), "never harder than the hardest pass");
});

// ---------- What the puck carrier may choose --------------------------------
function kindsOf(list) { return list.map(function (o) { return o.kind + (o.to ? "-" + o.to : ""); }); }
function choicesAt(a, d, more, dice) {
  var s = quiet("LD");
  put(s, "us", "C", a, d);
  if (more) more(s);
  G.gain(s, "us", "C");
  var mine = {}, theirs = {};
  ROLES.forEach(function (r) { mine[r] = s.us[r]; theirs[r] = s.them[r]; });
  return B.choices(s, "us", "C", mine, theirs, s.puck, dice || always(0.99));
}
test("the carrier can always pass or skate; shooting, dumping and clearing depend on where the puck is", function () {
  var ownEnd = kindsOf(choicesAt(60, 40));
  assert.ok(ownEnd.indexOf("carry") >= 0 && ownEnd.indexOf("pass-LW") >= 0);
  assert.ok(ownEnd.indexOf("shoot") < 0 && ownEnd.indexOf("dump") < 0);
  assert.ok(ownEnd.indexOf("clear") < 0, "nobody clears the puck with no pressure");
  var pressed = kindsOf(choicesAt(60, 40, function (s) { put(s, "them", "LW", 62, 45); }));
  assert.ok(pressed.indexOf("clear") >= 0, "under pressure in your own end a clear (maybe icing) can happen");
  var neutral = kindsOf(choicesAt(60, 110));
  assert.ok(neutral.indexOf("dump") >= 0 && neutral.indexOf("shoot") < 0);
  assert.ok(kindsOf(choicesAt(60, 95)).indexOf("dump") < 0, "no dump from our own half: that would be icing");
  var zone = kindsOf(choicesAt(50, 160));
  assert.ok(zone.indexOf("shoot") >= 0 && zone.indexOf("dump") < 0);
});
test("a careful player does not pass to a teammate who is offside; a careless one may", function () {
  function withWingInside(s) { put(s, "us", "RW", 75, 140); }
  var careful = kindsOf(choicesAt(60, 110, withWingInside, always(0.99)));
  assert.ok(careful.indexOf("pass-RW") < 0 && careful.indexOf("pass-LW") >= 0);
  var careless = kindsOf(choicesAt(60, 110, withWingInside, always(0)));
  assert.ok(careless.indexOf("pass-RW") >= 0);
  // Once the puck is inside, that pass is fine again.
  assert.ok(kindsOf(choicesAt(60, 132, withWingInside, always(0.99))).indexOf("pass-RW") >= 0);
});
test("teammates look for you much more when you call for the puck", function () {
  function weightToYou(called) {
    var s = quiet("RW");
    put(s, "us", "C", 40, 60); put(s, "us", "RW", 70, 70);
    G.gain(s, "us", "C");
    s.called = called ? 1 : 0;
    var mine = {}, theirs = {};
    ROLES.forEach(function (r) { mine[r] = s.us[r]; theirs[r] = s.them[r]; });
    return B.choices(s, "us", "C", mine, theirs, s.puck, always(0.99)).filter(function (o) { return o.to === "RW"; })[0].weight;
  }
  assert.ok(weightToYou(true) > weightToYou(false) * 5);
});

// ---------- How they play ---------------------------------------------------
test("the computer never moves YOUR skater (unless the game is told to play for you)", function () {
  var s = game("LW"), dice = G.makeDice(3), at = pt(s.us.LW.a, s.us.LW.d);
  G.gain(s, "us", "C");
  var wants = B.decide(s, dice, DT);
  assert.ok(wants.us.LW && wants.them.LW, "the brain has a wish for everybody");
  for (var i = 0; i < 60; i++) B.play(s, {}, DT, dice);
  // (Other skaters may bump you a little, but you are not skating.)
  assert.ok(P.feetBetween(s.us.LW, at) < 4, "you were moved " + P.feetBetween(s.us.LW, at).toFixed(1) + " ft");
  for (i = 0; i < 150; i++) B.play(s, { auto: true }, DT, dice);
  assert.ok(P.feetBetween(s.us.LW, at) > 8, "with auto on, your skater plays too");
});

test("on a rush the forwards wait at the blue line until the puck is in (when nobody makes a mistake)", function () {
  for (var seed = 1; seed <= 8; seed++) {
    var s = game("LD"), dice = G.makeDice(seed), inside = 0;
    s.lv.early = 0; s.lv.icing = 0; s.lv.themSpeed = 0;
    ROLES.forEach(function (r) { put(s, "them", r, 4 + 4 * ROLES.indexOf(r), 190); });   // nobody in the way, and they stay there
    put(s, "us", "C", 42, 80);
    G.gain(s, "us", "C");
    var crossed = false;
    for (var i = 0; i < 900 && s.phase === "play" && !crossed; i++) {
      B.play(s, { auto: true }, DT, dice);                          // (the computer plays every skater here)
      if (s.puck.d > G.ZONE) crossed = true;
      ["LW", "C", "RW"].forEach(function (r) {
        if (!(s.puck.owner === "us" && s.puck.carrier === r) && s.us[r].d > G.INSIDE && s.puck.d <= G.ZONE) inside++;
      });
    }
    assert.ok(crossed, "the rush never got to their blue line (seed " + seed + ")");
    assert.strictEqual(inside, 0, "a forward was inside their blue line before the puck (seed " + seed + ")");
    assert.strictEqual(s.stats.offside.us, 0);
  }
});
test("a forward who makes the mistake drifts in early, and then it is offside", function () {
  var whistles = 0, drifted = 0;
  for (var seed = 1; seed <= 8; seed++) {
    var s = game("LD"), dice = G.makeDice(seed);
    s.lv.early = 5; s.lv.themSpeed = 0;                             // everybody makes the mistake
    ROLES.forEach(function (r) { put(s, "them", r, 4 + 4 * ROLES.indexOf(r), 190); });
    put(s, "us", "C", 42, 80);
    G.gain(s, "us", "C");
    for (var i = 0; i < 900 && s.phase === "play"; i++) {
      B.play(s, { auto: true }, DT, dice);
      if (s.puck.d <= G.ZONE && ["LW", "RW"].some(function (r) { return s.us[r].d > G.INSIDE; })) drifted++;
    }
    whistles += s.stats.offside.us;
  }
  assert.ok(drifted > 0, "nobody drifted in early");
  assert.ok(whistles >= 4, "offside was called only " + whistles + " times in 8 rushes");
});

test("call for a pass: your teammate passes to you right away", function () {
  var s = quiet("RW"), dice = G.makeDice(5);
  put(s, "us", "C", 40, 60); put(s, "us", "RW", 70, 72);
  G.gain(s, "us", "C");
  s.brain.us.think = 5;                                            // the center was not going to decide for a while
  B.play(s, { call: true }, DT, dice);
  for (var i = 0; i < 12 && s.puck.owner; i++) B.play(s, {}, DT, dice);
  assert.ok(s.puck.pass && s.puck.pass.team === "us" && s.puck.pass.to === "RW", "no pass to you: " + JSON.stringify(s.puck.pass));
  for (i = 0; i < 120 && !s.puck.owner; i++) B.play(s, {}, DT, dice);
  assert.ok(G.youHavePuck(s), "the pass did not reach you");
});

test("the nearest computer player goes and gets a loose puck", function () {
  var s = quiet("C"), dice = G.makeDice(2);
  s.puck.a = 60; s.puck.d = 60;
  put(s, "us", "RD", 60, 40); put(s, "them", "LW", 60, 100);
  for (var i = 0; i < 300 && !s.puck.owner; i++) B.play(s, {}, DT, dice);
  assert.strictEqual(s.puck.owner, "us"); assert.strictEqual(s.puck.carrier, "RD");
});

test("a defender goes at the puck carrier and tries a stick check", function () {
  var steals = 0;
  for (var seed = 1; seed <= 20; seed++) {
    var s = quiet("LW", 6), dice = G.makeDice(seed);
    s.clock = 600;
    put(s, "us", "C", 60, 50); G.gain(s, "us", "C");
    s.brain.us.think = 99; s.brain.us.plan = { to: pt(60, 50) };   // our center just stands there with it
    put(s, "them", "C", 60, 75);
    for (var i = 0; i < 480 && s.puck.owner === "us"; i++) B.play(s, {}, DT, dice);
    steals += s.stats.steals.them;
  }
  assert.ok(steals >= 12, "their checks won the puck only " + steals + " times in 20 tries");
});

// ---------- Whole games ---------------------------------------------------------
test("the same seed gives exactly the same game; another seed gives another game", function () {
  function after(seed) {
    var s = G.newGame({ you: "RW", age: 4, minutes: 3 }), dice = G.makeDice(seed);
    for (var i = 0; i < 60 * 40; i++) B.play(s, { auto: true }, DT, dice);
    return JSON.stringify(s);
  }
  assert.strictEqual(after(21), after(21));
  assert.notStrictEqual(after(21), after(22));
});

test("whole games with only computer players, at every age: nothing breaks and every whistle is legal", function () {
  var seen = { goal: 0, cover: 0, save: 0, offside: 0, icing: 0, faceoff: 0, steal: 0, end: 0 };
  var byAge = [];
  G.AGE_NAMES.forEach(function (name, age) {
    var goals = { us: 0, them: 0 };
    for (var g = 0; g < 4; g++) {
      var s = G.newGame({ you: ROLES[(age + g) % 5], age: age, minutes: 2 }), dice = G.makeDice(100 * age + g + 1);
      var count = { us: 0, them: 0 }, steps = 0, lastClock = s.clock;
      while (s.phase !== "over") {
        var playing = s.phase === "play";
        var ev = B.play(s, { auto: true }, DT, dice);
        assert.ok(++steps < 60 * 60 * 20, name + ": the game never ended");
        assert.ok(s.clock <= lastClock, "the clock went backwards");
        if (!playing) assert.strictEqual(lastClock, s.clock, "the clock ran while play was stopped");
        lastClock = s.clock;
        ev.forEach(function (e) {
          assert.ok(e.kind in seen, "a new kind of event: " + e.kind);
          assert.ok(e.text.length > 5 && e.spot);
          seen[e.kind]++;
          if (e.kind === "goal") count[e.team]++;
          // Only these stop the play. Every stop leads to a face-off on a dot.
          assert.strictEqual(!!e.whistle, ["goal", "cover", "offside", "icing", "end"].indexOf(e.kind) >= 0, e.kind);
          if (e.whistle && e.kind !== "end") {
            assert.strictEqual(s.phase, "dead");
            assert.ok(DOTS.indexOf(s.stop.spot.a + "," + s.stop.spot.d) >= 0, e.kind + ": face-off at " + JSON.stringify(s.stop.spot));
            if (e.kind === "goal") assert.deepStrictEqual(s.stop.spot, pt(42.5, 100));
            if (e.kind === "offside") assert.ok(s.stop.spot.d === 80 || s.stop.spot.d === 120);
            if (e.kind === "icing") assert.strictEqual(s.stop.spot.d, e.team === "us" ? 31 : 169);
            if (e.kind === "cover") assert.strictEqual(s.stop.spot.d, e.team === "us" ? 31 : 169);
          }
        });
        if (steps % 7 === 0) {
          var all = [s.puck, s.ref, s.goalie.us, s.goalie.them];
          ["us", "them"].forEach(function (t) { ROLES.forEach(function (r) { all.push(s[t][r]); }); });
          all.forEach(function (k) { assert.ok(k.a >= 0 && k.a <= 85 && k.d >= 0 && k.d <= 200, name + ": off the rink " + JSON.stringify(k)); });
          assert.ok(s.goalie.us.d < 20 && s.goalie.them.d > 180, "a goalie left the net");
        }
      }
      assert.deepStrictEqual(count, s.score, "the score is the number of goals");
      goals.us += s.score.us; goals.them += s.score.them;
    }
    byAge.push(goals);
  });
  // Everything that can happen in a game happened somewhere in these 28 games.
  Object.keys(seen).forEach(function (k) { assert.ok(seen[k] > 0, "never happened: " + k); });
  assert.strictEqual(seen.end, 28);
  // Easy for the youngest, hard for the oldest.
  assert.ok(byAge[0].us > byAge[0].them, "4-5: " + JSON.stringify(byAge[0]));
  assert.ok(byAge[0].us - byAge[0].them > byAge[6].us - byAge[6].them, "4-5 must be easier than 16+: " + JSON.stringify(byAge));
});

console.log("All computer-player (gamebrain) tests passed!");
