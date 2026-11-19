# 3D Coach: review and phased plan

Written 2026-11-19 after opening the page in a browser for the first time.
Screenshots of the starting point are in `docs/screenshots/before/`
(sheets `sheet-1-pro.png`, `sheet-2-sample.png`, `sheet-3-video.png`).

## What looks wrong (seen in the browser)

**The pro alone (screenshots 1-6)**
- It looks like a wooden drawing mannequin: grey balls at every joint,
  plain tubes for limbs, a box for each skate. No chest, no hips, no
  hockey pants, no gloves worth the name. The helmet is a half ball.
- The "lean" angle is drawn as a grey fin sticking out of the back.
- From the front the shoulders are a flat bar, the legs are two posts
  and the knee bend cannot be seen at all.
- From the top the name, lean and knee signs pile on top of each other.
- During "Play stride" the skater stays on one spot. The glide leg never
  moves, the hips never shift over it, the skate never tilts onto an
  edge, the free arm never swings. The push leg just swings out and back
  like a gate. It reads as a robot doing leg lifts, not skating.

**Sample session and Overlay (screenshots 7-10)**
- Both skaters are small in the frame and their signs are tiny.
- The orange skater is a white ball head on orange tubes with big yellow
  balls on the graded joints. It has no stick.
- Overlay is hard to read: the orange skater is solid and sits in front,
  so the see-through blue pro is mostly hidden. The "YOU" sign is cut off
  at the top.
- The ice is blown-out white with a hard edge into a black void. No
  boards, no glass. One light, so every shape looks flat.

**Real video (screenshots 11-18)**
- The 2D skeleton on the video sits on the right skater at the start.
  That part works.
- The orange 3D skater is broken. At 1.4 s it is crumpled into a ball.
  Measured over all 120 kept frames: the thigh changes length from
  0.12 m to 0.47 m (it should never change), and one ankle jumps 0.53 m
  between two frames 0.1 s apart. Skates float and slide.
- After the camera cut at about 10 s, the tracker grabs the legs of a
  different kid standing at the net, and those frames go into the report.
- The test clip is mostly filmed from behind and from the front, with the
  skater small and far away at times. Even a perfect pose model would
  give rough angles from this clip. The report's numbers (knee 113°,
  "very deep bend") should not be trusted.

## Ranking: what hurts most

1. **(c) The kid's 3D pose.** This is the whole point of the app, and
   right now it is wrong: bones stretch, the body crumples, feet jump,
   and the wrong kid gets graded after a camera cut. Every grade and tip
   comes from this data. A prettier skater drawn from bad data is still
   wrong.
2. **(a) The skater model.** It is the first thing anyone sees, in every
   screenshot, and it is what makes the page look like a toy. It hurts
   the presentation more than anything else.
3. **(b) The pro's motion.** It teaches the wrong picture of skating
   (no weight shift, no edges, no travel). It only shows while playing,
   so it ranks just below the model, but a better body will make the
   robot motion even more obvious, so it must follow right after.
4. **(d) Rink, lighting, camera.** The washed-out ice and black void look
   cheap, and the camera frames the skaters too small, but this is the
   easiest to fix and does not make anything wrong.

## Phases

Each phase ends the same way: all four tests pass (plus new ones), the
Positioning tab still works, screenshots go in `docs/screenshots/<phase>/`
next to the matching "before" shots, and I look at them before calling
the phase done. Small commits on `3d-coach`, no push.

### Phase 0: Ground rules and baseline (done)

- Rules saved to `CLAUDE.md`.
- Baseline screenshots in `docs/screenshots/before/`.
- Test video copied to `local-videos/` (ignored by git).

### Phase 1: Trustworthy kid pose (area c) (done, option 1A)

Results on the test clip (same click, skater in black at 1.0 s).
"Per step" means between two frames 0.05 s apart.

