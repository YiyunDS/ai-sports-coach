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

  // The bones we turn, parents before children.
  var ORDER = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head",
    "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r",
    "upperarm_l", "lowerarm_l", "upperarm_r", "lowerarm_r"];
  var REST_JOINTS = ORDER.concat(["ball_l", "ball_r", "hand_l", "hand_r"]);

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
  function teamColors(material, team, trim) {
    material.onBeforeCompile = function (shader) {
      shader.uniforms.teamColor = { value: team };
      shader.uniforms.trimColor = { value: trim };
      shader.fragmentShader = "uniform vec3 teamColor;\nuniform vec3 trimColor;\n" +
        shader.fragmentShader.replace("#include <color_fragment>", [
          "float ruler = vColor.r, yoke = vColor.g;",
          "float soft = max(fwidth(ruler), 0.002);          // one pixel wide, so edges are smooth",
          "float softY = max(fwidth(yoke), 0.002);",
          "vec3 white = vec3(0.9, 0.91, 0.92);",
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
  }

  // ---- The number on the back: white digits with a dark outline,
  //      painted on a see-through picture ----
  function numberPaint(number, trim) {
    var c = document.createElement("canvas");
    c.width = c.height = 256;
    var g = c.getContext("2d");
    if (number) {
      g.font = "700 190px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round"; g.lineWidth = 16;
      g.strokeStyle = "#" + new THREE.Color(trim).getHexString();
      g.fillStyle = "#eef0f2";
      g.strokeText(String(number), 128, 136); g.fillText(String(number), 128, 136);
    }
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

  function RiggedFigure(opts) {
    var self = this;
    this.group = new THREE.Group();
    this.labels = {};
    this.wedges = {};
    this.name = opts.name;
    this.labelsOn = true;
    this.nameColor = opts.nameColor || "#1d4ed8";

    // Our own copy of the model (two skaters can not share one skeleton).
    this.model = THREE.SkeletonUtils.clone(root.SKATER_GLTF.scene);
    this.model.rotation.y = Math.PI / 2; // the model faces +z; our skaters face +x
    this.group.add(this.model);

    // Paint: each skater gets its own copies, tinted to its colors.
    var paints = {};
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
        if (name === "team") {
          m.normalMap = fabricMap("knit"); m.normalScale.set(0.22, 0.22); m.roughness = 0.85;
          teamColors(m, color(opts.jersey), color(opts.trim === undefined ? 0x0f172a : opts.trim));
        }
        if (name === "number") m = numberPaint(opts.number, opts.trim === undefined ? 0x0f172a : opts.trim);
        if (name === "pants") { m.color = color(opts.pants || 0x15181e); m.normalMap = fabricMap("nylon"); m.normalScale.set(0.25, 0.25); m.roughness = 0.5; }
        if (name === "helmet" && opts.helmet !== undefined) m.color = color(opts.helmet);
        if (name === "glove" && opts.glove !== undefined) m.color = color(opts.glove);
        paints[name] = m;
      }
      o.material = paints[name];
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

    // Lift the model so its skate blades sit on the ice when our pose
    // puts the ankle ICE_ANKLE above the ice.
    if (ankleToIce === null) {
      var lowest = Infinity;
      this.model.traverse(function (o) {
        if (o.isMesh && o.material.name === "steel") {
          var pos = o.geometry.attributes.position;
          for (var i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            lowest = Math.min(lowest, v.y);
          }
        }
      });
      ankleToIce = isFinite(lowest) ? joints.foot_l.y - lowest : ICE_ANKLE;
    }
    this.lift = ankleToIce - ICE_ANKLE;

    // The stick, the grade rings and the name sign (shared with figure.js).
    function add(object) {
      object.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.userData.body = true; } });
      self.group.add(object);
      return object;
    }
    this.addStickAndRings(
      new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.9 }), add);
  }
  // Signs, slices, rings, stick, Overlay: borrowed from the simpler skater.
  RiggedFigure.prototype = Object.create(Base.prototype);
  RiggedFigure.prototype.constructor = RiggedFigure;

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

    this.placeStickAndRings(P, grades);
  };

  root.RiggedFigure = RiggedFigure;
})(window);
