const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "src", "editor-line.css"), "utf8");

const baseRule = css.match(/\.line-text-panel\s*\{([^}]*)\}/)?.[1] || "";
const focusedRule = css.match(/:root\.kroki-text-entry-active\s+\.kroki-text-entry-host\.line-text-panel\s*\{([^}]*)\}/)?.[1] || "";

assert.match(baseRule, /--line-text-panel-right:\s*calc\(var\(--editor-rail-width\)\s*\+\s*0\.5rem\)/);
assert.match(baseRule, /--line-text-panel-width:\s*min\(18\.3125rem,\s*calc\(100vw\s*-\s*var\(--editor-rail-width\)\s*-\s*1rem\)\)/);
assert.match(baseRule, /right:\s*var\(--line-text-panel-right\)/);
assert.match(baseRule, /width:\s*var\(--line-text-panel-width\)/);
assert.match(focusedRule, /right:\s*var\(--line-text-panel-right\)\s*!important/);
assert.match(focusedRule, /width:\s*var\(--line-text-panel-width\)\s*!important/);
assert.doesNotMatch(focusedRule, /right:\s*8px/);

console.log("line text panel position smoke: ok");
