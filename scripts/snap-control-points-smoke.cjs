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

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
}

function loadEditorGrid() {
  const editor = new FakeNode();
  const canvas = new FakeNode();
  canvas.getBoundingClientRect = () => ({ width: 1200, height: 800, left: 0, top: 0 });
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
        getObjectsInDomOrder() { return []; },
        getAdapter() { return { capabilities: {} }; }
      }
    },
    krokiEditorCamera: {
      readViewBox() { return { x: 0, y: 0, width: 1200, height: 800 }; },
      isGestureActive() { return false; }
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
    Event: class {}
  });
  vm.runInContext(read("src/editor-grid.js"), context);
  return windowObject.Kroki.EditorGrid;
}

const grid = loadEditorGrid();
assert.ok(grid, "EditorGrid should initialize");
grid.beginGesture([], "mouse");
assert.equal(grid.snapAngle(4.99), 0);
assert.equal(grid.snapAngle(5), 0);
assert.equal(grid.snapAngle(5.01), 5.01);
assert.equal(grid.snapAngle(85), 90);
assert.equal(grid.snapAngle(95), 90);
assert.equal(grid.snapAngle(175), 180);
assert.equal(grid.snapAngle(265), 270);
assert.equal(grid.snapAngle(355), 0);
assert.equal(grid.snapAngle(88, { ctrlKey: true }), 88, "Ctrl should bypass angle assistance");
const snappedPoint = grid.snapPoint({ x: 23, y: 38 });
assert.equal(snappedPoint.x, 20);
assert.equal(snappedPoint.y, 40);

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

const selection = read("src/core/selectionManager.js");
assert.match(selection, /EditorGrid\?\.movePoint\(dragState\.startPoint, dragState\.gridAnchor, point\)/);

const multi = read("src/core/multiSelectManager.js");
assert.match(multi, /EditorGrid\?\.movePoint\(drag\.startPoint, drag\.gridAnchor, point, event\)/);
assert.match(multi, /function groupResizeScale[\s\S]+?EditorGrid\?\.snapPoint\(offsetPoint, modifiers\)/);
assert.match(multi, /function startGroupControlDrag[\s\S]+?EditorGrid\?\.beginGesture\(Array\.from\(selectedIds\), event\.pointerType\)/);
assert.match(multi, /if \(drag\.cpId === "rotate"\)[\s\S]+?EditorGrid\?\.snapAngle\(rawRotation, event\)/);

const styleManager = read("src/core/styleManager.js");
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
