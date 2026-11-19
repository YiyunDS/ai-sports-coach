# =====================================================================
#  pack_model.py  --  PUTS THE 3D MODEL INSIDE A JAVASCRIPT FILE
#
#  When you open index.html by double-clicking it, the browser will not
#  let the page read other files from your computer (like skater.glb).
#  But it does let the page run .js files. So we turn the model into a
#  long line of letters ("base64") inside js/skater-model.js.
#
#  Run it after rebuilding the model:
#    python3 tools/pack_model.py
# =====================================================================
import base64, os

here = os.path.dirname(os.path.abspath(__file__))
project = os.path.dirname(here)
glb = os.path.join(project, "assets", "skater.glb")
out = os.path.join(project, "js", "skater-model.js")

with open(glb, "rb") as f:
    data = base64.b64encode(f.read()).decode("ascii")

with open(out, "w") as f:
    f.write("// skater-model.js -- the 3D hockey player (assets/skater.glb) packed as text.\n")
    f.write("// Made by tools/pack_model.py. Do not edit by hand.\n")
    f.write("window.SKATER_GLB = \"" + data + "\";\n")
print("wrote", out, os.path.getsize(out), "bytes")
