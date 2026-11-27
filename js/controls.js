// =====================================================================
//  controls.js  --  HOW YOU STEER YOUR SKATER IN THE LIVE GAME
//
//  Three ways to play, and they all end up as the same two things:
//      an ARROW   which way to skate, and how hard (never longer than 1)
//      BUTTONS    pass, shoot, call for a pass, the quick move, pause
//
//      Keyboard     W A S D (or the arrow keys) to skate.
//                   The last key of each row for the buttons:
//                     -  pass (a stick check when they have the puck)
//                     P  shoot      L  call for a pass      M  quick move
//                   Esc pauses.
//      Touch        A joystick appears under your thumb on the left
//                   side; four buttons are on the right.
//      Controller   The left stick, and A (pass), B or X (shoot),
//                   Y (call), the right bumper (quick move), Start (pause).
//
//  We read keys by WHERE they sit on the keyboard ("the key right of
//  0"), not by the letter printed on them. So it works the same on a
//  keyboard for another language.
//
//  The first part is plain math, so "node" can test it:
//      node tests/controls.test.js
//  The second part runs only in the browser: it listens to the keys,
//  the fingers and the controller.
// =====================================================================
(function () {
  "use strict";

  // ---------- The math ---------------------------------------------------
  // An arrow on the SCREEN: x = to the right, y = down. Never longer than 1.
  function shorten(v) {
    var n = Math.sqrt(v.x * v.x + v.y * v.y);
    return n > 1 ? { x: v.x / n, y: v.y / n } : v;
  }
  function lengthOf(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }

  // Which keys do what.
  var MOVE_KEYS = {
    KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0]
  };
  var ACTION_KEYS = { Minus: "pass", NumpadSubtract: "pass", KeyP: "shoot", KeyL: "call", KeyM: "burst", Escape: "pause" };
  // The buttons of a standard game controller, by their number.
  var PAD_BUTTONS = { 0: "pass", 1: "shoot", 2: "shoot", 3: "call", 5: "burst", 9: "pause" };

  // The arrow from the keys that are held down.
  //   down = { KeyW: true, KeyD: true, ... }
  // Two keys at once (up and right) is a slanted arrow of length 1, so
  // skating on a slant is not faster than skating straight.
  function fromKeys(down) {
    var x = 0, y = 0;
    Object.keys(MOVE_KEYS).forEach(function (code) { if (down[code]) { x += MOVE_KEYS[code][0]; y += MOVE_KEYS[code][1]; } });
    // (W and the up arrow together still count once.)
    return shorten({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
  }

  // The arrow from a touch joystick.
  //   dx, dy = how far the thumb is from where it first touched (pixels)
  //   radius = how far it can go (pixels)
  //   dead   = the part in the middle where nothing happens yet (0 to 1),
  //            so a resting thumb does not make the skater creep
  function fromStick(dx, dy, radius, dead) {
    dead = dead === undefined ? 0.15 : dead;
    var n = Math.sqrt(dx * dx + dy * dy), start = radius * dead;
    if (!radius || n <= start) return { x: 0, y: 0 };
    var hard = Math.min(1, (n - start) / (radius - start));
    return { x: dx / n * hard, y: dy / n * hard };
  }

  // The arrow from a controller's stick (it already gives -1 to 1).
  // Old sticks do not rest exactly in the middle, so a small dead part.
  function fromPad(x, y, dead) {
    return fromStick(x || 0, y || 0, 1, dead === undefined ? 0.18 : dead);
  }

  // The longest of several arrows: whichever control you are really using.
  function strongest(list) {
    var best = { x: 0, y: 0 };
    list.forEach(function (v) { if (v && lengthOf(v) > lengthOf(best)) best = v; });
    return best;
  }

  // Turn a screen arrow into a rink arrow { a: across, d: up the ice }.
  //   The rink lies on its side on a wide screen: "up the ice" is to the
  //   right, and "across" grows downward.
  //   On a phone the rink stands up: "up the ice" is up the screen, and
  //   "across" is to the right.
  function toRink(v, upright) {
    return upright ? { a: v.x, d: -v.y || 0 } : { a: v.y, d: v.x };
  }

  var api = { MOVE_KEYS: MOVE_KEYS, ACTION_KEYS: ACTION_KEYS, PAD_BUTTONS: PAD_BUTTONS,
              fromKeys: fromKeys, fromStick: fromStick, fromPad: fromPad, strongest: strongest, toRink: toRink };

  // In "node" (our tests) there is no page: hand over the math and stop.
  if (typeof document === "undefined") { module.exports = api; return; }

  // =================== The browser part ==============================
  var down = {};            // the keys held down right now
  var pressed = {};         // buttons pressed since the game last asked
  var stick = null;         // the touch joystick: { id, x0, y0, dx, dy } while a thumb is down
  var padWas = {};          // which controller buttons were down last time
  var opts = { active: function () { return false; } };
  var STICK_RADIUS = 46;    // pixels the thumb can travel

  function press(action) { pressed[action] = true; }
  // Typing in a box on the page must stay typing.
  function typing(target) { return !!target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName); }

  window.addEventListener("keydown", function (ev) {
    if (!opts.active() || typing(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (MOVE_KEYS[ev.code]) { down[ev.code] = true; ev.preventDefault(); }
    else if (ACTION_KEYS[ev.code]) { if (!ev.repeat) press(ACTION_KEYS[ev.code]); ev.preventDefault(); }
  });
  window.addEventListener("keyup", function (ev) { delete down[ev.code]; });
  // The window lost the keyboard (another tab, another program): let go of everything.
  window.addEventListener("blur", function () { down = {}; });

  // The joystick: the whole left area is the stick. It appears where the thumb lands.
  function drawStick() {
    if (!opts.base) return;
    opts.base.classList.toggle("on", !!stick);
    if (!stick) return;
    var box = opts.stickArea.getBoundingClientRect();
    opts.base.style.transform = "translate(" + (stick.x0 - box.left) + "px," + (stick.y0 - box.top) + "px)";
    var n = Math.sqrt(stick.dx * stick.dx + stick.dy * stick.dy), k = n > STICK_RADIUS ? STICK_RADIUS / n : 1;
    opts.knob.style.transform = "translate(" + stick.dx * k + "px," + stick.dy * k + "px)";
  }
  function stickDown(ev) {
    if (stick || !opts.active()) return;
    ev.preventDefault();
    stick = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, dx: 0, dy: 0 };
    try { opts.stickArea.setPointerCapture(ev.pointerId); } catch (e) { /* fine */ }
    drawStick();
  }
  function stickMove(ev) {
    if (!stick || ev.pointerId !== stick.id) return;
    stick.dx = ev.clientX - stick.x0; stick.dy = ev.clientY - stick.y0;
    drawStick();
  }
  function stickUp(ev) {
    if (!stick || ev.pointerId !== stick.id) return;
    stick = null;
    drawStick();
  }

  // Tell this file where the touch controls are.
  //   o.active()   -> true while the game is being played
  //   o.stickArea  the area for the left thumb; o.base, o.knob = the joystick's two circles
  //   o.buttons    { pass: element, shoot: element, call: element, burst: element }
  api.attach = function (o) {
    opts = o;
    if (o.stickArea) {
      o.stickArea.addEventListener("pointerdown", stickDown);
      o.stickArea.addEventListener("pointermove", stickMove);
      o.stickArea.addEventListener("pointerup", stickUp);
      o.stickArea.addEventListener("pointercancel", stickUp);
    }
    Object.keys(o.buttons || {}).forEach(function (action) {
      var b = o.buttons[action];
      // (pointerdown, not click: the puck must go the moment the thumb lands.)
      b.addEventListener("pointerdown", function (ev) { ev.preventDefault(); if (o.active()) press(action); });
      // A button reached with the Tab key and pressed with Enter or Space.
      b.addEventListener("click", function (ev) { if (ev.detail === 0 && o.active()) press(action); });
    });
  };

  // The game asks, once per picture: what is the player doing?
  //   upright = is the rink standing up (a phone)?
  // Returns { move: { a, d }, pass, shoot, call, burst, pause }. A button
  // is true only once per press.
  api.read = function (upright) {
    var arrows = [fromKeys(down)];
    if (stick) arrows.push(fromStick(stick.dx, stick.dy, STICK_RADIUS));
    // A controller, if one is plugged in.
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      if (!pad || !pad.connected) continue;
      arrows.push(fromPad(pad.axes[0], pad.axes[1]));
      var now = {};
      Object.keys(PAD_BUTTONS).forEach(function (n) {
        var b = pad.buttons[n];
        now[n] = !!(b && b.pressed);
        if (now[n] && !(padWas[pad.index] || {})[n] && opts.active()) press(PAD_BUTTONS[n]);
      });
      padWas[pad.index] = now;
    }
    var out = { move: toRink(strongest(arrows), upright) };
    ["pass", "shoot", "call", "burst", "pause"].forEach(function (a) { out[a] = !!pressed[a]; });
    pressed = {};
    return out;
  };
  // Forget everything that is held (when the game pauses or ends).
  api.letGo = function () { down = {}; pressed = {}; stick = null; drawStick(); };

  window.CoachControls = api;
})();
