// Tiny test: run with  node tests/angles.test.js
const assert = require('assert');
const M = require('../angles.js');
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

// Knee angle: straight leg = 180, right angle = 90
near(M.angleAt({x:0,y:0},{x:0,y:10},{x:0,y:20}), 180);
near(M.angleAt({x:0,y:0},{x:0,y:10},{x:10,y:10}), 90);
assert.strictEqual(M.angleAt({x:1,y:1},{x:1,y:1},{x:2,y:2}), null);
// Lean: straight up = 0, 45 degrees = 45, leaning backward counts the same
near(M.leanFromVertical({x:0,y:0},{x:0,y:10}), 0);
near(M.leanFromVertical({x:10,y:0},{x:0,y:10}), 45);
near(M.leanFromVertical({x:-10,y:0},{x:0,y:10}), 45);
// Stride: legs almost together = small, one leg out 90 = 90
near(M.strideAngle({x:-1,y:0},{x:1,y:0},{x:-1,y:10},{x:1,y:10}), 11.42, 0.05);
near(M.strideAngle({x:0,y:0},{x:0,y:0},{x:0,y:10},{x:10,y:0}), 90);
// Scores
assert.strictEqual(M.scoreInRange(120,100,140,30), 100);
assert.strictEqual(M.scoreInRange(155,100,140,30), 50);
assert.strictEqual(M.scoreInRange(300,100,140,30), 0);
// Targets + age adjust
const T = require('../targets.json');
const t = M.targetsFor(T, 7, 'Beginner');
assert.strictEqual(t.skating.kneeAngle.min, 120);
near(t.skating.strideAngle.max, 40);
assert.strictEqual(T.skating.Beginner.kneeAngle.min, 110);   // original untouched
// Reps: two squats
const series = [170,150,120,95,120,160,170,130,100,150,165].map((k,i)=>({t:i,knee:k,lean:20+i}));
const reps = M.findReps(series);
assert.strictEqual(reps.length, 2);
assert.strictEqual(reps[0].bottomKnee, 95);
assert.strictEqual(reps[1].bottomKnee, 100);
// Heart rate: form drops when bpm is high
const hr = [{t:0,bpm:100},{t:60,bpm:170}];
const sc = []; for (let t=0;t<=60;t+=5) sc.push({t, score: t<30?90:55});
const r = M.formVsHeartRate(sc, hr, 8);
assert.ok(r.enough && r.sloppy && r.drop > 10);
near(M.interpolate(hr,30), 135);
assert.strictEqual(M.interpolate(hr,500), null);
console.log('All angle tests passed');
