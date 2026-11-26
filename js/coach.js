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
//       green / yellow / red, and the replay's curve shows where form
//       slips. Tap a card in the report and the 3D view goes to that joint.
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
  var Rb = window.CoachRebuild;   // rebuilds a smooth stride from the wobbly pictures (rebuild.js)
  var UI = window.CoachUI;        // the little movements of the page (ui.js)

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

  // The colors of the signs next to the orange skater (one per grade)
  // and of what we draw on the video. They come from the look of the
  // page (theme.js) and change when you flip the switch in the top bar.
  var Theme = window.CoachTheme;
  var COLORS = Theme.now().signs;
  var INK = Theme.now().overlay;

  // The three checks, with the words we show for each one.
  //   tip   = the advice on the card
  //   short = the same advice in a few words, for the top of the report
  //   line  = what the curve in the replay shows for this check
  var CHECKS = [
    {
      id: "kneeBend", name: "Knee bend", low: 60, high: 180, line: "your knee angle",
      short: function (off) {
        return off > 0 ? "Bend your knees about " + off + "° more" : "Come up about " + (-off) + "°, your bend is very deep";
      },
      tip: function (off) {
        if (off === 0) return "Knee bend is in the target range. That is where your power comes from.";
        if (off > 0) return "Bend your knees about " + off + "° more. Sit back as if lowering onto a chair.";
        return "Very deep bend. You can rise about " + (-off) + "° and still keep your power.";
      }
    },
    {
      id: "forwardLean", name: "Forward lean", low: 0, high: 90, line: "your forward lean",
      short: function (off) {
        return off < 0 ? "Lean your chest forward about " + (-off) + "° more" : "Lift your chest about " + off + "°";
      },
      tip: function (off) {
        if (off === 0) return "Forward lean is in the target range. Chest forward, eyes up.";
        if (off < 0) return "Lean your chest forward about " + (-off) + "° more. Nose over knees, knees over toes.";
        return "Too much lean. Lift your chest about " + off + "° so you can see the ice.";
      }
    },
    {
      id: "strideExtension", name: "Stride extension", low: 90, high: 180, line: "the angle of your pushing leg",
      short: function (off) {
        return off < 0 ? "Straighten the pushing leg about " + (-off) + "° more" : "Keep a slight bend at the end of the push";
      },
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
    analyze: $("analyze-btn"), analyzeLabel: $("analyze-label"), demo: $("demo-btn"),
    status: $("status"), videoStatus: $("video-status"), refMode: $("ref-mode"),
    loading: $("loading"), steps: $("steps"), stepPercent: $("step-percent"),
    view: $("view-form"), report: $("report"), startVideo: $("start-video"), startDemo: $("start-demo"),
    targetInfo: $("target-info"), targetsFile: $("targets-file"),
    results: $("results"), cards: $("cards"), preview: $("preview"),
    verdict: $("verdict"), ring: $("ring"), ringFill: $("ring-fill"), ringCount: $("ring-count"), ringTotal: $("ring-total"),
    verdictEyebrow: $("verdict-eyebrow"), verdictMain: $("verdict-main"), verdictRest: $("verdict-rest"),
    videoPanel: $("video-panel"), overlay: $("overlay"), pickTime: $("pick-time"), pickOut: $("pick-out"),
    seedInfo: $("seed-info"), trackInfo: $("track-info"), qualityNote: $("quality-note"),
    qualityMore: $("quality-more"), qualityLong: $("quality-long"),
    kidNote: $("kid-note"), kidMore: $("kid-more"), kidLong: $("kid-long"),
    play: $("play-btn"), speed: $("speed"), worst: $("worst-btn"),
    frameInfo: $("frame-info"), curve: $("curve"), curveKey: $("curve-key"), curveNote: $("curve-note")
  };
  // The curve in the replay (chart.js draws it).
  var curve = window.CoachChart && el.curve ? new window.CoachChart.Curve(el.curve) : null;

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
    rebuilt: null,    // the stride rebuilt from all the poses (see rebuild.js)
    kidNow: null,     // smooth mode: the clock and the numbers of the moment we are showing
    looping: false,   // smooth mode: the skaters stride round and round (not following the video)
    target: null,     // the target ranges for this age and level
    awaitReveal: false, // a new report is waiting to be seen: its entrance has not played yet
    shown: null,      // the numbers the report cards show now (so they can glide to new ones)
    reveal: null,     // what must move when the waiting report is seen (numbers, marks, the ring)
    stopWatching: null, // calls off the wait for the report to be seen
    stopCurve: null,  // calls off the wait for the curve to be seen
    curve: "kneeBend",// which check the curve in the replay shows
    focus: null,      // the check whose card you tapped: the 3D view looks at that joint (or null)
    index: 0,         // which pose we are showing now
    playing: false,
    playClock: 0,
    hasVideo: false,
    busy: false
  };

  // Lets us look inside from the browser's console while testing.
  window.CoachState = state;

  // Say something in the status line (and in its twin next to the video,
  // so you also see it there on a phone).
  function say(text) {
    el.status.textContent = text;
    if (el.videoStatus) el.videoStatus.textContent = text;
  }

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

    state.target = target;
    if (state.frames) {
      state.analysis = M.analyzeFrames(state.frames, target, state.targets.yellowZone, state.span, state.flat, state.rhythm);
      // (If the clip shows no full push, the rebuilt skater's push is drawn
      //  at the low end of the goal for this age. The note says so.)
      state.rebuilt = Rb ? Rb.build(state.frames, state.times, state.rhythm, state.analysis, { standardPush: target.strideExtension.min }) : null;
      showKidNote();
      drawCards(target);
      drawCurve();
      // (While the replay is playing, the next tick redraws by itself.
      //  Redrawing here would make the video jump back a little.)
      // If the skaters were striding in the loop, they keep striding.
      if (state.looping && smoothOn()) startLoop();
      else if (!state.playing) showFrame(state.index);
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
    state.looping = false;   // we are showing one moment of the video again
    if (smoothOn()) {
      // SMOOTH STRIDE: we do not copy this one picture. We tell the 3D
      // view where the skater is in the stride and what their numbers are
      // around this moment; it then draws the rebuilt skater and the pro
      // on the same clock (see drawSmoothKid below).
      state.kidNow = Rb.at(state.rebuilt, i, blend);
      C.setSync({ cycle: state.kidNow.cycle, drawKid: drawSmoothKid, label: "Loop my stride", onButton: startLoop });
    } else {
      // PICTURE BY PICTURE: the pose the AI saw in this one picture.
      // Only used when the smooth stride could not be built (fewer than
      // 3 good pictures), and in measuring mode ("?dev" in the address).
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

      // Tell the pro where the kid is in the stride, so they move together.
      var r = state.rhythm[i], next = state.rhythm[Math.min(n - 1, i + 1)];
      var push = blend > 0 && next.side === r.side ? M.lerpNum(r.push, next.push, blend) : r.push;
      // Turn "how far out is the leg" into "how far through the stride":
      // 0 to 0.5 while the leg goes out, 0.5 to 1 while it comes back.
      var part = Math.asin(Math.sqrt(M.clamp(push / r.peak, 0, 1))) / Math.PI;
      C.setSync({ push: push, side: r.side, phase: r.rising ? part : 1 - part, stride: r.stride });
    }
    el.curve.setAttribute("aria-valuenow", String(i + 1));
    el.curve.setAttribute("aria-valuemin", "1");
    el.curve.setAttribute("aria-valuemax", String(n));

    var now = blend > 0 ? M.lerpNum(state.times[i], state.times[i + 1], blend) : state.times[i];
    var info = "Frame " + (i + 1) + " / " + n + "  ·  " + now.toFixed(1) + " s";
    if (el.frameInfo.textContent !== info) el.frameInfo.textContent = info;
    if (curve) curve.cursor(i, blend);   // the marker on the curve

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

  // ---------- The smooth orange skater --------------------------------
  // One picture from the AI is wobbly, but all the good pictures
  // together tell us HOW this skater skates: how bent the knee is, how
  // far they lean, how far they push, and their rhythm (rebuild.js).
  // The orange skater skates exactly that way, with
  // the same stride builder as the pro and on the same clock. So what
  // looks different between the two IS different.

  // Is the orange skater showing the rebuilt stride? Yes, whenever it
  // could be built. (In measuring mode we want every picture as it is.)
  function smoothOn() { return !DEV && !!state.rebuilt && state.rebuilt.ok; }

  // The numbers the orange skater has right now. They glide toward the
  // numbers of the moment we are showing, so nothing snaps.
  var kidLive = null;
  var KID_NUMBERS = ["kneeBend", "forwardLean", "pushRight", "pushLeft"];

  // scene.js calls this right after it has drawn the pro.
  //   cycle = where the pro is in the stride (0 to 1); the kid goes there too
  //   dt    = seconds since the last picture
  function drawSmoothKid(cycle, dt) {
    var want = state.kidNow;
    if (!want || !smoothOn()) return;
    if (!kidLive) kidLive = {};
    var ease = 1 - Math.exp(-(dt || 0) / 0.2);
    KID_NUMBERS.forEach(function (k) {
      kidLive[k] = kidLive[k] === undefined ? want[k] : kidLive[k] + (want[k] - kidLive[k]) * ease;
    });
    var skating = Rb.poseAt(cycle, kidLive), pose = skating.pose;
    var glide = skating.glideSide, pushing = skating.pushSide || (glide === "r" ? "l" : "r");

    // The traffic-light colors come from the skater's steady numbers, so
    // they do not flicker while the legs move.
    var zone = state.targets.yellowZone, target = state.target;
    var kneeGrade = M.scoreAngle(kidLive.kneeBend, target.kneeBend, zone).grade;
    var leanGrade = M.scoreAngle(kidLive.forwardLean, target.forwardLean, zone).grade;
    var pushGrade = M.scoreAngle(pushing === "r" ? kidLive.pushRight : kidLive.pushLeft, target.strideExtension, zone).grade;
    var showPush = !!skating.pushSide && state.rebuilt.pushSeen;   // no push sign if no push was measured
    var grades = {};
    grades[glide + "Knee"] = kneeGrade;
    grades.lHip = grades.rHip = grades.neck = leanGrade;
    if (showPush) grades[pushing + "Knee"] = pushGrade;

    C.kidFigure.update(pose, grades, { edges: skating.edges });
    // The signs say what the legs are doing at this very moment, like the
    // pro's signs do. No elbow signs: the arms are not measured here.
    C.decorate(C.kidFigure, pose, { knee: COLORS[kneeGrade], lean: COLORS[leanGrade], push: COLORS[pushGrade], elbow: false }, showPush, {
      glideSide: glide, pushSide: pushing, forwardLean: M.measurePose(pose).forwardLean,
      kneeBend: M.angleAt(pose[glide + "Hip"], pose[glide + "Knee"], pose[glide + "Ankle"]),
      strideExtension: M.angleAt(pose[pushing + "Hip"], pose[pushing + "Knee"], pose[pushing + "Ankle"])
    });
  }

  // THE LOOP. A clip often has only a second or two of useful pictures,
  // too short to really watch. In the loop the orange skater and the pro
  // stride round and round, the orange one with the numbers of the whole
  // clip (the same numbers as the report cards). It starts by itself
  // when the replay ends, or with the button on the 3D picture.
  function startLoop() {
    if (!smoothOn()) return;
    setPlaying(false);
    var r = state.rebuilt, a = r.angles;
    state.looping = true;
    state.kidNow = {
      kneeBend: r.overall.kneeBend, forwardLean: r.overall.forwardLean,
      // (left and right apart only when the coach saw both clearly)
      pushRight: a.sidesApart ? M.percentile(a.pushRight, 0.5) : r.overall.strideExtension,
      pushLeft: a.sidesApart ? M.percentile(a.pushLeft, 0.5) : r.overall.strideExtension
    };
    C.setSync({
      // One stride takes the skater's own time, slowed down by the Speed chooser.
      loop: function () { return r.clock.secondsPerCycle / Number(el.speed.value); },
      drawKid: drawSmoothKid, label: "Stop the loop", pressed: true, onButton: stopLoop
    });
  }
  function stopLoop() {
    state.looping = false;
    if (state.frames) showFrame(state.index);   // back to the moment the replay is at
  }
  // The replay was stopped by something other than the replay's own
  // buttons (a click on the video, the video's frame slider). The 3D
  // skaters then go on striding instead of standing frozen.
  function keepStriding() {
    if (state.frames && smoothOn() && !state.looping) startLoop();
  }

  // The line under the report that says what the orange skater is showing.
  function showKidNote() {
    var r = state.rebuilt, can = !!(r && r.ok);
    el.kidNote.hidden = !state.frames;
    el.kidMore.hidden = true;
    if (!state.frames) return;
    // "text" stays in plain sight. Anything that is NOT the skater's own
    // (a standard push, a standard rhythm) must be said there.
    // "more" is the longer explanation, folded away until you ask.
    var text, more = "";
    if (smoothOn()) {
      var o = r.overall, a = r.angles;
      // (A real video: say how many pictures the coach could read in all.)
      var outOf = state.useful && state.useful.total > r.pictures ? " (of " + state.useful.total + " the coach could read)" : "";
      text = "The " + Theme.word("you") + " skater is your stride, rebuilt from " + r.pictures + " good pictures" + outOf + ". " +
        "The legs and the lean are yours. The arms, the stick and how the skates tip are drawn the standard way. " +
        (r.pushSeen ? "" : "The coach saw no full push in this clip, so the push is NOT yours: it is drawn at a standard " +
          Math.round(o.strideExtension) + "°. ") +
        (r.rhythmFound ? "" : "We could not find your rhythm in this clip, so it strides at an even, standard pace. ") +
        (a.sidesApart ? "Your right push and your left push differ: " + Math.round(M.percentile(a.pushRight, 0.5)) + "° and " +
          Math.round(M.percentile(a.pushLeft, 0.5)) + "°. " : "");
      more = "The rebuilt stride uses knee bend " + Math.round(o.kneeBend) + "°, lean " + Math.round(o.forwardLean) + "°" +
        (r.pushSeen ? ", push " + Math.round(o.strideExtension) + "°" : "") +
        (r.rhythmFound ? ", and one stride every " + r.clock.secondsPerCycle.toFixed(1) + " s" : "") + ". " +
        "One picture alone is wobbly, but the middle value of many pictures can be trusted, so the coach works out HOW you skate and lets a smooth skater skate that way. " +
        "A one-time stumble does not show here. " +
        "When the replay ends, both skaters keep striding so you can keep comparing.";
    } else if (!can) {
      // Too few good pictures to rebuild a stride from.
      text = "The coach could not rebuild a smooth stride from this clip, so the " + Theme.word("you") +
        " skater shows the poses picture by picture, as the AI saw them. " + (r ? r.why : "");
    } else {
      // Measuring mode ("?dev" in the address).
      text = "Measuring mode: the " + Theme.word("you") + " skater shows the poses as the AI saw them, picture by picture.";
    }
    el.kidNote.textContent = text;
    el.kidMore.hidden = !more;
    el.kidLong.textContent = more;
  }

  // The look of the page changed (the switch in the top bar): take the
  // new colors and draw the picture we are showing once more.
  // The long note about how much of the video was used. It may name
  // your skater's color ("{you}"), which depends on the look.
  function showQuality() {
    el.qualityLong.textContent = (state.qualityNotes || "").replace("{you}", Theme.word("you"));
  }
  Theme.onChange(function (look) {
    COLORS = look.signs;
    INK = look.overlay;
    showKidNote();     // its note says "the orange skater" (or "the pink skater")
    showQuality();
    if (state.frames && state.frames.length) {
      // (A playing replay and the striding loop redraw by themselves.)
      if (!state.playing && !(state.looping && smoothOn())) showFrame(state.index);
    } else if (state.seed) {
      drawSeed();
    }
  });

  // ---------- The report cards ----------------------------------------

  function make(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Layer 1 of the report: the ring ("1 / 3 on target") and the ONE
  // thing to work on next. Gives back what must move once the report
  // is seen (the ring filling up, its number counting).
  function drawVerdict(fresh) {
    var summary = state.analysis.summary;
    var ids = CHECKS.map(function (c) { return c.id; });
    var measured = ids.filter(function (id) { return summary[id]; });
    var good = measured.filter(function (id) { return summary[id].grade === "good"; }).length;
    var focusId = M.nextFocus(summary, ids);
    var focus = CHECKS.filter(function (c) { return c.id === focusId; })[0];

    // The ring's color says how it went: green = all, red = none.
    var mood = !measured.length ? "" : good === measured.length ? "good" : good === 0 ? "far" : "close";
    el.verdict.className = "verdict " + mood;
    el.ring.setAttribute("aria-label", good + " of " + measured.length + " on target");
    el.ringTotal.textContent = String(measured.length);

    if (focus) {
      var off = Math.round(summary[focusId].off);
      if (off === 0) off = summary[focusId].off > 0 ? 1 : -1;   // "0° more" would make no sense
      el.verdictEyebrow.textContent = "Work on this next";
      el.verdictEyebrow.className = "eyebrow " + summary[focusId].grade;
      el.verdictMain.textContent = focus.short(off);
    } else {
      el.verdictEyebrow.textContent = "All on target";
      el.verdictEyebrow.className = "eyebrow good";
      el.verdictMain.textContent = "Every number we measured is in the target range for this age.";
    }
    // The other checks, each in a few words.
    el.verdictRest.textContent = "";
    CHECKS.forEach(function (check) {
      if (check.id === focusId) return;
      var s = summary[check.id];
      var li = make("li");
      li.appendChild(make("span", "dot " + (s ? s.grade : "none")));
      li.appendChild(document.createTextNode(check.name + ": " + (s ? GRADE_WORDS[s.grade].toLowerCase() : "not seen")));
      el.verdictRest.appendChild(li);
    });

    var dash = UI ? UI.ringDash(measured.length ? good / measured.length : 0, 27) : null;
    var before = state.shown && state.shown.good !== undefined ? state.shown.good : good;
    if (dash) {
      el.ringFill.style.strokeDasharray = dash.around + " " + dash.around;
      if (fresh) el.ringFill.style.strokeDashoffset = dash.around;   // starts empty
      el.ringFill.style.opacity = good ? 1 : 0;
    }
    el.ringCount.textContent = String(fresh ? 0 : before);
    return {
      good: good,
      move: function () {
        if (dash) el.ringFill.style.strokeDashoffset = dash.hidden;
        if (UI) UI.count(el.ringCount, fresh ? 0 : before, good, fresh ? 700 : 300);
        else el.ringCount.textContent = String(good);
      }
    };
  }

  // Layer 2 of the report: one card for each check.
  //   A new report makes an entrance: the cards rise one after another,
  //   the numbers count up and the ruler marks slide to their place.
  //   It plays when the report is SEEN (on a phone, after scrolling down).
  //   When only the age or level changes, numbers and marks glide over.
  function drawCards(target) {
    var summary = state.analysis.summary;
    var fresh = state.awaitReveal && !!UI;
    var before = state.shown || {}, now = {}, movers = [];
    var verdict = drawVerdict(fresh);
    now.good = verdict.good;
    movers.push(verdict.move);

    el.cards.textContent = "";
    CHECKS.forEach(function (check, n) {
      var s = summary[check.id], range = target[check.id];
      if (!s) {
        // We could not measure this one (no clear push in the clip).
        var none = make("div", "check" + (fresh ? " enter" : ""));
        none.style.setProperty("--i", n);
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
        return;
      }
      var card = make("div", "check " + s.grade + (fresh ? " enter" : ""));
      card.style.setProperty("--i", n);   // which card this is: the later ones rise a moment later
      // The card is also a button: tap it and the 3D view goes to that joint.
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.setAttribute("data-check", check.id);
      card.setAttribute("aria-label", check.name + ": " + Math.round(s.value) + " degrees, " + GRADE_WORDS[s.grade].toLowerCase() +
        ". Show this on the skater.");
      var head = make("div", "check-head");
      head.appendChild(make("span", "check-name", check.name));
      head.appendChild(make("span", "chip", GRADE_WORDS[s.grade]));
      card.appendChild(head);
      var value = Math.round(s.value);
      var nums = make("div", "check-nums");
      var big = make("span", "big"), number = make("span", "", String(value));
      big.appendChild(number);
      big.appendChild(make("span", "deg", "°"));
      nums.appendChild(big);
      nums.appendChild(make("span", "goal", "Target " + rangeText(range)));
      card.appendChild(nums);

      // A ruler: the green part is the goal, the mark is you.
      var ruler = make("div", "ruler");
      var span = check.high - check.low;
      var track = make("div", "ruler-track"), zone = make("div", "ruler-goal");
      var zoneLeft = (range.min - check.low) / span * 100, zoneWide = (range.max - range.min) / span * 100;
      var spot = M.clamp((s.value - check.low) / span, 0, 1) * 100;
      var you = make("div", "ruler-you");
      you.appendChild(make("div", "ruler-dot"));
      track.appendChild(zone);
      ruler.appendChild(track); ruler.appendChild(you);
      card.appendChild(ruler);
      // The green part is a box as wide as the ruler. We slide it to
      // where the goal starts and squeeze it to the goal's width.
      function placeZone(left, wide) { zone.style.transform = "translateX(" + left + "%) scaleX(" + wide / 100 + ")"; }

      card.appendChild(make("p", "tip", check.tip(Math.round(s.off))));
      card.appendChild(make("span", "check-look"));
      el.cards.appendChild(card);

      // Where the mark and the number START: at the low end for a new
      // report, or where they were before (so they glide to the new place).
      var was = before[check.id];
      var fromSpot = fresh ? 0 : was ? was.spot : spot;
      var fromValue = fresh ? check.low : was ? was.value : value;
      you.style.transform = "translateX(" + fromSpot + "%)";
      number.textContent = String(fromValue);
      // The green goal also glides when the age or level changes it.
      placeZone(was && !fresh ? was.zoneLeft : zoneLeft, was && !fresh ? was.zoneWide : zoneWide);
      movers.push(function () {
        placeZone(zoneLeft, zoneWide);
        you.style.transform = "translateX(" + spot + "%)";
        if (UI) UI.count(number, fromValue, value, fresh ? 700 : 300);
        else number.textContent = String(value);
      });
      now[check.id] = { spot: spot, value: value, zoneLeft: zoneLeft, zoneWide: zoneWide };
    });
    state.shown = now;
    lightCards();

    function go() { movers.forEach(function (move) { move(); }); }
    if (!fresh) {
      void el.cards.offsetWidth;   // the page notes the starting places first, then they move
      go();
      return;
    }
    // A new report: everything waits, unseen, until the report is on screen.
    state.reveal = go;
    el.results.classList.remove("reveal");
    el.results.classList.add("waiting");
    if (!state.stopWatching) {
      state.stopWatching = UI.whenSeen(el.verdict, function () {
        state.stopWatching = null;
        state.awaitReveal = false;
        el.results.classList.remove("waiting");
        el.results.classList.add("reveal");
        void el.cards.offsetWidth;
        state.reveal();
      });
    }
  }

  // ---------- Tap a card: look at that joint ----------------------------
  // Tapping a card does three things at once: the card lights up, the
  // 3D camera glides to that joint (the other signs fade), and the
  // curve in the replay shows that same number. Tap it again (or pick
  // Side, Front or Top) to see the whole skaters again.
  function lightCards() {
    Array.prototype.forEach.call(el.cards.querySelectorAll("[data-check]"), function (card) {
      var on = card.getAttribute("data-check") === state.focus;
      card.setAttribute("aria-pressed", String(on));
      card.querySelector(".check-look").textContent = on ? "Showing on the skater" : "Show on the skater";
    });
  }
  function setFocus(id) {
    state.focus = id;
    lightCards();
    if (id && state.curve !== id) pickCurve(id);
    C.focus(id);
  }
  function cardOf(ev) { return ev.target.closest ? ev.target.closest("[data-check]") : null; }
  el.cards.addEventListener("click", function (ev) {
    var card = cardOf(ev);
    if (!card || !state.frames) return;
    var id = card.getAttribute("data-check");
    setFocus(state.focus === id ? null : id);
  });
  // Enter or the space bar press the card, like any button.
  el.cards.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    var card = cardOf(ev);
    if (!card) return;
    ev.preventDefault();
    card.click();
  });
  // The 3D view ended the close look by itself (you picked Side, Front or Top).
  C.onFocus = function () { state.focus = null; lightCards(); };

  // ---------- The replay's curve ----------------------------------------
  // One line: the angle in every picture of the session, over a green
  // band (the target for this age). The switch above it picks which of
  // the three numbers it shows. chart.js does the drawing.

  var curveButtons = document.querySelectorAll("[data-curve]");

  function drawCurve() {
    if (!state.analysis || !curve) return;
    var id = state.curve, frames = state.analysis.perFrame, range = state.target[id];
    var check = CHECKS.filter(function (c) { return c.id === id; })[0];
    var push = id === "strideExtension";
    // The top of each push, with its grade.
    var peaks = [];
    frames.forEach(function (f, i) { if (f.isPeak) peaks.push({ i: i, grade: f.scores.strideExtension.grade }); });
    // Moments NOT seen from the side: their knee and lean numbers are
    // rough, and the summary does not use them. They are faded.
    var rough = !push && state.analysis.sideOn ? frames.map(function (f) { return !f.m.fromPicture; }) : null;
    var anyRough = !!rough && rough.some(function (r) { return r; });
    curve.set({
      values: frames.map(function (f) { return push ? f.m.strideExtension : f.scores[id].value; }),
      times: state.times, hole: HOLE, range: range, zone: state.targets.yellowZone,
      // The push leg is only graded at the top of each push, so its line
      // is plain and only the dots have a color.
      graded: !push, rough: anyRough ? rough : null, peaks: peaks, peaksOnLine: push
    });
    curve.cursor(state.index, 0);
    Array.prototype.forEach.call(curveButtons, function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-curve") === id));
    });
    el.curveKey.textContent = "Green band: the target, " + rangeText(range);
    el.curveNote.textContent = "The line is " + check.line + " in every picture. " +
      (push ? "Only the top of each push is graded: the dots should reach the green band. "
            : "Inside the green band is on target. ") +
      "Drag along the curve to move through the session." +
      (peaks.length && !push ? " The small marks along the bottom are the top of each push." : "") +
      (anyRough ? " The faded parts were not seen from the side, so they are rougher." : "");
  }
  // Show another number on the curve. The line draws itself again.
  function pickCurve(id) {
    state.curve = id;
    if (curve && state.analysis && !state.stopCurve) curve.shut();
    drawCurve();
    if (curve && state.analysis && !state.stopCurve) curve.open();
  }
  Array.prototype.forEach.call(curveButtons, function (b) {
    b.addEventListener("click", function () { pickCurve(b.getAttribute("data-curve")); });
  });

  // Click or drag on the curve to jump to that moment.
  function curveJump(ev) {
    if (!state.frames || state.busy || !curve) return;
    setPlaying(false);
    showFrame(curve.indexFrom(ev));
  }
  var dragging = false;
  el.curve.addEventListener("pointerdown", function (ev) { dragging = true; curveJump(ev); });
  el.curve.addEventListener("pointermove", function (ev) { if (dragging) curveJump(ev); });
  window.addEventListener("pointerup", function () { dragging = false; });
  window.addEventListener("pointercancel", function () { dragging = false; });
  // Arrow keys work too.
  el.curve.addEventListener("keydown", function (ev) {
    if (!state.frames || state.busy) return;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
      ev.preventDefault();
      setPlaying(false);
      showFrame(state.index + (ev.key === "ArrowRight" ? 1 : -1));
    }
  });
  // The curve is drawn to fit its box, so it is drawn again when the box changes size.
  var curveWide = 0;
  function fitCurve() {
    var wide = el.curve.clientWidth;
    if (wide && wide !== curveWide) { curveWide = wide; drawCurve(); }
  }
  if (window.ResizeObserver) new ResizeObserver(fitCurve).observe(el.curve);
  window.addEventListener("resize", fitCurve);

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
    if (i >= last || (state.hasVideo && el.preview.ended)) {
      setPlaying(false);
      // The replay is over. The skaters keep striding.
      if (smoothOn()) startLoop();
    }
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
    kidLive = null;   // a new skater: forget the last one's numbers
    state.looping = false;
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
    if (!hasVideo) { el.qualityNote.hidden = true; el.qualityMore.hidden = true; clearOverlay(); }
    // The report goes ABOVE the video now: the answer comes first.
    el.report.insertBefore(el.results, el.report.firstChild);
    el.results.hidden = false;
    // (These two words tell style.css how to lay out the page: with a
    //  report, a phone keeps a smaller 3D picture on top while you read.)
    el.view.classList.add("has-session", "has-report");
    state.awaitReveal = true;   // a new report: it makes its entrance when it is seen
    state.shown = null;
    state.focus = null;
    C.layout(true);
    refresh();
    // The curve starts on the number to work on next. Its line draws
    // itself when the curve is seen.
    var first = M.nextFocus(state.analysis.summary, CHECKS.map(function (c) { return c.id; })) || "kneeBend";
    if (first !== state.curve) { state.curve = first; drawCurve(); }
    if (curve && UI) {
      if (state.stopCurve) state.stopCurve();
      curve.shut();
      state.stopCurve = UI.whenSeen(el.curve, function () { state.stopCurve = null; curve.open(); });
    }
    setPlaying(true);
    showAnswer();
  }

  // Bring the answer into view. The 3D picture and the report start at
  // the very top of the page, so going to the top shows both: always
  // on a phone (everything is in one column there), and on a wide
  // screen whenever the report's top block fits on the first screen.
  // If it does not fit, we scroll just far enough to see that block.
  function showAnswer() {
    var gently = UI && UI.calm() ? "auto" : "smooth";
    requestAnimationFrame(function () {
      var oneColumn = window.matchMedia("(max-width: 900px)").matches;
      var bottom = el.verdict.getBoundingClientRect().bottom + window.scrollY;   // where the top block ends on the page
      if (oneColumn || bottom <= window.innerHeight) window.scrollTo({ top: 0, behavior: gently });
      else if (el.verdict.scrollIntoView) el.verdict.scrollIntoView({ block: "nearest", behavior: gently });
    });
  }

  // Forget the report on screen (used when a new video is chosen).
  function clearReport() {
    setPlaying(false);
    state.frames = state.analysis = state.rhythm = state.flat = state.track = state.rebuilt = state.kidNow = null;
    kidLive = null;
    state.looping = false;
    state.useful = null;
    state.awaitReveal = false;
    state.shown = null;
    if (state.stopWatching) { state.stopWatching(); state.stopWatching = null; }
    if (state.stopCurve) { state.stopCurve(); state.stopCurve = null; }
    state.focus = null;
    el.results.classList.remove("waiting", "reveal");
    el.view.classList.remove("has-report");
    showKidNote();
    state.hasVideo = false;
    state.index = 0;
    el.results.hidden = true;
    el.report.appendChild(el.results);   // back under the video, for the next report
    el.qualityNote.hidden = true;
    el.qualityMore.hidden = true;
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
      g.strokeStyle = INK.search; g.lineWidth = thin;
      g.strokeRect(win.x, win.y, win.size, win.size);
      g.setLineDash([]);
    }
    if (!det) return;
    var b = det.box;
    g.strokeStyle = INK.box; g.lineWidth = thin;
    g.strokeRect(b.cx - b.w / 2 - 6, b.cy - b.h / 2 - 6, b.w + 12, b.h + 12);
    g.strokeStyle = INK.bone; g.lineWidth = thin * 0.9; g.lineCap = "round";
    g.beginPath();
    BONES_2D.forEach(function (pair) {
      var p = det.pts[pair[0]], q = det.pts[pair[1]];
      g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
    });
    g.stroke();
    g.fillStyle = INK.dot;
    [11, 12, 23, 24, 25, 26, 27, 28].forEach(function (i) {
      g.beginPath(); g.arc(det.pts[i].x, det.pts[i].y, thin * 1.5, 0, Math.PI * 2); g.fill();
    });
  }

  // A ring that shows where you clicked.
  function drawSeed() {
    var g = clearOverlay(), W = el.overlay.width, H = el.overlay.height;
    if (!state.seed) return;
    var r = Math.max(14, W / 45);
    g.strokeStyle = INK.box; g.lineWidth = Math.max(3, W / 320);
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
    keepStriding();
    var t = Number(el.pickTime.value);
    el.pickOut.textContent = t.toFixed(1) + " s";
    try { el.preview.currentTime = t; } catch (e) { /* video not ready - no problem */ }
    clearOverlay();
  });

  // Click the skater.
  el.overlay.addEventListener("click", function (ev) {
    if (state.busy || !el.preview.videoWidth) return;
    setPlaying(false);
    keepStriding();
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
  // Gives back true when the picture is there, false when it did not
  // come in time.
  //   A fast computer needs a few hundredths of a second for a jump. A
  //   slow phone can need seconds, so we wait up to SEEK_WAIT. And we
  //   ask the video itself whether it is still jumping ("seeking"): a
  //   late "I am there" from an EARLIER jump must not fool us into
  //   looking at the wrong picture.
  var SEEK_WAIT = 6000;       // the longest we wait for one picture (milliseconds)
  var LATE_IN_A_ROW = 5;      // this many pictures in a row too late: we stop and say so
  async function seek(video, t) {
    if (Math.abs(video.currentTime - t) < 0.001 && !video.seeking) return true;
    var began = Date.now();
    video.currentTime = t;
    while (video.seeking && Date.now() - began < SEEK_WAIT) {
      await waitFor(video, "seeked", SEEK_WAIT - (Date.now() - began));
    }
    return !video.seeking;
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
    el.loading.hidden = !on;
    el.analyze.classList.toggle("working", on);
    updateAnalyzeButton();
  }

  // The steps the coach goes through while it reads a video. The step
  // it is on now is lit; the ones before it get a check mark.
  //   name = "load", "find", "follow" or "measure"
  function setStep(name) {
    var reached = false;
    Array.prototype.forEach.call(el.steps.children, function (li) {
      var mine = li.getAttribute("data-step") === name;
      li.className = mine ? "now" : reached ? "" : "done";
      if (mine) reached = true;
    });
  }
  // How far along the reading is (0 to 1). The Analyze button itself
  // fills up like a bar, and says the number.
  function setProgress(part, words) {
    el.analyze.style.setProperty("--p", String(M.clamp(part, 0, 1)));
    el.analyzeLabel.textContent = words;
  }
  // Wait until the browser has drawn the page once (so a new step is
  // really seen before the next piece of work starts).
  function nextPicture() {
    return new Promise(function (done) { requestAnimationFrame(function () { setTimeout(done, 0); }); });
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
    if (!(await seek(video, seed.t))) {
      throw new Error("The video is too slow to jump to the moment you clicked. Try again, or use a shorter clip.");
    }
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
  //   late = { count, row }: how many pictures did not come in time, in
  //          all and in a row. Those pictures are NOT looked at (the
  //          screen would still show an older picture, and we would
  //          measure the wrong moment).
  async function follow(finder, video, times, order, start, W, H, found, onStep, startPicture, gap, late) {
    var cur = start.box, prev = null, misses = 0;
    var lastPicture = startPicture, changes = [];
    for (var k = 0; k < order.length; k++) {
      var i = order[k];
      if (!(await seek(video, times[i]))) {
        late.count++; late.row++;
        if (late.row >= LATE_IN_A_ROW) {
          throw new Error("This video is too slow to read on this device: " + late.row +
            " pictures in a row did not load in time. Try a shorter clip, or a smaller video file.");
        }
        prev = null; misses++;   // for the tracker it is a moment where we did not see the skater
        onStep();
        continue;
      }
      late.row = 0;
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
    // An older report makes room for the steps and the shape of the new one.
    el.results.hidden = true;
    setStep("load");
    setProgress(0, "Getting ready...");
    el.stepPercent.textContent = "";
    var worked = false;
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
      setStep("find");
      setProgress(0, "Finding the skater...");
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
      setStep("follow");
      function onStep() {
        done++;
        var part = done / Math.max(1, n - 1), whole = Math.min(100, Math.round(part * 100));
        setProgress(part, "Reading the video " + whole + "%");
        el.stepPercent.textContent = whole + "%";
        // Say it every 5% (not 400 times, which is hard on screen readers).
        var percent = Math.round(part * 20) * 5;
        if (percent !== lastPercent) { lastPercent = percent; say("Following the skater: " + percent + "%"); }
      }
      var forward = [], backward = [];
      for (var f = plan.seedIndex + 1; f < n; f++) forward.push(f);
      for (var b = plan.seedIndex - 1; b >= 0; b--) backward.push(b);
      var late = { count: 0, row: 0 };   // pictures that did not load in time (a slow device)
      var stopLater = await follow(finder, video, times, forward, start, W, H, found, onStep, startPicture, gap, late);
      late.row = 0;
      var stopEarlier = await follow(finder, video, times, backward, start, W, H, found, onStep, startPicture, gap, late);

      setStep("measure");
      setProgress(1, "Measuring...");
      el.stepPercent.textContent = "";
      await nextPicture();

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
      //   warnings = "these numbers are rough": shown right at the top of the report
      //   notes    = how much of the video was used: folded away under the cards
      var notes = [], warnings = [];
      if (shown < clearCount) {
        notes.push("The {you} skater shows only the " + shown + " useful moments (" +
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
        warnings.push("The skater is small in this video (about " + Math.round(typical * 100) +
          "% of the picture height), so the angles are rough estimates. Film closer for better numbers.");
      }
      if (raw.length < n * 0.5) {
        notes.push("Only " + raw.length + " of " + n + " frames could be measured. The skater was hidden, blurry or too far away in the rest.");
      }
      if (cutOff > 0) {
        notes.push(cutOff + " frames were skipped because part of the skater was outside the picture.");
      }
      if (late.count > 0) {
        notes.push(late.count + (late.count === 1 ? " frame was" : " frames were") +
          " skipped because the video did not load " + (late.count === 1 ? "it" : "them") + " in time on this device.");
      }
      if (state.analysis && state.analysis.sideOn) {
        notes.push("Knee bend and lean come from the " + state.analysis.sideOn + " of " + shown +
          " frames where the skater was seen from the side. The other frames are dimmed in the replay bar.");
      } else if (sideCount > 0) {
        warnings.push("Only " + sideCount + " frames showed the skater from the side, too few to rely on, so knee bend and lean are rough estimates.");
      } else {
        warnings.push("The skater was never seen from the side, so knee bend and lean are rough estimates.");
      }
      notes.push("Angles are most accurate when the skater is filmed from the side.");
      el.qualityNote.textContent = warnings.join(" ");
      el.qualityNote.hidden = !warnings.length;
      state.qualityNotes = notes.join(" ");   // ("{you}" stands for the color of your skater: see showQuality)
      showQuality();
      el.qualityMore.hidden = false;
      say("Analysis complete. Check the video under the report: the white skeleton should sit on your skater.");
      worked = true;
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
      // The reading failed: an older report (if there is one) comes back.
      el.results.hidden = !state.frames;
    } finally {
      setBusy(false);
      // The button that filled up now says how it went.
      el.analyzeLabel.textContent = worked ? "Done" : "Analyze video";
      if (worked) setTimeout(function () { if (!state.busy) el.analyzeLabel.textContent = "Analyze again"; }, 1600);
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
    el.view.classList.add("has-session");   // the start card goes; on a phone the video comes right under the 3D picture
    el.seedInfo.textContent = "Click the skater in the video.";
    el.analyzeLabel.textContent = "Analyze video";
    el.preview.src = videoUrl;
    el.preview.load();
    say("Video ready. Click the skater you want to analyze.");
    // Bring the video into view: the next thing to do is click the skater in it.
    requestAnimationFrame(function () {
      if (el.videoPanel.scrollIntoView) el.videoPanel.scrollIntoView({ block: "start", behavior: UI && UI.calm() ? "auto" : "smooth" });
    });
  });
  // The two buttons of the start card on the 3D picture do the same as
  // the two buttons in the Session panel.
  if (el.startVideo) el.startVideo.addEventListener("click", function () { el.videoFile.click(); });
  if (el.startDemo) el.startDemo.addEventListener("click", function () { el.demo.click(); });
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