| Measure | Before | After |
|---|---|---|
| Thigh length over the clip | 0.12 to 0.47 m | one fixed length |
| Left and right thigh | different | the same |
| Skates on the ice | floating, sliding | one skate always on the ice, flat |
| Knee angle change per step | 14.6° | 6.9° |
| Lean change per step | 6.6° | 2.7° |
| Steps with a skate jumping over 25 cm | about 15 | 4 (all next to gaps in the tracking) |
| Frames from the wrong kid after the camera swing | yes (from 10.1 s on) | none, stops at 10.1 s |
| Frames with the skater cut off by the picture edge | measured | skipped (5) |
| Pose model | full | heavy (full and lite as backups) |

Knee bend and lean now come from the flat picture when the skater is
seen from the side (37 of 112 frames in this clip). The report says so,
and the signs on the 3D skater show the same numbers as the cards.
Screenshots: `docs/screenshots/phase1/sheet-phase1-before-after.png`.

What is still rough: this clip is mostly filmed from behind and in
front, so the 3D depth guess is weak, and the frames around gaps in the
tracking still jump. A side-view clip is the next big improvement.

**Option 1A: Keep MediaPipe, clean up the numbers properly (recommended)**
- Switch to the `pose_landmarker_heavy` model (Apache 2.0, about 30 MB,
  same library we already use), keeping `full` as the fallback.
- Stop at camera cuts: compare each picture with the last one, and if
  the whole picture changed, end the track there instead of guessing.
- Fixed bone lengths: measure each bone's typical (median) length over
  the clip, then rebuild every pose from the hips outward with those
  lengths, keeping each bone's direction.
- A proper smoothing filter: because we have the whole clip before we
  draw anything, we can smooth forward and backward (a two-pass
  smoother, weighted by how sure the AI was about each joint). This
  beats the current "middle of 3" filter and does not lag behind.
- Skates on the ice: find which skate carries the weight (the lower,
  slower one), put it exactly on the ice, and keep the other skate on
  the ice while it is pushing.
- Angles from the flat picture when filmed from the side: MediaPipe's
  2D points are more accurate than its guessed depth, so side-view
  knee and lean angles should come from the 2D points.
- New tests: noisy fake poses get smoother, bones keep their length,
  skates touch the ice, a fake camera cut ends the track.
- Trade-offs: no new libraries, same privacy, small extra download.
  Still one camera, so the depth (side-to-side push) stays rough.

**Option 1B: A stronger pose model**
- Run a newer model (for example RTMPose or a 2D-to-3D "lifting"
  model) in the browser with ONNX Runtime Web.
- Trade-offs: better joints, but 50-200 MB downloads, needs a fast
  graphics chip, more code a parent cannot easily read aloud, and each
  model's license must be checked (some research models are
  non-commercial only). Still needs all of 1A's clean-up anyway.

Recommendation: **1A**. Measure the improvement on the test video with
the same numbers used above (bone length range, biggest ankle jump).
Only reach for 1B if the cleaned-up result is still not good enough.

### Phase 2: A skater that looks like a hockey player (area a) (done, option 2B)

The skater is now built in code from shaped pieces: a jersey and hockey
pants that stretch and twist with the body (stacks of rounded rings),
padded shoulders, sleeves, elbow pads, gloves with cuffs, socks over
shin pads, a helmet with ear guards and a wire cage, skates with a boot,
white holder and steel blade, and a stick with a taped blade lying flat
on the ice. Jerseys have hem stripes and a number on the back. The grey
joint balls are gone; graded joints get a green, yellow or red ring.
No outside files, so double-clicking index.html still works.
Screenshots: `docs/screenshots/phase2/sheet-phase2-before-after.png` and
`sheet-phase2-closeups.png`.

Left for later phases: the motion is still the old robot stride
(Phase 3), and Overlay still hides the pro behind the solid orange
skater, and the lean sign still looks like a grey fin (Phase 4).

