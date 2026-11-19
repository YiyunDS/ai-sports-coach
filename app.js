// =====================================================================
//  app.js  -  What Angle Coach DOES
// =====================================================================
//
//  The big plan, step by step:
//    1. Load the goal numbers (targets.json).
//    2. When you pick a video, show it on the page.
//    3. When you press "Check my skating!":
//         a. Wake up the AI (MediaPipe Pose Landmarker).
//         b. Jump through the video, 10 pictures every second.
//         c. For each picture, the AI finds 33 body dots. We use 8 of them:
//            both shoulders, both hips, both knees, both ankles.
//         d. Measure the angles and draw lines on top of the video.
//    4. Put all the pictures together, give a score out of 100, and
//       write 2 or 3 friendly tips.
//
//  The math helpers (angleAt, leanFromVertical, ...) live in angles.js
//  and are reached through "AngleMath".
// =====================================================================

// ---------------------------------------------------------------------
//  Where we get the AI from (on the internet).
//  - The "library" (the code that runs the AI) comes from jsdelivr.
//  - The "model" (the AI's trained brain file) comes from Google.
//  The version number is pinned so the page doesn't suddenly change.
// ---------------------------------------------------------------------
const MEDIAPIPE_VERSION = "0.10.14";
const MEDIAPIPE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// How many pictures per second of video we check. More = slower but finer.
const FRAMES_PER_SECOND = 10;
// Only check the first 60 seconds, so a long video doesn't take forever.
const MAX_SECONDS = 60;
// The AI tells us how SURE it is about each dot (0 = guessing, 1 = sure).
// We ignore dots it is less than half sure about.
const MIN_VISIBILITY = 0.5;

// ---------------------------------------------------------------------
//  The numbers MediaPipe uses for each body part.
//  MediaPipe finds 33 dots and numbers them 0 to 32. These are ours.
//  "Left" and "right" mean the SKATER's left and right.
// ---------------------------------------------------------------------
const BODY = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

// ---------------------------------------------------------------------
//  A backup copy of targets.json.
//  Browsers sometimes refuse to read targets.json when you open the page
//  by double-clicking it. Then we use this copy instead.
//  KEEP THIS THE SAME AS targets.json! (Our test checks that it is.)
// ---------------------------------------------------------------------
const DEFAULT_TARGETS = /* DEFAULT_TARGETS_START */ {
  "ageBands": [
    { "name": "Ages 6-8", "minAge": 6, "maxAge": 8,
      "Beginner":    { "kneeBend": { "min": 115, "max": 145 }, "forwardLean": { "min": 10, "max": 35 }, "strideExtension": { "min": 145, "max": 180 } },
      "Experienced": { "kneeBend": { "min": 105, "max": 135 }, "forwardLean": { "min": 15, "max": 40 }, "strideExtension": { "min": 150, "max": 180 } } },
    { "name": "Ages 9-10", "minAge": 9, "maxAge": 10,
      "Beginner":    { "kneeBend": { "min": 110, "max": 140 }, "forwardLean": { "min": 15, "max": 38 }, "strideExtension": { "min": 150, "max": 180 } },
      "Experienced": { "kneeBend": { "min": 100, "max": 130 }, "forwardLean": { "min": 20, "max": 42 }, "strideExtension": { "min": 155, "max": 180 } } },
    { "name": "Ages 11-12", "minAge": 11, "maxAge": 12,
      "Beginner":    { "kneeBend": { "min": 105, "max": 135 }, "forwardLean": { "min": 18, "max": 40 }, "strideExtension": { "min": 155, "max": 180 } },
      "Experienced": { "kneeBend": { "min": 95, "max": 125 }, "forwardLean": { "min": 25, "max": 45 }, "strideExtension": { "min": 160, "max": 180 } } }
  ]
} /* DEFAULT_TARGETS_END */;

// Friendly names for each check, used in the table and tips.
const CHECK_NAMES = {
  kneeBend: "Knee bend",
  forwardLean: "Forward lean",
  strideExtension: "Stride push",
};

