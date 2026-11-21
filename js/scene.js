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
  var UI = window.CoachUI;   // the camera math lives in ui.js (so the tests can check it)
  var stage = document.getElementById("stage");
  var problem = document.getElementById("stage-problem");

  // If the 3D library did not load (no internet?), say so kindly.
  if (!window.THREE || !window.THREE.OrbitControls) {
    problem.hidden = false;
    problem.textContent = "The 3D library could not load. Check the internet connection and reload the page.";
    return;
  }
  var THREE = window.THREE;
  problem.hidden = true; // the "Loading..." message can go

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
  // "Tone mapping" works like a camera's exposure: very bright things
  // (white ice under arena lights) keep their detail instead of turning
  // into a flat white blob.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  stage.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e13);     // a dark arena, like on TV
  scene.fog = new THREE.Fog(0x0a0e13, 18, 46);      // far things fade into the dark

  var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  camera.layers.enableAll(); // see the skaters (layer 0) and the signs (layer 1)

  // OrbitControls lets you drag to spin, scroll to zoom.
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;            // smooth, glidey movement
  controls.maxPolarAngle = Math.PI * 0.49;  // do not let the camera go under the ice
  controls.minDistance = 1.5;
  controls.maxDistance = 18;
  // Did the user turn or zoom the camera themself? Then we leave it
  // alone when the window changes size.
  var userMovedCamera = false;
  controls.addEventListener("start", function () { userMovedCamera = true; endGlide(); });

  // ---------- 2. Lights ----------------------------------------------
  // Soft light from all around, like a big bright room. Shiny things
  // (helmets, skate steel, the ice) also show soft reflections of it.
  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x28323d, 0.5)); // a little light from the sky and the floor
  // The main arena light, high above and in front. It casts the shadows.
  var sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun);
  // A cool light from behind that outlines the skaters against the dark.
  var rimLight = new THREE.DirectionalLight(0xbcd4ff, 1.1);
  rimLight.position.set(-5, 5, -7);
  scene.add(rimLight);

  // ---------- 3. The rink --------------------------------------------
  // The middle part of a real rink (center ice), at real size:
  // 30 meters long and 15 meters wide, with boards and glass around it.
  var RINK_W = 30, RINK_D = 15, CORNER = 4.5;
  var PX = 2048 / RINK_W; // dots of the ice picture per meter

  // We paint the ice (lines, circle, skate marks) on a flat picture,
  // then stick that picture onto the floor. Every size here is in meters.
  function paintIce() {
    var c = document.createElement("canvas");
    c.width = 2048; c.height = 1024;
    var g = c.getContext("2d");
    function X(m) { return 1024 + m * PX; }   // meters from center ice -> dots
    function Y(m) { return 512 + m * PX; }
    // The ice, a touch darker in places, like real ice.
    g.fillStyle = "#e5ecf1"; g.fillRect(0, 0, 2048, 1024);
    for (var k = 0; k < 18; k++) {
      var gx = (k * 397) % 2048, gy = (k * 263) % 1024, r = 120 + (k * 53) % 220;
      var shade = g.createRadialGradient(gx, gy, 0, gx, gy, r);
      shade.addColorStop(0, "rgba(160,180,200,0.10)"); shade.addColorStop(1, "rgba(160,180,200,0)");
      g.fillStyle = shade; g.fillRect(gx - r, gy - r, 2 * r, 2 * r);
    }
    // The lines are painted UNDER the ice, so their edges are a little soft.
    g.filter = "blur(1.2px)";
    g.fillStyle = "#1d4fa3";                                   // blue lines
    [-7.6, 7.6].forEach(function (x) { g.fillRect(X(x) - 0.15 * PX, 0, 0.3 * PX, 1024); });
    g.fillStyle = "#b81f33";                                   // red center line
    g.fillRect(X(0) - 0.15 * PX, 0, 0.3 * PX, 1024);
    g.strokeStyle = "#1d4fa3"; g.lineWidth = 0.05 * PX;        // center circle
    g.beginPath(); g.arc(X(0), Y(0), 4.5 * PX, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#1d4fa3";                                   // center dot
    g.beginPath(); g.arc(X(0), Y(0), 0.15 * PX, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#b81f33";                                   // neutral-zone dots
    [-6.1, 6.1].forEach(function (x) {
      [-6.7, 6.7].forEach(function (y) { g.beginPath(); g.arc(X(x), Y(y), 0.3 * PX, 0, Math.PI * 2); g.fill(); });
    });
    g.filter = "none";
    // Skate marks: lots of faint curvy scratches on top.
    g.lineWidth = 1;
    for (var i = 0; i < 260; i++) {
      var sx = (i * 173) % 2048, sy = (i * 97) % 1024;
      g.strokeStyle = "rgba(120,145,170," + (0.05 + (i % 5) * 0.015) + ")";
      g.beginPath(); g.arc(sx, sy, 60 + (i * 31) % 260, i, i + 0.5 + (i % 3) * 0.3); g.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy(); // stays sharp when seen at a low angle
    return t;
  }

  // A rectangle with round corners, like a real rink.
  function roundedRect(w, d, r, path) {
    var s = path || new THREE.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // A wall that follows the rink's outline: "thick" meters thick, from
  // height "bottom" up to height "top", starting "gap" meters outside the ice.
  function rinkWall(gap, thick, bottom, top, material) {
    var outer = roundedRect(RINK_W + 2 * (gap + thick), RINK_D + 2 * (gap + thick), CORNER + gap + thick);
    outer.holes.push(roundedRect(RINK_W + 2 * gap, RINK_D + 2 * gap, CORNER + gap, new THREE.Path()));
    var geo = new THREE.ExtrudeGeometry(outer, { depth: top - bottom, bevelEnabled: false, curveSegments: 24 });
    var wall = new THREE.Mesh(geo, material);
    wall.rotation.x = -Math.PI / 2; // stand it up
    wall.position.y = bottom;
    scene.add(wall);
    return wall;
  }

  var iceTexture = paintIce();
  iceTexture.wrapS = THREE.RepeatWrapping; // so the ice can slide along and wrap around
  // These two lines stretch the picture to fit the whole rink.
  iceTexture.repeat.set(1 / RINK_W, 1 / RINK_D);
  iceTexture.offset.set(0.5, 0.5);
  var ice = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(RINK_W, RINK_D, CORNER), 32),
    new THREE.MeshStandardMaterial({ map: iceTexture, roughness: 0.22, metalness: 0, envMapIntensity: 0.6 })
  );
  ice.rotation.x = -Math.PI / 2; // lay it flat
  ice.receiveShadow = true;
  scene.add(ice);

  // The boards: white, with a yellow kick plate at the bottom and a dark
  // rail on top. Then the glass above them.
  var boards = rinkWall(0, 0.16, 0, 1.0, new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.5 }));
  boards.receiveShadow = true;
  rinkWall(-0.004, 0.17, 0, 0.24, new THREE.MeshStandardMaterial({ color: 0xc99a2e, roughness: 0.55 }));
  rinkWall(-0.01, 0.19, 1.0, 1.05, new THREE.MeshStandardMaterial({ color: 0x15233a, roughness: 0.4 }));
  rinkWall(0.07, 0.02, 1.05, 2.6, new THREE.MeshStandardMaterial({
    color: 0xd6e6f2, roughness: 0.05, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide
  }));
  // Thin posts that hold the glass panels, every 2 meters along the long sides.
  var postGeo = new THREE.BoxGeometry(0.035, 1.55, 0.035);
  var postPaint = new THREE.MeshStandardMaterial({ color: 0x8b96a3, roughness: 0.4, metalness: 0.5 });
  for (var px = -RINK_W / 2 + CORNER; px <= RINK_W / 2 - CORNER + 0.01; px += 2) {
    [-1, 1].forEach(function (side) {
      var post = new THREE.Mesh(postGeo, postPaint);
      post.position.set(px, 1.82, side * (RINK_D / 2 + 0.08));
      scene.add(post);
    });
  }
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x0c1117, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02;
  scene.add(floor);

  // ---------- 4. The skaters -----------------------------------------
  // The blue one is the PRO (or the goal for your age).
  // The realistic skater if its model loaded, otherwise the simpler one.
  function makeSkater(opts) {
    if (window.RiggedFigure) {
      try { return new window.RiggedFigure(opts); } catch (e) { console.error(e); }
    }
    return new window.SkaterFigure(opts);
  }
  var refFigure = makeSkater({
    name: "PRO", nameColor: "#4da3ff", number: "14",
    jersey: 0x2f6fc0, trim: 0x0e2240, socks: 0x2f6fc0, pants: 0x14213a, helmet: 0x0e2240, glove: 0x14213a
  });
  scene.add(refFigure.group);
  // The orange one is YOU. It stays hidden until there is a pose to show.
  var kidFigure = makeSkater({
    name: "YOU", nameColor: "#ff9f43", number: "7",
    jersey: 0xe57f22, trim: 0x2a1606, socks: 0xe57f22, pants: 0x1b1d22, helmet: 0x1b1d22, glove: 0x1b1d22
  });
  kidFigure.group.visible = false;
  scene.add(kidFigure.group);

  // The angles the blue skater shows. coach.js can change these.
  var reference = { kneeBend: 110, forwardLean: 45, strideExtension: 171 };
  var strideOn = false;   // is the blue skater doing a stride right now?
  var hasKid = false;
  var BLUE = "#4da3ff";

  // Where the skaters stand, and how we compare them.
  var compareMode = "side";  // "side" = next to each other, "overlay" = on top of each other
  var gap = 2.5;             // meters between the two skaters in side-by-side mode
  // A phone's picture is narrow: start the skaters closer so both fit in it.
  if (window.matchMedia && window.matchMedia("(max-width: 700px)").matches) gap = 1.5;

  var showAngles = true;   // "Angle signs" in the help box turns the signs and slices off
  var showElbows = false;  // "Elbow angles too" adds the two elbow signs
  // The signs stand a little BESIDE their joint, as the camera sees it:
  // the knee sign to the right of the knee, the lean sign up and to the
  // left of the back, the push sign to the left of the pushing knee. A
  // thin line joins each sign to its joint. That way no sign covers the
  // body, from whichever side you look.
  var camRight = new THREE.Vector3(1, 0, 0), camUp = new THREE.Vector3(0, 1, 0);
  var signSize = 1;   // how much bigger the signs are drawn right now (see signScale in ui.js)
  // A spot "right" meters to the camera's right of a joint and "up" meters above it.
  function beside(from, right, up) {
    // Bigger signs stand a little farther out, but never very far: on
    // a phone they would end up on top of the other skater.
    var grow = Math.min(signSize, 1.35);
    right *= grow; up *= grow;
    return { x: from.x + camRight.x * right + camUp.x * up, y: from.y + camRight.y * right + camUp.y * up, z: from.z + camRight.z * right + camUp.z * up };
  }

  // When you tap a card in the report, the camera goes to that joint
  // and its sign stays strong while the other signs fade ("focus").
  //   sign = which sign belongs to the check
  //   y    = how high above the ice the camera looks, tall = how much it shows
  var FOCUS = {
    kneeBend: { sign: "knee", y: 0.55, tall: 1.0 },
    forwardLean: { sign: "lean", y: 1.3, tall: 1.2 },
    strideExtension: { sign: "push", y: 0.55, tall: 1.0 }
  };
  var focusId = null;   // the check the camera is looking at closely (null = the whole skaters)
  function focusSign() { return focusId ? FOCUS[focusId].sign : null; }

  // Add the angle signs and "pizza slices" to a skater.
  //   colors = { knee: "...", lean: "...", push: "...", elbow: "..." (optional) }
  //            elbow: false = no elbow signs (when the arms were not measured)
  //   showPush = also label the pushing leg?
  //   shown    = (optional) the numbers to print on the signs. The report
  //              sometimes measures on the flat video picture, and the
  //              signs should say the same numbers as the report.
  function decorate(fig, pose, colors, showPush, shown) {
    var m = M.measurePose(pose);
    if (!showAngles) { ["knee", "lean", "push", "lElbow", "rElbow"].forEach(function (id) { fig.hide(id); }); return m; }
    if (shown) {
      m.kneeBend = shown.kneeBend; m.forwardLean = shown.forwardLean; m.strideExtension = shown.strideExtension;
      if (shown.glideSide) { m.glideSide = shown.glideSide; m.pushSide = shown.pushSide; }
    }
    var g = m.glideSide, p = m.pushSide, lit = focusSign();
    // The slice of the check you tapped is drawn a little bigger.
    function size(id, radius) { return id === lit ? radius * 1.3 : radius; }

    // Knee angle of the glide leg.
    var knee = pose[g + "Knee"];
    fig.setWedge("knee", knee, M.sub(pose[g + "Hip"], knee), M.sub(pose[g + "Ankle"], knee), size("knee", 0.2), colors.knee);
    fig.setLabel("knee", beside(knee, 0.44, 0.03), "Knee " + Math.round(m.kneeBend) + "°", colors.knee, knee);

    // Forward lean: the slice between "straight up" and the back.
    var hipMid = M.mid(pose.lHip, pose.rHip);
    var back = M.sub(M.mid(pose.lShoulder, pose.rShoulder), hipMid);
    fig.setWedge("lean", hipMid, M.pt(0, 1, 0), back, size("lean", 0.4), colors.lean);
    // (The sign's line starts on the back, a third of the way up.)
    var onBack = { x: hipMid.x + back.x * 0.35, y: hipMid.y + back.y * 0.35, z: hipMid.z + back.z * 0.35 };
    fig.setLabel("lean", beside(onBack, -0.38, 0.34), "Lean " + Math.round(m.forwardLean) + "°", colors.lean, onBack);

    // Push leg (only while pushing).
    if (showPush) {
      var pk = pose[p + "Knee"];
      fig.setWedge("push", pk, M.sub(pose[p + "Hip"], pk), M.sub(pose[p + "Ankle"], pk), size("push", 0.16), colors.push);
      fig.setLabel("push", beside(pk, -0.44, -0.04), "Push " + Math.round(m.strideExtension) + "°", colors.push, pk);
    } else {
      fig.hide("push");
    }

    // Elbows: how bent each arm is (180 = straight). Only when asked
    // for in the help box: three signs are easier to read than five.
    ["l", "r"].forEach(function (s) {
      var sh = pose[s + "Shoulder"], el = pose[s + "Elbow"], wr = pose[s + "Wrist"], id = s + "Elbow";
      if (!showElbows || !sh || !el || !wr || colors.elbow === false) { fig.hide(id); return; }
      var deg = M.angleAt(sh, el, wr), color = colors.elbow || "#cbd5e1";
      fig.setWedge(id, el, M.sub(sh, el), M.sub(wr, el), 0.11, color);
      fig.setLabel(id, beside(el, s === "l" ? 0.4 : -0.4, s === "l" ? 0.2 : 0.12),
        (s === "l" ? "L" : "R") + " elbow " + Math.round(deg) + "°", color, el);
    });
    return m;
  }

  // The signs of the check you tapped stay strong; the others fade.
  // (They glide there in about a tenth of a second.)
  var strength = { knee: 1, lean: 1, push: 1, lElbow: 1, rElbow: 1 };
  function fadeSigns(dt) {
    var lit = focusSign(), ease = 1 - Math.exp(-dt / 0.1);
    Object.keys(strength).forEach(function (id) {
      var want = !lit || id === lit ? 1 : 0.18;
      strength[id] += (want - strength[id]) * ease;
      refFigure.setStrength(id, strength[id]);
      kidFigure.setStrength(id, strength[id]);
    });
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

  // How far the pro is through its skating cycle (0 to 1, see stride.js),
  // and how much it is skating right now (0 = standing in its stance,
  // 1 = fully skating). Going between the two takes about half a second,
  // so the pro eases into the stride instead of snapping.
  var cycleTime = 0, cycles = 0, moveAmount = 0;
  // A skater carries speed, so the ice slides under the skaters like a
  // treadmill while the pro skates (the skaters stay in view).
  var iceSlide = 0;

  // Build the blue skater's pose for this moment and draw it.
  //   dt = seconds since the last picture
  function drawReference(dt) {
    var St = window.CoachStride, S = St.STRIDE;
    dt = dt || 0;
    var moving = !!sync || strideOn;
    var advance = 0; // how much of a cycle the pro moved on this frame
    if (sync && sync.loop) {
      // The kid's rebuilt stride goes round and round on its own:
      // sync.loop() = how many seconds one full stride takes right now.
      advance = dt / Math.max(0.2, sync.loop());
      cycleTime += advance;
      if (cycleTime >= 1) { cycleTime -= 1; cycles++; }
    } else if (sync) {
      // Follow the kid: aim for the same leg at the same moment of the
      // push, and glide there the short way around the cycle.
      // (sync.cycle = the kid's own steady stride clock, from rebuild.js.
      //  Without it we guess the moment from how far out the leg is.)
      var want = sync.cycle !== undefined ? ((sync.cycle % 1) + 1) % 1 : St.cycleTimeFor(sync.side, sync.phase);
      var diff = ((want - cycleTime) % 1 + 1.5) % 1 - 0.5;
      var step = diff * (1 - Math.exp(-dt / 0.12));
      cycleTime += step;
      advance = step;
      if (cycleTime >= 1) { cycleTime -= 1; cycles++; }
      if (cycleTime < 0) { cycleTime += 1; cycles--; }
    } else if (strideOn) {
      advance = dt / S.secondsPerCycle;
      cycleTime += advance;
      if (cycleTime >= 1) { cycleTime -= 1; cycles++; }
    }
    moveAmount += ((moving ? 1 : 0) - moveAmount) * (1 - Math.exp(-dt / 0.18));
    var stride = cycles * 2 + (cycleTime >= 0.5 ? 1 : 0); // which push this is

    // What the pro is aiming for on THIS push: a little deeper or
    // taller, a little more or less lean, and not always a full push.
    // The left leg is a touch weaker, like most real skaters' off side.
    var goal = { knee: reference.kneeBend, lean: reference.forwardLean, ext: reference.strideExtension };
    if (moving) {
      goal.knee += 4 * wobble(stride, 1);
      goal.lean += 3 * wobble(stride, 2);
      goal.ext -= 5 * Math.abs(wobble(stride, 3)) + (cycleTime >= 0.5 ? 0 : 2);
    }
    var ease = 1 - Math.exp(-dt / 0.25); // drift there over about a quarter second
    live.knee += (goal.knee - live.knee) * ease;
    live.lean += (goal.lean - live.lean) * ease;
    live.ext += (goal.ext - live.ext) * ease;
    var angles = { kneeBend: live.knee, forwardLean: live.lean, strideExtension: live.ext };

    // The standing pose and the skating pose, blended by moveAmount.
    var stance = M.makeStancePose({ kneeBend: live.knee, forwardLean: live.lean, strideExtension: live.ext, withStick: true });
    var pose = stance, edges = null, shown = null;
    if (moveAmount > 0.001) {
      var skating = St.makeStridePose(cycleTime, angles);
      pose = M.lerpPose(stance, skating.pose, moveAmount);
      edges = { l: skating.edges.l * moveAmount, r: skating.edges.r * moveAmount };
      if (moveAmount > 0.5) {
        // Label the leg that carries the weight, and the leg that pushes.
        var g = skating.glideSide, pu = skating.pushSide || (g === "r" ? "l" : "r");
        shown = {
          glideSide: g, pushSide: pu, forwardLean: M.measurePose(pose).forwardLean,
          kneeBend: M.angleAt(pose[g + "Hip"], pose[g + "Knee"], pose[g + "Ankle"]),
          strideExtension: M.angleAt(pose[pu + "Hip"], pose[pu + "Knee"], pose[pu + "Ankle"])
        };
      }
      // The ice slides exactly as far as the skater's stride carries them,
      // so it stops when the replay is paused.
      iceSlide += S.metersPerCycle * advance * moveAmount;
      iceTexture.offset.x = 0.5 + iceSlide / RINK_W;
    }
    refFigure.update(pose, null, { edges: edges });
    var showPush = shown ? !!skating.pushSide : false;
    decorate(refFigure, pose, { knee: BLUE, lean: BLUE, push: BLUE, elbow: BLUE }, showPush, shown);
    // On a narrow picture (a phone) two skaters with three signs each
    // do not fit: the signs would cover each other. So next to YOU the
    // pro keeps its colored slices, but shows only the sign of the
    // check you tapped. (Your own signs always stay.)
    if (hasKid && narrowPicture()) {
      var lit = focusSign();
      ["knee", "lean", "push"].forEach(function (id) { if (id !== lit) refFigure.hideLabel(id); });
    }
  }

  // ---------- 5. Camera views ----------------------------------------
  // Where the camera looks, and how far away it sits.
  //   side  = from the skater's right side, a little above (best for knee and lean)
  //   front = from in front (best for the push out to the side)
  //   top   = from above
  var lastView = "side";
  var toolsBar = document.getElementById("stage-tools");   // the bar with the compare tools
  var VIEW_DIRECTIONS = { side: [0, 0.24, 1], front: [1, 0.24, 0], top: [0, 1, 0.14] };
  var viewButtons = document.querySelectorAll("[data-view]");

  // Point the camera so every skater on the ice (and their signs) fits
  // in the picture, with a little room around them.
  //   smooth = glide there in about half a second (when you press Side,
  //            Front or Top). Otherwise the camera is simply put there.
  function frameView(smooth) {
    endGlide();
    var r = refFigure.group.position, k = kidFigure.group.position;
    var xs = [r.x], zs = [r.z];
    if (hasKid) { xs.push(k.x); zs.push(k.z); }
    var x0 = Math.min.apply(null, xs) - 0.7, x1 = Math.max.apply(null, xs) + 1.1; // the stick reaches forward
    var z0 = Math.min.apply(null, zs) - 0.7, z1 = Math.max.apply(null, zs) + 0.7;
    var name = lastView, dir = new THREE.Vector3().fromArray(VIEW_DIRECTIONS[name] || VIEW_DIRECTIONS.side).normalize();
    var wide, tall, target;
    if (name === "top") {
      // From above, show a bit more ice so the signs do not crowd the skater.
      wide = Math.max(x1 - x0, 4); tall = Math.max(z1 - z0, 3);
      target = new THREE.Vector3((x0 + x1) / 2, 0.2, (z0 + z1) / 2);
    } else {
      wide = name === "front" ? z1 - z0 : x1 - x0;
      // From the ice to just above the name signs. (On a small picture
      // the signs are drawn bigger, so they reach higher: nameTop.)
      tall = nameTop + 0.15;
      target = new THREE.Vector3((x0 + x1) / 2, (nameTop - 0.15) / 2, (z0 + z1) / 2);
    }
    var aspect = camera.aspect || 1.6;
    if (focusId && hasKid && name === "side") {
      // A CLOSE LOOK at one joint (you tapped a card in the report): only
      // the height around that joint. Both skaters if that brings us a
      // good deal closer; on a narrow phone picture it does not, so there
      // we look at the orange skater alone.
      var F = FOCUS[focusId];
      var whole = UI.cameraDistance(wide, tall, camera.fov, aspect);
      if (UI.cameraDistance(wide, F.tall, camera.fov, aspect) > whole * 0.8) { x0 = k.x - 0.85; x1 = k.x + 0.95; }
      wide = x1 - x0; tall = F.tall;
      target = new THREE.Vector3((x0 + x1) / 2, F.y, (z0 + z1) / 2);
    }
    // Buttons float over the top of the picture, and the tool bar (or
    // the start card) over the bottom. The skaters must fit in the part
    // in between, so the camera shows a little more than their height.
    var high = stage.clientHeight || 500, coverTop = 0, coverBottom = 0;
    if (name !== "top") {
      coverTop = 52;
      coverBottom = floatingAtBottom();
      tall = tall / Math.max(0.5, 1 - (coverTop + coverBottom) / high);
    }
    // How far back must the camera be to see all of it? (cameraDistance
    // is in ui.js.) A little extra room around it.
    var dist = 1.15 * UI.cameraDistance(wide, tall, camera.fov, aspect) + 0.6;
    // Stay inside the rink (on a narrow phone screen the camera would
    // otherwise back up through the glass).
    if (name === "side") dist = Math.min(dist, (RINK_D / 2 - 0.7 - target.z) / dir.z);
    // Look a little lower (or higher), so the skaters sit in the middle
    // of the free part of the picture and not behind the tool bar.
    var seen = 2 * dist * Math.tan(camera.fov / 2 * Math.PI / 180);   // meters of height the picture shows
    target.y += (coverTop - coverBottom) / 2 / high * seen;
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (smooth && !calm) {
      // Remember where the camera is and where it should end up. The
      // drawing loop (tick) moves it a little with every picture.
      glide = {
        t: 0,
        fromTarget: controls.target.clone(), toTarget: target,
        fromArm: camera.position.clone().sub(controls.target), toArm: dir.clone().multiplyScalar(dist),
        skaters: []
      };
    } else {
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
      controls.update();
    }
    // Now we know how far away the camera sits, so we know how big the
    // signs will be drawn, and how high the name signs reach. If that is
    // not what we planned with, plan once more with the better number.
    var size = UI.signScale(dist, camera.fov, high, signPixels(), 0.158);
    var top = 1.62 + 0.3 * size;
    if (Math.abs(top - nameTop) > 0.03 && !replanning) {
      nameTop = top;
      replanning = true;
      frameView(smooth);
      replanning = false;
      return;
    }
    userMovedCamera = false;
    Array.prototype.forEach.call(viewButtons, function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === name));
    });
  }

  var nameTop = 1.9;        // how high above the ice the name signs reach (meters)
  var replanning = false;   // frameView is having its second go (see the end of frameView)
  // How tall a sign should look on the screen, in pixels. A little
  // smaller on a narrow phone picture, where two skaters share the room.
  function narrowPicture() { return (stage.clientWidth || 800) < 500; }
  function signPixels() { return narrowPicture() ? 21 : 25; }

  // How many pixels at the bottom of the picture are covered by the
  // tool bar or by the start card?
  var startCard = document.getElementById("start-card");
  function floatingAtBottom() {
    var cover = 0;
    [toolsBar, startCard].forEach(function (box) {
      if (box && box.offsetParent !== null) cover = Math.max(cover, box.offsetHeight + 22);
    });
    return cover;
  }

  // ---------- The camera glides to a new view ------------------------
  // "glide" holds a camera move that is under way (or null).
  //   Arm = the line from the spot we look at to the camera.
  var glide = null;
  var GLIDE_SECONDS = 0.45;
  function stepGlide(dt) {
    glide.t = Math.min(1, glide.t + dt / GLIDE_SECONDS);
    var e = 1 - Math.pow(1 - glide.t, 3);   // start fast, stop gently
    controls.target.lerpVectors(glide.fromTarget, glide.toTarget, e);
    // Swing the arm around, and change its length evenly, so the camera
    // goes AROUND the skaters and not through them.
    var arm = glide.fromArm.clone().lerp(glide.toArm, e);
    arm.setLength(glide.fromArm.length() + (glide.toArm.length() - glide.fromArm.length()) * e);
    camera.position.copy(controls.target).add(arm);
    // The skaters slide to their new spots at the same time.
    glide.skaters.forEach(function (m) { m.group.position.lerpVectors(m.from, m.to, e); });
    if (glide.t >= 1) glide = null;
  }
  // Stop a glide early (the user grabbed the camera or a skater). The
  // skaters go straight to their spots; the camera stays where it is.
  function endGlide() {
    if (!glide) return;
    glide.skaters.forEach(function (m) { m.group.position.copy(m.to); });
    glide = null;
  }

  // Put the skaters on their starting spots for the current compare mode.
  //   side by side: blue on the left, orange on the right (as the camera sees them)
  //   overlay:      both on the same spot, and blue turns into a see-through outline
  function placeSkaters() {
    var overlay = hasKid && compareMode === "overlay";
    var half = hasKid && !overlay ? gap / 2 : 0;
    if (lastView === "front") {
      // From the front, standing one behind the other would hide one of
      // them, so they stand next to each other across the ice instead.
      refFigure.group.position.set(0, 0, half);
      kidFigure.group.position.set(0, 0, -half);
    } else {
      refFigure.group.position.set(-half, 0, 0);
      kidFigure.group.position.set(half, 0, 0);
    }
    refFigure.setGhost(overlay);
    refFigure.labelsOn = !overlay;   // two sets of signs on one spot would be a mess
    if (overlay) refFigure.hideAll();
  }
  var draggedSkater = false; // did the user slide a skater somewhere by hand?
  function place() { draggedSkater = false; placeSkaters(); frameView(); }
  function setView(name, smooth) {
    endGlide();
    var groups = [refFigure.group, kidFigure.group];
    var from = groups.map(function (g) { return g.position.clone(); });
    lastView = name;
    // Skaters you moved by hand stay where you put them.
    if (hasKid && compareMode === "side" && !draggedSkater) placeSkaters();
    frameView(smooth);
    if (glide) {
      // The skaters start from where they were and slide over too.
      groups.forEach(function (g, i) {
        glide.skaters.push({ group: g, from: from[i], to: g.position.clone() });
        g.position.copy(from[i]);
      });
    }
  }

  // Look closely at one check ("kneeBend", "forwardLean" or
  // "strideExtension"), or at the whole skaters again (null).
  function focus(id) {
    focusId = FOCUS[id] && hasKid ? id : null;
    setView("side", true);   // knee, lean and push are all seen best from the side
  }

  // Show one skater, or two.
  function layout(showKid) {
    var changed = showKid !== hasKid;
    hasKid = showKid;
    kidFigure.group.visible = showKid;
    if (toolsBar) toolsBar.hidden = !showKid;   // nothing to compare with one skater
    if (!showKid) focusId = null;
    syncCompareUi();
    if (changed) { lastView = "side"; place(); }
  }

  // Make the 3D picture fit its box, even when the window changes size.
  function resize() {
    var w = stage.clientWidth || 800, h = stage.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (refFigure.points && !userMovedCamera) frameView();
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
    // Nothing to draw while the other tab (Positioning) is showing.
    if (stage.offsetParent === null) { requestAnimationFrame(tick); return; }
    // Other files go first (coach.js picks the kid's pose and tells the
    // pro where in the stride to be), then we draw the pro to match.
    // Which way is "right" and "up" for the camera, and how big must the
    // signs be drawn so they can be read from this far away?
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    signSize = UI.signScale(camera.position.distanceTo(controls.target), camera.fov, stage.clientHeight || 500, signPixels(), 0.158);
    refFigure.signScale = kidFigure.signScale = signSize;
    onTick.forEach(function (fn) { fn(dt); });
    drawReference(dt);
    // The rebuilt orange skater strides on the very same clock as the
    // pro, so we draw it right after, at exactly the same moment.
    if (sync && sync.drawKid) sync.drawKid(cycleTime, dt);
    fadeSigns(dt);
    if (glide) stepGlide(dt);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- 7. Buttons on top of the 3D picture --------------------
  Array.prototype.forEach.call(document.querySelectorAll("[data-view]"), function (btn) {
    btn.addEventListener("click", function () {
      // Picking a view ends the close look at one joint (coach.js is told,
      // so the card in the report is no longer lit).
      if (focusId) { focusId = null; if (api.onFocus) api.onFocus(null); }
      setView(btn.getAttribute("data-view"), true);
    });
  });
  // The two boxes in the help box: show the angle signs? the elbows too?
  var anglesBox = document.getElementById("angles-on"), elbowsBox = document.getElementById("elbows-on");
  if (anglesBox) anglesBox.addEventListener("change", function () { showAngles = anglesBox.checked; });
  if (elbowsBox) elbowsBox.addEventListener("change", function () { showElbows = elbowsBox.checked; });
  var strideBtn = document.getElementById("stride-btn");
  strideBtn.addEventListener("click", function () {
    // While synced, the kid's stride drives the pro. (coach.js may give
    // the button a job of its own then: start or stop the stride loop.)
    if (sync) { if (sync.onButton) sync.onButton(); return; }
    strideOn = !strideOn;
    strideBtn.textContent = strideOn ? "Hold stance" : "Play stride";
    strideBtn.setAttribute("aria-pressed", String(strideOn));
  });

  // ---------- 8. Moving the skaters ----------------------------------
  var modeButtons = document.querySelectorAll("[data-compare]");
  var gapInput = document.getElementById("gap");
  var gapOut = document.getElementById("gap-out");
  if (gapInput) gapInput.value = String(gap);
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
  if (resetBtn) resetBtn.addEventListener("click", function () {
    // "Reset" also ends the close look at one joint.
    if (focusId) { focusId = null; if (api.onFocus) api.onFocus(null); }
    place();
  });
  syncCompareUi();

  // Dragging: press on a skater and slide it across the ice.
  // A "ray" is an invisible line from the camera through your pointer.
  var raycaster = new THREE.Raycaster();
  var icePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // the flat ice at height 0
  var pointer = new THREE.Vector2();
  var grabbed = null;                    // the skater we are dragging right now
  var grabOffset = new THREE.Vector3();  // where on the skater we grabbed it
  var hitPoint = new THREE.Vector3();
  var lastHover = 0;

  function aim(ev) {
    var box = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - box.left) / box.width) * 2 - 1;
    pointer.y = -((ev.clientY - box.top) / box.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }
  function bodyParts(fig) {
    return fig.bodyParts();
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
    endGlide();
    grabbed = fig;
    grabOffset.copy(fig.group.position).sub(hitPoint);
    controls.enabled = false;          // do not spin the camera while dragging
    stage.classList.add("dragging");
  }, true);
  window.addEventListener("pointermove", function (ev) {
    if (!grabbed) {
      // Show a "grab" hand when the pointer is over a skater.
      // (Checked at most 12 times a second: it is slow work.)
      if (ev.target === renderer.domElement && ev.timeStamp - lastHover > 80) {
        lastHover = ev.timeStamp;
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
    draggedSkater = true;
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
  var api = window.Coach3D = {
    camera: camera,       // (for checking the view from the browser console)
    controls: controls,
    renderer: renderer,   // (for taking pictures of the 3D view when we check our work)
    scene: scene,
    refFigure: refFigure,
    kidFigure: kidFigure,
    decorate: decorate,
    layout: layout,
    setView: setView,
    // Look closely at one check of the report (or null for the whole
    // skaters). onFocus is called when the close look ends by itself.
    focus: focus,
    onFocus: null,
    onTick: onTick,
    // Change what the blue skater shows. name is "PRO" or "GOAL".
    setReference: function (angles, name) {
      reference = angles;
      refFigure.name = name;
    },
    // Make the pro stride in step with the kid.
    //   s = { push, side, phase, stride }   or null to stop syncing
    //   or  { cycle, drawKid }: the kid's steady stride clock, and a
    //       function that draws the rebuilt kid at the clock's moment
    //   or  { loop, drawKid }: stride round and round; loop() says how
    //       many seconds one full stride takes
    //   label, onButton, pressed (optional): what the stride button says
    //       and does while synced
    setSync: function (s) {
      var was = !!sync;
      sync = s;
      if (was !== !!s) strideOn = false;
      // The button: "Play stride" when the pro is alone. While synced it
      // says so, or does the job coach.js gives it (s.label, s.onButton).
      var words = s ? (s.label || "Pro in step") : "Play stride";
      var off = !!s && !s.onButton, pressed = String(!!(s && s.pressed));
      if (strideBtn.textContent !== words) strideBtn.textContent = words;
      if (strideBtn.disabled !== off) strideBtn.disabled = off;
      if (strideBtn.getAttribute("aria-pressed") !== pressed) strideBtn.setAttribute("aria-pressed", pressed);
    }
  };
})();
