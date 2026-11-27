// Tests for js/gamereport.js (the coach's report after a live game).
// Run with:  node tests/gamereport.test.js
var R = require("../js/gamereport.js");
var G = require("../js/gamesim.js");
var B = require("../js/gamebrain.js");
var P = require("../js/positions.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
var ROLES = P.ROLES, DT = 1 / 60;
function put(s, team, role, a, d) {
  var k = s[team][role];
  k.a = a; k.d = d; k.va = 0; k.vd = 0; k.fa = 0; k.fd = team === "us" ? 1 : -1;
  return k;
}
// A game in the middle of play, everybody parked by the left boards.
function quiet(you, age) {
  var s = G.newGame({ you: you || "RW", age: age === undefined ? 3 : age, minutes: 3 });
  G.startPlay(s);
  ROLES.forEach(function (r, i) { put(s, "us", r, 4 + 4 * i, 88); put(s, "them", r, 4 + 4 * i, 112); });
  return s;
}
function card(report, id) { return report.cards.filter(function (c) { return c.id === id; })[0]; }
// Everything the report says, as one text (to look for broken words).
function allWords(report) {
  return report.well.concat([report.next.title, report.next.tip], report.cards.map(function (c) { return [c.title, c.word, c.line, c.tip].join(" "); })).join(" ");
}
// Notes for a skater, fed with hand-made events.
function notesFrom(you, events) {
  var s = quiet(you), t = R.start(s);
  R.watch(t, s, events, DT);
  return { s: s, t: t, report: R.build(t, s) };
}
var ME = { team: "us", role: "RW" };
function passed(result) {
  var out = [{ kind: "pass", team: "us", role: "RW", to: "C", power: 0.6, lift: 0, offside: result === "offside" }];
  if (result === "caught") out.push({ kind: "catch", team: "us", role: "C", sent: ME, meant: true, shot: false });
  if (result === "picked") out.push({ kind: "catch", team: "them", role: "LD", sent: ME, meant: false, shot: false });
  if (result === "offside") out.push({ kind: "offside", team: "us", role: "C", by: "RW", whistle: true });
  return out;
}
function shot(chance, end, power) {
  var out = [{ kind: "shot", team: "us", role: "RW", power: power === undefined ? 0.7 : power, lift: 0.5, feet: 25, chance: chance }];
  if (end === "goal") out.push({ kind: "goal", team: "us", by: ME });
  if (end === "saved") out.push({ kind: "save", team: "them", by: ME });
  if (end === "over") out.push({ kind: "wide", team: "us", role: "RW", over: true });
  if (end === "wide") out.push({ kind: "wide", team: "us", role: "RW", over: false });
  if (end === "blocked") out.push({ kind: "catch", team: "them", role: "LD", sent: ME, meant: false, shot: true });
  return out;
}

// ---- Passing ----
test("passing: the report counts what became of each pass", function () {
  var r = notesFrom("RW", [].concat(passed("caught"), passed("caught"), passed("picked"), passed("offside"), passed("nobody")));
  var c = card(r.report, "passing");
  assert.ok(c.line.indexOf("You passed 5 times: 2 reached a teammate, 1 was picked off, 1 was offside, 1 went to nobody.") === 0, c.line);
  assert.strictEqual(c.grade, "far");
  assert.ok(/look where your teammate is/.test(c.tip), "an offside pass gets the tip about looking first: " + c.tip);
  assert.strictEqual(r.t.offside.brought, 1, "the offside pass also counts as a whistle on you");
  // All passes arrive: good.
  var good = card(notesFrom("RW", [].concat(passed("caught"), passed("caught"), passed("caught"))).report, "passing");
  assert.strictEqual(good.grade, "good"); assert.strictEqual(good.word, "Good");
  assert.ok(/You passed 3 times: 3 reached a teammate\./.test(good.line), good.line);
  // Somebody else's passes are not yours.
  var other = notesFrom("RW", [{ kind: "pass", team: "us", role: "C", to: "LW", power: 0.5, lift: 0, offside: false },
                               { kind: "pass", team: "them", role: "RW", to: "C", power: 0.5, lift: 0, offside: false }]);
  assert.strictEqual(other.t.passes.length, 0);
});

test("passing: losing the puck while a teammate was open is \"the moment to pass\"", function () {
  var s = quiet("RW"), t = R.start(s);
  put(s, "us", "RW", 60, 100); put(s, "us", "C", 40, 102);    // the center is open, 20 feet away
  put(s, "them", "LD", 67, 99);                               // a defender is right on you, on the other side
  G.gain(s, "us", "RW");
  for (var i = 0; i < 120; i++) R.watch(t, s, [], DT);        // you hold the puck for two seconds
  assert.ok(t.needPass > 0, "the notes did not see that you should pass");
  R.watch(t, s, [{ kind: "steal", team: "them", role: "LD", from: "RW" }], DT);
  assert.strictEqual(t.lost.open, 1);
  var c = card(R.build(t, s), "passing");
  assert.ok(/never passed\. Once a defender took the puck from you while a teammate was open\. That was the moment to pass\./.test(c.line), c.line);
  assert.strictEqual(c.grade, "far");
  // The same steal with nobody open is just a lost puck.
  var s2 = quiet("RW"), t2 = R.start(s2);
  put(s2, "us", "RW", 60, 100); put(s2, "them", "LD", 67, 99);
  ROLES.forEach(function (r) { if (r !== "RW") put(s2, "us", r, 60, 190); });   // every teammate far away, behind defenders
  ROLES.forEach(function (r, i) { if (r !== "LD") put(s2, "them", r, 60, 120 + 10 * i); });
  G.gain(s2, "us", "RW");
  for (i = 0; i < 120; i++) R.watch(t2, s2, [], DT);
  R.watch(t2, s2, [{ kind: "steal", team: "them", role: "LD", from: "RW" }], DT);
  assert.strictEqual(t2.lost.total, 1); assert.strictEqual(t2.lost.open, 0);
});

// ---- Shooting ----
test("shooting: good spots, misses and goals are told apart", function () {
  var r = notesFrom("RW", [].concat(shot(0.25, "goal"), shot(0.2, "saved"), shot(0.02, "over"), shot(0.03, "wide")));
  var c = card(r.report, "shooting");
  assert.ok(c.line.indexOf("You shot 4 times and scored 1. 2 shots were from a good spot in front of the net, 2 from far out or from the side.") === 0, c.line);
  assert.ok(/Once the puck went over the net\. Once it missed beside the net\./.test(c.line), c.line);
  assert.strictEqual(c.grade, "close");
  assert.strictEqual(c.praise, "You scored 1 goal.");
  // Mostly from bad spots: the tip is about WHERE to shoot from.
  var far = card(notesFrom("RW", [].concat(shot(0.02, "saved"), shot(0.01, "saved"), shot(0.03, "blocked"))).report, "shooting");
  assert.ok(/None of them was from a good spot\./.test(far.line), far.line);
  assert.ok(/Skate to the middle/.test(far.tip), far.tip);
  assert.strictEqual(far.grade, "far");
  // From good spots but over the net: the tip is about the Height bar.
  var high = card(notesFrom("RW", [].concat(shot(0.2, "over"), shot(0.2, "over"), shot(0.2, "saved"))).report, "shooting");
  assert.ok(/Height mark lower/.test(high.tip), high.tip);
  // All from the slot and on the net.
  assert.strictEqual(card(notesFrom("RW", [].concat(shot(0.2, "saved"), shot(0.3, "goal"))).report, "shooting").grade, "good");
});
test("shooting: no shot is not graded, unless you stood in a good spot with the puck", function () {
  assert.strictEqual(card(notesFrom("RW", []).report, "shooting").grade, "none");
  var s = quiet("RW"), t = R.start(s);
  put(s, "us", "RW", 42.5, 165); G.gain(s, "us", "RW");
  for (var i = 0; i < 240; i++) R.watch(t, s, [], DT);        // four seconds in the slot, no shot
  var c = card(R.build(t, s), "shooting");
  assert.ok(/You did not shoot, but you had the puck in a good spot in front of their net for about 4 seconds\./.test(c.line), c.line);
  assert.strictEqual(c.grade, "close");
});

// ---- Taking ----
test("taking: tries from too far away are called out", function () {
  var far = { kind: "take", team: "us", role: "RW", result: "far", feet: 20 }, miss = { kind: "take", team: "us", role: "RW", result: "miss", feet: 4 };
  var won = { kind: "steal", team: "us", role: "RW", from: "C" };
  var c = card(notesFrom("RW", [far, far, far, miss, won]).report, "taking");
  assert.ok(/You tried to take the puck 5 times and won it 1 time\. 3 times you were too far away\./.test(c.line), c.line);
  assert.strictEqual(c.grade, "far");
  assert.ok(/Get close first/.test(c.tip));
  var good = card(notesFrom("RW", [won, miss, won]).report, "taking");
  assert.strictEqual(good.grade, "good");
  assert.strictEqual(card(notesFrom("RW", []).report, "taking").grade, "none");
  // A teammate's steal is not yours.
  assert.strictEqual(notesFrom("RW", [{ kind: "steal", team: "us", role: "C", from: "LW" }]).t.takes.won, 0);
});

// ---- Whistles and face-offs ----
test("whistles: only the ones that were your doing", function () {
  var clean = card(notesFrom("RW", [{ kind: "offside", team: "us", role: "C", by: "LW" }, { kind: "offside", team: "them", role: "RW", by: "C" },
                                    { kind: "icing", team: "us", by: "LD" }]).report, "whistles");
  assert.strictEqual(clean.grade, "good");
  var mine = card(notesFrom("RW", [{ kind: "offside", team: "us", role: "RW", by: "C" }, { kind: "offside", team: "us", role: "RW", by: "C" },
                                   { kind: "offside", team: "us", role: "LW", by: "RW" }, { kind: "icing", team: "us", by: "RW" }]).report, "whistles");
  assert.ok(/^Twice you were inside their blue line before the puck \(offside\)\. Once you brought or passed the puck in while a teammate was still inside \(offside\)\. Once your puck went all the way down the ice untouched \(icing\)\.$/.test(mine.line), mine.line);
  assert.strictEqual(mine.grade, "far");
  assert.ok(/Wait at their blue line/.test(mine.tip));
});
test("face-offs: a card only when you took some", function () {
  assert.strictEqual(card(notesFrom("RW", [{ kind: "faceoff", team: "us", you: null }]).report, "faceoffs"), undefined);
  var c = card(notesFrom("C", [{ kind: "faceoff", team: "us", you: "won" }, { kind: "faceoff", team: "them", you: "lost" },
                               { kind: "faceoff", team: "them", you: "early" }]).report, "faceoffs");
  assert.ok(/You won 1 of 3 face-offs\. Once you moved before the puck dropped\./.test(c.line), c.line);
  assert.ok(/Wait for the puck to leave/.test(c.tip));
});

// ---- Position ----
// Our center has the puck; where are YOU (the right wing)?
function standing(offA, offD, steps) {
  var s = quiet("RW"), t = R.start(s);
  put(s, "us", "C", 42, 60); G.gain(s, "us", "C");
  s.brain.us.think = 999;
  var want = B.spots(s, "us").spots.RW;
  put(s, "us", "RW", want.a + offA, want.d + offD);
  for (var i = 0; i < (steps || 600); i++) R.watch(t, s, [], DT);
  return { t: t, s: s, card: card(R.build(t, s), "position") };
}
test("position: standing on your spot is good, standing far from it is not", function () {
  var on = standing(0, 0);
  assert.strictEqual(on.card.grade, "good");
  assert.ok(/you were at the spot for a right wing 100% of the time\.$/.test(on.card.line), on.card.line);
  assert.ok(on.t.pos.n >= 40, "it looks about five times a second: " + on.t.pos.n);
  var near = standing(0, 18);
  assert.strictEqual(near.card.grade, "close");
  assert.ok(/0% of the time, and close to it another 100%/.test(near.card.line), near.card.line);
  var ahead = standing(0, 45);
  assert.strictEqual(ahead.card.grade, "far");
  assert.ok(/Your usual slip: too far up the ice\./.test(ahead.card.line), ahead.card.line);
  var behind = standing(0, -45);
  assert.ok(/Your usual slip: too far back\./.test(behind.card.line), behind.card.line);
  var across = standing(-40, 0);
  assert.ok(/Your usual slip: on the wrong side of the ice\./.test(across.card.line), across.card.line);
  // Too little time without the puck: no grade.
  assert.strictEqual(standing(0, 0, 30).card.grade, "none");
});
test("position: going for the puck when that is your job does not count against you", function () {
  // A loose puck, and you are the nearest of your team: chase it.
  var s = quiet("RW"), t = R.start(s);
  s.puck.a = 60; s.puck.d = 150; s.side = "them";
  put(s, "us", "RW", 60, 140);
  for (var i = 0; i < 600; i++) R.watch(t, s, [], DT);
  assert.strictEqual(t.pos.n, 0);
  // A pass is on its way to you.
  var s2 = quiet("RW"), t2 = R.start(s2);
  s2.puck.pass = { team: "us", to: "RW" }; s2.puck.a = 40; s2.puck.d = 50;
  put(s2, "us", "RW", 70, 150);
  for (i = 0; i < 600; i++) R.watch(t2, s2, [], DT);
  assert.strictEqual(t2.pos.n, 0);
  // While you HAVE the puck nothing is counted either.
  var s3 = quiet("RW"), t3 = R.start(s3);
  put(s3, "us", "RW", 60, 60); G.gain(s3, "us", "RW");
  for (i = 0; i < 600; i++) R.watch(t3, s3, [], DT);
  assert.strictEqual(t3.pos.n, 0);
  assert.ok(Math.abs(t3.withPuck - 10) < 0.01);
});
test("nothing is counted while play is stopped", function () {
  var s = quiet("RW"), t = R.start(s);
  s.phase = "dead";
  for (var i = 0; i < 600; i++) R.watch(t, s, [], DT);
  assert.strictEqual(t.steps, 0); assert.strictEqual(t.pos.n, 0);
});

// ---- The top of the report ----
test("the report praises the best parts and picks the ONE weakest part to work on", function () {
  var events = [].concat(passed("caught"), passed("caught"), passed("caught"),          // passing: good
                         shot(0.01, "over"), shot(0.02, "wide"), shot(0.01, "over"));   // shooting: bad
  var r = notesFrom("RW", events).report;
  assert.strictEqual(r.next.title, "Shooting");
  assert.strictEqual(r.next.tip, card(r, "shooting").tip);
  assert.ok(r.well.length >= 1 && r.well.length <= 2);
  assert.ok(r.well.indexOf("3 of your 3 passes reached a teammate.") >= 0, JSON.stringify(r.well));
  assert.ok(r.well.indexOf("No offside and no icing was your doing.") >= 0);
  // Nothing seen at all: still something kind to say, and no grade is made up.
  var empty = notesFrom("RW", []).report;
  assert.ok(empty.well.length >= 1);
  assert.strictEqual(card(empty, "shooting").word, "Not seen");
  // Everything good: the next step is a harder game.
  var s = quiet("RW"), t = R.start(s);
  R.watch(t, s, [].concat(passed("caught"), passed("caught"), shot(0.3, "goal")), DT);
  t.pos = { n: 50, good: 45, close: 5, ahead: 0, aside: 0 };
  var all = R.build(t, s);
  assert.strictEqual(all.next.title, "A harder game");
});

// ---- From real play ----
test("played for real: a pass you make and a take you win show up in the report", function () {
  var s = quiet("C"), t = R.start(s), dice = G.makeDice(4);
  put(s, "us", "C", 45, 50); put(s, "us", "RW", 72, 70);
  G.gain(s, "us", "C");
  function step(input, intents) { R.watch(t, s, G.tick(s, input, intents || null, DT, dice), DT); }
  step({ pass: true, move: { a: 1, d: 1 } });                        // tap 1: the power
  s.aim.power = 0.6;
  step({ pass: true, move: { a: 1, d: 1 } });                        // tap 2: the height (flat), and off it goes
  for (var i = 0; i < 120 && !s.puck.owner; i++) step({});
  assert.strictEqual(s.puck.carrier, "RW");
  assert.strictEqual(t.passes.length, 1); assert.strictEqual(t.passes[0].result, "caught"); assert.strictEqual(t.passes[0].to, "RW");
  // Now they have it: one try from far away, then one from close.
  put(s, "them", "C", 50, 60); G.gain(s, "them", "C");
  put(s, "us", "C", 50, 30);
  step({ take: true });
  assert.strictEqual(t.takes.far, 1);
  put(s, "us", "C", 50, 56.5); s.us.C.cool = 0; s.us.C.slow = 0;
  var lucky = function () { return 0; };
  R.watch(t, s, G.tick(s, { take: true }, null, DT, lucky), DT);
  assert.strictEqual(t.takes.won, 1);
  var c = card(R.build(t, s), "taking");
  assert.ok(/You tried to take the puck 2 times and won it 1 time\. Once you were too far away\./.test(c.line), c.line);
});

test("a whole game played by the computer gives a full report with no broken words", function () {
  [0, 3, 6].forEach(function (age) {
    ROLES.forEach(function (you, k) {
      var s = G.newGame({ you: you, age: age, minutes: 2 }), dice = G.makeDice(50 + 10 * age + k), t = R.start(s);
      while (s.phase !== "over") R.watch(t, s, B.play(s, { auto: true }, DT, dice), DT);
      var r = R.build(t, s), words = allWords(r);
      assert.ok(!/NaN|undefined|null|Infinity/.test(words), "broken words for " + you + " at age group " + age + ": " + words);
      ["position", "passing", "shooting", "taking", "whistles"].forEach(function (id) {
        var c = card(r, id);
        assert.ok(c && c.title && c.line.length > 10, id + " is missing");
        assert.ok(["good", "close", "far", "none"].indexOf(c.grade) >= 0);
        assert.strictEqual(c.word, R.WORDS[c.grade]);
        if (c.grade !== "none") assert.ok(c.score >= 0 && c.score <= 1, id + " score " + c.score);
      });
      assert.strictEqual(!!card(r, "faceoffs"), false, "the computer took the face-offs, not you");
      assert.ok(r.well.length >= 1 && r.well.length <= 2 && r.next.title.length > 3);
      assert.ok(t.pos.n > 100, "a two-minute game has plenty of looks at your position: " + t.pos.n);
      // The notes agree with the game's own counts.
      assert.ok(t.shots.length <= s.stats.shots.us && t.passes.length <= s.stats.passes.us);
    });
  });
});

console.log("All coach's-report (gamereport) tests passed!");
