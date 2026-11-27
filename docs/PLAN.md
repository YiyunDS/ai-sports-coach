# 3D Coach: review and phased plan

Written 2026-11-19 after opening the page in a browser for the first time.
Screenshots of the starting point are in `docs/screenshots/before/`
(sheets `sheet-1-pro.png`, `sheet-2-sample.png`; `sheet-3-video.png` shows
the real video, so it is kept only on this computer in
`local-videos/screenshots/`).

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
Screenshots: `local-videos/screenshots/phase1/sheet-phase1-before-after.png`
(it shows the real video, so it stays on this computer).

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

### Phase 7: Polishing the model (done)

- Helmet rebuilt to fit the measured head: comes down to the eyebrows in
  front and over the ears and neck behind, with a raised strip on top, a
  small brim, air vents and ear covers.
- Cage curves around the face from the brim to under the chin, with a
  chin cup and side clips.
- Face: eyes with iris and pupil, eyebrows, lips and short dark hair.
- Jersey: longer (hangs over the pants to the hips), looser at the
  waist, a shoulder panel in the trim color with a white line, a number
  on the back (14 for the pro, 7 for you).
- Stripes and the shoulder panel are drawn by the page's paint program
  from two "rulers" stored in the model, so their edges are sharp.
- Pants: smoother and wider at the bottom of each leg.
- Skates: white laces and a shiny toe cap.
About 62,000 triangles, 2.3 MB. Still about 120 frames per second.
Screenshots: `docs/screenshots/phase7/`.

### Phase 8: Review fixes, and getting ready to measure a pro

An independent code review plus a look at the page on a phone found
these. Fixed (each checked in the browser or by a test):
- Knee bend was "the more bent knee", so it sometimes read the folded
  push leg. It is now always the standing leg (from the stride rhythm).
- The push number was the straightest knee seen anywhere, so a skater
  who only glided got "full extension". It now comes from real pushes;
  with none, the card says "Not seen".
- The summary mixed side-view and rough frames. With 8 or more side-view
  frames it now uses only those; the rest are dimmed in the replay bar.
- A fully straight push leg (179-180°) was graded yellow. Now on target.
- Moments next to a push showed their own grade, not the push's.
- A lifted skate was pressed onto the ice by stretching the leg, which
  made pushes look fuller. Now it is only pressed down if that takes
  less than 1.5 cm of stretch.
- Choosing a new video kept the old report; the sample session left a
  video replay running; replay controls were live during analysis;
  changing age mid-replay made the video jump; quick timeline drags
  could leave the video on the wrong frame.
- Any window resize reset the camera; switching Side/Front moved
  skaters the user had dragged.
- The sample skater moved with the old robot formula; it now uses the
  real stride. Skaters who stand tall keep their skates on the ice.
- New: "Loading the 3D skaters..." message, an "Angles" switch, the
  Compare bar under the 3D view on phones, the camera stays inside the
  rink, the 3D view pauses on the Positioning tab.
- Positioning: pressing Check again no longer inflates the score.
- README and tips corrected (20 pictures per second, button names).
On our test clip the report changed from knee 114° ("very deep bend")
to 139° (on target), because it now reads the standing leg in the
side-view frames.

Not done, on purpose or for later: a stick for the orange skater,
"Save picture", the timeline redraw and sign-texture costs, picking the
skater with the keyboard, small rink labels on phones, unused exports.

Ready for the pro: `js/measure.js` (tested) cuts a clip into pushes,
drops broken ones, and reports each number with its spread. Open the
page with `?dev` for a "Copy stride measurements" button. Waiting for
the clip in `local-videos/` (see CLAUDE.md for the rule on NHL footage).

### Phase 9: The pro's angles measured from Connor McDavid (done, in part)

- Looked at the NHL's 2024 Fastest Skater video: the camera cuts every
  second or two and never shows him side-on for long. Not usable.
- Found a slow-motion ice-level shot (17 s) in a stride-breakdown video
  and ran it through our coach in measuring mode. 436 of 899 pictures
  were clear enough; four pushes could be read.
- Measured: pushing knee 163° (160-165), standing knee 97° (91-105).
  `targets.json` pro ranges are now 158-168 and 90-105 (they were the
  guesses 165-178 and 105-115). The blue pro stands deeper and pushes a
  little less straight than before.
- Not measurable from this clip: lean (readings jump with the camera
  angle), real timing (slow motion), side push, edges, arm swing. The
  stride keyframes in `js/stride.js` are unchanged and still estimates.
- Noticed, not copied yet: his push leg stays nearly straight for about
  a fifth of the stride; our model's for about a twentieth. Matching it
  needs a rethink of the foot path so the skate still does not skid.
- Numbers only in the repo: `data/pro-stride-measured.json`. The videos
  are in `local-videos/` (ignored by git).
Still wanted: a true side-on clip and one from behind (Phase 5).

### Phase 10: The stride reworked around the measured push (done)

- `js/stride.js` no longer stores where the skate is. It stores how
  straight the leg is at each moment (`extend`) and which way the skate
  is from the hip (`direction`); the foot position is worked out from
  those, so knee angles are exact at every moment, for deep and tall
  skaters alike.
- The leg now does most of its straightening early in the push and then
  rides almost straight. With McDavid's angles the push knee is above
  155° for 13% of the stride (before: 4%; measured on him: 9-20%).
- The standing knee is deepest just after landing, and the hips are
  already over the standing skate when the other skate lifts off.
- Skates still only slide along their blades. New tests: the skate
  never points more than 5° inward or more than 50° outward, never
  nearly stops, the knee follows the keyframes exactly, and the
  "almost straight" share stays in McDavid's measured range.
- The ice now slides 3.0 m per stride (was 2.2), which keeps the skate
  angles realistic.
Chart: `docs/screenshots/phase10/push-knee-curve.png`.
Still estimates: when exactly the leg straightens, the push direction,
edges, arm swing and real timing.

### Phase 11: The orange skater shows only the useful moments (done)

The team leader's note: replaying every moment of the video in 3D looks
very weird. On the test clip the old replay showed 102 moments, and most
of them were the skater far away, seen from the front or from behind,
where the 3D guess is poor (twisted, upright, even kneeling), with the
figure frozen through every hole.

- New rule `usefulFrames` in `js/angles.js` (8 tests in
  `tests/cleanup.test.js`). A moment is kept when: the pose is possible;
  the skater is seen from the side; no knee or ankle "teleports"; it is
  part of at least 5 moments in a row with at most one picture missing;
  and there is a real push in that run (skates at least two thirds of a
  leg length apart). If that leaves fewer than 8 moments the rules are
  relaxed one at a time, and the page says which were used.
- `js/coach.js`: a real video's report and replay use only those
  moments, and the clean-up runs again on them alone, so left-out
  moments cannot pull on the ones we keep. The replay (and the video)
  jumps over a hole instead of freezing; the replay bar shows a dark
  line at each jump. The sample session and measuring mode (`?dev`) are
  unchanged.
- Test clip: 21 of 102 moments are kept, in 2 pieces (2.05-2.55 s and
  2.90-3.45 s): the two pushes filmed from the side. All three cards
  now read on target (knee 140°, lean 28°, push 179°).
Before / after: `docs/screenshots/phase11/`.
Pictures that show the real video (13 so far, from the baseline and
phases 1, 8 and 11) were taken out of the repo before the first push
to GitHub. They are in `local-videos/screenshots/` on this computer.
Limits: the replay of this clip is now short (about 1 second of
skating). The first moment of the second piece (2.90 s) still stands a
little too upright. A beginner whose pushes are all tiny gets every
side-view moment (the push rule is dropped), and the note says so.

