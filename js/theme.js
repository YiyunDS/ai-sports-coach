// =====================================================================
//  theme.js  --  THE TWO LOOKS OF THE PAGE
//
//  The page can wear two "coats of paint":
//     rink    = the look it always had: a dark arena, blue and orange
//     sunset  = an outdoor rink at sunset: purple, teal and hot pink
//
//  The colors of the PAGE (buttons, panels, words) live in style.css.
//  This file holds the colors that JAVASCRIPT needs: the 3D rink, the
//  two 3D skaters, their signs, and the lines we draw on the video.
//  A few colors are in both places (blue = pro, orange = you, the three
//  grades). tests/theme.test.js checks that the two lists agree.
//
//  The first part is plain math and lists, so "node" can test it.
//  The second part runs only in the browser: it remembers your choice
//  on this device and tells the other files when you switch.
// =====================================================================
(function () {
  "use strict";

  var THEMES = {
    // ---------------- RINK: the look the page always had ----------------
    rink: {
      label: "Rink",
      // The same colors as at the top of style.css.
      css: { bg: "#0b0f14", panel: "#121922", fg: "#e8eef5", muted: "#8d9db2",
             ref: "#4da3ff", refInk: "#06182b", you: "#ff9f43",
             good: "#2fbf71", close: "#e6b422", far: "#ef5350" },
      // The signs next to the skaters, and the rings around graded joints.
      signs: { pro: "#4da3ff", you: "#ff9f43", good: "#2fbf71", close: "#e6b422", far: "#ef5350", none: "#263344",
               elbow: "#cbd5e1", plate: "rgba(10,14,20,0.9)", text: "#f2f6fa" },
      rings: { good: 0x22c55e, close: 0xfacc15, far: 0xef4444, none: 0xc3ccd6 },
      ghost: 0x5aa9ff,   // the see-through skater in Overlay mode
      // What we draw on top of the video.
      overlay: { box: "#ff9f43", dot: "#ff9f43", bone: "#ffffff", search: "rgba(255,255,255,0.7)" },
      scene: {
        outdoor: false,                       // no sky, no sun, no palm trees
        background: 0x0a0e13,
        haze: [0x0a0e13, 18, 46],             // color, where it starts, where it is thickest (meters)
        skyLight: [0xdfe9f5, 0x28323d, 0.5],  // from above, from below, how strong
        mainLight: [0xffffff, 2.2, [3, 10, 5]],     // color, how strong, where it hangs
        backLight: [0xbcd4ff, 1.1, [-5, 5, -7]],
        sideLight: null,
        room: 0.55,                           // how strong the soft reflections are
        boards: 0xf1f3f5, kick: 0xc99a2e, rail: 0x15233a, railGlow: null,
        glass: 0xd6e6f2, posts: 0x8b96a3, floor: 0x0c1117,
        ice: "#e5ecf1", iceShade: "160,180,200", iceMarks: "120,145,170", iceWarm: null
      },
      // The outfits. "null" means: keep the color the model came with.
      pro: { nameColor: "#4da3ff", jersey: 0x2f6fc0, trim: 0x0e2240, stripe: null, pants: 0x14213a,
             helmet: 0x0e2240, glove: 0x14213a, cage: null, stick: 0x23272e, tape: 0x0d0f12, laces: null, visor: false },
      you: { nameColor: "#ff9f43", jersey: 0xe57f22, trim: 0x2a1606, stripe: null, pants: 0x1b1d22,
             helmet: 0x1b1d22, glove: 0x1b1d22, cage: null, stick: 0x23272e, tape: 0x0d0f12, laces: null, visor: false }
    },

    // ---------------- SUNSET: an outdoor rink at sunset ----------------
    // The idea of the colors (purple dusk, teal, hot pink, a low sun and
    // palm trees) comes from the 1980s-Miami look of the "Vice City"
    // games. Nothing from the games is used: see SOURCES.md.
    sunset: {
      label: "Sunset",
      css: { bg: "#120a1f", panel: "#1a1030", fg: "#f4ecfa", muted: "#a898c4",
             ref: "#2fd6d9", refInk: "#04262b", you: "#ff5fa8",
             good: "#3ddc8f", close: "#ffd24a", far: "#ff5a3d" },
      signs: { pro: "#2fd6d9", you: "#ff5fa8", good: "#3ddc8f", close: "#ffd24a", far: "#ff5a3d", none: "#3b2a5e",
               elbow: "#d9cdea", plate: "rgba(24,12,40,0.9)", text: "#fbf5ff" },
      rings: { good: 0x3ddc8f, close: 0xffd24a, far: 0xff5a3d, none: 0xd8cbe6 },
      ghost: 0x45e0e3,
      overlay: { box: "#ff5fa8", dot: "#ff5fa8", bone: "#ffffff", search: "rgba(255,255,255,0.7)" },
      scene: {
        outdoor: true,
        background: 0xe8607f,
        haze: [0xe8607f, 24, 78],
        skyLight: [0xffb7d2, 0x2a1a4a, 0.75],
        mainLight: [0xffd9b8, 2.0, [5, 9, 6]],     // warm light, like the last sun on your face
        backLight: [0xff6f9c, 1.5, [3, 3.5, -9]],  // pink light from where the sun sets
        sideLight: [0x45e0e3, 0.55, [-7, 4, 5]],   // a little teal from the other side
        room: 0.5,
        boards: 0xf7f1f7, kick: 0xff3d8f, rail: 0x0b3b40, railGlow: [0x2ff3f0, 1.6],
        glass: 0xffd6ec, posts: 0xd9c7e6, floor: 0x1f1233,
        ice: "#f3e9f1", iceShade: "196,160,200", iceMarks: "168,132,176", iceWarm: ["255,170,120", "150,120,230"],
        // The sky, from the horizon up to straight above: [how high (0 to 1), color].
        sky: [[0, "#e8607f"], [0.05, "#ef6f86"], [0.12, "#d9488a"], [0.24, "#93308f"], [0.42, "#4a1f7a"], [0.7, "#231552"], [1, "#140c33"]],
        sun: { at: [0.42, 0.105, -0.9], core: "#fff3c4", edge: "#ffb45e", glow: "255,140,90" },
        palms: "#1d0c30"
      },
      pro: { nameColor: "#2fd6d9", jersey: 0x10aebb, trim: 0x2a1250, stripe: 0xffb7dc, pants: 0x24133f,
             helmet: 0xf4f0f7, glove: 0xf4f0f7, cage: null, stick: 0xf2edf6, tape: 0xff3d8f, laces: 0xff5fa8, visor: true },
      you: { nameColor: "#ff5fa8", jersey: 0xf2408f, trim: 0x2a1250, stripe: 0xb5f4f5, pants: 0x24133f,
             helmet: 0xf4f0f7, glove: 0xf4f0f7, cage: 0xe9e4ee, stick: 0xf2edf6, tape: 0x16b9c4, laces: 0x2fd6d9, visor: false }
    }
  };
  var FIRST = "rink";            // the look a new visitor gets
  var KEY = "coach-theme";       // the name we save the choice under

  // Which look to use, from what was saved. Anything we do not know
  // (nothing saved, an old name, a typo) gives the first look.
  function pick(saved) {
    return (typeof saved === "string" && Object.prototype.hasOwnProperty.call(THEMES, saved)) ? saved : FIRST;
  }

  // ---- Color math, to check that words can be read ----
  // "#rrggbb" -> [red, green, blue], each from 0 to 1.
  function rgb(hexColor) {
    var n = parseInt(String(hexColor).replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  // How bright a color looks to the eye, from 0 (black) to 1 (white).
  // (Green counts most, blue least. This is the standard formula that
  // the rules for readable web pages use.)
  function brightness(hexColor) {
    var c = rgb(hexColor).map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // The reading contrast of two colors: 1 = the same, 21 = black on white.
  // Normal text needs at least 4.5.
  function contrast(a, b) {
    var x = brightness(a), y = brightness(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // Where a color sits on the color wheel, in degrees (red = 0, green = 120, blue = 240).
  function hue(hexColor) {
    var c = rgb(hexColor), max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]), d = max - min, h;
    if (d === 0) return 0;
    if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
    else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
    else h = (c[0] - c[1]) / d + 4;
    return (h * 60 + 360) % 360;
  }
  // How far apart two colors are on the wheel (0 to 180 degrees).
  function hueApart(a, b) {
    var d = Math.abs(hue(a) - hue(b)) % 360;
    return d > 180 ? 360 - d : d;
  }

  var api = { THEMES: THEMES, FIRST: FIRST, KEY: KEY, pick: pick, contrast: contrast, hue: hue, hueApart: hueApart };

  // In "node" (our tests) there is no page: hand over the math and stop.
  if (typeof document === "undefined") { module.exports = api; return; }

  // =================== The browser part ==============================
  // Read the saved choice. (A browser may refuse, for example in a
  // private window. Then we simply use the first look.)
  function saved() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  var name = pick(saved());
  var listeners = [];

  // Put the look on the page: style.css reads data-theme on <html>.
  function show() {
    var html = document.documentElement;
    if (name === FIRST) html.removeAttribute("data-theme"); else html.setAttribute("data-theme", name);
    // The color of the browser's own bar on a phone.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEMES[name].css.bg);
  }
  show();

  api.name = function () { return name; };
  api.now = function () { return THEMES[name]; };
  // Other files ask to be told when the look changes.
  api.onChange = function (fn) { listeners.push(fn); };
  api.set = function (next) {
    next = pick(next);
    if (next === name) return;
    name = next;
    try { window.localStorage.setItem(KEY, name); } catch (e) { /* not saved; the look still changes */ }
    show();
    listeners.forEach(function (fn) { fn(THEMES[name], name); });
  };

  // ---- The switch in the top bar ("Rink | Sunset") ----
  var buttons = document.querySelectorAll("[data-look]");
  function mark() {
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", String(buttons[i].getAttribute("data-look") === name));
    }
  }
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener("click", function () { api.set(this.getAttribute("data-look")); });
  }
  mark();
  api.onChange(mark);

  window.CoachTheme = api;
})();
