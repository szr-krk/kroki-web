const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const adapterSource = read("src/adapters/calloutAdapter.js");
const styleManagerSource = read("src/core/styleManager.js");
const multiSelectSource = read("src/core/multiSelectManager.js");
const indexSource = read("index.html");

assert.match(adapterSource, /const BOX_RADIUS_FACTOR = 0\.18;/);
assert.match(adapterSource, /rx: String\(radius\),\s*ry: String\(radius\)/s);
assert.match(adapterSource, /roundedBoxPath\(box, boxRadius\(model, box\)\)/);
assert.match(adapterSource, /const insetProtection = styleFor\(model\)\.strokeWidth \/ 2;/);
assert.match(adapterSource, /strokeWidth: style\.strokeWidth/);
assert.match(adapterSource, /calloutBoxSignature\(label, model\.style\)/);
assert.match(multiSelectSource, /calloutBoxSignature\(draft\.label, draft\.style\)/);

const arrowFunction = adapterSource.match(/function arrowGeometry[\s\S]+?function normalizedVector/)?.[0] || "";
assert.ok(arrowFunction, "callout arrow geometry function must exist");
assert.match(arrowFunction, /const headSize = Math\.max\(3, strokeWidth\) \* 2 \+ 10;/);
assert.match(arrowFunction, /const notchX = tip\.x - ux \* headLength \* 0\.6;/);
assert.match(arrowFunction, /const leaderInset = Math\.min\(headLength \* 0\.48, Math\.max\(0, length - 1\)\);/);
assert.match(arrowFunction, /"M", baseX[\s\S]+?"L", tip\.x, tip\.y,[\s\S]+?"L", baseX[\s\S]+?"L", notchX, notchY,[\s\S]+?"Z"/);
assert.match(adapterSource, /class: "editor-callout-arrow",[\s\S]+?fill: style\.stroke,[\s\S]+?stroke: "none"/);
assert.match(adapterSource, /x2: String\(arrowGeometryData\.leaderEnd\.x\),\s*y2: String\(arrowGeometryData\.leaderEnd\.y\)/s);
assert.match(adapterSource, /\[leader, boxElement\]\.forEach\(\(item\) => applyGeometryStrokeScaling\(item, dashed\)\);/);
assert.doesNotMatch(adapterSource, /applyGeometryStrokeScaling\(boxElement, true\)/);

const visibilityLine = styleManagerSource.match(/controls\?\.strokeStepper\?\.classList\.toggle\("gizli",[^;]+;/)?.[0] || "";
assert.ok(visibilityLine, "stroke picker visibility rule must exist");
assert.doesNotMatch(visibilityLine, /isCallout/);
assert.match(visibilityLine, /isRoadObject \|\| isCatalogObject \|\| isVehicleObject/);

assert.match(indexSource, /id="calloutTextSizeStepper"/);
assert.match(indexSource, /id="lineStrokeWidthStepper"/);
assert.match(indexSource, /20260809-callout-leader-inset-v1/);

console.log("callout style smoke: ok");
