// =====================================================================
//  skate.js  --  BUILDS ONE HOCKEY SKATE IN 3D
//
//  A modern hockey skate has these parts (look at any skate in a hockey
//  store and you will find them all):
//    boot          the hard shell around the foot, with a shiny toe cap
//                  and a colored stripe along the side
//    tendon guard  the tall, stiff tab at the back that protects the
//                  heel cord (it bends back a little at the top)
//    tongue        the thick felt pad in front, sticking up above the boot
//    laces         white laces criss-crossing up the front
//    outsole       the flat bottom of the boot
//    holder        the plastic piece under the boot that holds the
//                  blade, with a window cut out in the middle
//    steel         the thin metal runner. Its bottom is not flat but a
//                  little curved (the "rocker"), so the skater can turn.
//
//  We build the boot like a stack of slices: at each height we draw the
//  outline of the boot seen from above (rounded like a foot), and then
//  join the slices into one smooth skin. The other parts are flat
//  outlines made thick.
//
//  The skate is built for a foot 0.24 m long: heel at x = 0, toe at
//  x = 0.24, the bottom of the boot at y = 0, the middle of the skate at
//  z = 0 (+z is to the skater's right). The steel goes down to "bottom"
//  (a minus number). The skater files stretch it to fit their foot.
//
//  The shapes here are our own, drawn from looking at skate pictures;
//  no picture or model was copied.
// =====================================================================
(function (root) {
  "use strict";
  var THREE = root.THREE;
  if (!THREE) return;

  // ---- A smooth line through a few [position, value] points --------
  // (like the stride keyframes: passes through every point, bends gently)
  function smooth(keys, s) {
    var n = keys.length;
    if (s <= keys[0][0]) return keys[0][1];
    if (s >= keys[n - 1][0]) return keys[n - 1][1];
    var i = 0;
    while (i < n - 2 && keys[i + 1][0] <= s) i++;
    var a = keys[i], b = keys[i + 1], before = keys[Math.max(0, i - 1)], after = keys[Math.min(n - 1, i + 2)];
    var h = b[0] - a[0], u = (s - a[0]) / h;
    var ma = (b[1] - before[1]) / (b[0] - before[0]) * h;
    var mb = (after[1] - a[1]) / (after[0] - a[0]) * h;
    var u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * ma + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * mb;
  }
  function smoothstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // ---- The boot's shape (meters, for a foot 0.24 m long) -----------
  var TOP = 0.165;   // the top of the boot (the leg goes in here)
  // How far BACK the boot reaches at each height [height, x]:
  // round at the heel, pulled in above it where the heel cord is.
  var BACK = [[0, -0.022], [0.015, -0.033], [0.045, -0.037], [0.09, -0.029], [0.125, -0.021], [TOP, -0.024]];
  // How far FORWARD it reaches at each height [height, x]: the round toe
  // cap, then the front slopes up and back along the laces to the ankle.
  var FRONT = [[0, 0.243], [0.012, 0.252], [0.03, 0.251], [0.05, 0.236], [0.066, 0.203], [0.086, 0.166],
    [0.11, 0.13], [0.14, 0.101], [TOP, 0.088]];
  // How wide (half of it) the boot is at each height [height, half width].
  var WIDE = [[0, 0.035], [0.012, 0.041], [0.04, 0.0435], [0.08, 0.0425], [0.12, 0.0395], [TOP, 0.0375]];
  // The heel is narrower than the front of the foot [x, how much of the width].
  var ALONG = [[-0.04, 0.8], [0.03, 0.82], [0.08, 0.9], [0.14, 1], [0.2, 1], [0.25, 0.92]];

  // Colors painted on the boot (dark shell, a shiny toe cap, padding
  // around the top). The silver stripe is its own thin strip (below).
  var SHELL = new THREE.Color(0x15171b), CAP = new THREE.Color(0x272b32), COLLAR = new THREE.Color(0x353a43);

  function bootColor(x, y) {
    var c = SHELL.clone();
    // the toe cap: the front, up to just above the toes
    var front = smooth(FRONT, Math.min(y, 0.07));
    var cap = smoothstep(front - 0.066, front - 0.058, x) * (1 - smoothstep(0.058, 0.066, y));
    c.lerp(CAP, cap);
    // the padded collar at the top
    c.lerp(COLLAR, smoothstep(TOP - 0.012, TOP - 0.005, y));
    return c;
  }

  // A point on the side of the boot: at forward spot x and height y,
  // how far out to the side is the skin? (sign = +1 right, -1 left)
  function sideOfBoot(x, y) {
    var xb = smooth(BACK, y), xf = smooth(FRONT, y);
    var u = Math.min(1, Math.max(0, (x - xb) / (xf - xb)));
    var round = Math.pow(1 - Math.pow(Math.abs(2 * u - 1), 2.5), 1 / 2.5);
    return smooth(WIDE, y) * smooth(ALONG, x) * round;
  }

  // The stripe: a thin strip lying just on the skin, sweeping from high
  // at the heel down toward the toe cap, on both sides of the boot.
  function stripeGeometry() {
    var pos = [], idx = [], N = 30;
    [-1, 1].forEach(function (sign) {
      var first = pos.length / 3;
      for (var i = 0; i <= N; i++) {
        var x = -0.012 + 0.15 * i / N;
        var mid = 0.104 - 0.27 * (x + 0.01);
        var half = 0.0045 * (1 - 0.6 * i / N);      // it gets thinner toward the front
        [mid - half, mid + half].forEach(function (y) {
          pos.push(x, y, sign * (sideOfBoot(x, y) + 0.0009));
        });
      }
      for (i = 0; i < N; i++) {
        var a = first + 2 * i, b = a + 1, c = a + 2, d = a + 3;
        if (sign > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // The boot: a stack of slices joined into one skin.
  function bootGeometry() {
    var NY = 26, M = 76, H = M / 2;   // slices, points around each slice
    var pos = [], col = [], idx = [];
    function ring(y) {
      var xb = smooth(BACK, y), xf = smooth(FRONT, y), hw = smooth(WIDE, y), pts = [];
      for (var k = 0; k < M; k++) {
        // u goes from 0 at the back to 1 at the front, along the right
        // side (k < H) and back along the left side. More points near
        // the round ends.
        var kk = k <= H ? k : M - k, sign = k <= H ? 1 : -1;
        var u = (1 - Math.cos(Math.PI * kk / H)) / 2;
        var x = xb + (xf - xb) * u;
        var round = Math.pow(1 - Math.pow(Math.abs(2 * u - 1), 2.5), 1 / 2.5); // round at both ends, flat-ish sides
        pts.push([x, y, sign * hw * smooth(ALONG, x) * round, round]);
      }
      return pts;
    }
    function put(p, c) { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; }
    // The skin
    var rings = [];
    for (var j = 0; j <= NY; j++) rings.push(ring(TOP * (1 - Math.cos(Math.PI * j / NY)) / 2));
    var first = pos.length / 3;
    rings.forEach(function (r) { r.forEach(function (p) { put(p, bootColor(p[0], p[1])); }); });
    for (j = 0; j < NY; j++) {
      for (var k = 0; k < M; k++) {
        var a = first + j * M + k, b = first + j * M + (k + 1) % M, c = a + M, d = b + M;
        idx.push(a, b, c, b, d, c);
      }
    }
    // The bottom and the top, as flat lids with their own points (so the
    // light treats the edge as a corner, not a smooth curve).
    function lid(r, up, color) {
      var cx = 0, n0 = pos.length / 3;
      r.forEach(function (p) { cx += p[0] / M; put(p, color); });
      var center = put([cx, r[0][1], 0], color);
      for (var k = 0; k < M; k++) {
        if (up) idx.push(center, n0 + k, n0 + (k + 1) % M);
        else idx.push(center, n0 + (k + 1) % M, n0 + k);
      }
    }
    lid(rings[0], false, SHELL);
    lid(rings[NY], true, new THREE.Color(0x0b0c0e)); // the dark lining inside
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---- A flat outline made thick -----------------------------------
  //   points: [x, y] = a straight line to there,
  //           [x1, y1, x2, y2] = a curve bending toward (x1, y1), ending at (x2, y2)
  //   holes:  more outlines cut out of it
  //   depth:  how thick (across the skate),  bevel: how round the edges are
  //   bend:   pull the sides forward (+) or back (-) so it wraps around
  function outline(points, s) {
    s = s || new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) {
      var q = points[i];
      if (q.length === 4) s.quadraticCurveTo(q[0], q[1], q[2], q[3]);
      else s.lineTo(q[0], q[1]);
    }
    return s;
  }
  function slab(points, depth, bevel, holes, bend) {
    var s = outline(points);
    (holes || []).forEach(function (h) { s.holes.push(outline(h, new THREE.Path())); });
    var g = new THREE.ExtrudeGeometry(s, {
      depth: depth, steps: 2, curveSegments: 10,
      bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3
    });
    g.translate(0, 0, -depth / 2);
    if (bend) {
      var p = g.attributes.position;
      for (var i = 0; i < p.count; i++) p.setX(i, p.getX(i) + bend * p.getZ(i) * p.getZ(i));
      g.computeVertexNormals();
    }
    return g;
  }

  // ---- The whole skate ---------------------------------------------
  //   opts.bottom = how far below the boot the steel reaches (default -0.03)
  // Returns a THREE.Group. Every piece is marked as part of the body
  // (for dragging and for the see-through Overlay).
  function build(opts) {
    opts = opts || {};
    var bottom = opts.bottom === undefined ? -0.03 : opts.bottom;
    var P = paints();
    var g = new THREE.Group();
    function add(geo, paint) { var m = new THREE.Mesh(geo, paint); m.castShadow = true; m.userData.body = true; g.add(m); return m; }

    // Boot
    add(bootGeometry(), P.boot);

    // Tendon guard: rises from the back of the boot and tips backward.
    add(slab([[-0.004, 0.118], [-0.03, 0.16, -0.047, 0.206], [-0.05, 0.218, -0.036, 0.218],
      [-0.016, 0.19, -0.004, 0.15], [0.004, 0.125]], 0.034, 0.004, null, 10), P.guard);

    // The silver stripe along each side.
    add(stripeGeometry(), P.stripe);

    // Tongue: a thick felt pad in front, sticking up above the boot and
    // leaning forward over the shin.
    add(slab([[0.125, 0.1], [0.09, 0.135], [0.08, 0.18, 0.084, 0.222], [0.088, 0.236, 0.103, 0.233],
      [0.118, 0.228, 0.117, 0.2], [0.118, 0.16], [0.14, 0.115]], 0.05, 0.005, null, -9), P.tongue);

    // Laces: white bars across the front, from the toe cap up to the top.
    var laceGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 6);
    for (var i = 0; i < 9; i++) {
      var y = 0.064 + i * 0.0108;
      var x = smooth(FRONT, y), hw = smooth(WIDE, y) * smooth(ALONG, x);
      var lace = add(laceGeo, P.lace);
      lace.scale.set(1, hw * 1.15, 1);
      // lie across the boot, tipped to follow the slope of the front
      lace.rotation.set(Math.PI / 2, 0, 0);
      lace.position.set(x - 0.0035, y, 0);
      // little eyelets where each lace goes into the boot
      [-1, 1].forEach(function (sd) {
        var eye = add(new THREE.SphereGeometry(0.0034, 8, 6), P.steel);
        eye.position.set(x - 0.012, y, sd * hw * 0.62);
      });
    }

    // Outsole: the flat bottom, a little smaller than the boot.
    var sole = [];
    for (var k = 0; k <= 40; k++) {
      var u = k / 40, xs = -0.02 + 0.262 * u, r = Math.pow(1 - Math.pow(Math.abs(2 * u - 1), 2.5), 0.4);
      sole.push([xs, 0.034 * smooth(ALONG, xs) * r]);
    }
    for (k = 39; k >= 1; k--) sole.push([sole[k][0], -sole[k][1]]);
    var soleGeo = slab(sole, 0.007, 0, null, 0);
    soleGeo.rotateX(Math.PI / 2);     // lay it flat: its outline was drawn in x and z
    soleGeo.translate(0, -0.0005, 0);
    add(soleGeo, P.trim);

    // Holder: two towers (under the heel and the ball of the foot) joined
    // by a bridge along the steel, with a window cut out between them.
    var top = -0.003, low = bottom + 0.013, tall = top - low;
    var holderShape = [[-0.014, top], [0.238, top], [0.256, top, 0.252, top - 0.008], [0.243, low + 0.002, 0.232, low],
      [0.004, low], [-0.012, low + 0.001, -0.016, low + 0.01], [-0.024, top, -0.014, top]];
    var windows = [];
    if (tall > 0.02) {
      var wy0 = low + 0.0075, wy1 = top - 0.0065;
      windows.push([[0.05, wy0], [0.165, wy0], [0.178, wy0, 0.176, wy1 - 0.004], [0.172, wy1, 0.16, wy1],
        [0.06, wy1], [0.044, wy1, 0.042, wy1 - 0.004], [0.04, wy0, 0.05, wy0]]);
    }
    add(slab(holderShape, 0.012, 0.0025, windows, 0), P.holder);
    // the wide pads where the holder is screwed to the boot
    [[-0.016, 0.06], [0.15, 0.24]].forEach(function (pad) {
      var m = add(new THREE.BoxGeometry(pad[1] - pad[0], 0.005, 0.046), P.holder);
      m.position.set((pad[0] + pad[1]) / 2, -0.0035, 0);
    });

    // Steel: a thin runner with a curved bottom (the "rocker").
    var steel = [[-0.02, low + 0.006]], R = 2.6, mid = 0.115;
    for (k = 0; k <= 24; k++) {
      var xr = -0.012 + (0.26 * k) / 24;
      steel.push([xr, bottom + (xr - mid) * (xr - mid) / (2 * R)]);
    }
    steel.push([0.256, bottom + 0.006, 0.262, low + 0.004]);
    steel.push([0.25, low + 0.012]);
    steel.push([-0.016, low + 0.012]);
    add(slab(steel, 0.0036, 0, null, 0), P.steel);

    // ---- Bending the top of the boot with the shin ----
    // A skate boot is stiff, but its top (the cuff, the tongue and the
    // tendon guard) bends forward a little when the shin leans. Remember
    // where every piece started, so we can bend from there each time.
    var flexers = [];
    g.children.forEach(function (m) {
      m.geometry.computeBoundingBox();
      if (m.position.y + m.geometry.boundingBox.max.y * m.scale.y < 0.07 && m.geometry !== laceGeo) return; // nothing up there bends
      var big = m.geometry.attributes.position.count > 60 && m.geometry !== laceGeo;
      flexers.push(big ? { mesh: m, pos: m.geometry.attributes.position.array.slice(),
                           nrm: m.geometry.attributes.normal.array.slice() }
                       : { mesh: m, at: m.position.clone(), turn: m.rotation.z });
    });
    g.flex = 0;
    //   degrees = how far the top of the boot bends forward (minus = back)
    g.setFlex = function (degrees) {
      if (Math.abs(degrees - g.flex) < 0.25) return;
      g.flex = degrees;
      var a = -degrees / 180 * Math.PI;   // turning around the skate's side axis
      flexers.forEach(function (f) {
        if (f.pos) {
          var p = f.mesh.geometry.attributes.position, n = f.mesh.geometry.attributes.normal;
          for (var i = 0; i < p.count; i++) {
            var x = f.pos[3 * i], y = f.pos[3 * i + 1], w = a * cuffWeight(y), c = Math.cos(w), s = Math.sin(w);
            var dx = x - PIVOT[0], dy = y - PIVOT[1];
            p.array[3 * i] = PIVOT[0] + dx * c - dy * s;
            p.array[3 * i + 1] = PIVOT[1] + dx * s + dy * c;
            var nx = f.nrm[3 * i], ny = f.nrm[3 * i + 1];
            n.array[3 * i] = nx * c - ny * s;
            n.array[3 * i + 1] = nx * s + ny * c;
          }
          p.needsUpdate = n.needsUpdate = true;
          f.mesh.geometry.computeBoundingSphere();
        } else {
          // small pieces (laces, eyelets): move each one whole
          var w2 = a * cuffWeight(f.at.y), c2 = Math.cos(w2), s2 = Math.sin(w2);
          var ex = f.at.x - PIVOT[0], ey = f.at.y - PIVOT[1];
          f.mesh.position.set(PIVOT[0] + ex * c2 - ey * s2, PIVOT[1] + ex * s2 + ey * c2, f.at.z);
          f.mesh.rotation.z = f.turn + w2;
        }
      });
    };
    return g;
  }

  // The boot bends around the ankle (7 cm in front of the heel, 6 cm up).
  // Below the ankle it does not bend at all; the top bends the whole way.
  var PIVOT = [0.07, 0.06];
  function cuffWeight(y) { return smoothstep(0.07, 0.16, y); }

  // How far should the top of the boot bend for this leg? As far as the
  // shin leans forward, seen from the skate, but a boot only gives so much.
  //   knee, ankle, heel, toe = points (anything with x, y, z)
  function flexFor(knee, ankle, heel, toe) {
    var bx = toe.x - heel.x, by = toe.y - heel.y, bz = toe.z - heel.z;
    var bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
    bx /= bl; by /= bl; bz /= bl;
    // the boot's "up": straight up, made square to the blade
    var ux = -by * bx, uy = 1 - by * by, uz = -by * bz, ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    var sx = knee.x - ankle.x, sy = knee.y - ankle.y, sz = knee.z - ankle.z;
    var lean = Math.atan2(sx * bx + sy * by + sz * bz, sx * ux + sy * uy + sz * uz) * 180 / Math.PI;
    return Math.max(-8, Math.min(32, lean * 0.85));
  }

  // Paints, made once and shared by every skate.
  var shared = null;
  function paints() {
    if (shared) return shared;
    shared = {
      boot: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
      guard: new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.5 }),
      tongue: new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.92 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.7 }),
      lace: new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.85 }),
      stripe: new THREE.MeshStandardMaterial({ color: 0xa3acb7, roughness: 0.3, metalness: 0.6 }),
      holder: new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.32 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xe3e7ec, roughness: 0.18, metalness: 0.95 })
    };
    return shared;
  }

  root.CoachSkate = { build: build, flexFor: flexFor };
})(window);
