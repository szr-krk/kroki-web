const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));
const mutations = [];
const dataAttribute = (name) => "data-" + name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());

// Reflect dataset/class writes into attributes, including redundant setAttribute calls.
class SvgNode {
  constructor(tagName = "g") {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.dataset = new Proxy({}, {
      get: (_, name) => this.getAttribute(dataAttribute(name)) ?? undefined,
      set: (_, name, value) => { this.setAttribute(dataAttribute(name), value); return true; },
      deleteProperty: (_, name) => { this.removeAttribute(dataAttribute(name)); return true; }
    });
    this.classList = {
      contains: (name) => (this.getAttribute("class") || "").split(/\s+/).includes(name),
      toggle: (name, enabled) => {
        if (this.classList.contains(name) === enabled) return enabled;
        const names = (this.getAttribute("class") || "").split(/\s+/).filter(Boolean);
        this.setAttribute("class", enabled ? [...names, name].join(" ") : names.filter((item) => item !== name).join(" "));
        return enabled;
      }
    };
    this.style = new Proxy({}, {
      set: (target, name, value) => {
        mutations.push({ element: this, name: "style." + name, value });
        target[name] = value;
        return true;
      }
    });
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) {
    mutations.push({ element: this, name, value: String(value) });
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    if (this.attributes.delete(name)) mutations.push({ element: this, name, value: null });
  }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener() {}
  querySelector(selector) {
    const [tag, className] = selector.split(".");
    return this.children.find((child) => (!tag || child.tagName === tag) && child.classList.contains(className)) || null;
  }
  querySelectorAll() { return []; }
}

const windowObject = { addEventListener() {} };
const context = vm.createContext({
  window: windowObject,
  document: { createElementNS(_namespace, tag) { return new SvgNode(tag); } }
});
const load = (file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
load("src/core/shapeRegistry.js");
const { EditorUtils: utils, ShapeRegistry: registry } = windowObject.Kroki;

const probe = new SvgNode();
for (const value of ["", 0, -0, 1, null, undefined, false, NaN]) {
  probe.removeAttribute("value");
  utils.setAttributeIfChanged(probe, "value", value);
  assert.equal(probe.getAttribute("value"), String(value));
  mutations.length = 0;
  utils.setAttributeIfChanged(probe, "value", String(value));
  assert.equal(mutations.length, 0, `unchanged serialized ${String(value)} must not be written`);
}
let conversions = 0;
utils.setAttributeIfChanged(probe, "value", { toString() { conversions += 1; return "object"; } });
assert.equal(conversions, 1, "values must be converted exactly once");
probe.setAttribute("value", "01");
utils.setAttributeIfChanged(probe, "value", 1);
assert.equal(probe.getAttribute("value"), "1", "compare exact strings, not numeric equivalence");
probe.setAttribute("value", "external edit");
utils.setAttributeIfChanged(probe, "value", 1);
assert.equal(probe.getAttribute("value"), "1", "read current DOM state after external edits");

windowObject.Kroki.StyleManager = {
  lineEndpointMarkerOffset(model, end) { return model.style[end + "Offset"] || 0; },
  readStyleFromElement() { return {}; },
  readLabelFromElement() { return {}; }
};
for (const type of ["line", "circle", "ellipse", "rectangle"]) load(`src/geometry/${type}Geometry.js`);
for (const type of ["line", "arc", "bezier", "circle", "ellipse", "rectangle", "closedShape"]) load(`src/adapters/${type}Adapter.js`);

const fixtures = [
  { type: "line", attribute: "x1", expected: "17" },
  { type: "line", attribute: "x1", expected: "25", style: { startOffset: 8, endOffset: 12 } },
  { type: "arc", attribute: "data-arc-control-y", expected: "39" },
  { type: "arc", attribute: "x1", expected: "17", style: { startOffset: 8, endOffset: 12 } },
  { type: "bezier", attribute: "data-bezier-q-x", expected: "67" },
  { type: "bezier", attribute: "data-bezier-c1-y", expected: "29", bezierType: "cubic" },
  { type: "bezier", attribute: "x1", expected: "17", style: { startOffset: 8, endOffset: 12 } },
  { type: "circle", attribute: "cx", expected: "67" },
  { type: "ellipse", attribute: "cx", expected: "67" },
  { type: "rectangle", attribute: "x", expected: "17" },
  { type: "closedShape", attribute: "data-closed-shape-points", expected: "[{\"x\":17,\"y\":29},{\"x\":117,\"y\":29},{\"x\":117,\"y\":89}]" }
];

for (const fixture of fixtures) {
  const adapter = registry.get(fixture.type);
  assert.ok(adapter, `${fixture.type} must initialize`);
  const model = adapter.create({
    start: { x: 10, y: 20 }, end: { x: 110, y: 20 }, ratio: 0.2, rotation: 377,
    points: [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 80 }],
    bezierType: fixture.bezierType,
    style: { strokeWidth: 3, lineCap: "round", ...fixture.style }
  });
  const element = new SvgNode(adapter.elementTag);
  const selection = adapter.createSelectionElement();
  const render = () => {
    adapter.render(model, element);
    adapter.renderSelection(selection, model, model.style, "edit");
  };
  render();
  const geometry = plain(model.geometry);
  const serialized = Array.from(element.attributes);
  mutations.length = 0;
  for (let frame = 0; frame < 100; frame += 1) render();
  assert.equal(mutations.length, 0, `${fixture.type}: unchanged renders must not mutate SVG attributes`);
  assert.deepEqual(Array.from(element.attributes), serialized);
  assert.deepEqual(plain(model.geometry), geometry, `${fixture.type}: rendering must preserve geometry`);
  assert.deepEqual(plain(adapter.readFromElement(element).geometry), geometry, `${fixture.type}: serialized geometry must round-trip`);

  adapter.move(model, 7, 9);
  render();
  assert.equal(element.getAttribute(fixture.attribute), fixture.expected, `${fixture.type}: real movement must reach the DOM`);
  assert.ok(mutations.some((entry) => entry.element === selection), `${fixture.type}: selection must follow movement`);
  mutations.length = 0;
  render();
  assert.equal(mutations.length, 0, `${fixture.type}: moved geometry must settle without repeated writes`);
  model.style.strokeWidth = 7;
  render();
  assert.deepEqual(mutations.map(({ name, value }) => ({ name, value })), [{ name: "stroke-width", value: "11" }]);

  // Restore an externally modified attribute even though the model did not change.
  element.setAttribute(fixture.attribute, "external edit");
  render();
  assert.equal(element.getAttribute(fixture.attribute), fixture.expected);
}

