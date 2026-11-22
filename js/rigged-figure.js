// =====================================================================
//  rigged-figure.js  --  THE REALISTIC 3D HOCKEY PLAYER
//
//  This skater is a real 3D model built in Blender (see
//  tools/blender/build_skater.py): a body with a skeleton inside it,
//  wearing a jersey, pants, socks, gloves, helmet, cage and skates.
//  When a bone of the skeleton turns, the skin and gear around it bend
//  smoothly, like a real body.
//
//  Every frame we get our pose (joint points). retarget.js works out how
//  to turn each bone so the model takes that pose, and we turn them.
//
//  It works just like the simpler skater in figure.js (same signs, rings,
//  stick and see-through Overlay), so the rest of the page does not care
//  which one it is drawing. If the model cannot load, the page uses the
//  simpler skater instead.
// =====================================================================
(function (root) {
  "use strict";
  var THREE = root.THREE, Rt = root.CoachRetarget, Base = root.SkaterFigure;
  if (!THREE || !Rt || !Base || !root.SKATER_GLTF || !THREE.SkeletonUtils) return;

  var ICE_ANKLE = 0.09; // in our poses, a skate on the ice has its ankle this high (angles.js BODY)
  var SKATE_BOTTOM = -0.046; // the steel reaches this far below the boot (a real holder is tall)

  // The bones we turn, parents before children.
  var ORDER = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head",
    "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r",
    "upperarm_l", "lowerarm_l", "upperarm_r", "lowerarm_r"];
  var REST_JOINTS = ORDER.concat(["ball_l", "ball_r", "hand_l", "hand_r",
    "index_01_l", "middle_01_l", "pinky_01_l", "index_01_r", "middle_01_r", "pinky_01_r"]);
  var HANDS = ["hand_l", "hand_r"]; // turned only while they hold the stick

  // ---- A picture of fabric bumps (a "normal map"): it makes flat cloth
  //      catch the light like knitted material. Painted once, shared. ----
  var fabric = {};
  function fabricMap(kind) {
    if (fabric[kind]) return fabric[kind];
    var size = 128, cells = kind === "knit" ? 8 : 16, strength = kind === "knit" ? 1.6 : 0.8;
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
    function h(x, y) {
      var u = (x / size) * cells * Math.PI * 2, v = (y / size) * cells * Math.PI * 2;
      // Knit: little bumps in rows. Nylon (pants): a fine criss-cross weave.
      return kind === "knit" ? Math.cos(u) * Math.cos(v * 0.5) : Math.sin(u + v) * 0.5 + Math.sin(u - v) * 0.5;
    }
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
        var l = Math.sqrt(dx * dx + dy * dy + 1), i = (y * size + x) * 4;
        d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(kind === "knit" ? 70 : 90, kind === "knit" ? 70 : 90); // the model's map covers the whole body
    return (fabric[kind] = t);
  }

  // ---- Team colors, stripes and the shoulder panel ----
  // The model stores two "rulers" at every point of the jersey and socks
  // (see build_skater.py): red tells us where the stripes go, green where
  // the shoulder panel is. Here we add a few lines to the paint program
  // (the "shader") that turn those rulers into sharp-edged colors.
  // The three colors are kept in one small box that this function hands
  // back, so setOutfit (further down) can change them at any time.
  var STRIPE_WHITE = [0.9, 0.91, 0.92];
  function teamColors(material, team, trim) {
    var box = {
      teamColor: { value: team }, trimColor: { value: trim },
      stripeColor: { value: new THREE.Color().setRGB(STRIPE_WHITE[0], STRIPE_WHITE[1], STRIPE_WHITE[2]) }
    };
    material.onBeforeCompile = function (shader) {
      shader.uniforms.teamColor = box.teamColor;
      shader.uniforms.trimColor = box.trimColor;
      shader.uniforms.stripeColor = box.stripeColor;
      shader.fragmentShader = "uniform vec3 teamColor;\nuniform vec3 trimColor;\nuniform vec3 stripeColor;\n" +
        shader.fragmentShader.replace("#include <color_fragment>", [
          "float ruler = vColor.r, yoke = vColor.g;",
          "float soft = max(fwidth(ruler), 0.002);          // one pixel wide, so edges are smooth",
          "float softY = max(fwidth(yoke), 0.002);",
          "vec3 white = stripeColor;",
          "vec3 paintColor = teamColor;",
          "// stripes: dark, white, dark while the ruler goes from 0.8 down to 0.2",
          "float inBand = smoothstep(0.2 - soft, 0.2 + soft, ruler) - smoothstep(0.8 - soft, 0.8 + soft, ruler);",
          "float inWhite = smoothstep(0.41 - soft, 0.41 + soft, ruler) - smoothstep(0.59 - soft, 0.59 + soft, ruler);",
          "paintColor = mix(paintColor, trimColor, inBand);",
          "paintColor = mix(paintColor, white, inWhite);",
          "// shoulder panel, with a white line along its edge",
          "paintColor = mix(paintColor, white, smoothstep(0.44 - softY, 0.44 + softY, yoke));",
          "paintColor = mix(paintColor, trimColor, smoothstep(0.5 - softY, 0.5 + softY, yoke));",
          "diffuseColor.rgb *= paintColor;"
        ].join("\n"));
    };
    return box;
  }

  // ---- The number on the back: white digits with a dark outline,
  //      painted on a see-through picture ----
  function paintNumber(c, number, trim) {
    var g = c.getContext("2d");
    g.clearRect(0, 0, c.width, c.height);
    if (number) {
      g.font = "700 190px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round"; g.lineWidth = 16;
      g.strokeStyle = "#" + new THREE.Color(trim).getHexString();
      g.fillStyle = "#eef0f2";
      g.strokeText(String(number), 128, 136); g.fillText(String(number), 128, 136);
    }
  }
  function numberPaint(number, trim) {
    var c = document.createElement("canvas");
    c.width = c.height = 256;
    paintNumber(c, number, trim);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // 3D model files count picture rows from the top
    t.anisotropy = 4;
    var m = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, roughness: 0.75 });
    m.name = "number";
    return m;
  }

  // How far the model's ankle is above the bottom of its skate blade.
  var ankleToIce = null;

  var LACE_WHITE = 0xf1f2f4;
  // The shape of the visor, compared with the cage it replaces:
  //   fit     = how wide (1 = as wide as the cage)
  //   tall    = how much of the cage's height it covers
  //   drop    = how far below the top of the cage it starts
  //   taper   = the bottom edge is a little narrower than the top
  //   around  = how far it wraps to each side (in radians; 1.57 = a half circle)
  //   forward = pushed this far to the front (meters)
  var VISOR = { fit: 1.0, tall: 0.36, drop: 0.07, taper: 0.93, around: 1.4, forward: -0.014 };
  // Its paint: a mirror with the colors of the sunset in it, shared by
  // every visor. (Painted once: orange at the top, pink at the bottom.)
  var visorShared = null;
  function visorPaint() {
    if (visorShared) return visorShared;
    var c = document.createElement("canvas");
    c.width = 8; c.height = 64;
    var g = c.getContext("2d"), fade = g.createLinearGradient(0, 0, 0, 64);
    fade.addColorStop(0, "#ffc46b"); fade.addColorStop(0.5, "#ff7a6b"); fade.addColorStop(1, "#ff4fa3");
    g.fillStyle = fade; g.fillRect(0, 0, 8, 64);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    visorShared = new THREE.MeshPhysicalMaterial({
      map: t, metalness: 0.85, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6, side: THREE.DoubleSide
    });
    return visorShared;
  }

  function RiggedFigure(opts) {
    var self = this;
    this.group = new THREE.Group();
    this.labels = {};
    this.wedges = {};
    this.name = opts.name;
    this.number = opts.number;
    this.labelsOn = true;
    this.nameColor = opts.nameColor || "#1d4ed8";

    // Our own copy of the model (two skaters can not share one skeleton).
    this.model = THREE.SkeletonUtils.clone(root.SKATER_GLTF.scene);
    this.model.rotation.y = Math.PI / 2; // the model faces +z; our skaters face +x
    this.group.add(this.model);

    // Paint: each skater gets its own copies, tinted to its colors.
    // (firstColors remembers the color each paint came with, for "null"
    // in an outfit: see setOutfit.)
    var paints = this.paints = {}, firstColors = this.firstColors = {};
    this.cage = [];
    function color(c) { return new THREE.Color(c); }
    this.model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;  // it moves around; always draw it
      o.userData.body = true;   // used for dragging and for the see-through Overlay
      // Raycasting (for dragging) checks a ball around the mesh first; make
      // it big so a skater in any pose can be grabbed.
      o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
      var name = o.material.name;
      if (!paints[name]) {
        var m = o.material.clone();
        m.envMapIntensity = 0.8;
        firstColors[name] = m.color.clone();
        if (name === "team") {
          m.normalMap = fabricMap("knit"); m.normalScale.set(0.22, 0.22); m.roughness = 0.85;
          self.teamPaint = teamColors(m, color(opts.jersey), color(opts.trim === undefined ? 0x0f172a : opts.trim));
        }
        if (name === "number") m = numberPaint(opts.number, opts.trim === undefined ? 0x0f172a : opts.trim);
        if (name === "pants") { m.color = color(opts.pants || 0x15181e); m.normalMap = fabricMap("nylon"); m.normalScale.set(0.25, 0.25); m.roughness = 0.5; }
        if (name === "helmet" && opts.helmet !== undefined) m.color = color(opts.helmet);
        if (name === "glove" && opts.glove !== undefined) m.color = color(opts.glove);
        paints[name] = m;
      }
      o.material = paints[name];
      if (name === "cage") self.cage.push(o);
    });

    // The bones, by name.
    this.bones = {};
    this.model.traverse(function (o) { if (o.isBone) self.bones[o.name] = o; });

    // The resting skeleton, in our directions (the group has no turn yet).
    this.model.updateMatrixWorld(true);
    var joints = {}, quats = {}, v = new THREE.Vector3(), q = new THREE.Quaternion();
    REST_JOINTS.forEach(function (n) {
      var b = self.bones[n];
      b.getWorldPosition(v); joints[n] = { x: v.x, y: v.y, z: v.z };
      b.getWorldQuaternion(q); quats[n] = [q.x, q.y, q.z, q.w];
    });
    this.rig = Rt.setup({ joints: joints, quats: quats });
    // How each hand rests on its forearm (to go back to when it lets go of the stick).
    this.handRest = {};
    HANDS.forEach(function (n) { self.handRest[n] = self.bones[n].quaternion.clone(); });

    // ---- Skates ----
    // The model came with simple skates. We hide those and put on the
    // better skates from skate.js, fastened to the foot bones so they
    // move with the feet. They are fitted to the old skates: the same
    // place under the foot and the same length.
    // (Each skater has its own lace paint, so the laces can take a team color.)
    this.lacePaint = new THREE.MeshStandardMaterial({ color: LACE_WHITE, roughness: 0.85 });
    var oldSkate = { boot: 1, holder: 1, steel: 1, cap: 1 };
    if (root.CoachSkate) this.model.traverse(function (o) { if (o.isMesh && oldSkate[o.material.name]) o.visible = false; });
    this.skates = {};
    var SIZE = 1.097, TALL = 1.143, WIDE = 1.08;   // how much bigger this foot is than the 0.24 m skate
    if (root.CoachSkate) {
      ["l", "r"].forEach(function (s) {
        var foot = self.bones["foot_" + s], a = joints["foot_" + s], b = joints["ball_" + s];
        // Which way the foot points (seen from above), and where the heel is.
        var fwd = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
        var side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
        var heel = new THREE.Vector3(a.x, a.y - 0.06 * TALL, a.z).addScaledVector(fwd, -0.07 * SIZE);
        var placeIt = new THREE.Matrix4().makeBasis(fwd, new THREE.Vector3(0, 1, 0), side).setPosition(heel)
          .scale(new THREE.Vector3(SIZE, TALL, WIDE));
        // Fasten it to the foot bone: where it sits, measured from the bone.
        foot.updateWorldMatrix(true, false);
        var fromBone = foot.matrixWorld.clone().invert().multiply(placeIt);
        var skate = root.CoachSkate.build({ bottom: SKATE_BOTTOM, lacePaint: self.lacePaint });
        fromBone.decompose(skate.position, skate.quaternion, skate.scale);
        skate.traverse(function (m) { if (m.isMesh) m.receiveShadow = true; });
        foot.add(skate);
        self.skates[s] = skate;
      });
    }

    // Lift the model so its skate blades sit on the ice when our pose
    // puts the ankle ICE_ANKLE above the ice. (The ankle is 6 cm above
    // the bottom of the boot, and the steel reaches SKATE_BOTTOM below it,
    // both stretched by TALL.)
    if (ankleToIce === null) ankleToIce = root.CoachSkate ? (0.06 - SKATE_BOTTOM) * TALL : ICE_ANKLE;
    this.lift = ankleToIce - ICE_ANKLE;

    // The stick, the grade rings and the name sign (shared with figure.js).
    function add(object) {
      object.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.userData.body = true; } });
      self.group.add(object);
      return object;
    }
    this.stickPaint = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.45 });
    this.tapePaint = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.9 });
    this.addStickAndRings(this.stickPaint, this.tapePaint, add);

    // ---- A visor (for the Sunset look, where the pro wears one) ----
    // A curved band of mirror glass over the eyes, like the half-visor
    // many pros wear instead of a cage. It is fitted to the cage (same
    // width, the same front) and fastened to the head bone, so it turns
    // with the head. It stays hidden until an outfit asks for it.
    this.visor = null;
    if (this.cage.length) {
      var box = new THREE.Box3(), spot = new THREE.Vector3(), headBone = this.bones.head;
      this.cage.forEach(function (mesh) {
        var count = mesh.geometry.attributes.position.count;
        for (var i = 0; i < count; i += 3) {       // every third point is plenty to find its size
          mesh.getVertexPosition(i, spot).applyMatrix4(mesh.matrixWorld);
          box.expandByPoint(spot);
        }
      });
      var wide = box.max.z - box.min.z, high = box.max.y - box.min.y;
      var radius = wide * 0.5 * VISOR.fit, tall = high * VISOR.tall;
      var band = new THREE.CylinderGeometry(radius, radius * VISOR.taper, tall, 32, 1, true, Math.PI / 2 - VISOR.around, 2 * VISOR.around);
      var visor = new THREE.Mesh(band, visorPaint());
      // Where it sits when the skater stands still and faces +x...
      var place = new THREE.Matrix4().makeTranslation(
        box.max.x - radius + VISOR.forward, box.max.y - high * VISOR.drop - tall / 2, (box.min.z + box.max.z) / 2);
      // ...measured from the head bone, like the skates from the foot bones.
      headBone.updateWorldMatrix(true, false);
      headBone.matrixWorld.clone().invert().multiply(place).decompose(visor.position, visor.quaternion, visor.scale);
      visor.castShadow = true;
      visor.userData.body = true;
      visor.visible = false;
      headBone.add(visor);
      this.visor = visor;
    }
  }
  // Signs, slices, rings, stick, Overlay: borrowed from the simpler skater.
  RiggedFigure.prototype = Object.create(Base.prototype);
  RiggedFigure.prototype.constructor = RiggedFigure;

  // ---- Changing clothes (the page has two looks, see theme.js) ----
  // outfit = { nameColor, jersey, trim, stripe, pants, helmet, glove,
  //            cage, stick, tape, laces, visor }
  // A color of "null" means: the color the model came with.
  // We change the COLOR of each paint and never swap a paint for a new
  // one. That way the see-through Overlay, which remembers every
  // piece's real paint, keeps working.
  RiggedFigure.prototype.setOutfit = function (outfit) {
    var paints = this.paints, first = this.firstColors;
    function put(name, c) {
      if (!paints[name]) return;
      if (c === null || c === undefined) paints[name].color.copy(first[name]); else paints[name].color.set(c);
    }
    this.nameColor = outfit.nameColor;
    if (this.teamPaint) {
      this.teamPaint.teamColor.value.set(outfit.jersey);
      this.teamPaint.trimColor.value.set(outfit.trim);
      if (outfit.stripe === null || outfit.stripe === undefined) this.teamPaint.stripeColor.value.setRGB(STRIPE_WHITE[0], STRIPE_WHITE[1], STRIPE_WHITE[2]);
      else this.teamPaint.stripeColor.value.set(outfit.stripe);
    }
    // The number on the back: painted again on the same picture.
    if (paints.number && paints.number.map) {
      paintNumber(paints.number.map.image, this.number, outfit.trim);
      paints.number.map.needsUpdate = true;
    }
    put("pants", outfit.pants); put("helmet", outfit.helmet); put("glove", outfit.glove); put("cage", outfit.cage);
    this.stickPaint.color.set(outfit.stick);
    this.tapePaint.color.set(outfit.tape);
    this.lacePaint.color.set(outfit.laces === null || outfit.laces === undefined ? LACE_WHITE : outfit.laces);
    // A visor instead of the cage?
    var visorOn = !!(outfit.visor && this.visor);
    if (this.visor) this.visor.visible = visorOn;
    this.cage.forEach(function (mesh) { mesh.visible = !visorOn; });
    this.freshGhost();
  };

  var tmpV = new THREE.Vector3(), groupQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), want = new THREE.Quaternion();

  // Move the model to match a new pose.
  //   grades (optional) = { lKnee: "good", neck: "far", ... }
  //   extras (optional) = { edges: { l: degrees, r: degrees } }
  RiggedFigure.prototype.update = function (pose, grades, extras) {
    var self = this, P = {};
    Object.keys(pose).forEach(function (k) { P[k] = new THREE.Vector3(pose[k].x, pose[k].y, pose[k].z); });
    P.hipMid = new THREE.Vector3().addVectors(P.lHip, P.rHip).multiplyScalar(0.5);
    this.points = P;

    var res = Rt.solve(this.rig, pose, extras && extras.edges);
    this.group.updateWorldMatrix(true, false);
    this.group.getWorldQuaternion(groupQ);

    // The pelvis goes between the hips (lifted so the blades touch the ice).
    var pelvis = this.bones.pelvis;
    tmpV.set(res.pelvis.x, res.pelvis.y + this.lift, res.pelvis.z);
    this.group.localToWorld(tmpV);
    pelvis.parent.updateWorldMatrix(true, false);
    pelvis.parent.worldToLocal(tmpV);
    pelvis.position.copy(tmpV);

    // Turn each bone. retarget.js gives whole-body turns; a bone needs its
    // turn compared with its parent bone, so we "subtract" the parent's turn.
    ORDER.forEach(function (name) {
      var b = self.bones[name], q = res.quats[name];
      want.set(q[0], q[1], q[2], q[3]).premultiply(groupQ);
      b.parent.getWorldQuaternion(parentQ);
      b.quaternion.copy(parentQ.invert().multiply(want));
      b.updateMatrixWorld(true);
    });
    // Hands: wrapped around the stick if they hold it, otherwise resting.
    HANDS.forEach(function (name) {
      var b = self.bones[name], q = res.quats[name];
      if (q) {
        want.set(q[0], q[1], q[2], q[3]).premultiply(groupQ);
        b.parent.getWorldQuaternion(parentQ);
        b.quaternion.copy(parentQ.invert().multiply(want));
      } else {
        b.quaternion.copy(self.handRest[name]);
      }
      b.updateMatrixWorld(true);
    });

    // The top of each boot bends forward with its shin.
    Object.keys(this.skates).forEach(function (s) {
      if (P[s + "Heel"] && P[s + "Toe"]) self.skates[s].setFlex(root.CoachSkate.flexFor(P[s + "Knee"], P[s + "Ankle"], P[s + "Heel"], P[s + "Toe"]));
    });

    // The model's arms are not exactly as long as our pose's arms, so its
    // hand is not exactly where the pose's wrist is. Hang the stick from
    // the model's real fist (the top hand), keeping the blade on the ice.
    if (P.stickTop && P.stickBlade && res.quats.hand_l) this.stickToFist(P);

    this.placeStickAndRings(P, grades);
  };

  var fistV = new THREE.Vector3(), knuckleV = new THREE.Vector3();
  RiggedFigure.prototype.stickToFist = function (P) {
    // The middle of the fist: most of the way from the wrist to the knuckles.
    this.bones.hand_l.getWorldPosition(fistV);
    this.bones.middle_01_l.getWorldPosition(knuckleV);
    fistV.lerp(knuckleV, 0.7);
    this.group.worldToLocal(fistV);
    var shaft = new THREE.Vector3().subVectors(P.stickBlade, P.stickTop), length = shaft.length();
    shaft.normalize();
    var knob = fistV.clone().addScaledVector(shaft, -root.CoachMath.KNOB_OUT);
    // Same way out over the ice as before, same length, blade on the ice.
    var flatWay = new THREE.Vector3(shaft.x, 0, shaft.z).normalize();
    var drop = knob.y - P.stickBlade.y, flat = Math.sqrt(Math.max(0, length * length - drop * drop));
    P.stickTop = knob;
    P.stickBlade = knob.clone().addScaledVector(flatWay, flat).setY(P.stickBlade.y);
  };

  root.RiggedFigure = RiggedFigure;
})(window);
