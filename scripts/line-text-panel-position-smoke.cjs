const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "src", "editor-line.css"), "utf8");
const homeCss = fs.readFileSync(path.join(__dirname, "..", "src", "home.css"), "utf8");

const baseRule = css.match(/\.line-text-panel\s*\{([^}]*)\}/)?.[1] || "";
const focusSectionStart = css.indexOf("/* Sanal klavye acikken");
const focusSectionEnd = css.indexOf(".road-pocket-cycle-btn", focusSectionStart);
const focusSection = css.slice(focusSectionStart, focusSectionEnd);

assert.match(baseRule, /--line-text-panel-right:\s*calc\(var\(--editor-rail-width\)\s*\+\s*0\.5rem\)/);
assert.match(baseRule, /--line-text-panel-width:\s*min\(18\.3125rem,\s*calc\(100vw\s*-\s*var\(--editor-rail-width\)\s*-\s*1rem\)\)/);
assert.match(baseRule, /right:\s*var\(--line-text-panel-right\)/);
assert.match(baseRule, /width:\s*var\(--line-text-panel-width\)/);
assert.ok(focusSectionStart >= 0 && focusSectionEnd > focusSectionStart);
assert.doesNotMatch(focusSection, /\.kroki-text-entry-host\.line-text-panel/);
assert.doesNotMatch(focusSection, /:is\([^)]*\.line-text-panel/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+:is\(\s*\.line-text-input/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+:is\(\.line-text-actions/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+\.line-text-size-picker/);
assert.match(focusSection, /\.kroki-text-entry-host:not\(\.line-text-panel\):not\(\.free-text-composer\)\s+:is\(\s*\.line-text-picker-btn/);
assert.match(homeCss, /\):not\(\.line-text-input,\s*\.traffic-sign-text-input,\s*\.free-text-input\)\s*\{/);

console.log("line text panel box stability smoke: ok");
