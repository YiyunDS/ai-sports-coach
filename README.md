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

This branch shows skating form in **3D**. A blue "pro" skater stands in a good hockey stance, and an orange skater skates **your** stride, rebuilt from your video, so you can compare them side by side.

### How to open it

**The easy way: open the website.** <https://yiyunds.github.io/ai-sports-coach/>

It is the same app, hosted for free by GitHub Pages. Your video is still analyzed inside your own browser and is never uploaded: the website only hands your browser the page.

Or run it from your own computer:

1. Download or clone this branch.
2. Double-click **`index.html`**. It opens in your browser (Chrome, Edge, Firefox or Safari). You need the internet the first time, because the page downloads the 3D library and the pose-finding AI.
3. No install and no server are needed.

### How to use it

1. **Look at the pro.** Drag to spin the view, scroll or pinch to zoom. The signs show the knee angle and the forward lean; a thin line joins each sign to its joint. Press **Play stride** to watch a push. The **?** button explains the colors and the words, and lets you hide the signs or add the elbow angles. The card on the 3D picture has the two ways to start: **Use your video** and **Try the sample**.
2. **Pick a skating video.** It works best filmed from the side, close enough that the skater fills a good part of the picture.
3. **Click the skater.** Slide the **Frame** slider to a moment where the skater is easy to see, then click the middle of their body. Other people can be in the video; the coach follows only the skater you clicked.
4. **Pick your age** (6 to 12) and **Beginner** or **Experienced**.
5. Press **Analyze video** (it is right under the video). The button fills up like a bar while the coach works, and the page shows the steps it goes through: getting the pose finder ready, finding the skater you clicked, following the skater, measuring. The coach zooms in on your skater about 20 times per second and draws a white skeleton on the video. **Check that the skeleton sits on the right skater.** If it does not, the numbers mean nothing: click the skater again on a clearer frame.
6. **Read your report.** The orange skater is you. A ring around a joint turns green (inside the goal), yellow (almost) or red (work on this one). The report has three layers. First the answer at a glance: a ring that shows how many of your numbers are on target, and the **one thing to work on next** (the number farthest from its goal). Then the three numbers, each with a ruler (the green part is the goal, the mark is you) and a tip. Last, folded away until you ask, how the orange skater was made and how much of the video was used. A warning that the numbers are rough (the skater is too small in the video, or was never seen from the side) is shown at the very top instead. Anything that is *not* measured from your video is always written in plain sight.
7. **Watch the replay.** The video, your orange skater and the blue pro all move together: when you push with your right leg, the pro pushes with the right leg too, so you can compare the same moment of the stride. The coach looks at about 20 pictures per second. The pro skates a real stride: the skate lands under the body, the hips slide over it, the leg drives out to the side and stays almost straight for a good part of the push (as measured on Connor McDavid) while the skate rolls onto its inside edge, then the skate swings back in low over the ice. The free arm swings opposite to the pushing leg, and the ice slides under the skaters like a treadmill. Every stride is a little different. The orange skater shows only the **useful moments** of your video: seen from the side, several clear pictures in a row, a pose a real skater can be in, and a real push happening. The other moments are left out (the coach tells you how many), and the replay jumps over them instead of showing a twisted or frozen skater. Under the replay buttons is **the curve**: one line that shows your knee angle in every useful picture, drawn over a green band (the goal for your age). The line is green inside the band, yellow a little outside and red far outside. The switch above it shows the lean or the pushing leg instead; small marks along the bottom show the top of each push, and a dotted line marks a jump. Drag along the curve to move through the session. Press **Jump to the biggest slip** to see where your form slipped the most.
8. **Smooth stride or As filmed.** The AI reads every picture on its own, so one picture is always a bit wobbly. In **Smooth stride** (the normal setting) the orange skater does not copy the pictures one by one. The coach uses all the useful pictures together to work out *how you skate*: how bent your standing knee is, how far you lean, how far you push (your left and your right push, when it sees both clearly), and your rhythm. Then the orange skater skates exactly that way, with the same stride builder as the pro and on the same clock. So what looks different between the two skaters *is* different. The numbers follow the video, so if you stand taller near the end, the orange skater does too. What is **not** yours in this view: the arms, the stick and how the skates tip are drawn the standard way (so there are no elbow signs on the orange skater), and a one-time stumble does not show. Pick **As filmed** to see every picture as the AI saw it. When the replay ends, both skaters keep striding (a loop), so even a clip with only a second of useful pictures can be watched as long as you like; the button on the 3D picture stops and starts the loop. If the coach finds your numbers but not your rhythm, the orange skater strides at an even, standard pace. If it sees no full push at all, your knee bend and lean are still yours, but the push is drawn at a standard angle (the low end of the goal for your age) and the page says it is not measured.

No video handy? Press **Load sample session** to see how it works. In the **?** box on the 3D picture you can hide the angle signs when you just want to look at the skaters.

### Moving the skaters

