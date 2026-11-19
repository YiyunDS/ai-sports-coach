// =====================================================================
//  figure.js  --  DRAWS ONE 3D HOCKEY SKATER
//
//  The skater is built in code from shaped pieces, like a model kit:
//     jersey and pants  = "loft" shapes: a stack of rounded rings, one
//                         above the other, with a skin stretched over
//                         them (like a lampshade)
//     arms and legs     = tubes that are thicker at one end
//     helmet, cage      = part of a ball, with thin wires in front
//     gloves and skates = shapes cut out of a flat outline and made thick
//     stick             = a long thin box with a blade at the end
//
//  Every frame we get a pose (a list of joint positions). Then we move
//  and turn every piece so it sits between the right joints. The pieces
//  never change shape, only where they sit (except the jersey and pants,
//  which stretch and twist with the body).
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
  // Graded joints get a colored ring. Worse = bigger, so it is easy to spot.
  var GRADE_SIZE = { good: 1, close: 1.15, far: 1.35 };
  var RING_JOINTS = ["lKnee", "rKnee", "lHip", "rHip", "neck"];

  var Y_AXIS = new THREE.Vector3(0, 1, 0);
  var Z_AXIS = new THREE.Vector3(0, 0, 1);
  var SKATE_LENGTH = 0.24; // the skate shapes are drawn for a foot this long (meters)

  // Turn one of our {x, y, z} points into a three.js point.
  function v3(p) { return new THREE.Vector3(p.x, p.y, p.z); }

  // Stretch and turn a shape so it reaches from point a to point b.
  // "axis" is the direction the shape points before we turn it.
  function placeBetween(mesh, a, b, axis) {
    var dir = new THREE.Vector3().subVectors(b, a);
    var length = Math.max(dir.length(), 1e-4);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(axis, dir.normalize());
    return length;
  }

  // Three arrows at right angles to each other, like the corner of a box:
  //   fwd  = the way the part faces, up = its top, side = its right side.
  // We give a rough "up" and "side", and this straightens them out.
  function frame(up, side) {
    var u = up.clone().normalize();
    var s = side.clone().addScaledVector(u, -side.dot(u));
    if (s.lengthSq() < 1e-8) s = new THREE.Vector3(0, 0, 1);
    s.normalize();
    var f = new THREE.Vector3().crossVectors(u, s); // up x side = forward
    return { fwd: f, up: u, side: s };
  }
  // Turn a part so its own x points "fwd", its y points "up" and its z
  // points "side".
  function turnTo(object, f) {
    var m = new THREE.Matrix4().makeBasis(f.fwd, f.up, f.side);
    object.quaternion.setFromRotationMatrix(m);
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

  // ---- The ring we put around a graded joint (painted once, white;
  //      each ring gets its own color) ----
  var ringTexture = null;
  function getRingTexture() {
    if (ringTexture) return ringTexture;
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 16;   // soft glow
    g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "#ffffff"; g.lineWidth = 7;                    // sharp ring
    g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
    ringTexture = new THREE.CanvasTexture(c);
    ringTexture.colorSpace = THREE.SRGBColorSpace;
    return ringTexture;
  }

  // ---- The jersey picture: team color, two stripes near the bottom,
  //      and a number on the back ----
  function jerseyTexture(base, trim, number) {
    var c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    var g = c.getContext("2d");
    g.fillStyle = base; g.fillRect(0, 0, 512, 256);
    // Stripes near the hem (the bottom of the picture is the bottom of the jersey).
    g.fillStyle = trim; g.fillRect(0, 206, 512, 14);
    g.fillStyle = "rgba(255,255,255,0.85)"; g.fillRect(0, 222, 512, 6);
    g.fillStyle = trim; g.fillRect(0, 230, 512, 10);
    if (number) {
      // The back of the jersey is at the left AND right edge of the
      // picture (the picture wraps around the body), so we paint the
      // number twice, half on each edge.
      g.font = "700 96px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 8; g.strokeStyle = trim; g.fillStyle = "#f4f6f8";
      [0, 512].forEach(function (x) { g.strokeText(number, x, 112); g.fillText(number, x, 112); });
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; // the picture's colors are normal screen colors
    t.anisotropy = 4;
    return t;
  }

  // ======== A "loft": a stack of rounded rings with a skin over them ========
  // Each ring has a middle point, a forward arrow and a side arrow, a half
  // width (a), a half depth (b) and a "boxiness" (p: 2 = an oval, bigger
  // = more like a rounded box, good for shoulder pads).
  function Loft(ringCount, around, material) {
    this.R = ringCount; this.S = around;
    var count = ringCount * (around + 1);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    var uv = new Float32Array(count * 2), index = [];
    for (var i = 0; i < ringCount; i++) {
      for (var j = 0; j <= around; j++) {
        uv[(i * (around + 1) + j) * 2] = j / around;
        uv[(i * (around + 1) + j) * 2 + 1] = i / (ringCount - 1);
        if (i < ringCount - 1 && j < around) {
          var a = i * (around + 1) + j, b = a + 1, c = a + around + 1, d = c + 1;
          index.push(a, b, c, b, d, c);
        }
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false; // it moves every frame; always draw it
  }
  // A number to a power, keeping its sign. Makes ovals boxier.
  function spow(v, e) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), e); }
  Loft.prototype.update = function (rings) {
    var pos = this.mesh.geometry.attributes.position, S = this.S;
    rings.forEach(function (r, i) {
      var e = 2 / r.p;
      for (var j = 0; j <= S; j++) {
        // Start at the middle of the BACK and go around toward the right side.
        var t = (j / S) * Math.PI * 2;
        var back = spow(Math.cos(t), e) * r.b, right = spow(Math.sin(t), e) * r.a;
        pos.setXYZ(i * (S + 1) + j,
          r.c.x - r.fwd.x * back + r.side.x * right,
          r.c.y - r.fwd.y * back + r.side.y * right,
          r.c.z - r.fwd.z * back + r.side.z * right);
      }
    });
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  };

  // ======== Flat outlines for the skate, made thick ========
  function extrude(points, depth, bevel) {
    var s = new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) {
      var q = points[i];
      if (q.length === 4) s.quadraticCurveTo(q[0], q[1], q[2], q[3]);
      else s.lineTo(q[0], q[1]);
    }
    var geo = new THREE.ExtrudeGeometry(s, {
      depth: depth, steps: 1, curveSegments: 8,
      bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2
    });
    geo.translate(0, 0, -depth / 2); // center it, so the middle of the skate is at z = 0
    return geo;
  }
  // Side view of a skate, heel at x = 0, toe at x = 0.24, bottom of the
  // boot at y = 0. [x, y] = a straight line to there,
  // [x1, y1, x2, y2] = a curve bending toward (x1, y1) and ending at (x2, y2).
  var BOOT = [[-0.012, 0], [0.24, 0], [0.258, 0.004, 0.255, 0.026], [0.248, 0.048, 0.2, 0.056],
    [0.125, 0.082], [0.088, 0.128], [0.08, 0.152, 0.097, 0.163], [0.03, 0.158],
    [-0.028, 0.156, -0.034, 0.12], [-0.024, 0.07, -0.038, 0.03], [-0.036, 0.0, -0.012, 0]];
  var HOLDER = [[0.0, 0.002], [0.232, 0.002], [0.214, -0.019], [0.13, -0.016], [0.1, -0.016], [0.02, -0.019]];
  var STEEL = [[-0.018, -0.017], [0.25, -0.017], [0.262, -0.02, 0.236, -0.03], [0.02, -0.03], [-0.025, -0.029, -0.018, -0.017]];

  // =================== The Figure ====================================
  // opts.jersey = jersey color      opts.trim   = stripe color
  // opts.helmet = helmet color      opts.pants  = pants color
  // opts.socks  = sock color        opts.number = number on the back
  // opts.name   = the sign above the head ("PRO" or "YOU")
  function Figure(opts) {
    var self = this;
    this.group = new THREE.Group(); // everything for this skater lives in here
    this.labels = {};
    this.wedges = {};
    this.name = opts.name;
    this.labelsOn = true;  // set to false to hide this skater's signs and slices
    this.nameColor = opts.nameColor || "#1d4ed8";
    this.parts = [];       // every piece, so we can move them each frame

    function paint(color, rough, metal) {
      return new THREE.MeshStandardMaterial({ color: color, roughness: rough === undefined ? 0.7 : rough, metalness: metal || 0 });
    }
    function hex(n) { return "#" + ("000000" + n.toString(16)).slice(-6); }
    var trim = opts.trim === undefined ? 0x0f172a : opts.trim;
    var jerseyPaint = new THREE.MeshStandardMaterial({ map: jerseyTexture(hex(opts.jersey), hex(trim), opts.number), roughness: 0.8 });
    var P = this.paints = {
      jersey: jerseyPaint,
      sleeve: paint(opts.jersey, 0.8),
      trim: paint(trim, 0.7),
      pants: paint(opts.pants || 0x1c2230, 0.55),
      socks: paint(opts.socks || opts.jersey, 0.85),
      skin: paint(0xc99a7a, 0.6),
      helmet: paint(opts.helmet || 0x1c2230, 0.3),
      glove: paint(opts.glove || 0x1c2230, 0.55),
      boot: paint(0x15181d, 0.45),
      holder: paint(0xe8ebef, 0.4),
      steel: paint(0xd5dbe2, 0.25, 0.85),
      stick: paint(0x2a2f37, 0.45),
      tape: paint(0x0d0f12, 0.9),
      neck: paint(0x12151a, 0.8)
    };
    var cagePaint = new THREE.LineBasicMaterial({ color: 0xc4cad2 });

    // Add one piece to the skater.
    function add(object) {
      object.traverse(function (m) {
        if (m.isMesh || m.isLine) { m.castShadow = !m.isLine; m.userData.body = true; } // used for dragging and see-through
      });
      self.group.add(object);
      return object;
    }
    // A tube from joint a to joint b, "rA" thick at a and "rB" thick at b.
    //   from, to = which part of the bone it covers (0 = at a, 1 = at b)
    //   grow     = how far it pokes out past each end (meters)
    function tube(a, b, rA, rB, paint, from, to, grow) {
      // three.js tubes are thickest at the top; the top will point at b.
      var mesh = add(new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, 1, 20, 1), paint));
      self.parts.push({ kind: "tube", mesh: mesh, a: a, b: b, from: from || 0, to: to === undefined ? 1 : to, grow: grow || [0, 0] });
      return mesh;
    }
    // A ball sitting on a joint (to round off elbows, knees and shoulders).
    function ball(at, r, paint, lift) {
      var mesh = add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), paint));
      self.parts.push({ kind: "ball", mesh: mesh, at: at, lift: lift || 0 });
      return mesh;
    }

    // --- Body: pants under the jersey ---
    this.pants = new Loft(4, 28, P.pants);
    add(this.pants.mesh);
    this.jersey = new Loft(7, 32, jerseyPaint);
    add(this.jersey.mesh);
    this.pants.mesh.material.side = THREE.DoubleSide;   // so you never see "through" the open bottom
    jerseyPaint.side = THREE.DoubleSide;

    ["l", "r"].forEach(function (s) {
      // Legs: baggy hockey pants over the top of the thigh, then socks
      // over the shin pads.
      tube(s + "Hip", s + "Knee", 0.088, 0.082, P.pants, 0, 0.62);
      tube(s + "Hip", s + "Knee", 0.064, 0.056, P.socks, 0.45, 1);
      ball(s + "Knee", 0.061, P.socks);
      tube(s + "Knee", s + "Ankle", 0.058, 0.045, P.socks);
      // Arms: shoulder pad, sleeve, elbow pad, glove.
      ball(s + "Shoulder", 0.068, P.sleeve, 0.01);
      tube(s + "Shoulder", s + "Elbow", 0.063, 0.053, P.sleeve, 0, 1, [0.02, 0]);
      ball(s + "Elbow", 0.054, P.sleeve);
      tube(s + "Elbow", s + "Wrist", 0.05, 0.046, P.sleeve, 0, 0.55);
      tube(s + "Elbow", s + "Wrist", 0.05, 0.06, P.glove, 0.4, 1);   // glove cuff
      tube(s + "Elbow", s + "Wrist", 0.051, 0.051, P.trim, 0.36, 0.42); // cuff stripe
    });
    // Neck guard.
    tube("neck", "head", 0.047, 0.042, P.neck, 0, 0.55, [0.03, 0]);

    // --- Hands (the fist inside the glove) ---
    this.hands = {};
    ["l", "r"].forEach(function (s) {
      var hand = add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), P.glove));
      hand.scale.set(0.05, 0.047, 0.078); // long along the forearm (its z)
      self.hands[s] = hand;
    });

    // --- Head: face, helmet, ear guards and cage ---
    this.headGroup = new THREE.Group();
    var face = new THREE.Mesh(new THREE.SphereGeometry(0.078, 24, 16), P.skin);
    face.position.set(0.004, -0.012, 0);
    var shell = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), P.helmet);
    shell.scale.set(1.13, 1, 0.97); shell.position.y = 0.012;
    // The lower part of the helmet that covers the back of the head and the ears.
    var guard = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 8, -Math.PI * 0.62, Math.PI * 1.24, Math.PI * 0.5, Math.PI * 0.2), P.helmet);
    guard.scale.set(1.13, 1, 0.97); guard.position.y = 0.012;
    guard.material = P.helmet;
    // The cage: thin wires in front of the face.
    var wires = [], R = 0.112, k, a;
    for (k = -4; k <= 4; k++) {                 // up-and-down wires
      a = k * 0.2;
      wires.push(R * Math.cos(a), -0.105, R * Math.sin(a), R * Math.cos(a), 0.02, R * Math.sin(a));
    }
    [-0.1, -0.06, -0.02, 0.02].forEach(function (y) { // side-to-side wires
      for (k = -4; k < 4; k++) {
        var a1 = k * 0.2, a2 = (k + 1) * 0.2;
        wires.push(R * Math.cos(a1), y, R * Math.sin(a1), R * Math.cos(a2), y, R * Math.sin(a2));
      }
    });
    var cageGeo = new THREE.BufferGeometry();
    cageGeo.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    var cage = new THREE.LineSegments(cageGeo, cagePaint);
    [face, shell, guard, cage].forEach(function (m) { self.headGroup.add(m); });
    add(this.headGroup);

    // --- Skates: boot, white holder, thin steel blade ---
    var bootGeo = extrude(BOOT, 0.06, 0.007);
    var holderGeo = extrude(HOLDER, 0.014, 0.002);
    var steelGeo = extrude(STEEL, 0.004, 0);
    this.skates = {};
    ["l", "r"].forEach(function (s) {
      var g = new THREE.Group();
      g.add(new THREE.Mesh(bootGeo, P.boot));
      g.add(new THREE.Mesh(holderGeo, P.holder));
      g.add(new THREE.Mesh(steelGeo, P.steel));
      self.skates[s] = add(g);
    });

    // --- Stick (hidden unless the pose has one) ---
    this.stick = new THREE.Group();
    this.shaft = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1, 0.03), P.stick);
    this.grip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1, 0.033), P.tape);
    this.bladeGroup = new THREE.Group();
    var blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.008), P.stick);
    blade.position.set(0.12, 0.0075, 0);
    var tape = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.011), P.tape);
    tape.position.set(0.14, 0.0075, 0);
    this.bladeGroup.add(blade); this.bladeGroup.add(tape);
    add(this.shaft); add(this.grip); add(this.bladeGroup);

    // --- Colored rings for graded joints ---
    this.rings = {};
    RING_JOINTS.forEach(function (name) {
      // toneMapped: false = keep the exact traffic-light color (no camera "exposure").
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: getRingTexture(), depthTest: false, transparent: true, toneMapped: false }));
      sprite.renderOrder = 9; // drawn on top, so you can always see it
      sprite.visible = false;
      self.group.add(sprite);
      self.rings[name] = sprite;
    });
  }

  // Move every piece to match a new pose.
  // grades (optional) = { lKnee: "good", neck: "far", ... }
  // extras (optional) = { edges: { l: degrees, r: degrees } } how far each
  //                     skate is tipped onto its inside edge
  Figure.prototype.update = function (pose, grades, extras) {
    var edges = extras && extras.edges;
    var self = this, P = {};
    Object.keys(pose).forEach(function (k) { P[k] = v3(pose[k]); });
    P.hipMid = new THREE.Vector3().addVectors(P.lHip, P.rHip).multiplyScalar(0.5);
    this.points = P;

    // ---- Jersey and pants: rings stacked along the back ----
    var trunk = new THREE.Vector3().subVectors(P.neck, P.hipMid);
    var trunkLen = trunk.length();
    var up = trunk.clone().normalize();
    var hipAxis = new THREE.Vector3().subVectors(P.rHip, P.lHip);
    var shoulderAxis = new THREE.Vector3().subVectors(P.rShoulder, P.lShoulder);
    var hipHalf = hipAxis.length() / 2, shHalf = shoulderAxis.length() / 2;
    hipAxis.normalize(); shoulderAxis.normalize();
    // One ring: t = how far up the back (0 = hips, 1 = neck), turn = how much
    // it turns with the shoulders instead of the hips (0 to 1).
    function ring(t, turn, a, b, p, ahead) {
      var f = frame(up, hipAxis.clone().lerp(shoulderAxis, turn));
      var c = P.hipMid.clone().addScaledVector(up, t * trunkLen).addScaledVector(f.fwd, ahead || 0);
      return { c: c, fwd: f.fwd, side: f.side, a: a, b: b, p: p };
    }
    this.pants.update([
      ring(-0.26, 0, hipHalf + 0.075, 0.095, 3, -0.005),
      ring(-0.14, 0, hipHalf + 0.095, 0.108, 3, -0.01),
      ring(-0.02, 0, hipHalf + 0.095, 0.11, 3, -0.005),
      ring(0.12, 0, hipHalf + 0.075, 0.1, 2.6, 0)
    ]);
    this.jersey.update([
      ring(-0.03, 0, hipHalf + 0.095, 0.122, 2.4, 0),
      ring(0.25, 0.25, hipHalf + 0.08, 0.108, 2.4, 0.004),
      ring(0.55, 0.6, shHalf * 0.94, 0.118, 2.6, 0.01),
      ring(0.82, 0.9, shHalf + 0.04, 0.118, 3.2, 0),
      ring(0.97, 1, shHalf + 0.01, 0.098, 3.2, -0.006),
      ring(1.04, 1, shHalf * 0.55, 0.075, 2.2, -0.006),
      ring(1.08, 1, 0.05, 0.045, 2, -0.004)
    ]);

    // ---- Arms, legs, neck: tubes and balls ----
    this.parts.forEach(function (part) {
      if (part.kind === "ball") {
        part.mesh.position.copy(P[part.at]).addScaledVector(up, part.lift);
        return;
      }
      var a = P[part.a], b = P[part.b];
      var dir = new THREE.Vector3().subVectors(b, a).normalize();
      var start = a.clone().lerp(b, part.from).addScaledVector(dir, -part.grow[0]);
      var end = a.clone().lerp(b, part.to).addScaledVector(dir, part.grow[1]);
      var length = placeBetween(part.mesh, start, end, Y_AXIS);
      part.mesh.scale.set(1, length, 1);
    });

    // ---- Hands: a fist at the end of each forearm ----
    ["l", "r"].forEach(function (s) {
      var dir = new THREE.Vector3().subVectors(P[s + "Wrist"], P[s + "Elbow"]).normalize();
      var hand = self.hands[s];
      hand.position.copy(P[s + "Wrist"]).addScaledVector(dir, 0.035);
      hand.quaternion.setFromUnitVectors(Z_AXIS, dir);
    });

    // ---- Head: it faces the same way as the chest ----
    var headUp = new THREE.Vector3().subVectors(P.head, P.neck);
    // The helmet sits a little lower than the ears' middle point, so the
    // neck does not look too long.
    this.headGroup.position.copy(P.head).addScaledVector(headUp.clone().normalize(), -0.025);
    turnTo(this.headGroup, frame(headUp, shoulderAxis));

    // ---- Skates: from heel to toe, standing up straight ----
    ["l", "r"].forEach(function (s) {
      var heel = P[s + "Heel"], toe = P[s + "Toe"], sk = self.skates[s];
      var along = new THREE.Vector3().subVectors(toe, heel);
      var length = Math.max(along.length(), 0.05);
      along.normalize();
      // The skate's right side is "along x up"; its own up is "side x along".
      var side = new THREE.Vector3().crossVectors(along, Y_AXIS).normalize();
      var upright = new THREE.Vector3().crossVectors(side, along).normalize();
      if (edges && edges[s]) {
        // Tip the skate onto its inside edge (toward the other skate),
        // turning it around the ankle.
        var e = edges[s] / 180 * Math.PI;
        var inside = side.clone().multiplyScalar(s === "r" ? -1 : 1);
        upright = upright.multiplyScalar(Math.cos(e)).addScaledVector(inside, Math.sin(e)).normalize();
        side = new THREE.Vector3().crossVectors(along, upright).normalize();
        // The ankle sits 7 cm in front of the heel and 6 cm above the sole.
        sk.position.copy(P[s + "Ankle"]).addScaledVector(along, -0.07 * length / SKATE_LENGTH).addScaledVector(upright, -0.06);
      } else {
        sk.position.copy(heel);
      }
      sk.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, upright, side));
      sk.scale.set(length / SKATE_LENGTH, 1, 1);
    });

    // ---- Stick (only if this pose has one) ----
    var hasStick = !!(P.stickTop && P.stickBlade);
    this.shaft.visible = this.grip.visible = this.bladeGroup.visible = hasStick;
    if (hasStick) {
      var down = new THREE.Vector3().subVectors(P.stickBlade, P.stickTop).normalize();
      var top = P.stickTop.clone().addScaledVector(down, -0.14); // a bit pokes out above the top hand
      var len = placeBetween(this.shaft, top, P.stickBlade, Y_AXIS);
      this.shaft.scale.set(1, len, 1);
      var gripEnd = top.clone().addScaledVector(down, 0.2);
      placeBetween(this.grip, top.clone().addScaledVector(down, -0.005), gripEnd, Y_AXIS);
      this.grip.scale.set(1, 0.205, 1);
      // The blade lies on the ice and points away from the skater, in
      // line with the shaft (seen from above).
      var out = new THREE.Vector3(down.x, 0, down.z);
      if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
      out.normalize();
      this.bladeGroup.position.copy(P.stickBlade);
      this.bladeGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        out, Y_AXIS, new THREE.Vector3().crossVectors(out, Y_AXIS)));
    }

    // ---- Rings on the graded joints ----
    RING_JOINTS.forEach(function (name) {
      var sprite = self.rings[name], grade = grades && grades[name];
      sprite.visible = !!(grade && GRADE_SIZE[grade]);
      if (!sprite.visible) return;
      sprite.position.copy(P[name]);
      sprite.scale.setScalar(0.17 * GRADE_SIZE[grade]);
      sprite.material.color.setHex(GRADE_COLORS[grade]);
    });

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
      texture.colorSpace = THREE.SRGBColorSpace;
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, toneMapped: false }));
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

  // Draw a see-through "pizza slice" that shows an angle, with a sharp
  // outline. It is drawn on top of the body, so you can always see it.
  // center = the joint. dirA and dirB = the two directions that make
  // the angle. radius = how big the slice is.
  Figure.prototype.setWedge = function (id, center, dirA, dirB, radius, color) {
    if (!this.labelsOn) { this.hide(id); return; }
    var N = 24, W = this.wedges[id];
    if (!W) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((N + 2) * 3), 3));
      var index = [];
      for (var i = 1; i <= N; i++) index.push(0, i, i + 1);
      geo.setIndex(index);
      W = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false, toneMapped: false
      }));
      W.renderOrder = 7;
      W.frustumCulled = false;
      // The outline: the two arms of the angle and the arc between them.
      var lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((N + 3) * 3), 3));
      W.outline = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false
      }));
      W.outline.renderOrder = 8;
      W.outline.frustumCulled = false;
      W.add(W.outline);
      this.wedges[id] = W;
      this.group.add(W);
    }
    var a = v3(dirA).normalize(), b = v3(dirB).normalize();
    var theta = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    var pos = W.geometry.attributes.position, line = W.outline.geometry.attributes.position;
    pos.setXYZ(0, center.x, center.y, center.z);
    line.setXYZ(0, center.x, center.y, center.z);
    for (var k = 0; k <= N; k++) {
      // Sweep smoothly from direction a to direction b.
      var t = k / N, s = Math.sin(theta) || 1;
      var wa = theta < 1e-4 ? 1 - t : Math.sin((1 - t) * theta) / s;
      var wb = theta < 1e-4 ? t : Math.sin(t * theta) / s;
      var x = center.x + (a.x * wa + b.x * wb) * radius;
      var y = center.y + (a.y * wa + b.y * wb) * radius;
      var z = center.z + (a.z * wa + b.z * wb) * radius;
      pos.setXYZ(k + 1, x, y, z);
      line.setXYZ(k + 1, x, y, z);
    }
    line.setXYZ(N + 2, center.x, center.y, center.z);
    pos.needsUpdate = true; line.needsUpdate = true;
    W.material.color.set(color);
    W.outline.material.color.set(color);
    W.visible = true;
  };

  // Hide a sign or a slice we do not need right now.
  Figure.prototype.hide = function (id) {
    if (this.labels[id]) this.labels[id].sprite.visible = false;
    if (this.wedges[id]) this.wedges[id].visible = false;
  };

  // Turn the skater into a see-through blue outline (used for Overlay
  // mode), or back to normal. The outline is drawn ON TOP of the other
  // skater, so you can always see where the two bodies are different.
  Figure.prototype.setGhost = function (on) {
    if (!this.ghostPaint) {
      this.ghostPaint = new THREE.MeshBasicMaterial({
        color: 0x5aa9ff, transparent: true, opacity: 0.32, depthWrite: false, depthTest: false, toneMapped: false
      });
      this.ghostLine = new THREE.LineBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.5, depthTest: false, toneMapped: false });
    }
    var self = this;
    this.group.traverse(function (m) {
      if (!m.userData.body) return;
      if (on && !m.userData.realPaint) {
        m.userData.realPaint = m.material;           // remember the real paint
        m.material = m.isLine ? self.ghostLine : self.ghostPaint;
        m.renderOrder = 5;
      } else if (!on && m.userData.realPaint) {
        m.material = m.userData.realPaint;
        delete m.userData.realPaint;
        m.renderOrder = 0;
      }
      m.castShadow = !on && !m.isLine;
    });
  };

  // Every piece of the body (for dragging the skater with the mouse).
  Figure.prototype.bodyParts = function () {
    var list = [];
    this.group.traverse(function (m) { if (m.isMesh && m.userData.body && m.visible) list.push(m); });
    return list;
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
