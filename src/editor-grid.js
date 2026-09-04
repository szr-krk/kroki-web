(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const editor = document.querySelector("#editor");
  const canvas = document.querySelector("#editorCanvas");
  const grid = document.querySelector("#editorGrid");
  const camera = window.krokiEditorCamera;
  if (!editor || !canvas || !grid || !camera) return;

  const NS = "http://www.w3.org/2000/svg";
  const SIZE = 32;
  const ROTATION_SNAP_STEP = 90;
  const ROTATION_SNAP_TOLERANCE = 5;
  const gridButton = document.querySelector("#btnEditorGrid");
  const snapButton = document.querySelector("#btnEditorSnap");
  const rulerButton = document.querySelector("#btnEditorRulers");
  let gridVisible = true;
  let snapEnabled = true;
  let rulersVisible = true;
  let frame = 0;
  let viewportDirty = true;
  let viewport = null;
  let rectDirty = true;
  let canvasRect = null;
  let viewBox = camera.readViewBox(canvas);
  let cursor = null;
  let snapTargets = null;
  let gestureSnapEnabled = true;
  const gridContext = grid.getContext("2d", { alpha: false });

  function svg(tag, attrs = {}) {
    const node = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach((key) => node.setAttribute(key, attrs[key]));
    return node;
  }

  // One scale in world units drives ruler ticks, grid lines and snapping.
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
    // Layout is read only when the workspace size changes, never per move/zoom.
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
      x: (canvasRect.width - viewBox.width * scale) / 2 - viewBox.x * scale,
      y: (canvasRect.height - viewBox.height * scale) / 2 - viewBox.y * scale
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

  function endGesture() { snapTargets = null; gestureSnapEnabled = true; }

  function beginGesture(excludedIds = [], pointerType = "mouse") {
    endGesture();
    const manager = Kroki.EditorObjectManager;
    // Keep a mixed selection rigid and free when any member opts out of snapping.
    gestureSnapEnabled = excludedIds.every((id) => manager?.getAdapter(id)?.capabilities?.gridSnap !== false);
    if (!gestureSnapEnabled || !gridVisible || !snapEnabled) return;
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
    // Read model references once. Never clone artwork or scan the scene on move.
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

  function snapPoint(point, modifiers = {}) {
    if (!point || !gestureSnapEnabled || !gridVisible || !snapEnabled || modifiers.ctrlKey || modifiers.metaKey) return point;
    const state = getViewport();
    if (!(state.zoom > 0)) return point;
    const endpoint = nearbyEndpoint(point);
    if (endpoint) return { x: endpoint.x, y: endpoint.y };
    const step = state.minorStep;
    const round = (value) => Math.round(Math.round(value / step) * step * 1e8) / 1e8;
    return { x: round(point.x), y: round(point.y) };
  }

  function snapAngle(angle, modifiers = {}) {
    const value = Number(angle);
    if (!Number.isFinite(value) || !gestureSnapEnabled || !gridVisible || !snapEnabled || modifiers.ctrlKey || modifiers.metaKey) {
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

  // Snap one anchor; translate the complete object/selection without distorting it.
  function movePoint(start, anchor, point, modifiers = point) {
    if (!gestureSnapEnabled) return point;
    const target = { x: anchor.x + point.x - start.x, y: anchor.y + point.y - start.y };
    const snapped = snapPoint(target, modifiers);
    return { x: point.x + snapped.x - target.x, y: point.y + snapped.y - target.y };
  }

  function renderGrid(state) {
    if (!gridContext) return;
    // One CSS-pixel backing store bounds tablet memory, regardless of device DPR.
    const width = Math.ceil(state.width);
    const height = Math.ceil(state.height);
    if (grid.width !== width) { grid.width = width; grid.style.width = width + "px"; }
    if (grid.height !== height) { grid.height = height; grid.style.height = height + "px"; }
    gridContext.fillStyle = "#ffffff";
    gridContext.fillRect(0, 0, width, height);
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

  function ruler(id, horizontal) {
    const root = document.querySelector(id);
    const ticks = svg("path", { fill: "none", stroke: "#94a3b8", "stroke-width": 1 });
    const majorTicks = svg("path", { fill: "none", stroke: "#64748b", "stroke-width": 1 });
    const labels = svg("g", { fill: "#475569", "font-size": 9, "font-family": "monospace" });
    const zero = svg("path", { fill: "none", stroke: "#2563eb", "stroke-width": 1.5 });
    const marker = svg("path", { fill: "#ef4444", stroke: "#ef4444", "stroke-width": 1 });
    marker.setAttribute("d", horizontal ? "M0 0V32 M-3 32L0 27L3 32Z" : "M0 0H32 M32 -3L27 0L32 3Z");
    marker.style.display = "none";
    root.append(ticks, majorTicks, labels, zero, marker);
    return { root, ticks, majorTicks, labels, zero, marker, horizontal, labelPool: [] };
  }
  const horizontal = ruler("#editorRulerX", true);
  const vertical = ruler("#editorRulerY", false);

  function renderRuler(rulerState, length, origin, state) {
    const { ticks, majorTicks, labels, zero, horizontal: isHorizontal } = rulerState;
    const spacing = state.minorStep * state.zoom;
    const first = Math.ceil(-origin / spacing);
    const last = Math.floor((length - origin) / spacing);
    let smallPath = "";
    let largePath = "";
    let zeroPath = "";
    let labelIndex = 0;
    for (let i = first; i <= last; i++) {
      const position = origin + i * spacing;
      const isMajor = i % state.subdivisions === 0;
      const start = i === 0 ? 5 : isMajor ? 17 : 25;
      const path = isHorizontal ? `M${position} ${start}V${SIZE}` : `M${start} ${position}H${SIZE}`;
      if (i === 0) zeroPath += path;
      else if (isMajor) largePath += path;
      else smallPath += path;
      if (!isMajor) continue;
      const value = i * state.minorStep;
      let label = rulerState.labelPool[labelIndex++];
      if (!label) {
        label = svg("text", isHorizontal ? { y: 11 } : { x: SIZE - 3, "text-anchor": "end" });
        rulerState.labelPool.push(label);
        labels.append(label);
      }
      if (label.style.display === "none") label.style.display = "";
      label.setAttribute(isHorizontal ? "x" : "y", isHorizontal ? position + 3 : position - 4);
      const text = Math.abs(value) < 1e-9 ? "0" : value.toFixed(state.precision);
      if (label.textContent !== text) label.textContent = text;
      const fill = i === 0 ? "#2563eb" : "#475569";
      if (label.getAttribute("fill") !== fill) label.setAttribute("fill", fill);
    }
    ticks.setAttribute("d", smallPath);
    majorTicks.setAttribute("d", largePath);
    zero.setAttribute("d", zeroPath);
    for (let i = labelIndex; i < rulerState.labelPool.length; i++) {
      if (rulerState.labelPool[i].style.display !== "none") rulerState.labelPool[i].style.display = "none";
    }
  }

  function renderViewport() {
    viewport = getViewport();
    viewportDirty = false;
    if (!(viewport.zoom > 0) || !viewport.width || !viewport.height) return;
    const { x, y, width, height } = viewport;
    if (gridVisible) renderGrid(viewport);
    if (rulersVisible) {
      renderRuler(horizontal, width, x, viewport);
      renderRuler(vertical, height, y, viewport);
    }
  }

  function renderCursor() {
    const active = cursor && viewport && rulersVisible && !camera.isGestureActive();
    let x = -1;
    let y = -1;
    if (active) {
      const world = {
        x: (cursor.clientX - viewport.left - viewport.x) / viewport.zoom,
        y: (cursor.clientY - viewport.top - viewport.y) / viewport.zoom
      };
      const point = snapPoint(world, cursor);
      x = point.x * viewport.zoom + viewport.x;
      y = point.y * viewport.zoom + viewport.y;
    }
    [[horizontal, x, viewport?.width], [vertical, y, viewport?.height]].forEach(([r, position, limit]) => {
      const visible = Boolean(active && position >= 0 && position <= limit);
      if (r.markerVisible !== visible) {
        r.marker.style.display = visible ? "" : "none";
        r.markerVisible = visible;
      }
      const pixel = Math.round(position);
      if (visible && r.markerPosition !== pixel) {
        r.marker.setAttribute("transform", r.horizontal ? `translate(${pixel} 0)` : `translate(0 ${pixel})`);
        r.markerPosition = pixel;
      }
    });
  }

  function render() {
    frame = 0;
    if (editor.classList.contains("gizli")) return;
    if (viewportDirty) renderViewport();
    renderCursor();
  }

  function schedule(viewChanged = false) {
    if (viewChanged) { viewportDirty = true; viewport = null; }
    if (!frame) frame = requestAnimationFrame(render);
  }

  function syncButtons() {
    [[gridButton, gridVisible, "Izgarayı gizle", "Izgarayı göster"],
      [snapButton, snapEnabled, "Izgaraya yapışma açık", "Izgaraya yapışma kapalı"],
      [rulerButton, rulersVisible, "Cetvelleri gizle", "Cetvelleri göster"]].forEach(([button, active, on, off]) => {
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", active ? on : off);
      button.title = active ? on : off;
    });
    grid.classList.toggle("gizli", !gridVisible);
    editor.classList.toggle("editor-rulers-hidden", !rulersVisible);
    schedule(true);
  }

  gridButton.addEventListener("click", () => {
    gridVisible = !gridVisible;
    if (!gridVisible) snapEnabled = false;
    syncButtons();
  });
  snapButton.addEventListener("click", () => {
    snapEnabled = !snapEnabled;
    if (snapEnabled) gridVisible = true;
    syncButtons();
  });
  rulerButton.addEventListener("click", () => {
    rulersVisible = !rulersVisible;
    cursor = null;
    rectDirty = true;
    syncButtons();
    // Reuse the editor's existing viewport resize handlers for its handles and
    // open inspector panels when the ruler changes the available canvas area.
    window.dispatchEvent(new Event("resize"));
  });
  // Camera writes are already limited to one per frame. Update in that same
  // frame so the grid cannot trail the drawing during pan or pinch.
  canvas.addEventListener("kroki:viewboxchange", (event) => {
    viewBox = event.detail || camera.readViewBox(canvas);
    viewportDirty = true;
    viewport = null;
    if (editor.classList.contains("gizli")) return;
    renderViewport();
    renderCursor();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || camera.isGestureActive() || !rulersVisible) return;
    cursor = { clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
    if (rulersVisible) schedule();
  }, { capture: true, passive: true });
  function clearCursor() { if (cursor) { cursor = null; schedule(); } }
  canvas.addEventListener("pointerdown", (event) => { if (event.pointerType === "touch") clearCursor(); }, { capture: true, passive: true });
  canvas.addEventListener("pointerleave", clearCursor, { passive: true });
  canvas.addEventListener("pointercancel", clearCursor, { passive: true });
  canvas.addEventListener("pointerup", (event) => { if (event.pointerType !== "mouse") clearCursor(); }, { passive: true });
  function resize() { rectDirty = true; schedule(true); }
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize);
  window.addEventListener("kroki:camera-gesture-start", () => { clearCursor(); endGesture(); });

  Kroki.EditorGrid = Object.freeze({ scaleForZoom, snapPoint, snapAngle, anchorForModel, movePoint, pointFromEvent, beginGesture, endGesture });
  syncButtons();
})();
