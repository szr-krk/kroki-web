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
const trailer = catalog.findVariant("09/uc-dingil-dorse");
const matches = catalog.variantsForType("09").filter((item) => item.id === "uc-dingil-dorse");

assert.ok(trailer, "3 dingil dorse katalogda bulunamadı");
assert.equal(matches.length, 1, "3 dingil dorse katalogda yinelendi");
assert.equal(trailer.name, "3 Dingil Dorse");
assert.equal(trailer.axleCount, 3);
assert.equal(trailer.source, "user-supplied-three-axle-trailer");
assert.deepEqual([trailer.lengthM, trailer.widthM, trailer.heightM], [10.045, 2.5, 3.9]);

const expectedBoxes = {
  top: [143.5, 35.714],
  side: [143.5, 55.714],
  upsideDown: [143.5, 35.714],
};

for (const viewName of ["top", "side", "upsideDown"]) {
  const view = trailer.views[viewName];
  const box = view.viewBox.split(/\s+/).map(Number);
  const expectedDimensions = catalog.dimensionsForView(trailer, viewName);
  assert.deepEqual(box.slice(2), expectedBoxes[viewName]);
  assert.ok(Math.abs(box[2] - expectedDimensions.width) < 0.001, `${viewName} uzunluk ölçeği bozuk`);
  assert.ok(Math.abs(box[3] - expectedDimensions.height) < 0.001, `${viewName} en/yükseklik ölçeği bozuk`);
  assert.equal(view.paths.filter((item) => item.role === "wheel").length, 3, `${viewName} üç dingili göstermiyor`);
}

assert.match(trailer.views.side.paths[0].d, /^M 0\.1 3\.7 L 0\.1 39\.5/);
assert.ok(trailer.views.side.paths.some((item) => item.role === "hub"), "yan poryalar eksik");
assert.ok(trailer.views.top.paths.some((item) => item.role === "detail"), "üst kingpin ayrıntısı eksik");
assert.ok(trailer.views.upsideDown.paths.some((item) => item.role === "damage-cross"), "ters hasar işareti eksik");
assert.ok(trailer.views.upsideDown.paths.some((item) => item.role === "frame"), "ters şasi ayrıntısı eksik");

const assetRoot = "ARAÇLAR/09 Cekici/Dorse";
for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  const svg = read(`${assetRoot}/${file}`);
  assert.match(svg, /data-kroki-source-base="uc_dingil_dorse"/);
  assert.match(svg, /data-kroki-source="user-supplied-three-axle-trailer"/);
  assert.equal((svg.match(/data-kroki-role="wheel"/g) || []).length, 3, `${file} üç dingili göstermiyor`);
}

console.log("three axle trailer smoke: ok");
