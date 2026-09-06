const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const shapeRegistry = read("src/core/shapeRegistry.js");
const trafficSignLibrary = read("src/ui/trafficSignLibrary.js");
const editorCss = read("src/editor.css");

const context = { window: {}, document: {} };
vm.runInNewContext(shapeRegistry, context);
const searchText = context.window.Kroki.EditorUtils.turkishSearchText;

assert.equal(searchText("İŞARET ÇEŞİTLERİ"), "isaret cesitleri");
assert.equal(searchText("IŞIKLI İŞARET"), "isikli isaret");
assert.equal(searchText("TT-29a"), "tt 29a");

assert.match(index, /kroki-build" content="[^"]+"/);
assert.match(index, /id="trafficSignSearch"[^>]*placeholder="Levha ara\.\.\."/s);
assert.match(index, /id="trafficSignSearchCount"/);
assert.match(index, /id="btnTrafficSignSearchClear"/);
assert.match(index, /src\/core\/shapeRegistry\.js\?v=[^"\s]+/);
assert.match(index, /src\/ui\/trafficSignLibrary\.js\?v=20260810-performance-stability-v1/);

assert.match(trafficSignLibrary, /catalog\.all\(\)\.filter/);
assert.match(trafficSignLibrary, /queryTokens\.every/);
assert.match(trafficSignLibrary, /signToken\.startsWith\(queryToken\)/);
assert.match(trafficSignLibrary, /browser\.scrollTop = 0/);
assert.match(trafficSignLibrary, /empty\.textContent = "Levha bulunamadı\."/);
assert.match(trafficSignLibrary, /window\.setTimeout\(\(\) => setSearchValue\(searchInput\.value\), 100\)/);

assert.match(
  editorCss,
  /\.traffic-sign-search\s*\{[^}]*height:\s*2\.75rem;[^}]*flex:\s*0 1 28rem;/s
);
assert.match(editorCss, /\.traffic-sign-search input\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 auto;/s);

console.log("traffic sign search smoke: ok");