const bezier = registry.get("bezier");
const curveElement = new SvgNode("path");
for (const type of ["quadratic", "cubic", "quadratic"]) {
  const model = bezier.create({ start: { x: 10, y: 20 }, end: { x: 110, y: 20 }, bezierType: type, style: {} });
  curveElement.setAttribute("transform", "translate(1 2)");
  bezier.render(model, curveElement);
  assert.equal(curveElement.getAttribute("transform"), null);
  assert.deepEqual(plain(bezier.readFromElement(curveElement).geometry), plain(model.geometry));
  assert.equal(curveElement.dataset.bezierQX === undefined, type === "cubic");
  assert.equal(curveElement.dataset.bezierC1X === undefined, type === "quadratic");
}

const editLayer = new SvgNode();
const controlPoint = { id: "resize", x: 25, y: 40, angle: 17, cursor: "grab" };
const cpModel = { id: "control-point-test", type: "fixture", style: {} };
windowObject.Kroki.EditorObjectManager = {
  canvas: { addEventListener() {}, querySelector() { return editLayer; } },
  get() { return cpModel; },
  getAdapter() {
    return {
      createSelectionElement() { return new SvgNode(); },
      renderSelection() {},
      getControlPoints() { return [controlPoint]; }
    };
  }
};
load("src/core/controlPointManager.js");
const controlPoints = windowObject.Kroki.ControlPointManager;
controlPoints.show(cpModel.id, "edit");
const handle = editLayer.children.find((node) => node.dataset.point === "resize");
assert.equal(handle.getAttribute("transform"), "translate(25 40) rotate(17)");
mutations.length = 0;
for (let frame = 0; frame < 100; frame += 1) controlPoints.sync({ resize: false, reuseMetrics: true });
assert.equal(mutations.length, 0, "unchanged control-point frames must not write transforms or cursors");
controlPoint.x = 26;
controlPoint.cursor = "move";
controlPoints.sync({ resize: false, reuseMetrics: true });
assert.deepEqual(mutations.map(({ name, value }) => ({ name, value })), [
  { name: "transform", value: "translate(26 40) rotate(17)" },
  { name: "style.cursor", value: "move" }
]);

console.log(`SVG render write stability smoke: ok (${fixtures.length} adapter variants, control-point updates)`);
