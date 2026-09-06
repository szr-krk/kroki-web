const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const scripts = [
  "src/core/shapeRegistry.js",
  "src/geometry/lineGeometry.js",
  "src/adapters/roadAdapter.js",
  "src/ui/roadBuilder.js"
].map((file) => new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), { filename: file }));
const plain = (value) => JSON.parse(JSON.stringify(value));

function element(classes = [], dataset = {}) {
  const active = new Set(classes);
  const listeners = new Map();
  return {
    dataset,
    value: "3",
    checked: true,
    disabled: false,
    classList: {
      contains: (name) => active.has(name),
      toggle(name, enabled) {
        if (enabled) active.add(name);
        else active.delete(name);
      }
    },
    setAttribute() {},
    addEventListener(name, callback) { listeners.set(name, callback); },
    click() { listeners.get("click")?.(); },
    closest() { return element(); }
  };
}

function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function scenario({ profile, orientation, scale, layout, toolbar, divided = false, snap = true, sequential = false, origin = { x: -713.25, y: 249.5 } }) {
  const canvasRect = rect(32, 47, layout.width, layout.height);
  const viewBox = { ...origin, width: layout.projectedWidth / scale, height: layout.projectedHeight / scale };
  const viewport = {
    rect: canvasRect,
    scale,
    left: canvasRect.left + (canvasRect.width - layout.projectedWidth) / 2,
    top: canvasRect.top + (canvasRect.height - layout.projectedHeight) / 2,
    width: layout.projectedWidth,
    height: layout.projectedHeight
  };
  const metrics = { unit: 1 / scale, visibleRadius: 24 / scale, touchRadius: 36 / scale, endpointOffset: 48 / scale, handleGap: 48 / scale, minGap: 2 / scale };
  const step = snap ? 20 / scale : 0;
  const queue = [];
  const actions = [];
  const objects = new Map();
  const history = [];
  let selected = false;
  let initialRoadConfig;
  const buttons = (values, key, current) => values.map((value) => element(value === current ? ["is-active"] : [], { [key]: value }));
  const choices = {
    "[data-road-profile]": buttons(["straight", "arc", "sCurve", "islandRing"], "roadProfile", profile),
    "[data-road-orientation]": buttons(["horizontal", "vertical"], "roadOrientation", orientation),
    "[data-road-kind]": buttons(["normal", "divided"], "roadKind", divided ? "divided" : "normal")
  };
  const fields = new Map();
  const field = (selector) => {
    if (!fields.has(selector)) fields.set(selector, element());
    return fields.get(selector);
  };
  const panel = {
    querySelectorAll: (selector) => choices[selector] || [],
    querySelector: (selector) => choices[selector]?.[0] || field(selector)
  };
  const topToolbar = rect(canvasRect.left + 12, canvasRect.top + 12, toolbar === "off-axis" ? 110 : canvasRect.width - 24, 64);
  const bottomToolbar = rect(canvasRect.left + 12, canvasRect.bottom - 78, toolbar === "off-axis" ? 180 : canvasRect.width - 24, 66);
  const overlay = (name, bounds) => ({
    classList: { contains: (value) => value === name },
    // The IP becomes visible only when selection.edit opens it.
    getBoundingClientRect: () => selected ? bounds : rect(0, 0, 0, 0)
  });
  const overlays = toolbar ? [
    overlay("editor-top-ip", topToolbar),
    overlay("editor-floating-toolbar", rect(canvasRect.left + 12, canvasRect.top + 12, 110, 52)),
    overlay("editor-grid-controls", bottomToolbar),
    overlay("editor-top-ip", rect(canvasRect.right + 4, canvasRect.top, 76, 400)),
    overlay("editor-top-ip", rect(0, 0, 0, 0))
  ] : [];
  const document = {
    querySelector: (selector) => selector === "#roadBuilderPanel" ? panel : field(selector),
    querySelectorAll: () => overlays
  };
  const canvas = {
    // Deliberately stale DOM state: placement must use the live camera.
    viewBox: { baseVal: { x: 0, y: 0, width: 1200, height: 800 } },
    getAttribute: () => "0 0 1200 800",
    getBoundingClientRect: () => canvasRect
  };
  const sandbox = {
    document,
    requestAnimationFrame: (callback) => queue.push(callback),
    setTimeout: (callback) => queue.push(callback),
    krokiEditorCamera: {
      readViewBox: () => ({ ...viewBox }),
      getViewportMetrics: () => viewport,
      writeViewBox: () => assert.fail("Road insertion changed the camera"),
      fitBounds: () => assert.fail("Road insertion zoomed the camera")
    },
    krokiEditorRail: {
      resetCizimAraci: () => actions.push("reset"),
      closeRailMenus: () => actions.push("close")
    },
    Kroki: {
      EditorGrid: {
        placementSnapStep: () => step,
        snapPoint: (point) => step ? { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step } : point
      },
      StyleManager: { normalizeStyle: (value) => value || {} },
      ControlPointManager: { metrics: () => metrics },
      SelectionManager: {
        edit(id) {
          assert.ok(objects.has(id));
          selected = true;
          actions.push("edit");
        }
      },
      HistoryManager: {
        pushObjectAdd(model, label) {
          actions.push("history");
          history.push({ model: plain(model), label });
        }
      }
    }
  };
  sandbox.window = sandbox;
  const manager = sandbox.Kroki.EditorObjectManager = {
    canvas,
    objectLayer: { children: [] },
    get: (id) => objects.get(id),
    getAll: () => [...objects.values()],
    getAdapter: () => sandbox.Kroki.ShapeRegistry.get("road"),
    create(type, data, options) {
      assert.equal(type, "road");
      assert.equal(options.skipHistory, true);
      const model = this.getAdapter().create(data);
      model.id = `inserted-road-${objects.size + 1}`;
      objects.set(model.id, model);
      initialRoadConfig = plain(model.metadata.road);
      actions.push("create");
      return model;
    },
    updateGeometry(id, mutate, options) {
      assert.equal(selected, true, "Fit must run after the IP opens");
      assert.equal(options.skipHistory, true);
      const model = objects.get(id);
      mutate(model);
      actions.push("fit");
      return model;
    }
  };
  const context = vm.createContext(sandbox);
  scripts.forEach((script) => script.runInContext(context));
  sandbox.Kroki.RoadBuilder.addRoad();
  sandbox.Kroki.RoadBuilder.addRoad(); // A second tap before the paint must not duplicate insertion.
  while (queue.length) queue.shift()();

  assert.equal(objects.size, 1);
  assert.equal(history.length, 1);
  assert.equal(field("#btnAddRoad").disabled, false);
  assert.deepEqual(actions, ["reset", "create", "close", "edit", "fit", "history"]);
  const model = objects.get("inserted-road-1");
  assert.deepEqual(history[0].model, plain(model), "Undo/redo must store the final fitted geometry");
  assert.deepEqual(plain(model.metadata.road), initialRoadConfig, "Fitting must preserve lane widths, shoulders and barriers");
  assert.equal(model.metadata.road.laneWidth, 50);
  assert.ok(model.metadata.road.laneWidths.every((width) => width === 50));

  const description = `${profile}/${orientation} scale=${scale} ${layout.name} toolbar=${toolbar} snap=${snap}`;
  // Every profile shares the visible workspace center, including off-axis IPs.
  const sharedSafe = {
    left: canvasRect.left + 38,
    right: canvasRect.right - 38,
    top: (toolbar ? topToolbar.bottom : canvasRect.top) + 38,
    bottom: (toolbar ? bottomToolbar.top : canvasRect.bottom) - 38
  };
  const expectedCenter = sandbox.Kroki.EditorGrid.snapPoint({
    x: viewBox.x + ((sharedSafe.left + sharedSafe.right) / 2 - viewport.left) / scale,
    y: viewBox.y + ((sharedSafe.top + sharedSafe.bottom) / 2 - viewport.top) / scale
  });
  const centerOf = (road) => road.geometry.profile === "islandRing" ? road.geometry.center : {
    x: (road.geometry.start.x + road.geometry.end.x) / 2,
    y: (road.geometry.start.y + road.geometry.end.y) / 2
  };
  const center = centerOf(model);
  const assertSharedCenter = (road) => {
    const actual = centerOf(road);
    assert.ok(Math.abs(actual.x - expectedCenter.x) < 1e-6 && Math.abs(actual.y - expectedCenter.y) < 1e-6,
      `${description}: ${road.geometry.profile} must use the shared workspace center`);
    if (step) {
      assert.ok(Math.abs(actual.x / step - Math.round(actual.x / step)) < 1e-7, `${description}: midpoint x is off grid`);
      assert.ok(Math.abs(actual.y / step - Math.round(actual.y / step)) < 1e-7, `${description}: midpoint y is off grid`);
    }
  };
  assertSharedCenter(model);

  if (sequential) {
    assert.equal(profile, "straight");
    assert.equal(orientation, "horizontal");
    for (const [nextProfile, nextOrientation] of [["straight", "vertical"], ["islandRing", "horizontal"]]) {
      choices["[data-road-profile]"].find((button) => button.dataset.roadProfile === nextProfile).click();
      choices["[data-road-orientation]"].find((button) => button.dataset.roadOrientation === nextOrientation).click();
      const previousCount = objects.size;
      const previousActions = actions.length;
      sandbox.Kroki.RoadBuilder.addRoad();
      sandbox.Kroki.RoadBuilder.addRoad();
      while (queue.length) queue.shift()();
      assert.equal(objects.size, previousCount + 1, "A completed insertion permits exactly one next insertion");
      const inserted = objects.get(`inserted-road-${objects.size}`);
      assert.equal(inserted.geometry.profile, nextProfile);
      assertSharedCenter(inserted);
      assert.deepEqual(actions.slice(previousActions), ["reset", "create", "close", "edit", "fit", "history"]);
      assert.equal(history.length, objects.size);
      assert.deepEqual(history.at(-1).model, plain(inserted), "Each consecutive insertion stores its fitted geometry");
      assert.deepEqual(plain(history[0].model), plain(model), "Later insertions must not alter the first road");
      assert.deepEqual(plain(inserted.metadata.road), initialRoadConfig);
      assert.equal(field("#btnAddRoad").disabled, false);
      if (nextProfile === "straight") {
        assert.equal(inserted.geometry.start.x, inserted.geometry.end.x);
        assert.ok(Math.abs(Math.abs(inserted.geometry.end.y - inserted.geometry.start.y)
          - Math.abs(model.geometry.end.x - model.geometry.start.x)) < 1e-6, "Consecutive H/V insertions have the same length");
      } else {
        assert.equal(inserted.geometry.innerDiameter, 160);
        assert.equal(inserted.geometry.outerDiameter, 460);
      }
    }
  }

  if (profile === "islandRing") {
    assert.equal(model.geometry.innerDiameter, 160, "Centering preserves island inner diameter");
    assert.equal(model.geometry.outerDiameter, 460, "Centering preserves island outer diameter");
    return { center };
  }

  const toolbarBlocksAxis = toolbar && !(toolbar === "off-axis" && orientation === "vertical");
  const safe = {
    left: canvasRect.left + 38,
    right: canvasRect.right - 38,
    top: (toolbarBlocksAxis ? topToolbar.bottom : canvasRect.top) + 38,
    bottom: (toolbarBlocksAxis ? bottomToolbar.top : canvasRect.bottom) - 38
  };
  const points = manager.getAdapter().getControlPoints(model, metrics, "edit").map((point) => ({
    id: point.id,
    x: viewport.left + (point.x - viewBox.x) * scale,
    y: viewport.top + (point.y - viewBox.y) * scale
  }));
  assert.equal(points.length, profile === "straight" ? 2 : profile === "arc" ? 3 : 4);
  for (const point of points) {
    assert.ok(point.x >= safe.left - 0.001 && point.x <= safe.right + 0.001
      && point.y >= safe.top - 0.001 && point.y <= safe.bottom + 0.001,
    `${description}: ${point.id} touch target clipped at ${point.x},${point.y}`);
  }
  const actualLength = Math.hypot(model.geometry.end.x - model.geometry.start.x, model.geometry.end.y - model.geometry.start.y) * scale;
  if (step) {
    for (const endpoint of [model.geometry.start, model.geometry.end]) {
      assert.ok(Math.abs(endpoint.x / step - Math.round(endpoint.x / step)) < 1e-7, `${description}: endpoint x is off grid`);
      assert.ok(Math.abs(endpoint.y / step - Math.round(endpoint.y / step)) < 1e-7, `${description}: endpoint y is off grid`);
    }
  }
  if (profile === "straight") {
    const screenCenter = {
      x: viewport.left + (center.x - viewBox.x) * scale,
      y: viewport.top + (center.y - viewBox.y) * scale
    };
    const verticalSafe = toolbar === "off-axis"
      ? { top: canvasRect.top + 38, bottom: canvasRect.bottom - 38 }
      : sharedSafe;
    // Symmetric endpoints leave 48px for each endpoint handle. With a fixed
    // center, the nearest edge across both orientations determines the limit.
    const commonLimit = 2 * Math.min(screenCenter.x - sharedSafe.left, sharedSafe.right - screenCenter.x,
      screenCenter.y - verticalSafe.top, verticalSafe.bottom - screenCenter.y) - 96;
    assert.ok(actualLength <= commonLimit + 0.001 && commonLimit - actualLength < 2 * step * scale + 0.001,
      `${description}: length must be maximal about the shared center within one two-step grid quantum`);
    const draft = plain(model);
    const adapter = manager.getAdapter();
    const startPoint = { ...draft.geometry.start };
    const startState = adapter.beginControlPointMove(draft, "start", startPoint);
    adapter.moveControlPoint(draft, "start", {
      x: startPoint.x + (orientation === "horizontal" ? 40 / scale : 0),
      y: startPoint.y + (orientation === "vertical" ? 40 / scale : 0)
    }, { startState, metrics });
    if (orientation === "horizontal") assert.equal(draft.geometry.start.y, draft.geometry.end.y, "Moving only one CP must keep a level road level");
    else assert.equal(draft.geometry.start.x, draft.geometry.end.x, "Moving only one CP must keep a vertical road vertical");
  }
  return { length: actualLength, center };
}

