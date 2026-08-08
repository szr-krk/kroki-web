const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const trafficSignLibrary = read("src/ui/trafficSignLibrary.js");
const editorCss = read("src/editor.css");

assert.match(index, /kroki-build" content="[^"]+"/);
assert.match(index, /src\/editor\.css\?v=[^"]+/);
assert.match(index, /src\/ui\/trafficSignLibrary\.js\?v=[^"]+/);
assert.match(trafficSignLibrary, /const count = document\.createElement\("strong"\)/);
assert.match(trafficSignLibrary, /count\.textContent = String\(category\.signs\.length\)/);
assert.match(trafficSignLibrary, /button\.append\(title, count\)/);
assert.match(
  editorCss,
  /\.traffic-sign-category,\s*\.catalog-category,\s*\.vehicle-type-button\s*\{[^}]*justify-content:\s*space-between;[^}]*gap:\s*0\.375rem;/s
);
assert.match(
  editorCss,
  /\.traffic-sign-category strong,\s*\.catalog-category strong,\s*\.vehicle-type-button strong\s*\{[^}]*min-width:\s*1\.75rem;[^}]*font-size:\s*0\.75rem;/s
);

console.log("traffic sign category count smoke: ok");
