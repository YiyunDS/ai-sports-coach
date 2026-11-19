// =====================================================================
//  scene.js  --  THE 3D RINK AND THE "PRO" SKATER
//
//  This file sets up the 3D world:
//     * a camera you can spin around with your mouse or finger
//     * lights and an ice rink
//     * the PRO skater standing in a good hockey stance
//     * signs and colored "pizza slices" that show the angles
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
    problem.textContent = "Oops! The 3D library could not load. Check your internet and reload the page.";
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
    problem.textContent = "Oops! This browser cannot draw 3D (WebGL is off). Try Chrome, Edge, Firefox or Safari.";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcdeaff);     // light blue arena air
  scene.fog = new THREE.Fog(0xcdeaff, 14, 30);      // far things fade out

  var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  // OrbitControls lets you drag to spin, scroll to zoom.
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;            // smooth, glidey movement
  controls.maxPolarAngle = Math.PI * 0.49;  // do not let the camera go under the ice
  controls.minDistance = 1.5;
  controls.maxDistance = 12;

  // ---------- 2. Lights ----------------------------------------------
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9fc5e8, 0.85)); // soft light from everywhere
  var sun = new THREE.DirectionalLight(0xffffff, 0.75);           // one bright arena light
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
    g.fillStyle = "#f4fbff"; g.fillRect(0, 0, 1024, 512);
    // Skate marks: lots of faint curvy scratches.
    g.strokeStyle = "rgba(120,170,210,0.22)"; g.lineWidth = 1.5;
    for (var i = 0; i < 70; i++) {
      var x = (i * 173) % 1024, y = (i * 97) % 512;
      g.beginPath(); g.arc(x, y, 40 + (i * 31) % 120, i, i + 1.2); g.stroke();
    }
    // Blue lines and the red center line.
    g.fillStyle = "#2563eb"; g.fillRect(300, 0, 14, 512); g.fillRect(710, 0, 14, 512);
    g.fillStyle = "#e11d48"; g.fillRect(506, 0, 12, 512);
    // Center circle and dot.
    g.strokeStyle = "#2563eb"; g.lineWidth = 6;
    g.beginPath(); g.arc(512, 256, 95, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#2563eb"; g.beginPath(); g.arc(512, 256, 10, 0, Math.PI * 2); g.fill();
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

  // A yellow-and-white rim around the ice, like the boards.
  var rim = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(RINK_W + 0.5, RINK_D + 0.5, 2.25), 24),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 })
  );
  rim.rotation.x = -Math.PI / 2; rim.position.y = -0.03;
  scene.add(rim);
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0xa9d4f5, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.06;
  scene.add(floor);

  // Fun extras: a puck and three practice cones.
  var puck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.025, 20),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 })
  );
  puck.castShadow = true;
  scene.add(puck);
  [[-3.2, -2.2], [0.4, -2.6], [3.6, -2.0]].forEach(function (xz) {
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.3, 20),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 })
    );
    cone.position.set(xz[0], 0.15, xz[1]);
    cone.castShadow = true;
    scene.add(cone);
  });

  // ---------- 4. The skaters -----------------------------------------
  // The blue one is the PRO (or the goal for your age).
  var refFigure = new window.SkaterFigure({ name: "PRO", nameColor: "#2563eb", jersey: 0x2563eb, helmet: 0x1e3a8a, socks: 0xffffff });
  scene.add(refFigure.group);
  // The orange one is YOU. It stays hidden until there is a pose to show.
  var kidFigure = new window.SkaterFigure({ name: "YOU", nameColor: "#ea580c", jersey: 0xf97316, helmet: 0xffffff, socks: 0xfde68a });
  kidFigure.group.visible = false;
  scene.add(kidFigure.group);

  // The angles the blue skater shows. coach.js can change these.
  var reference = { kneeBend: 110, forwardLean: 45, strideExtension: 171 };
  var strideOn = false;   // is the blue skater doing a stride right now?
  var strideClock = 0;    // how far we are into the stride movie
  var hasKid = false;
  var BLUE = "#2563eb";

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

  // Build the blue skater's pose for this moment and draw it.
  function drawReference() {
    var push = 0, side = "r";
    if (strideOn) {
      // One push takes 1.6 seconds. Right leg, then left leg, and so on.
      var cycle = strideClock / 1.6;
      side = Math.floor(cycle) % 2 ? "l" : "r";
      push = Math.pow(Math.sin((cycle % 1) * Math.PI), 2);
    }
    var pose = M.makeStancePose({
      kneeBend: reference.kneeBend, forwardLean: reference.forwardLean,
      strideExtension: reference.strideExtension, push: push, pushSide: side, withStick: true
    });
    refFigure.update(pose);
    decorate(refFigure, pose, { knee: BLUE, lean: BLUE, push: BLUE }, push > 0.35);
    // Park the puck next to the stick blade.
    puck.position.set(refFigure.group.position.x + pose.stickBlade.x + 0.12, 0.0125, pose.stickBlade.z + 0.1);
  }

  // ---------- 5. Camera views ----------------------------------------
  // Where the camera looks, and how far away it sits.
  function setView(name) {
    var target = new THREE.Vector3(hasKid ? 0.2 : 0.3, 0.7, 0);
    var dist = hasKid ? 5.6 : 3.6;
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

  // Put one skater in the middle, or two skaters side by side.
  function layout(showKid) {
    var changed = showKid !== hasKid;
    hasKid = showKid;
    refFigure.group.position.x = showKid ? -1.25 : 0;
    kidFigure.group.position.x = 1.25;
    kidFigure.group.visible = showKid;
    if (changed) setView("side");
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
    drawReference();
    onTick.forEach(function (fn) { fn(dt); });
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
    strideOn = !strideOn;
    strideClock = 0;
    strideBtn.textContent = strideOn ? "⏸ Back to stance" : "▶ Show the stride";
    strideBtn.setAttribute("aria-pressed", String(strideOn));
  });

  // ---------- 8. What other files can use ----------------------------
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
    }
  };
})();
