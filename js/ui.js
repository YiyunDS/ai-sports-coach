/* =====================================================================
   ui.js  --  THE LITTLE MOVEMENTS OF THE PAGE
   A page feels well made when things do not just "pop": the light
   behind a switch slides over, a number counts up to its value, a
   score gives a small pulse when it changes.

   The rules we follow (the same ones careful app makers use):
     - Movements are SHORT. A press answers in about a tenth of a
       second, a switch in two tenths.
     - Things start fast and stop gently ("ease out"). Nothing bounces.
     - Only ONE moment may take longer: the report appearing.
     - Someone who asked their device to "reduce motion" gets no
       sliding and no counting, only the end result.
     - The live Game (game.js) is the one place where things must move
       to work: a game cannot be played as a row of still pictures.
       With "reduce motion" it still plays, but without the extras.

   The times and the curve are written once, at the top of style.css.
   ===================================================================== */
(function () {
  "use strict";

  // ---------- 1. The math (checked in tests/ui.test.js) ----------------

  // "Ease out": start fast, stop gently.
  //   t = how far along we are in time (0 = start, 1 = end)
  //   gives back how far along the movement is (also 0 to 1)
  function easeOut(t) {
    t = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - t, 4);
  }

  // The number to show while counting from one value to another.
  function countAt(from, to, t) {
    return Math.round(from + (to - from) * easeOut(t));
  }

  // The ring in the report is a circle drawn as ONE long dash. To fill
  // a share of it (0 to 1) we slide the dash back by the rest.
  //   around = the length of the whole circle
  //   hidden = how much of the dash to slide out of sight
  function ringDash(share, radius) {
    var around = 2 * Math.PI * radius;
    share = Math.max(0, Math.min(1, share));
    return { around: around, hidden: around * (1 - share) };
  }

  // The camera sees a wedge that gets wider the farther it looks. How
  // far back must it sit to see a box "wide" by "tall" meters?
  //   fovDeg = how wide the camera's eye is open, top to bottom (degrees)
  //   aspect = the picture's width divided by its height
  function cameraDistance(wide, tall, fovDeg, aspect) {
    var half = Math.tan(fovDeg / 2 * Math.PI / 180);   // how much the wedge widens for each meter
    return Math.max(tall / 2 / half, wide / 2 / (half * aspect));
  }

  // The angle signs float in the 3D world, so from far away they get
  // tiny (on a phone the camera is far away). signScale says how much
  // bigger to draw a sign so that it looks "wantPx" pixels tall.
  //   distance   = meters from the camera to the skaters
  //   viewPx     = the height of the 3D picture in pixels
  //   baseMeters = the sign's own height in the 3D world
  // Never smaller than 0.8 times and never bigger than 2.2 times.
  function signScale(distance, fovDeg, viewPx, wantPx, baseMeters) {
    var metersPerPixel = 2 * distance * Math.tan(fovDeg / 2 * Math.PI / 180) / Math.max(1, viewPx);
    return Math.max(0.8, Math.min(2.2, wantPx * metersPerPixel / baseMeters));
  }

  var api = { easeOut: easeOut, countAt: countAt, ringDash: ringDash, cameraDistance: cameraDistance, signScale: signScale };
  // In node (the tests) there is no page, so we stop here.
  if (typeof document === "undefined") { module.exports = api; return; }

  // ---------- 2. Does this person want less movement? ------------------
  function calm() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // ---------- 3. A number that counts up (or down) to its value --------
  // box = the element that shows the number; ms = how long it takes.
  function count(box, from, to, ms) {
    box.countRun = (box.countRun || 0) + 1;   // a newer count stops an older one
    var run = box.countRun, start = null;
    if (calm() || from === to || !window.requestAnimationFrame) { box.textContent = String(to); return; }
    box.textContent = String(from);
    function step(now) {
      if (box.countRun !== run) return;
      if (start === null) start = now;
      var t = (now - start) / ms;
      box.textContent = String(countAt(from, to, t));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---------- 4. Do something when a box is first SEEN -----------------
  // On a phone the report is below the 3D picture. Its entrance should
  // play when you scroll down to it, not while it is out of sight.
  // Gives back a function that calls the whole thing off.
  function whenSeen(box, fn) {
    if (!window.IntersectionObserver) { fn(); return function () {}; }
    var watcher = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      watcher.disconnect();
      fn();
    }, { threshold: 0.4 });
    watcher.observe(box);
    return function () { watcher.disconnect(); };
  }

  // ---------- 5. The light that slides behind a switch -----------------
  // A "switch" is a row of buttons where one is on (Side | Front | Top).
  // We add one small box, the "pill", and slide it behind the button
  // that is on. For the tabs at the top the pill is the thin blue line.
  // If anything here fails, the buttons still light up the old way.
  var phone = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };
  function addPill(group, isLine) {
    var pill = document.createElement("i");
    pill.className = "pill";
    pill.setAttribute("aria-hidden", "true");
    group.insertBefore(pill, group.firstChild);
    var placed = false;

    function place() {
      var on = group.querySelector('button[aria-pressed="true"], input:checked + span');
      // (offsetWidth is 0 while the switch is on a hidden tab.)
      if (!on || !group.offsetWidth) { group.classList.remove("has-pill"); placed = false; return; }
      var x = on.offsetLeft, y = on.offsetTop, w = on.offsetWidth, h = on.offsetHeight;
      // The tabs' line: under the tab, or above it on a phone (there the
      // tabs sit at the bottom of the screen).
      if (isLine) { y = phone.matches ? y : y + h - 2; h = 2; }
      // The first time, it is simply there. After that, it slides.
      if (!placed) pill.style.transition = "none";
      pill.style.width = w + "px";
      pill.style.height = h + "px";
      pill.style.transform = "translate(" + x + "px, " + y + "px)";
      if (!placed) { void pill.offsetWidth; pill.style.transition = ""; }
      placed = true;
      group.classList.add("has-pill");
    }

    // Move the pill when another button is switched on, and when the
    // row changes size (a phone turned sideways, a tab being opened).
    new MutationObserver(place).observe(group, { attributes: true, subtree: true, attributeFilter: ["aria-pressed"] });
    group.addEventListener("change", place);
    if (window.ResizeObserver) new ResizeObserver(place).observe(group);
    window.addEventListener("resize", place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placed = false; place(); });
    place();
  }
  if (window.MutationObserver) {
    Array.prototype.forEach.call(document.querySelectorAll(".seg"), function (g) { addPill(g, false); });
    Array.prototype.forEach.call(document.querySelectorAll(".tabs"), function (g) { addPill(g, true); });
  }

  // ---------- 6. A score gives a small pulse when it changes -----------
  function pulseOnChange(box) {
    var last = box.textContent;
    new MutationObserver(function () {
      if (box.textContent === last) return;
      last = box.textContent;
      box.classList.remove("bump");
      void box.offsetWidth;          // lets the pulse start again from the beginning
      box.classList.add("bump");
    }).observe(box, { childList: true, characterData: true, subtree: true });
  }
  if (window.MutationObserver) {
    ["game-us", "game-them", "ref-right", "ref-total"].forEach(function (id) {
      var box = document.getElementById(id);
      if (box) pulseOnChange(box);
    });
  }

  // ---------- 7. Boxes that open and close ----------------------------
  // A button with data-pop="some-id" opens the box with that id (the
  // help box on the 3D picture). It closes again with the same button,
  // its own Close button, the Escape key, or a click anywhere else.
  Array.prototype.forEach.call(document.querySelectorAll("[data-pop]"), function (btn) {
    var pop = document.getElementById(btn.getAttribute("data-pop"));
    if (!pop) return;
    function show(on) {
      pop.hidden = !on;
      btn.setAttribute("aria-expanded", String(on));
    }
    btn.addEventListener("click", function () { show(pop.hidden); });
    Array.prototype.forEach.call(pop.querySelectorAll("[data-pop-close]"), function (x) {
      x.addEventListener("click", function () { show(false); btn.focus(); });
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !pop.hidden) { show(false); btn.focus(); }
    });
    document.addEventListener("pointerdown", function (ev) {
      if (!pop.hidden && !pop.contains(ev.target) && !btn.contains(ev.target)) show(false);
    });
  });

  // On a phone the tool bar under the skaters shows only "Compare".
  // The "More" button opens the rest of it.
  var moreBtn = document.getElementById("tools-more"), toolbar = document.getElementById("toolbar");
  if (moreBtn && toolbar) moreBtn.addEventListener("click", function () {
    var open = !toolbar.classList.contains("open");
    toolbar.classList.toggle("open", open);
    moreBtn.setAttribute("aria-expanded", String(open));
    moreBtn.textContent = open ? "Less" : "More";
  });

  api.calm = calm;
  api.count = count;
  api.whenSeen = whenSeen;
  window.CoachUI = api;
})();
