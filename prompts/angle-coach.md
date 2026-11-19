# Starter prompt: Angle Coach (branch `angle-coach`, Claude Opus 5.5)

Read README.md first. Build the simplest working version of the AI Sports Coach as a web page that runs in the browser.

1. Home page: upload a skating video, pick an age (6–12), and pick Beginner or Experienced.
2. Use a browser pose-detection library (for example MediaPipe Pose) to find the hips, knees, ankles and shoulders in each frame.
3. Measure three angles: knee bend, forward lean of the upper body, and stride extension.
4. Compare them with target ranges kept in one easy-to-edit file (targets.json), with different ranges for each age and level.
5. Draw the skeleton lines and angle numbers on top of the video.
6. Show a simple score out of 100 and two or three short, friendly tips a kid can understand.

Keep the code simple and well commented so a 3rd and 4th grader can follow along. Commit small steps with clear messages.
