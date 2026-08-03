const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor(initial = "") {
    this.values = new Set(String(initial).split(/\s+/).filter(Boolean));
  }

  toggle(name, enabled) {
    if (enabled) this.values.add(name);
    else this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeNode {
  constructor(attributes = {}) {
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.removed = false;
    Object.entries(attributes).forEach(([name, value]) => this.setAttribute(name, value));
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  remove() {
    this.removed = true;
  }

  addEventListener() {}

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.classList = new FakeClassList(value);
  }

  querySelector(selector) {
    const className = selector.split(".").filter(Boolean).at(-1);
    return this.children.find((child) => child.classList?.contains(className)) || null;
  }

  querySelectorAll() {
    return [];
  }
}

const editLayer = new FakeNode();
const canvasListeners = new Map();
const windowListeners = new Map();
const canvas = {
  querySelector(selector) {
    return selector === "#editorEditLayer" ? editLayer : null;
  },
  addEventListener(name, listener) {
    canvasListeners.set(name, listener);
  }
};

const model = { id: "object-1", type: "line" };
const adapter = {
  createSelectionElement() {
    return new FakeNode();
  },
  renderSelection() {},
  getControlPoints() {
    return [{ id: "start", x: -20, y: 50 }];
  }
};

const manager = {
  canvas,
  get(id) {
    return id === model.id ? model : null;
  },
  getAdapter(value) {
    return value ? adapter : null;
  },
  getContentBounds() {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
};

let viewBox = { x: 0, y: 0, width: 100, height: 100 };
let cameraWrites = 0;
let cameraFits = 0;
const camera = {
  readViewBox() {
    return { ...viewBox };
  },
  getViewportMetrics() {
    return { scale: 1, left: 0, top: 0, width: 100, height: 100 };
  },
  writeViewBox(_canvas, nextViewBox) {
    viewBox = { ...nextViewBox };
    cameraWrites += 1;
  },
  fitBounds() {
    cameraFits += 1;
  }
};

const windowObject = {
  Kroki: {
    EditorUtils: {
      svgUnitsPerScreenPx() {
        return 1;
      },
      createSvgElement(_name, attributes) {
        return new FakeNode(attributes);
      }
    },
    EditorObjectManager: manager
  },
  krokiEditorCamera: camera,
  addEventListener(name, listener) {
    windowListeners.set(name, listener);
  }
};
windowObject.window = windowObject;

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "core", "controlPointManager.js"),
  "utf8"
);
vm.runInNewContext(source, { window: windowObject, Map, Set, Math, Number, Array, Boolean, String });

const controlPoints = windowObject.Kroki.ControlPointManager;
assert.ok(controlPoints, "ControlPointManager should initialize");

controlPoints.show(model.id, "preselect");
assert.equal(cameraWrites + cameraFits, 0, "ordinary preselect must not move the camera");

canvasListeners.get("kroki:control-point-reveal-request")?.({ detail: { enabled: true } });
controlPoints.show(model.id, "edit");
assert.equal(cameraWrites + cameraFits, 0, "edit mode must not consume or apply the reveal request");

controlPoints.show(model.id, "preselect");
assert.equal(cameraWrites + cameraFits, 1, "the first requested preselect should reveal offscreen control points");

controlPoints.show(model.id, "preselect");
assert.equal(cameraWrites + cameraFits, 1, "the reveal request must be consumed after one preselect");

viewBox = { x: 0, y: 0, width: 100, height: 100 };
canvasListeners.get("kroki:control-point-reveal-request")?.({ detail: { enabled: true } });
windowListeners.get("kroki:camera-gesture-start")?.();
controlPoints.show(model.id, "preselect");
assert.equal(cameraWrites + cameraFits, 1, "manual camera gestures must cancel the pending reveal request");

const railSource = fs.readFileSync(path.join(__dirname, "..", "src", "editor-rail.js"), "utf8");
const fitStart = railSource.indexOf("function fitEditorToScreen");
const fitEnd = railSource.indexOf("function syncEditorFullscreenButton", fitStart);
const fitSource = railSource.slice(fitStart, fitEnd);
assert.ok(fitSource.includes("kroki:control-point-reveal-request"), "fit should publish the reveal request");
assert.ok(fitSource.includes("enabled: hasContent"), "fit should arm only when the document has content");
assert.ok(!fitSource.includes("ensureActiveVisible"), "fit must not move the camera for the current selection");

console.log("control-point fit gating smoke: ok");
