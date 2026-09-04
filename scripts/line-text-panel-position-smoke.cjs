const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "src", "editor-line.css"), "utf8");
const homeCss = fs.readFileSync(path.join(__dirname, "..", "src", "home.css"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styleManager = fs.readFileSync(path.join(__dirname, "..", "src", "core", "styleManager.js"), "utf8");
const editorObjectManager = fs.readFileSync(path.join(__dirname, "..", "src", "core", "editorObjectManager.js"), "utf8");
const documentSerializer = fs.readFileSync(path.join(__dirname, "..", "src", "core", "documentSerializer.js"), "utf8");
const responsiveScale = fs.readFileSync(path.join(__dirname, "..", "src", "responsive-scale.js"), "utf8");

const baseRule = css.match(/\.line-text-panel\s*\{([^}]*)\}/)?.[1] || "";
const focusSectionStart = css.indexOf("/* Sanal klavye acikken");
const focusSectionEnd = css.indexOf(".road-pocket-cycle-btn", focusSectionStart);
const focusSection = css.slice(focusSectionStart, focusSectionEnd);
const ipPanelSectionStart = css.indexOf(".road-ip-icon-btn");
const ipPanelCss = css.slice(ipPanelSectionStart);
const sideIp = index.slice(index.indexOf('<div id="editorSideIp"'), index.indexOf('<div id="closedShapeDraftPanel"'));
const lineTextPanel = index.slice(index.indexOf('<div id="lineTextPanel"'), index.indexOf('<div id="vehicleLabelPanel"'));
const lineTextStylePanel = index.slice(index.indexOf('<div id="lineTextStylePanel"'), index.indexOf('<div id="lineTextPanel"'));
const lineStylePanel = index.slice(index.indexOf('<div id="lineStylePanel"'), index.indexOf('<div id="strokeColorPanel"'));
const drawingToolGrid = index.slice(index.indexOf('<div class="rail-tool-grid" id="gridCizimAraclari">'), index.indexOf('</div>', index.indexOf('<div class="rail-tool-grid" id="gridCizimAraclari">')));

assert.match(baseRule, /--line-text-panel-right:\s*calc\(var\(--editor-rail-width\)\s*\+\s*0\.5rem\)/);
assert.match(baseRule, /--line-text-panel-width:\s*min\(18\.3125rem,\s*calc\(100vw\s*-\s*var\(--editor-rail-width\)\s*-\s*1rem\)\)/);
assert.match(baseRule, /right:\s*var\(--line-text-panel-right\)/);
assert.match(baseRule, /width:\s*var\(--line-text-panel-width\)/);
assert.ok(focusSectionStart >= 0 && focusSectionEnd > focusSectionStart);
assert.doesNotMatch(focusSection, /\.kroki-text-entry-host\.line-text-panel/);
assert.doesNotMatch(focusSection, /:is\([^)]*\.line-text-panel/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+:is\(\s*\.line-text-input/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+\.line-text-size-picker/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+:is\(\s*\.line-text-picker-btn/);
assert.match(homeCss, /\):not\(\.line-text-input,\s*\.traffic-sign-text-input,\s*\.free-text-input\)\s*\{/);
assert.ok(ipPanelSectionStart >= 0, "IP ikon stilleri bulunmali");
assert.doesNotMatch(ipPanelCss, /vector-effect:\s*non-scaling-stroke/, "IP ve panel ikon stroke degerleri ikonla birlikte olceklenmeli");
assert.match(css, /\.editor-cizgi\s*\{[^}]*vector-effect:\s*none/s, "tuval cizgisi krokiyle birlikte olceklenmeli");
assert.match(css, /\.line-style-arrow-btn svg \*,\s*\.line-style-tool-btn svg \*\s*\{\s*vector-effect:\s*none/);
assert.match(css, /\.line-text-icon-btn path,\s*\.line-text-icon-btn line,\s*\.line-text-icon-btn rect\s*\{\s*vector-effect:\s*none/);
assert.doesNotMatch(styleManager, /non-scaling-stroke/, "belge geometrisi ekran kalinligina sabitlenmemeli");
const allowedNonScalingSelectors = /editor-road-lane-highlight|editor-road-boundary-active|editor-road-pocket-island-highlight|editor-object-selection|editor-line-selection|editor-road-selection|editor-multi-selection|editor-select-marquee/;
const nonScalingBlocks = css.match(/[^{}]+\{[^{}]*vector-effect:\s*non-scaling-stroke[^{}]*\}/g) || [];
assert.ok(nonScalingBlocks.length > 0, "secim cizgileri ekran kalinligini korumali");
nonScalingBlocks.forEach((block) => assert.match(block, allowedNonScalingSelectors, "yalniz secim ve aktif duzenleme vurgulari non-scaling kullanabilir"));
assert.match(sideIp, /id="btnLineTextStyle"/);
assert.match(sideIp, /id="btnLineTextAlign"/);
assert.match(sideIp, /id="iconLineTextAlign"/);
assert.match(css, /\.editor-side-ip\.is-line-family-ip #btnLineText\s*\{\s*order:\s*10;/);
assert.match(css, /\.editor-side-ip\.is-line-family-ip #btnLineTextStyle\s*\{\s*order:\s*20;/);
assert.match(css, /\.editor-side-ip\.is-line-family-ip #btnLineColor\s*\{\s*order:\s*30;/);
assert.match(css, /\.editor-side-ip\.is-line-family-ip #lineStrokeWidthStepper\s*\{\s*order:\s*40;/);
assert.match(css, /\.editor-side-ip\.is-line-family-ip #btnLineStyle\s*\{\s*order:\s*50;/);
assert.match(css, /\.editor-side-ip\.is-shape-family-ip #btnLineText\s*\{\s*order:\s*10;/);
assert.match(css, /\.editor-side-ip\.is-shape-family-ip #btnLineTextStyle\s*\{\s*order:\s*20;/);
assert.match(css, /\.editor-side-ip\.is-shape-family-ip #btnLineColor\s*\{\s*order:\s*30;/);
assert.match(css, /\.editor-side-ip\.is-shape-family-ip #btnShapeFill\s*\{\s*order:\s*31;/);
assert.match(css, /\.editor-side-ip\.is-shape-family-ip #lineStrokeWidthStepper\s*\{\s*order:\s*40;/);
assert.match(css, /\.editor-side-ip\.is-shape-family-ip #objectRotateStepper\s*\{\s*order:\s*41;/);
assert.match(css, /\.editor-side-ip\.is-shape-family-ip #btnLineStyle\s*\{\s*order:\s*50;/);
assert.match(css, /\.editor-side-ip\.is-shape-family-ip #btnClosedShapeEdit\s*\{\s*order:\s*60;/);
assert.match(styleManager, /const isLineFamily = isLineToolType\(model\?\.type\);/);
assert.match(styleManager, /function usesShapeStylePanel\(type\) \{\s*return isBasicShapeToolType\(type\) \|\| type === "closedShape";/);
assert.match(styleManager, /const isShapeFamily = usesShapeStylePanel\(model\?\.type\);/);
assert.match(styleManager, /classList\.toggle\("is-line-family-ip", isLineFamily\)/);
assert.match(styleManager, /classList\.toggle\("is-line-family-panel", isLineFamily\)/);
assert.match(styleManager, /classList\.toggle\("is-shape-family-ip", isShapeFamily\)/);
assert.match(styleManager, /classList\.toggle\("is-shape-family-panel", isShapeFamily\)/);
assert.match(styleManager, /controls\?\.textStyleButton\?\.classList\.toggle\("gizli", !usesStructuredTextStylePanel\(model\?\.type\) \|\| noText\)/);
assert.match(styleManager, /controls\?\.textAlign\?\.classList\.toggle\("gizli", isTextObject \|\| noText \|\| isCatalogObject \|\| isLineFamily \|\| isShapeFamily \|\| isCallout\)/);
assert.match(styleManager, /controls\.textAlign\?\.addEventListener\("click",/);
assert.match(styleManager, /anchor:\s*nextChoiceId\(label\.position\.anchor, TEXT_ANCHORS\)/);
assert.match(styleManager, /align:\s*nextChoiceId\(label\.position\.align, TEXT_ALIGNS\)/);
assert.doesNotMatch(lineTextPanel, /<button\b/);
assert.match(lineTextPanel, /id="lineTextInput"/);
assert.doesNotMatch(css, /\.line-text-actions\s*\{/);
assert.match(lineTextStylePanel, /class="line-text-style-tool-row is-position"/);
assert.match(lineTextStylePanel, /class="line-text-style-tool-row is-format"/);
assert.match(css, /\.line-text-style-size\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/s);
assert.match(css, /\.line-text-style-size \.line-text-picker-value\s*\{[^}]*min-width:\s*3\.25rem/s);
assert.match(css, /\.line-style-tool-row,\s*\.line-text-style-tool-row\.is-position\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /\.line-text-style-panel\.is-shape-family-panel \.line-text-style-tool-row\.is-position,\s*\.line-text-style-panel\.is-callout-panel \.line-text-style-tool-row\.is-position,\s*\.line-text-style-panel\.is-text-object-panel \.line-text-style-tool-row\.is-position\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(css, /\.line-text-style-tool-row\.is-format\s*\{\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(css, /\.line-style-tool-btn\s*\{[^}]*width:\s*100%/s);
assert.match(css, /#iconLinePanelCap path:nth-child\(-n \+ 2\)\s*\{\s*stroke-width:\s*5/);

for (const id of [
  "btnLineTextStyleSizeMinus",
  "btnLineTextStyleSizePlus",
  "valLineTextStyleSize",
  "btnLineTextStyleAnchor",
  "btnLineTextStyleSide",
  "lineTextStyleColorInput",
  "lineTextStyleOpacityInput",
  "btnLineTextStyleBold",
  "btnLineTextStyleItalic",
  "btnLineTextStyleUnderline"
]) assert.match(lineTextStylePanel, new RegExp(`id="${id}"`), `${id} metin stil panelinde olmali`);

for (const id of [
  "lineAdvancedStyleControls",
  "btnLinePanelStartArrow",
  "btnLinePanelEndArrow",
  "btnLinePanelCap"
]) assert.match(lineStylePanel, new RegExp(`id="${id}"`), `${id} cizgi stil panelinde olmali`);

for (const id of ["shapeAdvancedStyleControls", "btnLinePanelFillPattern", "btnLineCap", "iconLineCap"]) {
  assert.match(lineStylePanel, new RegExp(`id="${id}"`), `${id} sekil stil panelinde olmali`);
}
assert.doesNotMatch(sideIp, /id="btnLineCap"/, "Sekil cizgi ucu dugmesi dogrudan IP icinde olmamali");
assert.doesNotMatch(sideIp, /id="btnDirectLineCap"|id="iconDirectLineCap"/, "Eski dogrudan cizgi ucu kontrolu kaldirilmali");
assert.match(sideIp, /id="btnClosedShapeEdit"[\s\S]*class="closed-shape-edit-icon"[\s\S]*class="closed-shape-done-icon"/);
assert.match(css, /\.side-ip-shape-edit-btn\.is-active \.closed-shape-edit-icon\s*\{\s*display:\s*none;/);
assert.match(css, /\.side-ip-shape-edit-btn\.is-active \.closed-shape-done-icon\s*\{\s*display:\s*block;/);

const closedShapeIndex = drawingToolGrid.indexOf('data-arac="kapali"');
const calloutIndex = drawingToolGrid.indexOf('data-arac="olcu"');
const textIndex = drawingToolGrid.indexOf('data-arac="metin"');
assert.ok(closedShapeIndex >= 0 && closedShapeIndex < calloutIndex && calloutIndex < textIndex, "Kapali Bezier, Oklu Metin ve Abc sirasi korunmali");

for (const id of [
  "btnLineStartArrow",
  "iconLineStartArrow",
  "btnLineEndArrow",
  "iconLineEndArrow",
  "btnLineSnap",
  "iconLineSnap"
]) assert.doesNotMatch(index, new RegExp(`id="${id}"`), `${id} eski dogrudan IP yolundan kaldirilmali`);
assert.doesNotMatch(css, /\.side-ip-arrow-(?:stack|btn)|\.side-ip-snap-(?:btn|icon)/);
assert.doesNotMatch(styleManager, /lineOnlyControls|lineSnapButton|lineSnapIcon|startArrowIcon|endArrowIcon|controls\.(?:arrowStack|startArrow|endArrow)/);

assert.match(styleManager, /controls\.textStyleButton\?\.addEventListener\("click", \(\) => togglePanel\(textStylePanel/);
assert.match(styleManager, /controls\.textStyleColorInput\?\.addEventListener\("input", \(\) => updateLineTextColor/);
assert.match(styleManager, /controls\.textStyleOpacityInput\?\.addEventListener\("input",/);
assert.match(styleManager, /function updateLineTextStyleSize\(delta\) \{\s*const entry = activeEntry\(\);\s*if \(!entry \|\| entry\.multi \|\| !usesStructuredTextStylePanel\(entry\.model\.type\)\) return;/);
assert.match(styleManager, /function updateLineTextColor\(color\) \{\s*const entry = activeEntry\(\);\s*if \(!entry \|\| entry\.multi \|\| !usesStructuredTextStylePanel\(entry\.model\.type\)\) return;/);
assert.match(styleManager, /colorLinked:\s*String\(color\)\.toLowerCase\(\) === String\(style\.stroke\)\.toLowerCase\(\)/);
assert.match(styleManager, /colorLinked:\s*element\.dataset\.labelColorLinked/);
assert.match(styleManager, /element\.dataset\.labelColorLinked = label\.colorLinked \? "1" : "0"/);
assert.match(styleManager, /if \(isLineToolType\(model\.type\)\) \{\s*element\.dataset\.labelBold = label\.bold \? "1" : "0";\s*element\.dataset\.labelItalic = label\.italic \? "1" : "0";\s*element\.dataset\.labelUnderline = label\.underline \? "1" : "0";/);
assert.match(editorObjectManager, /const shouldSyncLabelColor = Object\.prototype\.hasOwnProperty\.call\(patch \|\| \{\}, "stroke"\) && currentLabel\.colorLinked;/);
assert.match(editorObjectManager, /color:\s*style\.stroke, colorLinked:\s*true/);
assert.match(documentSerializer, /label:\s*styleManager\.normalizeLabel\(model\?\.label, type, style\)/);
assert.match(documentSerializer, /label:\s*styleManager\.normalizeLabel\(model\.label, model\.type, style\)/);
assert.match(editorObjectManager, /label\.style\.fontWeight = model\.label\.bold \? "900" : "500";/);
assert.match(editorObjectManager, /label\.style\.fontStyle = model\.label\.italic \? "italic" : "normal";/);
assert.match(editorObjectManager, /label\.style\.textDecoration = model\.label\.underline \? "underline" : "none";/);
assert.match(editorObjectManager, /textElement\.style\.fontWeight = model\.label\.bold \? "900" : "500";/);
assert.match(editorObjectManager, /textElement\.style\.fontStyle = model\.label\.italic \? "italic" : "normal";/);
assert.match(editorObjectManager, /textElement\.style\.textDecoration = model\.label\.underline \? "underline" : "none";/);
assert.match(styleManager, /if \(isBasicShapeToolType\(model\.type\)\) \{\s*element\.dataset\.labelBold = label\.bold \? "1" : "0";\s*element\.dataset\.labelItalic = label\.italic \? "1" : "0";\s*element\.dataset\.labelUnderline = label\.underline \? "1" : "0";/);
assert.match(styleManager, /fillPatternButtons:\s*Array\.from\(document\.querySelectorAll\("#btnFillPattern, #btnLinePanelFillPattern"\)\)/);
assert.match(styleManager, /function fillPatternAnchor\(button\) \{\s*return button === controls\?\.fillPatternPanelButton \? controls\?\.styleButton : button;/);
assert.match(styleManager, /controls\.fillPatternButtons\.forEach\(\(button\) => \{\s*button\.addEventListener\("click", \(\) => togglePanel\(fillPatternPanel, button, fillPatternAnchor\(button\)\)\)/);
assert.match(styleManager, /const shouldResetFill = pattern === "none" && String\(currentStyle\.fill\)\.toLowerCase\(\) !== "#ffffff";/);
assert.match(styleManager, /if \(currentStyle\.fillPattern === pattern && !shouldResetFill\) return;/);
assert.match(styleManager, /if \(pattern === "none"\) patch\.fill = "#ffffff";/);
assert.match(styleManager, /bindArrowButton\(controls\.linePanelStartArrow, "arrowStart"\)/);
assert.match(styleManager, /controls\.linePanelCapButton\?\.addEventListener\("click", cycleLineCap\)/);
assert.match(styleManager, /controls\.shapePanelCapButton\?\.addEventListener\("click", cycleLineCap\)/);
assert.match(styleManager, /const pointEditLabel = pointEditActive \? "Nokta duzenlemesini bitir" : "Sekli duzenle";/);
assert.doesNotMatch(styleManager, /directLineCapButton|directLineCapIcon/);
assert.match(styleManager, /function repositionTextEntryPanel\(panel, button\)/);
assert.match(styleManager, /if \(textEntryActive\) return;\s*repositionPanel\(panel, button\)/);
assert.match(styleManager, /repositionTextEntryPanel\(textPanel, controls\.textButton\)/);
assert.match(responsiveScale, /activeTextEntryHost\?\.matches\?\.\("\.free-text-composer, \.line-text-panel"\)/);

assert.match(index, /kroki-build" content="[^"]+"/);

global.window = { Kroki: { EditorUtils: {} } };
require(path.join(__dirname, "..", "src", "editor-stroke-style.js"));
require(path.join(__dirname, "..", "src", "core", "styleManager.js"));
const runtimeStyleManager = global.window.Kroki.StyleManager;
for (const type of ["line", "arc", "bezier"]) {
  const linked = runtimeStyleManager.normalizeLabel({}, type, { stroke: "#123456" });
  assert.equal(linked.color, "#123456", `${type} varsayilan metin rengi stroke rengini izlemeli`);
  assert.equal(linked.colorLinked, true, `${type} varsayilan renk bagini korumali`);
  const legacyLinked = runtimeStyleManager.normalizeLabel({ color: "#123456" }, type, { stroke: "#123456" });
  assert.equal(legacyLinked.colorLinked, true, `${type} eski esit renkleri bagli kabul etmeli`);
  const detached = runtimeStyleManager.normalizeLabel({ color: "#654321" }, type, { stroke: "#123456" });
  assert.equal(detached.colorLinked, false, `${type} farkli metin rengini bagimsiz kabul etmeli`);
}
assert.equal(Object.hasOwn(runtimeStyleManager.normalizeLabel({}, "text", { stroke: "#123456" }), "colorLinked"), false);
delete global.window;

console.log("line and shape family IP/text panel stability smoke: ok");
