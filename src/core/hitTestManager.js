(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  if (!utils || !manager) return;

  const HIT_TOLERANCE_PX = 24;
  const HIT_TOLERANCE_STEPS_PX = [0, 4, 8, 12, 18, HIT_TOLERANCE_PX];
  const LINEAR_HIT_TEST_LIMIT = 80;
  const GRID_CELL_SIZE = 320;
  const MAX_CELLS_PER_OBJECT = 80;
  let indexVersion = -1;
  let indexEntries = [];
  let grid = new Map();
  let largeEntries = [];
  let unboundedEntries = [];
  let warmupHandle = 0;
  let warmupUsesIdleCallback = false;

  function tolerance() {
    return HIT_TOLERANCE_PX * utils.svgUnitsPerScreenPx(manager.canvas);
  }

  function finiteBounds(bounds) {
    return Boolean(
      bounds &&
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.y) &&
      Number.isFinite(bounds.width) &&
      Number.isFinite(bounds.height)
    );
  }

  function pointInsideBounds(point, bounds, pad = 0) {
    if (!finiteBounds(bounds)) return true;
    return (
      point.x >= bounds.x - pad &&
      point.x <= bounds.x + bounds.width + pad &&
      point.y >= bounds.y - pad &&
      point.y <= bounds.y + bounds.height + pad
    );
  }

  function entryFor(model, order = 0) {
    const adapter = manager.getAdapter(model);
    const element = manager.getElement(model.id);
    let bounds = null;
    try {
      bounds = typeof adapter?.getBounds === "function" ? adapter.getBounds(model, element) : null;
    } catch (_) {
      bounds = null;
    }
    return { model, element, adapter, bounds, order };
  }

  function hitEntry(entry, point, tol) {
    if (entry.bounds && !pointInsideBounds(point, entry.bounds, tol)) return false;
    return Boolean(entry.adapter?.hitTest?.(entry.model, point, tol, entry.element));
  }

  function prioritizedHitTest(point, entryCount, entryAt, unitsPerPx) {
    for (let roadPass = 0; roadPass <= 1; roadPass += 1) {
      for (let stepIndex = 0; stepIndex < HIT_TOLERANCE_STEPS_PX.length; stepIndex += 1) {
        const tol = HIT_TOLERANCE_STEPS_PX[stepIndex] * unitsPerPx;
        for (let index = 0; index < entryCount; index += 1) {
          const entry = entryAt(index);
          if (!entry || Number(entry.model.type === "road") !== roadPass) continue;
          if (!hitEntry(entry, point, tol)) continue;
          return { model: entry.model, element: entry.element, adapter: entry.adapter };
        }
      }
    }
    return null;
  }

  function linearHitTest(point, objects, unitsPerPx) {
    const entries = new Array(objects.length);
    return prioritizedHitTest(point, objects.length, (priorityIndex) => {
      const objectIndex = objects.length - priorityIndex - 1;
      if (!entries[objectIndex]) entries[objectIndex] = entryFor(objects[objectIndex], objectIndex);
      return entries[objectIndex];
    }, unitsPerPx);
  }

  function cellRange(bounds) {
    return {
      minX: Math.floor(bounds.x / GRID_CELL_SIZE),
      maxX: Math.floor((bounds.x + bounds.width) / GRID_CELL_SIZE),
      minY: Math.floor(bounds.y / GRID_CELL_SIZE),
      maxY: Math.floor((bounds.y + bounds.height) / GRID_CELL_SIZE)
    };
  }

  function cellKey(x, y) {
    return `${x}:${y}`;
  }

  function addToGrid(entry, bounds) {
    const range = cellRange(bounds);
    const width = range.maxX - range.minX + 1;
    const height = range.maxY - range.minY + 1;
    if (width * height > MAX_CELLS_PER_OBJECT) {
      largeEntries.push(entry);
      return;
    }
    for (let y = range.minY; y <= range.maxY; y += 1) {
      for (let x = range.minX; x <= range.maxX; x += 1) {
        const key = cellKey(x, y);
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(entry);
      }
    }
  }

  function buildIndex(objects) {
    grid = new Map();
    largeEntries = [];
    unboundedEntries = [];
    indexEntries = objects.map((model, order) => {
      const entry = entryFor(model, order);
      const { bounds } = entry;
      if (!finiteBounds(bounds)) unboundedEntries.push(entry);
      else addToGrid(entry, bounds);
      return entry;
    });
    indexVersion = manager.getSceneVersion?.() ?? indexVersion + 1;
  }

  function ensureIndex(objects) {
    const version = manager.getSceneVersion?.() ?? -1;
    if (version === indexVersion && indexEntries.length === objects.length) return;
    buildIndex(objects);
  }

  function spatialCandidates(point, tol) {
    const search = {
      x: point.x - tol,
      y: point.y - tol,
      width: tol * 2,
      height: tol * 2
    };
    const range = cellRange(search);
    const seen = new Set();
    const candidates = [];
    const push = (entry) => {
      if (!entry || seen.has(entry.model.id)) return;
      seen.add(entry.model.id);
      candidates.push(entry);
    };

    for (let y = range.minY; y <= range.maxY; y += 1) {
      for (let x = range.minX; x <= range.maxX; x += 1) {
        (grid.get(cellKey(x, y)) || []).forEach(push);
      }
    }
    largeEntries.forEach(push);
    unboundedEntries.forEach(push);
    candidates.sort((a, b) => b.order - a.order);
    return candidates;
  }

  function hitTest(point) {
    const objects = manager.getObjectsInDomOrder();
    const unitsPerPx = utils.svgUnitsPerScreenPx(manager.canvas);
    const tol = HIT_TOLERANCE_PX * unitsPerPx;
    if (objects.length <= LINEAR_HIT_TEST_LIMIT) return linearHitTest(point, objects, unitsPerPx);

    ensureIndex(objects);
    const candidates = spatialCandidates(point, tol);
    return prioritizedHitTest(point, candidates.length, (index) => candidates[index], unitsPerPx);
  }

  function cancelWarmup() {
    if (!warmupHandle) return;
    if (warmupUsesIdleCallback && window.cancelIdleCallback) window.cancelIdleCallback(warmupHandle);
    else window.clearTimeout(warmupHandle);
    warmupHandle = 0;
    warmupUsesIdleCallback = false;
  }

  function runWarmup() {
    warmupHandle = 0;
    warmupUsesIdleCallback = false;
    const objects = manager.getObjectsInDomOrder();
    if (objects.length > LINEAR_HIT_TEST_LIMIT) ensureIndex(objects);
  }

  function scheduleWarmup() {
    if (warmupHandle) return;
    if (typeof window.requestIdleCallback === "function") {
      warmupUsesIdleCallback = true;
      warmupHandle = window.requestIdleCallback(runWarmup, { timeout: 600 });
      return;
    }
    warmupUsesIdleCallback = false;
    warmupHandle = window.setTimeout(runWarmup, 80);
  }

  function hitTestEvent(event) {
    return hitTest(utils.pointFromEvent(manager.canvas, event));
  }

  Kroki.HitTestManager = {
    tolerance,
    hitTest,
    hitTestEvent,
    invalidate() {
      cancelWarmup();
      indexVersion = -1;
      indexEntries = [];
      grid = new Map();
      largeEntries = [];
      unboundedEntries = [];
    },
    scheduleWarmup,
    diagnostics() {
      return {
        version: indexVersion,
        indexed: indexEntries.length,
        cells: grid.size,
        large: largeEntries.length,
        unbounded: unboundedEntries.length
      };
    },
    hasObjectAt(event) {
      if (!event || window.krokiEditorState?.getActiveTool?.()) return false;
      return Boolean(hitTestEvent(event));
    }
  };

  window.krokiObjectEditCore?.registerCanvasObjectHitTest?.((event) => Kroki.HitTestManager.hasObjectAt(event));
})();
