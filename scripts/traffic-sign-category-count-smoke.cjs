const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const trafficSignLibrary = read("src/ui/trafficSignLibrary.js");
const editorCss = read("src/editor.css");

assert.match(index, /kroki-build" content="20260808-traffic-sign-category-counts-v1"/);
assert.match(index, /src\/editor\.css\?v=20260808-traffic-sign-category-counts-v1/);
assert.match(index, /src\/ui\/trafficSignLibrary\.js\?v=20260808-traffic-sign-category-counts-v1/);
assert.match(trafficSignLibrary, /const count = document\.createElement\("strong"\)/);
assert.match(trafficSignLibrary, /count\.textContent = String\(category\.signs\.length\)/);
assert.match(trafficSignLibrary, /button\.append\(title, count\)/);
assert.match(
  editorCss,
  /:where\(#trafficSignCategoryList\) \.traffic-sign-category\s*\{[^}]*justify-content:\s*space-between;[^}]*gap:\s*0\.625rem;/s
);
assert.match(
  editorCss,
  /:where\(#trafficSignCategoryList\) \.traffic-sign-category span\s*\{[^}]*flex:\s*1 1 auto;[^}]*text-overflow:\s*ellipsis;/s
);

console.log("traffic sign category count smoke: ok");
