const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/core/multiSelectManager.js"), "utf8");

function classList(initial = []) {
  const names = new Set(initial);
  return {
    add(...items) { items.forEach((item) => names.add(item)); },
    remove(...items) { items.forEach((item) => names.delete(item)); },
    contains(item) { return names.has(item); },
    toggle(item, force) {
      const enabled = force === undefined ? !names.has(item) : Boolean(force);
      if (enabled) names.add(item);
      else names.delete(item);
      return enabled;
    }
  };
}

function control(initialClasses = []) {
  const attributes = new Map();
  return {
    classList: classList(initialClasses),
    disabled: false,
    addEventListener() {},
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) || null; }
  };
}

const topIp = control();
const sideIp = control();
const multiButton = control();
const doneButton = control();
const canvas = { addEventListener() {}, querySelector() { return null; } };
const objects = new Map([
  ["shape-1", { id: "shape-1", type: "rectangle", style: {} }],
  ["vehicle-1", { id: "vehicle-1", type: "vehicle", style: {} }]
]);
let hiddenFloatingPanels = 0;

const Kroki = {
  EditorUtils: {},
  EditorObjectManager: {
    canvas,
    get(id) { return objects.get(id) || null; },
    getAdapter() { return null; },
    getObjectsInDomOrder() { return Array.from(objects.values()); }
  },
  SelectionManager: {
    clear() {},
    getActiveId() { return ""; },
    getActiveModel() { return null; }
  },
  ControlPointManager: { clear() {} },
  StyleManager: { hidePanels() { hiddenFloatingPanels += 1; } }
};

const windowObject = {
  Kroki,
  krokiObjectEditCore: { topIp, sideIp },
  krokiEditorState: { setEditedObject() {}, clearEditedObject() {} },
  addEventListener() {},
  setTimeout,
  clearTimeout
};

vm.runInNewContext(source, {
  window: windowObject,
  document: {
    querySelector(selector) {
      if (selector === "#btnMultiSelectMode") return multiButton;
      if (selector === "#btnEditTamam") return doneButton;
      return null;
    },
    querySelectorAll() { return []; }
  },
  console,
  setTimeout,
  clearTimeout
});

Kroki.MultiSelectManager.selectIds(["shape-1"], { mode: "preselect" });
assert.equal(topIp.classList.contains("gizli"), false, "coklu secim islemleri gorunur kalmali");
assert.equal(sideIp.classList.contains("gizli"), true, "tek nesne IP'si coklu secim baslar baslamaz kapanmali");
assert.ok(hiddenFloatingPanels > 0, "acik nesne alt panelleri de kapanmali");

Kroki.MultiSelectManager.addIds(["vehicle-1"], { mode: "preselect" });
assert.deepEqual(Array.from(Kroki.MultiSelectManager.getSelectedIds()), ["shape-1", "vehicle-1"]);
assert.equal(sideIp.classList.contains("gizli"), true, "farkli IP tipleri secildiginde nesne IP'si kapali kalmali");

console.log("multi select IP smoke: ok");
