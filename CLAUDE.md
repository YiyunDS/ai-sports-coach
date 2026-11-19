# AI Sports Coach: working rules for the 3d-coach branch

An elementary-school project (a 3rd and a 4th grader, with a parent as
team leader) for the Presidential SI Challenge. All work happens on the
`3d-coach` branch.

## Rules for every phase

- Runs with no server-side code. Video never leaves the computer.
- Keep the dark, professional analysis-tool look. No emojis, no toy look.
- Keep code comments in plain language a 3rd grader's parent can read
  aloud with them.
- Keep all tests passing:
  `node tests/angles.test.js`, `node tests/tracker.test.js`,
  `node tests/motion.test.js`, `node tests/positions.test.js`,
  `node tests/cleanup.test.js` (added in Phase 1),
  `node tests/stride.test.js` (added in Phase 3).
  Add tests for new math.
- Do not break the Positioning tab.
- Any outside asset or video must be free to use and listed in
  `SOURCES.md` with its link and license.
- After each phase, open the page, take screenshots, and show before and
  after. Do not call a phase done until you have looked at it.
- Small commits on `3d-coach`. Do not push until the team leader says so.

## How to look at the page

- Serve the folder: `python3 -m http.server 8123` (or the `coach` entry
  in `.claude/launch.json`), then open http://localhost:8123.
- Test videos go in `local-videos/` (ignored by git, never committed).
  The main test clip is `local-videos/test.mp4` (copy of
  `~/Downloads/2213_1795050776.mp4`; click the skater in black at 1.0 s).
- Screenshots for each phase go in `docs/screenshots/<phase>/`.
  The starting point is in `docs/screenshots/before/`.
- The phased plan is in `docs/PLAN.md`.