const layouts = [
  { name: "landscape", width: 1200, height: 760, projectedWidth: 1200, projectedHeight: 760 },
  { name: "portrait", width: 430, height: 820, projectedWidth: 430, projectedHeight: 820 },
  { name: "letterbox-sides", width: 1200, height: 760, projectedWidth: 900, projectedHeight: 760 },
  { name: "letterbox-top-bottom", width: 540, height: 860, projectedWidth: 540, projectedHeight: 540 }
];
let count = 0;
for (const layout of layouts) {
  for (const scale of [0.5, 1, 2]) {
    for (const profile of ["straight", "arc", "sCurve"]) {
      for (const toolbar of [false, true]) {
        for (const snap of [false, true]) {
          const horizontal = scenario({ layout, scale, profile, orientation: "horizontal", toolbar, snap });
          const vertical = scenario({ layout, scale, profile, orientation: "vertical", toolbar, snap, divided: true });
          assert.ok(Math.abs(horizontal.length - vertical.length) < 0.001, `${profile}: horizontal and vertical insertion lengths must match`);
          assert.deepEqual(horizontal.center, vertical.center, `${profile}: horizontal and vertical midpoints must match`);
          count += 2;
        }
      }
    }
    for (const toolbar of [false, true, "off-axis"]) {
      for (const snap of [false, true]) {
        const horizontal = scenario({ layout, scale, profile: "straight", orientation: "horizontal", toolbar, snap,
          sequential: true, origin: { x: 1327.125, y: -987.75 } });
        const island = scenario({ layout, scale, profile: "islandRing", orientation: "horizontal", toolbar, snap,
          origin: { x: 1327.125, y: -987.75 } });
        assert.deepEqual(horizontal.center, plain(island.center), "Straight midpoint and island center must match");
        count += 4;
      }
    }
  }
}
for (const scale of [0.5, 1, 2]) {
  for (const orientation of ["horizontal", "vertical"]) {
    scenario({ layout: layouts[0], scale, profile: "straight", orientation, toolbar: "off-axis" });
    count += 1;
  }
}
console.log(`road-builder-viewport-smoke: ${count} viewport insertion cases passed`);
