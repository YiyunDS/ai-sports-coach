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

// ---------- More of the offside rule ----------------------------------------
// A tiny play made by hand: the puck is shot in from the neutral zone.
function dumpPlay(otherDepth) {
  return {
    duration: 3, shorthanded: false,
    touches: [{ t: 0, team: "att", who: "S", type: "carry" }, { t: 0.5, team: "att", who: "S", type: "shot" }],
    skaters: [{ id: "S", team: "att", label: "D", name: "defender" }, { id: "W", team: "att", label: "W", name: "winger" }],
    tracks: { S: still(30, 107), puck: line(30, 110, 10, 178, 0.5, 2), W: still(60, otherDepth) }
  };
}
test("a puck that is SHOT in: offside if a teammate is already inside, fine if nobody is", function () {
  var bad = R.judge(dumpPlay(140));
  assert.strictEqual(bad.call, "offside");
  assert.strictEqual(bad.reason, "offside-dump");
  assert.strictEqual(bad.who, "W");
  var good = R.judge(dumpPlay(112));
  assert.strictEqual(good.call, "ok");
  assert.strictEqual(good.reason, "onside-dump");
  assert.ok(/shot into the zone/.test(R.explain(dumpPlay(140), bad)) && /shot into the zone/.test(R.explain(dumpPlay(112), good)));
});

// The puck starts inside the zone, slides out to "outDepth", and a blue
// player (P) carries it back in. W is another blue player.
function againPlay(outDepth, wTrack) {
  return {
    duration: 4, shorthanded: false,
    touches: [{ t: 0, team: "def", who: "X1", type: "carry" }, { t: 0.3, team: "def", who: "X1", type: "shot" },
              { t: 1, team: "att", who: "P", type: "receive" }],
    skaters: [{ id: "P", team: "att", label: "D", name: "defender" }, { id: "W", team: "att", label: "W", name: "winger" },
              { id: "X1", team: "def", label: "", name: "" }],
    tracks: {
      X1: still(40, 142), W: wTrack,
      P: [{ t: 0, a: 40, d: outDepth - 3 }, { t: 1.5, a: 40, d: outDepth - 3 }, { t: 3.5, a: 40, d: outDepth + 27 }],
      puck: [{ t: 0, a: 40, d: 140 }, { t: 0.3, a: 40, d: 140 }, { t: 1, a: 40, d: outDepth }, { t: 1.5, a: 40, d: outDepth }, { t: 3.5, a: 40, d: outDepth + 30 }]
    }
  };
}
test("the puck comes out and goes back in: everybody must be back at the line", function () {
  // The winger never left the zone.
  var stayed = R.judge(againPlay(116, still(20, 140)));
  assert.strictEqual(stayed.call, "offside");
  assert.strictEqual(stayed.reason, "offside-again");
  assert.strictEqual(stayed.who, "W");
  // The winger skated out in time.
  var out = R.judge(againPlay(116, line(20, 140, 20, 118, 0.3, 1.6)));
  assert.strictEqual(out.call, "ok");
  assert.strictEqual(out.reason, "onside-again");
  // Just one skate back on the line when the puck goes in: enough.
  var close = R.judge(againPlay(116, still(20, R.BLUE + 1.2)));
  assert.strictEqual(close.call, "ok");
  assert.strictEqual(close.reason, "onside-again-close");
  // The puck only went back as far as the blue line itself. The line is
  // part of the zone then, so the puck never left: no offside.
  var onLine = R.judge(againPlay(125.5, still(20, 140)));
  assert.strictEqual(onLine.call, "ok");
  assert.strictEqual(onLine.reason, "nothing");
});

