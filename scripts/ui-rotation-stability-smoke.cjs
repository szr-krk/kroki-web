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
const selectionManager = read("src/core/selectionManager.js");
const vehicleAdapter = read("src/adapters/vehicleAdapter.js");
const controlPointManager = read("src/core/controlPointManager.js");

const rotateRightPath = "M 12.48 3.43 A 9.09 9.09 0 0 1 18.3 5.55 L 18.3 2.35 L 19.94 2.35 L 19.94 8.85 L 13.44 8.85 L 13.44 7.21 L 17.7 7.21 A 7.46 7.46 0 1 0 19.17 15.86 L 20.63 16.59 A 9.11 9.11 0 1 1 12.48 3.43 Z";
const rotateLeftPath = "M 12.48 20.57 A 9.09 9.09 0 0 0 18.3 18.45 L 18.3 21.65 L 19.94 21.65 L 19.94 15.15 L 13.44 15.15 L 13.44 16.79 L 17.7 16.79 A 7.46 7.46 0 1 1 19.17 8.14 L 20.63 7.41 A 9.11 9.11 0 1 0 12.48 20.57 Z";

function rotateButtonMarkup(id) {
  const start = index.indexOf(`<button id="${id}"`);
  const end = index.indexOf("</button>", start);
  assert.ok(start >= 0 && end > start, `${id} bulunmali`);
  return index.slice(start, end + "</button>".length);
}

for (const id of ["btnTrafficSignRotatePlus", "btnVehicleRotatePlus", "btnObjectRotatePlus"]) {
  const markup = rotateButtonMarkup(id);
  assert.ok(markup.includes(rotateRightPath), `${id} saga dondurme yolunu kullanmali`);
  assert.match(markup, /<svg class="side-ip-rotate-icon" viewBox="0 0 24 24" aria-hidden="true">/);
  assert.match(markup, /<path [^>]*fill="currentColor"><\/path>/);
  assert.doesNotMatch(markup, /stroke=/);
}

for (const id of ["btnTrafficSignRotateMinus", "btnVehicleRotateMinus", "btnObjectRotateMinus"]) {
  const markup = rotateButtonMarkup(id);
  assert.ok(markup.includes(rotateLeftPath), `${id} sola dondurme yolunu kullanmali`);
  assert.match(markup, /<svg class="side-ip-rotate-icon" viewBox="0 0 24 24" aria-hidden="true">/);
  assert.match(markup, /<path [^>]*fill="currentColor"><\/path>/);
  assert.doesNotMatch(markup, /stroke=/);
}

assert.match(editorCss, /\.side-ip-rotate-icon\s*\{[^}]*width:\s*1\.5rem;[^}]*height:\s*1\.5rem;[^}]*fill:\s*currentColor;/s);

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
assert.match(selectionManager, /styleControls:\s*dragState\.cpId === "rotate"/);
assert.match(controlPointManager, /const CP_TOUCH_DIAMETER_PX = 72/);
assert.match(controlPointManager, /const ROTATE_ICON_SIZE_PX = 36/);
assert.match(controlPointManager, /const ROTATE_ICON_PATH = "M12 6V3L8 7L12 11V8C14\.21/);
assert.match(controlPointManager, /utils\.createSvgElement\("path",\s*\{\s*class: "editor-object-cp-visual editor-object-cp-rotate-icon"/s);
assert.match(controlPointManager, /handle\.append\(\s*utils\.createSvgElement\("circle", \{ class: "editor-object-cp-hit" \}\),\s*visual\s*\)/s);
assert.match(controlPointManager, /const rotation = !isRotate && Number\.isFinite\(cp\.angle\)/);
assert.match(editorCss, /\.editor-object-cp-rotate-icon\s*\{[^}]*fill:\s*#059669;[^}]*stroke:\s*none;[^}]*stroke-width:\s*0;/s);
assert.match(editorCss, /\.editor-object-cp\.is-preselect \.editor-object-cp-rotate-icon\s*\{[^}]*fill:\s*#dc2626;/s);

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
