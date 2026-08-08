const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const shapeRegistry = read("src/core/shapeRegistry.js");
const vehicleLibrary = read("src/ui/vehicleLibrary.js");
const trafficSignLibrary = read("src/ui/trafficSignLibrary.js");
const otherSymbolLibrary = read("src/ui/otherSymbolLibrary.js");
const vehicleData = read("src/data/vehicle-catalog-data.js");
const editorCss = read("src/editor.css");

const context = { window: {}, document: {} };
vm.runInNewContext(shapeRegistry, context);
const listLabel = context.window.Kroki.EditorUtils.turkishListLabel;

assert.equal(listLabel("BİLGİ LEVHALARI"), "Bilgi levhaları");
assert.equal(listLabel("İŞ MAKİNESİ"), "İş makinesi");
assert.equal(listLabel("IŞIKLI İŞARETLER"), "Işıklı işaretler");
assert.equal(listLabel("DURMA ve PARKETME"), "Durma ve parketme");
assert.equal(listLabel("20 E-SKUTER"), "20 E-skuter");

for (const library of [vehicleLibrary, trafficSignLibrary, otherSymbolLibrary]) {
  assert.match(library, /utils\.turkishListLabel\(/);
}

for (const title of [
  "02 At Arabası",
  "06 Minibüs",
  "09 Çekici",
  "11 Traktör",
  "12 Arazi Taşıtı",
  "13 Özel Amaçlı",
  "14 İş Makinesi",
  "19 Diğer"
]) {
  assert.ok(vehicleData.includes(`title: "${title}"`), `${title} bulunamadı`);
}

assert.match(
  editorCss,
  /\.traffic-sign-category-list,\s*\.catalog-category-list,\s*\.vehicle-type-list\s*\{/s
);
assert.match(
  editorCss,
  /\.traffic-sign-category,\s*\.catalog-category,\s*\.vehicle-type-button\s*\{[^}]*font-weight:\s*900;/s
);
assert.match(
  editorCss,
  /\.traffic-sign-category span,\s*\.catalog-category span,\s*\.vehicle-type-button span\s*\{/s
);
assert.match(
  editorCss,
  /\.traffic-sign-category strong,\s*\.catalog-category strong,\s*\.vehicle-type-button strong\s*\{/s
);
assert.doesNotMatch(editorCss, /:where\(#trafficSignCategoryList\) \.traffic-sign-category\s*\{/);

assert.match(index, /kroki-build" content="20260808-catalog-list-consistency-v1"/);
for (const asset of [
  "src/editor.css",
  "src/data/vehicle-catalog-data.js",
  "src/core/shapeRegistry.js",
  "src/ui/vehicleLibrary.js",
  "src/ui/trafficSignLibrary.js",
  "src/ui/otherSymbolLibrary.js"
]) {
  assert.ok(
    index.includes(`${asset}?v=20260808-catalog-list-consistency-v1`),
    `${asset} sürüm etiketi güncel değil`
  );
}

console.log("catalog list consistency smoke: ok");