### Phase 12: A simulation game on the whole rink (done, first version)

The team leader's idea: keep the Positioning tab as it is, and add a new
game where the play keeps going. You pick how it starts; with the puck
you choose to pass or stickhandle; then the simulation plays it out with
chances, like real hockey (a pass to the other defense can end in a goal
for us, or in a missed shot, a rebound and a rush at our net).

- `js/gamesim.js` (rules, no drawing; 21 tests in
  `tests/gamesim.test.js`): a shift is played in beats; in every beat
  one thing happens to the puck. A playbook for any puck position (five
  patterns are the Positioning tab's own, plus the rush, backcheck,
  forecheck and two more), mirrored for the right side and for the other
  team. Chances for passes (distance, a defender in the lane, across our
  own slot), stickhandling (how close the nearest defender is), shots
  (distance, angle, screen) and loose pucks (who is closer). Offside is
  called. Dice with a seed, so tests replay thousands of shifts.
- `js/game.js` + a third tab "Game": the whole rink from above (lying
  down on a wide screen, standing up on a phone), score, choices with
  their chances, drag your marker within how far you can skate, "Call
  for a pass", spot feedback with the job tip, "Show my best spot" hint,
  play-by-play, animated puck and skaters.
- Checked by playing thousands of shifts: starting at their blue line we
  score in about 20% of shifts and they in about 1%; from a center
  faceoff about 5% each. A player who never gets to the right spot gives
  up about twice as many goals; one who always stickhandles scores far
  less.
Pictures: `docs/screenshots/phase12/`.
Limits: all chances are our own estimates, not measured. You have the
puck only about twice per shift unless you call for it. Most shifts end
with a line change, not a whistle. No goalies to control, no penalties,
no icing, no line changes on the fly. On a phone the markers are small.

### Phase 13 and 14: plan (phone-friendly app, and a referee game)

The team leader asked for another educational hockey game, researched
by us, and for the whole app to work well on a phone.

What the research said (links in `SOURCES.md`):
- USA Hockey, 12U and younger: IMMEDIATE offside (no "tag-up"). What
  counts is where the skates and the puck are when the puck completely
  crosses the blue line; the stick does not count.
- USA Hockey icing: the puck is shot from the shooter's own half
  (the center red line splits the rink), crosses the far goal line
  untouched, and is not a goal. Icing is immediate (no race). No icing
  when an opponent other than the goalie could have played it. At 14U
  and younger a shorthanded team is NOT allowed to ice the puck (in the
  NHL it is).
- The NHL's own school game (Future Goals "Hockey Scholar", grades 4-7)
  teaches with short interactive rounds and instant feedback.
- Phones: touch targets should be about 44 px or bigger (Apple 44 pt,
  Android 48 dp, WCAG 2.5.5 says 44 px, 2.5.8 says 24 px at least).

Two ideas were compared:
- A. "You make the call": watch a short play, then be the referee:
  offside, icing, or a good play? Teaches the two rules new players
  find hardest. Tap-only, so it suits a phone. CHOSEN.
- B. "Cut the angle": be the goalie and learn with geometry why goalies
  come out of the net. Good math, kept as the next idea.

Phase 13, phone-friendly (every tab):
1. Every button, chooser and tab at least 44 px tall on touch screens.
2. The tab bar never wraps or pushes the page sideways.
3. Game tab: "Your move" becomes a sheet fixed to the bottom of the
   screen, choices two to a row, so rink and buttons are seen together.
4. The same bottom sheet for the new game's answer buttons.
5. Check all tabs at 375 px wide, with screenshots.

Phase 14, the referee game "You make the call":
1. `js/refplays.js`: makes plays (who skates where, where the puck
   goes) and judges them straight from the rules, with tests that the
   judge agrees with what each play was built to show.
2. `js/rink.js`: one rink drawing shared by the Game and the new tab.
3. `js/ref.js` + a fourth tab: watch the play, pick Offside / Icing /
   Good play, then see the frozen key moment (zoomed in on the skates
   and the line) with the reason. Three levels, score and streak.
4. Play it on a phone-size and a desktop-size screen, screenshots,
   docs, small commits.

### Phase 13: Phone-friendly (done)

- Everything you tap is at least 44 px tall on touch screens; a double
  tap no longer zooms.
- The four tabs stay on one line (swipe sideways if needed).
- Game and Referee tabs: the rink stands up and "Your move" is a sheet
  fixed to the bottom, choices two to a row. In the Game the picture
  shows the 120 feet of ice around the play and follows the puck, so the
  markers are finger-sized (first try without that: markers were tiny).
- Form analysis: on a phone the two skaters start 1.5 m apart, so both
  fit in the narrow picture.
- Checked at 375 x 812: no sideways scrolling on any tab, no button or
  chooser under 44 px. Pictures: `docs/screenshots/phase13/`.
Limits: checked in a phone-size browser window on the computer, not on
a real phone. The Form analysis page is long on a phone (the report is
far down).

### Phase 14: "You make the call", the referee game (done, first version)

- `js/refplays.js`: 10 kinds of play (carry or pass over the blue line,
  onside or offside; long shots that are icing, a dump-in, touched,
  stopped short, a goal, shorthanded) at 3 levels, and a judge that
  makes the call only from the skates, the puck and who touched it.
  10 tests in `tests/refplays.test.js`; the judge agrees with 9,000
  built plays.
- `js/rink.js`: one rink drawing for the Game and the Referee tab (it
  can stand up, show a part of the rink, and zoom in).
- `js/ref.js` + fourth tab "Referee": watch, tap Offside / Icing / Good
  play, see the frozen key moment (offside: zoomed in on the skates and
  the lit-up edge of the blue line; icing: the puck's path from where it
  was shot, the red line and the goal line), read why. Score, streak,
  three levels, watch again.
Pictures: `docs/screenshots/phase14/`.
Limits: two rules only (no penalties yet). The plays are simple
straight-line skating. Two rule details are left out because we could
not confirm the exact wording (see `SOURCES.md`). A coach or referee
should read the explanations once.
Next idea: "Cut the angle", a goalie geometry game (idea B above).

### Phase 15: The orange skater skates YOUR stride, rebuilt smoothly (done, first version)

The team leader's note: the orange 3D skater still looks bad, because
not every picture is captured well. Idea: use the pictures we did
capture to work out how the skater skates, let a smooth 3D skater skate
that way, and compare THAT with the pro.

Why this is right: the AI reads every picture on its own, so one picture
is wobbly. The middle value of many pictures is trustworthy. It is the
same method we use to measure the pro (`js/measure.js`).