Once there are two skaters on the ice (your pose, or the sample session), you can compare them in different ways:

- **Drag a skater** with the mouse or a finger to slide it anywhere on the ice. Drag the ice itself to spin the camera.
- **Side by side** puts the two skaters next to each other. The **Spacing** slider moves them closer or farther apart.
- **Overlay** puts them on the same spot. The pro turns into a see-through blue outline drawn on top of you, so you can see exactly where your pose is different.
- **Reset** puts everyone back.
- **Tap a card in the report** (Knee bend, Forward lean or Stride extension) and the camera glides close to that joint. Its sign stays strong and the others fade, and the curve in the replay shows the same number. Tap the card again, or pick Side, Front or Top, to see the whole skaters again.

All of these tools sit in one bar at the bottom of the 3D picture. It appears when there are two skaters.

### Positioning (the second tab)

Skating well is only half of hockey. The **Positioning** tab is a coach's board that checks whether you know where to stand.

1. Pick a **situation** (for example "Defending: puck in our corner"), the **puck side**, and **your position** (LW, C, RW, LD or RD).
2. Your teammates are already on their spots. Drag the orange marker to where **you** should be.
3. Press **Check my spot**. The board measures how many feet you are from the ideal spot: within 8 ft is on target, within 16 ft is close. It also tells you your job in that situation.

The spots come from common youth-hockey coverage, and coaches use different systems. To change them, edit the numbers in `js/positions.js`, then run `node tests/positions.test.js` to make sure nothing broke. This tab is a quiz you answer by hand; it does not find players in a video yet.

### Game (the third tab)

The **Game** tab is the positioning board brought to life: a whole shift on the whole rink, where what happens next is decided by **chance**, like in real hockey.

1. Pick **how the shift starts** (for example "Their blue line: our defense has the puck") and **your position**, then press **Start shift**.
2. **When you have the puck**, pick a play: pass to a teammate, stickhandle, shoot, or dump it in. Every play shows its chance to work. You can also tap a teammate on the rink to pass.
3. **When you do not have the puck**, drag your orange marker to where you should be (the dashed circle is how far you can skate in one beat), then press **Play on**. If a teammate has the puck and you are open, you can **Call for a pass** instead.
4. Watch the play and read the **play-by-play**. After every beat the game tells you how good your spot was and what your job is.

A shift ends with a goal, a whistle (the goalie covers the puck, or offside) or a line change after 12 beats. The score carries on to the next shift.

Why chance? Nobody can know if one shot will go in. But over many tries, a short pass to an open teammate works much more often than a long pass past a defender, and a shot from the slot scores much more often than a shot from the corner. Good hockey is picking the play with the best chance. The same pass from the blue line can end with our forward scoring, or with a missed shot, a rebound to the other team and a rush at our net.

- Where everybody should be comes from the same playbook as the Positioning tab (`js/positions.js`), plus patterns for the rush, the backcheck and the forecheck.
- Being in the right spot matters: you are open for passes, and the other team's shots get harder.
- The chances are our own estimates, not measured from real games. They are in `js/gamesim.js` and are easy to change. `node tests/gamesim.test.js` plays thousands of shifts to check that the game stays fair and that good positioning and passing really pay off.

### Referee (the fourth tab): You make the call

In this game **you are the referee**. A short play runs on the rink, then you tap **Offside**, **Icing** or **Good play**. The game freezes the moment that decided it, zooms in on the skates and the line, and tells you why.

- **Offside:** the puck must cross the other team's blue line before any attacker. A player is offside when both skates are completely over the line before the whole puck is. One skate still on the line is fine.
- **Icing:** the puck is shot from the shooter's own half of the rink and goes all the way over the far goal line with nobody touching it. Not icing: it goes in the net, the other team plays it first, or it stops short.
- Three levels: **Rookie** (plain to see), **Linesman** (close calls at the line, pucks that are touched, stop short or go in) and **Pro** (faster, and teams that are short a player).

The rules are the USA Hockey rules for players 12 and under: the whistle blows right away (no "tag-up"), and a team killing a penalty may **not** ice the puck (in the NHL it may). The links are in `SOURCES.md`. The plays are built by `js/refplays.js`, and a separate "judge" in the same file makes the call from the skates and the puck alone; `node tests/refplays.test.js` checks that the judge agrees with every play.

### On a phone

Every tab works on a phone: nothing scrolls sideways, and everything you tap is at least 44 pixels tall. The four tabs sit at the bottom of the screen, where your thumb is. In Form analysis the 3D picture gets smaller once there is a report and stays at the top of the screen while you read, so the answer is on the first screen and you still see the skaters when you tap a card. The tool bar shows only **Side by side / Overlay**; **More** opens the rest. In the Game and the Referee tab the rink stands up, and your buttons sit in a sheet just above the tabs so you see the rink and the buttons together. In the Game the picture follows the puck, so the markers stay big enough for a finger.

### Changing the goal angles