**Option 2A: Rigged humanoid model, joints retargeted to bones**
- Candidate: one of the teen-proportion bodies from Quaternius
  "Universal Base Characters" (CC0, glTF, humanoid rig,
  https://quaternius.com/packs/universalbasecharacters.html).
  Backup: a kid-proportioned body exported from MakeHuman (exports from
  the official build are CC0; check the exact license file before use).
- Turn our joint positions into bone rotations each frame, then add
  hockey gear on top (helmet with cage, gloves, pants, skates).
- Trade-offs: the most realistic body and smooth elbows and knees.
  But: needs a three.js upgrade (GLTFLoader), a 1-3 MB model file,
  a model file cannot be loaded when index.html is double-clicked
  (it would have to be packed into a .js file or the page served),
  the retargeting math is the riskiest new code, and Quaternius's
  game style can drift toward the "toy" look we want to avoid.

**Option 2B: A much better procedural model built in code (recommended)**
- Shaped body parts instead of balls and tubes: tapered limbs, a real
  chest and hips, hockey pants, padded shoulders under the jersey,
  numbered jersey, helmet with cage, gloves, skate boots with holder and
  blade, a proper stick. No joint balls; graded joints get a colored
  ring instead.
- Built on a "bone frame" for each body part (which way it points and
  which way it is turned). That same layer is exactly what a rigged
  model would need, so if the team wants 2A later, Phase 2 work is not
  wasted.
- Trade-offs: no outside asset, no license, works when double-clicked,
  kids can read how it is built. Looks like a clean broadcast-graphics
  athlete rather than a photo-real person. Hockey gear covers most of
  the body, which plays to this option's strengths.

Recommendation: **2B**, then decide with the team from screenshots
whether 2A is worth it.

### Phase 3: A pro who actually skates (area b) (done, option 3B)

The pro now skates from keyframes in `js/stride.js`: touchdown under
the body, glide with the hips sliding over the skate, push out to the
side and back to the exact "push" angle while the skate rolls onto its
inside edge, then a low recovery. Both skates are on the ice 20% of the
time (studies of full-speed skating find 15-25%). Each skate is turned
to point the way it moves over the ice, so it never skids sideways. The
free arm swings opposite to the pushing leg, the top hand stays on a
stick that never changes length, and the ice slides under the skaters
like a treadmill. It still keeps step with the kid's strides.
Tests: `tests/stride.test.js` (14 checks). Screenshots:
`docs/screenshots/phase3/`.

Still estimates: the stride width, push direction, edge angles and arm
swing are our best guesses, not measured. Phase 5 should check them
against a real skater.

**Option 3A: Real skater's stride from video**
- Film (or find, free to use) a strong skater from the side, run it
  through our own Phase 1 pipeline, average 6-10 strides into one clean
  loop, and save it as looping keyframes.
- Trade-offs: a great science story ("we measured a real skater") and
  real timing. But it needs a good video we are allowed to use, and one
  side camera barely sees the most important hockey motion (the push out
  to the side), so that part would still be guessed. It also inherits
  every weakness of our pose pipeline.

**Option 3B: Hand-authored keyframes based on skating biomechanics (recommended)**
- Write one stride cycle as a small keyframe file (`pro-stride.json`):
  knee, hip and ankle angles, how far the hips shift over the glide
  skate, how much each skate tilts onto its edge, how the shoulders turn
  and the free arm swings, at about 8 moments of the stride.
- The pro travels forward on the ice. The glide skate slides under the
  body; the push skate holds its line on the ice and is left behind,
  then recovers under the hips. Weight moves from leg to leg.
- Base the numbers on published skating studies (starting with Upjohn,
  Turcotte, Pearsall and Loh, 2008, "Three-dimensional kinematics of the
  lower limbs during forward ice hockey skating", Sports Biomechanics),
  and list them in `SOURCES.md`.
- Tests: bones keep their length, the skate on the ice never sinks or
  slides sideways while pushing, the loop joins up with no jump, and the
  pro still shows the target knee and lean angles.
- Trade-offs: clean, controllable, matches the targets exactly, no
  video needed. But it is only as good as our reading of the studies.

Recommendation: **3B now**, and use 3A as a check in Phase 5 when a good
video exists.

### Phase 4: Rink, lighting and camera (area d) (done, option 4B)

three.js moved from r128 to 0.187.0 (pinned), loaded as a module and
handed to our files, so double-clicking index.html still works. Colors
are handled correctly and a camera-like "exposure" (tone mapping) keeps
the white ice from blowing out. Soft light from all around, one main
arena light with soft shadows, and a cool light from behind that
outlines the skaters. The rink is now center ice at real size
(30 x 15 m) with lines painted under the ice, skate scratches, white
boards with a yellow kick plate and dark rail, and glass on posts.
The camera works out how far back to stand so both skaters and their
signs fit; Side is a true side view, and in Front view the skaters
stand next to each other instead of one behind the other. Overlay draws
the pro as a see-through blue outline on top of the kid. Angle slices
have sharp outlines and show through the body. The ice slides only as
far as the stride moves, so it stops when the replay is paused.
Screenshots: `docs/screenshots/phase4/sheet-phase4-before-after.png`.

**Option 4A: Stay on three.js r128 and improve what is there**
- Add boards and glass, an arena that fades into the dark, a few
  overhead lights, and a less blinding ice color. Fix camera framing.
- Trade-offs: lowest risk, but r128's old color handling is part of why
  the ice looks blown out.

**Option 4B: Upgrade to a current three.js (recommended)**
- Load current three.js from the CDN as a module and hand it to our
  existing files, so the rest of the code barely changes.
- Correct color handling and tone mapping (fixes the blown-out ice),
  soft image-based lighting, soft shadows, subtle ice reflections,
  boards and glass, a dim arena around the rink.
- Camera: a true side view, framing that keeps both skaters large,
  and the camera follows the travelling pro.
- Overlay mode fixed so both skaters can be seen (both see-through, or
  the pro as a clean outline) and signs never get cut off.
- Trade-offs: some care to keep double-click working and keep the
  Positioning tab untouched. Pin the version so it never changes on us.

Recommendation: **4B**. If a quick win is wanted earlier, the ice color
and camera framing can move into Phase 2.

### Phase 6: A realistic skater model (done)

The skaters are now a real 3D model with a skeleton, built by a script
in Blender (`tools/blender/build_skater.py`): an athletic body from
MPFB2 (CC0), and gear made around it (baggy jersey over shoulder and
elbow pads, padded pants, socks over shin pads with stripes, padded
gloves with finger rolls, helmet with cage, eyes, neck guard, skates
with a tall boot, white holder and steel). About 46,500 triangles,
1.8 MB, packed into `js/skater-model.js` so double-click still works.
`js/retarget.js` turns the bones every frame so the model takes our
pose (tested: bones point exactly where the pose says, knees never
flip). The page tints jersey and socks per team and adds a knit
texture. Runs at about 120 frames per second with two skaters on an
M3 Mac. If the model cannot load, the page falls back to the Phase 2
skater. Soft contact shadows were tried and removed: barely visible
and three times slower.
Screenshots: `docs/screenshots/phase6/`.

Honest limits: this is not a console game. No scanned face, no cloth
simulation, no hand-painted textures; the face is plain and the pants
are a little rounder than real hockey pants.

### Phase 5: Check the pro against a real skater (needs a video)

- Run a good side-view video of a strong skater through the Phase 1
  pipeline, build the averaged stride loop (option 3A), and compare it
  with the hand-made keyframes. Adjust the keyframes where they disagree,
  and show the comparison as part of the science-fair story.

## What I need from you

1. **The real repository.** There was no git history on this computer,
   only the zip copies in Downloads. I made a new local repo here with an
   import commit and the `3d-coach` branch. If the GitHub repo
   (`YiyunDS/ai-sports-coach`) has its own `3d-coach` history, tell me
   where a clone is (or sign in with `gh auth login`) so these commits
   can be moved onto it before anything is pushed.
2. **A better kid video.** Phone on a tripod (no panning if possible),
   filmed from the side, skater crossing the frame for 5-10 strides,
   taking up at least a third of the picture height, no cuts, good
   light, 60 frames per second if the phone allows. A second clip from
   straight behind helps check the push out to the side.
3. **A pro reference video** for Phase 5: an older player or coach
   filmed the same way, with their permission (and a parent's, if a
   minor). I can also search for CC-licensed footage, but good
   side-view skating clips with an open license are rare.
4. **Your picks** on the options above (my recommendations are 1A, 2B,
   3B, 4B).
5. **Must double-clicking `index.html` keep working?** If yes, that
   strongly favors 2B over a rigged model.
