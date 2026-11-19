# Video Sources

Every video clip we use to measure "good skater" angles goes here.

| Player | Where the clip came from (link) | What we measured | Date added |
|---|---|---|---|
| Connor McDavid | "How to Skate Like Connor McDavid. Skating Stride in Slow Motion." uploaded by Satoshi Takano, https://www.youtube.com/watch?v=B4TOqFktwBg , the slow-motion shot from 2:45 to 3:02. The footage itself belongs to the NHL and its broadcasters. | Four pushes. Pushing knee at its straightest: 163° (the four pushes gave 160° to 165°). Standing knee during the push: 97° (91° to 105°). | 2026-11-19 |

How we measured: our own coach in measuring mode (`?dev`) read the clip, and
`pushesFromKnees` in `js/measure.js` found the pushes. The numbers for every
picture are in `data/pro-stride-measured.json`. **We did not keep the video in
this project**, only the numbers.

What we could NOT measure from this clip, and why:
- Forward lean: the readings jumped between 21° and 50° as the camera angle
  changed, so we kept our estimate (40° to 50°).
- Real timing: the clip is slow motion and we do not know by how much.
- The push out to the side, edges and arm swing: the camera is not side-on and
  not from behind.
- His pushing leg stays almost straight (above 155°) for roughly 9% to 20% of
  each stride. We reworked the pro's stride to copy that: it was 4%, now it is
  13% (chart in `docs/screenshots/phase10/push-knee-curve.png`). We cannot
  tell from this clip exactly when his leg straightens, so the timing of the
  straightening is still our estimate.

We also looked at the NHL's 2024 Fastest Skater video
(https://www.youtube.com/watch?v=pYmOtDU35DE). The camera changes every second
or two and never shows him from the side for long, so we could not measure it.

# Skating studies behind the pro's stride

| What we used | Where it came from |
|---|---|
| The phases of a stride (glide, push out to the side, recovery) and that strong skaters differ from weaker ones in hip and knee movement | Upjohn, Turcotte, Pearsall & Loh (2008), "Three-dimensional kinematics of the lower limbs during forward ice hockey skating", Sports Biomechanics 7(2), 206-221, https://doi.org/10.1080/14763140701841621 (we read the summary, not the full paper yet) |
| Both skates on the ice about 15-25% of the stride at full speed (ours: 20%) | Marino, "Biomechanics of power skating", summarized at https://ojs.ub.uni-konstanz.de/cpa/article/view/2985 |
| Forward lean of about 40-50° | Our estimate; the McDavid clip could not confirm it (see the top of this file) |

The stride width, push direction, edge angles and arm swing in
`js/stride.js` are our own estimates. We plan to check them against a
video of a strong skater.

# The 3D skater model

| What | Link | License |
|---|---|---|
| Body and skeleton made with MPFB2 2.0.18 (the MakeHuman add-on for Blender). Characters it makes are CC0. | https://extensions.blender.org/add-ons/mpfb/ and https://static.makehumancommunity.org/mpfb/about.html | Add-on: GPL-3.0; its assets and what it makes: CC0 |
| Hockey gear (jersey, pants, socks, gloves, helmet, cage, skates), modeled by our own script `tools/blender/build_skater.py` | this project | ours |

# Code and models we download

The page downloads these when it runs. None of them gets our video: they
run inside the browser.

| What | Link | License |
|---|---|---|
| MediaPipe Tasks Vision 0.10.14 (the pose-finding code) | https://www.npmjs.com/package/@mediapipe/tasks-vision | Apache 2.0 |
| Pose Landmarker models: heavy (used first), full and lite (backups) | https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker | Apache 2.0 |
| three.js 0.187.0 with OrbitControls and RoomEnvironment (the 3D drawing code) | https://github.com/mrdoob/three.js | MIT |

## Hockey rules used in the Referee game

We wrote the plays and the explanations ourselves. The rules they teach come from these pages (read on 2026-11-19):

| What we used | Where it came from |
|---|---|
| Offside is judged by where the skates and the puck are at the blue line; at 12U and younger the whistle is immediate (no "tag-up") | USA Hockey rulebook, Rule 630, https://www.usahockeyrulebook.com/rule630-offside ; summary of the 2021 change, https://www.minnesotahockey.org/news_article/show/1174479 |
| A player is offside when both skates are completely over the blue line before the puck; the stick does not count | The general offside rule, explained at https://en.wikipedia.org/wiki/Offside_(ice_hockey) (we could not open the exact USA Hockey wording, so we teach only this well-known part) |
| Icing: the center line splits the rink in half, the point of last contact decides, and icing is complete the instant the puck completely crosses the goal line; no icing when an opponent other than the goalie could have played it | USA Hockey casebook, Rule 624, https://www.usahockeyrulebook.com/page/7777/casebook-rule-624-icing-the-puck ; USA Hockey "Ask the Official", https://www.usahockey.com/page/show/9649001-ask-the-official-week-3 |
| At 14U and younger a shorthanded team may not ice the puck | USA Hockey, https://usahockey.com/news_article/show/804355 ; Minnesota Hockey, https://www.minnesotahockey.org/news_article/show/806653 |
| Short rounds with instant feedback work well for teaching with hockey | NHL and NHLPA Future Goals "Hockey Scholar", https://everfi.com/courses/k-12/hockey-scholar-stem/ (an idea we learned from; we copied nothing from it) |
| Things you tap on a phone should be about 44 px or bigger | WCAG 2.2 target size, explained at https://smashingmagazine.com/2024/07/getting-bottom-minimum-wcag-conformant-interactive-element-size/ |

Not taught, because we could not confirm the exact youth wording: what happens when the player carrying the puck crosses the line backward, and the "opponent could have played it" judgment call (our plays only use an opponent who really touches the puck).
