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
const original = catalog.findVariant("02/at-arabasi");
const second = catalog.findVariant("02/at-arabasi-2");

assert.deepEqual(
  Array.from(catalog.variantsForType("02"), (variant) => variant.id),
  ["at-arabasi", "at-arabasi-2"]
);
assert.equal(second.name, "At Arabası 2");
assert.ok(Math.abs(second.lengthM - original.lengthM * 1.1) < 0.000001, "side uzunluğu yüzde 10 artmamış");
assert.equal(second.widthM, 1.705);
assert.equal(second.heightM, 1.6966);
assert.equal(second.previewView, "side");

const boxes = Object.fromEntries(Object.entries(second.views).map(([name, view]) => [
  name,
  view.viewBox.split(/\s+/).map(Number),
]));
const expectedTop = catalog.dimensionsForView(second, "top");
const expectedSide = catalog.dimensionsForView(second, "side");
assert.ok(Math.abs(boxes.top[2] - expectedTop.width) < 0.001);
assert.ok(Math.abs(boxes.top[3] - expectedTop.height) < 0.001);
assert.ok(Math.abs(boxes.side[2] - expectedSide.width) < 0.001);
assert.ok(Math.abs(boxes.side[3] - expectedSide.height) < 0.001);
assert.deepEqual(boxes.upsideDown, boxes.top, "top ve reverse ölçüleri eşit değil");
assert.ok(Math.abs(boxes.side[2] / boxes.side[3] - 350 / 90) < 0.001, "gönderilen side oranı bozulmuş");

for (const pathItem of second.views.side.paths) {
  assert.equal(pathItem.transform, "matrix(0.269297 0 0 0.269297 0 0)");
}
for (const viewName of ["top", "upsideDown"]) {
  assert.deepEqual(
    Array.from(second.views[viewName].paths, (pathItem) => pathItem.d),
    Array.from(original.views[viewName].paths, (pathItem) => pathItem.d),
    `${viewName} şekli mevcut at arabasıyla aynı değil`
  );
  for (const pathItem of second.views[viewName].paths) {
    assert.match(pathItem.transform, /scale\(1\.1 1\.1\)/);
  }
}

const assetRoot = "ARAÇLAR/02 At Arabasi/At Arabasi 2";
assert.match(read(`${assetRoot}/side.svg`), /viewBox="0 0 94\.254 24\.237"[\s\S]*matrix\(0\.269297 0 0 0\.269297 0 0\)/);
assert.match(read(`${assetRoot}/top.svg`), /viewBox="0 0 94\.254 24\.357"[\s\S]*transform="scale\(1\.1\)"/);
assert.equal(read(`${assetRoot}/reverse.svg`).replace("at_arabasi_2_reverse", "at_arabasi_2_upside_down"), read(`${assetRoot}/upsideDown.svg`));

console.log("horse cart 2 smoke: ok");