test("rule 630(b): the player who has the puck may cross the line ahead of it", function () {
  // The carrier skates in backward: the body goes first, the puck 4 feet behind.
  function backward(touches) {
    return {
      duration: 3, shorthanded: false, touches: touches,
      skaters: [{ id: "C", team: "att", label: "C", name: "center" }, { id: "W", team: "att", label: "W", name: "winger" }],
      tracks: { C: line(40, 104, 40, 154, 0, 2.5), puck: line(40, 100, 40, 150, 0, 2.5), W: still(15, 110) }
    };
  }
  var r = R.judge(backward([{ t: 0, team: "att", who: "C", type: "carry" }]));
  assert.strictEqual(r.call, "ok");
  assert.strictEqual(r.reason, "carrier-first");
  assert.strictEqual(r.who, "C");
  // Another player who is in ahead of the puck is still offside.
  var two = backward([{ t: 0, team: "att", who: "C", type: "carry" }]);
  two.tracks.W = still(15, 140);
  assert.strictEqual(R.judge(two).call, "offside");
  assert.strictEqual(R.judge(two).who, "W");
  // If that player does NOT have the puck (it was passed in behind them), it is offside.
  var noPuck = R.judge(backward([{ t: 0, team: "att", who: "W", type: "carry" }, { t: 0.1, team: "att", who: "W", type: "pass" }]));
  assert.strictEqual(noPuck.call, "offside");
  assert.strictEqual(noPuck.who, "C");
});

test("skates already in the zone, the stick reaches back for the puck: offside", function () {
  // The winger stands inside with both skates over. The pass stops on
  // their stick, outside the zone. Then they pull it in.
  var play = {
    duration: 3, shorthanded: false,
    touches: [{ t: 0, team: "att", who: "D", type: "carry" }, { t: 0.4, team: "att", who: "D", type: "pass" }, { t: 1, team: "att", who: "W", type: "receive" }],
    skaters: [{ id: "D", team: "att", label: "D", name: "defender" }, { id: "W", team: "att", label: "W", name: "winger" }],
    tracks: { D: still(30, 104), W: [{ t: 0, a: 50, d: 129 }, { t: 1.4, a: 50, d: 129 }, { t: 2.4, a: 50, d: 144 }],
              puck: [{ t: 0, a: 30, d: 107 }, { t: 0.4, a: 30, d: 107 }, { t: 1, a: 51, d: 124 }, { t: 1.4, a: 51, d: 124 }, { t: 1.8, a: 51, d: 133 }, { t: 2.4, a: 51, d: 146 }] }
  };
  var r = R.judge(play);
  assert.strictEqual(r.call, "offside");
  assert.strictEqual(r.reason, "offside-reach");
  assert.strictEqual(r.who, "W");
  // With one skate still on the line when the pass arrives, the same player may go in first.
  play.tracks.W = [{ t: 0, a: 50, d: 127 }, { t: 1.4, a: 50, d: 127 }, { t: 1.6, a: 50, d: 131 }, { t: 2.4, a: 50, d: 144 }];
  play.tracks.puck = [{ t: 0, a: 30, d: 107 }, { t: 0.4, a: 30, d: 107 }, { t: 1, a: 51, d: 124 }, { t: 1.6, a: 51, d: 124 }, { t: 2, a: 51, d: 133 }, { t: 2.4, a: 51, d: 146 }];
  assert.strictEqual(R.judge(play).reason, "carrier-first");
  // A carrier who takes the puck out of the zone and back in, while the
  // skates stay inside, has used up that right: offside.
  var inAndOut = {
    duration: 4, shorthanded: false, touches: [{ t: 0, team: "att", who: "C", type: "carry" }],
    skaters: [{ id: "C", team: "att", label: "C", name: "center" }],
    tracks: { C: [{ t: 0, a: 40, d: 110 }, { t: 1, a: 40, d: 130 }, { t: 4, a: 60, d: 130 }],
              puck: [{ t: 0, a: 40, d: 113 }, { t: 1, a: 40, d: 133 }, { t: 2, a: 47, d: 123 }, { t: 3, a: 54, d: 133 }, { t: 4, a: 60, d: 133 }] }
  };
  var again = R.judge(inAndOut);
  assert.strictEqual(again.call, "offside");
  assert.strictEqual(again.who, "C");
});

