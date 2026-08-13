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
  top: [0, 0, 600, 166.667],
  side: [-3, 0, 600, 232],
  upsideDown: [0, 0, 600, 166.667],
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
assert.match(truck.views.top.paths.find((item) => item.role === "wheel").d, /M85 0H143V18/);
assert.ok(truck.views.upsideDown.paths.some((item) => item.role === "damage-cross"));

const assetRoot = "ARAÇLAR/08 Kamyon/Hafriyat Kamyonu";
for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  const svg = read(`${assetRoot}/${file}`);
  assert.match(svg, /data-kroki-source-base="hafriyat-kamyonu"/);
  assert.match(svg, /data-kroki-source="HARFİYAT KAMYONU SİDE\.svg/);
}

for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  assert.equal(fs.existsSync(path.join(root, "ARAÇLAR", "08 Kamyon", "Kapali Kasa Kamyon", file)), false);
}

console.log("excavation truck smoke: ok");
