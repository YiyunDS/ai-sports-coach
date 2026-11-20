// =====================================================================
//  coach.js  --  THE COACH: YOUR VIDEO, YOUR POSE, YOUR REPORT
//
//  What happens here, step by step:
//    1. You pick a video, your age, and Beginner or Experienced.
//    2. You click the skater you want. The tracker (tracker.js) follows
//       that one skater, and a pose-finding AI (MediaPipe) looks at a
//       zoomed-in picture of them about 20 times per second to find
//       their joints.
//    3. We measure your angles (the math is in angles.js).
//    4. We compare them with the goal numbers from targets.json.
//    5. The orange 3D skater copies your pose. Joints turn
//       green / yellow / red, and the replay shows where form slips.
//
//  Your video never leaves your computer. All of this runs in the
//  browser. (The page only downloads the AI itself from the internet.)
//
//  New words in this file:
//    "async" and "await" mean "this takes a while - wait for it to
//    finish before doing the next line".
// =====================================================================
(function () {
  "use strict";
  var M = window.CoachMath;
  var T = window.CoachTracker;
  var C = window.Coach3D;
  if (!C) return; // the 3D picture did not start, so there is nothing to do

  // Where the pose-finding AI lives on the internet.
  var MP_VERSION = "0.10.14";
  var MP_CODE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION + "/vision_bundle.mjs";
  var MP_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION + "/wasm";
  // Three sizes of the AI. "heavy" is the most accurate (and the slowest),
  // "full" and "lite" are the backups if heavy will not start.
  var MP_MODELS = [
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
  ];

  // "?dev" at the end of the address = the team's measuring mode. A pro
  // at full speed pushes about 3 times a second, so to measure one we
  // look at many more pictures (60 per second) and smooth less.
  var DEV = /[?&]dev\b/.test(location.search);
  var MAX_FRAMES = DEV ? 900 : 400;     // never look at more pictures than this
  var FRAME_GAP = DEV ? 1 / 60 : 0.05;  // seconds between pictures (normally 20 per second)
  var DEMO_GAP = 0.1;       // the sample session has 10 poses per second
  // How sure the AI must be that it sees a joint. (In measuring mode we
  // accept less: the smoothing and the "throw away broken pushes" step
  // in measure.js deal with the wobblier poses.)
  var MIN_VISIBILITY = DEV ? 0.3 : 0.5;
  var CROP = 512;           // the zoomed-in picture we hand to the AI is 512 x 512 dots
  var SMALL_SKATER = 0.18;  // skater shorter than this part of the picture = "far away"

  var COLORS = { good: "#2fbf71", close: "#e6b422", far: "#ef5350", none: "#263344" };

  // The three checks, with the words we show for each one.
  var CHECKS = [
    {
      id: "kneeBend", name: "Knee bend", low: 60, high: 180,
      tip: function (off) {
        if (off === 0) return "Knee bend is in the target range. That is where your power comes from.";
        if (off > 0) return "Bend your knees about " + off + "° more. Sit back as if lowering onto a chair.";
        return "Very deep bend. You can rise about " + (-off) + "° and still keep your power.";
      }
    },
    {
      id: "forwardLean", name: "Forward lean", low: 0, high: 90,
      tip: function (off) {
        if (off === 0) return "Forward lean is in the target range. Chest forward, eyes up.";
        if (off < 0) return "Lean your chest forward about " + (-off) + "° more. Nose over knees, knees over toes.";
        return "Too much lean. Lift your chest about " + off + "° so you can see the ice.";
      }
    },
    {
      id: "strideExtension", name: "Stride extension", low: 90, high: 180,
      tip: function (off) {
        if (off === 0) return "Full extension. The pushing leg gets almost straight.";
        if (off < 0) return "Extend the pushing leg about " + (-off) + "° more, until it is almost straight. Finish the push through your toes.";
        return "Strong push. Keep a slight bend so the knee does not lock.";
      }
    }
  ];
  var GRADE_WORDS = { good: "On target", close: "Close", far: "Needs work" };

  // Short way to grab a thing on the page by its id.
  function $(id) { return document.getElementById(id); }
  var el = {
    videoFile: $("video-file"), fileName: $("file-name"), age: $("age"),
    analyze: $("analyze-btn"), demo: $("demo-btn"), progress: $("progress"),
    progressBar: $("progress-bar"), status: $("status"), refMode: $("ref-mode"),
    targetInfo: $("target-info"), targetsFile: $("targets-file"),
    results: $("results"), stars: $("stars"), cards: $("cards"), preview: $("preview"),
    videoPanel: $("video-panel"), overlay: $("overlay"), pickTime: $("pick-time"), pickOut: $("pick-out"),
    seedInfo: $("seed-info"), trackInfo: $("track-info"), qualityNote: $("quality-note"),
    play: $("play-btn"), speed: $("speed"), worst: $("worst-btn"),
    frameInfo: $("frame-info"), timeline: $("timeline")
  };

  // Everything the coach remembers while the page is open.
  var state = {
    targets: window.DEFAULT_TARGETS,
    frames: null,     // the kid's poses, turned to face the same way as the pro
    times: null,      // the time in the video of each pose (seconds)
    track: null,      // what the AI saw in each pose: joints and box, in video pixels
    rhythm: null,     // the stride rhythm of each pose (which leg pushes, how far)
    flat: null,       // knee and lean measured on the flat picture (side views only)
    span: 2,          // how many poses on each side count as "near" a push
    seed: null,       // where you clicked: { t, x, y } (x and y go from 0 to 1)
    analysis: null,   // scores for every pose
    index: 0,         // which pose we are showing now
    playing: false,
    playClock: 0,
    hasVideo: false,
    busy: false
  };

  // Lets us look inside from the browser's console while testing.
  window.CoachState = state;

  function say(text) { el.status.textContent = text; }

  // ---------- Settings: age, level, targets --------------------------

  function settings() {
    var level = document.querySelector('input[name="level"]:checked');
    return { age: Number(el.age.value), level: level ? level.value : "beginner" };
  }
  function middle(range) { return (range.min + range.max) / 2; }
  function rangeText(range) { return range.min + "°–" + range.max + "°"; }

  // Make sure a targets file has everything we need before we trust it.
  function targetsLookRight(t) {
    function okSet(s) {
      return s && ["kneeBend", "forwardLean", "strideExtension"].every(function (c) {
        return s[c] && typeof s[c].min === "number" && typeof s[c].max === "number" && s[c].min <= s[c].max;
      });
    }
    if (!t || typeof t.yellowZone !== "number" || !okSet(t.pro) || !t.bands) return false;
    var keys = Object.keys(t.bands);
    return keys.length > 0 && keys.every(function (k) {
      return /^\d+-\d+$/.test(k) && okSet(t.bands[k].beginner) && okSet(t.bands[k].experienced);
    });
  }

  // Called whenever the age, level, targets or poses change.
  function refresh() {
    var s = settings();
    var band = M.ageBand(state.targets, s.age);
    var target = M.getTarget(state.targets, s.age, s.level);

    // What should the blue skater show?
    var shown = el.refMode.value === "goal" ? target : state.targets.pro;
    C.setReference({
      kneeBend: middle(shown.kneeBend),
      forwardLean: middle(shown.forwardLean),
      strideExtension: middle(shown.strideExtension)
    }, el.refMode.value === "goal" ? "GOAL" : "PRO");

    el.targetInfo.textContent = "Target for ages " + band + ", " + s.level + ": knee " +
      rangeText(target.kneeBend) + ", lean " + rangeText(target.forwardLean) +
      ", push " + rangeText(target.strideExtension) + ".";

    if (state.frames) {
      state.analysis = M.analyzeFrames(state.frames, target, state.targets.yellowZone, state.span, state.flat, state.rhythm);
      drawCards(target);
      drawTimeline();
      // (While the replay is playing, the next tick redraws by itself.
      //  Redrawing here would make the video jump back a little.)
      if (!state.playing) showFrame(state.index);
    }
  }

  // ---------- Showing one moment on the orange skater -----------------

  // Is this moment at (or right next to) the top of a push? Returns
  // that push's own moment (so they all show the push's grade), or null.
  function pushAt(i) {
    var f = state.analysis.perFrame;
    return f[i].peak >= 0 ? f[f[i].peak] : null;
  }

  // Draw one moment.
  //   i     = which pose
  //   blend = how far along we are toward the NEXT pose (0 to 1). This
  //           is what makes the replay smooth: we draw the in-between.
  //   fromVideo = true while the video itself is playing (then we must
  //           not tell the video to jump, it is already moving)
  function render(i, blend, fromVideo) {
    var n = state.frames.length;
    i = M.clamp(i, 0, n - 1);
    if (i >= n - 1) blend = 0;
    state.index = i;
    var f = state.analysis.perFrame[i], peak = pushAt(i);
    var pose = blend > 0 ? M.lerpPose(state.frames[i], state.frames[i + 1], blend) : state.frames[i];

    // Pick the traffic-light color for each joint.
    var grades = {};
    grades[f.m.glideSide + "Knee"] = f.scores.kneeBend.grade;   // knee bend -> glide knee
    grades.lHip = grades.rHip = grades.neck = f.scores.forwardLean.grade; // lean -> hips and neck
    if (peak) grades[f.m.pushSide + "Knee"] = peak.scores.strideExtension.grade; // push -> push knee

    C.kidFigure.update(pose, grades);
    C.decorate(C.kidFigure, pose, {
      knee: COLORS[f.scores.kneeBend.grade],
      lean: COLORS[f.scores.forwardLean.grade],
      push: COLORS[(peak || f).scores.strideExtension.grade]
    }, !!peak, {   // the numbers the report uses, so the signs match the cards
      kneeBend: f.m.kneeBend, forwardLean: f.m.forwardLean, glideSide: f.m.glideSide, pushSide: f.m.pushSide,
      strideExtension: (peak || f).m.strideExtension
    });
    el.timeline.setAttribute("aria-valuenow", String(i + 1));
    el.timeline.setAttribute("aria-valuemin", "1");
    el.timeline.setAttribute("aria-valuemax", String(n));

    // Tell the pro where the kid is in the stride, so they move together.
    var r = state.rhythm[i], next = state.rhythm[Math.min(n - 1, i + 1)];
    var push = blend > 0 && next.side === r.side ? M.lerpNum(r.push, next.push, blend) : r.push;
    // Turn "how far out is the leg" into "how far through the stride":
    // 0 to 0.5 while the leg goes out, 0.5 to 1 while it comes back.
    var part = Math.asin(Math.sqrt(M.clamp(push / r.peak, 0, 1))) / Math.PI;
    C.setSync({ push: push, side: r.side, phase: r.rising ? part : 1 - part, stride: r.stride });

    var now = blend > 0 ? M.lerpNum(state.times[i], state.times[i + 1], blend) : state.times[i];
    el.frameInfo.textContent = "Frame " + (i + 1) + " / " + n + "  ·  " + now.toFixed(1) + " s";
    drawTimeline();

    // Show the same moment in the video, with what the AI saw drawn on top.
    if (state.hasVideo) {
      if (!fromVideo && !el.preview.seeking) {
        try { el.preview.currentTime = state.times[i]; } catch (e) { /* video not ready - no problem */ }
      }
      if (state.track && state.track[i]) drawOverlay(state.track[i], null);
      el.pickTime.value = String(now);
      el.pickOut.textContent = now.toFixed(1) + " s";
    }
  }
  function showFrame(i) { render(i, 0, false); }

  // ---------- The report cards ----------------------------------------

  function make(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function drawCards(target) {
    var summary = state.analysis.summary, stars = 0, measured = CHECKS.length;
    el.cards.textContent = "";
    CHECKS.forEach(function (check) {
      var s = summary[check.id], range = target[check.id];
      if (!s) {
        // We could not measure this one (no clear push in the clip).
        var none = make("div", "check");
        var top = make("div", "check-head");
        top.appendChild(make("span", "check-name", check.name));
        top.appendChild(make("span", "chip", "Not seen"));
        none.appendChild(top);
        var dash = make("div", "check-nums");
        dash.appendChild(make("span", "big", "–"));
        dash.appendChild(make("span", "goal", "Target " + rangeText(range)));
        none.appendChild(dash);
        none.appendChild(make("p", "tip", "The coach did not see a full push in this clip. Film a few strong strides from the side to measure it."));
        el.cards.appendChild(none);
        measured--;
        return;
      }
      if (s.grade === "good") stars++;
      var card = make("div", "check " + s.grade);
      var head = make("div", "check-head");
      head.appendChild(make("span", "check-name", check.name));
      head.appendChild(make("span", "chip", GRADE_WORDS[s.grade]));
      card.appendChild(head);
      var nums = make("div", "check-nums");
      nums.appendChild(make("span", "big", Math.round(s.value) + "°"));
      nums.appendChild(make("span", "goal", "Target " + rangeText(range)));
      card.appendChild(nums);

      // A little ruler: the green part is the goal, the dot is you.
      var ruler = make("div", "ruler");
      var span = check.high - check.low;
      var zone = make("div", "ruler-goal");
      zone.style.left = ((range.min - check.low) / span * 100) + "%";
      zone.style.width = ((range.max - range.min) / span * 100) + "%";
      var dot = make("div", "ruler-dot");
      dot.style.left = (M.clamp((s.value - check.low) / span, 0, 1) * 100) + "%";
      ruler.appendChild(zone); ruler.appendChild(dot);
      card.appendChild(ruler);

      card.appendChild(make("p", "tip", check.tip(Math.round(s.off))));
      el.cards.appendChild(card);
    });
    el.stars.textContent = stars + " of " + measured + " on target";
  }

  // ---------- The replay timeline --------------------------------------
  // Three colored stripes. Each little block is one moment of the video.
  //   stripe 1 = knee bend, stripe 2 = forward lean,
  //   stripe 3 = the pushes (only colored at the top of each push)

  var ROW_H = 22, ROW_GAP = 4;

  function drawTimeline() {
    if (!state.analysis) return;
    var canvas = el.timeline, frames = state.analysis.perFrame, n = frames.length;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 600, h = 3 * ROW_H + 2 * ROW_GAP;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var cell = w / n;
    for (var i = 0; i < n; i++) {
      var f = frames[i], x = i * cell;
      var rows = [
        COLORS[f.scores.kneeBend.grade],
        COLORS[f.scores.forwardLean.grade],
        pushAt(i) ? COLORS[pushAt(i).scores.strideExtension.grade] : COLORS.none
      ];
      for (var r = 0; r < 3; r++) {
        g.fillStyle = rows[r];
        g.fillRect(x, r * (ROW_H + ROW_GAP), Math.ceil(cell), ROW_H);
      }
      // Moments NOT seen from the side are dimmed: their knee and lean
      // numbers are rough, and the summary does not use them.
      if (state.analysis.sideOn && !f.m.fromPicture) {
        g.fillStyle = "rgba(11,15,20,0.62)";
        g.fillRect(x, 0, Math.ceil(cell), 2 * ROW_H + ROW_GAP);
      }
    }
    // A dark line wherever moments were left out in between.
    g.fillStyle = "#0b0f14";
    for (var k = 1; k < n; k++) {
      if (state.times[k] - state.times[k - 1] > HOLE) g.fillRect(Math.round(k * cell) - 2, 0, 4, h);
    }
    // A bright box around the moment we are showing now.
    g.strokeStyle = "#ffffff"; g.lineWidth = 2;
    g.strokeRect(state.index * cell + 1.5, 1.5, Math.max(cell - 3, 3), h - 3);
  }

  // Click or drag on the timeline to jump to that moment.
  function timelineJump(ev) {
    if (!state.frames || state.busy) return;
    var box = el.timeline.getBoundingClientRect();
    var part = (ev.clientX - box.left) / Math.max(1, box.width);
    setPlaying(false);
    showFrame(Math.floor(part * state.frames.length));
  }
  var dragging = false;
  el.timeline.addEventListener("pointerdown", function (ev) { dragging = true; timelineJump(ev); });
  el.timeline.addEventListener("pointermove", function (ev) { if (dragging) timelineJump(ev); });
  window.addEventListener("pointerup", function () { dragging = false; });
  // Arrow keys work too.
  el.timeline.addEventListener("keydown", function (ev) {
    if (!state.frames || state.busy) return;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.preventDefault();
      setPlaying(false);
      showFrame(state.index + (ev.key === "ArrowRight" ? 1 : -1));
    }
  });
  window.addEventListener("resize", drawTimeline);

  // ---------- Playing the replay ---------------------------------------

  function setPlaying(on) {
    on = !!(on && state.frames);
    if (on) {
      // If we are at the end, start over.
      if (state.index >= state.frames.length - 1) state.index = 0;
      state.playClock = state.times[state.index];
      showFrame(state.index);
      // Play the real video too, at the chosen speed. The 3D skaters
      // then follow the video's own clock, so everything moves together.
      if (state.hasVideo) {
        el.preview.playbackRate = Number(el.speed.value);
        var started = el.preview.play();
        if (started && started.catch) started.catch(function () { /* the 3D replay still runs on its own clock */ });
      }
    } else if (state.hasVideo && !el.preview.paused) {
      el.preview.pause();
    }
    state.playing = on;
    el.play.textContent = state.playing ? "Pause" : "Play";
  }
  el.play.addEventListener("click", function () { setPlaying(!state.playing); });
  el.speed.addEventListener("change", function () {
    if (state.playing && state.hasVideo) el.preview.playbackRate = Number(el.speed.value);
  });
  el.worst.addEventListener("click", function () {
    if (!state.analysis) return;
    setPlaying(false);
    showFrame(state.analysis.worstFrame);
  });

  // Two useful moments farther apart than this (seconds) have a hole
  // between them: the replay does not glide across it.
  var HOLE = 0.3;

  // scene.js calls this about 60 times a second.
  C.onTick.push(function (dt) {
    if (!state.playing) return;
    var videoRuns = state.hasVideo && !el.preview.paused && !el.preview.seeking;
    if (videoRuns) state.playClock = el.preview.currentTime;      // follow the video
    else if (!state.hasVideo) state.playClock += dt * Number(el.speed.value); // sample session: our own clock
    else if (el.preview.paused && !el.preview.ended) state.playClock += dt * Number(el.speed.value); // video would not play
    var i = state.index, last = state.frames.length - 1;
    while (i < last && state.times[i + 1] <= state.playClock) i++;
    // How far are we between this pose and the next one?
    var blend = 0;
    if (i < last) {
      var gap = state.times[i + 1] - state.times[i];
      if (gap > 0 && gap <= HOLE) blend = M.clamp((state.playClock - state.times[i]) / gap, 0, 1);
      else if (gap > HOLE && state.playClock > state.times[i] + 0.08) {
        // A hole: the moments in between were left out. Do not stand
        // frozen through it: jump straight to the next useful moment
        // (the video jumps along with us).
        i++;
        state.playClock = state.times[i];
        if (state.hasVideo) {
          try { el.preview.currentTime = state.times[i]; } catch (e) { /* video not ready - no problem */ }
        }
        videoRuns = false;
      }
    }
    render(i, blend, videoRuns);
    if (i >= last || (state.hasVideo && el.preview.ended)) setPlaying(false);
  });

  // ---------- Starting a new report ------------------------------------

  // rawFrames = poses straight from the AI. times = seconds for each.
  // track = what the AI saw in the video for each pose (or null for the sample).
  // extra = { weights, flat } from a real video: how sure the AI was
  //         about each joint, and the flat-picture angles (or null).
  function startReport(rawFrames, times, hasVideo, track, extra) {
    extra = extra || {};
    function cleanUp() {
      return M.normalizeFrames(rawFrames, { smooth: hasVideo, times: times, weights: extra.weights, blur: DEV ? 0.035 : undefined });
    }
    state.frames = cleanUp();
    // A real video has moments where the AI's 3D guess is no good (the
    // skater seen from the front, a blurry picture, a lonely moment
    // between two holes). The orange skater only shows the USEFUL
    // moments (see usefulFrames in angles.js). Then we clean up once
    // more, so the left-out moments cannot pull on the ones we keep.
    // (Not in measuring mode: there we want to see everything.)
    state.useful = null;
    if (hasVideo && !DEV) {
      var useful = M.usefulFrames(state.frames, times, extra.sideView);
      state.useful = { kept: useful.kept, total: rawFrames.length, runs: useful.runs, sideOnly: useful.sideOnly, pushesOnly: useful.pushesOnly };
      if (useful.kept < rawFrames.length) {
        var only = function (list) { return list ? list.filter(function (_, i) { return useful.keep[i]; }) : list; };
        rawFrames = only(rawFrames); times = only(times); track = only(track);
        extra = { weights: only(extra.weights), flat: only(extra.flat) };
        state.frames = cleanUp();
      }
    }
    state.raw = { frames: rawFrames, weights: extra.weights || null }; // kept so we can check the clean-up in the browser
    state.flat = extra.flat || null;
    state.rhythm = M.strideSignal(state.frames);
    state.times = times;
    // "Near the top of a push" means within about 0.2 seconds. How many
    // poses that is depends on how many poses per second we have.
    var perPose = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : DEMO_GAP;
    state.span = Math.round(M.clamp(0.2 / Math.max(0.01, perPose), 2, 6));
    state.hasVideo = hasVideo;
    state.track = track || null;
    state.index = 0;
    if (!hasVideo) { el.qualityNote.hidden = true; clearOverlay(); }
    el.results.hidden = false;
    C.layout(true);
    refresh();
    setPlaying(true);
  }

  // Forget the report on screen (used when a new video is chosen).
  function clearReport() {
    setPlaying(false);
    state.frames = state.analysis = state.rhythm = state.flat = state.track = null;
    state.hasVideo = false;
    state.index = 0;
    el.results.hidden = true;
    el.qualityNote.hidden = true;
    el.trackInfo.textContent = "";
    C.layout(false);
    C.setSync(null);   // the pro skates on its own again ("Play stride" works)
  }

  el.demo.addEventListener("click", function () {
    if (state.busy) return;
    setPlaying(false);  // stop a video replay that may be running
    el.trackInfo.textContent = "";
    var raw = window.CoachStride.makeDemoSession(DEMO_GAP);
    startReport(raw, raw.map(function (_, i) { return i * DEMO_GAP; }), false, null);
    say("Sample session loaded: a skater who stands a little too tall and tires near the end.");
  });

  // ---------- Drawing on top of the video --------------------------------
  // The joints the AI gives us are numbered. These pairs are the "bones"
  // we draw between them (11 = left shoulder, 23 = left hip, and so on).
  var BONES_2D = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32], [27, 29], [28, 30]
  ];

  function overlayContext() {
    var v = el.preview, c = el.overlay;
    // The drawing canvas has exactly as many dots as the video, so a
    // spot in the video and a spot on the canvas are the same numbers.
    if (v.videoWidth && (c.width !== v.videoWidth || c.height !== v.videoHeight)) {
      c.width = v.videoWidth; c.height = v.videoHeight;
    }
    return c.getContext("2d");
  }
  function clearOverlay() {
    var g = overlayContext();
    g.clearRect(0, 0, el.overlay.width, el.overlay.height);
    return g;
  }

  // det = { pts, box } for one person.  win = the search window (or null).
  function drawOverlay(det, win) {
    var g = clearOverlay(), W = el.overlay.width;
    var thin = Math.max(2, W / 500);
    if (win) { // the square where the tracker is looking
      g.setLineDash([thin * 4, thin * 3]);
      g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = thin;
      g.strokeRect(win.x, win.y, win.size, win.size);
      g.setLineDash([]);
    }
    if (!det) return;
    var b = det.box;
    g.strokeStyle = "#ff9f43"; g.lineWidth = thin;
    g.strokeRect(b.cx - b.w / 2 - 6, b.cy - b.h / 2 - 6, b.w + 12, b.h + 12);
    g.strokeStyle = "#ffffff"; g.lineWidth = thin * 0.9; g.lineCap = "round";
    g.beginPath();
    BONES_2D.forEach(function (pair) {
      var p = det.pts[pair[0]], q = det.pts[pair[1]];
      g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
    });
    g.stroke();
    g.fillStyle = "#ff9f43";
    [11, 12, 23, 24, 25, 26, 27, 28].forEach(function (i) {
      g.beginPath(); g.arc(det.pts[i].x, det.pts[i].y, thin * 1.5, 0, Math.PI * 2); g.fill();
    });
  }

  // A ring that shows where you clicked.
  function drawSeed() {
    var g = clearOverlay(), W = el.overlay.width, H = el.overlay.height;
    if (!state.seed) return;
    var r = Math.max(14, W / 45);
    g.strokeStyle = "#ff9f43"; g.lineWidth = Math.max(3, W / 320);
    g.beginPath(); g.arc(state.seed.x * W, state.seed.y * H, r, 0, Math.PI * 2); g.stroke();
  }

  // ---------- Choosing the skater ------------------------------------------

  function updateAnalyzeButton() {
    el.analyze.disabled = state.busy || !el.videoFile.files.length || !state.seed;
  }

  // Slide to a frame.
  el.pickTime.addEventListener("input", function () {
    if (state.busy) return;
    setPlaying(false);
    var t = Number(el.pickTime.value);
    el.pickOut.textContent = t.toFixed(1) + " s";
    try { el.preview.currentTime = t; } catch (e) { /* video not ready - no problem */ }
    clearOverlay();
  });

  // Click the skater.
  el.overlay.addEventListener("click", function (ev) {
    if (state.busy || !el.preview.videoWidth) return;
    setPlaying(false);
    var box = el.overlay.getBoundingClientRect();
    state.seed = {
      t: el.preview.currentTime,
      x: M.clamp((ev.clientX - box.left) / Math.max(1, box.width), 0, 1),
      y: M.clamp((ev.clientY - box.top) / Math.max(1, box.height), 0, 1)
    };
    drawSeed();
    el.seedInfo.textContent = "Skater selected at " + state.seed.t.toFixed(1) + " s.";
    updateAnalyzeButton();
    say("Skater selected. Press Analyze video.");
  });

  // ---------- The pose-finding AI (MediaPipe) --------------------------

  var landmarkerPromise = null; // we only load the AI one time

  function loadPoseFinder() {
    if (!landmarkerPromise) {
      landmarkerPromise = (async function () {
        var vision = await import(MP_CODE);
        var files = await vision.FilesetResolver.forVisionTasks(MP_WASM);
        async function build(model, delegate) {
          return vision.PoseLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: model, delegate: delegate },
            runningMode: "IMAGE",  // we hand it one still picture at a time
            numPoses: 3,           // it may find up to 3 people; the tracker picks ours
            minPoseDetectionConfidence: DEV ? 0.2 : 0.35,
            minPosePresenceConfidence: DEV ? 0.2 : 0.35
          });
        }
        // Try the accurate AI on the fast graphics chip first, then the
        // other choices, until one of them starts.
        var lastError = null;
        for (var m = 0; m < MP_MODELS.length; m++) {
          var chips = ["GPU", "CPU"];
          for (var d = 0; d < chips.length; d++) {
            try { return await build(MP_MODELS[m], chips[d]); } catch (e) { lastError = e; }
          }
        }
        throw lastError || new Error("The pose-detection model could not load.");
      })();
      // If loading failed, forget it so the next click can try again.
      landmarkerPromise.catch(function () { landmarkerPromise = null; });
    }
    return landmarkerPromise;
  }

  // Wait for something to happen on the video (or give up after a while).
  function waitFor(video, eventName, ms) {
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        video.removeEventListener(eventName, finish);
        resolve();
      }
      video.addEventListener(eventName, finish);
      setTimeout(finish, ms);
    });
  }

  // Jump the video to a time and wait until that picture is ready.
  async function seek(video, t) {
    if (Math.abs(video.currentTime - t) < 0.001 && !video.seeking) return;
    var ready = waitFor(video, "seeked", 2000);
    video.currentTime = t;
    await ready;
  }

  function setBusy(on) {
    state.busy = on;
    el.demo.disabled = on;
    el.videoFile.disabled = on;
    el.pickTime.disabled = on;
    // The replay must not move the video while the coach is reading it.
    el.play.disabled = on; el.worst.disabled = on; el.speed.disabled = on;
    el.age.disabled = on; el.refMode.disabled = on;
    Array.prototype.forEach.call(document.querySelectorAll('input[name="level"]'), function (r) { r.disabled = on; });
    el.progress.hidden = !on;
    updateAnalyzeButton();
  }

  // A tiny gray copy of the whole picture, used to notice when the
  // camera cuts or swings away (see cameraJumped in tracker.js).
  var thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 32; thumbCanvas.height = 18;
  var thumbContext = thumbCanvas.getContext("2d", { willReadFrequently: true });
  function tinyPicture(video) {
    thumbContext.drawImage(video, 0, 0, 32, 18);
    var d = thumbContext.getImageData(0, 0, 32, 18).data, gray = [];
    for (var i = 0; i < d.length; i += 4) gray.push((d[i] + d[i + 1] + d[i + 2]) / 3);
    return gray;
  }

  // The zoomed-in picture we hand to the AI.
  var cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropCanvas.height = CROP;
  var cropContext = cropCanvas.getContext("2d");

  // Cut the window out of the video, zoom it, and ask the AI who is in it.
  // Returns a list of people: { pts, box, world, clear }.
  //   pts   = joints in whole-video pixels      box = the box around them
  //   world = joints in 3D (meters)             clear = can we trust the legs?
  //   sure  = how sure the AI is about each joint, by name
  function lookIn(finder, video, win) {
    cropContext.drawImage(video, win.x, win.y, win.size, win.size, 0, 0, CROP, CROP);
    var result = finder.detect(cropCanvas);
    var people = [];
    var count = result && result.landmarks ? result.landmarks.length : 0;
    for (var k = 0; k < count; k++) {
      var flat = result.landmarks[k], world = result.worldLandmarks && result.worldLandmarks[k];
      if (!flat || !world || flat.length < 33 || world.length < 33) continue;
      var pts = flat.map(function (l) {
        return { x: win.x + l.x * win.size, y: win.y + l.y * win.size, v: l.visibility === undefined ? 1 : l.visibility };
      });
      people.push({
        pts: pts, box: T.boxOf(pts, 0.4), world: world,
        clear: M.poseIsClear(flat, MIN_VISIBILITY),
        sure: M.mediapipeConfidence(flat) // how sure the AI is about each joint
      });
    }
    return people;
  }

  // Find the skater you clicked. We try a small window first (good for
  // a far-away skater) and then bigger and bigger ones.
  async function findClickedSkater(finder, video, seed, W, H) {
    await seek(video, seed.t);
    var x = seed.x * W, y = seed.y * H, parts = [0.22, 0.36, 0.6, 1];
    for (var i = 0; i < parts.length; i++) {
      var win = T.cropWindow(x, y, parts[i] * H, W, H);
      var people = lookIn(finder, video, win);
      var pick = T.pickClicked(people.map(function (p) { return p.box; }), x, y);
      drawOverlay(pick >= 0 ? people[pick] : null, win);
      if (pick >= 0) return people[pick];
    }
    return null;
  }

  // Follow the skater through the pictures listed in "order"
  // (forward in time, or backward), starting from where they were found.
  //   startPicture = the tiny gray picture at the moment you clicked.
  // Stops early if the camera cuts or swings away, and returns the time
  // where it stopped (or null if it went all the way).
  async function follow(finder, video, times, order, start, W, H, found, onStep, startPicture, gap) {
    var cur = start.box, prev = null, misses = 0;
    var lastPicture = startPicture, changes = [];
    for (var k = 0; k < order.length; k++) {
      var i = order[k];
      await seek(video, times[i]);
      var picture = tinyPicture(video);
      changes.push(T.pictureChange(lastPicture, picture));
      lastPicture = picture;
      if (T.cameraJumped(changes, gap)) {
        for (var rest = k; rest < order.length; rest++) onStep(); // keep the progress bar honest
        return times[i];
      }
      var guess = T.predict(prev, cur);
      var win = T.cropWindow(guess.cx, guess.cy, T.windowSize(cur, misses, H), W, H);
      var people = lookIn(finder, video, win);
      var pick = T.pickCandidate(people.map(function (p) { return p.box; }), guess, cur, misses);
      if (pick < 0 && misses >= 3 && misses % 3 === 0) {
        // Lost for a while: take one look at a much bigger area.
        win = T.cropWindow(guess.cx, guess.cy, H, W, H);
        people = lookIn(finder, video, win);
        pick = T.pickCandidate(people.map(function (p) { return p.box; }), guess, cur, misses);
      }
      if (pick >= 0) {
        found[i] = people[pick];
        prev = misses === 0 ? cur : null; // only guess ahead when we saw them last time too
        cur = people[pick].box;
        misses = 0;
      } else {
        prev = null;
        misses++;
      }
      drawOverlay(found[i] || null, win);
      onStep();
    }
    return null;
  }

  async function analyzeVideo() {
    if (state.busy || !el.videoFile.files.length || !state.seed) return;
    setBusy(true);
    setPlaying(false);
    el.progressBar.removeAttribute("value"); // "thinking" look
    try {
      say("Loading the pose-detection model. The first run takes a little while.");
      var finder = await loadPoseFinder();

      var video = el.preview;
      if (video.readyState < 2) await waitFor(video, "loadeddata", 8000);
      var duration = video.duration, W = video.videoWidth, H = video.videoHeight;
      if (!isFinite(duration) || duration <= 0 || !W) {
        throw new Error("That video could not be opened. Try an MP4 or MOV file.");
      }

      say("Finding the skater you clicked...");
      var start = await findClickedSkater(finder, video, state.seed, W, H);
      if (!start) {
        throw new Error("No skater was found where you clicked. Slide to a frame where the skater is easier to see and click the middle of their body.");
      }
      var startPicture = tinyPicture(video); // the video is still at the moment you clicked

      // Every moment we will look at. The click moment is one of them.
      var gap = Math.max(FRAME_GAP, duration / MAX_FRAMES);
      var plan = T.sampleTimes(duration, gap, state.seed.t);
      var times = plan.times, n = times.length, found = new Array(n), done = 0;
      found[plan.seedIndex] = start;
      var lastPercent = -1;
      function onStep() {
        done++;
        el.progressBar.value = done / Math.max(1, n - 1);
        // Say it every 5% (not 400 times, which is hard on screen readers).
        var percent = Math.round(done / Math.max(1, n - 1) * 20) * 5;
        if (percent !== lastPercent) { lastPercent = percent; say("Following the skater: " + percent + "%"); }
      }
      var forward = [], backward = [];
      for (var f = plan.seedIndex + 1; f < n; f++) forward.push(f);
      for (var b = plan.seedIndex - 1; b >= 0; b--) backward.push(b);
      var stopLater = await follow(finder, video, times, forward, start, W, H, found, onStep, startPicture, gap);
      var stopEarlier = await follow(finder, video, times, backward, start, W, H, found, onStep, startPicture, gap);

      // Keep the moments where we found the skater AND can trust the legs.
      var raw = [], keptTimes = [], track = [], tracked = 0, heights = [], weights = [], flat = [], sides = [], sideCount = 0, cutOff = 0;
      for (var i = 0; i < n; i++) {
        if (!found[i]) continue;
        tracked++;
        var pose = M.mediapipeToPose(found[i].world);
        if (!found[i].clear || !M.limbsLookRight(pose)) continue;
        if (T.touchesEdge(found[i].box, W, H)) { cutOff++; continue; } // part of the skater is outside the picture
        raw.push(pose);
        keptTimes.push(times[i]);
        track.push({ pts: found[i].pts, box: found[i].box });
        heights.push(found[i].box.h / H);
        weights.push(found[i].sure);
        sides.push(M.seenFromSide(pose));
        flat.push(M.measureFlat(found[i].pts));
      }
      // Filmed from the side? Then knee and lean come from the flat
      // picture. One moment on its own can be wrong, so each moment goes
      // with what most of its neighbors say (2 before, 2 after).
      flat = flat.map(function (f, i) {
        var yes = 0, count = 0;
        for (var j = Math.max(0, i - 2); j <= Math.min(sides.length - 1, i + 2); j++) { count++; if (sides[j]) yes++; }
        var side = yes * 2 > count;
        if (side) sideCount++;
        return side ? f : null;
      });
      // For SHOWING the skater in 3D a rougher side view is good enough
      // than for measuring: within 60 degrees, and most of the moments
      // around it (2 before, 2 after) within 50 degrees.
      var sideView = raw.map(function (pose, i) {
        var yes = 0, count = 0;
        for (var j = Math.max(0, i - 2); j <= Math.min(raw.length - 1, i + 2); j++) { count++; if (M.seenFromSide(raw[j], 50)) yes++; }
        return yes * 2 > count && M.seenFromSide(pose, 60);
      });
      var clearCount = raw.length;

      if (raw.length < 5) {
        throw new Error("The skater was followed in " + tracked + " of " + n + " frames, but only " + raw.length +
          " were clear enough to measure. Try a clip filmed closer and from the side.");
      }
      startReport(raw, keptTimes, true, track, { weights: weights, flat: flat, sideView: sideView });
      var shown = state.useful ? state.useful.kept : clearCount;
      el.trackInfo.textContent = "Followed in " + tracked + " of " + n + " frames · " + clearCount + " clear enough to measure" +
        (shown < clearCount ? " · " + shown + " useful ones shown" : "");

      // Be honest about how much to trust these numbers.
      var notes = [];
      if (shown < clearCount) {
        notes.push("The orange skater shows only the " + shown + " useful moments (" +
          (state.useful.sideOnly ? "seen from the side, " : "") + "several pictures in a row, a pose that makes sense" +
          (state.useful.pushesOnly ? ", a real push in it" : "") + ")" +
          (state.useful.runs > 1 ? ", in " + state.useful.runs + " pieces" : "") + ". The other " + (clearCount - shown) +
          " were left out because the 3D guess is not good enough there, so the replay jumps over them.");
      }
      if (stopLater !== null || stopEarlier !== null) {
        notes.push("The camera cut or swung away" +
          (stopEarlier !== null ? " at " + stopEarlier.toFixed(1) + " s" : "") +
          (stopEarlier !== null && stopLater !== null ? " and" : "") +
          (stopLater !== null ? " at " + stopLater.toFixed(1) + " s" : "") +
          ", so the coach stopped following there.");
      }
      var typical = M.percentile(heights, 0.5);
      if (typical < SMALL_SKATER) {
        notes.push("The skater is small in this video (about " + Math.round(typical * 100) +
          "% of the picture height), so the angles are rough estimates. Film closer for better numbers.");
      }
      if (raw.length < n * 0.5) {
        notes.push("Only " + raw.length + " of " + n + " frames could be measured. The skater was hidden, blurry or too far away in the rest.");
      }
      if (cutOff > 0) {
        notes.push(cutOff + " frames were skipped because part of the skater was outside the picture.");
      }
      if (state.analysis && state.analysis.sideOn) {
        notes.push("Knee bend and lean come from the " + state.analysis.sideOn + " of " + shown +
          " frames where the skater was seen from the side. The other frames are dimmed in the replay bar.");
      } else if (sideCount > 0) {
        notes.push("Only " + sideCount + " frames showed the skater from the side, too few to rely on, so knee bend and lean are rough estimates.");
      } else {
        notes.push("The skater was never seen from the side, so knee bend and lean are rough estimates.");
      }
      notes.push("Angles are most accurate when the skater is filmed from the side.");
      el.qualityNote.textContent = notes.join(" ");
      el.qualityNote.hidden = false;
      say("Analysis complete. Check the video below: the white skeleton should sit on your skater.");
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : String(err);
      if (/import|fetch|network|load/i.test(msg) && !/video|skater|frames/i.test(msg)) {
        // The pose-finding model is downloaded from the internet the first
        // time. On our website and on your own computer that works; a few
        // "preview" windows inside other apps block it.
        msg = "The pose-detection model could not load. Check the internet connection and try again. " +
          "(Some online previews block it. If so, download the project and open index.html on your computer.)";
      }
      say(msg);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Buttons and choosers --------------------------------------

  var videoUrl = null;
  el.videoFile.addEventListener("change", function () {
    var file = el.videoFile.files[0];
    el.fileName.textContent = file ? file.name : "No video selected";
    state.seed = null;
    updateAnalyzeButton();
    if (!file) return;
    // Show the video. It stays on this computer.
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    clearReport();   // the old report belongs to the old video
    el.videoPanel.hidden = false;
    el.seedInfo.textContent = "Click the skater in the video.";
    el.preview.src = videoUrl;
    el.preview.load();
    say("Video ready. Click the skater you want to analyze.");
  });
  // When the video knows how long it is, set up the frame slider.
  el.preview.addEventListener("loadedmetadata", function () {
    var d = isFinite(el.preview.duration) ? el.preview.duration : 0;
    el.pickTime.max = String(Math.max(0, d - 0.05));
    el.pickTime.step = "0.05";
    el.pickTime.value = "0";
    el.pickOut.textContent = "0.0 s";
    clearOverlay();
    // Show the first picture (some browsers show black until you seek).
    try { el.preview.currentTime = 0.01; } catch (e) { /* fine */ }
  });
  el.analyze.addEventListener("click", analyzeVideo);
  // If you drag along the timeline quickly, the video can still be busy
  // jumping to an earlier spot. When it is done, send it to the newest one.
  el.preview.addEventListener("seeked", function () {
    if (state.busy || state.playing || !state.hasVideo || !state.frames) return;
    var want = state.times[state.index];
    if (Math.abs(el.preview.currentTime - want) > 0.03) {
      try { el.preview.currentTime = want; } catch (e) { /* fine */ }
    }
  });

  // ---- For the team only: measuring a pro's stride ----
  // Open the page with "?dev" at the end of the address. After analyzing
  // a clip of a strong skater, the "Copy stride measurements" button
  // copies the numbers (see measure.js) so we can save them in
  // data/pro-stride-measured.json. Only numbers are copied, never video.
  if (DEV && window.CoachMeasure) {
    var copyBtn = make("button", null, "Copy stride measurements");
    copyBtn.type = "button";
    document.querySelector(".replay-controls").appendChild(copyBtn);
    copyBtn.addEventListener("click", function () {
      if (!state.frames) return;
      var r = window.CoachMeasure.measureStride(state.frames, state.times, state.rhythm);
      var out = {
        clip: el.fileName.textContent, measuredOn: new Date().toISOString().slice(0, 10),
        posesUsed: state.frames.length, sideViewPoses: state.analysis.sideOn,
        pushesUsed: r.used, pushesDropped: r.dropped, numbers: r.numbers, curves: r.curves,
        // every picture, one by one: [seconds, left knee, right knee, left elbow, right elbow, lean]
        everyPicture: window.CoachMeasure.everyPicture(state.frames, state.times)
      };
      window.CoachStrideMeasured = out;
      var text = JSON.stringify(out, function (k, v) { return typeof v === "number" ? Math.round(v * 1000) / 1000 : v; }, 1);
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () { /* still in window.CoachStrideMeasured */ });
      say(r.numbers ? "Copied the measurements of " + r.used + " pushes (" + r.dropped + " thrown away)."
                    : "Only " + r.used + " whole pushes found. That is too few to measure a stride.");
    });
  }

  el.age.addEventListener("change", refresh);
  el.refMode.addEventListener("change", refresh);
  Array.prototype.forEach.call(document.querySelectorAll('input[name="level"]'), function (r) {
    r.addEventListener("change", refresh);
  });

  // Load a targets.json file that a kid edited.
  el.targetsFile.addEventListener("change", function () {
    var file = el.targetsFile.files[0];
    if (!file) return;
    file.text().then(function (text) {
      var t = JSON.parse(text);
      if (!targetsLookRight(t)) throw new Error("missing numbers");
      state.targets = t;
      refresh();
      say("Loaded target angles from " + file.name + ".");
    }).catch(function () {
      say("That targets file has a mistake in it. Check the commas, quotes and numbers.");
    });
  });

  // When the page is on a web server, read targets.json directly.
  // (When you double-click index.html the browser blocks this, and we
  //  just keep the copy from js/default-targets.js.)
  if (window.fetch && location.protocol !== "file:") {
    fetch("targets.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (t) { if (targetsLookRight(t)) { state.targets = t; refresh(); } })
      .catch(function () { /* keep the built-in copy */ });
  }

  refresh();
})();
