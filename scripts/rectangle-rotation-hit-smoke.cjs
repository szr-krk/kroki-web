const assert = require("node:assert/strict");
let objects = [];
let rectangleAdapter;
global.window = { Kroki: {
  EditorUtils: {
    normalizeRotation: value => Number(value) || 0,
    svgUnitsPerScreenPx: () => 1
  },
  ShapeRegistry: { register: (_type, adapter) => { rectangleAdapter = adapter; } },
  StyleManager: { normalizeStyle: style => ({ fillPattern: "none", ...style }) },
  EditorObjectManager: {
    canvas: {},
    getObjectsInDomOrder: () => objects,
    getAdapter: () => rectangleAdapter,
    getElement: () => ({}),
    getSceneVersion: () => 1
  }
} };
require("../src/geometry/rectangleGeometry.js");
require("../src/adapters/rectangleAdapter.js");
require("../src/core/hitTestManager.js");
const { RectangleGeometry: geometry, HitTestManager: hits } = window.Kroki;
for (const rotation of [0, 45, 90, -28, 135]) {
  const target = {
    id: "target", type: "rectangle",
    geometry: { cx: 575, cy: 475, rx: 275, ry: 175, rotation },
    style: { fill: "#ff0000", strokeWidth: 2 }
  };
  for (const count of [1, 81]) {
    objects = Array.from({ length: count - 1 }, (_, i) => ({
      ...target, id: `other-${i}`,
      geometry: { ...target.geometry, cx: 10000 + i * 1000 }
    })).concat(target);
    hits.invalidate();
    for (const [x, y] of [[260, 160], [-260, -160], [260, -160], [-260, 160], [0, 0]]) {
      const point = geometry.localPoint(target.geometry, x, y);
      assert.equal(hits.hitTest(point)?.model.id, "target", `rotation=${rotation}, count=${count}, point=${x},${y}`);
    }
    assert.equal(hits.hitTest(geometry.localPoint(target.geometry, 400, 300)), null);
  }
}
// Exact patterned rectangle from kroki_20261002_023328.svg.
const imported = {
  id: "obj_muq5v44m_b", type: "rectangle",
  geometry: {
    cx: 616.3481569601867, cy: 120.50183768995218,
    rx: 1260.7873351039543 / 2, ry: 45.94820745775212 / 2,
    rotation: -26.942578823329725
  },
  style: { fill: "#d6d4ce", fillPattern: "paverTexture", strokeWidth: 2, strokeOpacity: 0, fillOpacity: 1 }
};
objects = [imported];
hits.invalidate();
for (const localX of [-600, -400, 0, 400, 600]) {
  const point = geometry.localPoint(imported.geometry, localX, 0);
  assert.equal(hits.hitTest(point)?.model.id, imported.id, `Imported paver rectangle at ${localX}`);
  if (Math.abs(localX) >= 400) {
    assert.ok(Math.abs(point.y - imported.geometry.cy) > imported.geometry.ry + 24,
      "This interior point was rejected by the old unrotated bounds even at maximum tolerance");
  }
}
console.log("Rotated rectangle selection passes, including the imported paver rectangle.");
