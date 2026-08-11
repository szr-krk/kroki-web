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
const sedan = catalog.findVariant("05/sedan");
const redTopPaths = sedan.views.top.paths.filter((item) => item.fill?.toLowerCase() === "#ff0000");
const redSidePaths = sedan.views.side.paths.filter((item) => item.fill?.toLowerCase() === "#ff0000");

assert.equal(redTopPaths.length, 1, "sedan top rear lights must have one fixed red layer");
assert.match(redTopPaths[0].d, /M 2\.749 5\.348/);
assert.match(redTopPaths[0].d, /M 2\.749 21\.81/);
assert.equal(redSidePaths.length, 1, "sedan side rear light must have one fixed red layer");
assert.match(redSidePaths[0].d, /M 3\.108 9\.786/);
assert.match(redSidePaths[0].d, /M 2\.77 8\.518/);
assert.doesNotMatch(redSidePaths[0].d, /M 66\.08 11\.138/, "front light must not be red");

assert.match(read("ARAÇLAR/05 Otomobil/Sedan/top.svg"), /fill="#ff0000"/);
assert.match(read("ARAÇLAR/05 Otomobil/Sedan/side.svg"), /fill="#ff0000"/);

console.log("sedan rear lights smoke: ok");