- New `js/rebuild.js` (13 tests in `tests/rebuild.test.js`):
  - THE CLOCK: the moments the skater changes legs give a steady stride
    clock for the whole clip (one change = half a stride). Flickers and
    holes are handled; the clock never runs backward. We find where a
    leg change sits in the model's stride by watching the model with the
    same leg-change finder.
  - THE NUMBERS: around every moment, the middle value of knee bend and
    lean over one stride, and of the nearest pushes. Left and right push
    are shown apart only when each was seen twice and they differ by 4
    degrees or more. If you stand taller near the end, it shows.
  - THE SKATER: `makeStridePose` (the pro's stride builder) with those
    numbers, on the same clock as the pro.
- `js/scene.js`: one shared stride clock; the orange skater is drawn
  right after the pro at the same moment. No elbow signs on the rebuilt
  skater (its arms are not measured).
- `js/coach.js` + page: a switch "Smooth stride | As filmed" under the
  3D picture, and a line in the report that says in words what the
  orange skater is showing and what is not measured. When the replay
  ends, both skaters keep striding (a loop) with the report's numbers;
  the button on the 3D picture starts and stops the loop.
- Fallbacks: numbers but no rhythm (fewer than two leg changes) -> the
  skater strides at an even, standard pace, lined up with the top of a
  push we did see, and the note says so. No full push in the clip ->
  knee bend and lean are still the skater's, the push is drawn at the
  low end of the goal for the age and the note says it is NOT measured
  (no push sign). Fewer than 3 pictures -> only "As filmed".
- Fix after the first try by the team leader ("after analysis the two
  skaters are not moving at all"). I could not make it freeze with four
  different clicks and window sizes, but I closed every way I found
  that leaves both skaters standing still:
  1. "No full push seen" used to switch to "As filmed", which stops
     after the short replay. Now the stride is rebuilt anyway (above).
  2. An old copy of one script kept by the browser next to new copies
     of the others gives the old behavior. Every file's address now
     ends in a version number (`VERSION` in `index.html`).
  3. Clicking the video, moving the video's frame slider, changing the
     age or level, or switching back to "Smooth stride" stopped the
     skaters. Now they keep striding.

Checked on the test clip (headless Chrome, 1280 x 800; 20 useful
pictures in 2 pieces, 2.2 to 3.45 s):
- Rebuilt with knee 131, lean 27, push 180 (the report's numbers).
- Only one push is seen in those 20 pictures, so the rhythm is NOT
  found: this clip uses the even, standard pace.
- Smoothness, drawn 60 times a second: the biggest jump of a knee, an
  ankle or the neck between two drawn pictures went from 8.4 cm (As
  filmed) to 3.0 cm (Smooth stride); the usual jump from 1.85 cm to
  0.41 cm; the right knee changed direction 8 times before, 1 time now.
Pictures (3D view only): `docs/screenshots/phase15/`. Pictures that
show the video are in `local-videos/screenshots/phase15/`.

Limits, stated plainly:
- Smooth stride is a MODEL of how you skate, not a recording. A
  one-time stumble does not show. That is what "As filmed" is for.
- Yours: knee bend, lean, push length, rhythm (when found), left and
  right push (when both are clear). Not yours: the arms, the stick, how
  the skates tip, and the timing inside one stride (when the push
  happens). Those are the pro's stride shape.
- The test clip is too short to find a rhythm, so its smooth skater
  strides at the standard pace of 2 seconds per stride, which is slower
  than a real kid. A longer side-view clip (3 or more pushes in a row)
  is needed to see the rhythm part work on a real video; so far it is
  proven only on built clips in the tests.
- The push number of this clip (180) is as straight as a leg can be;
  the clean-up may be forcing it. The rebuilt skater copies the report,
  so it shows the same thing.
- Checked in a phone-size browser window, not on a real phone.

### Phase 16: A report you read at a glance, and a page that moves (done, first version)

The team leader's note: the page works, but it does not pull you in. We
looked at how well-made tools do it (links in `SOURCES.md`). What they
agree on:

- A premium look comes from holding back: a near-black page, thin
  borders, one action color, and color used only when it means something.
- Movement is short. A press answers in about 120 ms, a switch in about
  200 ms, a panel in about 320 ms. Only ONE moment on the page may take
  longer (about 700 ms): ours is the report appearing.
- Things arrive fast and settle gently (one "ease-out" curve for the
  whole page). Nothing bounces.
- Things you do again and again (dragging the timeline) do not animate.
- Someone who turned on "reduce motion" on their device gets fades only.
- A report has three layers: one answer you see at a glance, then the
  numbers, then how they were measured.

What we found on our page: not one transition in `style.css`, and a
report that opens with five sentences while "1 of 3 on target" sits in
a corner.

**Step 1: the report in three layers**
1. The answer: a ring with "1 / 3 on target", and ONE thing to work on
   next (the number farthest from its target), plus what already goes
   well.
2. The numbers: the three cards, with a thicker ruler.
3. How it was measured: the long explanation, folded away. Anything
   that is NOT the skater's own (a standard push, a standard rhythm)
   stays in plain sight.

**Step 2: the report appears (the one long moment)**
The ring fills, the numbers count up, the ruler marks slide to their
place, the cards rise one after another. It plays when the report comes
into view, so on a phone you see it after scrolling down. When the age
or level changes, the numbers and marks glide to their new place.

**Step 3: one set of movements for the whole page**
Buttons press in. The line under the tabs and the lit part of every
switch slide. A tab's content fades in. Side / Front / Top glides the
camera instead of jumping. The score in the games gives a small pulse.

**Step 4: surfaces**
Softer borders, a faint light on top of each panel, a soft glow behind
the top of the page, quieter headings, bigger numbers.

Rules kept: no library and no server, phone first (375 px, 44 px
buttons), only `transform` and `opacity` move, all tests pass, new math
(which number to work on next, the count-up curve) gets tests.

**What was built**
- `js/ui.js` (new): the sliding light behind every switch and the line
  under the tabs, the counting numbers, "play it when it is seen", and
  the score's pulse. Its math is checked by `tests/ui.test.js` (5 tests).
- `M.nextFocus` in `js/angles.js` picks the one thing to work on next
  (a red number before a yellow one, then the most degrees to go), with
  a test in `tests/angles.test.js`.
- `js/coach.js`: the report's top block (ring, one headline, the other
  checks in a few words), cards whose numbers, marks and green goals
  glide, and the long explanation folded under "How the orange skater
  was made".
- `js/scene.js`: Side / Front / Top glides the camera around the
  skaters in 0.45 s; the skaters slide to their spots at the same time.
  Grabbing the camera or a skater stops the glide.
- `style.css`: the times and the curve in one place at the top, softer
  borders, light on top of the panels, a glow behind the top of the
  page, a new progress bar, and a "reduce motion" section.

**Checked** (sample session, desktop 1280 px and phone 375 px, in a
test browser; pictures in `docs/screenshots/phase16/`)
- The entrance waits until the report is on screen, then plays once:
  the ring fills, 60 -> 150 counts up, the marks slide, the cards rise
  about 0.07 s apart.
- A change of age or level: the headline, the ring and the green goals
  move to the new values; nothing re-enters.
- No push seen: the ring counts "of 2", the third card says "Not seen",
  and the line "the push is NOT yours" is in plain sight.
- All on target: a green ring and "All on target".
- "Reduce motion": the camera jumps, nothing slides or counts, the
  report fades in.
- Phone: no sideways scrolling on any of the four tabs, and nothing you
  tap is under 44 px.
- The real test clip (`local-videos/test.mp4`, skater in black at
  1.0 s): the report waits, makes its entrance, and the skaters keep
  striding. With a real video the long text about the video used to sit
  ABOVE the answer. Now only a real warning stays on top (the skater is
  too small, or was never seen from the side). The rest is folded under
  "How much of the video was used", and the line in plain sight says
  "rebuilt from 16 good pictures (of 99 the coach could read)".
- All 12 test files pass.

**Limits, said plainly**
- Checked in a test browser at phone size, not on a real phone.
- The entrance was measured in a slow test browser. How it FEELS at
  full speed has to be judged by eye on a real screen.
- The Positioning, Game and Referee tabs got the new surfaces, switches
  and pulses, but their layouts were not redesigned.
- At phone width the buttons on top of the 3D picture still take two
  rows (as before).

### Phase 17: A curve, cards that steer the 3D view, and a phone layout like an app (done, first version)

After Phase 16 the team leader asked which looks and which kinds of
movement fit the app, and then: build all eight suggested improvements.

**1. The replay is a curve.** The rows of red blocks were the loudest
thing on the page, louder than the answer. Now there is ONE line: the
angle in every picture, over a green band (the target for this age).
The line paints itself by its height: green inside the band, yellow a
little outside, red far outside. A switch picks Knee, Lean or Push.
Small marks along the bottom show the top of each push. For the push
leg the line is plain and only the tops are colored dots, because only
the top of a push is graded. Parts not seen from the side are faded, a
dotted line marks a jump. The line draws itself from left to right when
you first see it. Dragging along it scrubs, with no animation.

**2. The report steers the 3D skater.** Tap a card: the camera glides
close to that joint, its sign stays strong and the other signs fade,
and the curve shows that same number. Tap again (or Side, Front, Top,
or Reset) to see everything again. The signs now stand BESIDE their
joint as the camera sees it, joined by a thin line, and they are drawn
bigger when the camera is far away (on a phone they were too small to
read). Only three signs by default; the elbow signs are a choice in
the help box.

**3. Phone: the answer on the first screen.** The four tabs sit at the
bottom of the screen, each with a small picture we drew ourselves.
Once there is a report, the 3D picture gets smaller, goes from edge to
edge and STAYS at the top while you read. The report comes right under
it, before the settings. The tool bar shows only Side by side /
Overlay; "More" opens the rest. The help box is a sheet from the
bottom.

**4. A clear start.** A card on the 3D picture: "Use your video" and
"Try the sample". It goes away once you pick one. The "No session yet"
box is gone.

**5. A darker stage, one tool bar.** The arena is dark around the
edges, so the bright ice does not glare. Compare, You, Spacing and
Reset are ONE bar of dark glass, and it only appears when there are
two skaters. The camera leaves room for the bar and for the buttons
on top, so nothing covers the skaters.

**6. Loading that explains itself.** While the coach reads a video,
the page shows the four steps (getting the pose finder ready, finding
the skater, following the skater with a percent, measuring) and the
grey shape of the report to come. The Analyze button moved under the
video, where you just clicked the skater, and fills up like a bar.
When the report is ready it goes ABOVE the video.

**7. Game and Referee.** A scoreboard bar like on TV. In the Game the
puck leaves a thin line behind it, and the line stays (fainter) so you
can see what just happened. How a shift ended, and the referee's call,
are said like the top of the skating report: a small colored word,
then the sentence. In the Referee tab the Level switch moved above the
rink, so the answer sheet no longer covers it.

**8. A tidier side column.** "Reading the view" is now the "?" button
on the 3D picture.

Also from the list of movements: one soft green glow around the ring
when everything is on target (no confetti).

**New math, with tests**
- `js/chart.js` + `tests/chart.test.js` (7 tests): the chart's lowest
  and highest angle, how high an angle sits, which picture is under a
  finger, where the line is cut at a hole, and the paint of the line.
  The paint test checks every half degree against the report's own
  grades, and the pretend kid's 60 pictures one by one.
- `js/ui.js` + `tests/ui.test.js` (2 new tests): how far back the
  camera must sit to see a box, and how much bigger to draw a sign so
  it can be read.

**Checked** (in a test browser; before and after pictures in
`docs/screenshots/phase17/`)
- Sample session, desktop 1280 x 800 and phone 375 x 812: the ring and
  the headline are on the first screen without scrolling. Before, the
  phone showed the 3D picture and four rows of buttons, and the report
  started two screens down.
- Phone, all four tabs: no sideways scrolling, and nothing you tap is
  under 44 px (also the bottom tabs, the open tool bar and the help
  sheet). A tablet standing up (820 px): one tool bar row, three cards.
- The curve: 64 pictures, 5 push marks. Push view: a plain line with 5
  colored dots. A press at three quarters of its width goes to picture
  48 of 64, a drag back to one quarter to picture 14, the arrow keys
  step one picture, and after letting go it stops following the mouse.
  It waits closed until you scroll to it, then opens.
- Tap a card (or press Enter on it): the camera goes from about 6 m
  away to about 3 m, the card lights up, the curve switches to that number. A
  change of age keeps the card lit. Side, Front, Top or Reset end it.
- No push seen: the third card says "Not seen" and cannot be tapped,
  and the curve has no push marks. All on target: the green glow plays.
- "Reduce motion": the camera jumps, the curve is simply there, the
  start card and the help box only fade, the loading shape does not
  pulse, and the Game shows the puck's path without moving it.
- Game: the path grows behind the puck and stays after the beat; a
  shift that ended says "Whistle" and "The goalie froze the puck."
  Referee: the Level switch is above the rink; "Correct" and "The
  call: Good play".
- The real test clip (`local-videos/test.mp4`, skater in black at
  1.0 s), run on its own: the start card goes, the video comes under
  the 3D picture, the four steps light up one after another, the button
  fills, and the report lands above the video with the page back at
  the top. The numbers are the same as in Phase 16 (16 good pictures of
  99; 129, 30 and 179 degrees; 3 of 3 on target), so the measuring did
  not change. The curve shows one faded part, one jump and one push
  mark. (A first run next to four other test browsers gave 13 pictures:
  a busy computer makes the video skip, as it always could.)
- All 13 test files pass.

**Limits, said plainly**
- Checked in a test browser at phone size, not on a real phone. The
  sticky 3D picture, the bottom tabs and the bottom sheets are the
  parts most worth trying on a real one.
- How the movement FEELS at full speed has to be judged by eye.
- The curve shows one number at a time.
- The close look always goes to the side view, and on a narrow phone
  picture it shows the orange skater alone.
- With two skaters on a narrow phone picture the signs can still touch
  each other.
- The Positioning tab only got the bottom tabs. The line that draws
  itself to your best spot was not built.
- The glass blur needs a newer browser; an older one shows plain dark
  boxes instead.

### Phase 18: The page checked against the "unslop" list (done)

The team leader asked to improve the design with
https://github.com/heydamir/unslop (a list of the signs that make a
page look machine-made, and the order to fix them in), to use only the
parts that fit our project, and to make sure the phone is good too.
Its license is CC BY 4.0; it is credited in `SOURCES.md`.

**What the check found**

Unslop says to look first and decide how much to change. Our page was
mostly designed already (one accent color, no emojis, short movements,
a 3D picture that is clearly the main thing). So this is a POLISH: we
fixed what the list found and kept the colors, the letters, the layout
and the 3D picture. The signs we did find:

- Labels in CAPITALS with wide gaps between the letters, almost
  everywhere: 21 of them on the report alone.
- A wash of blue light behind the top of the page, shadows under every
  panel, a glow under the blue button, a glow around the card you
  tapped, and a green glow on the ring.
- The grade of a card was said three times: a colored top edge, a
  boxed badge and a dot. Result boxes and the Game's choices had a
  colored left edge.
- Spaces of 3, 5, 7, 9, 11, 13, 14, 18 and 26 pixels, and corners of
  3, 4, 5, 6, 7, 8, 10, 12 and 14, with no pattern.
- Twenty different sizes for words, many of them almost the same
  (13.1, 13.6, 13.8, 14.1, 14.4 and 14.7 pixels).
- Movement: the ruler's green part changed its real width (slow for a
  phone to draw), and two things pulsed while the coach worked.
