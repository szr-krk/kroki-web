const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, enabled) {
    if (enabled) this.values.add(name);
    else this.values.delete(name);
  }
}

class FakeNode {
  constructor() {
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.style = {};
  }

  append() {}

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  dispatchEvent(event) {
    this.listeners.get(event.type)?.({ ...event, target: this });
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
}

function loadEditorGrid(canvasRect = { width: 1200, height: 800, left: 0, top: 0 }, initialBox = { x: 0, y: 0, width: 1200, height: 800 }) {
  const editor = new FakeNode();
  const canvas = new FakeNode();
  canvas.getBoundingClientRect = () => canvasRect;
  canvas.setAttribute("viewBox", "0 0 1200 800");
  const gridCanvas = new FakeNode();
  gridCanvas.getContext = () => ({
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {}
  });
  const nodes = new Map([
    ["#editor", editor],
    ["#editorCanvas", canvas],
    ["#editorGrid", gridCanvas],
    ["#btnEditorGrid", new FakeNode()],
    ["#btnEditorSnap", new FakeNode()],
    ["#btnEditorRulers", new FakeNode()],
    ["#editorRulerX", new FakeNode()],
    ["#editorRulerY", new FakeNode()]
  ]);
  const documentObject = {
    addEventListener() {},
    querySelector(selector) {
      return nodes.get(selector) || null;
    },
    createElementNS() {
      return new FakeNode();
    }
  };
  const windowObject = {
    Kroki: {
      EditorObjectManager: {
        getObjectsInDomOrder() { return []; }
      }
    },
    addEventListener() {},
    dispatchEvent() {}
  };
  windowObject.window = windowObject;
  const context = vm.createContext({
    window: windowObject,
    document: documentObject,
    requestAnimationFrame() { return 1; },
    ResizeObserver: class { observe() {} },
    Event: class {},
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    }
  });
  vm.runInContext(read("src/editor-camera.js"), context);
  const camera = windowObject.krokiEditorCamera;
  camera.writeViewBox(canvas, initialBox);
  const corner = camera.clientToWorld(canvas, canvasRect.left, canvasRect.top);
  assert.equal(corner.x, initialBox.x, "Camera x origin must align with the canvas left edge");
  assert.equal(corner.y, initialBox.y, "Camera y origin must align with the canvas top edge");
  vm.runInContext(read("src/editor-grid.js"), context);
  const gridCorner = windowObject.Kroki.EditorGrid.pointFromEvent({ clientX: canvasRect.left, clientY: canvasRect.top });
  assert.equal(gridCorner.x, corner.x, "Grid x and camera x must agree");
  assert.equal(gridCorner.y, corner.y, "Grid y and camera y must agree");
  return windowObject.Kroki.EditorGrid;
}

for (const [width, height] of [[1600, 800], [600, 1200], [1200, 800]]) {
  const rect = { width, height, left: 32, top: 32 };
  loadEditorGrid(rect);
  loadEditorGrid(rect, { x: -120, y: 80, width: 600, height: 400 });
}

