const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const responsiveScale = read("src/responsive-scale.js");
const editorCss = read("src/editor-line.css");
const homeCss = read("src/home.css");

assert.match(index, /kroki-build" content="20260808-tablet-free-text-stable-v1"/);
assert.match(
  responsiveScale,
  /activeTextEntryHost\?\.classList\.contains\("free-text-composer"\)/,
  "freeTextComposer icin scrollIntoView devre disi kalmali"
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
