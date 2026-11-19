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

## Angle Coach

The Angle Coach lives on the `angle-coach` branch. It is one web page that runs in your browser. Your video stays on your computer and is never uploaded.

### Open it

- **Easiest:** double-click `index.html` to open it in Chrome or Edge. You need the internet the first time, because the page downloads the AI (MediaPipe Pose) from the web.
- **If you edited `targets.json`:** some browsers won't let a double-clicked page read other files. Either open "For grown-ups: goal numbers" at the bottom of the page and pick your `targets.json`, or start a tiny local web server in this folder and open the address it prints:

  ```bash
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

### Use it

1. Pick your skating video. Film from the **side**, with your **whole body** in the picture, for 5 to 20 seconds.
2. Pick your age (6 to 12) and **Beginner** or **Experienced**.
3. Press **Check my skating!** The AI looks at 10 pictures every second and draws lines on your body.
4. Read your **score out of 100** and your **coach tips**. Press play on the video to watch the lines and angle numbers move with you. Green means on target, orange means keep practicing.

### What the numbers mean

| Check | How we measure it | Good direction |
|---|---|---|
| Knee bend | Angle at the knee (hip, knee, ankle) on your bent, gliding leg. 180° is a straight leg. | Smaller = more bend |
| Forward lean | How far the line from your hips to your shoulders tips away from straight up. 0° is standing tall. | Bigger = more lean |
| Stride push | Knee angle of your pushing leg in the pictures where your feet are farthest apart. | Close to 180° = full push |

Each check gets 100 points if you are inside the goal range, and loses 3 points for every degree outside it. Your score is the average of the three.

### Tuning the targets

The goal numbers live in `targets.json`, one set for each age group (6-8, 9-10, 11-12) and level. The starting numbers are our best guesses. To make them better:

1. Find a side-view clip of an elite skater (for example Connor McDavid) and write it in `SOURCES.md`.
2. Run it through Angle Coach and write down the knee bend, forward lean and stride push numbers.
3. Do this for a few clips. Elite numbers are the goal for **Experienced 11-12**. Make the younger and Beginner ranges a bit easier (a bigger knee angle, a little less lean).
4. Change the `min` and `max` numbers in `targets.json`. Keep the commas and quotes. Run `node tests/targets.test.js` to check you didn't make a typo.
5. Also copy the new numbers into the backup copy near the top of `app.js` (between `DEFAULT_TARGETS_START` and `DEFAULT_TARGETS_END`). The test tells you if the two copies don't match.

### Files

| File | What it does |
|---|---|
| `index.html` | The page: buttons, video and score card |
| `style.css` | Colors and sizes |
| `app.js` | Runs the AI, draws the lines, gives the score and tips |
| `angles.js` | The angle math (our computer protractor) |
| `targets.json` | Goal numbers for each age and level |
| `tests/` | Checks for the math and the goal numbers: `node tests/angles.test.js` and `node tests/targets.test.js` |

### Good to know

- The camera angle matters. The AI sees a flat picture, so a video filmed from the front or at a slant gives different angles than one filmed from the side.
- The AI only uses body dots it is at least half sure about. If it can't see you in at least 5 pictures, it asks for a better video.
- Only the first 60 seconds of a video are checked.

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
