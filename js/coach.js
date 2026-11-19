// =====================================================================
//  coach.js  --  THE COACH: YOUR VIDEO, YOUR POSE, YOUR REPORT
//
//  What happens here, step by step:
//    1. You pick a video, your age, and Beginner or Experienced.
//    2. A pose-finding AI (MediaPipe) looks at about 10 pictures per
//       second of the video and finds your joints in each one.
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
  var C = window.Coach3D;
  if (!C) return; // the 3D picture did not start, so there is nothing to do

  // Where the pose-finding AI lives on the internet.
  var MP_VERSION = "0.10.14";
  var MP_CODE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION + "/vision_bundle.mjs";
  var MP_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION + "/wasm";
  var MP_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

  var MAX_FRAMES = 150;     // never look at more pictures than this
  var FRAME_GAP = 0.1;      // seconds between pictures (10 per second)
  var MIN_VISIBILITY = 0.5; // how sure the AI must be that it sees a joint

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
    play: $("play-btn"), speed: $("speed"), worst: $("worst-btn"),
    frameInfo: $("frame-info"), timeline: $("timeline")
  };

  // Everything the coach remembers while the page is open.
  var state = {
    targets: window.DEFAULT_TARGETS,
    frames: null,     // the kid's poses, turned to face the same way as the pro
    times: null,      // the time in the video of each pose (seconds)
    analysis: null,   // scores for every pose
    index: 0,         // which pose we are showing now
    playing: false,
    playClock: 0,
    hasVideo: false,
    busy: false
  };

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
      state.analysis = M.analyzeFrames(state.frames, target, state.targets.yellowZone);
      drawCards(target);
      drawTimeline();
      showFrame(state.index);
    }
  }

  // ---------- Showing one moment on the orange skater -----------------

  // Is this moment at (or right next to) the top of a push?
  function nearPeak(i) {
    var f = state.analysis.perFrame;
    return !!(f[i].isPeak || (f[i - 1] && f[i - 1].isPeak) || (f[i + 1] && f[i + 1].isPeak));
  }

  function showFrame(i) {
    var n = state.frames.length;
    i = M.clamp(i, 0, n - 1);
    state.index = i;
    var pose = state.frames[i], f = state.analysis.perFrame[i], peak = nearPeak(i);

    // Pick the traffic-light color for each joint.
    var grades = {};
    grades[f.m.glideSide + "Knee"] = f.scores.kneeBend.grade;   // knee bend -> glide knee
    grades.lHip = grades.rHip = grades.neck = f.scores.forwardLean.grade; // lean -> hips and neck
    if (peak) grades[f.m.pushSide + "Knee"] = f.scores.strideExtension.grade; // push -> push knee

    C.kidFigure.update(pose, grades);
    C.decorate(C.kidFigure, pose, {
      knee: COLORS[f.scores.kneeBend.grade],
      lean: COLORS[f.scores.forwardLean.grade],
      push: COLORS[f.scores.strideExtension.grade]
    }, peak);

    el.frameInfo.textContent = "Frame " + (i + 1) + " / " + n + "  ·  " + state.times[i].toFixed(1) + " s";
    drawTimeline();

    // Show the same moment in the little video.
    if (state.hasVideo && !el.preview.seeking) {
      try { el.preview.currentTime = state.times[i]; } catch (e) { /* video not ready - no problem */ }
    }
  }

  // ---------- The report cards ----------------------------------------

  function make(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function drawCards(target) {
    var summary = state.analysis.summary, stars = 0;
    el.cards.textContent = "";
    CHECKS.forEach(function (check) {
      var s = summary[check.id], range = target[check.id];
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
    el.stars.textContent = stars + " of " + CHECKS.length + " on target";
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
        nearPeak(i) ? COLORS[f.scores.strideExtension.grade] : COLORS.none
      ];
      for (var r = 0; r < 3; r++) {
        g.fillStyle = rows[r];
        g.fillRect(x, r * (ROW_H + ROW_GAP), Math.ceil(cell), ROW_H);
      }
    }
    // A bright box around the moment we are showing now.
    g.strokeStyle = "#ffffff"; g.lineWidth = 2;
    g.strokeRect(state.index * cell + 1.5, 1.5, Math.max(cell - 3, 3), h - 3);
  }

  // Click or drag on the timeline to jump to that moment.
  function timelineJump(ev) {
    if (!state.frames) return;
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
    if (!state.frames) return;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.preventDefault();
      setPlaying(false);
      showFrame(state.index + (ev.key === "ArrowRight" ? 1 : -1));
    }
  });
  window.addEventListener("resize", drawTimeline);

  // ---------- Playing the replay ---------------------------------------

  function setPlaying(on) {
    if (on && state.frames) {
      // If we are at the end, start over.
      if (state.index >= state.frames.length - 1) state.index = 0;
      state.playClock = state.times[state.index];
      showFrame(state.index);
    }
    state.playing = !!(on && state.frames);
    el.play.textContent = state.playing ? "Pause" : "Play";
  }
  el.play.addEventListener("click", function () { setPlaying(!state.playing); });
  el.worst.addEventListener("click", function () {
    if (!state.analysis) return;
    setPlaying(false);
    showFrame(state.analysis.worstFrame);
  });

  // scene.js calls this about 60 times a second.
  C.onTick.push(function (dt) {
    if (!state.playing) return;
    state.playClock += dt * Number(el.speed.value);
    var i = state.index, last = state.frames.length - 1;
    while (i < last && state.times[i + 1] <= state.playClock) i++;
    if (i !== state.index) showFrame(i);
    if (i >= last) setPlaying(false);
  });

  // ---------- Starting a new report ------------------------------------

  // rawFrames = poses straight from the AI. times = seconds for each.
  function startReport(rawFrames, times, hasVideo) {
    state.frames = M.normalizeFrames(rawFrames);
    state.times = times;
    state.hasVideo = hasVideo;
    state.index = 0;
    el.preview.hidden = !hasVideo;
    el.results.hidden = false;
    C.layout(true);
    refresh();
    setPlaying(true);
  }

  el.demo.addEventListener("click", function () {
    if (state.busy) return;
    var raw = M.makeDemoFrames();
    startReport(raw, raw.map(function (_, i) { return i * FRAME_GAP; }), false);
    say("Sample session loaded: a skater who stands a little too tall and tires near the end.");
  });

  // ---------- The pose-finding AI (MediaPipe) --------------------------

  var landmarkerPromise = null; // we only load the AI one time
  var lastStamp = 0;            // the AI wants a time stamp that always goes up

  function loadPoseFinder() {
    if (!landmarkerPromise) {
      landmarkerPromise = (async function () {
        var vision = await import(MP_CODE);
        var files = await vision.FilesetResolver.forVisionTasks(MP_WASM);
        async function build(delegate) {
          return vision.PoseLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: MP_MODEL, delegate: delegate },
            runningMode: "VIDEO",
            numPoses: 1 // we coach one skater at a time
          });
        }
        // Try the fast graphics chip first. If that fails, use the normal chip.
        try { return await build("GPU"); } catch (e) { return await build("CPU"); }
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
    var ready = waitFor(video, "seeked", 2000);
    video.currentTime = t;
    await ready;
  }

  function setBusy(on) {
    state.busy = on;
    el.analyze.disabled = on || !el.videoFile.files.length;
    el.demo.disabled = on;
    el.videoFile.disabled = on;
    el.progress.hidden = !on;
  }

  async function analyzeVideo() {
    if (state.busy || !el.videoFile.files.length) return;
    setBusy(true);
    setPlaying(false);
    el.progressBar.removeAttribute("value"); // "thinking" look
    try {
      say("Loading the pose-detection model. The first run takes a little while.");
      var finder = await loadPoseFinder();

      var video = el.preview;
      if (video.readyState < 2) await waitFor(video, "loadeddata", 8000);
      var duration = video.duration;
      if (!isFinite(duration) || duration <= 0 || !video.videoWidth) {
        throw new Error("That video could not be opened. Try an MP4 or MOV file.");
      }

      var gap = Math.max(FRAME_GAP, duration / MAX_FRAMES);
      var raw = [], times = [], looked = 0;
      for (var t = gap / 2; t < duration; t += gap) {
        await seek(video, t);
        lastStamp += 100;
        var result = finder.detectForVideo(video, lastStamp);
        looked++;
        var world = result.worldLandmarks && result.worldLandmarks[0];
        var flat = result.landmarks && result.landmarks[0];
        // Keep this picture only if the AI can see the body and legs.
        if (world && M.poseIsClear(flat || world, MIN_VISIBILITY)) {
          raw.push(M.mediapipeToPose(world));
          times.push(t);
        }
        el.progressBar.value = t / duration;
        say("Analyzing video: " + Math.round(t / duration * 100) + "%");
      }

      if (raw.length < 5) {
        throw new Error("A full skater was visible in only " + raw.length + " of " + looked +
          " frames. Try a video filmed from the side, with the whole body in the frame.");
      }
      startReport(raw, times, true);
      say("Analysis complete. Pose found in " + raw.length + " of " + looked + " frames.");
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : String(err);
      if (/import|fetch|network|load/i.test(msg) && !/video|skater/i.test(msg)) {
        msg = "The pose-detection model could not load. Check the internet connection and try again.";
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
    el.analyze.disabled = !file;
    el.fileName.textContent = file ? file.name : "No video selected";
    if (!file) return;
    // Show the video in the little player. It stays on this computer.
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    el.preview.src = videoUrl;
    el.preview.load();
    say("Video ready. Press Analyze video.");
  });
  el.analyze.addEventListener("click", analyzeVideo);

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
