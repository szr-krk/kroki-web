const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const editorCss = read("src/editor.css");

assert.match(index, /kroki-build" content="20260808-traffic-sign-category-fit-v1"/);
assert.match(index, /src\/editor\.css\?v=20260808-traffic-sign-category-fit-v1/);
assert.match(
  editorCss,
  /\.traffic-sign-library\s*\{[^}]*grid-template-columns:\s*14\.875rem minmax\(0, 1fr\);/s
);
assert.match(
  editorCss,
  /\.traffic-sign-category,\s*\.catalog-category,\s*\.vehicle-type-button\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*padding:\s*0 0\.5rem;[^}]*gap:\s*0\.375rem;/s
);
assert.match(
  editorCss,
  /\.traffic-sign-category span,\s*\.catalog-category span,\s*\.vehicle-type-button span\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/s
);
assert.match(
  editorCss,
  /\.traffic-sign-category strong,\s*\.catalog-category strong,\s*\.vehicle-type-button strong\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-width:\s*1\.75rem;/s
);
assert.match(
  editorCss,
  /#trafficSignCategoryList\s*\{[^}]*overflow-x:\s*hidden;[^}]*scrollbar-width:\s*thin;/s
);
assert.doesNotMatch(editorCss, /#trafficSignCategoryList\s*\{[^}]*scrollbar-gutter:\s*stable;/s);

console.log("traffic sign category fit smoke: ok");