test("rule 630(b): the other team takes the puck back into their own zone: not offside", function () {
  // A red player carries the puck from the neutral zone back into their
  // zone. A blue winger is still in there.
  function back(type) {
    return {
      duration: 3, shorthanded: false, touches: [{ t: 0, team: "def", who: "X1", type: type }],
      skaters: [{ id: "W", team: "att", label: "W", name: "winger" }, { id: "X1", team: "def", label: "", name: "" }],
      tracks: { W: still(30, 134), X1: line(40, 121, 40, 141, 0.5, 2), puck: line(40, 118, 40, 138, 0.5, 2) }
    };
  }
  var r = R.judge(back("carry"));
  assert.strictEqual(r.call, "ok");
  assert.strictEqual(r.reason, "defender-back");
  assert.strictEqual(r.who, "W");
  assert.ok(/red player/.test(R.explain(back("carry"), r)));
  assert.strictEqual(R.judge(back("pass")).reason, "defender-back");
  // A puck that only bounces off a red player is different: that IS offside.
  assert.strictEqual(R.judge(back("touch")).call, "offside");
});

// ---------- More of the icing rule ---------------------------------------
test("a long pass: icing if nobody reaches it, a good play if a teammate catches it", function () {
  var missed = shotPlay(60, 15, 197);
  missed.touches[1].type = "pass";
  var r = R.judge(missed);
  assert.strictEqual(r.call, "icing");
  assert.strictEqual(r.reason, "icing-pass");
  // The same pass, caught by a teammate in the neutral zone.
  var caught = shotPlay(60, 26, 112);
  caught.touches[1].type = "pass";
  caught.skaters.push({ id: "W", team: "att", label: "W", name: "winger" });
  caught.tracks.W = still(26, 110);
  caught.touches.push({ t: 2.5, team: "att", who: "W", type: "receive" });
  var c = R.judge(caught);
  assert.strictEqual(c.call, "ok");
  assert.strictEqual(c.reason, "caught");
  assert.strictEqual(c.who, "W");
  assert.ok(/winger caught the long pass/.test(R.explain(caught, c)));
});

test("the LAST blue touch decides icing: a tip behind the red line is icing, past it is not", function () {
  function tipped(tipDepth) {
    var play = shotPlay(60, 30, tipDepth);
    play.touches[1].type = "pass";
    play.tracks.puck = [{ t: 0, a: 30, d: 60 }, { t: 0.5, a: 30, d: 60 }, { t: 1, a: 30, d: tipDepth }, { t: 2.5, a: 15, d: 197 }];
    play.skaters.push({ id: "W", team: "att", label: "W", name: "winger" });
    play.tracks.W = still(31, tipDepth - 2.5);
    play.touches.push({ t: 1, team: "att", who: "W", type: "tip" });
    return play;
  }
  var behind = R.judge(tipped(90));
  assert.strictEqual(behind.call, "icing");
  assert.strictEqual(behind.reason, "icing-tipped");
  assert.strictEqual(behind.who, "W");
  assert.ok(Math.abs(behind.from.d - 90) < 0.01, "the tip is the last touch, so that is where we measure from");
  var past = R.judge(tipped(108));
  assert.strictEqual(past.call, "ok");
  assert.strictEqual(past.reason, "past-red-tip");
});

