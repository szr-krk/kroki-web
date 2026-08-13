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
const tractor = catalog.findVariant("09/uc-dingil-cekici");
const matches = catalog.variantsForType("09").filter((item) => item.id === "uc-dingil-cekici");

assert.ok(tractor, "üç dingil çekici katalogda bulunamadı");
assert.equal(matches.length, 1, "üç dingil çekici katalogda yinelendi");
assert.equal(tractor.name, "Üç Dingil Çekici");
assert.equal(tractor.axleCount, 3);
assert.equal(tractor.source, "user-supplied-tandem-rear-tractor");
assert.deepEqual([tractor.lengthM, tractor.widthM, tractor.heightM], [6.09, 2.52, 3.514]);

const expectedBoxes = {
  top: [87, 36],
  side: [87, 50.2],
  upsideDown: [87, 36],
};

for (const viewName of ["top", "side", "upsideDown"]) {
  const view = tractor.views[viewName];
  const box = view.viewBox.split(/\s+/).map(Number);
  const expectedDimensions = catalog.dimensionsForView(tractor, viewName);
  assert.deepEqual(box.slice(2), expectedBoxes[viewName]);
  assert.ok(Math.abs(box[2] - expectedDimensions.width) < 0.001, `${viewName} uzunluk ölçeği bozuk`);
  assert.ok(Math.abs(box[3] - expectedDimensions.height) < 0.001, `${viewName} en/yükseklik ölçeği bozuk`);
  assert.equal(view.paths.filter((item) => item.role === "wheel").length, 3, `${viewName} üç dingili göstermiyor`);
}

assert.match(tractor.views.top.paths[0].d, /^M 0 24 L 0 12 L 55 12/);
assert.match(tractor.views.side.paths[0].d, /^M 54 0 L 54 17/);
assert.ok(tractor.views.side.paths.some((item) => item.role === "window"), "yan cam ayrıntısı eksik");
assert.ok(tractor.views.side.paths.some((item) => item.role === "hub"), "teker poryaları eksik");
assert.ok(tractor.views.upsideDown.paths.some((item) => item.role === "damage-cross"), "ters görünüş hasar işareti eksik");

const assetRoot = "ARAÇLAR/09 Cekici/Üç Dingil Çekici";
for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  const svg = read(`${assetRoot}/${file}`);
  assert.match(svg, /data-kroki-source="user-supplied-tandem-rear-tractor"/);
  assert.match(svg, /data-kroki-length-m="6\.09"/);
}
assert.equal((read(`${assetRoot}/side.svg`).match(/data-kroki-role="wheel"/g) || []).length, 3);
assert.equal((read(`${assetRoot}/top.svg`).match(/data-kroki-role="wheel"/g) || []).length, 3);
assert.equal((read(`${assetRoot}/upsideDown.svg`).match(/data-kroki-role="wheel"/g) || []).length, 3);

console.log("three axle tractor smoke: ok");