- Words: "... GOAL!" and "We score!", and a result that said "Offside"
  twice.
- On the phone: letters smaller than 11 pixels (the ring's "on target"
  at 9.6, the words on the rinks at 4.6 to 8.4, the letters on the
  players at 5.4 to 9.8), and signs that covered each other when both
  skaters stood in the narrow 3D picture.

**The direction** (unslop asks for five lines before any change)

- Product: it measures a young hockey player's skating from a phone
  video and shows it in 3D next to a pro, with the one thing to
  practice next. For kids of 8 to 12 and the grown-up next to them.
- Character: exact, calm, rink-side.
- World: a rink at night with the lights on. White ice, dark stands,
  red and blue painted lines, the scoreboard over center ice.
- Moments (where the color and the light go): the 3D picture of the
  two skaters, and the curve of the replay over its green band.
- Signature: scoreboard letters. The narrow scoreboard type is used
  for what belongs to the rink (the scoreboard, the signs in the 3D
  picture, the words painted on the ice, our name) and for every
  number we measured. Everything else is written the normal way.

**What changed, in unslop's order**

1. Spaces. One ladder: 4, 8, 12, 16, 20, 24 (a step of 2 inside small
   buttons). Buttons, switches and choosers are all 36 pixels tall on a
   computer and 44 on a phone. The page's edges are 24 wide on a
   computer, 16 on a phone.
