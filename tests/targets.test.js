// =====================================================================
//  Checks that targets.json is written correctly, and that the backup
//  copy inside app.js says the same thing.
//  Run it with:   node tests/targets.test.js
// =====================================================================

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const targets = JSON.parse(fs.readFileSync(path.join(root, "targets.json"), "utf8"));

// Every age band needs both levels and all three checks, with min <= max.
const checks = ["kneeBend", "forwardLean", "strideExtension"];
for (const band of targets.ageBands) {
  for (const level of ["Beginner", "Experienced"]) {
    for (const check of checks) {
      const r = band[level][check];
      assert.ok(r && r.min <= r.max, `${band.name} ${level} ${check} needs min <= max`);
    }
  }
}
// Every age from 6 to 12 must belong to a band.
for (let age = 6; age <= 12; age++) {
  assert.ok(
    targets.ageBands.some((b) => age >= b.minAge && age <= b.maxAge),
    `age ${age} has no band`
  );
}
console.log("  ok  targets.json covers ages 6-12, both levels, all checks");

// The backup copy in app.js sits between two marker comments.
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const match = app.match(/\/\* DEFAULT_TARGETS_START \*\/([\s\S]*?)\/\* DEFAULT_TARGETS_END \*\//);
assert.ok(match, "could not find DEFAULT_TARGETS in app.js");
const backup = JSON.parse(match[1]);
assert.deepEqual(backup.ageBands, targets.ageBands, "app.js backup differs from targets.json");
console.log("  ok  backup copy in app.js matches targets.json");

console.log("\nAll targets tests passed!");
