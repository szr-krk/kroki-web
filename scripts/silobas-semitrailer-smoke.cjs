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
const silobas = catalog.findVariant("09/silobas-kasa-yari-romork");
const tanker = catalog.findVariant("09/tanker-yari-romork");
const matches = catalog.variantsForType("09").filter((item) => item.id === "silobas-kasa-yari-romork");

assert.ok(silobas, "silobas yari romork 09 Cekici kategorisinde bulunamadi");
assert.equal(matches.length, 1, "silobas yari romork katalogda yinelendi");
assert.equal(silobas.name, "Silobas Kasa Yarı Römork");
assert.equal(silobas.axleCount, 3);
assert.equal(silobas.source, "user-supplied-silobas-semitrailer");
assert.deepEqual([silobas.lengthM, silobas.widthM, silobas.heightM], [10.045, 2.5, 3.9]);
assert.deepEqual(
  [silobas.lengthM, silobas.widthM, silobas.heightM],
  [tanker.lengthM, tanker.widthM, tanker.heightM],
  "silobas tanker yari romork ile ayni gercek boyutta degil"
);

const expectedBoxes = {
  top: [0, 0, 143.5, 35.714],
  side: [0, 0, 143.5, 55.714],
  upsideDown: [0, 0, 143.5, 35.714],
};

for (const viewName of ["top", "side", "upsideDown"]) {
  const view = silobas.views[viewName];
  assert.ok(view, `${viewName} gorunumu eksik`);
  assert.deepEqual(view.viewBox.split(/\s+/).map(Number), expectedBoxes[viewName]);
  for (const pathItem of view.paths) {
    assert.equal(Object.hasOwn(pathItem, "transform"), false, `${viewName} katalog pathinde transform kullanilmis`);
  }
}

assert.match(silobas.views.side.paths[0].d, /^M 17\.938 21\.888/);
assert.match(silobas.views.side.paths[1].d, /^M 17\.938 3\.98/);
assert.match(silobas.views.side.paths.find((item) => item.role === "wheel").d, /M 10\.551 47\.755[\s\S]*M 28\.489 47\.755[\s\S]*M 46\.426 47\.755/);
assert.ok(silobas.views.top.paths.some((item) => item.role === "detail"), "ust silobas ayrintilari eksik");
assert.ok(silobas.views.upsideDown.paths.some((item) => item.role === "damage-cross"), "ters hasar isareti eksik");

const assetRoot = "ARAÇLAR/09 Cekici/Silobas Yari Romork";
for (const file of ["top.svg", "side.svg", "upsideDown.svg"]) {
  const svg = read(`${assetRoot}/${file}`);
  assert.match(svg, /data-kroki-source-base="silobas_yari_romork"/);
  assert.match(svg, /data-kroki-source="SİLOBAS SİDE\.SVG/);
  assert.doesNotMatch(svg, /\btransform\s*=/i, `${file} assetinde transform kullanilmis`);
}

console.log("silobas semitrailer smoke: ok");