// ---------------------------------------------------------------------
//  The tips! For each check, what to say if your number is too low,
//  too high, or just right. Kids: you can change these words!
// ---------------------------------------------------------------------
const TIPS = {
  kneeBend: {
    // Remember: a SMALLER knee angle means MORE bend.
    low: "Wow, super deep knees! Stand up just a tiny bit so your legs don't get tired so fast.",
    high: "Bend your knees more, like you're sitting in an invisible chair. Bent knees push harder!",
    good: "Your knee bend is right on target. Great job!",
  },
  forwardLean: {
    low: "Lean your chest forward a little, like you're chasing the puck. Keep your eyes up!",
    high: "Lift your chest up a bit so you can see the ice in front of you.",
    good: "Your forward lean looks just like a pro's. Nice!",
  },
  strideExtension: {
    low: "Push your leg all the way out until it's straight, then snap it back under you.",
    high: "Your push is very long! Make sure you bring your foot back quickly for the next stride.",
    good: "Your stride push goes all the way out. Awesome!",
  },
};

// ---------------------------------------------------------------------
//  Grab the parts of the page we need to change.
//  document.getElementById finds a thing on the page by its id="...".
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const videoFileInput = $("videoFile");
const ageSelect = $("age");
const analyzeBtn = $("analyzeBtn");
const statusText = $("status");
const progressBar = $("progress");
const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d"); // the "pen" we draw with

// Things the app remembers while it runs.
let targets = DEFAULT_TARGETS; // the goal numbers we are using
let poseLandmarker = null;     // the AI, once it is awake
let aiClock = 0;               // MediaPipe needs a clock that only goes forward
let frames = [];               // what we measured in each picture
let currentGoals = null;       // goals for the chosen age and level
let busy = false;              // true while the AI is watching the video

// =====================================================================
//  STEP 1: Get the page ready
// =====================================================================

// Fill the age menu with 6, 7, 8 ... 12. Start on 9.
for (let age = 6; age <= 12; age++) {
  const option = document.createElement("option");
  option.value = age;
  option.textContent = age;
  if (age === 9) option.selected = true;
  ageSelect.appendChild(option);
}

// Try to read targets.json. If the browser says no, keep the backup copy.
async function loadTargets() {
  try {
    const response = await fetch("targets.json", { cache: "no-store" });
    if (!response.ok) throw new Error("not found");
    targets = await response.json();
    $("targetsSource").textContent = "Using goal numbers from targets.json.";
  } catch (err) {
    targets = DEFAULT_TARGETS;
    $("targetsSource").textContent =
      "Using the built-in goal numbers (the browser could not read targets.json by itself).";
  }
}
loadTargets();

// A grown-up can pick an edited targets.json by hand.
$("targetsFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    targets = JSON.parse(await file.text());
    $("targetsSource").textContent = `Using goal numbers from ${file.name}.`;
    if (frames.length) showResults(); // re-score with the new goals
  } catch (err) {
    $("targetsSource").textContent =
      "Oops, that file has a typo (maybe a missing comma or quote). Still using the old goals.";
  }
});

// Find the goals for an age (like 9) and level (like "Beginner").
function goalsFor(age, level) {
  const band =
    targets.ageBands.find((b) => age >= b.minAge && age <= b.maxAge) ||
    targets.ageBands[targets.ageBands.length - 1];
  return { bandName: band.name, ...band[level] };
}

// Which level button is picked?
function chosenLevel() {
  return document.querySelector('input[name="level"]:checked').value;
}

// =====================================================================
//  STEP 2: When a video is picked, show it
// =====================================================================
videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files[0];
  if (!file) return;
  // Make a private link to the video. It never leaves your computer.
  video.src = URL.createObjectURL(file);
  frames = [];
  $("viewer").hidden = false;
  $("results").hidden = true;
  statusText.textContent = "Video loaded! Press the button when you're ready.";
  analyzeBtn.disabled = false;
});

// When the video knows its size, make the drawing paper the same size.
video.addEventListener("loadedmetadata", () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// =====================================================================
//  STEP 3a: Wake up the AI
// =====================================================================
async function wakeUpAI() {
  if (poseLandmarker) return poseLandmarker; // already awake

  statusText.textContent = "Waking up the AI coach (this can take a few seconds the first time)...";
  // "import" downloads the MediaPipe library from the internet.
  const vision = await import(`${MEDIAPIPE_URL}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE_URL}/wasm`);

  // These are the settings we give the AI.
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO", // we will give it pictures from a video, in order
    numPoses: 1,          // look for one skater
  });

  try {
    // "GPU" uses the graphics chip, which is faster.
    poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, options("GPU"));
  } catch (err) {
    // Some computers can't, so we use the regular chip ("CPU") instead.
    poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, options("CPU"));
  }
  return poseLandmarker;
}

