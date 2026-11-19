# =====================================================================
#  build_skater.py  --  BUILDS THE 3D HOCKEY PLAYER IN BLENDER
#
#  Blender is a free 3D program. This script tells it, step by step,
#  how to build our skater, so anyone can build it again the same way.
#
#  How to run it (from the project folder):
#    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/build_skater.py -- OUT_DIR
#
#  What it does:
#    1. Makes a human body with MPFB2 (the MakeHuman add-on for Blender).
#       Everything MPFB2 makes is CC0: free for anyone to use.
#    2. Adds a skeleton ("rig") with standard game bones.
#    3. Makes the hockey gear by copying parts of the body (the chest
#       and arms for the jersey, the hips for the pants...), puffing
#       them out and giving them thickness. Because each piece is copied
#       from the body, it bends with the same bones as the body.
#    4. Adds a helmet with a cage, and skates with a holder and a steel
#       blade, stuck to the head and feet bones.
#    5. Saves everything as one "glTF" file the web page can read.
# =====================================================================
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.getcwd()
os.makedirs(OUT, exist_ok=True)
RENDER = "--render" in sys.argv

LEG_LENGTH = 0.82   # thigh + shin, the same as BODY in js/angles.js (meters)

# ---------------------------------------------------------------------
# 1. The body
# ---------------------------------------------------------------------
def make_body(scale):
    macro = TargetService.get_default_macro_info_dict()
    # A young, athletic male body. (age 0.5 is 25 years old in MakeHuman)
    macro.update({"gender": 1.0, "age": 0.44, "muscle": 0.68, "weight": 0.5, "height": 0.5})
    body = HumanService.create_human(macro_detail_dict=macro, scale=scale)
    rig = HumanService.add_builtin_rig(body, "game_engine")
    return body, rig

def leg_length(rig):
    b = rig.data.bones
    return (b["thigh_l"].tail_local - b["thigh_l"].head_local).length + (b["calf_l"].tail_local - b["calf_l"].head_local).length

bpy.ops.wm.read_factory_settings(use_empty=True)
body, rig = make_body(0.1)
k = LEG_LENGTH / leg_length(rig)          # how much bigger it must be
bpy.ops.wm.read_factory_settings(use_empty=True)
body, rig = make_body(0.1 * k)
print("LEGS", round(leg_length(rig), 4), "HEIGHT", round(body.dimensions.z, 3))

# Turn the body's shape settings into its real shape, and remove the
# hidden helper parts (eyelashes, teeth...), so we can edit the mesh.
TargetService.bake_targets(body)
# Where the eyes go (MakeHuman marks them with helper points).
def group_center(obj, name):
    gi = obj.vertex_groups[name].index
    pts = [v.co for v in obj.data.vertices if any(g.group == gi for g in v.groups)]
    return sum(pts, Vector()) / len(pts)
EYES = {s: group_center(body, "joint-%s-eye" % s) for s in ("l", "r")}
bpy.context.view_layer.objects.active = body
for m in list(body.modifiers):
    if m.type == "MASK":
        bpy.ops.object.modifier_apply(modifier=m.name)

BONES = {b.name: b for b in rig.data.bones}
def bone_ends(name):
    b = BONES[name]
    return rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local

# ---------------------------------------------------------------------
# 2. Which bone moves each point of the body, and how far along it
# ---------------------------------------------------------------------
def classify(obj):
    """For every vertex: (strongest bone, how far along that bone 0..1, position)."""
    names = {g.index: g.name for g in obj.vertex_groups}
    out = []
    for v in obj.data.vertices:
        best, w = None, 0.0
        for g in v.groups:
            n = names[g.group]
            if n in BONES and g.weight > w:
                best, w = n, g.weight
        t = 0.0
        if best:
            h, tl = bone_ends(best)
            d = tl - h
            t = (v.co - h).dot(d) / max(d.length_squared, 1e-9)
        out.append((best, t, v.co.copy()))
    return out

def side_free(name):
    return name[:-2] if name and (name.endswith("_l") or name.endswith("_r")) else name

FINGERS = ("thumb", "index", "middle", "ring", "pinky")

