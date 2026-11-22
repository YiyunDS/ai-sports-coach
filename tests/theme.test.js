// Tests for js/theme.js (the two looks of the page).
// Run with:  node tests/theme.test.js
var T = require("../js/theme.js");
var assert = require("assert");
var fs = require("fs");
var path = require("path");

function test(name, fn) { fn(); console.log("OK  " + name); }

var names = Object.keys(T.THEMES);

// ---- Which look is used ----
test("a saved look is used; anything else gives the first look", function () {
  assert.strictEqual(T.pick("sunset"), "sunset");
  assert.strictEqual(T.pick("rink"), "rink");
  assert.strictEqual(T.pick(null), "rink");
  assert.strictEqual(T.pick(undefined), "rink");
  assert.strictEqual(T.pick(""), "rink");
  assert.strictEqual(T.pick("Sunset"), "rink");        // a wrong spelling
  assert.strictEqual(T.pick("toString"), "rink");      // a word every list knows, but not a look
  assert.strictEqual(T.pick(7), "rink");
  assert.strictEqual(T.FIRST, "rink");
});

// ---- The two lists have the same shape ----
// Every name in one look must be in the other, or a file that reads
// the list would find a hole after you switch.
function keys(o, pre, out) {
  Object.keys(o).forEach(function (k) {
    var v = o[k], name = pre + k;
    out.push(name);
    if (v && typeof v === "object" && !Array.isArray(v)) keys(v, name + ".", out);
  });
  return out;
}
// Things only an outdoor rink has.
var OUTDOOR_ONLY = { "scene.sky": 1, "scene.sun": 1, "scene.sun.at": 1, "scene.sun.core": 1, "scene.sun.edge": 1, "scene.sun.glow": 1, "scene.palms": 1 };
test("both looks list the same things", function () {
  var a = keys(T.THEMES.rink, "", []).sort();
  var b = keys(T.THEMES.sunset, "", []).filter(function (k) { return !OUTDOOR_ONLY[k]; }).sort();
  assert.deepStrictEqual(b, a);
  assert.strictEqual(T.THEMES.rink.scene.outdoor, false);
  assert.strictEqual(T.THEMES.sunset.scene.outdoor, true);
});

// ---- The color math ----
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || "") + " got " + a + ", wanted " + b); }
test("contrast: black on white is 21, a color on itself is 1", function () {
  near(T.contrast("#000000", "#ffffff"), 21, 0.001);
  near(T.contrast("#ffffff", "#000000"), 21, 0.001);   // the order does not matter
  near(T.contrast("#4da3ff", "#4da3ff"), 1, 0.001);
  near(T.contrast("#777777", "#ffffff"), 4.48, 0.01);  // a well-known "just too gray" pair
});
test("hue: red 0, green 120, blue 240; and the short way around the wheel", function () {
  near(T.hue("#ff0000"), 0, 0.001);
  near(T.hue("#00ff00"), 120, 0.001);
  near(T.hue("#0000ff"), 240, 0.001);
  near(T.hueApart("#ff0000", "#0000ff"), 120, 0.001);
  near(T.hueApart("#ff0000", "#ff00ff"), 60, 0.001);   // 0 and 300 are 60 apart, not 300
  near(T.hueApart("#ff0000", "#ff0000"), 0, 0.001);
});

// ---- Words can be read in both looks ----
names.forEach(function (n) {
  var c = T.THEMES[n].css;
  test(n + ": words can be read on the page", function () {
    assert.ok(T.contrast(c.fg, c.bg) >= 7, "main text on the page: " + T.contrast(c.fg, c.bg).toFixed(2));
    assert.ok(T.contrast(c.fg, c.panel) >= 7, "main text on a panel: " + T.contrast(c.fg, c.panel).toFixed(2));
    assert.ok(T.contrast(c.muted, c.bg) >= 4.5, "quiet text on the page: " + T.contrast(c.muted, c.bg).toFixed(2));
    assert.ok(T.contrast(c.muted, c.panel) >= 4.5, "quiet text on a panel: " + T.contrast(c.muted, c.panel).toFixed(2));
    assert.ok(T.contrast(c.refInk, c.ref) >= 4.5, "words on the main button: " + T.contrast(c.refInk, c.ref).toFixed(2));
    // The colored words (grades, "you", "pro") sit on the page and on panels too.
    ["ref", "you", "good", "close", "far"].forEach(function (k) {
      assert.ok(T.contrast(c[k], c.panel) >= 4.5, k + " on a panel: " + T.contrast(c[k], c.panel).toFixed(2));
    });
  });
  test(n + ": the colors that mean something can be told apart", function () {
    // The pro and you.
    assert.ok(T.hueApart(c.ref, c.you) >= 90, "pro and you: " + T.hueApart(c.ref, c.you).toFixed(0));
    // The three grades.
    assert.ok(T.hueApart(c.good, c.close) >= 40, "good and close");
    assert.ok(T.hueApart(c.close, c.far) >= 30, "close and far");
    assert.ok(T.hueApart(c.good, c.far) >= 100, "good and far");
    // "You" is not one of the grade colors. (In Rink, orange sits 16
    // degrees from the yellow of "close". No look may be closer.)
    ["good", "close", "far"].forEach(function (g) {
      assert.ok(T.hueApart(c.you, c[g]) >= 15, "you and " + g + ": " + T.hueApart(c.you, c[g]).toFixed(0));
      assert.ok(T.hueApart(c.ref, c[g]) >= 15, "pro and " + g + ": " + T.hueApart(c.ref, c[g]).toFixed(0));
    });
  });
  test(n + ": the 3D signs use the page's colors", function () {
    var s = T.THEMES[n].signs;
    assert.strictEqual(s.pro, c.ref);
    assert.strictEqual(s.you, c.you);
    ["good", "close", "far"].forEach(function (g) { assert.strictEqual(s[g], c[g]); });
    assert.strictEqual(T.THEMES[n].pro.nameColor, c.ref);
    assert.strictEqual(T.THEMES[n].you.nameColor, c.you);
    assert.strictEqual(T.THEMES[n].overlay.box, c.you);
  });
});

// ---- style.css and theme.js agree ----
// The page's colors are written in style.css, the 3D colors here. The
// ones that are in both places must be the same.
var css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
function block(start) {
  var at = css.indexOf(start);
  assert.ok(at >= 0, "style.css has no block that starts with " + start);
  return css.slice(at, css.indexOf("}", at));
}
function cssVar(text, name) {
  var m = new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})\\b").exec(text);
  return m ? m[1].toLowerCase() : null;
}
var CSS_NAMES = { bg: "bg", panel: "panel", fg: "fg", muted: "muted", ref: "ref", refInk: "ref-ink", you: "you", good: "good", close: "close", far: "far" };
test("style.css and theme.js say the same colors", function () {
  var blocks = { rink: block(":root {"), sunset: block(':root[data-theme="sunset"] {') };
  names.forEach(function (n) {
    assert.ok(blocks[n], "no style.css block for the look " + n);
    Object.keys(CSS_NAMES).forEach(function (k) {
      assert.strictEqual(cssVar(blocks[n], CSS_NAMES[k]), T.THEMES[n].css[k], n + " --" + CSS_NAMES[k]);
    });
  });
});

console.log("All look (theme) tests passed!");
