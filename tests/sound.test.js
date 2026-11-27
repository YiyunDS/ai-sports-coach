// Tests for js/sound.js (the referee's whistle in the live Game).
// Run with:  node tests/sound.test.js
var S = require("../js/sound.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= (tol || 1e-9), (msg || "") + " got " + a + ", wanted " + b); }

test("sound is on unless you turned it off", function () {
  assert.strictEqual(S.pick("off"), false);
  assert.strictEqual(S.pick("on"), true);
  assert.strictEqual(S.pick(null), true);        // nothing saved yet
  assert.strictEqual(S.pick(undefined), true);
  assert.strictEqual(S.pick("OFF"), true);       // a wrong spelling is not "off"
  assert.strictEqual(S.pick(""), true);
});

var KINDS = ["offside", "icing", "cover", "goal", "end"];
test("every whistle is short, quiet, and sounds like a whistle", function () {
  KINDS.concat(["something new"]).forEach(function (kind) {
    var w = S.whistle(kind);
    assert.ok(w.seconds >= 0.3 && w.seconds <= 1, kind + " lasts " + w.seconds);
    assert.ok(w.peak > 0.03 && w.peak <= 0.2, kind + " is too loud or too quiet: " + w.peak);
    assert.strictEqual(w.notes.length, 2);
    // A referee's whistle is high: between about 2,000 and 4,000 hertz.
    w.notes.forEach(function (hz) { assert.ok(hz >= 2000 && hz <= 4000, hz + " Hz"); });
    // The two notes are close together (that makes the rough edge), but not the same.
    var apart = Math.abs(w.notes[0] - w.notes[1]);
    assert.ok(apart > 40 && apart < 300, "the notes are " + apart + " Hz apart");
    // The flutter is fast enough to be a rattle, and never makes the sound go fully silent.
    assert.ok(w.flutter >= 20 && w.flutter <= 60 && w.depth > 0 && w.depth < 1);
    assert.ok(w.attack + w.release < w.seconds / 2, "it must hold for most of its length");
  });
});
test("a goal gets a longer whistle, and the end of the game the longest", function () {
  assert.ok(S.whistle("goal").seconds > S.whistle("offside").seconds);
  assert.ok(S.whistle("end").seconds > S.whistle("goal").seconds);
  assert.strictEqual(S.whistle("icing").seconds, S.whistle("cover").seconds);
});
test("the loudness starts at nothing, holds at the top, and ends at nothing", function () {
  KINDS.forEach(function (kind) {
    var w = S.whistle(kind);
    assert.strictEqual(S.loudness(w, 0), 0);
    assert.strictEqual(S.loudness(w, -1), 0);
    assert.strictEqual(S.loudness(w, w.seconds), 0);
    assert.strictEqual(S.loudness(w, w.seconds + 5), 0);
    near(S.loudness(w, w.attack / 2), w.peak / 2);                 // halfway up
    near(S.loudness(w, w.seconds / 2), w.peak);                    // the top
    near(S.loudness(w, w.seconds - w.release / 2), w.peak / 2);    // halfway down
    // It never gets louder than the top.
    for (var t = 0; t <= w.seconds; t += 0.003) assert.ok(S.loudness(w, t) <= w.peak + 1e-12);
  });
});

console.log("All sound tests passed!");
