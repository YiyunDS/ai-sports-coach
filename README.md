# AI Sports Coach 🏒

An elementary team project for the [Presidential SI Challenge](https://orise.orau.gov/si-challenge/index.html).

Our app helps kids learn hockey with help from AI. You upload a video of yourself skating, pick your age and level, and the AI coach measures your body angles and gives you tips to skate better.

## How it works

1. **Upload a video** of yourself skating.
2. **Pick your age** and whether you're a **Beginner** or **Experienced** skater.
3. The AI finds your joints (hips, knees, ankles, shoulders) and **measures the angles**.
4. It compares your angles with good skaters and gives you **friendly tips**, like "Bend your knees a little more!"

### The first three things we check

| Check | What it means |
|---|---|
| Knee bend | Are your knees bent enough to push hard? |
| Forward lean | Is your upper body leaning forward a little? |
| Stride extension | Does your leg push all the way out on each stride? |

To find good target angles, we measure highlight clips of elite skaters such as Connor McDavid. We list where every clip came from in [`SOURCES.md`](SOURCES.md).

## Three plans, three worktrees

We're trying three ideas at the same time. Each one lives on its own branch, and we build each one with a different AI model. Then we compare them and the team votes.

| Branch | Plan | Built with |
|---|---|---|
| `angle-coach` | **Angle Coach**: the simplest working version. Draws lines and angle numbers on the video and gives a score plus tips. | Claude Opus 5.5 |
| `3d-coach` | **3D Visual Coach**: a 3D skater showing the correct position next to your pose. | Claude Fable 5.2 |
| `health-coach` | **Health & Dryland Coach**: adds Fitbit heart-rate data and checks dryland exercises like squats and lunges. | A third model the team picks |

### Set up the worktrees

```bash
git clone https://github.com/YiyunDS/ai-sports-coach.git
cd ai-sports-coach
git worktree add ../coach-angle  -b angle-coach
git worktree add ../coach-3d     -b 3d-coach
git worktree add ../coach-health -b health-coach
```

Then open three terminals and start Claude Code in each folder:

```bash
cd ../coach-angle  && claude --model claude-opus-5-5
cd ../coach-3d     && claude --model claude-fable-5-2
cd ../coach-health && claude --model claude-sonnet-5-5
```

Paste the matching starter prompt from [`prompts/`](prompts/) into each one.

### How we'll pick a winner

- Does it work on **our own** skating videos? (Use the same test video for all three.)
- Are the tips easy for a kid to understand?
- How long did it take to build, and how many fixes did it need?
- Which one do we like best? **The team votes**, and the winner gets merged into `main`.

## 3D Visual Coach (branch `3d-coach`)

This branch shows skating form in **3D**. A blue "pro" skater stands in a good hockey stance, and an orange skater copies **your** pose from a video so you can compare them side by side.

### How to open it

1. Download or clone this branch.
2. Double-click **`index.html`**. It opens in your browser (Chrome, Edge, Firefox or Safari). You need the internet the first time, because the page downloads the 3D library and the pose-finding AI.
3. No install and no server are needed.

### How to use it

1. **Look at the pro.** Drag to spin the view, scroll or pinch to zoom. The signs show the knee angle and the forward lean. Press **Play stride** to watch a push.
2. **Pick a skating video.** It works best filmed from the side, close enough that the skater fills a good part of the picture.
3. **Click the skater.** Slide the **Frame** slider to a moment where the skater is easy to see, then click the middle of their body. Other people can be in the video; the coach follows only the skater you clicked.
4. **Pick your age** (6 to 12) and **Beginner** or **Experienced**.
5. Press **Analyze video**. The coach zooms in on your skater about 20 times per second and draws a white skeleton on the video. **Check that the skeleton sits on the right skater.** If it does not, the numbers mean nothing: click the skater again on a clearer frame.
6. **Read your report.** The orange skater is you. A ring around a joint turns green (inside the goal), yellow (almost) or red (work on this one). Each check gets a tip.
7. **Watch the replay.** The video, your orange skater and the blue pro all move together: when you push with your right leg, the pro pushes with the right leg too, so you can compare the same moment of the stride. The coach looks at about 20 pictures per second and draws the moments in between, so the motion is smooth. The pro skates a real stride: the skate lands under the body, the hips slide over it, the leg pushes out to the side until it is almost straight while the skate rolls onto its inside edge, then the skate swings back in low over the ice. The free arm swings opposite to the pushing leg, and the ice slides under the skaters like a treadmill. Every stride is a little different. The colored stripes show every moment of your video. Press **Jump to the biggest slip** to see where your form slipped the most.

No video handy? Press **Load sample session** to see how it works. The **Angles** button hides the angle signs when you just want to look at the skaters.

### Moving the skaters

Once there are two skaters on the ice (your pose, or the sample session), you can compare them in different ways:

- **Drag a skater** with the mouse or a finger to slide it anywhere on the ice. Drag the ice itself to spin the camera.
- **Side by side** puts the two skaters next to each other. The **Spacing** slider moves them closer or farther apart.
- **Overlay** puts them on the same spot. The pro turns into a see-through blue outline drawn on top of you, so you can see exactly where your pose is different.
- **Reset positions** puts everyone back.

### Positioning (the second tab)

Skating well is only half of hockey. The **Positioning** tab is a coach's board that checks whether you know where to stand.

1. Pick a **situation** (for example "Defending: puck in our corner"), the **puck side**, and **your position** (LW, C, RW, LD or RD).
2. Your teammates are already on their spots. Drag the orange marker to where **you** should be.
3. Press **Check my spot**. The board measures how many feet you are from the ideal spot: within 8 ft is on target, within 16 ft is close. It also tells you your job in that situation.

The spots come from common youth-hockey coverage, and coaches use different systems. To change them, edit the numbers in `js/positions.js`, then run `node tests/positions.test.js` to make sure nothing broke. This tab is a quiz you answer by hand; it does not find players in a video yet.

### Changing the goal angles

The goal angles live in [`targets.json`](targets.json). There is one set for each age band (6-8, 9-10, 11-12) and each level, plus one for the pro. To try your own numbers, edit the file and use **Edit target angles > Load targets.json** on the page. To make them the new normal, also copy the file into `js/default-targets.js`.

**The numbers in `targets.json` are starter guesses.** We still need to measure real clips and write down where they came from in [`SOURCES.md`](SOURCES.md).

### What is in this branch

| File | What it does |
|---|---|
| `index.html`, `style.css` | The page and its colors |
| `targets.json` | The goal angles (kids can edit) |
| `js/angles.js` | The math: measures angles and scores them |
| `js/rigged-figure.js` | Draws the realistic 3D hockey player: a model with a skeleton inside, made in Blender |
| `js/skater-model.js` | That 3D model, packed as text so the page works when you double-click it (made by `tools/pack_model.py`) |
| `js/retarget.js` | Turns the model's bones so it takes our pose |
| `js/measure.js` | Measures a strong skater's stride from a video: cuts it into pushes, throws away broken ones, and takes the middle value. Run `node tests/measure.test.js` |
| `js/figure.js` | The simpler skater built in code from shaped pieces. The page uses it if the realistic one cannot load |
| `tools/blender/build_skater.py` | The recipe that builds the 3D model in Blender (body from MPFB2, gear modeled by the script) |
| `tests/retarget.test.js` | Checks that the model's bones point where our pose says. Run `node tests/retarget.test.js` |
| `js/scene.js` | The rink (real size, with boards and glass), lights, camera, the pro skater, and moving the skaters |
| `js/tracker.js` | Follows the one skater you clicked through the video |
| `js/coach.js` | Reads your video, finds your pose, makes the report and replay |
| `js/positions.js` | The playbook: where each position should stand in each situation |
| `js/board.js` | The positioning board you drag your marker on |
| `tests/angles.test.js` | Checks the math. Run `node tests/angles.test.js` |
| `js/stride.js` | How the pro skates: the stride keyframes (kids can edit them) and the math that turns them into a pose |
| `tests/stride.test.js` | Checks the pro's stride (bones keep their length, skates stay on the ice and do not skid). Run `node tests/stride.test.js` |
| `tests/cleanup.test.js` | Checks the clean-up of video poses (smoothing, fixed bones, skates on the ice). Run `node tests/cleanup.test.js` |

### Good to know

- **Your video stays on your computer.** The page only downloads code: three.js from jsDelivr, MediaPipe from jsDelivr, the pose model from Google's MediaPipe storage, and the lettering (fonts) from Google Fonts.
- The orange skater has no stick, because the AI finds body joints, not sticks.
- **Knee bend** is always the knee of the leg you are standing on. **Push** is measured at the end of each real push; if the coach sees no push in the clip, it says so instead of making up a number. When enough of the clip is filmed from the side, the report uses only those moments (the others are dimmed in the replay bar).
- The AI has to guess how deep things are from a flat video, so the 3D pose can wobble. Angles are most trustworthy from a clear side view.

## Ideas for later

- **Shooting**: weight shift and stick follow-through.
- **Stick handling**: harder, because the AI has to follow a small, fast puck.
- **"Email us" button** at the bottom of the home page so people can ask for other sports like tennis or basketball. It goes to a parent's email.

## Words to know

- **GitHub** is a save folder in the cloud that remembers every version of our code, so we can always go back.
- **Worktree** is a separate copy of the project on your desk, so we can try different ideas without breaking each other's work.
- **Branch** is one line of work. Each plan has its own branch.

## Safety

- We use a parent's email address for anything public, never a kid's.
- We only share videos with permission.

## Team

Two hockey players from Team PHL (a 3rd grader and a 4th grader), with a parent as Team Leader.
