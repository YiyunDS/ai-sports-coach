# AI Sports Coach: working rules for the 3d-coach branch

An elementary-school project (a 3rd and a 4th grader, with a parent as
team leader) for the Presidential SI Challenge. All work happens on the
`3d-coach` branch.

## Rules for every phase

- Runs with no server-side code. Video never leaves the computer.
- Keep the dark, professional analysis-tool look. No emojis, no toy look.
  The look follows the four rules at the top of `style.css`: a quiet
  page around the two pictures, a color always means something and
  nothing glows, words in normal case (scoreboard letters only on the
  rink and for measured numbers), and sizes from one ladder (spaces 4,
  8, 12, 16, 20, 24; corners 8, 12, 14). No text under 11 px.
- Movement on the page follows the rules at the top of `js/ui.js`, with
  the times and the curve from the top of `style.css` (`--t-press`,
  `--t-switch`, `--t-panel`, `--ease`). Short, no bounce, only
  `transform` and `opacity` move, and "reduce motion" gets fades only.
- Keep code comments in plain language a 3rd grader's parent can read
  aloud with them.
- Keep all tests passing:
  `node tests/angles.test.js`, `node tests/tracker.test.js`,
  `node tests/motion.test.js`, `node tests/positions.test.js`,
  `node tests/cleanup.test.js` (added in Phase 1),
  `node tests/stride.test.js` (added in Phase 3),
  `node tests/retarget.test.js` (added in Phase 6),
  `node tests/measure.test.js` (added in Phase 8),
  `node tests/gamesim.test.js` (added in Phase 12),
  `node tests/refplays.test.js` (added in Phase 14),
  `node tests/rebuild.test.js` (added in Phase 15),
  `node tests/ui.test.js` (added in Phase 16),
  `node tests/chart.test.js` (added in Phase 17).
  Add tests for new math.
- Do not break the Positioning tab. The Game tab is a separate game
  (`js/gamesim.js` = rules and chances, `js/game.js` = the page); it
  reuses the playbook in `js/positions.js` but never changes it.
- Phone first: every tab must work at 375 px wide with no sideways
  scrolling, and everything you tap is at least 44 px tall.
- Any outside asset must be free to use and listed in `SOURCES.md` with
  its link and license.
- Videos we do not own (for example NHL footage of a pro) may only be
  MEASURED. The clip stays on this computer in `local-videos/` and is
  never committed or shared. The repo gets only the numbers we measured,
  with the link and who owns the footage, in `SOURCES.md`. The team
  leader saves such clips themself.
- The GitHub repo is public. A screenshot that shows a frame of a real
  video (kids on the ice, the rink) is never committed: save it in
  `local-videos/screenshots/<phase>/`. Only pictures of the 3D view,
  the report and the sample session go in `docs/screenshots/`.
- After each phase, open the page, take screenshots, and show before and
  after. Do not call a phase done until you have looked at it.
- Whenever a `.js` file or `style.css` changes, raise `VERSION` in
  `index.html` (and the `?v=` on the `style.css` link). Otherwise a
  browser can keep an old copy of one file next to new copies of the
  others, and the page breaks in confusing ways.
- Small commits on `3d-coach`. Do not push until the team leader says so.

## The website

- The app is online at https://yiyunds.github.io/ai-sports-coach/
  (GitHub Pages, free). GitHub serves whatever is on the `gh-pages`
  branch, exactly as it is (`.nojekyll`).
- To update the website after the team leader says to push:
  `git push origin main:gh-pages`. It takes about a minute to show.
- Everything on `gh-pages` is public. The same rule as for the repo:
  no real videos and no pictures of them.

## How to look at the page

- Serve the folder: `python3 -m http.server 8123` (or the `coach` entry
  in `.claude/launch.json`), then open http://localhost:8123.
- Test videos go in `local-videos/` (ignored by git, never committed).
  The main test clip is `local-videos/test.mp4` (copy of
  `~/Downloads/2213_1795050776.mp4`; click the skater in black at 1.0 s).
- Screenshots for each phase go in `docs/screenshots/<phase>/`
  (crop out the video panel, or keep the picture in `local-videos/`).
  The starting point is in `docs/screenshots/before/`.
- The phased plan is in `docs/PLAN.md`.

## Rebuilding the 3D skater model

- Needs Blender 4.2+ with the MPFB2 extension (installed in Blender 4.3
  on this Mac).
- `/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/build_skater.py -- OUT_DIR`
  (add `--render` for preview pictures), copy `OUT_DIR/skater.glb` to
  `assets/skater.glb`, then run `python3 tools/pack_model.py` to update
  `js/skater-model.js`.
