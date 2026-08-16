const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const context = { window: {} };

vm.runInNewContext(read("src/data/vehicle-catalog-data.js"), context);
vm.runInNewContext(read("src/core/vehicleCatalog.js"), context);

const catalog = context.window.Kroki.VehicleCatalog;
const truck = catalog.findVariant("08/kapali-kasa-kamyon");

assert.ok(truck, "legacy vehicle key must remain available");
assert.equal(truck.name, "Hafriyat Kamyonu");
assert.deepEqual([truck.lengthM, truck.widthM, truck.heightM], [9, 2.5, 3.48]);
assert.deepEqual([truck.nominalLengthM, truck.nominalWidthM, truck.nominalHeightM], [9, 2.5, 3.48]);

const expectedBoxes = {
  top: [0, 0, 128.571429, 35.714286],
  side: [-3, 0, 600, 232],
  upsideDown: [0, 0, 128.571429, 35.714286],
};

for (const viewName of ["top", "side", "upsideDown"]) {
  const view = truck.views[viewName];
  assert.ok(view, `${viewName} view is missing`);
  assert.deepEqual(view.viewBox.split(/\s+/).map(Number), expectedBoxes[viewName]);
}

assert.match(truck.views.side.paths[0].d, /^M404 1 492 1 479 16/);
assert.equal(truck.views.side.paths.filter((item) => item.role === "wheel").length, 1);
assert.ok(truck.views.side.paths.some((item) => item.role === "solid" && item.fill === "#ff0000"));
assert.ok(truck.views.top.paths.some((item) => item.role === "detail" && item.fill === "#ffffff"));
assert.ok(truck.views.top.paths.some((item) => item.role === "window" && item.fill === "#ffffff"));
assert.equal(truck.views.top.paths.length, 3, "top görünüş yalnızca kaynak SVG'deki üç yolu içermeli");
assert.equal(truck.views.top.paths.some((item) => item.role === "wheel"), false);
assert.equal(truck.views.top.paths.some((item) => item.role === "solid"), false);
assert.match(truck.views.top.paths.find((item) => item.role === "detail").d, /^M5 5 188 5 196 13 210 13/);
assert.equal(truck.views.top.paths.find((item) => item.role === "detail").stroke, "none");
assert.match(truck.views.top.paths.find((item) => item.role === "window").d, /^M210 2 257 2 267 5 226 5/);
const representativeBody = truck.views.top.paths.find((item) => item.role === "body");
assert.equal(representativeBody.ghost, "auto");
assert.equal(representativeBody.ghostDash, "2.408 2.408");
assert.equal(representativeBody.strokeWidth, 0.722);
assert.ok(
  truck.views.top.paths.filter((item) => item.role !== "body").every((item) => item.ghost === "hide"),
  "temsili top görünüşte top ayrıntıları gizlenmeli"
);
assert.equal(truck.views.top.paths.some((item) => item.role === "damage-cross"), false);
const normalTruck = catalog.findVariant("08/kamyon");
const normalTruckScale = Math.min(
  catalog.dimensionsForView(normalTruck, "top").width / Number(normalTruck.views.top.viewBox.split(/\s+/)[2]),
  catalog.dimensionsForView(normalTruck, "top").height / Number(normalTruck.views.top.viewBox.split(/\s+/)[3])
);
assert.ok(Math.abs(2.408 * 0.415282 - normalTruckScale) < 0.001, "temsili dash aralığı normal Kamyon ile eşleşmiyor");
assert.ok(truck.views.upsideDown.paths.some((item) => item.role === "damage-cross"));
assert.equal(truck.source, "user-supplied-harfiyat-reverse");

const catalogTopSize = catalog.dimensionsForView(truck, "top");
for (const viewName of ["top", "upsideDown"]) {
  const box = truck.views[viewName].viewBox.split(/\s+/).map(Number);
  assert.ok(Math.abs(box[2] - catalogTopSize.width) < 0.001, `${viewName} uzunluğu gerçek ölçeğe uymıyor`);
  assert.ok(Math.abs(box[3] - catalogTopSize.height) < 0.001, `${viewName} genişliği gerçek ölçeğe uymuyor`);
}
for (const item of truck.views.top.paths) {
  assert.equal(item.transform, "matrix(0.415282 0 0 0.415282 1.993 0)");
}
for (const item of truck.views.upsideDown.paths) {
  assert.equal(item.transform, "matrix(0.415282 0 0 0.415282 1.163 0)");
}

assert.match(truck.views.top.paths[0].d, /^M1 1 196 1 196 11/);
assert.match(truck.views.upsideDown.paths.find((item) => item.role === "wheel").d, /^M44 1 73 1 73 10/);
assert.equal(truck.views.upsideDown.paths.find((item) => item.role === "damage-cross").d, "M297 4 1 85M1 1 297 82");

const assetRoot = "ARAÇLAR/08 Kamyon/Hafriyat Kamyonu";
for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  const svg = read(`${assetRoot}/${file}`);
  assert.match(svg, /data-kroki-source-base="hafriyat-kamyonu"/);
}

assert.match(read(`${assetRoot}/top.svg`), /data-kroki-source="HARFİYAT TOP\.SVG"/);
assert.match(read(`${assetRoot}/top.svg`), /viewBox="0 0 128\.571429 35\.714286"[\s\S]*matrix\(0\.415282 0 0 0\.415282 1\.993 0\)/);
assert.match(read(`${assetRoot}/side.svg`), /data-kroki-source="HARFİYAT KAMYONU SİDE\.svg"/);
assert.match(read(`${assetRoot}/upsideDown.svg`), /data-kroki-source="HARFİYAT REVERSE\.svg"/);
assert.match(read(`${assetRoot}/upsideDown.svg`), /M297 4 1 85M1 1 297 82/);

for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  assert.equal(fs.existsSync(path.join(root, "ARAÇLAR", "08 Kamyon", "Kapali Kasa Kamyon", file)), false);
}

console.log("excavation truck smoke: ok");
