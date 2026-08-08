const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const responsiveScale = read("src/responsive-scale.js");
const editorCss = read("src/editor-line.css");
const homeCss = read("src/home.css");
const styleManager = read("src/core/styleManager.js");
const vehicleAdapter = read("src/adapters/vehicleAdapter.js");

assert.match(responsiveScale, /TOUCH_TEXT_ENTRY_QUERY\s*=\s*"\(hover: none\) and \(pointer: coarse\)"/);
assert.match(responsiveScale, /classList\.toggle\("kroki-touch-entry-mode"/);
assert.doesNotMatch(editorCss, /:root\.kroki-text-entry-active(?!\.kroki-touch-entry-mode)/);
assert.doesNotMatch(homeCss, /:root\.kroki-text-entry-active(?!\.kroki-touch-entry-mode)/);

assert.match(index, /id="objectRotateStepper"/);
assert.match(index, /id="objectRotateInput"/);
assert.match(styleManager, /typeof adapter\?\.setRotation === "function"/);
assert.match(styleManager, /entry\.adapter\.setRotation\(draft, nextRotation\)/);
assert.match(styleManager, /bindHoldAction\(controls\.objectRotateMinus/);
assert.match(styleManager, /bindHoldAction\(controls\.objectRotatePlus/);

for (const file of [
  "src/adapters/circleAdapter.js",
  "src/adapters/ellipseAdapter.js",
  "src/adapters/rectangleAdapter.js",
  "src/adapters/textAdapter.js",
  "src/adapters/closedShapeAdapter.js"
]) {
  const adapter = read(file);
  assert.match(adapter, /getRotation\(model\)/, `${file} getRotation sunmali`);
  assert.match(adapter, /setRotation\(model, rotation\)/, `${file} setRotation sunmali`);
}

const closedShapeAdapter = read("src/adapters/closedShapeAdapter.js");
assert.match(closedShapeAdapter, /transformGeometry\(model, \(item\) => rotatePointAround\(item, center, delta\)\)/);
assert.match(vehicleAdapter, /label\.style\.fontSize\s*=\s*`\$\{vehicleLabelFontSize\(metrics\)\}px`/);

console.log("ui rotation and panel stability smoke: ok");
