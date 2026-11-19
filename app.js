/*
 * app.js -- the part that talks to the web page.
 * Big steps:
 *   1. Load the AI pose finder (MediaPipe) from the internet.
 *   2. Jump through the video a few times per second. On each picture, find the body dots.
 *   3. Turn dots into angles (angles.js), and angles into a score and kid-friendly tips.
 *   4. Draw graphs, and compare form with heart rate.
 * Your video never leaves this computer: the AI runs right inside the browser.
 */
const M = window.CoachMath;

// ---------- Settings you can change ----------
const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
// The "brain file" for the pose finder. Google hosts it; the browser downloads it once.
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const SECONDS_BETWEEN_LOOKS = 0.25;   // look at the video 4 times each second

// If targets.json can't be loaded (happens when you double-click index.html), use these.
// Keep them the same as targets.json!
const FALLBACK_TARGETS = {
  skating: {
    Beginner:    { kneeAngle:{min:110,max:145,tolerance:40}, forwardLean:{min:10,max:35,tolerance:25}, strideAngle:{min:25,max:50,tolerance:25} },
    Experienced: { kneeAngle:{min:95,max:130,tolerance:35},  forwardLean:{min:20,max:45,tolerance:25}, strideAngle:{min:35,max:65,tolerance:25} }
  },
  ageAdjust: [ {minAge:6,maxAge:8,kneeAngleAdd:10,strideScale:0.8}, {minAge:9,maxAge:10,kneeAngleAdd:5,strideScale:0.9}, {minAge:11,maxAge:12,kneeAngleAdd:0,strideScale:1.0} ],
  dryland: { squat:{depthKneeAngleMax:100,backLeanMax:45,tolerance:40}, lunge:{frontKneeMin:80,frontKneeMax:100,backLeanMax:25,tolerance:40} },
  heartRate: { sloppyScoreDrop:10, restBreakSeconds:60 }
};

// ---------- Handy shortcuts to things on the page ----------
const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), ctx = canvas.getContext("2d");
let targets = FALLBACK_TARGETS;
let landmarker = null;        // the AI pose finder, once loaded
let samples = [];             // one entry per look: { t, pts, knee, lean, stride, score }
let hrPoints = [];            // heart-rate readings: { t, bpm }
let scoreChart = null, hrChart = null;
let lastAnalysis = null;      // remember age/mode for the heart-rate advice

// Ages 6 to 12 in the drop-down
for (let a = 6; a <= 12; a++) $("age").add(new Option(a, a));
$("age").value = 8;

// Try to load kid-editable targets. Fine if it fails.
fetch("targets.json").then((r) => r.json()).then((j) => { targets = j; }).catch(() => {});

const mode = () => document.querySelector('input[name="mode"]:checked').value;
function status(msg) { $("status").textContent = msg; }

// ---------- Mode switch: skating shows level + heart rate, dryland shows exercise ----------
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => {
  const skating = mode() === "skating";
  $("levelWrap").hidden = !skating; $("exerciseWrap").hidden = skating; $("hrCard").hidden = !skating;
  $("results").hidden = true; $("chartsCard").hidden = true;
}));

$("videoFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  video.src = URL.createObjectURL(file);          // a private link that only works on this device
  $("videoCard").hidden = false;
  $("analyzeBtn").disabled = false;
  status("Video ready! Press \"Check my video\".");
});

// ---------- Step 1: load the AI ----------
async function loadLandmarker() {
  if (landmarker) return landmarker;
  status("Waking up the AI coach (first time takes a few seconds)...");
  const vision = await import(MEDIAPIPE + "/vision_bundle.mjs");
  const files = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE + "/wasm");
  landmarker = await vision.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: "IMAGE",           // we hand it one picture at a time
    numPoses: 1,                    // only look for one person
  });
  return landmarker;
}

// Wait until the video has jumped to time t
function seekTo(t) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

