// Run with:  node tests/refplays.test.js
// Checks js/refplays.js: the plays of "You make the call" and the judge.
var R = require("../js/refplays.js");
var G = require("../js/gamesim.js");   // only for dice we can repeat
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
function still(a, d) { return [{ t: 0, a: a, d: d }, { t: 5, a: a, d: d }]; }
function line(a0, d0, a1, d1, t0, t1) { return [{ t: 0, a: a0, d: d0 }, { t: t0, a: a0, d: d0 }, { t: t1, a: a1, d: d1 }]; }
// A tiny play made by hand: one carrier, one other attacker standing still.
function carryPlay(otherDepth) {
  return {
    duration: 3, shorthanded: false, touches: [{ t: 0, team: "att", who: "C", type: "carry" }],
    skaters: [{ id: "C", team: "att", label: "C", name: "center" }, { id: "W", team: "att", label: "W", name: "winger" }],
    tracks: { C: line(40, 100, 40, 150, 0, 2.5), puck: line(40, 103, 40, 153, 0, 2.5), W: still(15, otherDepth) }
  };
}
function shotPlay(fromDepth, endA, endD, extra) {
  var play = {
    duration: 3, shorthanded: false,
    touches: [{ t: 0, team: "att", who: "S", type: "carry" }, { t: 0.5, team: "att", who: "S", type: "shot" }],
    skaters: [{ id: "S", team: "att", label: "D", name: "defender" }, { id: "X1", team: "def", label: "", name: "" }],
    tracks: { S: still(30, fromDepth - 3), puck: line(30, fromDepth, endA, endD, 0.5, 2.5), X1: still(70, 150) }
  };
  Object.keys(extra || {}).forEach(function (k) { play[k] = extra[k]; });
  return play;
}

// ---------- Moving things ------------------------------------------------
test("things move in straight lines between their moments", function () {
  var track = [{ t: 0, a: 10, d: 100 }, { t: 2, a: 20, d: 140 }];
  assert.deepStrictEqual(R.where(track, 1), { a: 15, d: 120 });
  assert.deepStrictEqual(R.where(track, -1), { a: 10, d: 100 });
  assert.deepStrictEqual(R.where(track, 9), { a: 20, d: 140 });
  // Two skates: one ahead of the body, one behind, each one foot long.
  var skates = R.skatesOf({ a: 40, d: 127 });
  assert.ok(skates[0].heel < 127 && skates[1].heel > 127);
  assert.ok(Math.abs(skates[0].toe - skates[0].heel - 1) < 1e-9);
});

// ---------- Offside, judged from the skates ------------------------------
test("offside: both skates completely over the blue line before the puck", function () {
  var r = R.judge(carryPlay(135));
  assert.strictEqual(r.call, "offside");
  assert.strictEqual(r.who, "W");
  assert.ok(r.t > 1 && r.t < 1.3, "the whistle comes when the puck crosses, at " + r.t);
  // Just barely all the way over: still offside.
  assert.strictEqual(R.judge(carryPlay(R.BLUE + 1.6)).call, "offside");
});

test("onside: behind the line, or one skate still not over", function () {
  var behind = R.judge(carryPlay(110));
  assert.strictEqual(behind.call, "ok");
  assert.strictEqual(behind.reason, "onside");
  // The back skate's heel is right on the line's far edge: not completely over.
  var close = R.judge(carryPlay(R.BLUE + 1.4));
  assert.strictEqual(close.call, "ok");
  assert.strictEqual(close.reason, "onside-close");
  assert.strictEqual(close.who, "W");
});

test("the player carrying the puck is not offside (the puck goes in first)", function () {
  var play = carryPlay(110);
  var r = R.judge(play);
  assert.strictEqual(r.call, "ok");
  // Skating in AFTER the puck is over the line is fine too.
  play.tracks.W = line(15, 110, 15, 150, 1.4, 2.6);
  assert.strictEqual(R.judge(play).call, "ok");
});

// ---------- Icing ---------------------------------------------------------
test("icing: shot from your own half, all the way over the goal line, untouched", function () {
  var r = R.judge(shotPlay(60, 15, 197));
  assert.strictEqual(r.call, "icing");
  assert.strictEqual(r.reason, "icing");
  assert.ok(Math.abs(r.from.d - 60) < 0.01 && r.spot.a < R.NET.from);
  // A hair behind the center red line is still your own half.
  assert.strictEqual(R.judge(shotPlay(R.RED - 0.5, 70, 197)).call, "icing");
});

