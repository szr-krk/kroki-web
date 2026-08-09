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
const composerSource = read("src/ui/editorTextComposer.js");

const composerMarkup = index.match(/<div id="freeTextComposer"[\s\S]*?<\/div>/)?.[0] || "";
assert.ok(composerMarkup, "serbest metin giris kutusu bulunmali");
assert.match(composerMarkup, /<textarea id="freeTextInput"/);
assert.doesNotMatch(composerMarkup, /<button|free-text-actions|type="color"/);
assert.doesNotMatch(index, /btnFreeText(?:Size|Opacity|Align|Bold|Italic|Underline|Color|Cancel|Done)|freeTextColorInput|btnSideText/);
assert.doesNotMatch(composerSource, /sizeMinus|sizePlus|opacityMinus|opacityPlus|controls\.(?:align|bold|italic|underline|color|done|cancel)/);
assert.doesNotMatch(composerSource, /controls\.input\?\.addEventListener\("blur",/);
assert.match(composerSource, /document\.addEventListener\("pointerdown", \(event\) => \{/);
assert.match(composerSource, /panel\.contains\(event\.target\)/);
assert.match(composerSource, /event\.target\?\.closest\?\.\("#btnLineText"\)/);
assert.match(composerSource, /event\.target\?\.closest\?\.\("#editorCanvas"\)/);
assert.match(composerSource, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
assert.match(composerSource, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key === "Enter"/);
assert.match(composerSource, /if \(event\.key === "Escape"\) cancelText\(\)/);
assert.match(composerSource, /initialEditSnapshot = cloneModel\(model\)/);
assert.match(composerSource, /manager\.updateModel\(snapshot\.id, \(\) => snapshot, \{ skipHistory: true \}\)/);
assert.match(composerSource, /isOpenFor\(modelId\)/);
assert.match(composerSource, /complete: submitText/);

assert.match(styleManager, /return type === "text" \|\| isLineToolType\(type\) \|\| isBasicShapeToolType\(type\) \|\| type === "callout";/);
assert.match(styleManager, /controls\?\.sideIp\?\.classList\.toggle\("is-text-object-ip", isTextObject\)/);
assert.match(styleManager, /controls\?\.textStyleSizeSection\?\.classList\.toggle\("gizli", isTextObject \|\| isCallout\)/);
assert.match(styleManager, /controls\?\.colorButton\?\.classList\.toggle\("gizli", isTextObject \|\| isRoadObject/);
assert.match(styleManager, /if \(isTextObjectEntry\(entry\)\) updateStyle\(\{ opacity \}\);/);
assert.match(styleManager, /renderFreeTextAlignIcon\(controls\.textStyleAnchorIcon, align\.id\);/);
assert.match(styleManager, /Kroki\.FreeTextComposer\?\.isOpenFor\?\.\(entry\.model\.id\)/);
assert.match(styleManager, /Kroki\.FreeTextComposer\.complete\?\.\(\)/);
for (const [id, order] of [["btnLineText", 10], ["btnLineTextStyle", 20], ["lineStrokeWidthStepper", 30], ["objectRotateStepper", 40]]) {
  assert.match(editorCss, new RegExp(`\\.editor-side-ip\\.is-text-object-ip #${id}\\s*\\{\\s*order:\\s*${order};`));
}

assert.match(index, /kroki-build" content="[^"]+"/);
assert.match(index, /src\/responsive-scale\.js\?v=20260809-line-family-v1/);
assert.match(
  responsiveScale,
  /activeTextEntryHost\?\.matches\?\.\("\.free-text-composer, \.line-text-panel"\)/,
  "sabit metin panelleri icin scrollIntoView devre disi kalmali"
);
assert.doesNotMatch(
  editorCss,
  /kroki-touch-entry-mode[^\{]*\.kroki-text-entry-host\.free-text-composer/,
  "tablet odagi freeTextComposer konumunu veya olcusunu degistirmemeli"
);

const touchHostSelectors = editorCss.match(
  /:root\.kroki-text-entry-active\.kroki-touch-entry-mode\s+\.kroki-text-entry-host:not\(\.line-text-panel\)[^{]*/g
) || [];
for (const selector of touchHostSelectors) {
  assert.match(
    selector,
    /:not\(\.free-text-composer\)/,
    `tablet giris kurali freeTextComposer'i dislamali: ${selector.trim()}`
  );
}

assert.match(
  homeCss,
  /:not\(\.line-text-input, \.traffic-sign-text-input, \.free-text-input\)/,
  "genel tablet input olculeri freeTextInput'a uygulanmamali"
);

console.log("free text tablet stability smoke: ok");