def region_of(bone, t, co):
    """Which piece of gear covers this spot of the body."""
    b = side_free(bone)
    hip_z = bone_ends("pelvis")[0].z
    if b is None:
        return "body"
    if b in ("head", "neck_01"):
        return "body"
    if b in ("spine_02", "spine_03", "clavicle", "upperarm"):
        return "jersey"
    if b == "spine_01":
        return "jersey" if co.z > hip_z + 0.11 else "pants"
    if b == "lowerarm":
        return "jersey" if t < 0.62 else "glove"
    if b == "hand" or b.split("_")[0] in FINGERS:
        return "glove"
    if b == "pelvis":
        return "pants"
    if b == "thigh":
        return "pants" if t < 0.62 else "socks"
    if b == "calf":
        return "socks" if t < 0.78 else "skate"
    if b in ("foot", "ball"):
        return "skate"
    return "body"

INFO = classify(body)
REGION = [region_of(b, t, co) for (b, t, co) in INFO]

# ---------------------------------------------------------------------
# 3. Small helpers
# ---------------------------------------------------------------------
def only_select(obj):
    """Make obj the one and only selected object (Blender's buttons act
    on whatever is selected, so we keep that tidy)."""
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def apply_all(obj, keep_armature=True):
    only_select(obj)
    for m in list(obj.modifiers):
        if m.type != "ARMATURE" or not keep_armature:
            bpy.ops.object.modifier_apply(modifier=m.name)

def bind_to_bone(obj, bone):
    """Make a piece follow one bone completely."""
    only_select(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    g = obj.vertex_groups.new(name=bone)
    g.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    m = obj.modifiers.new("Armature", "ARMATURE")
    m.object = rig

def smooth_shade(obj):
    for p in obj.data.polygons:
        p.use_smooth = True

def new_object(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj

def quad_points(points, steps=4):
    """Turn [x, y] (straight) and [cx, cy, x, y] (curve) steps into a list of points."""
    out = [tuple(points[0])]
    for q in points[1:]:
        if len(q) == 4:
            p0 = out[-1]
            for i in range(1, steps + 1):
                t = i / steps
                out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * q[0] + t * t * q[2],
                            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * q[1] + t * t * q[3]))
        else:
            out.append(tuple(q))
    if (out[-1][0] - out[0][0]) ** 2 + (out[-1][1] - out[0][1]) ** 2 < 1e-10:
        out.pop()
    return out

