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
const motorcycles = catalog.variantsForType("04");

assert.deepEqual(Array.from(motorcycles, (item) => item.id), ["touring-motosiklet", "yuk-triportoru"]);
assert.equal(motorcycles[0].name, "Motosiklet");
assert.equal(motorcycles[1].name, "Yük Motosikleti (Triportör)");
assert.equal(catalog.findVariant("04/standart-motosiklet"), null);
assert.doesNotMatch(read("src/data/vehicle-catalog-data.js"), /v04_standart_motosiklet|Standart Motosiklet/);
assert.equal(fs.existsSync(path.join(root, "ARAÇLAR", "04 Motosiklet", "Standart Motosiklet")), false);

console.log("motorcycle catalog smoke: ok");
