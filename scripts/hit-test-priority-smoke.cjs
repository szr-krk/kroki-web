const assert = require("node:assert/strict");

let objects = [];
let unitsPerPx = 1;
let sceneVersion = 1;

function distanceToBounds(point, bounds) {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.width));
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.height));
  return Math.hypot(dx, dy);
}

const adapter = {
  getBounds(model) {
    return model.bounds;
  },
  hitTest(model, point, tolerance) {
    return distanceToBounds(point, model.bounds) <= tolerance;
  }
};

const manager = {
  canvas: {},
  getObjectsInDomOrder() {
    return objects.slice();
  },
  getAdapter() {
    return adapter;
  },
  getElement(modelId) {
    return { dataset: { objectId: modelId } };
  },
  getSceneVersion() {
    return sceneVersion;
  }
};

global.window = {
  Kroki: {
    EditorUtils: {
      svgUnitsPerScreenPx() {
        return unitsPerPx;
      },
      pointFromEvent(_canvas, event) {
        return { x: event.x, y: event.y };
      }
    },
    EditorObjectManager: manager
  },
  krokiEditorState: {
    getActiveTool() {
      return "";
    }
  },
  krokiObjectEditCore: {
    registerCanvasObjectHitTest() {}
  }
};

require("../src/core/hitTestManager.js");

const hitTest = window.Kroki.HitTestManager;
const point = { x: 0, y: 0 };

function model(id, x, y = -1, width = 2, height = 2, type = "rectangle") {
  return { id, type, bounds: { x, y, width, height } };
}

function setScene(nextObjects, nextUnitsPerPx = 1) {
  objects = nextObjects;
  unitsPerPx = nextUnitsPerPx;
  sceneVersion += 1;
  hitTest.invalidate();
}

setScene([
  model("small-target", -1),
  model("top-neighbor", 12)
]);
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "small-target",
  "A direct lower-layer target should beat a top-layer object reached only by broad tolerance"
);

setScene([
  model("direct-target", -1),
  model("very-close-top-neighbor", 3)
]);
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "direct-target",
  "An exact visual hit should win even when a higher object is inside the first fuzzy tolerance step"
);

setScene([
  model("background-road", -100, -100, 200, 200, "road"),
  model("nearby-vehicle", 12, -1, 2, 2, "vehicle")
]);
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "nearby-vehicle",
  "A normal object touch area should keep priority over the intentionally background road layer"
);

setScene([
  model("only-road", -100, -100, 200, 200, "road")
]);
assert.equal(hitTest.hitTest(point)?.model.id, "only-road", "A road should remain selectable without a normal hit");

setScene([
  model("bottom", -1),
  model("top", -1)
]);
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "top",
  "Z-order should remain the tie-breaker for equally close overlapping objects"
);

setScene([
  model("far-bottom", 23),
  model("near-top", 17)
]);
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "near-top",
  "The full 24px fallback should remain available for touch accessibility"
);

setScene([
  model("zoomed-target", 60, -10, 20, 20),
  model("zoomed-top-neighbor", 180, -10, 20, 20)
], 10);
assert.equal(hitTest.tolerance(), 240, "The outer touch area should stay 24 screen pixels at every zoom");
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "zoomed-target",
  "Nearness priority should be measured in screen pixels after zoom conversion"
);

const fillers = Array.from({ length: 81 }, (_, index) => model(`filler-${index}`, 1000 + index * 4));
setScene([
  model("indexed-target", -1),
  ...fillers,
  model("indexed-top-neighbor", 12)
]);
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "indexed-target",
  "The spatial-index path should use the same near-first priority as the linear path"
);
assert.equal(hitTest.diagnostics().indexed, objects.length, "Large scenes should still build the spatial index");

setScene([]);
assert.equal(hitTest.hitTest(point), null, "An empty scene should not produce a hit");

console.log("hit-test priority smoke: ok");