// MediaPipe landmark numbers we use
const L = { shoulderL: 11, shoulderR: 12, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28 };
// Which dots to connect with lines when drawing the skeleton
const BONES = [[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[11,13],[13,15],[12,14],[14,16]];

// ---------- Step 2: from one picture to angles ----------
function measure(raw) {
  // raw dots are 0..1 across the picture; turn them into pixels so angles aren't squished
  const w = video.videoWidth, h = video.videoHeight;
  const p = (i) => ({ x: raw[i].x * w, y: raw[i].y * h, v: raw[i].visibility ?? 1 });
  const sL = p(L.shoulderL), sR = p(L.shoulderR), hL = p(L.hipL), hR = p(L.hipR);
  const kL = p(L.kneeL), kR = p(L.kneeR), aL = p(L.ankleL), aR = p(L.ankleR);
  const seen = (...d) => d.every((x) => x.v > 0.5);

  // Knee angles for each leg we can see; average them
  const knees = [];
  if (seen(hL, kL, aL)) knees.push(M.angleAt(hL, kL, aL));
  if (seen(hR, kR, aR)) knees.push(M.angleAt(hR, kR, aR));
  const knee = knees.length ? knees.reduce((a, b) => a + b) / knees.length : null;

  // Lean: use whichever side (left/right) the camera sees better
  const useL = sL.v + hL.v >= sR.v + hR.v;
  const [sh, hp] = useL ? [sL, hL] : [sR, hR];
  const lean = seen(sh, hp) ? M.leanFromVertical(sh, hp) : null;

  const stride = seen(hL, hR, aL, aR) ? M.strideAngle(hL, hR, aL, aR) : null;

  // For lunges: the front knee is the more-bent one
  const frontKnee = knees.length ? Math.min(...knees) : null;
  return { knee, lean, stride, frontKnee, kneeL: seen(hL,kL,aL) ? M.angleAt(hL,kL,aL) : null, kneeR: seen(hR,kR,aR) ? M.angleAt(hR,kR,aR) : null };
}

// ---------- Step 3: scoring a skating picture ----------
function skatingScore(m, T) {
  const parts = [
    M.scoreInRange(m.knee, T.kneeAngle.min, T.kneeAngle.max, T.kneeAngle.tolerance),
    M.scoreInRange(m.lean, T.forwardLean.min, T.forwardLean.max, T.forwardLean.tolerance),
    M.scoreInRange(m.stride, T.strideAngle.min, T.strideAngle.max, T.strideAngle.tolerance),
  ].filter((x) => x !== null);
  return parts.length ? Math.round(parts.reduce((a, b) => a + b) / parts.length) : null;
}

// ---------- Drawing ----------
function drawSkeleton(raw, m) {
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!raw) return;
  const W = canvas.width, H = canvas.height;
  ctx.lineWidth = Math.max(3, W / 200); ctx.strokeStyle = "#22c55e"; ctx.fillStyle = "#facc15";
  for (const [a, b] of BONES) {
    ctx.beginPath(); ctx.moveTo(raw[a].x * W, raw[a].y * H); ctx.lineTo(raw[b].x * W, raw[b].y * H); ctx.stroke();
  }
  for (const i of [11,12,23,24,25,26,27,28]) { ctx.beginPath(); ctx.arc(raw[i].x * W, raw[i].y * H, ctx.lineWidth * 1.3, 0, 7); ctx.fill(); }
  // Write the knee angle numbers next to the knees
  ctx.font = `bold ${Math.round(W / 30)}px sans-serif`; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
  for (const [idx, ang] of [[25, m.kneeL], [26, m.kneeR]]) {
    if (ang === null) continue;
    const x = raw[idx].x * W + 10, y = raw[idx].y * H;
    ctx.strokeText(Math.round(ang) + "°", x, y); ctx.fillText(Math.round(ang) + "°", x, y);
  }
}

