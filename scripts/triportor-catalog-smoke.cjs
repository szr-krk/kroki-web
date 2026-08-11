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
const triportor = catalog.findVariant("04/yuk-triportoru");
const sedan = catalog.findVariant("05/sedan");

assert.ok(triportor, "triportör katalogda bulunamadı");
assert.equal(triportor.name, "Yük Motosikleti (Triportör)");
assert.equal(triportor.previewView, "side");
assert.equal(triportor.supportsUpsideDown, true);
assert.deepEqual([triportor.lengthM, triportor.widthM, triportor.heightM], [3.21, 1.48, 1.78]);

const expectedBoxes = {
  top: [45.857, 21.143],
  side: [45.857, 25.429],
  upsideDown: [45.857, 21.143],
};
const transformPattern = /^matrix\(([-\d.]+) 0 0 ([-\d.]+) ([-\d.]+) ([-\d.]+)\)$/;
const viewTransforms = {};

for (const viewName of ["top", "side", "upsideDown"]) {
  const view = triportor.views[viewName];
  const box = view.viewBox.split(/\s+/).map(Number);
  const expectedDimensions = catalog.dimensionsForView(triportor, viewName);
  assert.deepEqual(box.slice(2), expectedBoxes[viewName]);
  assert.ok(Math.abs(box[2] - expectedDimensions.width) < 0.001);
  assert.ok(Math.abs(box[3] - expectedDimensions.height) < 0.001);
  assert.ok(view.paths.length >= 5, `${viewName} görünümü eksik`);
  for (const pathItem of view.paths) {
    const match = pathItem.transform.match(transformPattern);
    assert.ok(match, `${viewName} dönüşüm matrisi eksik`);
    assert.ok(Math.abs(Number(match[1]) - Number(match[2])) < 0.000001, `${viewName} oranı bozulmuş`);
    assert.ok(Math.abs(Number(match[1]) - 0.140952) < 0.000001, `${viewName} ortak ölçeği kullanmıyor`);
    viewTransforms[viewName] = match.map(Number);
  }
}

const drawnLengths = Object.fromEntries(
  Object.entries(viewTransforms).map(([viewName, transform]) => [viewName, 325 * transform[1]])
);
assert.ok(Math.abs(drawnLengths.top - drawnLengths.side) < 0.000001);
assert.ok(Math.abs(drawnLengths.top - drawnLengths.upsideDown) < 0.000001);
assert.equal(viewTransforms.top[4], 0);
assert.equal(viewTransforms.upsideDown[4], 0);
assert.equal(viewTransforms.side[4], 2.143);

const sedanRatio = triportor.lengthM / sedan.lengthM;
assert.ok(triportor.lengthM < sedan.lengthM, "triportör sedandan büyük görünüyor");
assert.ok(Math.abs(sedanRatio - 0.6587317874) < 0.000001, "sedan-triportör gerçek uzunluk oranı bozuk");

const assetRoot = "ARAÇLAR/04 Motosiklet/Yük Motosikleti (Triportör)";
assert.match(read(`${assetRoot}/top.svg`), /viewBox="0 0 45\.857 21\.143"[\s\S]*matrix\(0\.140952 0 0 0\.140952 0\.024 0\)/);
assert.match(read(`${assetRoot}/side.svg`), /viewBox="0 0 45\.857 25\.429"[\s\S]*matrix\(0\.140952 0 0 0\.140952 0\.024 2\.143\)/);
const reverseSvg = read(`${assetRoot}/reverse.svg`);
const upsideDownSvg = read(`${assetRoot}/upsideDown.svg`);
assert.match(reverseSvg, /M1 4 304 104M1 146 304 46/);
assert.equal(reverseSvg, upsideDownSvg);

console.log("triportor catalog smoke: ok");