// =====================================================================
//  STEP 3b-d: Watch the video, one picture at a time
// =====================================================================

// Jump the video to a time (in seconds) and wait until it gets there.
// (If the browser forgets to tell us, we stop waiting after 2 seconds.)
function seekTo(seconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    video.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
    video.currentTime = seconds;
  });
}

analyzeBtn.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  analyzeBtn.disabled = true;
  $("results").hidden = true;

  try {
    const ai = await wakeUpAI();
    currentGoals = goalsFor(Number(ageSelect.value), chosenLevel());

    video.pause();
    frames = [];
    const end = Math.min(video.duration || 0, MAX_SECONDS);
    const totalPictures = Math.floor(end * FRAMES_PER_SECOND);
    progressBar.hidden = false;
    statusText.textContent = "The AI is watching your skating...";

    // Walk through the video: 0.0 s, 0.1 s, 0.2 s, ...
    for (let i = 0; i < totalPictures; i++) {
      const t = i / FRAMES_PER_SECOND; // the time of picture number i
      await seekTo(t);

      // Ask the AI to find the body dots in this picture.
      aiClock += 100; // always move the clock forward
      const result = ai.detectForVideo(video, aiClock);
      const dots = result.landmarks && result.landmarks[0];

      // Measure the angles (or null if nobody was found).
      const frame = dots ? measureFrame(dots) : null;
      frames.push({ time: t, frame });
      drawFrame(frame);

      progressBar.value = Math.round(((i + 1) / totalPictures) * 100);
    }

    progressBar.hidden = true;
    showResults();
    statusText.textContent = "Done! Press play to watch the lines move with you.";
    video.currentTime = 0;
  } catch (err) {
    console.error(err);
    progressBar.hidden = true;
    statusText.textContent =
      "Uh oh, something went wrong. Check the internet connection and try again. (" + err.message + ")";
  } finally {
    busy = false;
    analyzeBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
//  measureFrame: turn the AI's dots into angle numbers for ONE picture.
// ---------------------------------------------------------------------
function measureFrame(dots) {
  // MediaPipe gives x and y as fractions (0 to 1) of the picture's width
  // and height. A wide video would squish our angles, so we change them
  // into real pixel spots first.
  const W = video.videoWidth;
  const H = video.videoHeight;
  const p = {};
  for (const [name, index] of Object.entries(BODY)) {
    const d = dots[index];
    p[name] = {
      x: d.x * W,
      y: d.y * H,
      sure: (d.visibility ?? 1) >= MIN_VISIBILITY, // is the AI sure about this dot?
    };
  }
  const sure = (...names) => names.every((n) => p[n].sure);
  const M = window.AngleMath;

  // Knee angles: hip -> knee -> ankle, for each leg we can see.
  const leftKnee = sure("leftHip", "leftKnee", "leftAnkle")
    ? M.angleAt(p.leftHip, p.leftKnee, p.leftAnkle) : NaN;
  const rightKnee = sure("rightHip", "rightKnee", "rightAnkle")
    ? M.angleAt(p.rightHip, p.rightKnee, p.rightAnkle) : NaN;
  const kneeList = [leftKnee, rightKnee].filter(Number.isFinite);

  // Forward lean: the line from the middle of the hips to the middle of
  // the shoulders. If we can only see one side (filming from the side),
  // we just use that side.
  let lean = NaN;
  if (sure("leftShoulder", "rightShoulder", "leftHip", "rightHip")) {
    lean = M.leanFromVertical(
      M.midpoint(p.leftShoulder, p.rightShoulder),
      M.midpoint(p.leftHip, p.rightHip)
    );
  } else if (sure("leftShoulder", "leftHip")) {
    lean = M.leanFromVertical(p.leftShoulder, p.leftHip);
  } else if (sure("rightShoulder", "rightHip")) {
    lean = M.leanFromVertical(p.rightShoulder, p.rightHip);
  }

  // Ankle spread: how far apart your feet are, measured in "leg lengths"
  // so it works for tall and short skaters and near or far cameras.
  let spread = NaN;
  if (kneeList.length === 2) {
    const legLength =
      (M.distance(p.leftHip, p.leftKnee) + M.distance(p.leftKnee, p.leftAnkle) +
       M.distance(p.rightHip, p.rightKnee) + M.distance(p.rightKnee, p.rightAnkle)) / 2;
    spread = M.distance(p.leftAnkle, p.rightAnkle) / legLength;
  }

  return {
    points: p,
    leftKnee,
    rightKnee,
    // The bent (gliding) leg is the one with the SMALLER knee angle.
    bentKnee: kneeList.length ? Math.min(...kneeList) : NaN,
    // The pushing leg is the STRAIGHTER one (bigger angle).
    pushKnee: kneeList.length === 2 ? Math.max(...kneeList) : NaN,
    lean,
    spread,
  };
}

// =====================================================================
//  Drawing the skeleton and numbers on top of the video
// =====================================================================
function drawFrame(frame) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;
  const p = frame.points;
  const goals = currentGoals;
  const M = window.AngleMath;

  // Make lines and letters bigger on bigger videos.
  const size = Math.max(canvas.width, canvas.height);
  const lineWidth = Math.max(3, size / 220);
  const fontSize = Math.max(16, Math.round(size / 32));

  // Green if a number is on target, orange if not.
  // (We round first, so the color matches the whole number we write.)
  const colorFor = (value, range) =>
    M.whereIs(Math.round(value), range) === "good" ? "#1f9d55" : "#e8811a";

  // Draw a line between two dots, but only if the AI is sure of both.
  function bone(a, b, color) {
    if (!p[a].sure || !p[b].sure) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p[a].x, p[a].y);
    ctx.lineTo(p[b].x, p[b].y);
    ctx.stroke();
  }

  // Write a number with a dark outline so you can read it on any video.
  function label(text, x, y, color) {
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(3, fontSize / 5);
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  const white = "rgba(255,255,255,0.9)";
  const leanColor = colorFor(frame.lean, goals.forwardLean);

  // Body: shoulders across, hips across, and each side's body line.
  bone("leftShoulder", "rightShoulder", white);
  bone("leftHip", "rightHip", white);
  bone("leftShoulder", "leftHip", leanColor);
  bone("rightShoulder", "rightHip", leanColor);

  // Legs: color each leg by whether its knee angle is on target.
  for (const side of ["left", "right"]) {
    const angle = frame[side + "Knee"];
    if (!Number.isFinite(angle)) continue;
    // The bent leg is checked against kneeBend, the push leg against strideExtension.
    const isBentLeg = angle === frame.bentKnee;
    const range = isBentLeg ? goals.kneeBend : goals.strideExtension;
    const color = colorFor(angle, range);
    bone(side + "Hip", side + "Knee", color);
    bone(side + "Knee", side + "Ankle", color);
    const knee = p[side + "Knee"];
    label(`${Math.round(angle)}°`, knee.x + fontSize * 0.6, knee.y, color);
  }

  // Joint dots.
  ctx.fillStyle = white;
  for (const name of Object.keys(BODY)) {
    if (!p[name].sure) continue;
    ctx.beginPath();
    ctx.arc(p[name].x, p[name].y, lineWidth * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lean number next to the hips.
  if (Number.isFinite(frame.lean)) {
    const hip = p.leftHip.sure ? p.leftHip : p.rightHip;
    label(`lean ${Math.round(frame.lean)}°`, hip.x + fontSize * 0.6, hip.y - fontSize, leanColor);
  }
}

// While the video plays, draw the saved measurements for the picture
// that is closest to the current time.
function frameNear(seconds) {
  if (!frames.length) return null;
  const i = Math.min(frames.length - 1, Math.max(0, Math.round(seconds * FRAMES_PER_SECOND)));
  return frames[i].frame;
}
function redrawLoop() {
  if (!busy && frames.length && currentGoals) drawFrame(frameNear(video.currentTime));
  requestAnimationFrame(redrawLoop); // do it again on the next screen refresh
}
requestAnimationFrame(redrawLoop);

// =====================================================================
//  STEP 4: Score and tips
// =====================================================================
function summarize() {
  const M = window.AngleMath;
  const seen = frames.map((f) => f.frame).filter(Boolean);

  // Knee bend and lean: the MIDDLE value over all the pictures.
  const kneeBend = M.median(seen.map((f) => f.bentKnee));
  const forwardLean = M.median(seen.map((f) => f.lean));

  // Stride push: look only at the pictures where your feet are
  // farthest apart (the top quarter). That's when your push leg should
  // be straight. Then take the middle knee angle of the push leg.
  const withSpread = seen
    .filter((f) => Number.isFinite(f.spread) && Number.isFinite(f.pushKnee))
    .sort((a, b) => b.spread - a.spread);
  const top = withSpread.slice(0, Math.max(1, Math.ceil(withSpread.length / 4)));
  const strideExtension = withSpread.length ? M.median(top.map((f) => f.pushKnee)) : NaN;
  const maxSpread = withSpread.length ? withSpread[0].spread : NaN;

  // Round to whole degrees, so 109.99 counts as 110 (that's what we show you).
  return {
    seenCount: seen.length,
    kneeBend: Math.round(kneeBend),
    forwardLean: Math.round(forwardLean),
    strideExtension: Math.round(strideExtension),
    maxSpread,
  };
}

function showResults() {
  const M = window.AngleMath;
  const level = chosenLevel();
  const age = Number(ageSelect.value);
  currentGoals = goalsFor(age, level);
  const goals = currentGoals;
  const summary = summarize();

  $("results").hidden = false;
  const rows = $("checkRows");
  const tipsList = $("tips");
  rows.innerHTML = "";
  tipsList.innerHTML = "";

  // If the AI hardly saw anybody, say so kindly.
  if (summary.seenCount < 5) {
    $("score").textContent = "?";
    $("bandInfo").textContent = "";
    $("spreadInfo").textContent = "";
    addTip("The AI couldn't see you well. Try a video filmed from the side with your whole body showing.");
    addTip("Good light and a plain background help the AI find you.");
    return;
  }

  // Score each check and build the table.
  const checks = [];
  for (const key of ["kneeBend", "forwardLean", "strideExtension"]) {
    const value = summary[key];
    const range = goals[key];
    const points = M.scoreInRange(value, range);
    const state = M.whereIs(value, range);
    checks.push({ key, value, points, state });

    const tr = document.createElement("tr");
    const shown = Number.isFinite(value) ? `${Math.round(value)}°` : "not seen";
    tr.innerHTML =
      `<td>${CHECK_NAMES[key]}</td>` +
      `<td class="${state === "good" ? "good" : "off"}">${shown}</td>` +
      `<td>${range.min}° to ${range.max}°</td>` +
      `<td>${Number.isFinite(points) ? points : "-"}</td>`;
    rows.appendChild(tr);
  }

  // Total score = the average of the checks we could measure.
  const scored = checks.filter((c) => Number.isFinite(c.points));
  const total = scored.length
    ? Math.round(scored.reduce((sum, c) => sum + c.points, 0) / scored.length)
    : NaN;
  $("score").textContent = Number.isFinite(total) ? total : "?";
  $("bandInfo").textContent = `Goals for ${goals.bandName}, ${level}. The AI saw you in ${summary.seenCount} pictures.`;
  $("spreadInfo").textContent = Number.isFinite(summary.maxSpread)
    ? `Widest stride: your feet got ${summary.maxSpread.toFixed(1)} leg-lengths apart.`
    : "";

  // ----- Pick 2 or 3 tips -----
  // First: the checks that need work, worst one first.
  const needWork = scored
    .filter((c) => c.state !== "good")
    .sort((a, b) => a.points - b.points);
  for (const c of needWork.slice(0, 3)) addTip(TIPS[c.key][c.state]);

  // If we have fewer than 2 tips, cheer for the things done well.
  for (const c of scored.filter((c) => c.state === "good")) {
    if (tipsList.children.length >= 2) break;
    addTip(TIPS[c.key].good);
  }
  // Something we couldn't see? Say how to film it next time.
  if (tipsList.children.length < 3 && checks.some((c) => !Number.isFinite(c.points))) {
    addTip("Some body parts were hidden. Next time, film your whole body from the side.");
  }
  // Still fewer than 2? Everything is great, so add a challenge.
  if (tipsList.children.length < 2) {
    addTip("Everything is on target! Now try the same strides a little faster.");
  }
}

function addTip(text) {
  const li = document.createElement("li");
  li.textContent = text;
  $("tips").appendChild(li);
}

// If you change age or level after checking, update the score right away.
ageSelect.addEventListener("change", () => { if (frames.length && !busy) showResults(); });
document.querySelectorAll('input[name="level"]').forEach((r) =>
  r.addEventListener("change", () => { if (frames.length && !busy) showResults(); })
);
