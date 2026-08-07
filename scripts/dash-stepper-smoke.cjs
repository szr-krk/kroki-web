const assert = require("node:assert/strict");
const path = require("node:path");

global.window = {};
require(path.join(__dirname, "..", "src", "editor-stroke-style.js"));

const { stepPositiveMetric } = global.window.krokiStrokeStyle;

assert.equal(stepPositiveMetric(12, -1), 11);
assert.equal(stepPositiveMetric(1.4, -1), 1);
assert.equal(stepPositiveMetric(1, -1), 0.9);
assert.equal(stepPositiveMetric(0.9, -1), 0.8);
assert.equal(stepPositiveMetric(0.1, -1), 0.1);
assert.equal(stepPositiveMetric(0.9, 1), 1);
assert.equal(stepPositiveMetric(1, 1), 2);
assert.equal(stepPositiveMetric(1.4, 1), 2);

console.log("dash stepper smoke: ok");
