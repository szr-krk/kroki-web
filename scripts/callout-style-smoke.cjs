const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const adapterSource = read("src/adapters/calloutAdapter.js");
const styleManagerSource = read("src/core/styleManager.js");
const multiSelectSource = read("src/core/multiSelectManager.js");
const indexSource = read("index.html");
const cssSource = read("src/editor-line.css");

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
assert.doesNotMatch(adapterSource, /calloutRotation|setCalloutRotation|getRotation\(model\)|setRotation\(model, rotation\)/);
assert.match(adapterSource, /strokeWidth:\s*2,\s*\.\.\.\(initialData\.style \|\| \{\}\),\s*fill:\s*DEFAULT_FILL/);

const visibilityLine = styleManagerSource.match(/controls\?\.strokeStepper\?\.classList\.toggle\("gizli",[^;]+;/)?.[0] || "";
assert.ok(visibilityLine, "stroke picker visibility rule must exist");
assert.match(visibilityLine, /isCallout \|\| isRoadObject \|\| isCatalogObject \|\| isVehicleObject/);

assert.match(indexSource, /id="calloutTextSizeStepper"/);
assert.match(indexSource, /id="lineStrokeWidthStepper"/);
assert.match(indexSource, /id="lineTextStyleSizeSection"/);
assert.match(indexSource, /id="shapeAdvancedStyleLabel"/);
assert.match(indexSource, /calloutAdapter\.js\?v=20260810-callout-ip-v3/);
assert.match(styleManagerSource, /const isCallout = adapter\?\.type === "callout";/);
assert.match(styleManagerSource, /return type === "text" \|\| isLineToolType\(type\) \|\| isBasicShapeToolType\(type\) \|\| type === "callout";/);
assert.match(styleManagerSource, /controls\?\.fillButton\?\.classList\.toggle\("gizli", !hasFill \|\| isCallout\)/);
assert.match(styleManagerSource, /controls\?\.textStyleSizeSection\?\.classList\.toggle\("gizli", isTextObject \|\| isCallout\)/);
assert.doesNotMatch(indexSource, /btnSideTextBold|btnSideTextItalic|btnSideTextUnderline|side-ip-text-format-stack/);
assert.doesNotMatch(styleManagerSource, /sideTextBold|sideTextItalic|sideTextUnderline|sideTextFormatStack|textObjectControls/);
assert.match(styleManagerSource, /controls\?\.textAlign\?\.classList\.toggle\("gizli", isTextObject \|\| noText \|\| isCatalogObject \|\| isLineFamily \|\| isShapeFamily \|\| isCallout\)/);
assert.match(styleManagerSource, /controls\?\.stylePanel\?\.classList\.toggle\("is-callout-panel", isCallout\)/);
assert.match(styleManagerSource, /controls\?\.shapeAdvancedStyleControls\?\.classList\.toggle\("gizli", !isShapeFamily && !isCallout\)/);
assert.match(styleManagerSource, /controls\.shapeAdvancedStyleLabel\.textContent = isCallout \? "Cizgi davranisi" : "Dolgu deseni"/);
for (const [id, order] of [["btnLineText", 10], ["btnLineTextStyle", 20], ["btnLineColor", 30], ["calloutTextSizeStepper", 40], ["btnLineStyle", 50]]) {
  assert.match(cssSource, new RegExp(`\\.editor-side-ip\\.is-callout-ip #${id}\\s*\\{\\s*order:\\s*${order};`));
}
assert.doesNotMatch(cssSource, /\.editor-side-ip\.is-callout-ip #objectRotateStepper/);
assert.match(cssSource, /\.line-style-panel\.is-callout-panel \.line-style-tool-row\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);

global.window = { Kroki: { EditorUtils: {} } };
require(path.join(root, "src", "editor-stroke-style.js"));
require(path.join(root, "src", "core", "styleManager.js"));
const normalizedCalloutStyle = global.window.Kroki.StyleManager.normalizeStyle({ fill: "#ff00ff", fillOpacity: 0.2 }, "callout");
assert.equal(normalizedCalloutStyle.fill, "#ffffff");
assert.equal(normalizedCalloutStyle.fillOpacity, 1);
assert.equal(normalizedCalloutStyle.strokeWidth, 2);
delete global.window;

console.log("callout style smoke: ok");