// ---------- The plays we build -------------------------------------------
var KIND_NAMES = Object.keys(R.KINDS);
test("the judge agrees with every kind of play, at every level, on both sides of the ice, 300 times each", function () {
  var dice = G.makeDice(2027), reasons = {}, sides = {};
  KIND_NAMES.forEach(function (kind) {
    [1, 2, 3].forEach(function (level) {
      for (var i = 0; i < 300; i++) {
        var play = R.makePlay(kind, level, dice), r = R.judge(play);
        assert.strictEqual(r.call, R.KINDS[kind].call, kind + " at level " + level + " was judged " + r.call + " (" + r.reason + ")");
        reasons[kind + ":" + r.reason] = true;
        assert.ok(play.duration > 1.5 && play.duration < 6, kind + " lasts " + play.duration);
        assert.ok(r.t >= 0 && r.t <= play.duration + 0.02);
        assert.ok(R.explain(play, r).indexOf("{") < 0);
        // Which side of the ice was the player the call hangs on?
        var keyAt = R.where(play.tracks[play.key || "puck"], r.t);
        sides[kind + (keyAt.a < 42.5 ? ":left" : ":right")] = true;
        // Everybody stays on the ice the whole time, and in the part of the rink the page shows.
        for (var t = 0; t <= play.duration; t += 0.25) {
          var now = R.at(play, t);
          now.skaters.concat([now.puck]).forEach(function (p) {
            assert.ok(p.a >= 2 && p.a <= 83 && p.d >= 2 && p.d <= 198, kind + ": something left the ice");
            assert.ok(p.d >= play.from + 2, kind + ": something is out of the picture at depth " + p.d);
          });
        }
      }
    });
  });
  KIND_NAMES.forEach(function (kind) {
    assert.ok(sides[kind + ":left"] && sides[kind + ":right"], kind + " only ever happens on one side of the ice");
  });
  // Each kind is called for the right reason.
  ["offside-carry:offside", "offside-pass:offside", "onside-carry:onside", "onside-carry:onside-close", "onside-pass:onside-close",
   "icing:icing", "dump-in:past-red", "icing-touched:touched", "icing-short:short", "icing-goal:goal",
   "icing-shorthanded:icing-shorthanded",
   "offside-dump:offside-dump", "onside-dump:onside-dump", "onside-dump:onside-close",
   "offside-again:offside-again", "onside-again:onside-again", "onside-again:onside-again-close",
   "icing-pass:icing-pass", "pass-caught:caught", "offside-long-pass:offside",
   "offside-far:offside", "onside-far:onside", "onside-far:onside-close",
   "icing-tipped:icing-tipped", "tip-past-red:past-red-tip",
   "carrier-first:carrier-first", "offside-reach:offside-reach", "defender-back:defender-back"
  ].forEach(function (pair) { assert.ok(reasons[pair], "never saw " + pair); });
  // And for no other reason.
  Object.keys(reasons).forEach(function (pair) {
    var kind = pair.split(":")[0], why = pair.split(":")[1];
    assert.ok(R.REASONS[why], "no words for " + why);
    assert.strictEqual(/^(Offside|Icing)/.test(R.REASONS[why]), R.KINDS[kind].call !== "ok", pair + " explains the wrong call");
  });
});

test("level 1 is plain to see, level 2 has close calls", function () {
  var dice = G.makeDice(7);
  // How deep is the player the call hangs on, at the moment of the call?
  function depthAtWhistle(kind, level) {
    var play = R.makePlay(kind, level, dice), r = R.judge(play);
    return R.where(play.tracks[play.key], r.t).d;
  }
  for (var i = 0; i < 100; i++) {
    ["offside-carry", "offside-pass", "offside-dump", "offside-far", "offside-again", "offside-long-pass"].forEach(function (kind) {
      assert.ok(depthAtWhistle(kind, 1) > R.BLUE + 6, "level 1 " + kind + " should be far over the line");
      var close = depthAtWhistle(kind, 2);
      assert.ok(close > R.BLUE + 1.5 && close < R.BLUE + 4.6, "level 2 " + kind + " should be close: " + close);
    });
    ["onside-carry", "onside-pass", "onside-dump", "onside-far", "onside-again"].forEach(function (kind) {
      assert.ok(depthAtWhistle(kind, 1) < R.BLUE - 3, "level 1 " + kind + " should be well behind the line");
      var near = depthAtWhistle(kind, 2);
      assert.ok(near > R.BLUE - 1.5 && near <= R.BLUE + 1.5, "level 2 " + kind + " should be close: " + near);
    });
  }
  // A shorthanded team always shows one skater fewer than the other team.
  for (var j = 0; j < 100; j++) {
    var short = R.makePlay("icing-shorthanded", 3, dice);
    var blue = short.skaters.filter(function (s) { return s.team === "att"; }).length;
    assert.strictEqual(short.skaters.length - blue, blue + 1);
    assert.strictEqual(short.shorthanded, true);
  }
});