// ---------- Main button: walk through the video ----------
$("analyzeBtn").addEventListener("click", async () => {
  const btn = $("analyzeBtn"); btn.disabled = true;
  try {
    await loadLandmarker();
    if (!video.duration || !isFinite(video.duration)) await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
    video.pause(); samples = [];
    $("progress").hidden = false;
    for (let t = 0; t < video.duration; t += SECONDS_BETWEEN_LOOKS) {
      await seekTo(t);
      const res = landmarker.detect(video);             // <-- the AI finds the body dots here
      const raw = res.landmarks && res.landmarks[0];
      const m = raw ? measure(raw) : null;
      samples.push({ t, raw: raw || null, m });
      drawSkeleton(raw, m || {});
      $("progress").value = t / video.duration;
      status(`Looking at second ${t.toFixed(1)} of ${video.duration.toFixed(1)}...`);
    }
    $("progress").hidden = true;
    mode() === "skating" ? finishSkating() : finishDryland();
    video.currentTime = 0;
  } catch (err) {
    console.error(err);
    status("Oops! Something went wrong: " + err.message + " (Are you online? The AI is downloaded from the internet.)");
  }
  btn.disabled = false;
});

// ---------- Skating results ----------
function finishSkating() {
  const age = +$("age").value, level = $("level").value;
  const T = M.targetsFor(targets, age, level).skating;
  for (const s of samples) s.score = s.m ? skatingScore(s.m, T) : null;
  const good = samples.filter((s) => s.score !== null);
  if (good.length < 3) { status("I couldn't see the skater clearly. Try a video where your whole body is in view."); return; }

  const avg = (key) => { const v = good.map((s) => s.m[key]).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b) / v.length : null; };
  const mean = good.reduce((a, s) => a + s.score, 0) / good.length;
  const kneeAvg = avg("knee"), leanAvg = avg("lean"), strideAvg = avg("stride");

  $("bigScore").innerHTML = `Your skating score: <span class="${mean >= 70 ? "good" : "warn"}">${Math.round(mean)} / 100</span>`;
  const tips = [];
  const tip = (v, r, low, high, ok) => tips.push(v === null ? null : v < r.min ? low : v > r.max ? high : ok);
  tip(kneeAvg, T.kneeAngle, "🦵 Your legs are a bit too straight on average. Sit down lower, like you are about to sit in a chair!", "🦵 You are bending your knees a lot. Nice and low! Stand a tiny bit taller if your legs get tired.", "🦵 Great knee bend! Your knees are in the sweet spot.");
  tip(leanAvg, T.forwardLean, "🧍 You are standing very tall. Lean your chest forward a little, like you are looking over a fence.", "🧍 You are leaning really far forward. Lift your chest up a bit to keep your balance.", "🧍 Super lean! Your upper body is tipped forward just right.");
  tip(strideAvg, T.strideAngle, "👟 Your pushes are short. Push your leg all the way out to the side on each stride!", "👟 Your legs spread very wide. Bring your foot back under you faster between strides.", "👟 Awesome stride! Your legs push out nicely.");
  $("tips").innerHTML = tips.filter(Boolean).map((t) => `<li>${t}</li>`).join("");
  $("repTable").innerHTML = "";
  $("results").hidden = false; $("chartsCard").hidden = false;
  lastAnalysis = { age, mode: "skating" };
  status("Done! Press play on the video to see your skeleton. Add heart-rate readings below to compare.");
  drawCharts();
}

