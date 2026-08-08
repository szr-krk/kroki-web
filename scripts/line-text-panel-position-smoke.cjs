const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "src", "editor-line.css"), "utf8");
const homeCss = fs.readFileSync(path.join(__dirname, "..", "src", "home.css"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styleManager = fs.readFileSync(path.join(__dirname, "..", "src", "core", "styleManager.js"), "utf8");

const baseRule = css.match(/\.line-text-panel\s*\{([^}]*)\}/)?.[1] || "";
const focusSectionStart = css.indexOf("/* Sanal klavye acikken");
const focusSectionEnd = css.indexOf(".road-pocket-cycle-btn", focusSectionStart);
const focusSection = css.slice(focusSectionStart, focusSectionEnd);
const sideIp = index.slice(index.indexOf('<div id="editorSideIp"'), index.indexOf('<div id="closedShapeDraftPanel"'));
const lineTextPanel = index.slice(index.indexOf('<div id="lineTextPanel"'), index.indexOf('<div id="vehicleLabelPanel"'));
const removedControlIds = [
  "btnLineTextSizeMinus",
  "btnLineTextSizePlus",
  "valLineTextSize",
  "btnLineTextSide",
  "iconLineTextSide",
  "btnLineTextColor",
  "lineTextColorInput",
  "textColorPanel",
  "textOpacityInput",
  "btnLineTextBold",
  "btnLineTextItalic",
  "btnLineTextUnderline"
];

assert.match(baseRule, /--line-text-panel-right:\s*calc\(var\(--editor-rail-width\)\s*\+\s*0\.5rem\)/);
assert.match(baseRule, /--line-text-panel-width:\s*min\(18\.3125rem,\s*calc\(100vw\s*-\s*var\(--editor-rail-width\)\s*-\s*1rem\)\)/);
assert.match(baseRule, /right:\s*var\(--line-text-panel-right\)/);
assert.match(baseRule, /width:\s*var\(--line-text-panel-width\)/);
assert.ok(focusSectionStart >= 0 && focusSectionEnd > focusSectionStart);
assert.doesNotMatch(focusSection, /\.kroki-text-entry-host\.line-text-panel/);
assert.doesNotMatch(focusSection, /:is\([^)]*\.line-text-panel/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+:is\(\s*\.line-text-input/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+\.free-text-actions/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+\.line-text-size-picker/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+:is\(\s*\.line-text-picker-btn/);
assert.match(homeCss, /\):not\(\.line-text-input,\s*\.traffic-sign-text-input,\s*\.free-text-input\)\s*\{/);
assert.match(sideIp, /id="btnLineTextAlign"/);
assert.match(sideIp, /id="iconLineTextAlign"/);
assert.match(styleManager, /controls\?\.textAlign\?\.classList\.toggle\("gizli", noText \|\| isCatalogObject\)/);
assert.match(styleManager, /controls\.textAlign\?\.addEventListener\("click",/);
assert.match(styleManager, /anchor:\s*nextChoiceId\(label\.position\.anchor, TEXT_ANCHORS\)/);
assert.match(styleManager, /align:\s*nextChoiceId\(label\.position\.align, TEXT_ALIGNS\)/);
assert.doesNotMatch(lineTextPanel, /<button\b/);
assert.match(lineTextPanel, /id="lineTextInput"/);
assert.doesNotMatch(css, /\.line-text-actions\s*\{/);
for (const id of removedControlIds) {
  assert.doesNotMatch(index, new RegExp(`id="${id}"`), `${id} HTML'den kaldirilmali`);
  assert.doesNotMatch(styleManager, new RegExp(`#${id}\\b`), `${id} baglantisi kaldirilmali`);
}

console.log("line text panel simplification smoke: ok");
