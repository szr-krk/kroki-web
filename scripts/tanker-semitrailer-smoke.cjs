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
const tankerTrailer = catalog.findVariant("09/tanker-yari-romork");
const matches = catalog.variantsForType("09").filter((item) => item.id === "tanker-yari-romork");
const wrongClassMatches = catalog.variantsForType("16").filter((item) => item.id === "tanker-yari-romork");

assert.ok(tankerTrailer, "tanker yari romork katalogda bulunamadi");
assert.equal(matches.length, 1, "tanker yari romork katalogda yinelendi");
assert.equal(wrongClassMatches.length, 0, "tanker yari romork 16 Tanker sinifinda kaldi");
assert.equal(tankerTrailer.name, "Tanker Yarı Römork");
assert.equal(tankerTrailer.axleCount, 3);
assert.equal(tankerTrailer.source, "user-supplied-tanker-semitrailer");
assert.deepEqual([tankerTrailer.lengthM, tankerTrailer.widthM, tankerTrailer.heightM], [10.045, 2.5, 3.9]);

const expectedBoxes = {
  top: [143.5, 35.714],
  side: [143.5, 55.714],
  upsideDown: [143.5, 35.714],
};

for (const viewName of ["top", "side", "upsideDown"]) {
  const view = tankerTrailer.views[viewName];
  const box = view.viewBox.split(/\s+/).map(Number);
  assert.deepEqual(box.slice(2), expectedBoxes[viewName]);
  assert.equal(view.paths.filter((item) => item.role === "wheel").length, 3, `${viewName} uc dingili gostermiyor`);
}

assert.match(tankerTrailer.views.side.paths[0].d, /^M 17 4 A 1 1 0 0 0 17 37/);
assert.ok(tankerTrailer.views.side.paths.some((item) => item.role === "hub"), "yan poryalar eksik");
assert.ok(tankerTrailer.views.top.paths.some((item) => item.role === "detail"), "ust tank ayrintilari eksik");
assert.ok(tankerTrailer.views.upsideDown.paths.some((item) => item.role === "damage-cross"), "ters hasar isareti eksik");
assert.ok(tankerTrailer.views.upsideDown.paths.some((item) => item.role === "frame"), "ters sasi ayrintisi eksik");

const assetRoot = "ARAÇLAR/09 Cekici/Tanker Yari Romork";
for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  const svg = read(`${assetRoot}/${file}`);
  assert.match(svg, /data-kroki-source-base="tanker_yari_romork"/);
  assert.match(svg, /data-kroki-source="user-supplied-tanker-semitrailer"/);
  assert.equal((svg.match(/data-kroki-role="wheel"/g) || []).length, 3, `${file} uc dingili gostermiyor`);
}

console.log("tanker semitrailer smoke: ok");
