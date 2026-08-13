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
const mixer = catalog.findVariant("08/beton-mikseri");
const matches = catalog.variantsForType("08").filter((item) => item.id === "beton-mikseri");

assert.ok(mixer, "beton mikseri 08 Kamyon kategorisinde bulunamadi");
assert.equal(matches.length, 1, "beton mikseri katalogda yinelendi");
assert.equal(mixer.name, "Beton Mikseri");
assert.deepEqual([mixer.lengthM, mixer.widthM, mixer.heightM], [9.5, 2.5, 4.41]);
assert.deepEqual([mixer.nominalLengthM, mixer.nominalWidthM, mixer.nominalHeightM], [9.5, 2.5, 4.41]);

const expectedBoxes = {
  top: [0, 0, 754, 198.421],
  side: [0, 0, 754, 350],
  upsideDown: [0, 0, 754, 198.421],
};

for (const viewName of ["top", "side", "upsideDown"]) {
  const view = mixer.views[viewName];
  assert.ok(view, `${viewName} gorunumu eksik`);
  assert.deepEqual(view.viewBox.split(/\s+/).map(Number), expectedBoxes[viewName]);
}

assert.match(mixer.views.side.paths[0].d, /^M81 2 122 2 91 76/);
assert.equal(mixer.views.side.paths.filter((item) => item.role === "body").length, 2);
assert.match(mixer.views.side.paths.find((item) => item.role === "wheel").d, /M165 313[\s\S]*M280 313[\s\S]*M595 313/);
assert.match(mixer.views.top.paths.find((item) => item.role === "wheel").d, /M165 0H215V20[\s\S]*M280 0H330V20[\s\S]*M595 0H645V20/);
assert.ok(mixer.views.top.paths.some((item) => item.role === "frame"), "ust gorunumde mikser kazani ayrintisi eksik");
assert.ok(mixer.views.upsideDown.paths.some((item) => item.role === "damage-cross"), "ters hasar isareti eksik");

const assetRoot = "ARAÇLAR/08 Kamyon/Beton Mikseri";
for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  const svg = read(`${assetRoot}/${file}`);
  assert.match(svg, /data-kroki-source-base="beton-mikseri"/);
  assert.match(svg, /data-kroki-source="Beton Mikseri SİDE\.svg/);
}

console.log("concrete mixer smoke: ok");