const grid = loadEditorGrid();
assert.ok(grid, "EditorGrid should initialize");
assert.equal(grid.placementSnapStep(), 20, "Insertion must use the same minor grid step as dragging");
const editorGridSource = read("src/editor-grid.js");
assert.match(editorGridSource, /gesturePositionSnapEnabled = options\.positionSnap !== false/);
assert.doesNotMatch(editorGridSource, /excludedIds\.every\([\s\S]+?capabilities\?\.gridSnap/, "Grid should not infer group policy from member adapters");
grid.beginGesture([], "mouse");
assert.equal(grid.snapAngle(9.99), 0);
assert.equal(grid.snapAngle(10), 0);
assert.equal(grid.snapAngle(10.01), 10.01);
assert.equal(grid.snapAngle(80), 90);
assert.equal(grid.snapAngle(100), 90);
assert.equal(grid.snapAngle(170), 180);
assert.equal(grid.snapAngle(260), 270);
assert.equal(grid.snapAngle(350), 0);
assert.equal(grid.snapAngle(88, { ctrlKey: true }), 88, "Ctrl should bypass angle assistance");
const snappedPoint = grid.snapPoint({ x: 23, y: 38 });
assert.equal(snappedPoint.x, 20);
assert.equal(snappedPoint.y, 40);

const lineGeometryWindow = { Kroki: { EditorUtils: {} } };
lineGeometryWindow.window = lineGeometryWindow;
vm.runInContext(read("src/geometry/lineGeometry.js"), vm.createContext({ window: lineGeometryWindow }));
const inset = lineGeometryWindow.Kroki.LineGeometry.insetSegment(
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  16,
  20
);
assert.deepEqual({ ...inset.start }, { x: 16, y: 0 });
assert.deepEqual({ ...inset.end }, { x: 80, y: 0 });

grid.beginGesture(["catalog-object"], "touch", { positionSnap: false });
assert.equal(grid.snapPoint({ x: 23, y: 38 }).x, 23, "Catalog object position should remain free");
assert.equal(grid.snapAngle(87), 90, "Catalog object rotation should keep cardinal assistance");
grid.beginGesture(["catalog-object"], "touch", { positionSnap: true });
assert.equal(grid.snapPoint({ x: 23, y: 38 }).x, 20, "Group position and resize should override member opt-outs");

function controlPointMethod(file) {
  const source = read(file);
  const start = source.indexOf("moveControlPoint(");
  const end = source.indexOf("\n    move(model", start);
  assert.ok(start >= 0 && end > start, `${file}: moveControlPoint method should exist`);
  return { source, method: source.slice(start, end) };
}

const drawingAdapters = {
  "src/adapters/lineAdapter.js": ["snapPoint"],
  "src/adapters/arcAdapter.js": ["snapPoint"],
  "src/adapters/bezierAdapter.js": ["snapPoint"],
  "src/adapters/circleAdapter.js": ["snapPoint", "snapAngle"],
  "src/adapters/ellipseAdapter.js": ["snapPoint", "snapAngle"],
  "src/adapters/rectangleAdapter.js": ["snapPoint", "snapAngle"],
  "src/adapters/closedShapeAdapter.js": ["snapPoint", "snapAngle"],
  "src/adapters/calloutAdapter.js": ["snapPoint"],
  "src/adapters/textAdapter.js": ["snapAngle"]
};

Object.entries(drawingAdapters).forEach(([file, helpers]) => {
  const { source, method } = controlPointMethod(file);
  helpers.forEach((helper) => assert.ok(method.includes(helper), `${file}: control points should use ${helper}`));
  assert.doesNotMatch(source, /gridSnap:\s*false/, `${file}: drawing tools should allow move snapping`);
});

[
  "src/adapters/trafficSignAdapter.js",
  "src/adapters/vehicleAdapter.js",
  "src/adapters/otherSymbolAdapter.js"
].forEach((file) => {
  const { source, method } = controlPointMethod(file);
  assert.ok(method.includes("snapAngle"), `${file}: rotate control point should use snapAngle`);
  assert.match(source, /gridSnap:\s*false/, `${file}: positional movement should remain free`);
  assert.match(method, /modifiers\s*=\s*\{\}/, `${file}: control point should receive modifier keys`);
});

const selection = read("src/core/selectionManager.js");
assert.match(selection, /EditorGrid\?\.movePoint\(dragState\.startPoint, dragState\.gridAnchor, point\)/);
assert.match(selection, /const positionSnap = type === "object"[\s\S]+?capabilities\?\.gridSnap !== false[\s\S]+?extra\.cpId !== "rotate"/);
assert.match(selection, /beginGesture\(\[model\.id\], event\.pointerType, \{ positionSnap \}\)/);
assert.match(selection, /function updateLineControlPreview[\s\S]+?adapter\.render\(model, dragState\.lineElement\)/);
assert.doesNotMatch(selection, /function renderLinePreviewElement/, "Line CP preview must use the adapter render path so arrow insets stay active");

const multi = read("src/core/multiSelectManager.js");
assert.match(multi, /EditorGrid\?\.movePoint\(drag\.startPoint, drag\.gridAnchor, point, event\)/);
assert.match(multi, /function groupResizeScale[\s\S]+?EditorGrid\?\.snapPoint\(offsetPoint, modifiers\)/);
assert.match(multi, /function startGroupControlDrag[\s\S]+?beginGesture\(Array\.from\(selectedIds\), event\.pointerType, \{ positionSnap: cpId !== "rotate" \}\)/);
assert.match(multi, /function beginMove[\s\S]+?const positionSnap = Boolean\(activeGroupId\)[\s\S]+?ids\.every\([\s\S]+?gridSnap !== false[\s\S]+?beginGesture\(ids, event\.pointerType, \{ positionSnap \}\)/);
assert.match(multi, /if \(drag\.cpId === "rotate"\)[\s\S]+?EditorGrid\?\.snapAngle\(rawRotation, event\)/);

const styleManager = read("src/core/styleManager.js");
assert.match(styleManager, /triangle:\s*\{[\s\S]+?refX: "0",[\s\S]+?snapX: 10,/);
assert.match(styleManager, /function markerTipOffset[\s\S]+?function lineEndpointMarkerOffset/);
assert.match(styleManager, /lineEndpointMarkerOffset,/);
const lineAdapterSource = read("src/adapters/lineAdapter.js");
const arcAdapterSource = read("src/adapters/arcAdapter.js");
const bezierAdapterSource = read("src/adapters/bezierAdapter.js");
assert.match(lineAdapterSource, /function renderedEndpoints[\s\S]+?lineEndpointMarkerOffset/);
assert.match(lineAdapterSource, /dataset\.geometryEndX/);
assert.match(arcAdapterSource, /function cubicArcSegments/);
assert.match(arcAdapterSource, /function renderedPathData/);
assert.match(bezierAdapterSource, /function cubicGeometry/);
assert.match(bezierAdapterSource, /function renderedPathData/);
const objectRotationStart = styleManager.indexOf("function setObjectRotation");
const objectRotationEnd = styleManager.indexOf("function syncObjectRotationControls", objectRotationStart);
assert.doesNotMatch(styleManager.slice(objectRotationStart, objectRotationEnd), /snapAngle/, "IP object rotation must stay free at one-degree steps");
assert.match(styleManager, /bindHoldAction\(controls\.objectRotateMinus, \(\) => updateObjectRotation\(-1\)/);
assert.match(styleManager, /bindHoldAction\(controls\.objectRotatePlus, \(\) => updateObjectRotation\(1\)/);

const groupRotationStart = multi.indexOf("function setGroupRotation");
const groupRotationEnd = multi.indexOf("function startGroupControlDrag", groupRotationStart);
assert.doesNotMatch(multi.slice(groupRotationStart, groupRotationEnd), /snapAngle/, "IP group rotation must stay free at one-degree steps");
assert.match(multi, /bindHold\?\.\(groupIpControls\.rotateMinus, \(\) => stepGroupRotation\(-1\)/);
assert.match(multi, /bindHold\?\.\(groupIpControls\.rotatePlus, \(\) => stepGroupRotation\(1\)/);

console.log("snap control points and move smoke: ok");
