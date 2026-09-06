const assert = require("node:assert/strict");

let objects = [];
let unitsPerPx = 1;
let sceneVersion = 1;
const boundsCalls = new Map();

function distanceToBounds(point, bounds) {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.width));
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.height));
  return Math.hypot(dx, dy);
}

const adapter = {
  getBounds(model) {
    boundsCalls.set(model.id, (boundsCalls.get(model.id) || 0) + 1);
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
  boundsCalls.clear();
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
assert.equal(
  boundsCalls.get("background-road") || 0,
  0,
  "A normal-object hit at fuzzy tolerance should not calculate unused road bounds"
);

setScene([
  model("direct-normal-target", -1),
  model("later-road", -100, -100, 200, 200, "road")
]);
assert.equal(hitTest.hitTest(point)?.model.id, "direct-normal-target");
assert.equal(
  boundsCalls.get("later-road") || 0,
  0,
  "Road bounds should remain lazy even when the road is visited first in DOM order"
);

setScene([
  model("only-road", -100, -100, 200, 200, "road")
]);
assert.equal(hitTest.hitTest(point)?.model.id, "only-road", "A road should remain selectable without a normal hit");
assert.equal(boundsCalls.get("only-road"), 1, "The road pass should still calculate road bounds when needed");

setScene([
  model("direct-road", -1, -1, 2, 2, "road"),
  model("near-top-road", 12, -1, 2, 2, "road"),
  model("missed-normal-object", 100)
]);
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "direct-road",
  "After normal objects miss, exact road hits should still beat higher roads at fuzzy tolerance"
);
assert.equal(boundsCalls.get("direct-road"), 1);
assert.equal(boundsCalls.get("near-top-road"), 1);

setScene([
  model("lower-road", -1, -1, 2, 2, "road"),
  model("upper-road", -1, -1, 2, 2, "road")
]);
assert.equal(hitTest.hitTest(point)?.model.id, "upper-road", "Road ties should preserve reverse DOM order");

setScene([model("touch-only-road", 23, -1, 2, 2, "road")]);
assert.equal(hitTest.hitTest(point)?.model.id, "touch-only-road", "The road pass should retain the 24px tolerance step");
assert.equal(boundsCalls.get("touch-only-road"), 1, "Road bounds should be reused across tolerance steps");

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

setScene([
  model("indexed-road", -100, -100, 200, 200, "road"),
  ...fillers,
  model("indexed-nearby-vehicle", 12, -1, 2, 2, "vehicle")
]);
assert.equal(
  hitTest.hitTest(point)?.model.id,
  "indexed-nearby-vehicle",
  "Indexed scenes should preserve normal-object tolerance priority over exact road hits"
);
assert.equal(boundsCalls.get("indexed-road"), 1, "Spatial indexing should still include road bounds");
boundsCalls.clear();
assert.equal(hitTest.hitTest({ x: -50, y: 0 })?.model.id, "indexed-road", "An indexed road should remain selectable");
assert.equal(boundsCalls.size, 0, "Repeated indexed hits should reuse the existing index");

setScene([]);
assert.equal(hitTest.hitTest(point), null, "An empty scene should not produce a hit");

console.log("hit-test priority smoke: ok");
