(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  if (!manager || !selection) return;

  const DEFAULT_LANE_WIDTH = 50;
  const DEFAULT_SHOULDER_WIDTH = 20;
  const DIVIDED_LANE_COUNT = 2;
  const DEFAULT_ARC_RATIO = Math.tan((36 * Math.PI / 180) / 2);
  const panel = document.querySelector("#roadBuilderPanel");

  const fields = {
    add: document.querySelector("#btnAddRoad"),
    profileButtons: Array.from(panel?.querySelectorAll("[data-road-profile]") || []),
    orientationButtons: Array.from(panel?.querySelectorAll("[data-road-orientation]") || []),
    kindButtons: Array.from(panel?.querySelectorAll("[data-road-kind]") || []),
    laneCount: panel?.querySelector("#roadLaneCountInput"),
    laneCountMinus: panel?.querySelector("#btnRoadBuilderLaneCountMinus"),
    laneCountPlus: panel?.querySelector("#btnRoadBuilderLaneCountPlus"),
    leftShoulder: panel?.querySelector("#roadLeftShoulderInput"),
    rightShoulder: panel?.querySelector("#roadRightShoulderInput")
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

  function isDividedRoad() {
    return selectedValue(fields.kindButtons, "roadKind", "normal") === "divided";
  }

  function laneCountFromInputs() {
    return isDividedRoad() ? DIVIDED_LANE_COUNT : intFrom(fields.laneCount, 2, 1, 5);
  }

  function viewBoxRect() {
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

  function geometryFromInputs() {
    const box = viewBoxRect();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const horizontal = selectedValue(fields.orientationButtons, "roadOrientation", "horizontal") !== "vertical";
    const axisLength = horizontal ? box.width : box.height;
    const length = Math.max(260, Math.min(520, axisLength * 0.55));
    const dir = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const normal = { x: -dir.y, y: dir.x };
    const start = pointAlong(center, dir, -length / 2);
    const end = pointAlong(center, dir, length / 2);
    const profile = selectedValue(fields.profileButtons, "roadProfile", "straight");
    const geometry = { profile, start, end };
    if (profile === "arc") geometry.ratio = DEFAULT_ARC_RATIO;
    if (profile === "sCurve") {
      const bow = Math.min(140, length * 0.2);
      geometry.c1 = {
        x: start.x + dir.x * length / 3 + normal.x * bow,
        y: start.y + dir.y * length / 3 + normal.y * bow
      };
      geometry.c2 = {
        x: start.x + dir.x * length * 2 / 3 - normal.x * bow,
        y: start.y + dir.y * length * 2 / 3 - normal.y * bow
      };
    }
    return geometry;
  }

  function roadConfigFromInputs() {
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
      segments: [{ from: 0, to: 1, markingStyle: "dash" }]
    };
  }

  function syncDividedControls() {
    const divided = isDividedRoad();
    [fields.leftShoulder, fields.rightShoulder].forEach((input) => {
      if (!input) return;
      input.disabled = divided;
      if (divided) input.checked = true;
    });
    if (fields.laneCount) {
      if (divided) fields.laneCount.value = String(DIVIDED_LANE_COUNT);
      fields.laneCount.disabled = divided;
    }
    if (fields.laneCountMinus) fields.laneCountMinus.disabled = divided;
    if (fields.laneCountPlus) fields.laneCountPlus.disabled = divided;
  }

  function stepLaneCount(delta) {
    if (!fields.laneCount || isDividedRoad()) return;
    fields.laneCount.value = String(Math.min(5, Math.max(1, intFrom(fields.laneCount, 2, 1, 5) + delta)));
  }

  function roadInsertBeforeNode() {
    const layer = manager.objectLayer;
    if (!layer) return null;
    return Array.from(layer.children).find((node) => !(node.dataset?.krokiObject === "true" && node.dataset.shape === "road")) || null;
  }

  function addRoad(event) {
    event?.preventDefault();
    event?.stopPropagation();
    window.krokiEditorRail?.resetCizimAraci?.();
    const transaction = Kroki.HistoryManager?.begin?.("Yol ekle") || null;
    const model = manager.create("road", {
      geometry: geometryFromInputs(),
      metadata: { road: roadConfigFromInputs() }
    }, { skipHistory: true, beforeNode: roadInsertBeforeNode() });
    if (!model) return;
    window.krokiEditorRail?.closeRailMenus?.();
    selection.edit(model.id);
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Yol ekle");
  }

  fields.add?.addEventListener("click", addRoad);
  fields.profileButtons.forEach((button) => {
    button.addEventListener("click", () => selectButton(fields.profileButtons, "roadProfile", button.dataset.roadProfile));
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
  fields.laneCountMinus?.addEventListener("click", () => stepLaneCount(-1));
  fields.laneCountPlus?.addEventListener("click", () => stepLaneCount(1));
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
