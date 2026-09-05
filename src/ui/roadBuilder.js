(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  if (!manager || !selection) return;

  const DEFAULT_LANE_WIDTH = 50;
  const DEFAULT_ISLAND_INNER_DIAMETER = 160;
  const DEFAULT_SHOULDER_WIDTH = 20;
  const DEFAULT_BARRIER_SPACING = 42;
  const DIVIDED_LANE_COUNT = 2;
  const DEFAULT_ARC_RATIO = 0.20;
  const panel = document.querySelector("#roadBuilderPanel");
  let lastDivided = false;
  let addRoadScheduled = false;
  const bindHoldAction = window.krokiObjectEditCore?.bindHoldAction || ((button, action) => {
    button?.addEventListener("click", action);
    return () => {};
  });

  const fields = {
    add: document.querySelector("#btnAddRoad"),
    profileButtons: Array.from(panel?.querySelectorAll("[data-road-profile]") || []),
    orientationButtons: Array.from(panel?.querySelectorAll("[data-road-orientation]") || []),
    kindButtons: Array.from(panel?.querySelectorAll("[data-road-kind]") || []),
    orientationGroup: panel?.querySelector("[data-road-orientation]")?.closest(".road-builder-choice-group"),
    kindGroup: panel?.querySelector("[data-road-kind]")?.closest(".road-builder-choice-group"),
    shoulderRow: panel?.querySelector(".road-builder-shoulder-row"),
    barrierRow: panel?.querySelector(".road-builder-barrier-row"),
    laneCount: panel?.querySelector("#roadLaneCountInput"),
    laneCountMinus: panel?.querySelector("#btnRoadBuilderLaneCountMinus"),
    laneCountPlus: panel?.querySelector("#btnRoadBuilderLaneCountPlus"),
    leftShoulder: panel?.querySelector("#roadLeftShoulderInput"),
    rightShoulder: panel?.querySelector("#roadRightShoulderInput"),
    leftBarrier: panel?.querySelector("#roadLeftBarrierInput"),
    rightBarrier: panel?.querySelector("#roadRightBarrierInput")
  };

  function numberFrom(input, fallback, min, max) {
    const value = Number(input?.value);
    const clean = Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, clean));
  }

  function intFrom(input, fallback, min, max) {
    return Math.round(numberFrom(input, fallback, min, max));
  }

  function selectedValue(buttons, dataKey, fallback) {
    const selected = buttons.find((button) => button.classList.contains("is-active"));
    return selected?.dataset?.[dataKey] || fallback;
  }

  function selectButton(buttons, dataKey, value) {
    buttons.forEach((button) => {
      const active = button.dataset[dataKey] === value;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
    });
  }

  function isIslandRoad() {
    return selectedValue(fields.profileButtons, "roadProfile", "straight") === "islandRing";
  }

  function isDividedRoad() {
    return !isIslandRoad() && selectedValue(fields.kindButtons, "roadKind", "normal") === "divided";
  }

  function laneCountFromInputs() {
    if (isIslandRoad()) return intFrom(fields.laneCount, 1, 1, 3);
    return isDividedRoad() ? DIVIDED_LANE_COUNT : intFrom(fields.laneCount, 2, 1, 5);
  }

  function viewBoxRect() {
    const cameraBox = window.krokiEditorCamera?.readViewBox?.(manager.canvas);
    if (cameraBox) return cameraBox;
    const live = manager.canvas?.viewBox?.baseVal;
    if (live && live.width > 0 && live.height > 0) {
      return { x: live.x, y: live.y, width: live.width, height: live.height };
    }
    const parts = String(manager.canvas?.getAttribute("viewBox") || "0 0 1200 800").split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
    return { x: 0, y: 0, width: 1200, height: 800 };
  }

  function pointAlong(start, dir, distance) {
    return {
      x: start.x + dir.x * distance,
      y: start.y + dir.y * distance
    };
  }

  function initialRoadGeometry(profile, center, dir, length) {
    const normal = { x: -dir.y, y: dir.x };
    const start = pointAlong(center, dir, -length / 2);
    const end = pointAlong(center, dir, length / 2);
    const geometry = { profile, start, end };
    if (profile === "arc") geometry.ratio = DEFAULT_ARC_RATIO;
    if (profile === "sCurve") {
      const bow = Math.min(140, length * 0.2);
      geometry.controls = [
        {
          x: start.x + dir.x * length / 3 + normal.x * bow,
          y: start.y + dir.y * length / 3 + normal.y * bow
        },
        {
          x: start.x + dir.x * length * 2 / 3 - normal.x * bow,
          y: start.y + dir.y * length * 2 / 3 - normal.y * bow
        }
      ];
      geometry.controlCount = geometry.controls.length;
      geometry.c1 = geometry.controls[0];
      geometry.c2 = geometry.controls[1];
    }
    return geometry;
  }

  function geometryFromInputs() {
    const box = viewBoxRect();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const profile = selectedValue(fields.profileButtons, "roadProfile", "straight");
    if (profile === "islandRing") {
      return {
        profile,
        center,
        innerDiameter: DEFAULT_ISLAND_INNER_DIAMETER,
        outerDiameter: DEFAULT_ISLAND_INNER_DIAMETER + laneCountFromInputs() * DEFAULT_LANE_WIDTH * 2
      };
    }
    const horizontal = selectedValue(fields.orientationButtons, "roadOrientation", "horizontal") !== "vertical";
    return initialRoadGeometry(profile, center, horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 }, horizontal ? box.width : box.height);
  }

  function roadPlacementBounds(model, adapter, metrics) {
    const box = viewBoxRect();
    const viewport = window.krokiEditorCamera?.getViewportMetrics?.(manager.canvas, box);
    if (!viewport?.rect || !(viewport.scale > 0)) return box;
    const rect = viewport.rect;
    const inset = (metrics.touchRadius + 2 * metrics.unit) * viewport.scale;
    const left = rect.left + inset;
    const right = rect.left + rect.width - inset;
    const horizontal = model.geometry.start.y === model.geometry.end.y;
    let corridorLeft = rect.left;
    let corridorRight = rect.right;
    if (!horizontal) {
      const geometry = initialRoadGeometry(model.geometry.profile, { x: 0, y: 0 }, { x: 0, y: 1 }, rect.height / viewport.scale);
      const xs = adapter.getControlPoints({ ...model, geometry }, metrics, "edit").map((point) => point.x);
      const halfWidth = (Math.max(...xs) - Math.min(...xs)) * viewport.scale / 2 + inset;
      corridorLeft = rect.left + rect.width / 2 - halfWidth;
      corridorRight = rect.left + rect.width / 2 + halfWidth;
    }
    let top = rect.top;
    let bottom = rect.top + rect.height;
    // Measure after selection opens the IP, so its responsive height is current.
    document.querySelectorAll(".editor-top-ip, .editor-floating-toolbar, .editor-grid-controls").forEach((element) => {
      const toolbar = element.getBoundingClientRect();
      if (!toolbar.width || !toolbar.height || toolbar.right <= corridorLeft || toolbar.left >= corridorRight) return;
      if (element.classList.contains("editor-grid-controls")) bottom = Math.min(bottom, toolbar.top);
      else top = Math.max(top, toolbar.bottom);
    });
    top += inset;
    bottom -= inset;
    return {
      x: box.x + (left - viewport.left) / viewport.scale,
      y: box.y + (top - viewport.top) / viewport.scale,
      width: Math.max(1, (right - left) / viewport.scale),
      height: Math.max(1, (bottom - top) / viewport.scale)
    };
  }

  function fitNewRoadGeometry(model) {
    if (model.geometry.profile === "islandRing") return;
    const adapter = manager.getAdapter(model);
    const metrics = Kroki.ControlPointManager.metrics();
    const horizontal = model.geometry.start.y === model.geometry.end.y;
    const step = Kroki.EditorGrid?.placementSnapStep?.() || 0;
    const placements = [false, true].map((isHorizontal) => {
      const dir = isHorizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
      const geometry = initialRoadGeometry(model.geometry.profile, { x: 0, y: 0 }, dir, 1);
      return { dir, box: roadPlacementBounds({ ...model, geometry }, adapter, metrics) };
    });
    const coordinateWithin = (min, max) => {
      if (min > max) return null;
      if (!step) return (min + max) / 2;
      const first = Math.ceil(min / step - 1e-8);
      const last = Math.floor(max / step + 1e-8);
      if (first > last) return null;
      return Math.round(Math.min(last, Math.max(first, Math.round((min + max) / (2 * step)))) * step * 1e8) / 1e8;
    };
    const candidateAt = (length, placement) => {
      const { dir, box } = placement;
      // Start at the grid origin so translating to a grid point aligns both ends.
      const geometry = initialRoadGeometry(model.geometry.profile, pointAlong({ x: 0, y: 0 }, dir, length / 2), dir, length);
      const points = adapter.getControlPoints({ ...model, geometry }, metrics, "edit");
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const bounds = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      const dx = coordinateWithin(box.x - bounds.x, box.x + box.width - bounds.x - bounds.width);
      const dy = coordinateWithin(box.y - bounds.y, box.y + box.height - bounds.y - bounds.height);
      return dx === null || dy === null ? null : { geometry, dx, dy };
    };
    let low = 0;
    let high = Math.min(placements[0].box.height, placements[1].box.width);
    // One common length fits both directions, including their actual handles.
    for (let index = 0; index < 24; index += 1) {
      const length = (low + high) / 2;
      const alignedLength = step ? Math.floor(length / step) * step : length;
      if (placements.every((placement) => candidateAt(alignedLength, placement))) low = length;
      else high = length;
    }
    const length = step ? Math.floor(low / step) * step : low;
    const fitted = candidateAt(length, placements[horizontal ? 1 : 0]);
    if (!fitted || length <= 0) return;
    manager.updateGeometry(model.id, (draft) => {
      draft.geometry = fitted.geometry;
      adapter.move(draft, fitted.dx, fitted.dy);
    }, { skipHistory: true, styleControls: false });
  }

  function roadBarrier(edgeKey, side) {
    return {
      id: `builder_barrier_${edgeKey}`,
      edgeKey,
      side,
      from: 0,
      to: 1,
      attached: true,
      spacing: DEFAULT_BARRIER_SPACING,
      endCaps: { start: false, end: false },
      free: null
    };
  }

  function roadBarriersFromInputs() {
    const barriers = [];
    if (fields.rightBarrier?.checked) barriers.push(roadBarrier("rightOuter", "right"));
    if (fields.leftBarrier?.checked) barriers.push(roadBarrier("leftOuter", "left"));
    return barriers;
  }

  function roadConfigFromInputs() {
    if (isIslandRoad()) {
      const laneCount = laneCountFromInputs();
      const laneWidth = DEFAULT_LANE_WIDTH;
      return {
        version: 1,
        laneCount,
        laneWidth,
        laneWidths: Array.from({ length: laneCount }, () => laneWidth),
        divided: false,
        dividedLaneWidths: { left: [], right: [] },
        leftShoulder: { enabled: false, width: 0 },
        rightShoulder: { enabled: false, width: 0 },
        innerShoulder: { enabled: false, width: 0 },
        waterChannel: { enabled: false, width: 0 },
        barrier: { enabled: false, width: 0 },
        marking: { style: "dash", width: 2 },
        edgeLine: { enabled: true, width: 2 },
        autoIntersection: true,
        bridge: false,
        barriers: [],
        segments: [{ from: 0, to: 1, markingStyle: "dash" }]
      };
    }
    const divided = isDividedRoad();
    const laneCount = laneCountFromInputs();
    const laneWidth = DEFAULT_LANE_WIDTH;
    const laneWidths = Array.from({ length: laneCount }, () => laneWidth);
    return {
      version: 1,
      laneCount,
      laneWidth,
      laneWidths,
      divided,
      dividedLaneWidths: {
        left: Array.from({ length: laneCount }, () => laneWidth),
        right: Array.from({ length: laneCount }, () => laneWidth)
      },
      leftShoulder: {
        enabled: divided || Boolean(fields.leftShoulder?.checked),
        width: DEFAULT_SHOULDER_WIDTH
      },
      rightShoulder: {
        enabled: divided || Boolean(fields.rightShoulder?.checked),
        width: DEFAULT_SHOULDER_WIDTH
      },
      innerShoulder: {
        enabled: divided,
        width: DEFAULT_SHOULDER_WIDTH
      },
      waterChannel: {
        enabled: divided,
        width: laneWidth
      },
      barrier: { enabled: false, width: 6 },
      marking: {
        style: "dash",
        width: 2
      },
      edgeLine: { enabled: true, width: 2 },
      autoIntersection: true,
      bridge: false,
      barriers: roadBarriersFromInputs(),
      segments: [{ from: 0, to: 1, markingStyle: "dash" }]
    };
  }

  function syncDividedControls() {
    const island = isIslandRoad();
    const divided = isDividedRoad();
    const becameDivided = divided && !lastDivided;
    fields.orientationGroup?.classList.toggle("gizli", island);
    fields.kindGroup?.classList.toggle("gizli", island);
    fields.shoulderRow?.classList.toggle("gizli", island);
    fields.barrierRow?.classList.toggle("gizli", island);
    [fields.leftShoulder, fields.rightShoulder].forEach((input) => {
      if (!input) return;
      input.disabled = island || divided;
      if (island) input.checked = false;
      else if (divided) input.checked = true;
    });
    [fields.leftBarrier, fields.rightBarrier].forEach((input) => {
      if (!input) return;
      input.disabled = island;
      if (island) input.checked = false;
      else if (becameDivided) input.checked = true;
    });
    if (fields.laneCount) {
      if (island) {
        fields.laneCount.max = "3";
        fields.laneCount.value = String(laneCountFromInputs());
      } else {
        fields.laneCount.max = "5";
        if (divided) fields.laneCount.value = String(DIVIDED_LANE_COUNT);
      }
      fields.laneCount.disabled = divided;
    }
    if (fields.laneCountMinus) fields.laneCountMinus.disabled = divided;
    if (fields.laneCountPlus) fields.laneCountPlus.disabled = divided;
    lastDivided = divided;
  }

  function stepLaneCount(delta) {
    if (!fields.laneCount || isDividedRoad()) return;
    const max = isIslandRoad() ? 3 : 5;
    fields.laneCount.value = String(Math.min(max, Math.max(1, intFrom(fields.laneCount, isIslandRoad() ? 1 : 2, 1, max) + delta)));
  }

  function roadInsertBeforeNode() {
    const layer = manager.objectLayer;
    if (!layer) return null;
    return Array.from(layer.children).find((node) => !(node.dataset?.krokiObject === "true" && node.dataset.shape === "road")) || null;
  }

  function runAddRoad(geometry, roadConfig) {
    try {
      window.krokiEditorRail?.resetCizimAraci?.();
      const model = manager.create("road", {
        geometry,
        metadata: { road: roadConfig }
      }, { skipHistory: true, beforeNode: roadInsertBeforeNode() });
      if (!model) return;
      window.krokiEditorRail?.closeRailMenus?.();
      selection.edit(model.id);
      fitNewRoadGeometry(model);
      Kroki.HistoryManager?.pushObjectAdd?.(model, "Yol ekle");
    } finally {
      addRoadScheduled = false;
      if (fields.add) fields.add.disabled = false;
    }
  }

  function scheduleAfterPaint(callback) {
    const raf = window.requestAnimationFrame || ((run) => window.setTimeout(run, 16));
    raf(() => window.setTimeout(callback, 0));
  }

  function addRoad(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (addRoadScheduled) return;
    const geometry = geometryFromInputs();
    const roadConfig = roadConfigFromInputs();
    addRoadScheduled = true;
    if (fields.add) fields.add.disabled = true;
    scheduleAfterPaint(() => runAddRoad(geometry, roadConfig));
  }

  fields.add?.addEventListener("click", addRoad);
  fields.profileButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectButton(fields.profileButtons, "roadProfile", button.dataset.roadProfile);
      syncDividedControls();
    });
  });
  fields.orientationButtons.forEach((button) => {
    button.addEventListener("click", () => selectButton(fields.orientationButtons, "roadOrientation", button.dataset.roadOrientation));
  });
  fields.kindButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectButton(fields.kindButtons, "roadKind", button.dataset.roadKind);
      syncDividedControls();
    });
  });
  bindHoldAction(fields.laneCountMinus, () => stepLaneCount(-1));
  bindHoldAction(fields.laneCountPlus, () => stepLaneCount(1));
  fields.laneCount?.addEventListener("change", () => {
    if (fields.laneCount) fields.laneCount.value = String(laneCountFromInputs());
  });
  syncDividedControls();

  Kroki.RoadBuilder = {
    addRoad,
    geometryFromInputs,
    roadConfigFromInputs
  };
})();
