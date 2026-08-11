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
const automobiles = catalog.variantsForType("05");
const sportsCar = catalog.findVariant("05/ustu-acik-spor-otomobil");

assert.deepEqual(
  Array.from(automobiles, (item) => item.id),
  ["sedan", "ustu-acik-spor-otomobil"],
  "spor otomobil Sedan'ın hemen yanında değil"
);
assert.equal(sportsCar.name, "Dört Kişilik Üstü Açık Spor Otomobil");
assert.equal(sportsCar.previewView, "side");
assert.equal(sportsCar.lengthM, 4.768);
assert.equal(sportsCar.widthM, 2.081);
assert.equal(sportsCar.heightM, 1.384);

for (const viewName of ["top", "side", "upsideDown"]) {
  const view = sportsCar.views[viewName];
  const box = view.viewBox.split(/\s+/).map(Number);
  const expected = catalog.dimensionsForView(sportsCar, viewName);
  assert.ok(view.paths.length >= 3, `${viewName} görünüşü eksik`);
  assert.ok(Math.abs(box[2] - expected.width) < 0.01, `${viewName} uzunluk ölçeği bozuk`);
  assert.ok(Math.abs(box[3] - expected.height) < 0.01, `${viewName} en/yükseklik ölçeği bozuk`);
}

const topBox = sportsCar.views.top.viewBox.split(/\s+/).map(Number);
const sideBox = sportsCar.views.side.viewBox.split(/\s+/).map(Number);
assert.equal(topBox[2], sideBox[2], "üst ve yan görünüşlerin yatay uzunluğu eşit değil");
assert.ok(Math.abs(sideBox[3] - catalog.metersToUnits(1.384)) < 0.01, "yan görünüş yükseklik oranı değişti");

assert.match(sportsCar.views.top.paths[0].d, /^M1 213/);
assert.match(sportsCar.views.side.paths[0].d, /^M136 61/);
assert.match(sportsCar.views.upsideDown.paths[0].d, /M750 60 30 350/);
assert.match(read("src/ui/vehicleLibrary.js"), /renderPreviewSvg\(variant, \{ view: "side" \}\)/);

console.log("open top sports car smoke: ok");