test("two wingers: the near one is clearly fine, the FAR one decides", function () {
  var dice = G.makeDice(31);
  ["offside-far", "onside-far"].forEach(function (kind) {
    for (var i = 0; i < 200; i++) {
      var play = R.makePlay(kind, 1 + i % 3, dice), r = R.judge(play), now = R.at(play, r.t);
      var wingers = now.skaters.filter(function (s) { return s.label === "W" && !play.skaters.filter(function (x) { return x.id === s.id; })[0].extra; });
      assert.strictEqual(wingers.length, 2);
      var far = wingers.filter(function (s) { return s.id === play.key; })[0], near = wingers.filter(function (s) { return s.id !== play.key; })[0];
      assert.ok(Math.abs(far.a - now.puck.a) > 35, "the far winger is on the other side of the ice");
      assert.ok(Math.abs(near.a - now.puck.a) < 16, "the near winger is close to the puck");
      assert.ok(near.d < R.BLUE - 2, "the near winger is clearly behind the line");
      if (kind === "offside-far") {
        assert.strictEqual(r.who, play.key);
        assert.ok(/whole blue line/.test(R.explain(play, r)), "the words say to watch the whole line");
      }
    }
  });
});

test("who carries, passes and shoots changes from play to play", function () {
  var dice = G.makeDice(12);
  ["offside-carry", "onside-pass", "offside-dump", "onside-again", "icing", "pass-caught", "carrier-first"].forEach(function (kind) {
    var jobs = {}, speeds = [];
    for (var i = 0; i < 200; i++) {
      var play = R.makePlay(kind, 2, dice), first = play.touches.filter(function (x) { return x.team === "att"; })[0];
      jobs[play.skaters.filter(function (s) { return s.id === first.who; })[0].label] = true;
      speeds.push(play.duration);
    }
    assert.deepStrictEqual(Object.keys(jobs).sort(), ["C", "D", "W"], kind + ": the puck is always with the same player");
    assert.ok(Math.max.apply(null, speeds) - Math.min.apply(null, speeds) > 0.5, kind + " always takes the same time");
  });
});

test("one to three extra skaters, and they never change the call", function () {
  var dice = G.makeDice(404), counts = {};
  KIND_NAMES.forEach(function (kind) {
    [1, 2, 3].forEach(function (level) {
      for (var i = 0; i < 150; i++) {
        var play = R.makePlay(kind, level, dice), r = R.judge(play);
        var extras = play.skaters.filter(function (s) { return s.extra; });
        assert.ok(extras.length >= 1 && extras.length <= 3, kind + " has " + extras.length + " extra skaters");
        counts[extras.length] = true;
        assert.ok(play.skaters.filter(function (s) { return s.team === "att"; }).length <= 5, "at most five blue skaters");
        assert.ok(play.skaters.filter(function (s) { return s.team === "def"; }).length <= 5, "at most five red skaters");
        // Nobody plays the puck except the players the play is about.
        extras.forEach(function (s) {
          assert.ok(play.touches.every(function (x) { return x.who !== s.id; }));
          for (var t = 0; t <= play.duration; t += 0.1) {
            var me = R.where(play.tracks[s.id], t), puck = R.where(play.tracks.puck, t);
            if (s.team === "att") assert.ok(me.d < R.BLUE - 10, "an extra blue skater stays well behind the blue line");
            assert.ok(Math.sqrt(Math.pow(me.a - puck.a, 2) + Math.pow(me.d - puck.d, 2)) > 8, "an extra skater is never near the puck");
          }
        });
        // The same play without them gets the very same call.
        var bare = Object.assign({}, play, { skaters: play.skaters.filter(function (s) { return !s.extra; }) });
        var b = R.judge(bare);
        assert.strictEqual(b.call, r.call);
        assert.strictEqual(b.reason, r.reason);
        assert.strictEqual(b.who, r.who);
        assert.ok(Math.abs(b.t - r.t) < 1e-9);
      }
    });
  });
  assert.deepStrictEqual(Object.keys(counts).sort(), ["1", "2", "3"]);
});

