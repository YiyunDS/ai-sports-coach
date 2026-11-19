# Starter prompt: 3D Visual Coach (branch `3d-coach`, Claude Fable 5.2)

Read README.md first. Your job is to make skating feedback easy to SEE in 3D.

First small goal: a web page with one 3D hockey skater (built in code, for example with three.js) shown in the correct skating stance, with the knee angle labeled. Let the user rotate the view.

Then:
1. Let the user upload a skating video, pick an age and Beginner/Experienced, and detect their pose in the browser (for example MediaPipe Pose).
2. Show the kid's pose as a second 3D figure next to the "pro" figure so they can compare.
3. Highlight in color the joints where the angles are furthest from the target (targets in targets.json).
4. Optional: an animated replay that shows where the form slips during the stride.

Keep it to a single page that runs in the browser with no server. Comment the code so kids can follow it. Commit small steps.
