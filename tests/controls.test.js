// Tests for js/controls.js (keys, joystick and controller of the live Game).
// Run with:  node tests/controls.test.js
var C = require("../js/controls.js");
var assert = require("assert");

function test(name, fn) { fn(); console.log("OK  " + name); }
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= (tol || 1e-9), (msg || "") + " got " + a + ", wanted " + b); }
function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }

// ---- The keyboard ----
test("W A S D and the arrow keys give the same arrows", function () {
  assert.deepStrictEqual(C.fromKeys({}), { x: 0, y: 0 });
  assert.deepStrictEqual(C.fromKeys({ KeyW: true }), { x: 0, y: -1 });       // up the screen
  assert.deepStrictEqual(C.fromKeys({ KeyS: true }), { x: 0, y: 1 });
  assert.deepStrictEqual(C.fromKeys({ KeyA: true }), { x: -1, y: 0 });
  assert.deepStrictEqual(C.fromKeys({ KeyD: true }), { x: 1, y: 0 });
  [["KeyW", "ArrowUp"], ["KeyS", "ArrowDown"], ["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]].forEach(function (pair) {
    var a = {}, b = {}; a[pair[0]] = true; b[pair[1]] = true;
    assert.deepStrictEqual(C.fromKeys(a), C.fromKeys(b));
  });
});
test("two keys at once: a slanted arrow, but not a faster one", function () {
  var v = C.fromKeys({ KeyW: true, KeyD: true });
  near(len(v), 1); near(v.x, Math.SQRT1_2); near(v.y, -Math.SQRT1_2);
  // Opposite keys cancel. A key and its arrow twin count once.
  assert.deepStrictEqual(C.fromKeys({ KeyA: true, KeyD: true }), { x: 0, y: 0 });
  assert.deepStrictEqual(C.fromKeys({ KeyW: true, ArrowUp: true }), { x: 0, y: -1 });
  // Keys we do not know do nothing.
  assert.deepStrictEqual(C.fromKeys({ KeyQ: true, Space: true }), { x: 0, y: 0 });
});
test("the buttons are the last key of each row: - P L M, and the space bar takes", function () {
  assert.strictEqual(C.ACTION_KEYS.Space, "take");
  // Only ONE key takes, and the key that passes does not.
  var takers = Object.keys(C.ACTION_KEYS).filter(function (k) { return C.ACTION_KEYS[k] === "take"; });
  assert.deepStrictEqual(takers, ["Space"]);
  assert.strictEqual(C.ACTION_KEYS.Minus, "pass");
  assert.strictEqual(C.ACTION_KEYS.KeyP, "shoot");
  assert.strictEqual(C.ACTION_KEYS.KeyL, "call");
  assert.strictEqual(C.ACTION_KEYS.KeyM, "burst");
  assert.strictEqual(C.ACTION_KEYS.Escape, "pause");
  // No key is both a skating key and a button.
  Object.keys(C.ACTION_KEYS).forEach(function (k) { assert.ok(!(k in C.MOVE_KEYS), k); });
});

// ---- The touch joystick ----
test("the joystick: nothing in the middle, full speed at the edge, never more", function () {
  assert.deepStrictEqual(C.fromStick(0, 0, 46), { x: 0, y: 0 });
  assert.deepStrictEqual(C.fromStick(3, -4, 46), { x: 0, y: 0 });            // a resting thumb (inside the dead part)
  var edge = C.fromStick(46, 0, 46);
  near(edge.x, 1); near(edge.y, 0);
  var past = C.fromStick(0, -300, 46);                                       // the thumb slid far away
  near(past.y, -1); near(len(past), 1);
  var half = C.fromStick(0, 46 * 0.575, 46);                                 // halfway between the dead part and the edge
  near(half.y, 0.5, 1e-9);
  // The direction is the thumb's direction.
  var slant = C.fromStick(30, 40, 46);
  near(slant.x / slant.y, 30 / 40); assert.ok(len(slant) <= 1);
  // It grows smoothly: a little farther is a little faster.
  var last = 0;
  for (var d = 0; d <= 60; d += 2) { var now = len(C.fromStick(d, 0, 46)); assert.ok(now >= last); last = now; }
  assert.deepStrictEqual(C.fromStick(10, 10, 0), { x: 0, y: 0 }, "no size, no arrow (and no dividing by zero)");
});

// ---- A game controller ----
test("a controller's stick: a small dead part, then up to full", function () {
  assert.deepStrictEqual(C.fromPad(0.1, -0.1), { x: 0, y: 0 });              // an old stick that does not rest in the middle
  near(C.fromPad(1, 0).x, 1);
  near(len(C.fromPad(1, 1)), 1, 1e-9, "a stick pushed into the corner is still length 1");
  assert.deepStrictEqual(C.fromPad(undefined, undefined), { x: 0, y: 0 });
  assert.strictEqual(C.PAD_BUTTONS[0], "pass");
  assert.strictEqual(C.PAD_BUTTONS[1], "shoot");
  assert.strictEqual(C.PAD_BUTTONS[2], "take");
  assert.strictEqual(C.PAD_BUTTONS[9], "pause");
  // Every button of the game can be reached from the keyboard and from a controller.
  C.ACTIONS.forEach(function (action) {
    assert.ok(Object.keys(C.ACTION_KEYS).some(function (k) { return C.ACTION_KEYS[k] === action; }), "no key for " + action);
    assert.ok(Object.keys(C.PAD_BUTTONS).some(function (k) { return C.PAD_BUTTONS[k] === action; }), "no controller button for " + action);
  });
});

// ---- Putting it together ----
test("the control you are really using wins", function () {
  var keys = C.fromKeys({ KeyD: true }), resting = C.fromStick(2, 2, 46);
  assert.deepStrictEqual(C.strongest([resting, keys]), keys);
  assert.deepStrictEqual(C.strongest([{ x: 0, y: 0 }, null]), { x: 0, y: 0 });
  var soft = { x: 0.3, y: 0 }, hard = { x: 0, y: -0.9 };
  assert.deepStrictEqual(C.strongest([soft, hard]), hard);
});
test("screen arrows become rink arrows: the rink lies down on a wide screen and stands up on a phone", function () {
  var up = { x: 0, y: -1 }, right = { x: 1, y: 0 };
  // Wide screen: their net is on the right. Right = up the ice; up the screen = toward the left boards.
  assert.deepStrictEqual(C.toRink(right, false), { a: 0, d: 1 });
  assert.deepStrictEqual(C.toRink(up, false), { a: -1, d: 0 });
  // Phone: their net is at the top. Up the screen = up the ice; right = toward the right boards.
  assert.deepStrictEqual(C.toRink(up, true), { a: 0, d: 1 });
  assert.deepStrictEqual(C.toRink(right, true), { a: 1, d: 0 });
  // The length never changes.
  var v = C.fromStick(20, -30, 46), r1 = C.toRink(v, false), r2 = C.toRink(v, true);
  near(Math.sqrt(r1.a * r1.a + r1.d * r1.d), len(v)); near(Math.sqrt(r2.a * r2.a + r2.d * r2.d), len(v));
});

console.log("All controls tests passed!");
