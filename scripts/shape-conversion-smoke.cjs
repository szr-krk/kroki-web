const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

class FakeClassList {
  constructor() {
    this.values = new Set(["gizli"]);
  }

  toggle(name, enabled) {
    if (enabled) this.values.add(name);
    else this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeButton {
  constructor() {
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.title = "";
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

const button = new FakeButton();
const buttonLabel = { textContent: "" };
const models = new Map();
const replacements = [];
const registry = new Map([
  ["arc", {
    pointAt() {
      return { x: 50, y: 30 };
    }
  }]
]);
const utils = {
  numberOr(value, fallback) {
    if (value == null || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  clonePlain(value) {
    return plain(value || {});
  },
  normalizeRotation(value) {
    let angle = this.numberOr(value, 0) % 360;
    if (angle <= -180) angle += 360;
    if (angle > 180) angle -= 360;
    return angle;
  }
};
const windowObject = {
  Kroki: {
    EditorUtils: utils,
    ShapeRegistry: { get(type) { return registry.get(type) || null; } },
    EditorObjectManager: {
      get(id) { return models.get(id) || null; },
      replaceObjectType(id, model, options) {
        replacements.push({ id, model: plain(model), options: plain(options) });
        models.set(id, model);
        return model;
      }
    },
    SelectionManager: {
      promoteToEdit() {},
      getActiveId() { return "shape-1"; }
    }
  }
};
windowObject.window = windowObject;
const context = vm.createContext({
  window: windowObject,
  document: {
    querySelector(selector) {
      if (selector === "#btnShapeConvert") return button;
      if (selector === "#lblShapeConvert") return buttonLabel;
      return null;
    }
  }
});
vm.runInContext(read("src/core/shapeConversionManager.js"), context);

const conversion = windowObject.Kroki.ShapeConversionManager;
assert.ok(conversion, "ShapeConversionManager should initialize");

const shared = {
  id: "shape-1",
  style: { stroke: "#123456", strokeWidth: 7, fill: "#abcdef" },
  label: { text: "Korunacak metin", size: 18 },
  metadata: { custom: { value: 42 } }
};
const line = {
  ...shared,
  type: "line",
  geometry: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }
};

const arc = conversion.nextModel(line);
assert.equal(arc.type, "arc");
assert.equal(arc.geometry.ratio, 0.2);
assert.deepEqual(plain(arc.style), shared.style);
assert.deepEqual(plain(arc.label), shared.label);
assert.deepEqual(plain(arc.metadata), shared.metadata);
assert.notEqual(arc.style, line.style, "style should be cloned");

const quadratic = conversion.nextModel(arc);
assert.equal(quadratic.type, "bezier");
assert.equal(quadratic.geometry.bezierType, "quadratic");
assert.deepEqual(plain(quadratic.geometry.q), { x: 50, y: 60 });

const cubic = conversion.nextModel(quadratic);
assert.equal(cubic.type, "bezier");
assert.equal(cubic.geometry.bezierType, "cubic");
assert.deepEqual(plain(cubic.geometry.c1), { x: 100 / 3, y: 40 });
assert.ok(Math.abs(cubic.geometry.c2.x - 200 / 3) < 1e-9);
assert.equal(cubic.geometry.c2.y, 40);

function quadraticPoint(geometry, t) {
  const u = 1 - t;
  return {
    x: u * u * geometry.start.x + 2 * u * t * geometry.q.x + t * t * geometry.end.x,
    y: u * u * geometry.start.y + 2 * u * t * geometry.q.y + t * t * geometry.end.y
  };
}

function cubicPoint(geometry, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * geometry.start.x + 3 * u * u * t * geometry.c1.x + 3 * u * t * t * geometry.c2.x + t ** 3 * geometry.end.x,
    y: u ** 3 * geometry.start.y + 3 * u * u * t * geometry.c1.y + 3 * u * t * t * geometry.c2.y + t ** 3 * geometry.end.y
  };
}

for (const t of [0, 0.2, 0.5, 0.83, 1]) {
  const qPoint = quadraticPoint(quadratic.geometry, t);
  const cPoint = cubicPoint(cubic.geometry, t);
  assert.ok(Math.abs(qPoint.x - cPoint.x) < 1e-9);
  assert.ok(Math.abs(qPoint.y - cPoint.y) < 1e-9);
}

const lineAgain = conversion.nextModel(cubic);
assert.equal(lineAgain.type, "line");
assert.deepEqual(plain(lineAgain.geometry), plain(line.geometry));

const circle = {
  ...shared,
  type: "circle",
  geometry: { cx: 25, cy: 40, r: 30, rotation: 15 }
};
const ellipse = conversion.nextModel(circle);
assert.equal(ellipse.type, "ellipse");
assert.deepEqual(plain(ellipse.geometry), { cx: 25, cy: 40, rx: 30, ry: 30, rotation: 15 });

ellipse.geometry.rx = 35;
ellipse.geometry.ry = 15;
const rectangle = conversion.nextModel(ellipse);
assert.equal(rectangle.type, "rectangle");
assert.deepEqual(plain(rectangle.geometry), { cx: 25, cy: 40, rx: 35, ry: 15, rotation: 15 });

const closedShape = conversion.nextModel(rectangle);
assert.equal(closedShape.type, "closedShape");
assert.equal(closedShape.geometry.closed, true);
assert.equal(closedShape.geometry.points.length, 4);
assert.equal(closedShape.geometry.controls.length, 4);
assert.deepEqual(plain(closedShape.geometry.frame), {
  cx: 25,
  cy: 40,
  width: 70,
  height: 30,
  rotation: 15
});
closedShape.geometry.controls.forEach((control, index) => {
  const start = closedShape.geometry.points[index];
  const end = closedShape.geometry.points[(index + 1) % closedShape.geometry.points.length];
  assert.ok(Math.abs(control.x - (start.x + end.x) / 2) < 1e-9);
  assert.ok(Math.abs(control.y - (start.y + end.y) / 2) < 1e-9);
});

const circleAgain = conversion.nextModel(closedShape);
assert.equal(circleAgain.type, "circle");
assert.deepEqual(plain(circleAgain.geometry), { cx: 25, cy: 40, r: 25, rotation: 15 });

assert.equal(conversion.infoFor({ type: "text" }), null);
assert.equal(conversion.infoFor({ type: "callout" }), null);
assert.equal(conversion.infoFor({ type: "closedShape", geometry: { closed: false } }), null);
assert.equal(conversion.infoFor({ type: "line", metadata: { draft: true } }), null);

conversion.syncButton(line);
assert.equal(button.classList.contains("gizli"), false);
assert.equal(buttonLabel.textContent, "Yay");
assert.equal(button.title, "Çizgi → Yay");
conversion.syncButton({ type: "callout" });
assert.equal(button.classList.contains("gizli"), true);

models.set(line.id, line);
conversion.convert(line.id);
assert.equal(replacements.length, 1);
assert.equal(replacements[0].id, line.id);
assert.equal(replacements[0].model.type, "arc");
assert.equal(replacements[0].options.label, "Çizgi → Yay");

const index = read("index.html");
const styleManager = read("src/core/styleManager.js");
const objectManager = read("src/core/editorObjectManager.js");
assert.match(index, /id="btnShapeConvert"/);
assert.match(index, /src="src\/core\/shapeConversionManager\.js/);
assert.match(styleManager, /ShapeConversionManager\?\.syncButton\?\.\(entry\.multi \? null : model\)/);
assert.match(objectManager, /function replaceObjectType[\s\S]+?parent\.insertBefore\(nextElement, currentElement\)/);
assert.match(objectManager, /replaceObjectType,/);

console.log("shape conversion smoke: ok");
