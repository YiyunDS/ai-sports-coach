// Run with:  node tests/positions.test.js
// Checks that the playbook in js/positions.js makes sense.
var P = require("../js/positions.js");
var assert = require("assert");

P.SITUATIONS.forEach(function (s) {
  var range = P.viewRange(s.zone);
  // Every situation needs all five positions, each with a spot and a job.
  P.ROLES.forEach(function (role) {
    var p = s.spots[role];
    assert.ok(p, s.id + " is missing a spot for " + role);
    assert.ok(typeof s.jobs[role] === "string" && s.jobs[role].length > 20, s.id + " is missing a job for " + role);
    // The spot must be on the ice, inside the half of the rink we draw.
    assert.ok(p.a >= 2 && p.a <= 83, s.id + " " + role + " is off the side of the rink");
    assert.ok(p.d >= range.from + 2 && p.d <= range.to - 2, s.id + " " + role + " is outside the picture");
  });
  // No two teammates should be told to stand on the same spot.
  P.ROLES.forEach(function (r1, i) {
    P.ROLES.slice(i + 1).forEach(function (r2) {
      assert.ok(P.feetBetween(s.spots[r1], s.spots[r2]) >= 6, s.id + ": " + r1 + " and " + r2 + " are on top of each other");
    });
  });
  // Flipping twice gets you back where you started.
  assert.deepStrictEqual(P.mirror(P.mirror(s)).spots, s.spots);
  // Flipping moves the left wing's spot to the right wing, on the other side.
  var m = P.mirror(s);
  assert.strictEqual(m.spots.RW.a, 85 - s.spots.LW.a);
  assert.strictEqual(m.jobs.RD, s.jobs.LD);
});

// Grading: on the spot = good, 12 ft away = close, 30 ft away = far.
var s0 = P.SITUATIONS[0], ideal = s0.spots.C;
assert.strictEqual(P.checkSpot(s0, "C", ideal).grade, "good");
assert.strictEqual(P.checkSpot(s0, "C", { a: ideal.a + 12, d: ideal.d }).grade, "close");
assert.strictEqual(P.checkSpot(s0, "C", { a: ideal.a + 30, d: ideal.d }).grade, "far");
assert.strictEqual(Math.round(P.feetBetween({ a: 0, d: 0 }, { a: 3, d: 4 })), 5);
assert.strictEqual(P.getSituation("breakout", "right").spots.RD.a, 85 - P.getSituation("breakout", "left").spots.LD.a);

console.log("All positioning tests passed!");