2. Color. The page is flat: no wash of light, no shadows under panels
   (a panel is one step lighter than the page, with a thin line). The
   blue button is plain blue. Nothing glows. A third text color was
   added for titles, so there are three: main, title, quiet.
3. Icons. Nothing to fix (one set of line pictures on the tabs).
4. Words. Goals are said plainly ("shoots and scores.", "We score.").
   The Game's result no longer repeats the small word above it. On a
   phone the Game's hint is one sentence shorter.
5. Letters. Normal case everywhere except on the rink (see the
   signature). Nine sizes for words instead of twenty: 11 or 12 for
   small marks, 13 for labels, 14 for notes, 15 for reading, 16 to 22
   for headlines. (The big scoreboard numbers keep their own sizes.)
   No tight letter spacing on small text.
6. Layout. Not changed.
7. Details. Three corner sizes: 8 for buttons, 12 for cards, 14 for
   panels (and 4 or 6 for the small parts inside a button). A grade is
   said ONCE, by a colored dot and a word ("Close",
   "On target"). The cards lost their colored top edge, the result
   boxes and the Game's choices their colored left edge. In the Game
   the dots stand in one column and the chances in another. The card
   you tapped has a plain blue edge.
8. Pictures. Not changed: the 3D picture is the product itself.
9. Movement. The ruler's green part now slides and stretches (the
   same cheap kind of movement as everything else). The grey shape of
   the report stands still while the coach works; only the dot of the
   step it is ON blinks, because that work is really going on. The
   green glow on the ring is gone. A score's pulse is smaller.

**What we did NOT take from unslop, and why**

- A generated picture for the top of the page, and the "story video"
  of the page fixing itself: those are for selling pages. Ours is a
  tool, and its picture is the 3D skater.
- An off-white main button: our blue already means "the pro" and "the
  next step", and one blue is easier for kids to follow.
- Removing the dark glass behind the buttons on the 3D picture: there
  the blur does a job. The skaters move behind the words, and the
  words must stay readable.
- No periods after short lines: our notes are whole sentences that
  kids read, so they keep their periods. Buttons and labels never had
  any.
- Normal case on the rink: a scoreboard is written in capitals, and
  in the small 3D signs capitals are easier to read.

**On the phone**

- No letters under 11 pixels, except the one or two letters on a
  player's marker in the Game (9.7). The ring's "on target" is 11, the
  tab names are 11, the words on the positioning rink are 11.7.
- A small picture is made SIMPLER, not just smaller. Next to your
  skater the pro shows only its name; its colored slices stay, and
  when you tap a card the pro's number for that joint appears beside
  yours. In the Referee tab the players are plain dots, a little
  bigger, with no letters, and "Blue attacks toward the top." is said
  in the line above the buttons instead of in tiny letters on the ice.
- The spacing slider and the line "Show my best spot" are now 44 tall
  like everything else you tap.
- The start card's headline is on one line again, so the card no
  longer covers the pro's skates.

**Checked**

- At 1280 by 800, 1440 by 900, 820 by 1180 and 375 by 812 in a test
  browser: no sideways scrolling on any tab, nothing you tap under 44
  pixels on the touch sizes, no page errors.
- The answer is still on the first screen: the bottom of the top block
  is at 702 of 800 on the computer and at 607 of 812 on the phone.
- The tool bar is one row at every size. Under 1340 wide it hides the
  words "Compare" and "You" to fit.
- In the Game on a phone the sheet with your choices is 309 tall and
  does not scroll while you play. At the end of a shift it can still
  need a small scroll to read the tip about your spot.
- "Reduce motion": the ruler's green part and mark are simply in
  place (no slide), the cards only fade in, and nothing blinks.
- The real test clip (`local-videos/test.mp4`, skater in black at
  1.0 s), run on its own three times: the video panel, the four steps,
  the button that fills up and the report all work with the new look,
  with no errors, and the answer is the same (3 of 3 on target). But
  the numbers moved a little: 20 good pictures instead of 16, and 131,
  27 and 180 degrees instead of 129, 30 and 179. Last phase's page,
  run the same way on the same day, still gives 16 pictures and 129,
  30, 179. None of the measuring files changed (`angles.js`,
  `tracker.js`, `measure.js`, `rebuild.js`, `stride.js`,
  `retarget.js`), so the measuring itself is the same. What changed is
  the page around it: it draws less while the coach reads the video.
  We counted the video's jumps on the new page: 202 jumps, every one
  finished, the slowest in 1.8 seconds (the coach waits at most 2).
  Our best explanation, not proven: on the old, busier page a few
  jumps ran out of time in the slow test browser, and the coach read
  the wrong picture there.
- All 13 test files pass. No new math was needed.

**Limits, said plainly**

- Still not tried on a real phone.
- The real clip's numbers in the test browser depended on how busy
  the page is (see above). The slowest jump of the video took 1.8 of
  the 2 seconds the coach waited. Fixed in version 18.1, see below.
- The dots for the grades are small. They always come with a word, so
  nobody has to tell the colors apart.
- Under 1340 pixels wide the tool bar has no "Compare" and "You"
  labels.
- The sliding light behind a switch still changes its width while it
  slides. It is a tiny box that pushes nothing else around, so we left
  it.
- The letters on the players in the Game are 9.7 pixels on a phone.

**Version 18.1: more time for a slow device**

The team leader said yes to giving the coach more time for each
picture of the video. What changed in `js/coach.js`:

- The coach waits up to 6 seconds for a picture (it was 2).
- It asks the video itself "are you still jumping?" before it looks.
  Before, a late "I am there" from an earlier jump could make the
  coach look at the wrong picture.