// ---------- Dealing the plays --------------------------------------------
test("each level has its kinds, and about half of them need a whistle", function () {
  var before = 0;
  [1, 2, 3].forEach(function (level) {
    var kinds = R.kindsFor(level), whistles = kinds.filter(function (k) { return R.KINDS[k].call !== "ok"; }).length;
    assert.ok(kinds.length >= before + 5, "level " + level + " should add at least five kinds");
    assert.ok(Math.abs(whistles / kinds.length - 0.5) <= 0.06, "level " + level + ": " + whistles + " of " + kinds.length + " kinds need a whistle");
    kinds.forEach(function (k) { assert.ok(R.KINDS[k].level <= level); });
    before = kinds.length;
  });
  assert.strictEqual(R.kindsFor(3).length, KIND_NAMES.length);
  // Level 1 only has calls that are plain to see, never the rule exceptions.
  ["carrier-first", "defender-back", "offside-reach", "icing-shorthanded", "offside-again", "offside-far"].forEach(function (k) {
    assert.ok(R.kindsFor(1).indexOf(k) < 0);
  });
});

test("a deck of plays: every kind once before any comes back, none twice within three plays", function () {
  for (var seed = 1; seed <= 60; seed++) {
    [1, 2, 3].forEach(function (level) {
      var dice = G.makeDice(seed * 13 + level), deck = R.makeDeck(level), kinds = R.kindsFor(level), dealt = [], whistles = 0;
      for (var i = 0; i < 40; i++) {
        var play = R.deal(deck, dice);
        assert.strictEqual(play.level, level);
        assert.ok(kinds.indexOf(play.kind) >= 0, play.kind + " does not belong to level " + level);
        // Not the same kind as any of the three plays before it.
        dealt.slice(-3).forEach(function (k) { assert.notStrictEqual(k, play.kind, play.kind + " came back too soon (level " + level + ")"); });
        dealt.push(play.kind);
        if (R.KINDS[play.kind].call !== "ok") whistles++;
      }
      // Every kind of the level is in the 40 plays.
      kinds.forEach(function (k) { assert.ok(dealt.indexOf(k) >= 0, k + " never came up at level " + level); });
      // The first time through the deck, no kind comes twice.
      var firstRound = dealt.slice(0, kinds.length);
      assert.strictEqual(Object.keys(firstRound.reduce(function (set, k) { set[k] = true; return set; }, {})).length, kinds.length);
      assert.ok(whistles >= 14 && whistles <= 26, whistles + " of 40 needed a whistle at level " + level);
    });
  }
});

test("a new deck after a level switch does not repeat what you just saw", function () {
  var dice = G.makeDice(8), deck = R.makeDeck(1), seen = [];
  for (var i = 0; i < 7; i++) seen.push(R.deal(deck, dice).kind);
  for (var round = 0; round < 200; round++) {
    var next = R.makeDeck(2, seen.slice(-3)), kinds = [];
    for (var j = 0; j < 3; j++) kinds.push(R.deal(next, dice).kind);
    assert.ok(kinds.indexOf(seen[6]) < 0, "the last kind came right back");
    assert.ok(kinds.slice(0, 2).indexOf(seen[5]) < 0 && kinds[0] !== seen[4]);
  }
});

console.log("All referee tests passed!");
