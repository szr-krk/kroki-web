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
assert.equal(sportsCar.lengthM, 4.485);
assert.equal(sportsCar.widthM, 2.072);
assert.equal(sportsCar.heightM, 1.434);

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
assert.ok(Math.abs(sideBox[3] - catalog.metersToUnits(1.434)) < 0.01, "yan görünüş yüksekliği gerçek ölçeğe uymuyor");
const upsideDownBox = sportsCar.views.upsideDown.viewBox.split(/\s+/).map(Number);
assert.equal(topBox[2], upsideDownBox[2], "reverse ve üst görünüş uzunlukları eşit değil");
assert.equal(topBox[3], upsideDownBox[3], "reverse ve üst görünüş genişlikleri eşit değil");

const transformPattern = /^matrix\(([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+)\)$/;
const viewTransforms = {};
for (const viewName of ["top", "side", "upsideDown"]) {
  for (const pathItem of sportsCar.views[viewName].paths) {
    const match = pathItem.transform.match(transformPattern);
    assert.ok(match, `${viewName} dönüşüm matrisi eksik`);
    assert.ok(Math.abs(Number(match[1]) - Number(match[2])) < 0.000001, `${viewName} SVG oranı bozulmuş`);
    assert.ok(Math.abs(Number(match[1]) - 0.069811) < 0.000001, `${viewName} ortak ölçeği kullanmıyor`);
    viewTransforms[viewName] = match.map(Number);
  }
}

const topDrawnLength = 840 * viewTransforms.top[1];
const sideDrawnLength = 840 * viewTransforms.side[1];
assert.ok(Math.abs(topDrawnLength - sideDrawnLength) < 0.000001, "üstten yana geçişte çizim uzunluğu değişiyor");
assert.ok(Math.abs(topDrawnLength - 58.64124) < 0.000001, "oranlanmış üst çizim uzunluğu beklenenden farklı");

const assetRoot = "ARAÇLAR/05 Otomobil/Dört Kişilik Üstü Açık Spor Otomobil";
assert.match(read(`${assetRoot}/top.svg`), /viewBox="0 0 64\.071429 29\.6"[\s\S]*matrix\(0\.069811 0 0 0\.069811 2\.715 0\)/);
assert.match(read(`${assetRoot}/side.svg`), /viewBox="0 0 64\.071429 20\.485714"[\s\S]*matrix\(0\.069811 0 0 0\.069811 2\.715 0\.469\)/);
assert.match(read(`${assetRoot}/reverse.svg`), /viewBox="0 0 64\.071429 29\.6"[\s\S]*matrix\(0\.069811 0 0 0\.069811 2\.715 0\)/);

assert.match(sportsCar.views.top.paths[0].d, /^M1 213/);
assert.match(sportsCar.views.side.paths[0].d, /^M136 61/);
assert.match(sportsCar.views.upsideDown.paths[0].d, /M750 60 30 350/);
assert.match(read("src/ui/vehicleLibrary.js"), /renderPreviewSvg\(variant, \{ view: "side" \}\)/);

console.log("open top sports car smoke: ok");
