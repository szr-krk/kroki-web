const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const generatedCatalogFiles = fs.readdirSync(path.join(root, "src", "data"))
  .filter((name) => /^traffic-signs-.*\.generated\.js$/.test(name) || name === "other-symbols.generated.js")
  .map((name) => path.join("src", "data", name));

let catalogBytes = 0;
let catalogRecords = 0;
generatedCatalogFiles.forEach((file) => {
  const source = read(file);
  const records = (source.match(/\n\s*"key":/g) || []).length;
  const artFields = (source.match(/\n\s*"art":/g) || []).length;
  assert.equal(artFields, records, `${file}: her kayitta kullanilan art alani bulunmali`);
  assert.doesNotMatch(source, /\n\s*"(?:svg|relativePath)":/, `${file}: kullanilmayan katalog kopyasi bulunmamali`);
  catalogRecords += records;
  catalogBytes += Buffer.byteLength(source);
});
assert.equal(catalogRecords, 353);
assert.ok(catalogBytes < 800 * 1024, `katalog yuku tekrar buyudu: ${catalogBytes} bayt`);

const shapeRegistry = read("src/core/shapeRegistry.js");
const registryContext = {
  window: {},
  document: {
    createElementNS() {
      return { setAttribute() {} };
    }
  }
};
vm.runInNewContext(shapeRegistry, registryContext);
const utils = registryContext.window.Kroki.EditorUtils;
const cache = new Map();
utils.lruSet(cache, "a", 1, 2);
utils.lruSet(cache, "b", 2, 2);
assert.equal(utils.lruGet(cache, "a"), 1);
utils.lruSet(cache, "c", 3, 2);
assert.deepEqual(Array.from(cache.keys()), ["a", "c"]);

const manager = read("src/core/editorObjectManager.js");
assert.match(manager, /function withObjectHistory\(id, options, label, operation\)/);
assert.match(manager, /function withObjectAddHistory\(options, label, operation\)/);
assert.match(manager, /return withObjectHistory\(id, options, "Nesne guncelle"/);
assert.match(manager, /return withObjectHistory\(id, options, "Geometri guncelle"/);
assert.match(manager, /return withObjectAddHistory\(options, "Nesne ekle"/);
assert.match(manager, /if \(model\.type === "road"\) keepRoadLayersAtBack\(\)/);

const bindings = read("src/ui/editorBindings.js");
assert.match(bindings, /function queueDraftPoint\(event\)/);
assert.match(bindings, /draftState\.pendingClientPoint = \{ clientX: event\.clientX, clientY: event\.clientY, ctrlKey: event\.ctrlKey, metaKey: event\.metaKey \}/);
assert.match(bindings, /window\.requestAnimationFrame\(run\)/);
assert.match(bindings, /cancelDraftFrame\(draft\)/);
assert.match(bindings, /pushObjectAdd\?\.\(manager\.get\(id\), "Nesne ekle"\)/);
assert.doesNotMatch(bindings, /HistoryManager\?\.begin\?\.\("Nesne ekle"\)/);

const styleManager = read("src/core/styleManager.js");
assert.match(styleManager, /const defsCleanupJobs = new WeakMap\(\)/);
assert.match(styleManager, /function scheduleDefsCleanup\(canvas\)/);
assert.match(styleManager, /data-editor-fill-pattern-key/);
assert.match(styleManager, /if \(pattern\.dataset\.editorFillPatternKey === renderKey\) return pattern/);
assert.match(styleManager, /function beginActiveObjectHistory\(label\)/);
assert.match(styleManager, /history\.beginObjectChange\(entry\.model\.id, label\)/);
assert.match(styleManager, /commitInputHistory\(textInputTransaction, "Metin guncelle"\)/);
assert.match(styleManager, /commitInputHistory\(vehicleLabelInputTransaction, "Arac etiketi"\)/);

for (const file of ["trafficSignLibrary", "otherSymbolLibrary", "vehicleLibrary"]) {
  const source = read(`src/ui/${file}.js`);
  assert.match(source, /utils\.lruGet\(/);
  assert.match(source, /utils\.lruSet\(/);
  assert.doesNotMatch(source, /tile\.addEventListener\("click"/);
}

const generator = read("scripts/generate-other-symbol-catalog.mjs");
assert.doesNotMatch(generator, /fullSvg|relativePath|\bsvg:\s*fullSvg/);

const customSign = read("src/data/traffic-signs-kontrol-kesimi-custom.js");
assert.doesNotMatch(customSign, /\n\s*(?:svg|relativePath):/);

console.log(`performance stability smoke: ok (${catalogRecords} catalog records, ${Math.round(catalogBytes / 1024)} KB)`);
