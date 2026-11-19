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

## Health & Dryland Coach (branch `health-coach`)

A single web page that checks skating, compares it with Fitbit heart-rate readings, and checks dryland squats and lunges. No server and nothing to install. Videos and heart-rate numbers stay on your device.

**Open it:** in the `coach-health` folder run `python3 -m http.server 8000`, then visit `http://localhost:8000` in Chrome. (Double-clicking `index.html` also works, but then `targets.json` can't be read and built-in default targets are used.) You need internet the first time so the browser can download the AI (MediaPipe) and Chart.js.

**Use it:**
1. Choose **Skating** or **Dryland**, pick a video, and pick your age (6-12).
2. Skating: pick Beginner or Experienced. Dryland: pick Squat or Lunge.
3. Press **Check my video**. Wait for the AI to look through the clip, then press play to see your skeleton.
4. Skating only: type Fitbit readings (time in the video like `1:30`, and beats per minute) and press Add. You will see the score graph next to the heart-rate graph, and a note (with a rest-break suggestion) if your form got sloppy when your heart was racing. "Try example" fills in practice numbers.

**Change the targets:** open `targets.json` in a text editor and change the numbers (angles in degrees). Keep the same numbers in `FALLBACK_TARGETS` at the top of `app.js` if you want the double-click version to match.

**Files:** `index.html` (page), `style.css` (looks), `app.js` (video, AI, charts), `angles.js` (angle math), `targets.json` (good-form numbers), `tests/angles.test.js` (run with `node tests/angles.test.js`).

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
