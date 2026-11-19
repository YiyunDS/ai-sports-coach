// =====================================================================
//  figure.js  --  DRAWS ONE 3D HOCKEY SKATER
//
//  The skater is made only from simple shapes:
//     balls      = joints (knees, hips, shoulders...) and the head
//     tubes      = bones  (thigh, shin, arms, body)
//     boxes      = skates and the stick blade
//
//  We build all the shapes ONE time. After that, every time the pose
//  changes we just MOVE the shapes to the new joint positions.
//
//  THREE is the three.js library. It does the hard 3D drawing for us.
// =====================================================================
(function (root) {
  "use strict";
  var THREE = root.THREE;
  if (!THREE) return; // the 3D library did not load; scene.js shows a message

  // Traffic-light colors for joints.
  var GRADE_COLORS = {
    good: 0x22c55e,   // green  = inside the target range
    close: 0xfacc15,  // yellow = a little bit off
    far: 0xef4444,    // red    = far from the target
    none: 0xc3ccd6    // soft gray = we are not grading this joint now
  };
  // Graded joints get bigger so they are easy to spot.
  var GRADE_SIZE = { good: 1.1, close: 1.25, far: 1.45, none: 0.92 };

  // The joints we draw as balls: name -> ball size in meters.
  var JOINT_BALLS = {
    neck: 0.07, lShoulder: 0.075, rShoulder: 0.075, lElbow: 0.055, rElbow: 0.055,
    lHip: 0.09, rHip: 0.09, lKnee: 0.08, rKnee: 0.08, lAnkle: 0.065, rAnkle: 0.065
  };

  // The bones we draw as tubes: [from joint, to joint, thickness, paint].
  var BONES = [
    ["hipMid", "neck", 0.125, "jersey"],
    ["lShoulder", "rShoulder", 0.065, "jersey"],
    ["lHip", "rHip", 0.085, "pants"],
    ["lShoulder", "lElbow", 0.05, "jersey"], ["lElbow", "lWrist", 0.045, "jersey"],
    ["rShoulder", "rElbow", 0.05, "jersey"], ["rElbow", "rWrist", 0.045, "jersey"],
    ["lHip", "lKnee", 0.072, "pants"], ["rHip", "rKnee", 0.072, "pants"],
    ["lKnee", "lAnkle", 0.055, "socks"], ["rKnee", "rAnkle", 0.055, "socks"]
  ];

  var Y_AXIS = new THREE.Vector3(0, 1, 0);
  var Z_AXIS = new THREE.Vector3(0, 0, 1);

  // Turn one of our {x, y, z} points into a three.js point.
  function v3(p) { return new THREE.Vector3(p.x, p.y, p.z); }

  // Stretch and turn a tube (or box) so it reaches from point a to point b.
  // "axis" is the direction the shape points before we turn it.
  function placeBetween(mesh, a, b, axis) {
    var dir = new THREE.Vector3().subVectors(b, a);
    var length = Math.max(dir.length(), 1e-4);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(axis, dir.normalize());
    return length;
  }

  // When the nice web font finishes loading, repaint every sign once.
  var fontEpoch = 0;
  if (root.document && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fontEpoch++; });
  }

  // ---- Paint a little sign (text on a rounded box) onto a picture ----
  function drawLabel(canvas, text, color) {
    var c = canvas.getContext("2d"), w = canvas.width, h = canvas.height, r = 14;
    c.clearRect(0, 0, w, h);
    c.beginPath();
    c.moveTo(r + 6, 6); c.lineTo(w - r - 6, 6); c.quadraticCurveTo(w - 6, 6, w - 6, r + 6);
    c.lineTo(w - 6, h - r - 6); c.quadraticCurveTo(w - 6, h - 6, w - r - 6, h - 6);
    c.lineTo(r + 6, h - 6); c.quadraticCurveTo(6, h - 6, 6, h - r - 6);
    c.lineTo(6, r + 6); c.quadraticCurveTo(6, 6, r + 6, 6);
    c.closePath();
    c.fillStyle = "rgba(10,14,20,0.9)"; c.fill();      // dark plate
    c.lineWidth = 5; c.strokeStyle = color; c.stroke();  // thin colored edge
    c.fillStyle = "#f2f6fa";
    c.font = "600 50px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text.toUpperCase(), w / 2, h / 2 + 3);
  }

  // =================== The Figure ====================================
  // opts.jersey  = jersey color        opts.helmet = helmet color
  // opts.name    = the sign above the head ("PRO" or "YOU")
  function Figure(opts) {
    var self = this;
    this.group = new THREE.Group(); // everything for this skater lives in here
    this.labels = {};
    this.wedges = {};
    this.name = opts.name;
    this.labelsOn = true;  // set to false to hide this skater's signs and slices
    this.nameColor = opts.nameColor || "#1d4ed8";

    function paint(color, rough) {
      return new THREE.MeshStandardMaterial({ color: color, roughness: rough === undefined ? 0.65 : rough });
    }
    var paints = {
      jersey: paint(opts.jersey), pants: paint(opts.pants || 0x1e293b),
      socks: paint(opts.socks || opts.jersey), skin: paint(0xf2c9a0),
      helmet: paint(opts.helmet || opts.jersey, 0.35), glove: paint(0x334155),
      boot: paint(0x111827), holder: paint(0xe5e7eb, 0.5), blade: paint(0xd8dee6, 0.15), stick: paint(0x2b3038, 0.5),
      dark: paint(0x111827)
    };
    function addMesh(geometry, material) {
      var m = new THREE.Mesh(geometry, material);
      m.castShadow = true;
      m.userData.body = true; // part of the skater's body (used for dragging and ghosting)
      self.group.add(m);
      return m;
    }
    var ball = new THREE.SphereGeometry(1, 24, 16);          // a ball, size 1
    var tube = new THREE.CylinderGeometry(1, 1, 1, 16);      // a tube, size 1
    var box = new THREE.BoxGeometry(1, 1, 1);                // a box, size 1

    // Bones (tubes).
    this.bones = BONES.map(function (b) {
      return { from: b[0], to: b[1], radius: b[2], mesh: addMesh(tube, paints[b[3]]) };
    });

    // Joints (balls). Each ball has its OWN paint so it can change color.
    this.joints = {};
    Object.keys(JOINT_BALLS).forEach(function (name) {
      var mat = new THREE.MeshStandardMaterial({ color: GRADE_COLORS.none, roughness: 0.4 });
      self.joints[name] = { size: JOINT_BALLS[name], mesh: addMesh(ball, mat) };
    });

    // Head and helmet.
    this.head = addMesh(ball, paints.skin);
    this.head.scale.setScalar(0.105);
    this.helmet = addMesh(new THREE.SphereGeometry(0.118, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), paints.helmet);

    // Gloves.
    this.gloves = { l: addMesh(ball, paints.glove), r: addMesh(ball, paints.glove) };
    this.gloves.l.scale.setScalar(0.06); this.gloves.r.scale.setScalar(0.06);

    // Skates: a boot, a white plastic holder, and a thin steel blade.
    this.skates = {};
    ["l", "r"].forEach(function (s) {
      self.skates[s] = { boot: addMesh(box, paints.boot), holder: addMesh(box, paints.holder), blade: addMesh(box, paints.blade) };
    });

    // Hockey stick (hidden unless the pose has one).
    this.stick = { shaft: addMesh(tube, paints.stick), blade: addMesh(box, paints.dark) };
  }

  // Move every shape to match a new pose.
  // grades (optional) = { lKnee: "good", neck: "far", ... }
  Figure.prototype.update = function (pose, grades) {
    var self = this, P = {};
    Object.keys(pose).forEach(function (k) { P[k] = v3(pose[k]); });
    P.hipMid = new THREE.Vector3().addVectors(P.lHip, P.rHip).multiplyScalar(0.5);
    this.points = P;

    // Bones.
    this.bones.forEach(function (b) {
      var length = placeBetween(b.mesh, P[b.from], P[b.to], Y_AXIS);
      b.mesh.scale.set(b.radius, length, b.radius);
    });

    // Joints, with traffic-light colors.
    Object.keys(this.joints).forEach(function (name) {
      var j = self.joints[name], grade = (grades && grades[name]) || "none";
      j.mesh.position.copy(P[name]);
      j.mesh.scale.setScalar(j.size * GRADE_SIZE[grade]);
      j.mesh.material.color.setHex(GRADE_COLORS[grade]);
      // "emissive" makes the ball glow a little so the color pops.
      j.mesh.material.emissive.setHex(grade === "none" ? 0x000000 : GRADE_COLORS[grade]);
      j.mesh.material.emissiveIntensity = grade === "none" ? 0 : 0.45;
    });

    // Head. "forward" is found from the shoulders: left x up = forward.
    var left = new THREE.Vector3().subVectors(P.lShoulder, P.rShoulder).normalize();
    var forward = new THREE.Vector3().crossVectors(left, Y_AXIS).normalize();
    this.head.position.copy(P.head);
    this.helmet.position.copy(P.head).addScaledVector(forward, -0.012);
    this.helmet.position.y += 0.012;

    // Gloves and skates.
    ["l", "r"].forEach(function (s) {
      self.gloves[s].position.copy(P[s + "Wrist"]);
      var heel = P[s + "Heel"], toe = P[s + "Toe"], sk = self.skates[s];
      var length = placeBetween(sk.boot, heel, toe, Z_AXIS);
      sk.boot.scale.set(0.078, 0.072, length + 0.03);
      sk.boot.position.y += 0.035;
      // The holder is the white plastic part between the boot and the steel.
      sk.holder.position.copy(sk.boot.position);
      sk.holder.quaternion.copy(sk.boot.quaternion);
      sk.holder.scale.set(0.016, 0.02, length + 0.02);
      sk.holder.position.y -= 0.046;
      // Real skate steel is only about 3 mm wide, so the blade is very thin.
      sk.blade.position.copy(sk.boot.position);
      sk.blade.quaternion.copy(sk.boot.quaternion);
      sk.blade.scale.set(0.004, 0.013, length + 0.06);
      sk.blade.position.y -= 0.0615;
    });

    // Stick (only if this pose has one).
    var hasStick = !!(P.stickTop && P.stickBlade);
    this.stick.shaft.visible = this.stick.blade.visible = hasStick;
    if (hasStick) {
      // Let the stick poke out a little above the top hand.
      var dir = new THREE.Vector3().subVectors(P.stickBlade, P.stickTop).normalize();
      var top = P.stickTop.clone().addScaledVector(dir, -0.12);
      var len = placeBetween(this.stick.shaft, top, P.stickBlade, Y_AXIS);
      this.stick.shaft.scale.set(0.011, len, 0.011);
      this.stick.blade.position.set(P.stickBlade.x + 0.1, 0.035, P.stickBlade.z);
      this.stick.blade.scale.set(0.24, 0.06, 0.006);
    }

    // The name sign floats above the head.
    if (this.name) {
      this.setLabel("name", { x: P.head.x, y: P.head.y + 0.32, z: P.head.z }, this.name, this.nameColor);
    }
  };

  // Put a floating sign at a spot. id is any name, like "knee".
  // A "sprite" is a flat picture that always turns to face the camera,
  // so you can read it from any side.
  Figure.prototype.setLabel = function (id, at, text, color) {
    if (!this.labelsOn) { this.hide(id); return; }
    var L = this.labels[id];
    if (!L) {
      var canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 110;
      var texture = new THREE.CanvasTexture(canvas);
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
      sprite.scale.set(0.46, 0.158, 1);
      sprite.renderOrder = 10; // draw on top of everything
      this.group.add(sprite);
      L = this.labels[id] = { canvas: canvas, texture: texture, sprite: sprite, key: "" };
    }
    // Only repaint the sign when the words or color really changed.
    var key = text + "|" + color + "|" + fontEpoch;
    if (key !== L.key) { drawLabel(L.canvas, text, color); L.texture.needsUpdate = true; L.key = key; }
    L.sprite.position.set(at.x, at.y, at.z);
    L.sprite.visible = true;
  };

  // Draw a see-through "pizza slice" that shows an angle.
  // center = the joint. dirA and dirB = the two directions that make
  // the angle. radius = how big the slice is.
  Figure.prototype.setWedge = function (id, center, dirA, dirB, radius, color) {
    if (!this.labelsOn) { this.hide(id); return; }
    var N = 20, W = this.wedges[id];
    if (!W) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((N + 2) * 3), 3));
      var index = [];
      for (var i = 1; i <= N; i++) index.push(0, i, i + 1);
      geo.setIndex(index);
      var mat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false
      });
      W = this.wedges[id] = new THREE.Mesh(geo, mat);
      W.frustumCulled = false;
      this.group.add(W);
    }
    var a = v3(dirA).normalize(), b = v3(dirB).normalize();
    var theta = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    var pos = W.geometry.attributes.position;
    pos.setXYZ(0, center.x, center.y, center.z);
    for (var k = 0; k <= N; k++) {
      // Sweep smoothly from direction a to direction b.
      var t = k / N, s = Math.sin(theta) || 1;
      var wa = theta < 1e-4 ? 1 - t : Math.sin((1 - t) * theta) / s;
      var wb = theta < 1e-4 ? t : Math.sin(t * theta) / s;
      pos.setXYZ(k + 1,
        center.x + (a.x * wa + b.x * wb) * radius,
        center.y + (a.y * wa + b.y * wb) * radius,
        center.z + (a.z * wa + b.z * wb) * radius);
    }
    pos.needsUpdate = true;
    W.material.color.set(color);
    W.visible = true;
  };

  // Hide a sign or a slice we do not need right now.
  Figure.prototype.hide = function (id) {
    if (this.labels[id]) this.labels[id].sprite.visible = false;
    if (this.wedges[id]) this.wedges[id].visible = false;
  };

  // Turn the skater into a see-through "ghost" (used for Overlay mode),
  // or back to solid.
  Figure.prototype.setGhost = function (on) {
    this.group.children.forEach(function (m) {
      if (!m.userData.body) return;
      m.material.transparent = on;
      m.material.opacity = on ? 0.3 : 1;
      m.material.depthWrite = !on;
      m.material.needsUpdate = true;
      m.castShadow = !on;
    });
  };

  // Hide every sign and slice at once.
  Figure.prototype.hideAll = function () {
    var self = this;
    Object.keys(this.labels).forEach(function (id) { self.hide(id); });
    Object.keys(this.wedges).forEach(function (id) { self.hide(id); });
  };

  root.SkaterFigure = Figure;
  root.GRADE_COLORS = GRADE_COLORS;
})(window);
