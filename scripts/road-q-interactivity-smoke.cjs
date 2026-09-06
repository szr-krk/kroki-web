const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class EventTargetStub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatchEvent(event) {
    event.target ||= this;
    [...(this.listeners.get(event.type) || [])].forEach((callback) => callback(event));
  }
}

class SvgNode extends EventTargetStub {
  constructor(tag, attrs = {}) {
    super();
    this.tagName = tag;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.parentNode = null;
    this.classList = {
      contains: (name) => (this.getAttribute("class") || "").split(/\s+/).includes(name),
      add: (name) => this.setAttribute("class", [...new Set([...(this.getAttribute("class") || "").split(/\s+/).filter(Boolean), name])].join(" ")),
      remove: (name) => this.setAttribute("class", (this.getAttribute("class") || "").split(/\s+/).filter((value) => value !== name).join(" "))
    };
    Object.entries(attrs).forEach(([name, value]) => this.setAttribute(name, value));
  }
  get id() { return this.getAttribute("id"); }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children.at(-1) || null; }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  append(...nodes) {
    nodes.forEach((node) => { node.remove(); node.parentNode = this; this.children.push(node); });
  }
  insertBefore(node, reference) {
    if (!reference) return this.append(node);
    node.remove();
    this.children.splice(this.children.indexOf(reference), 0, node);
    node.parentNode = this;
  }
  replaceChildren(...nodes) {
    [...this.children].forEach((node) => node.remove());
    this.append(...nodes);
  }
  matches(selector) {
    return selector.split(",").some((part) => {
      const value = part.trim();
      if (value.startsWith("#")) return this.id === value.slice(1);
      if (value.startsWith(".")) return value.slice(1).split(".").every((name) => this.classList.contains(name));
      return this.tagName === value;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  querySelectorAll(selector) {
    return this.children.flatMap((node) => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function createScene({ timeoutFallback = false } = {}) {
  const callbacks = new Map();
  let nextFrame = 0;
  const window = new EventTargetStub();
  const document = new EventTargetStub();
  document.querySelector = () => null;
  document.createElementNS = (_, tag) => new SvgNode(tag);
  const enqueue = (callback) => { callbacks.set(++nextFrame, callback); return nextFrame; };
  const cancel = (id) => callbacks.delete(id);
  window.setTimeout = enqueue;
  window.clearTimeout = cancel;
  if (!timeoutFallback) {
    window.requestAnimationFrame = enqueue;
    window.cancelAnimationFrame = cancel;
  }
  const canvas = new SvgNode("svg");
  canvas.viewBox = { baseVal: { x: -500, y: -500, width: 1000, height: 1000 } };
  const objectLayer = new SvgNode("g", { id: "editorObjects" });
  canvas.append(objectLayer);
  let adapter;
  let roadReads = 0;
  let roadRenders = 0;
  let activeModel = null;
  let activeTool = "";
  let objects = [];
  const elements = new Map();
  const manager = {
    canvas, objectLayer,
    get: (id) => objects.find((model) => model.id === id),
    getAdapter: () => adapter,
    getElement: (id) => elements.get(id),
    getAll: () => objects,
    getObjectsInDomOrder: () => { roadReads += 1; return objects; },
    renderObject: () => { roadRenders += 1; }
  };
  window.Kroki = {
    EditorObjectManager: manager,
    EditorUtils: {
      numberOr: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
      clonePlain: clone,
      createSvgElement: (tag, attrs) => new SvgNode(tag, attrs),
      svgUnitsPerScreenPx: () => 1,
      pointFromEvent: (_, event) => ({ x: event.clientX, y: event.clientY })
    },
    ShapeRegistry: { register: (_, value) => { adapter = value; } },
    LineGeometry: {},
    StyleManager: { normalizeStyle: (value) => ({ ...value }) },
    SelectionManager: { getActiveModel: () => activeModel },
    DocumentSerializer: {
      exportDocument: () => ({ roadIntersection: window.Kroki.RoadIntersectionEngine.exportState() }),
      importDocument: (state) => window.Kroki.RoadIntersectionEngine.importState(state.roadIntersection)
    }
  };
  window.krokiEditorState = { getActiveTool: () => activeTool };
  const context = vm.createContext({ window, document, performance, console, CustomEvent: class {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  } });
  vm.runInContext(read("src/adapters/roadAdapter.js"), context);
  objects = [
    { id: "horizontal", start: { x: -400, y: 0 }, end: { x: 400, y: 0 } },
    { id: "vertical", start: { x: 0, y: -400 }, end: { x: 0, y: 400 } }
  ].map(({ id, start, end }) => ({ ...adapter.create({
    geometry: { profile: "straight", start, end },
    metadata: { road: { laneCount: 2, laneWidth: 50, laneWidths: [50, 50], divided: false } }
  }), id }));
  objects.forEach((model) => {
    const element = new SvgNode("g", { "data-kroki-object": "true", "data-shape": "road" });
    elements.set(model.id, element);
    objectLayer.append(element);
  });
  const normalObject = new SvgNode("rect", { id: "normal-object" });
  objectLayer.append(normalObject);
  vm.runInContext(read("src/core/historyManager.js"), context);
  vm.runInContext(read("src/core/roadIntersectionEngine.js"), context);
  const engine = window.Kroki.RoadIntersectionEngine;
  function frame() {
    const pending = [...callbacks.entries()];
    pending.forEach(([id, callback]) => {
      if (!callbacks.delete(id)) return;
      callback();
    });
  }
  function pointer(target, type, point = { x: 0, y: 0 }, pointerId = 7) {
    const event = { type, pointerId, clientX: point.x, clientY: point.y, isTrusted: false,
      preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() {}
    };
    target.dispatchEvent(event);
    return event;
  }
  frame();
  return { window, canvas, objectLayer, normalObject, engine, frame, pointer,
    history: window.Kroki.HistoryManager,
    pending: () => callbacks.size,
    reads: () => roadReads,
    renders: () => roadRenders,
    setActiveModel: (value) => { activeModel = value; },
    setTool: (value) => { activeTool = value; },
    layer: () => canvas.querySelector("#roadIntersectionContourLayer")
  };
}

function hitFor(scene, key) {
  return scene.layer().querySelectorAll(".road-intersection-q-hit").find((node) => node.dataset.qKey === key);
}

const scene = createScene();
assert.ok(scene.engine.getDiagnostics().intersectionShapeCount > 0, "The fixture must build a real road intersection");
assert.ok(scene.engine.getLastQSegments().length > 0, "The fixture must produce editable Q segments");
const key = scene.engine.getLastQSegments()[0].key;
const geometry = clone(scene.engine.getLastQSegments());
const state = clone(scene.engine.exportState());
const originalArtwork = scene.layer().children.filter((node) => !node.classList.contains("road-intersection-q-hit"));
const reads = scene.reads();
const renders = scene.renders();
const layerOrder = scene.objectLayer.children.slice();

scene.pointer(hitFor(scene, key), "pointerdown");
assert.equal(scene.reads(), reads, "Selecting a Q must not recollect or recompute road geometry");
assert.equal(scene.layer().querySelectorAll(".road-intersection-q-control").length, 1);
assert.equal(scene.layer().querySelectorAll(".road-intersection-q-endpoint").length, 2);
assert.ok(hitFor(scene, key).classList.contains("is-selected"));
scene.pointer(hitFor(scene, key), "pointerdown");
assert.equal(scene.layer().querySelectorAll(".road-intersection-q-control").length, 0, "Second Q touch should deselect");
scene.pointer(hitFor(scene, key), "pointerdown");
scene.pointer(scene.canvas, "pointerdown");
assert.equal(scene.layer().querySelectorAll(".road-intersection-q-control").length, 0, "Outside touch should deselect");
scene.pointer(hitFor(scene, key), "pointerdown");
scene.engine.clearQSelection();
assert.equal(scene.layer().querySelectorAll(".road-intersection-q-control").length, 0);
assert.equal(scene.reads(), reads, "Q selection must not recollect or recompute road geometry");
assert.equal(scene.renders(), renders, "Q selection must not rerender road objects");
assert.equal(scene.pending(), 0, "Q selection must not schedule a geometry rebuild");
assert.deepEqual(clone(scene.engine.getLastQSegments()), geometry);
assert.deepEqual(clone(scene.engine.exportState()), state, "Selection must not alter serialized edits");
assert.deepEqual(scene.objectLayer.children, layerOrder, "Road/contour/normal-object stacking must not change");
assert.deepEqual(scene.layer().children.slice(0, originalArtwork.length), originalArtwork, "Artwork nodes must remain untouched");

scene.setActiveModel({ type: "rectangle" });
assert.ok(scene.pointer(hitFor(scene, key), "pointerdown").prevented);
assert.equal(scene.layer().querySelectorAll(".road-intersection-q-control").length, 0, "Normal-object editing must still block Q interaction");
scene.setActiveModel(null);
scene.setTool("rectangle");
scene.pointer(hitFor(scene, key), "pointerdown");
assert.equal(scene.layer().querySelectorAll(".road-intersection-q-control").length, 0, "An active tool must still block Q interaction");
scene.setTool("");

scene.pointer(hitFor(scene, key), "pointerdown");
scene.pointer(scene.layer().querySelector(".road-intersection-q-control"), "pointerdown");
scene.pointer(scene.window, "pointerup");
assert.equal(scene.reads(), reads, "A handle touch without movement must not rebuild geometry");
assert.equal(scene.history.size().undo, 0, "A handle touch without movement must not create history");
assert.equal(scene.pending(), 0);

for (const timeoutFallback of [false, true]) {
  const current = createScene({ timeoutFallback });
  const before = current.reads();
  current.engine.scheduleRefresh();
  current.engine.rebuild();
  assert.equal(current.reads(), before + 1);
  assert.equal(current.pending(), 0, "An immediate rebuild must cancel its previously queued callback");
  current.frame();
  assert.equal(current.reads(), before + 1, "The cancelled callback must not rebuild twice");
}

function drag(side, stopType, perMoveFrames) {
  const current = createScene();
  const segment = clone(current.engine.getLastQSegments()[0]);
  const before = clone(current.engine.exportState());
  const beforeGeometry = clone(current.engine.getLastQSegments());
  current.pointer(hitFor(current, segment.key), "pointerdown");
  const handle = current.layer().querySelector(side === "control" ? ".road-intersection-q-control" : `.road-intersection-q-endpoint-${side}`);
  const origin = segment[side];
  current.pointer(handle, "pointerdown", origin);
  const baselineReads = current.reads();
  const points = side === "control"
    ? [1, 2, 3].map((factor) => ({ x: origin.x + 3 * factor, y: origin.y + 2 * factor }))
    : [0.15, 0.25, 0.35].map((factor) => ({
      x: origin.x + (segment.control.x - origin.x) * factor,
      y: origin.y + (segment.control.y - origin.y) * factor
    }));
  points.forEach((point) => {
    current.pointer(current.window, "pointermove", point);
    if (perMoveFrames) current.frame();
  });
  if (!perMoveFrames) {
    assert.equal(current.reads(), baselineReads, "Pointermove must defer geometry rendering to the frame");
    assert.equal(current.pending(), 1, "Multiple pointermoves must share one render callback");
  }
  current.pointer(current.window, stopType, points.at(-1));
  assert.equal(current.pending(), 0, "Stopping must flush the final edit without a redundant frame");
  assert.equal(current.reads(), baselineReads + (perMoveFrames ? points.length : 1));
  const after = clone(current.engine.exportState());
  const afterGeometry = clone(current.engine.getLastQSegments());
  assert.notDeepEqual(after, before, `${side} dragging must persist an edit`);
  assert.notDeepEqual(afterGeometry, beforeGeometry, `${side} dragging must update visible Q geometry`);
  assert.equal(current.history.size().undo, 1, "A drag must create exactly one undo transaction");
  assert.equal(current.history.undo(), true);
  current.frame();
  assert.deepEqual(clone(current.engine.exportState()), before, "Undo must restore the pre-drag edit state");
  assert.deepEqual(clone(current.engine.getLastQSegments()), beforeGeometry, "Undo must restore the pre-drag geometry");
  assert.equal(current.history.redo(), true);
  current.frame();
  assert.deepEqual(clone(current.engine.exportState()), after, "Redo must restore the final edit state");
  assert.deepEqual(clone(current.engine.getLastQSegments()), afterGeometry, "Redo must restore the final geometry");
  return { after, afterGeometry };
}

for (const side of ["control", "entry", "exit"]) {
  const coalesced = drag(side, "pointerup", false);
  assert.deepEqual(coalesced, drag(side, "pointerup", true), `${side}: coalescing must preserve the result of rendering every move`);
  assert.deepEqual(coalesced, drag(side, "pointercancel", false), `${side}: cancellation must preserve the existing commit-on-cancel behavior`);
}

{
  const scene = createScene();
  const manager = scene.window.Kroki.EditorObjectManager;
  const objects = manager.getAll();
  const adapter = manager.getAdapter();
  const island = (id, x) => ({ ...adapter.create({ geometry: {
    profile: "islandRing", center: { x, y: 0 }, innerDiameter: 160, outerDiameter: 360
  } }), id });
  objects.push(island("island-a", 0));
  scene.engine.rebuild();
  const layer = scene.canvas.querySelector("#roadIntersectionContourLayer");
  assert.equal(scene.canvas.querySelector("#roadIntersectionContourMask").tagName, "clipPath");
  assert.ok(layer.getAttribute("clip-path"));
  assert.equal(layer.getAttribute("mask"), null);
  objects.push(island("island-b", 40));
  scene.engine.rebuild();
  assert.equal(scene.canvas.querySelector("#roadIntersectionContourMask").tagName, "mask", "Overlapping islands must retain union masking");
  assert.equal(layer.getAttribute("clip-path"), null);
  objects.pop();
  scene.engine.rebuild();
  assert.equal(scene.canvas.querySelector("#roadIntersectionContourMask").tagName, "clipPath");
  objects.pop();
  scene.engine.rebuild();
  assert.equal(scene.canvas.querySelector("#roadIntersectionContourMask"), null);
  assert.equal(layer.getAttribute("mask"), null);
  assert.equal(layer.getAttribute("clip-path"), null);
}

console.log("road Q interactivity and island clipping smoke: ok");