// ---------- Dryland results (squats / lunges) ----------
function finishDryland() {
  const age = +$("age").value, ex = $("exercise").value;
  const D = targets.dryland[ex];
  const add = M.targetsFor(targets, age, "Beginner").kneeAngleAdd;   // younger kids get a little extra room
  const series = samples.map((s) => ({ t: s.t, knee: s.m ? (ex === "lunge" ? s.m.frontKnee : s.m.knee) : null, lean: s.m ? s.m.lean : null }));
  const reps = M.findReps(series, { down: 140, up: 155 });
  if (!reps.length) { status("I didn't see any full reps. Make sure your whole body is in view and bend down all the way."); return; }

  let depthOk = 0, backOk = 0; const rows = [];
  reps.forEach((r, i) => {
    let depthText, dOK;
    if (ex === "squat") { dOK = r.bottomKnee <= D.depthKneeAngleMax + add; depthText = dOK ? "Nice and deep!" : "Go a little lower"; }
    else { dOK = r.bottomKnee <= D.frontKneeMax + add && r.bottomKnee >= D.frontKneeMin - 20; depthText = r.bottomKnee > D.frontKneeMax + add ? "Go a little lower" : r.bottomKnee < D.frontKneeMin - 20 ? "Too low, keep knee over ankle" : "Great lunge depth!"; }
    const bOK = r.lean <= D.backLeanMax + 5;
    if (dOK) depthOk++; if (bOK) backOk++;
    rows.push(`<tr><td>${i + 1}</td><td>${Math.round(r.bottomKnee)}°</td><td>${depthText}</td><td>${Math.round(r.lean)}°</td><td>${bOK ? "Back looks straight" : "Chest up!"}</td></tr>`);
  });
  const n = reps.length;
  const score = Math.round(50 * depthOk / n + 50 * backOk / n);
  $("bigScore").innerHTML = `${n} ${ex}${n > 1 ? "s" : ""} counted. Score: <span class="${score >= 70 ? "good" : "warn"}">${score} / 100</span>`;
  const tips = [];
  tips.push(depthOk === n ? `🦵 Every ${ex} went deep enough. Super!` : ex === "squat" ? "🦵 Try to sit back and down like you are sitting in a chair. Keep your heels on the floor." : "🦵 Step far enough forward so your front knee bends to about a right angle (like the corner of a book).");
  tips.push(backOk === n ? "🧍 Your back stayed nice and tall." : "🧍 Keep your chest proud, like there is a string pulling the top of your head to the ceiling.");
  tips.push("🌟 Go slow on the way down and strong on the way up. Quality beats speed!");
  $("tips").innerHTML = tips.map((t) => `<li>${t}</li>`).join("");
  $("repTable").innerHTML = `<table><tr><th>Rep</th><th>Knee angle</th><th>Depth</th><th>Back lean</th><th>Back</th></tr>${rows.join("")}</table>`;
  $("results").hidden = false; $("chartsCard").hidden = true;
  status("Done! Press play to watch your skeleton.");
}

// Show the skeleton that matches the playing video
video.addEventListener("timeupdate", () => {
  if (!samples.length) return;
  const s = samples[Math.min(samples.length - 1, Math.round(video.currentTime / SECONDS_BETWEEN_LOOKS))];
  drawSkeleton(s.raw, s.m || {});
  $("liveReadout").textContent = s.m && s.score != null && mode() === "skating"
    ? `Score now: ${s.score}  |  knee ${Math.round(s.m.knee ?? 0)}°  lean ${Math.round(s.m.lean ?? 0)}°  stride ${Math.round(s.m.stride ?? 0)}°` : "";
});

// ---------- Heart rate form ----------
// "1:30" -> 90 seconds. "90" -> 90 seconds.
function parseTime(text) {
  const parts = text.trim().split(":").map(Number);
  if (parts.some(isNaN)) return null;
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts.length === 1 ? parts[0] : null;
}
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function renderHr() {
  hrPoints.sort((a, b) => a.t - b.t);
  $("hrList").innerHTML = hrPoints.map((p, i) => `<li>${fmt(p.t)} → ${p.bpm} bpm <button data-i="${i}" title="remove">✕</button></li>`).join("");
  drawCharts();
}
$("hrForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = parseTime($("hrTime").value), bpm = +$("hrBpm").value;
  if (t === null || t < 0 || !bpm) return;
  hrPoints.push({ t, bpm }); $("hrTime").value = ""; $("hrBpm").value = ""; renderHr();
});
$("hrList").addEventListener("click", (e) => { if (e.target.dataset.i) { hrPoints.splice(+e.target.dataset.i, 1); renderHr(); } });
$("hrClear").addEventListener("click", () => { hrPoints = []; renderHr(); });
$("hrExample").addEventListener("click", () => {          // practice data so kids can see how it works
  const end = samples.length ? samples[samples.length - 1].t : 60;
  hrPoints = [0, 0.25, 0.5, 0.75, 1].map((f, i) => ({ t: Math.round(end * f), bpm: [105, 130, 155, 170, 178][i] }));
  renderHr();
});

