# Video Sources

Every video clip we use to measure "good skater" angles goes here.

| Player | Where the clip came from (link) | What we measured | Date added |
|---|---|---|---|
| | | | |

# Skating studies behind the pro's stride

| What we used | Where it came from |
|---|---|
| The phases of a stride (glide, push out to the side, recovery) and that strong skaters differ from weaker ones in hip and knee movement | Upjohn, Turcotte, Pearsall & Loh (2008), "Three-dimensional kinematics of the lower limbs during forward ice hockey skating", Sports Biomechanics 7(2), 206-221, https://doi.org/10.1080/14763140701841621 (we read the summary, not the full paper yet) |
| Both skates on the ice about 15-25% of the stride at full speed | Marino, "Biomechanics of power skating", summarized at https://ojs.ub.uni-konstanz.de/cpa/article/view/2985 |
| Forward lean of about 40-50° | Matches our pro target in targets.json; still needs a better source |

The stride width, push direction, edge angles and arm swing in
`js/stride.js` are our own estimates. We plan to check them against a
video of a strong skater.

# Code and models we download

The page downloads these when it runs. None of them gets our video: they
run inside the browser.

| What | Link | License |
|---|---|---|
| MediaPipe Tasks Vision 0.10.14 (the pose-finding code) | https://www.npmjs.com/package/@mediapipe/tasks-vision | Apache 2.0 |
| Pose Landmarker models: heavy (used first), full and lite (backups) | https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker | Apache 2.0 |
| three.js 0.187.0 with OrbitControls and RoomEnvironment (the 3D drawing code) | https://github.com/mrdoob/three.js | MIT |
