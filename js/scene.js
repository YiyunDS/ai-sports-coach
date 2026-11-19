// =====================================================================
//  scene.js  --  THE 3D RINK AND THE "PRO" SKATER
//
//  This file sets up the 3D world:
//     * a camera you can spin around with your mouse or finger
//     * lights and an ice rink
//     * the PRO skater standing in a good hockey stance
//     * signs and colored "pizza slices" that show the angles
//     * tools to MOVE the skaters: drag one across the ice, stand them
//       side by side, or lay one on top of the other (Overlay)
//
//  Other files talk to this one through   window.Coach3D
// =====================================================================
(function () {
  "use strict";
  var M = window.CoachMath;
  var stage = document.getElementById("stage");
  var problem = document.getElementById("stage-problem");

  // If the 3D library did not load (no internet?), say so kindly.
  if (!window.THREE || !window.THREE.OrbitControls) {
    problem.hidden = false;
    problem.textContent = "The 3D library could not load. Check the internet connection and reload the page.";
    return;
  }
  var THREE = window.THREE;

  // ---------- 1. Renderer, scene and camera --------------------------
  // The renderer is the "painter" that draws the picture many times a second.
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    problem.hidden = false;
    problem.textContent = "This browser cannot draw 3D (WebGL is off). Try Chrome, Edge, Firefox or Safari.";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);     // a dark arena, like on TV
  scene.fog = new THREE.Fog(0x0b0f14, 16, 34);      // far things fade out

  var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  // OrbitControls lets you drag to spin, scroll to zoom.
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;            // smooth, glidey movement
  controls.maxPolarAngle = Math.PI * 0.49;  // do not let the camera go under the ice
  controls.minDistance = 1.5;
  controls.maxDistance = 12;

  // ---------- 2. Lights ----------------------------------------------
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5b7896, 0.8)); // soft light from everywhere
  var sun = new THREE.DirectionalLight(0xffffff, 0.8);           // one bright arena light
  sun.position.set(3, 7, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
  scene.add(sun);

  // ---------- 3. The rink --------------------------------------------
  var RINK_W = 16, RINK_D = 8;

  // We paint the ice (lines, circle, skate marks) on a flat picture,
  // then stick that picture onto the floor.
  function paintIce() {
    var c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    var g = c.getContext("2d");
    g.fillStyle = "#e9f0f5"; g.fillRect(0, 0, 1024, 512);
    // Skate marks: lots of faint curvy scratches.
    g.strokeStyle = "rgba(110,150,185,0.16)"; g.lineWidth = 1.2;
    for (var i = 0; i < 70; i++) {
      var x = (i * 173) % 1024, y = (i * 97) % 512;
      g.beginPath(); g.arc(x, y, 40 + (i * 31) % 120, i, i + 1.2); g.stroke();
    }
    // Blue lines and the red center line.
    g.fillStyle = "#1f56b5"; g.fillRect(302, 0, 10, 512); g.fillRect(712, 0, 10, 512);
    g.fillStyle = "#c8243a"; g.fillRect(507, 0, 10, 512);
    // Center circle and dot.
    g.strokeStyle = "#1f56b5"; g.lineWidth = 4;
    g.beginPath(); g.arc(512, 256, 95, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#1f56b5"; g.beginPath(); g.arc(512, 256, 8, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  }

  // A rectangle with round corners, like a real rink.
  function roundedRect(w, d, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  var iceTexture = paintIce();
  // These two lines stretch the picture to fit the whole rink.
  iceTexture.repeat.set(1 / RINK_W, 1 / RINK_D);
  iceTexture.offset.set(0.5, 0.5);
  var ice = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(RINK_W, RINK_D, 2), 24),
    new THREE.MeshStandardMaterial({ map: iceTexture, roughness: 0.25 })
  );
  ice.rotation.x = -Math.PI / 2; // lay it flat
  ice.receiveShadow = true;
  scene.add(ice);

  // A dark rim around the ice, like the boards.
  var rim = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(RINK_W + 0.5, RINK_D + 0.5, 2.25), 24),
    new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.7 })
  );
  rim.rotation.x = -Math.PI / 2; rim.position.y = -0.03;
  scene.add(rim);
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0d1218, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.06;
  scene.add(floor);

  // A puck.
  var puck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.025, 20),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 })
  );
  puck.castShadow = true;
  scene.add(puck);

  // ---------- 4. The skaters -----------------------------------------
  // The blue one is the PRO (or the goal for your age).
  var refFigure = new window.SkaterFigure({ name: "PRO", nameColor: "#4da3ff", jersey: 0x2f7fd6, helmet: 0x12335c, socks: 0x2f7fd6 });
  scene.add(refFigure.group);
  // The orange one is YOU. It stays hidden until there is a pose to show.
  var kidFigure = new window.SkaterFigure({ name: "YOU", nameColor: "#ff9f43", jersey: 0xf08a24, helmet: 0xe9edf2, socks: 0xf08a24 });
  kidFigure.group.visible = false;
  scene.add(kidFigure.group);

  // The angles the blue skater shows. coach.js can change these.
  var reference = { kneeBend: 110, forwardLean: 45, strideExtension: 171 };
  var strideOn = false;   // is the blue skater doing a stride right now?
  var strideClock = 0;    // how far we are into the stride movie
  var hasKid = false;
  var BLUE = "#4da3ff";

  // Where the skaters stand, and how we compare them.
  var compareMode = "side";  // "side" = next to each other, "overlay" = on top of each other
  var gap = 2.5;             // meters between the two skaters in side-by-side mode

  // Add the angle signs and "pizza slices" to a skater.
  //   colors = { knee: "...", lean: "...", push: "..." }
  //   showPush = also label the pushing leg?
  function decorate(fig, pose, colors, showPush) {
    var m = M.measurePose(pose), g = m.glideSide, p = m.pushSide;

    // Knee angle of the glide leg.
    var knee = pose[g + "Knee"];
    fig.setWedge("knee", knee, M.sub(pose[g + "Hip"], knee), M.sub(pose[g + "Ankle"], knee), 0.2, colors.knee);
    fig.setLabel("knee", { x: knee.x + 0.44, y: knee.y + 0.02, z: knee.z }, "Knee " + Math.round(m.kneeBend) + "°", colors.knee);

    // Forward lean: the slice between "straight up" and the back.
    var hipMid = M.mid(pose.lHip, pose.rHip);
    var back = M.sub(M.mid(pose.lShoulder, pose.rShoulder), hipMid);
    fig.setWedge("lean", hipMid, M.pt(0, 1, 0), back, 0.4, colors.lean);
    fig.setLabel("lean", { x: hipMid.x - 0.3, y: hipMid.y + 0.52, z: hipMid.z }, "Lean " + Math.round(m.forwardLean) + "°", colors.lean);

    // Push leg (only while pushing).
    if (showPush) {
      var pk = pose[p + "Knee"];
      fig.setWedge("push", pk, M.sub(pose[p + "Hip"], pk), M.sub(pose[p + "Ankle"], pk), 0.16, colors.push);
      fig.setLabel("push", { x: pk.x - 0.4, y: pk.y - 0.05, z: pk.z }, "Push " + Math.round(m.strideExtension) + "°", colors.push);
    } else {
      fig.hide("push");
    }
    return m;
  }

  // ---- Making the pro move like a real person ----
  // "sync" is set by coach.js when there is a kid on the ice: it tells
  // the pro which leg the kid is pushing with and how far, so both
  // skaters stride in step.  null = the pro skates on its own clock.
  var sync = null;
  // The angles the pro is showing right now. They drift toward the
  // angles it "wants", so nothing ever snaps.
  var live = { knee: reference.kneeBend, lean: reference.forwardLean, ext: reference.strideExtension };

  // Nobody skates every stride exactly the same. wobble() gives a
  // number from -1 to 1 that is different for every stride number,
  // but always the same for the same stride (so nothing flickers).
  function wobble(strideNumber, which) {
    var x = Math.sin(strideNumber * 12.9898 + which * 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }

  // Build the blue skater's pose for this moment and draw it.
  //   dt = seconds since the last picture
  function drawReference(dt) {
    var push = 0, side = "r", phase = 0, stride = 0, moving = false;
    if (sync) {
      push = sync.push; side = sync.side; phase = sync.phase; stride = sync.stride; moving = true;
    } else if (strideOn) {
      // One push takes 1.6 seconds. Right leg, then left leg, and so on.
      var cycle = strideClock / 1.6;
      stride = Math.floor(cycle);
      side = stride % 2 ? "l" : "r";
      phase = cycle % 1;
      push = Math.pow(Math.sin(phase * Math.PI), 2);
      moving = true;
    }
    // What the pro is aiming for on THIS stride: a little deeper or
    // taller, a little more or less lean, and not always a full push.
    // The left leg is a touch weaker, like most real skaters' off side.
    var want = { knee: reference.kneeBend, lean: reference.forwardLean, ext: reference.strideExtension };
    if (moving) {
      want.knee += 4 * wobble(stride, 1);
      want.lean += 3 * wobble(stride, 2);
      want.ext -= 5 * Math.abs(wobble(stride, 3)) + (side === "l" ? 2 : 0);
    }
    var ease = 1 - Math.exp(-(dt || 0) / 0.25); // drift there over about a quarter second
    live.knee += (want.knee - live.knee) * ease;
    live.lean += (want.lean - live.lean) * ease;
    live.ext += (want.ext - live.ext) * ease;

    var pose = M.makeStancePose({
      kneeBend: live.knee, forwardLean: live.lean, strideExtension: live.ext,
      push: push, pushSide: side, phase: phase, natural: moving, withStick: true
    });
    refFigure.update(pose);
    decorate(refFigure, pose, { knee: BLUE, lean: BLUE, push: BLUE }, push > 0.35);
    // Park the puck next to the stick blade, wherever the skater stands.
    var at = refFigure.group.position;
    puck.position.set(at.x + pose.stickBlade.x + 0.12, 0.0125, at.z + pose.stickBlade.z + 0.1);
  }

  // ---------- 5. Camera views ----------------------------------------
  // Where the camera looks, and how far away it sits.
  var lastView = "side";
  function setView(name) {
    lastView = name;
    // Look at the middle of whoever is on the ice.
    var r = refFigure.group.position, k = kidFigure.group.position;
    var cx = hasKid ? (r.x + k.x) / 2 : r.x, cz = hasKid ? (r.z + k.z) / 2 : r.z;
    var spread = hasKid ? Math.sqrt((r.x - k.x) * (r.x - k.x) + (r.z - k.z) * (r.z - k.z)) : 0;
    var target = new THREE.Vector3(cx + 0.25, 0.7, cz);
    var dist = 3.6 + spread * 0.8;
    // On a tall, skinny screen (a phone) step back so everything fits.
    var aspect = camera.aspect || 1;
    if (aspect < 1.3) dist *= 1.3 / aspect;
    var offset = {
      side: [0.25 * dist, 0.22 * dist, 0.95 * dist],
      front: [0.97 * dist, 0.2 * dist, 0.22 * dist],
      top: [0.02, dist, 0.35 * dist]
    }[name] || [0, 0, dist];
    controls.target.copy(target);
    camera.position.set(target.x + offset[0], target.y + offset[1], target.z + offset[2]);
    controls.update();
  }

  // Put the skaters on their starting spots for the current compare mode.
  //   side by side: blue on the left, orange on the right
  //   overlay:      both on the same spot, and blue turns into a "ghost"
  function place() {
    var overlay = hasKid && compareMode === "overlay";
    var half = hasKid && !overlay ? gap / 2 : 0;
    refFigure.group.position.set(-half, 0, 0);
    kidFigure.group.position.set(half, 0, 0);
    refFigure.setGhost(overlay);
    refFigure.labelsOn = !overlay;   // two sets of signs on one spot would be a mess
    if (overlay) refFigure.hideAll();
    setView(lastView);
  }

  // Show one skater, or two.
  function layout(showKid) {
    var changed = showKid !== hasKid;
    hasKid = showKid;
    kidFigure.group.visible = showKid;
    syncCompareUi();
    if (changed) { lastView = "side"; place(); }
  }

  // Make the 3D picture fit its box, even when the window changes size.
  function resize() {
    var w = stage.clientWidth || 800, h = stage.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener("resize", resize);
  resize();
  setView("side");

  // ---------- 6. The drawing loop ------------------------------------
  // The browser calls tick() about 60 times a second.
  var lastTime = performance.now();
  var onTick = []; // other files can add things to do every tick
  function tick(now) {
    var dt = Math.min(0.1, (now - lastTime) / 1000); // seconds since last picture
    lastTime = now;
    if (strideOn) strideClock += dt;
    // Other files go first (coach.js picks the kid's pose and tells the
    // pro where in the stride to be), then we draw the pro to match.
    onTick.forEach(function (fn) { fn(dt); });
    drawReference(dt);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- 7. Buttons on top of the 3D picture --------------------
  Array.prototype.forEach.call(document.querySelectorAll("[data-view]"), function (btn) {
    btn.addEventListener("click", function () { setView(btn.getAttribute("data-view")); });
  });
  var strideBtn = document.getElementById("stride-btn");
  strideBtn.addEventListener("click", function () {
    if (sync) return; // while synced, the kid's stride drives the pro
    strideOn = !strideOn;
    strideClock = 0;
    strideBtn.textContent = strideOn ? "Hold stance" : "Play stride";
    strideBtn.setAttribute("aria-pressed", String(strideOn));
  });

  // ---------- 8. Moving the skaters ----------------------------------
  var modeButtons = document.querySelectorAll("[data-compare]");
  var gapInput = document.getElementById("gap");
  var gapOut = document.getElementById("gap-out");
  var resetBtn = document.getElementById("reset-pos");

  function syncCompareUi() {
    Array.prototype.forEach.call(modeButtons, function (b) {
      b.disabled = !hasKid;
      b.setAttribute("aria-pressed", String(b.getAttribute("data-compare") === compareMode));
    });
    if (gapInput) gapInput.disabled = !hasKid || compareMode !== "side";
    if (gapOut) gapOut.textContent = gap.toFixed(1) + " m";
  }
  Array.prototype.forEach.call(modeButtons, function (b) {
    b.addEventListener("click", function () {
      compareMode = b.getAttribute("data-compare");
      syncCompareUi();
      place();
    });
  });
  if (gapInput) gapInput.addEventListener("input", function () {
    gap = Number(gapInput.value);
    syncCompareUi();
    place();
  });
  if (resetBtn) resetBtn.addEventListener("click", place);
  syncCompareUi();

  // Dragging: press on a skater and slide it across the ice.
  // A "ray" is an invisible line from the camera through your pointer.
  var raycaster = new THREE.Raycaster();
  var icePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // the flat ice at height 0
  var pointer = new THREE.Vector2();
  var grabbed = null;                    // the skater we are dragging right now
  var grabOffset = new THREE.Vector3();  // where on the skater we grabbed it
  var hitPoint = new THREE.Vector3();

  function aim(ev) {
    var box = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - box.left) / box.width) * 2 - 1;
    pointer.y = -((ev.clientY - box.top) / box.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }
  function bodyParts(fig) {
    return fig.group.children.filter(function (m) { return m.userData.body && m.visible; });
  }
  // Which skater is under the pointer? (null = none)
  function skaterUnderPointer() {
    var best = null, bestDist = Infinity;
    [kidFigure, refFigure].forEach(function (fig) {
      if (!fig.group.visible) return;
      var hits = raycaster.intersectObjects(bodyParts(fig), false);
      if (hits.length && hits[0].distance < bestDist) { best = fig; bestDist = hits[0].distance; }
    });
    return best;
  }

  // We listen on the box AROUND the 3D picture, in the "capture" phase,
  // so we hear the press before the spin-the-camera controls do.
  stage.addEventListener("pointerdown", function (ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    aim(ev);
    var fig = skaterUnderPointer();
    if (!fig || !raycaster.ray.intersectPlane(icePlane, hitPoint)) return;
    grabbed = fig;
    grabOffset.copy(fig.group.position).sub(hitPoint);
    controls.enabled = false;          // do not spin the camera while dragging
    stage.classList.add("dragging");
  }, true);
  window.addEventListener("pointermove", function (ev) {
    if (!grabbed) {
      // Show a "grab" hand when the pointer is over a skater.
      if (ev.target === renderer.domElement) {
        aim(ev);
        stage.classList.toggle("can-grab", !!skaterUnderPointer());
      }
      return;
    }
    aim(ev);
    if (!raycaster.ray.intersectPlane(icePlane, hitPoint)) return;
    // Keep the skater on the ice.
    var x = Math.max(-RINK_W / 2 + 1, Math.min(RINK_W / 2 - 1, hitPoint.x + grabOffset.x));
    var z = Math.max(-RINK_D / 2 + 0.6, Math.min(RINK_D / 2 - 0.6, hitPoint.z + grabOffset.z));
    grabbed.group.position.set(x, 0, z);
  });
  function letGo() {
    if (!grabbed) return;
    grabbed = null;
    controls.enabled = true;
    stage.classList.remove("dragging");
  }
  window.addEventListener("pointerup", letGo);
  window.addEventListener("pointercancel", letGo);

  // ---------- 9. What other files can use ----------------------------
  window.Coach3D = {
    refFigure: refFigure,
    kidFigure: kidFigure,
    decorate: decorate,
    layout: layout,
    setView: setView,
    onTick: onTick,
    // Change what the blue skater shows. name is "PRO" or "GOAL".
    setReference: function (angles, name) {
      reference = angles;
      refFigure.name = name;
    },
    // Make the pro stride in step with the kid.
    //   s = { push, side, phase, stride }   or null to stop syncing
    setSync: function (s) {
      var was = !!sync;
      sync = s;
      if (was !== !!s) {
        strideOn = false;
        strideBtn.disabled = !!s;
        strideBtn.setAttribute("aria-pressed", "false");
        strideBtn.textContent = s ? "Pro synced to skater" : "Play stride";
      }
    }
  };
})();
