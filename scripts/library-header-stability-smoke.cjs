const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const editorCss = read("src/editor.css");

assert.match(index, /kroki-build" content="[^"]+"/);
assert.match(index, /src\/editor\.css\?v=[^"]+/);
assert.match(
  editorCss,
  /\.editor-library-header\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-height:\s*3\.875rem;/s
);
assert.match(
  editorCss,
  /\.editor-library-footer\s*\{[^}]*flex:\s*0 0 auto;/s
);

console.log("library header stability smoke: ok");
