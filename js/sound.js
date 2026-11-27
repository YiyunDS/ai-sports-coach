// =====================================================================
//  sound.js  --  THE REFEREE'S WHISTLE
//
//  The live Game has a referee, and a referee has a whistle. There is
//  no sound FILE: the browser makes the sound itself from a recipe of
//  numbers (below). So nothing is downloaded and nothing is borrowed.
//
//  HOW A WHISTLE SOUNDS, AND HOW WE BUILD IT
//    * Two high notes very close together. Close notes "beat" against
//      each other, and that gives a whistle its sharp, rough edge.
//    * A fast flutter in the loudness, like the little ball rolling
//      around inside a referee's whistle.
//    * It starts quickly, holds, and stops quickly.
//
//  The "Sound" button in the Game turns it off. The choice is kept on
//  this device, like the look of the page.
//
//  The first part is plain numbers, so "node" can test it:
//      node tests/sound.test.js
// =====================================================================
(function () {
  "use strict";
  var KEY = "coach-sound";   // the name we save the choice under

  // Sound is ON unless you turned it off.
  function pick(saved) { return saved !== "off"; }

  // The recipe for one whistle.
  //   kind = why the referee blows: "offside", "icing", "cover" (the
  //   goalie has the puck), "goal" (a longer one), "end" (the longest)
  function whistle(kind) {
    var seconds = kind === "end" ? 0.9 : kind === "goal" ? 0.6 : 0.4;
    return {
      seconds: seconds,
      notes: [2150, 2290],     // the two notes, in hertz (how many shakes per second)
      flutter: 38,             // the flutter: this many times per second...
      depth: 0.5,              // ...the loudness dips by this much (0 = no flutter)
      peak: 0.12,              // how loud, where 1 is as loud as the device can go
      attack: 0.012,           // seconds to get loud
      release: 0.06            // seconds to fade out
    };
  }
  // How loud is the whistle t seconds after it starts (without the flutter)?
  function loudness(recipe, t) {
    if (t <= 0 || t >= recipe.seconds) return 0;
    if (t < recipe.attack) return recipe.peak * t / recipe.attack;
    if (t > recipe.seconds - recipe.release) return recipe.peak * (recipe.seconds - t) / recipe.release;
    return recipe.peak;
  }

  var api = { KEY: KEY, pick: pick, whistle: whistle, loudness: loudness };

  // In "node" (our tests) there is no page: hand over the numbers and stop.
  if (typeof document === "undefined") { module.exports = api; return; }

  // =================== The browser part ==============================
  var on = true;
  try { on = pick(window.localStorage.getItem(KEY)); } catch (e) { /* a private window: sound stays on */ }
  var ctx = null;            // the browser's sound maker, made on your first tap
  var listeners = [];

  // Put one whistle into a sound maker, starting at "when" seconds.
  // (Used for the real sound, and by our check that measures it.)
  function build(audio, recipe, when) {
    var out = audio.createGain(), flutter = audio.createGain(), lfo = audio.createOscillator(), wobble = audio.createGain();
    // The loudness: up fast, hold, down fast.
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(recipe.peak, when + recipe.attack);
    out.gain.setValueAtTime(recipe.peak, when + recipe.seconds - recipe.release);
    out.gain.linearRampToValueAtTime(0, when + recipe.seconds);
    // The flutter: the loudness goes up and down "flutter" times a second.
    flutter.gain.value = 1 - recipe.depth / 2;
    lfo.frequency.value = recipe.flutter;
    wobble.gain.value = recipe.depth / 2;
    lfo.connect(wobble); wobble.connect(flutter.gain);
    lfo.start(when); lfo.stop(when + recipe.seconds);
    // The two notes (each at half strength, so together they are "peak").
    recipe.notes.forEach(function (hz) {
      var note = audio.createOscillator(), half = audio.createGain();
      note.type = "triangle";
      note.frequency.value = hz;
      half.gain.value = 0.5;
      note.connect(half); half.connect(flutter);
      note.start(when); note.stop(when + recipe.seconds);
    });
    flutter.connect(out); out.connect(audio.destination);
  }

  // A browser only lets a page make sound after you have tapped or
  // pressed something. The Game calls this on your first tap.
  api.wake = function () {
    try {
      var Maker = window.AudioContext || window.webkitAudioContext;
      if (!ctx && Maker) ctx = new Maker();
      if (ctx && ctx.state === "suspended") ctx.resume();
    } catch (e) { ctx = null; }       // no sound on this device: the game stays silent
  };
  // Blow the whistle. Returns true if a sound was started.
  api.blow = function (kind) {
    if (!on || !ctx || ctx.state !== "running" || document.hidden) return false;
    try { build(ctx, whistle(kind), ctx.currentTime + 0.01); } catch (e) { return false; }
    api.blown++;
    return true;
  };
  api.blown = 0;             // how many whistles were started (for checking)
  api.build = build;
  api.on = function () { return on; };
  api.onChange = function (fn) { listeners.push(fn); };
  api.set = function (next) {
    on = !!next;
    try { window.localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* not saved; it still changes */ }
    listeners.forEach(function (fn) { fn(on); });
  };

  window.CoachSound = api;
})();
