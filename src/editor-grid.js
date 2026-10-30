(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const editor = document.querySelector("#editor");
  const canvas = document.querySelector("#editorCanvas");
  const grid = document.querySelector("#editorGrid");
  const gridLayer = document.querySelector("#editorGridLayer");
  const camera = window.krokiEditorCamera;
  if (!editor || !canvas || !grid || !camera) return;

  const ROTATION_SNAP_STEP = 90;
  const ROTATION_SNAP_TOLERANCE = 10;
  const gridButton = document.querySelector("#btnEditorGrid");
  const snapButton = document.querySelector("#btnEditorSnap");
  const stepValue = document.querySelector("#editorSnapStepValue");
  const VIEW_PREFERENCES_KEY = "kroki.editor.viewPreferences.v1";
  let preferences = {};
  try {
    const stored = JSON.parse(localStorage.getItem(VIEW_PREFERENCES_KEY));
    if (stored && typeof stored === "object") preferences = stored;
  } catch (_) {                                                         }
  let gridVisible = typeof preferences.grid === "boolean" ? preferences.grid : true;
  let snapEnabled = gridVisible && preferences.snap === true;

  function savePreferences() {
    try {
      localStorage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify({ grid: gridVisible, snap: snapEnabled }));
    } catch (_) {                                                       }
  }
  let frame = 0;
  let viewportDirty = true;
  let viewport = null;
  let rectDirty = true;
  let canvasRect = null;
  let viewBox = camera.readViewBox(canvas);
  let snapTargets = null;
  let gesturePositionSnapEnabled = true;
  const gridContext = grid.getContext("2d", { alpha: true });


  function scaleForZoom(zoom) {
    const target = 85 / Math.max(0.000001, zoom);
    const exponent = Math.floor(Math.log10(target));
    const magnitude = Math.pow(10, exponent);
    const fraction = target / magnitude;
    const factor = fraction <= 1.5 ? 1 : fraction <= 3.5 ? 2 : fraction <= 7.5 ? 5 : 10;
    const subdivisions = factor === 2 ? 4 : 5;
    const majorStep = factor * magnitude;
    return { majorStep, minorStep: majorStep / subdivisions, subdivisions, precision: Math.max(0, -exponent) };
  }

  function currentViewport() {

    if (rectDirty || !canvasRect) {
      canvasRect = canvas.getBoundingClientRect();
      rectDirty = false;
    }
    const scale = Math.min(canvasRect.width / viewBox.width, canvasRect.height / viewBox.height);
    return {
      ...scaleForZoom(scale),
      zoom: scale,
      width: canvasRect.width,
      height: canvasRect.height,
      left: canvasRect.left,
      top: canvasRect.top,
      x: -viewBox.x * scale,
      y: -viewBox.y * scale
    };
  }

  function getViewport() {
    if (rectDirty || !viewport) viewport = currentViewport();
    return viewport;
  }

  function pointFromEvent(event) {
    const state = getViewport();
    if (!(state.zoom > 0)) return { x: viewBox.x, y: viewBox.y };
    return {
      x: (event.clientX - state.left - state.x) / state.zoom,
      y: (event.clientY - state.top - state.y) / state.zoom
    };
  }

  function endGesture() { snapTargets = null; gesturePositionSnapEnabled = true; }

  function beginGesture(excludedIds = [], pointerType = "mouse", options = {}) {
    endGesture();

    gesturePositionSnapEnabled = options.positionSnap !== false;
    if (!gesturePositionSnapEnabled || !gridVisible || !snapEnabled) return;
    const manager = Kroki.EditorObjectManager;
    const state = getViewport();
    if (!(state.zoom > 0)) return;
    const radius = (pointerType === "touch" ? 18 : 12) / state.zoom;
    const excluded = new Set(excludedIds);
    const cells = new Map();
    const seen = new Set();
    const add = (point) => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      const identity = point.x + "," + point.y;
      if (seen.has(identity)) return;
      seen.add(identity);
      const key = Math.floor(point.x / radius) + "," + Math.floor(point.y / radius);
      let cell = cells.get(key);
      if (!cell) { cell = []; cells.set(key, cell); }
      cell.push({ x: point.x, y: point.y });
    };

    const models = manager?.getObjectsInDomOrder() || [];
    models.forEach((model) => {
      if (excluded.has(model.id)) return;
      const geometry = model.geometry || {};
      if (model.type === "line" || model.type === "arc" || model.type === "bezier" || model.type === "road") {
        add(geometry.start);
        add(geometry.end);
      } else if (model.type === "closedShape") {
        (geometry.points || []).forEach(add);
      } else if (model.type === "callout") add(geometry.tip);
    });
    snapTargets = { cells, radius };
  }

  function nearbyEndpoint(point) {
    if (!snapTargets) return null;
    const { cells, radius } = snapTargets;
    const cx = Math.floor(point.x / radius);
    const cy = Math.floor(point.y / radius);
    let distance = radius * radius;
    let closest = null;
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        const cell = cells.get(x + "," + y);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const candidate = cell[i];
          const dx = point.x - candidate.x;
          const dy = point.y - candidate.y;
          const nextDistance = dx * dx + dy * dy;
          if (nextDistance > distance) continue;
          closest = candidate;
          distance = nextDistance;
          if (distance === 0) return closest;
        }
      }
    }
    return closest;
  }

  function placementSnapStep() {
    return gridVisible && snapEnabled ? getViewport().minorStep : 0;
  }

  function snapPoint(point, modifiers = {}) {
    if (!point || !gesturePositionSnapEnabled || !gridVisible || !snapEnabled || modifiers.ctrlKey || modifiers.metaKey) return point;
    const state = getViewport();
    if (!(state.zoom > 0)) return point;
    const endpoint = nearbyEndpoint(point);
    if (endpoint) return { x: endpoint.x, y: endpoint.y };
    const step = state.minorStep;
    const round = (value) => Math.round(Math.round(value / step) * step * 1e8) / 1e8;
    return { x: round(point.x), y: round(point.y) };
  }


  function snapEndpoint(point, anchor, modifiers = {}) {
    const ordinary = snapPoint(point, modifiers);
    if (!point || !anchor || !gesturePositionSnapEnabled || modifiers.ctrlKey || modifiers.metaKey) return ordinary;
    const zoom = getViewport().zoom;
    if (!(zoom > 0)) return ordinary;
    const dx = Math.abs(point.x - anchor.x), dy = Math.abs(point.y - anchor.y);
    if (!Number.isFinite(dx + dy) || Math.hypot(dx, dy) <= 1e-7) return ordinary;
    const tolerance = 10 / zoom;
    if (dy <= tolerance && dy <= dx) return { ...ordinary, y: anchor.y };
    if (dx <= tolerance) return { ...ordinary, x: anchor.x };
    return ordinary;
  }

  function snapAngle(angle, modifiers = {}) {
    const value = Number(angle);

    if (!Number.isFinite(value) || !gridVisible || !snapEnabled || modifiers.ctrlKey || modifiers.metaKey) {
      return angle;
    }
    const normalized = ((value % 360) + 360) % 360;
    const candidate = Math.round(normalized / ROTATION_SNAP_STEP) * ROTATION_SNAP_STEP;
    if (Math.abs(normalized - candidate) > ROTATION_SNAP_TOLERANCE) return angle;
    return candidate === 360 ? 0 : candidate;
  }

  function anchorForModel(model, adapter) {
    const geometry = model?.geometry || {};
    const point = geometry.start || geometry.center || geometry.points?.[0];
    if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) return { x: point.x, y: point.y };
    const bounds = adapter?.getBounds?.(model);
    return { x: bounds?.x || 0, y: bounds?.y || 0 };
  }


  function movePoint(start, anchor, point, modifiers = point) {
    if (!gesturePositionSnapEnabled) return point;
    const target = { x: anchor.x + point.x - start.x, y: anchor.y + point.y - start.y };
    const snapped = snapPoint(target, modifiers);
    return { x: point.x + snapped.x - target.x, y: point.y + snapped.y - target.y };
  }

  function renderGrid(state) {
    if (!gridContext) return;

    const width = Math.ceil(state.width);
    const height = Math.ceil(state.height);
    if (grid.width !== width) { grid.width = width; grid.style.width = width + "px"; }
    if (grid.height !== height) { grid.height = height; grid.style.height = height + "px"; }

    gridLayer?.setAttribute("transform", `translate(${viewBox.x} ${viewBox.y}) scale(${1 / state.zoom})`);
    gridLayer?.setAttribute("width", String(width));
    gridLayer?.setAttribute("height", String(height));
    gridContext.clearRect(0, 0, width, height);
    const draw = (spacing, color) => {
      gridContext.beginPath();
      gridContext.strokeStyle = color;
      gridContext.lineWidth = 1;
      for (let x = ((state.x % spacing) + spacing) % spacing; x < width; x += spacing) {
        const px = Math.floor(x) + 0.5;
        gridContext.moveTo(px, 0); gridContext.lineTo(px, height);
      }
      for (let y = ((state.y % spacing) + spacing) % spacing; y < height; y += spacing) {
        const py = Math.floor(y) + 0.5;
        gridContext.moveTo(0, py); gridContext.lineTo(width, py);
      }
      gridContext.stroke();
    };
    draw(state.minorStep * state.zoom, "#e2e8f0");
    draw(state.majorStep * state.zoom, "#b8c4d2");
    gridContext.beginPath();
    gridContext.strokeStyle = "#93b4e8";
    if (state.x >= 0 && state.x < width) {
      gridContext.moveTo(Math.floor(state.x) + 0.5, 0); gridContext.lineTo(Math.floor(state.x) + 0.5, height);
    }
    if (state.y >= 0 && state.y < height) {
      gridContext.moveTo(0, Math.floor(state.y) + 0.5); gridContext.lineTo(width, Math.floor(state.y) + 0.5);
    }
    gridContext.stroke();
  }

  function renderSnapStep() {
    const step = getViewport().minorStep;
    const amount = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 6 }).format(step);
    stepValue.textContent = `Adım: ${amount} birim${snapEnabled ? "" : " (Snap kapalı)"}`;
  }

  function renderViewport() {
    viewport = getViewport();
    viewportDirty = false;
    if (!(viewport.zoom > 0) || !viewport.width || !viewport.height) return;
    if (gridVisible) renderGrid(viewport);
    renderSnapStep();
  }

  function render() {
    frame = 0;
    if (editor.classList.contains("gizli")) return;
    if (viewportDirty) renderViewport();
  }

  function schedule(viewChanged = false) {
    if (viewChanged) { viewportDirty = true; viewport = null; }
    if (!frame) frame = requestAnimationFrame(render);
  }

  function syncButtons() {
    [[gridButton, gridVisible, "Izgarayı gizle", "Izgarayı göster"],
      [snapButton, snapEnabled, "Izgaraya yapışma açık", "Izgaraya yapışma kapalı"]].forEach(([button, active, on, off]) => {
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", active ? on : off);
      button.title = active ? on : off;
    });
    grid.classList.toggle("gizli", !gridVisible);
    renderSnapStep();
    schedule(true);
  }

  gridButton.addEventListener("click", () => {
    gridVisible = !gridVisible;
    if (!gridVisible) snapEnabled = false;
    savePreferences();
    syncButtons();
  });
  snapButton.addEventListener("click", () => {
    snapEnabled = !snapEnabled;
    if (snapEnabled) gridVisible = true;
    savePreferences();
    syncButtons();
  });
  document.querySelector("#btnEditorZoomIn").addEventListener("click", () => camera.zoomByPercentagePointAtCenter(canvas, 10));
  document.querySelector("#btnEditorZoomOut").addEventListener("click", () => camera.zoomByPercentagePointAtCenter(canvas, -10));


  canvas.addEventListener("kroki:viewboxchange", (event) => {
    viewBox = event.detail || camera.readViewBox(canvas);
    viewportDirty = true;
    viewport = null;
    if (editor.classList.contains("gizli")) return;
    renderViewport();
  });
  function resize() { rectDirty = true; schedule(true); }
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize);
  window.addEventListener("kroki:camera-gesture-start", endGesture);

  Kroki.EditorGrid = Object.freeze({ scaleForZoom, placementSnapStep, snapPoint, snapEndpoint, snapAngle, anchorForModel, movePoint, pointFromEvent, beginGesture, endGesture });
  syncButtons();
})();