- A picture that still does not come is SKIPPED, not measured. The
  report says how many ("3 frames were skipped because the video did
  not load them in time on this device"), under "How much of the video
  was used".
- Five pictures in a row too late: the coach stops and says the video
  is too slow to read on this device, instead of going on for many
  minutes.

Checked with the real test clip, each run on its own:

- As it is: the same as before the change (20 good pictures; 131, 27
  and 180 degrees; 3 of 3 on target; no errors).
- Pretending every 12th picture never comes: the coach skipped 16
  pictures, still made a report (15 useful pictures, 3 of 3 on
  target), and the note says "16 frames were skipped because the video
  did not load them in time on this device."
- Pretending nothing comes any more after the 30th jump: after 5
  pictures in a row the coach stopped and said "This video is too slow
  to read on this device ... Try a shorter clip, or a smaller video
  file." The button went back to "Analyze video".
- All 13 test files pass. (No new math: this is waiting, not
  measuring.)

Not checked: a real slow phone. The pretending was done in the test
browser on this computer.

### Phase 19: A second look you can switch to, "Sunset" (done)

The team leader asked for one more choice of look, inspired by the
"Vice City" style of the GTA games, and said the 3D skaters must change
with it, not only the page.

**Decided before building**

- The 3D rink becomes an outdoor rink at sunset (sky, low sun, palms).
- Neon only inside the 3D picture. The page around it stays flat.
- The switch says "Sunset", our own name. `SOURCES.md` says where the
  idea came from. Nothing from the games is used: no logo, font, name,
  character or picture. Sky, sun and palms are our own drawing in code.
- The question about the skaters came back with no answer, so we took
  the middle choice: new kit and gear on the same body model.

**What Sunset looks like**

- The page: deep purple instead of the dark arena. TEAL means the pro
  (and the button to press next), HOT PINK means you. Green, yellow and
  red still grade, and each grade still has its word beside it.
- The 3D rink: a sky from orange at the horizon through pink to deep
  purple, a low sun over the far boards, 30 palm outlines far away, a
  warm haze, warm light from the front, pink light from the sun side
  and a little teal from the other side. White boards, a hot-pink kick
  plate, and a teal neon tube as the top rail: the one thing that
  glows. The ice mirrors the sky a little (warm far away, cool close).
- The skaters: the pro in teal, you in hot pink, both with a dark
  purple shoulder panel and pants, white helmets and gloves, dark
  sticks with pink (pro) or teal (you) tape and laces. The pro wears a
  mirrored visor instead of the cage, as many pros do. The kid KEEPS
  the cage, because kids must wear one.
- The words follow: "the pink skater", "Teal skater shows", "Drag the
  pink marker".

**What stays the same in both looks**

- Rink is the look a new visitor gets, and it did not change.
- The bodies, the poses and every measured number.
- The blue and red lines of every rink, and the blue team and the red
  team on the rinks seen from above. The lessons say "the blue line"
  and "the blue winger", so those colors are facts.
- Sizes, letters and movement. A look is only paint.

**How it is built**

- `js/theme.js` (new): the one list of colors JavaScript needs for
  each look (3D rink, outfits, signs, the lines on the video, the two
  color words), the switch, and remembering the choice on this device.
  If the browser will not let us save (a private window), the switch
  still works; the page just starts in Rink next time.
- `style.css`: 20 colors that were typed in the middle of the file got
  names at the top. Then one block, `:root[data-theme="sunset"]`, gives
  those names other colors. Nothing else in the file knows about looks.
- `index.html`: a tiny script in the head puts the saved look on
  before anything is drawn, so the page never flashes the wrong one.
  The switch sits at the right end of the top bar.
- `js/scene.js`: `applyLook()` changes lights, haze, boards and the
  ice picture, and shows or hides the sunset. The sky is the inside of
  a big ball, the sun two flat pictures, each palm one flat picture;
  all painted on a canvas by a few lines of code. No bloom effect, so
  a phone has no extra work for the glow.
- `js/figure.js`, `js/rigged-figure.js`, `js/skate.js`: `setOutfit()`
  changes the COLOR of each paint and never swaps a paint, so the
  see-through Overlay keeps working. The visor is a curved band fitted
  to the cage and fastened to the head bone, the way the skates are
  fastened to the foot bones.
- `js/coach.js`: sign colors, the lines on the video and the notes
  take the look's colors and words. No measuring code was touched.
- `tests/theme.test.js` (new, the 14th test file): a saved look is
  used and anything else gives Rink; both looks list the same things;
  the contrast and color-wheel math; in both looks the words can be
  read (main text at least 7 to 1, quiet text and colored words at
  least 4.5 to 1); pro, you and the three grades can be told apart;
  and `style.css` and `js/theme.js` say the same colors.

**Checked**

- Rink did not change: for every element on the page (and its
  ::before and ::after) we wrote down the colors the browser worked
  out, before the work and after it, in 12 states (start, report with
  a card on, help box, Positioning, Game, Referee; on a computer and
  on a phone). They are the same. (The only differences were a box
  caught in the middle of fading in, and the Referee's answer, which is
  right or wrong by chance.) The 3D picture was compared by eye.
  We first tried comparing pictures dot by dot; that does not work
  here, because the sample replay keeps moving.
- Sunset at 1280x800, 1440x900, 820x1180 and 375x812: no sideways
  scrolling, nothing you tap under 44 px on the touch sizes, no page
  errors, and the answer is still on the first screen (bottom of the
  top block at 702 of 800 on a computer, 616 of 812 on a phone).
- Flipping the switch with the sample session open, both ways: on
  every tab, in Overlay, in "As filmed", in the close look of a card.
  Report, signs, rings and curve keep working, the words change, and a
  reload keeps the choice. The same with saving blocked, and with
  "reduce motion" on. No errors.
- A "needs work" grade (red) on the pink skater, to see that the two
  can be told apart.
- The real test clip (`local-videos/test.mp4`, skater in black at
  1.0 s), run alone and analyzed in the Sunset look: the same as in
  18.1 (20 good pictures; 131, 27 and 180 degrees; 3 of 3 on target;
  no errors). The box and dots on the video are pink. Flipped to Rink
  afterward: the same numbers, and the notes say "orange" again. Those
  pictures show the real video, so they stay in
  `local-videos/screenshots/phase19/`.
- All 14 test files pass.

**Limits, said plainly**

- Not tried on a real phone. The sunset adds one ball, two flat
  pictures for the sun and 30 for the palms, which should be little
  work, but that is a guess until it is measured on a phone.
- In Sunset a red "needs work" ring on the hot-pink jersey is easier
  to miss than on the orange one. The sign beside it and the word in
  the report still say it.
- The simpler backup skater (used only if the model fails to load)
  gets the Sunset colors but no visor.
- Small text on the Game rink (position letters, about 10 px on a
  phone and a tablet) and the 16 px check box in the Game tab are the
  same in both looks. This phase did not change their sizes.
- The top bar is 6 to 10 px taller on touch screens, because the
  switch is 44 px tall there. "Skating lab" beside our name is hidden
  under 900 px wide to make room for it.
- In "As filmed" with the replay paused, a sign next to your skater
  can keep its old size after the camera moves in for a close look,
  until the next picture is drawn. Seen while checking this phase; not
  looked into yet.

### Phase 20: The "As filmed" choice is removed (done)

The team leader asked to delete "As filmed" from the video analysis.

- "As filmed" was one of two buttons in the "You" switch
  (`Smooth stride | As filmed`). With one button left a switch makes
  no sense, so the whole switch is gone. Your skater is always the
  smooth stride, rebuilt from all the good pictures.
- Kept, hidden: the picture-by-picture drawing is still what the page
  falls back to when a clip has fewer than 3 good pictures (then no
  stride can be rebuilt), and what `?dev` measuring mode shows. The
  note under the report says so in plain words when that happens.
- Changed: `index.html` (the switch), `js/coach.js` (`smoothOn()`,
  `showKidNote()`), `README.md`. No measuring code was touched.
- Checked: the sample session at 1280 and 375 wide in both looks; a
  session whose stride cannot be rebuilt; `?dev`; all tests. Compared
  with version 19, every element of the Form, Positioning and Referee
  tabs has the same colors, sizes and place; the only difference is
  the missing switch. The real test clip, alone, is checked together
  with Phase 21 (see there).
- The sign-size slip noted under Phase 19 was only seen in "As
  filmed", so you can no longer run into it by choosing that view.
- Pictures: `docs/screenshots/phase20/`. Version 20.0.

### Phase 21: The Game becomes a live hockey game (done, first version)

The team leader asked for a referee who blows the whistle on an offside
and on a goalie save, and then for much more: a game you control
directly, like a sports video game. WASD on a keyboard, a joystick on a
phone or iPad, no more beats where the play stops, buttons on the last
key of each keyboard row (`-` pass, `P` shoot, `L` call for a pass, `M`
stickhandle to the net), and offside for everyone on the ice.

**Decided with the team leader (the brainstorm):**
- You control one skater all game. A real game with a clock (2, 3 or
  5 minutes), face-offs, Pause, a summary at the end.
- On defense `-` is a stick check. No body checks.
- `M` is a quick move past a defender: fast for a moment, then slow.
- Touch: one joystick and four buttons.
- A pass goes to the teammate you steer toward; a thin line shows who.
- Difficulty comes from the age group you pick: seven groups of two
  years, 4-5 up to 16+. The same rules at every age.
- A power bar and a height bar, set with two taps on Pass or Shoot.
- Icing is called. A game controller works.
- The whistle is a real sound with an off button. On a save it blows
  only when the goalie covers the puck.
- Not chosen, so not built: a best-spot ring with a position score,
  and practice starts. The old beat-by-beat Game (Phase 12) is deleted.

**What was built:**
- `js/gamesim.js`, rewritten: the rules. The game moves in steps of
  1/60 second. Skaters speed up, glide and stop; the puck sits on a
  stick, slides, flies and bounces off the round boards. Passes,
  shots, the two bars, the stick check, the quick move, goalies that
  follow the puck, goals, offside, icing, covers, rebounds, face-offs,
  the referee's spot, and the table of dials for the seven age groups.
  The playbook and the chance formulas of the old game are kept and
  used by the computer players.
- `js/gamebrain.js`, new: the computer players. They skate to their
  playbook spot, one goes at the puck, the carrier picks a play. On
  purpose, now and then, a forward crosses the blue line early and a
  pressured defender ices the puck (how often depends on the age).
- `js/controls.js`, new: keys (read by where they sit, so any keyboard
  language works), the touch joystick and buttons, a game controller.
- `js/sound.js`, new: the whistle, made by the browser from a recipe of
  numbers (two close high notes with a flutter). No sound file.
- `js/game.js`, rewritten: the loop, the drawing, the phone camera, the
  bars, the scoreboard with the clock, the call in big letters, the
  ring around the referee, Pause, the end card.
- The rule for movement got one sentence (in `CLAUDE.md` and
  `js/ui.js`): the live Game is the one place where things must move to
  work; with "reduce motion" it still plays, without the extras.

**What the tests caught while building** (so they earned their keep):
- The "good" part of the height bar could send a shot over the net for
  the youngest group. Fixed: its top is now just under the crossbar.
- From the blue line an open shot scored 25%, far too often. Goalies
  now get time to see a shot from far away (9% at ages 10-11).
- A skater who had just passed the puck back at the blue line counted
  as offside while a skate was still on the line. A skater now counts
  as inside only a foot and a half past the line (both skates over).
- Computer teammates passed the puck on in the same instant they got
  it. A new carrier now holds it for a moment.
- The before/after record of every element showed that my new class
  name "bar" had shifted the page's top bar on all four tabs. Renamed.

**Checked:**
- 17 test files pass. New: 45 checks of the rules (every offside and
  icing case, saves, goals, bars, passes, checks, face-offs), 13 of
  the computer players (including 28 whole games with only computer
  players, 4 at each age), 7 of the controls, 4 of the sound.
- In the test browser with real key presses at 1280x800, both looks:
  the face-off as center, skating, both bars with two taps, the pass
  to the teammate I steer toward, a shot, the quick move, the stick
  check, calling for a pass, an offside and an icing set up on
  purpose (words, big call, ring, one whistle each), Esc, the Pause
  button, another tab and a hidden page all pause it, the end card,
  Sound off and remembered.
- With fingers at 375x812 and 820x1180, both looks: the joystick, a
  second finger on Shoot while the thumb steers, the rink and all
  controls on one screen, dragging on the joystick or the rink does
  not scroll the page, "Check" on defense, every button at least
  44 px, no words under 11 px, no sideways scrolling.
- A pretend controller: the stick, a button held down counts once,
  Start pauses.
- The whistle rendered by the browser's offline sound maker and
  measured: 0.39 s long, peak 0.11 of full volume, about 2,270 hertz,
  as the recipe says. One whistle per call was counted.
- "Reduce motion": the camera moved in 2 steps where it otherwise took
  18 positions, and the ring only fades. With saving blocked the game
  and the Sound button still work.
- Speed, on this computer only: a picture every 16.7 ms (60 a second),
  one game step takes about 0.01 ms.
- Positioning and Referee tabs: every element the same as in version
  19, in both looks, at 1280 and 375 wide. At 1440x900 no tab scrolls
  sideways.
- The real test clip, alone (the video analysis, because `js/coach.js`
  changed in Phase 20): 9 good pictures, 126 / 32 / 174, 3 of 3 on
  target, no errors. The untouched version 19, run the same way right
  after, gave exactly the same. So the measuring did not change. These
  numbers are lower than the 20 pictures and 131 / 27 / 180 noted in
  Phase 19: the test-browser scripts of that day were lost and I wrote
  new ones (another click point on the skater, maybe other browser
  settings). I have not looked into which of those makes the
  difference. The pictures stay in `local-videos/screenshots/phase21/`.
- In the app's own Browser pane: version 21.0 loads with no errors and
  a game starts. That pane draws only about one picture a second while
  it is in the background, so real-time play was looked at in the test
  browser, not there.
- A pretend child played 12 games at each age group (it chases the
  puck, heads for the net, shoots from close, taps the bars at random
  moments):

  | Age group | Score, us-them | Won of 12 | Offside against us |
  |---|---|---|---|
  | 4-5 | 8.1 - 0.0 | 12 | 4.8 |
  | 6-7 | 5.4 - 0.0 | 12 | 2.3 |
  | 8-9 | 4.0 - 0.3 | 9 | 2.8 |
  | 10-11 | 3.0 - 0.6 | 9 | 3.3 |
  | 12-13 | 1.4 - 1.3 | 5 | 2.3 |
  | 14-15 | 1.5 - 1.8 | 6 | 1.9 |
  | 16+ | 1.2 - 2.9 | 2 | 1.3 |

  A second pretend child that waits at the blue line and looks before
  passing had 0.3 to 1.5 offsides a game instead of 2 to 4. So looking
  first really pays, which is the lesson the team leader asked for.

**Limits, said plainly:**
- Nobody has played it by hand yet. The numbers above come from
  computer players and scripted key presses. How it FEELS (speed, how
  hard the bars are, how often the whistle blows) has to be judged by
  the kids, so expect one round of tuning. All the dials are in one
  table at the top of the age-group part of `js/gamesim.js`.
- Not tried on a real phone, a real iPad or a real controller. I
  cannot hear the whistle; an iPhone's mute switch also silences it.
- There are still many whistles: about 12 to 18 stops in a 3-minute
  game for a careless player (goals, offsides, covers), each followed
  by a face-off of about 4 seconds.
- The two-tap bars take time, and the game does not wait. For the
  youngest groups the marks run slowly, but a 4-year-old may still
  find two taps hard. An easier one-tap way was offered and not chosen.
- One period, no penalties, no line changes, no body checks. Our
  goalie is played by the computer. A goal only counts for a puck that
  was passed or shot: skating the puck into the goalie gives a cover.
- Offside is the "immediate" rule at every age, judged from the middle
  of a skater a foot and a half past the line, not from each skate as
  the Referee tab does. Icing is called the moment the puck crosses
  the goal line.
- On a phone the camera follows the puck. When that leaves you outside
  the picture, an arrow at the edge shows where you are.
- The best-spot lesson of the old Game is gone from this tab (it stays
  in Positioning), and so is the old game itself.
- Pictures: `docs/screenshots/phase21/`. Version 21.0.

### Phase 22: Take, full screen, a coach's report, the referee in the right place, more Referee plays (done)

The team leader played version 21 and asked for five things. Decided
with them: Take usually works when you are close, not always; and the
Pass key no longer takes, only Take does.

**1. Take.** Its own key (the space bar), its own touch button, X on
a controller. `tryTake` in `js/gamesim.js`:
- farther than 5 feet from the puck carrier nothing is taken, and the
  line under the clock says "Too far to take";
- inside 5 feet the chance goes from about 45% (from behind, at arm's
  length) to about 90% (right in front, close), a third of that
  during the carrier's quick move; a miss leaves you slow for a
  moment and there is a short wait before the next try;
- for the three youngest age groups a thin ring shows around the puck
  carrier when you are close enough.
The Pass button keeps saying "Pass"; the button to reach for (Take on
defense, Pass otherwise) is the bright one. The pretend child still
wins and loses about as before (5.3 to 0.1 at ages 4-5, 1.0 to 2.7 at
16+), so Take did not change how hard the game is.

**2. Full screen.** A button asks the browser for real full screen on
the Game's board. Where that is not allowed (an iPhone) the board
fills the whole window and covers the top bar and the tabs. The
button or Esc leaves it, and leaving pauses the game. At the end of a
game it leaves by itself, so the report can be read.

**3. The coach's report** (`js/gamereport.js`, new). While you play it
keeps notes about your skater; at the end it writes, under the rink:
the two things you did best, the one thing to work on next with a
tip, and a card each for Position, Passing, Shooting, Taking the puck,
Whistles on you, and Face-offs (only when you are the center).
- Position is read five times a second while you do not have the
  puck: how far you are from the spot the Positioning playbook gives
  your position (the same spots the computer players skate to, now
  available as `spots()` in `js/gamebrain.js`). Chasing a loose puck
  as the nearest player, or meeting a pass, does not count.
- For the rest the rules now send quiet notes that the play-by-play
  does not show: a pass leaving, who got it, a shot with where it was
  from and how good that spot is (the game's own `shotChance`), a shot
  wide or over the net, each take, who brought the puck in on an
  offside, and how you did at a face-off.
- "The moment to pass": you held the puck for more than a second and a
  half, a defender was within 10 feet, a teammate was open, and then
  the puck was taken from you.

**4. The referee where a referee belongs.** `refSpot` in
`js/gamesim.js` now knows the stoppage. Face-off: right at the dot, a
step beside the two centers, there before the players have lined up.
Offside: first onto that blue line. Goal or covered puck: first beside
that net. Icing: straight to the dot at the far other end. After the
drop the referee backs away to the boards.

**5. More Referee plays** (`js/refplays.js`, `js/ref.js`; built by a
helper task and then checked by me). From 10 kinds of plays to 24:
10 at Rookie (were 6), 19 at Linesman, 24 at Pro.
- New at Rookie: a puck SHOT in while a teammate is inside (offside)
  and with everybody outside (good play); a long pass nobody reaches
  (icing) and one a teammate catches (good play).
- New at Linesman: the FAR winger decides the call (offside, and a
  close onside twin); the puck comes out and goes back in while a
  teammate is still inside (offside) or after everybody got back
  (good play); a long pass to a teammate already inside (offside); a
  teammate's tip behind the red line (still icing).
- New at Pro: a tip past the red line (not icing); the player who has
  the puck crosses the line ahead of it (not offside); skates in the
  zone and the stick reaching back for the puck (offside); the other
  team takes the puck back into its own zone (not offside).
- The last three rest on USA Hockey Rule 630(b) and its casebook, and
  the tips on the Note to Rule 624. I opened both rule pages myself
  and found the sentences; they are quoted in `SOURCES.md`. The old
  line there, "not taught because we could not confirm the wording",
  is gone for the carrier case.
- Four of the kinds (the long pass to a teammate inside, the two tips,
  the reach with the stick) were not in my plan. The helper added
  them so that about half of every deck still needs a whistle.
- Inside every kind, old and new: who has the puck (center, winger or
  defender), which side, how deep and how fast, and one to three
  extra skaters who can never change the call.
- The judge was extended, not replaced: it now also follows who has
  the puck, whether the puck came out and went back in, and the last
  touch by the shooting team.
- Dealing: a shuffled deck per level. Every kind comes up once before
  any comes back, and none twice within three plays.

**What the tests and the checks caught while building:**
- After icing the referee first skated to the far goal line and then
  could not reach the face-off at the other end in time (68 feet away
  when the players were lined up). Now the referee goes straight to
  the dot, and a test checks the referee is there at every line-up.
- My class name for a row of choices, and later a wrong distance in a
  test of mine, were test mistakes, not page mistakes.
- One touch check failed once while other browser tests were running
  at the same time, and passed when repeated (and 6 of 6 times alone):
  my script had looked before the page drew its next picture.

**Checked:**
- 18 test files pass. New or rewritten: 58 checks of the game's rules
  (13 of them for Take and the referee's spots, 5 for the quiet
  notes), 13 of the coach's report (every sentence from made-up games,
  and 15 whole computer-only games), 22 of the Referee plays (the
  judge agrees with 300 plays of every kind at every level on both
  sides of the ice).
- Referee tab: 60 plays dealt per level gave every kind of the level
  (10, 19, 24), 29 or 30 whistles of 60, and no kind twice within
  three plays. One play of each of the 14 new kinds watched, answered
  and frozen at 1280x800 and 375x812: the call was right 28 of 28
  times, the explanation fits, no page errors, no sideways scrolling.
  The longest explanation used to push "Next play" 14 px under the
  phone's tabs; shortened by a few words, it now ends 7 px above.
- Test browser, real key presses, 1280x800, both looks: Space takes
  from close and says "Too far to take" from far, `-` on defense does
  nothing, the space bar does not scroll the page; the referee is
  within 5 ft of the dot at a face-off by the blue line and at one in
  our end after icing; full screen fills the window and Esc leaves it
  and pauses; a controller's X takes.
- A game steered by script ended with a report that counted exactly
  what the script did: 1 pass that arrived, 1 shot, 3 takes (1 won, 1
  from too far), 1 face-off won, 1 offside from carrying the puck in.
- Fingers at 375x812 and 820x1180, both looks: five buttons, each at
  least 44 px (Take is 64 by 136 on the phone); a finger on Take takes
  the puck; rink and controls on one screen; the window-filling full
  screen covers the top bar and the tabs and leaves again; the report
  has no sideways scrolling and no words under 11 px.
- Form analysis, Positioning and the Referee tab's first screen: every
  element the same as in version 21, in both looks, at 1280 and 375.
- Pictures: `docs/screenshots/phase22/`. Version 22.0.

**Limits, said plainly:**
- Still not played by hand by me: scripts, computer-only games and a
  pretend child. The report's limits (12 and 24 feet, what counts as
  a good spot or as "open") are my first choice and may be too strict
  or too kind once the kids read real reports.
- "The moment to pass" is a rule of thumb, not a coach's eye. The
  report cannot see WHY you were out of position.
- Real full screen was only tried with the window-filling way in the
  test browser on touch sizes; the real one on a computer. Not tried
  on a real phone or iPad.
- The referee is one person: after icing they skate the length of the
  rink in under three seconds, faster than a real referee.
- The Referee plays are still built from formations (more of them
  now), not recordings of real games. In the frozen close-up of a
  far-side player the puck can be outside the picture, as before.
- The live Game still judges offside more simply than the Referee tab
  (the middle of a skater, not each skate), and does not have the
  Pro-level exceptions.

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