// ---------- Charts + advice ----------
function drawCharts() {
  if (!window.Chart || !samples.length || mode() !== "skating" || $("chartsCard").hidden) return;
  const scorePts = samples.filter((s) => s.score != null).map((s) => ({ x: s.t, y: s.score }));
  const opts = (title, ytitle, ymin, ymax) => ({
    responsive: true, parsing: false, animation: false,
    scales: { x: { type: "linear", title: { display: true, text: "seconds into video" }, min: 0, max: samples[samples.length - 1].t },
              y: { title: { display: true, text: ytitle }, min: ymin, max: ymax } },
    plugins: { title: { display: true, text: title }, legend: { display: false } },
  });
  if (scoreChart) scoreChart.destroy(); if (hrChart) hrChart.destroy();
  scoreChart = new Chart($("scoreChart"), { type: "line", data: { datasets: [{ data: scorePts, borderColor: "#1d4ed8", pointRadius: 2, tension: 0.2 }] }, options: opts("Skating score", "score (0-100)", 0, 100) });
  hrChart = new Chart($("hrChart"), { type: "line", data: { datasets: [{ data: hrPoints.map((p) => ({ x: p.t, y: p.bpm })), borderColor: "#dc2626", pointRadius: 4 }] }, options: opts("Heart rate", "beats per minute", 60, 220) });
  advise();
}

// Say in kid words whether form got sloppy as heart rate rose.
function advise() {
  const box = $("hrAdvice"); box.className = "";
  if (hrPoints.length < 2) { box.textContent = "Add at least two heart-rate readings to see how your heart and your skating go together."; return; }
  const r = M.formVsHeartRate(samples.filter((s) => s.score != null).map((s) => ({ t: s.t, score: s.score })), hrPoints, lastAnalysis.age);
  if (!r.enough) { box.textContent = "I need heart-rate readings that cover more of the video to compare."; return; }
  const dropNeeded = (targets.heartRate && targets.heartRate.sloppyScoreDrop) || 10;
  const rest = (targets.heartRate && targets.heartRate.restBreakSeconds) || 60;
  let html = "";
  if (r.drop >= dropNeeded) {
    box.className = "rest";
    html = `😮‍💨 <strong>Your form got sloppier when your heart was racing.</strong> Your score was about ${Math.round(r.calmAvg)} when your heart was calmer, but only ${Math.round(r.highAvg)} when it beat faster (over ${Math.round(r.median)} beats per minute).` +
      (r.firstSloppyTime !== null ? ` It started to slip around ${fmt(r.firstSloppyTime)}.` : "") +
      ` <br>👉 <strong>Take a rest break!</strong> Skate slowly or sit for about ${rest} seconds and drink water. Tired legs make sloppy skating, and sloppy skating is how kids get hurt.`;
  } else {
    html = `👍 Your form stayed pretty steady even when your heart beat faster (about ${Math.round(r.calmAvg)} calm vs ${Math.round(r.highAvg)} when faster). Nice stamina!`;
  }
  if (r.veryHigh) { box.className = "rest"; html += `<br>❤️ Your heart got very fast (${r.peak} bpm). Take a break and tell a grown-up if you feel dizzy or sick.`; }
  box.innerHTML = html;
}