test("not icing: past the red line, into the net, stopped short, or played by the other team", function () {
  assert.strictEqual(R.judge(shotPlay(105, 15, 197)).reason, "past-red");
  assert.strictEqual(R.judge(shotPlay(60, 42.5, 191.5)).reason, "goal");
  assert.strictEqual(R.judge(shotPlay(60, 20, 185)).reason, "short");
  var touched = shotPlay(60, 15, 197);
  touched.tracks.puck = [{ t: 0, a: 30, d: 60 }, { t: 0.5, a: 30, d: 60 }, { t: 1.5, a: 22, d: 150 }, { t: 2.5, a: 24, d: 140 }];
  touched.touches.push({ t: 1.5, team: "def", who: "X1", type: "touch" });
  var r = R.judge(touched);
  assert.strictEqual(r.reason, "touched");
  ["past-red", "goal", "short", "touched"].forEach(function (why) { assert.ok(R.REASONS[why].length > 30); });
  assert.strictEqual(r.call, "ok");
});

test("in youth hockey a shorthanded team is called for icing too", function () {
  var r = R.judge(shotPlay(60, 15, 197, { shorthanded: true }));
  assert.strictEqual(r.call, "icing");
  assert.strictEqual(r.reason, "icing-shorthanded");
  assert.ok(/youth hockey/.test(R.explain(shotPlay(60, 15, 197, { shorthanded: true }), r)));
});

// ---------- The plays we build -------------------------------------------
test("the judge agrees with every kind of play, at every level, 300 times each", function () {
  var dice = G.makeDice(2027), reasons = {};
  Object.keys(R.KINDS).forEach(function (kind) {
    [1, 2, 3].forEach(function (level) {
      for (var i = 0; i < 300; i++) {
        var play = R.makePlay(kind, level, dice), r = R.judge(play);
        assert.strictEqual(r.call, R.KINDS[kind].call, kind + " at level " + level + " was judged " + r.call + " (" + r.reason + ")");
        reasons[kind + ":" + r.reason] = true;
        assert.ok(play.duration > 1.5 && play.duration < 6, kind + " lasts " + play.duration);
        assert.ok(r.t >= 0 && r.t <= play.duration + 0.02);
        assert.ok(R.explain(play, r).indexOf("{") < 0);
        // Everybody stays on the ice the whole time.
        for (var t = 0; t <= play.duration; t += 0.25) {
          var now = R.at(play, t);
          now.skaters.concat([now.puck]).forEach(function (p) {
            assert.ok(p.a >= 2 && p.a <= 83 && p.d >= 2 && p.d <= 198, kind + ": something left the ice");
          });
        }
      }
    });
  });
  // Each kind is called for the right reason.
  ["offside-carry:offside", "offside-pass:offside", "onside-carry:onside", "onside-carry:onside-close", "onside-pass:onside-close",
   "icing:icing", "dump-in:past-red", "icing-touched:touched", "icing-short:short", "icing-goal:goal",
   "icing-shorthanded:icing-shorthanded"].forEach(function (pair) { assert.ok(reasons[pair], "never saw " + pair); });
});

test("level 1 is plain to see, level 2 has close calls", function () {
  var dice = G.makeDice(7);
  function depthAtWhistle(kind, level) {
    var play = R.makePlay(kind, level, dice), r = R.judge(play);
    return R.at(play, r.t).skaters.filter(function (s) { return s.id === (kind.indexOf("pass") > 0 ? "R" : "W"); })[0].d;
  }
  for (var i = 0; i < 100; i++) {
    assert.ok(depthAtWhistle("offside-carry", 1) > R.BLUE + 6, "level 1 offside should be far over the line");
    assert.ok(depthAtWhistle("onside-pass", 1) < R.BLUE - 3, "level 1 onside should be well behind the line");
    var close = depthAtWhistle("offside-pass", 2);
    assert.ok(close > R.BLUE + 1.5 && close < R.BLUE + 4.6, "level 2 offside should be close: " + close);
  }
  // A shorthanded team only shows up with four blue skaters.
  var short = R.makePlay("icing-shorthanded", 3, dice);
  assert.strictEqual(short.skaters.filter(function (s) { return s.team === "att"; }).length, 2);
  assert.strictEqual(short.shorthanded, true);
});

test("dealing plays: right level, about half need a whistle, never the same twice in a row", function () {
  var dice = G.makeDice(99), last = null, whistles = 0, seen = {};
  for (var i = 0; i < 600; i++) {
    var play = R.deal(1, dice, last);
    assert.ok(R.KINDS[play.kind].level === 1);
    assert.notStrictEqual(play.kind, last);
    if (R.KINDS[play.kind].call !== "ok") whistles++;
    seen[play.kind] = true;
    last = play.kind;
  }
  assert.ok(whistles > 230 && whistles < 370, whistles + " of 600 needed a whistle");
  assert.strictEqual(Object.keys(seen).length, 6);
  var all = {};
  for (var j = 0; j < 600; j++) all[R.deal(3, dice, null).kind] = true;
  assert.strictEqual(Object.keys(all).length, Object.keys(R.KINDS).length);
});

console.log("All referee tests passed!");
