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
    addEventListener() {},
    closest() { return element(); }
  };
}

function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function scenario({ profile, orientation, scale, layout, toolbar, divided = false }) {
  const canvasRect = rect(32, 47, layout.width, layout.height);
  const viewBox = { x: -713.25, y: 249.5, width: layout.projectedWidth / scale, height: layout.projectedHeight / scale };
  const viewport = {
    rect: canvasRect,
    scale,
    left: canvasRect.left + (canvasRect.width - layout.projectedWidth) / 2,
    top: canvasRect.top + (canvasRect.height - layout.projectedHeight) / 2,
    width: layout.projectedWidth,
    height: layout.projectedHeight
  };
  const metrics = { unit: 1 / scale, visibleRadius: 24 / scale, touchRadius: 36 / scale, endpointOffset: 48 / scale, handleGap: 48 / scale, minGap: 2 / scale };
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
      model.id = "inserted-road";
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
  assert.deepEqual(actions, profile === "islandRing"
    ? ["reset", "create", "close", "edit", "history"]
    : ["reset", "create", "close", "edit", "fit", "history"]);
  const model = objects.get("inserted-road");
  assert.deepEqual(history[0].model, plain(model), "Undo/redo must store the final fitted geometry");
  assert.deepEqual(plain(model.metadata.road), initialRoadConfig, "Fitting must preserve lane widths, shoulders and barriers");
  assert.equal(model.metadata.road.laneWidth, 50);
  assert.ok(model.metadata.road.laneWidths.every((width) => width === 50));

  if (profile === "islandRing") {
    assert.deepEqual(plain(model.geometry), {
      profile,
      center: { x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 },
      innerDiameter: 160,
      outerDiameter: 460
    }, "Island rings retain their existing creation geometry");
    return;
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
  const description = `${profile}/${orientation} scale=${scale} ${layout.name} toolbar=${toolbar}`;
  for (const point of points) {
    assert.ok(point.x >= safe.left - 0.001 && point.x <= safe.right + 0.001
      && point.y >= safe.top - 0.001 && point.y <= safe.bottom + 0.001,
    `${description}: ${point.id} touch target clipped at ${point.x},${point.y}`);
  }
  const bounds = {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y))
  };
  const horizontalSlack = safe.right - safe.left - (bounds.right - bounds.left);
  const verticalSlack = safe.bottom - safe.top - (bounds.bottom - bounds.top);
  assert.ok(Math.min(horizontalSlack, verticalSlack) < 0.01, `${description}: road left usable screen length unfilled`);
  assert.ok(Math.abs(bounds.left + bounds.right - safe.left - safe.right) < 0.001, `${description}: horizontal placement off center`);
  assert.ok(Math.abs(bounds.top + bounds.bottom - safe.top - safe.bottom) < 0.001, `${description}: vertical placement off center`);
  if (profile === "straight") {
    const availableAxis = orientation === "horizontal" ? safe.right - safe.left : safe.bottom - safe.top;
    const actualLength = Math.hypot(model.geometry.end.x - model.geometry.start.x, model.geometry.end.y - model.geometry.start.y) * scale;
    assert.ok(Math.abs(actualLength - (availableAxis - 96)) < 0.01, `${description}: straight length must use the full span after endpoint handle offsets`);
  }
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
      for (const orientation of ["horizontal", "vertical"]) {
        for (const toolbar of [false, true]) {
          scenario({ layout, scale, profile, orientation, toolbar, divided: count % 2 === 0 });
          count += 1;
        }
      }
    }
    scenario({ layout, scale, profile: "islandRing", orientation: "horizontal", toolbar: true });
    count += 1;
  }
}
for (const scale of [0.5, 1, 2]) {
  for (const orientation of ["horizontal", "vertical"]) {
    scenario({ layout: layouts[0], scale, profile: "straight", orientation, toolbar: "off-axis" });
    count += 1;
  }
}
console.log(`road-builder-viewport-smoke: ${count} viewport insertion cases passed`);