def slab(name, profile, width, place):
    """A flat side-view outline made thick: profile = [(forward, up)],
    place(forward, up, across) -> world point."""
    bm = bmesh.new()
    front = [bm.verts.new(place(u, v, -width / 2)) for (u, v) in profile]
    back = [bm.verts.new(place(u, v, width / 2)) for (u, v) in profile]
    n = len(profile)
    bm.faces.new(front[::-1]); bm.faces.new(back)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([front[i], front[j], back[j], back[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm)

# ---------------------------------------------------------------------
# 4. Gear made from the body: jersey, pants, socks
# ---------------------------------------------------------------------
def copy_region(name, keep, grow_into=()):
    """A copy of the body with only the faces in "keep" (plus a border
    from grow_into, so neighboring pieces overlap and leave no gaps)."""
    obj = body.copy()
    obj.data = body.data.copy()
    obj.name = name
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    # Keep every face that touches the region, so there are no gaps
    # where two pieces meet (they overlap a little instead).
    gone = [f for f in bm.faces if not any(REGION[v.index] in keep for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    return obj

def puff(obj, amount_fn, smooth=0):
    """Smooth away the body's muscles, then push every point outward by
    amount_fn(point, normal) meters."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    border = set(v for e in bm.edges if e.is_boundary for v in e.verts)
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if v not in border], factor=0.6,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
    # Smooth the edges (neckline, cuffs, hems) so they are not ragged:
    # each edge point moves toward the middle of its two edge neighbors.
    for _ in range(8):
        moves = []
        for v in border:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                moves.append((v, (nb[0].co + nb[1].co) / 2))
        for v, target in moves:
            v.co = v.co.lerp(target, 0.5)
    bm.normal_update()
    moves = [(v, v.normal * amount_fn(v.co, v.normal)) for v in bm.verts]
    for v, m in moves:
        v.co += m
    bm.to_mesh(obj.data)
    bm.free()

def finish(obj, thickness, wrinkle=0.0):
    """Soft folds, then some thickness. The skeleton acts last."""
    only_select(obj)
    for m in list(obj.modifiers):
        if m.type != "ARMATURE":
            obj.modifiers.remove(m)
    arm = obj.modifiers.get("Armature")
    if wrinkle > 0:
        tex = bpy.data.textures.new(obj.name + "_folds", "CLOUDS")
        tex.noise_scale = 0.05
        d = obj.modifiers.new("folds", "DISPLACE")
        d.texture = tex; d.strength = wrinkle; d.mid_level = 0.5; d.texture_coords = "GLOBAL"
    s = obj.modifiers.new("thick", "SOLIDIFY")
    s.thickness = thickness; s.offset = -1; s.use_rim = True
    bpy.ops.object.modifier_move_to_index(modifier=arm.name, index=len(obj.modifiers) - 1)
    apply_all(obj)
    smooth_shade(obj)

def near(co, bone, end=0):
    p = bone_ends(bone)[end]
    return (co - p).length

# Jersey: loose and baggy over shoulder pads and elbow pads.
jersey = copy_region("jersey", ["jersey"], grow_into=["pants", "glove"])
def jersey_puff(co, n):
    pad = max(0.0, 0.11 - min(near(co, "upperarm_l"), near(co, "upperarm_r"))) * 0.5   # shoulder pads
    elbow = max(0.0, 0.08 - min(near(co, "lowerarm_l"), near(co, "lowerarm_r"))) * 0.35  # elbow pads
    return 0.035 + pad + elbow
puff(jersey, jersey_puff, smooth=10)
finish(jersey, 0.005, wrinkle=0.014)

# Hockey pants: thick padding, boxy, down to just above the knee.
pants = copy_region("pants", ["pants"], grow_into=["jersey", "socks"])
puff(pants, lambda co, n: 0.048, smooth=14)
finish(pants, 0.007, wrinkle=0.006)

# Socks over shin pads: the shin pad makes the front stick out.
socks = copy_region("socks", ["socks"], grow_into=["pants", "skate"])
puff(socks, lambda co, n: 0.016 + 0.026 * max(0.0, -n.y), smooth=4)
finish(socks, 0.004, wrinkle=0.003)

# Hide the body under the gear (only the head and neck stay), so the body
# never pokes through.
bm = bmesh.new()
bm.from_mesh(body.data)
gone = [f for f in bm.faces if all(REGION[v.index] != "body" for v in f.verts)]
bmesh.ops.delete(bm, geom=gone, context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.to_mesh(body.data)
bm.free()
smooth_shade(body)

# ---------------------------------------------------------------------
# 5. Pieces that do not bend: gloves, helmet, cage, eyes, skates
# ---------------------------------------------------------------------
pieces = []

# Gloves: a padded mitt (a fist) with finger rolls, and a wide cuff.
for side in ("l", "r"):
    eh, wrist = bone_ends("lowerarm_" + side)
    along = (wrist - eh).normalized()
    turn = along.to_track_quat("Y", "Z").to_matrix().to_4x4()
    def at(x, y, z):
        return Matrix.Translation(wrist) @ turn @ Vector((x, y, z))
    # The fist.
    bpy.ops.mesh.primitive_cube_add(size=1)
    fist = bpy.context.active_object; fist.name = "glove_" + side
    fist.scale = (0.085, 0.13, 0.075); fist.location = at(0, 0.075, 0)
    fist.rotation_euler = turn.to_euler()
    b = fist.modifiers.new("round", "BEVEL"); b.width = 0.025; b.segments = 4
    only_select(fist); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    apply_all(fist)
    # Finger rolls: puffy ridges across the back of the fingers.
    for i in range(3):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.022, depth=0.09)
        roll = bpy.context.active_object; roll.name = "roll_%s_%d" % (side, i)
        roll.location = at(0, 0.09 + i * 0.03, 0.026)
        roll.rotation_euler = (turn @ Matrix.Rotation(math.pi / 2, 4, "Y")).to_euler()
        only_select(roll); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        only_select(fist); roll.select_set(True); bpy.context.view_layer.objects.active = fist
        bpy.ops.object.join()
    # The cuff: a wide tube around the wrist.
    bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=0.062, radius2=0.052, depth=0.11, end_fill_type="NOTHING")
    cuff = bpy.context.active_object; cuff.name = "cuff_" + side
    cuff.location = at(0, -0.03, 0)
    cuff.rotation_euler = (turn @ Matrix.Rotation(-math.pi / 2, 4, "X")).to_euler()
    s = cuff.modifiers.new("thick", "SOLIDIFY"); s.thickness = 0.008
    only_select(cuff); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    apply_all(cuff)
    for o in (fist, cuff):
        sd = o.modifiers.new("smooth", "SUBSURF"); sd.levels = 1
        apply_all(o); smooth_shade(o)
    bind_to_bone(fist, "hand_" + side)
    bind_to_bone(cuff, "lowerarm_" + side)
    pieces += [("glove", fist), ("glove", cuff)]

# Helmet: a shell over the top and back of the head, open at the face.
head_h, head_t = bone_ends("head")
center = head_h + (head_t - head_h) * 0.55 + Vector((0, 0.01, 0))
R = 0.105 * k
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1)
helmet = bpy.context.active_object; helmet.name = "helmet"
bm = bmesh.new(); bm.from_mesh(helmet.data)
cut = [v for v in bm.verts if v.co.z < -0.35 or (v.co.y < -0.3 and v.co.z < 0.3)]
bmesh.ops.delete(bm, geom=cut, context="VERTS")
bm.to_mesh(helmet.data); bm.free()
helmet.scale = (R, R * 1.14, R * 0.98); helmet.location = center
only_select(helmet); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
s = helmet.modifiers.new("thick", "SOLIDIFY"); s.thickness = 0.014; s.offset = 1
sd = helmet.modifiers.new("smooth", "SUBSURF"); sd.levels = 1
apply_all(helmet); smooth_shade(helmet)
bind_to_bone(helmet, "head")
pieces.append(("helmet", helmet))

# Cage: thin wires in front of the face.
cage_lines = []
CR = R * 1.08
for i in range(-4, 5):
    a = i * 0.2
    cage_lines.append([(CR * math.sin(a), -CR * math.cos(a), -0.11 * k), (CR * math.sin(a), -CR * math.cos(a), 0.03 * k)])
for zz in (-0.1, -0.065, -0.03, 0.005):
    cage_lines.append([(CR * math.sin(i * 0.2), -CR * math.cos(i * 0.2), zz * k) for i in range(-4, 5)])
curve = bpy.data.curves.new("cage", "CURVE"); curve.dimensions = "3D"
curve.bevel_depth = 0.0022; curve.bevel_resolution = 1
for line in cage_lines:
    sp = curve.splines.new("POLY"); sp.points.add(len(line) - 1)
    for i, p in enumerate(line):
        sp.points[i].co = (p[0], p[1], p[2], 1)
cage = bpy.data.objects.new("cage", curve); bpy.context.collection.objects.link(cage)
cage.location = center
only_select(cage)
bpy.ops.object.convert(target="MESH")
cage = bpy.context.active_object
bind_to_bone(cage, "head")
pieces.append(("cage", cage))

# Neck guard: a short padded collar around the neck.
nh, nt = bone_ends("neck_01")
bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.062 * k / 1.24, depth=(nt - nh).length * 1.1, end_fill_type="NOTHING")
neck = bpy.context.active_object; neck.name = "neckguard"
neck.location = (nh + nt) / 2
neck.rotation_euler = (nt - nh).to_track_quat("Z", "Y").to_euler()
only_select(neck); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
s_ = neck.modifiers.new("thick", "SOLIDIFY"); s_.thickness = 0.01
sd = neck.modifiers.new("smooth", "SUBSURF"); sd.levels = 1
apply_all(neck); smooth_shade(neck)
bind_to_bone(neck, "neck_01")
pieces.append(("neck", neck))

# Eyes, so the face behind the cage is not blank.
for side in ("l", "r"):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.0115 * k, location=EYES[side])
    eye = bpy.context.active_object; eye.name = "eye_" + side
    bm = bmesh.new(); bm.from_mesh(eye.data)
    # The colored part looks forward (-y).
    iris = [f for f in bm.faces if f.calc_center_median().y < -0.0085 * k]
    for f in iris: f.material_index = 1
    bm.to_mesh(eye.data); bm.free()
    smooth_shade(eye)
    bind_to_bone(eye, "head")
    pieces.append(("eye", eye))

# Skates: a boot with a real skate outline, a white holder and a steel blade.
# Outlines from js/figure.js, for a foot 0.24 m long: (forward, up), heel at 0.
BOOT = [[-0.012, 0], [0.24, 0], [0.258, 0.004, 0.255, 0.026], [0.248, 0.048, 0.2, 0.056],
        [0.125, 0.082], [0.09, 0.15], [0.084, 0.19, 0.104, 0.205], [0.03, 0.198],
        [-0.03, 0.196, -0.036, 0.15], [-0.022, 0.08, -0.038, 0.03], [-0.036, 0.0, -0.012, 0]]
HOLDER = [[0.0, 0.002], [0.232, 0.002], [0.214, -0.019], [0.13, -0.016], [0.1, -0.016], [0.02, -0.019]]
STEEL = [[-0.018, -0.017], [0.25, -0.017], [0.262, -0.02, 0.236, -0.03], [0.02, -0.03], [-0.025, -0.029, -0.018, -0.017]]
SKATE = {}
for side in ("l", "r"):
    ankle = bone_ends("foot_" + side)[0]
    toe_tip = bone_ends("ball_" + side)[1]
    fwd = Vector((toe_tip.x - ankle.x, toe_tip.y - ankle.y, 0)).normalized()
    across = fwd.cross(Vector((0, 0, 1))).normalized()
    up = Vector((0, 0, 1))
    size = ((toe_tip - ankle).xy.length + 0.07 * k) / 0.24 * 1.02       # forward stretch
    tall = ankle.z / 0.06                                                 # ankle 0.06 above the sole
    heel = Vector((ankle.x, ankle.y, 0)) - fwd * 0.07 * size
    def place(u, v, w, heel=heel, fwd=fwd, up=up, across=across, size=size, tall=tall):
        return heel + fwd * (u * size) + up * (v * tall) + across * w
    boot = slab("boot_" + side, quad_points(BOOT), 0.085, place)
    holder = slab("holder_" + side, quad_points(HOLDER), 0.016, place)
    steel = slab("steel_" + side, quad_points(STEEL), 0.004, place)
    for o, bev in ((boot, 0.012), (holder, 0.003)):
        b = o.modifiers.new("round", "BEVEL"); b.width = bev; b.segments = 3; b.limit_method = "ANGLE"
        sd = o.modifiers.new("smooth", "SUBSURF"); sd.levels = 1
        apply_all(o)
    for o, kind in ((boot, "boot"), (holder, "holder"), (steel, "steel")):
        smooth_shade(o) if kind == "boot" else None
        bind_to_bone(o, "foot_" + side)
        pieces.append((kind, o))
    SKATE[side] = {"ankle_to_ice": ankle.z + 0.03 * tall}
print("ANKLE_TO_ICE", round(SKATE["l"]["ankle_to_ice"], 4))

# ---------------------------------------------------------------------
# 6. Paint
# ---------------------------------------------------------------------
def linear(c):
    """Blender wants "linear" color numbers; we think in normal screen
    colors (like a color picker). This converts one to the other."""
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def paint(name, color, rough, metal=0.0, coat=0.0, use_colors=False):
    color = linear(color)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
    if use_colors:
        node = nt.nodes.new("ShaderNodeVertexColor"); node.layer_name = "Col"
        nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    return m

PAINT = {
    "skin": paint("skin", (0.6, 0.42, 0.33), 0.6),
    "neck": paint("neck", (0.1, 0.11, 0.13), 0.8),
    "team": paint("team", (1, 1, 1), 0.8, use_colors=True),   # the page paints in the team colors
    "pants": paint("pants", (0.12, 0.13, 0.16), 0.5),
    "glove": paint("glove", (0.13, 0.14, 0.17), 0.55),
    "helmet": paint("helmet", (0.12, 0.13, 0.16), 0.22, coat=0.7),
    "cage": paint("cage", (0.88, 0.89, 0.91), 0.3, metal=0.9),
    "eye": paint("eye", (0.93, 0.93, 0.9), 0.2),
    "iris": paint("iris", (0.3, 0.22, 0.16), 0.2),
    "boot": paint("boot", (0.1, 0.11, 0.12), 0.38),
    "holder": paint("holder", (0.95, 0.96, 0.96), 0.35),
    "steel": paint("steel", (0.92, 0.93, 0.95), 0.18, metal=1.0),
}
def give(obj, *mats):
    obj.data.materials.clear()
    for m in mats:
        obj.data.materials.append(m)

# Team-colored pieces get stripes, painted as point colors that the page
# reads as a code:  white = team color,  gray = white stripe,  black = dark trim.
TEAM, WHITE, DARK = (1, 1, 1, 1), (0.5, 0.5, 0.5, 1), (0, 0, 0, 1)
def stripes(obj, which):
    attr = obj.data.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    obj.data.color_attributes.active_color = attr
    for i, v in enumerate(obj.data.vertices):
        attr.data[i].color = which(v.co)
def band(u, start):
    """A stripe set: dark, white, dark, starting at "start" (u = how far along)."""
    if start <= u < start + 0.035: return DARK
    if start + 0.035 <= u < start + 0.06: return WHITE
    if start + 0.06 <= u < start + 0.095: return DARK
    return None
hem_z = min(v.co.z for v in jersey.data.vertices)
def along(co, bone):
    h, t = bone_ends(bone)
    d = t - h
    u = (co - h).dot(d) / d.length_squared
    return u, (co - (h + d * u)).length
def jersey_colors(co):
    if co.z < hem_z + 0.2:                                   # around the bottom of the jersey
        c = band(co.z - hem_z, 0.05)
        if c: return c
    for s in ("l", "r"):                                     # around each sleeve
        u, r = along(co, "lowerarm_" + s)
        if r < 0.13:
            c = band(u * 0.26, 0.04)
            if c: return c
    return TEAM
stripes(jersey, jersey_colors)
def sock_colors(co):
    for s in ("l", "r"):
        u, r = along(co, "calf_" + s)
        if r < 0.13:
            c = band(u * 0.42, 0.07)
            if c: return c
    return TEAM
stripes(socks, sock_colors)

give(body, PAINT["skin"]); give(jersey, PAINT["team"]); give(socks, PAINT["team"]); give(pants, PAINT["pants"])
for kind, o in pieces:
    if kind == "eye": give(o, PAINT["eye"], PAINT["iris"])
    else: give(o, PAINT[kind])

# Join pieces that share a paint and a bone into fewer objects (faster to draw).
def join(objs, name):
    only_select(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    return o
gear_objs = {}
for kind, o in pieces:
    gear_objs.setdefault(kind, []).append(o)
final = [body, jersey, pants, socks]
for kind, objs in gear_objs.items():
    final.append(join(objs, kind) if len(objs) > 1 else objs[0])

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in final)
print("TRIANGLES", tris)

# ---------------------------------------------------------------------
# 7. Save: the Blender file, and the glTF file for the web page
# ---------------------------------------------------------------------
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "skater.blend"))
only_select(rig)
for o in final:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "skater.glb"), export_format="GLB", use_selection=True,
    export_skins=True, export_animations=False, export_morph=False, export_yup=True,
    export_vertex_color="ACTIVE", export_all_vertex_colors=False)
print("GLB_BYTES", os.path.getsize(os.path.join(OUT, "skater.glb")))

# ---------------------------------------------------------------------
# 8. Quick pictures to check the look (only with --render)
# ---------------------------------------------------------------------
if RENDER:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 900; scene.render.resolution_y = 1100
    world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.2, 0.22, 0.25, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scene.collection.objects.link(sun)
    sun.data.energy = 4; sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(30))
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam)
    scene.camera = cam; cam.data.lens = 70
    PAINT["team"].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.1, 0.3, 0.75, 1)
    for name, loc, aim in (("front", (0, -4.2, 1.0), 0.85), ("side", (4.2, 0, 1.0), 0.85),
                           ("back", (0.8, 4.0, 1.2), 0.85), ("head", (0.35, -1.2, 1.6), 1.55),
                           ("feet", (0.7, -1.0, 0.25), 0.08)):
        cam.location = loc
        direction = Vector((0, 0, aim)) - Vector(loc)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUT, "render_" + name + ".png")
        bpy.ops.render.render(write_still=True)
print("DONE")
