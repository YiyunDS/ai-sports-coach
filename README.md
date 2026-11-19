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