The goal angles live in [`targets.json`](targets.json). There is one set for each age band (6-8, 9-10, 11-12) and each level, plus one for the pro. To try your own numbers, edit the file and use **Edit target angles > Load targets.json** on the page. To make them the new normal, also copy the file into `js/default-targets.js`.

**The pro's knee bend and push in `targets.json` were measured** from a slow-motion clip of Connor McDavid; [`SOURCES.md`](SOURCES.md) says where it came from and what we could not measure. The numbers for each age band are still starter guesses.

### What is in this branch

| File | What it does |
|---|---|
| `index.html`, `style.css` | The page and its colors |
| `targets.json` | The goal angles (kids can edit) |
| `js/angles.js` | The math: measures angles and scores them |
| `js/rigged-figure.js` | Draws the realistic 3D hockey player: a model with a skeleton inside, made in Blender |
| `js/skater-model.js` | That 3D model, packed as text so the page works when you double-click it (made by `tools/pack_model.py`) |
| `js/retarget.js` | Turns the model's bones so it takes our pose |
| `js/rebuild.js` | Rebuilds *your* stride smoothly from the wobbly pictures of a video: a steady stride clock from the moments you change legs, and the middle value of your knee bend, lean and pushes around every moment. Run `node tests/rebuild.test.js` |
| `js/ui.js` | The little movements of the page: the light that slides behind a switch, numbers that count up, the report's entrance, the score's pulse, the help box. Short, no bounce, and almost none if your device asks for less motion. Also the camera math: how far back the camera sits, how big the signs are drawn. Run `node tests/ui.test.js` |
| `js/chart.js` | The curve in the replay: where every angle sits on the chart, which picture is under your finger, where the line is cut at a hole, and the paint (green, yellow, red) that must agree with the report's grades. Run `node tests/chart.test.js` |
| `js/skate.js` | Builds one hockey skate (boot, tongue, laces, holder, steel). Both skaters wear it |
| `js/measure.js` | Measures a strong skater's stride from a video: cuts it into pushes, throws away broken ones, and takes the middle value. Run `node tests/measure.test.js` |
| `js/figure.js` | The simpler skater built in code from shaped pieces. The page uses it if the realistic one cannot load |
| `tools/blender/build_skater.py` | The recipe that builds the 3D model in Blender (body from MPFB2, gear modeled by the script) |
| `tests/retarget.test.js` | Checks that the model's bones point where our pose says. Run `node tests/retarget.test.js` |
| `js/scene.js` | The rink (real size, with boards and glass), lights, camera, the pro skater, and moving the skaters |
| `js/tracker.js` | Follows the one skater you clicked through the video |
| `js/coach.js` | Reads your video, finds your pose, makes the report and replay |
| `js/gamesim.js` | The simulation game: where everyone should be for any puck position, and the chances for passes, stickhandling and shots |
| `js/game.js` | The simulation game on the page: the rink, your choices, the play-by-play |
| `js/positions.js` | The playbook: where each position should stand in each situation |
| `js/board.js` | The positioning board you drag your marker on |
| `tests/angles.test.js` | Checks the math. Run `node tests/angles.test.js` |
| `js/stride.js` | How the pro skates: the stride keyframes (kids can edit them) and the math that turns them into a pose |
| `tests/stride.test.js` | Checks the pro's stride (bones keep their length, skates stay on the ice and do not skid). Run `node tests/stride.test.js` |
| `js/rink.js` | Draws the whole rink from above for the Game and the Referee tabs |
| `js/refplays.js` | The Referee game: builds short plays and judges them from the rule book (offside, icing) |
| `js/ref.js` | The Referee game on the page: the little movie, your call, the zoomed-in reason, the score |
| `tests/refplays.test.js` | Checks the Referee game: the judge agrees with 9,000 built plays. Run `node tests/refplays.test.js` |
| `tests/gamesim.test.js` | Checks the simulation game: the playbook, the chances, and thousands of whole shifts. Run `node tests/gamesim.test.js` |
| `tests/cleanup.test.js` | Checks the clean-up of video poses (smoothing, fixed bones, skates on the ice). Run `node tests/cleanup.test.js` |

### Good to know

- **Your video stays on your computer.** The page only downloads code: three.js from jsDelivr, MediaPipe from jsDelivr, the pose model from Google's MediaPipe storage, and the lettering (fonts) from Google Fonts.
- The AI finds body joints, not sticks. In **Smooth stride** the orange skater holds a stick the standard way (it is drawn, not measured); in **As filmed** it has no stick.
- **Knee bend** is always the knee of the leg you are standing on. **Push** is measured at the end of each real push; if the coach sees no push in the clip, it says so instead of making up a number. When enough of the clip is filmed from the side, the report uses only those moments (the others are faded on the replay's curve).
- The AI has to guess how deep things are from a flat video, so the 3D pose can wobble. Angles are most trustworthy from a clear side view.
- Because of that, a video filmed from the front or from far away may leave only a second or two of useful moments. Film from the side, close up, and keep the skater in the picture to get more.

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
