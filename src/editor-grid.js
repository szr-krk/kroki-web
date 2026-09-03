(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const editor = document.querySelector("#editor");
  const canvas = document.querySelector("#editorCanvas");
  const grid = document.querySelector("#editorGrid");
  const camera = window.krokiEditorCamera;
  if (!editor || !canvas || !grid || !camera) return;

  const NS = "http://www.w3.org/2000/svg";
  const SIZE = 32;
  const gridButton = document.querySelector("#btnEditorGrid");
  const snapButton = document.querySelector("#btnEditorSnap");
  const rulerButton = document.querySelector("#btnEditorRulers");
  let gridVisible = true;
  let snapEnabled = true;
  let rulersVisible = true;
  let frame = 0;
  let viewportDirty = true;
  let viewport = null;
  let cursor = null;

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
    // Read the displayed viewBox, including xMidYMid letterboxing on tablets.
    const viewBox = canvas.viewBox.baseVal;
    const metrics = camera.getViewportMetrics(canvas, viewBox);
    return {
      ...scaleForZoom(metrics.scale),
      zoom: metrics.scale,
      width: metrics.rect.width,
      height: metrics.rect.height,
      left: metrics.rect.left,
      top: metrics.rect.top,
      x: metrics.left - metrics.rect.left - viewBox.x * metrics.scale,
      y: metrics.top - metrics.rect.top - viewBox.y * metrics.scale
    };
  }

  function snapPoint(point, modifiers = {}) {
    if (!point || !gridVisible || !snapEnabled || modifiers.ctrlKey || modifiers.metaKey) return point;
    if (viewportDirty || !viewport) viewport = currentViewport();
    if (!(viewport.zoom > 0)) return point;
    const step = viewport.minorStep;
    const round = (value) => Number((Math.round(value / step) * step).toPrecision(12));
    return { x: round(point.x), y: round(point.y) };
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
    const target = { x: anchor.x + point.x - start.x, y: anchor.y + point.y - start.y };
    const snapped = snapPoint(target, modifiers);
    return { x: point.x + snapped.x - target.x, y: point.y + snapped.y - target.y };
  }

  const defs = svg("defs");
  function pattern(id, stroke, width) {
    const node = svg("pattern", { id, patternUnits: "userSpaceOnUse" });
    const path = svg("path", { fill: "none", stroke, "stroke-width": width });
    node.append(path);
    defs.append(node);
    return { node, path };
  }
  const minor = pattern("editorGridMinor", "#e2e8f0", 0.75);
  const major = pattern("editorGridMajor", "#b8c4d2", 1);
  const axes = svg("path", { fill: "none", stroke: "#93b4e8", "stroke-width": 1 });
  grid.append(defs,
    svg("rect", { width: "100%", height: "100%", fill: "url(#editorGridMinor)" }),
    svg("rect", { width: "100%", height: "100%", fill: "url(#editorGridMajor)" }), axes);

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
    return { root, ticks, majorTicks, labels, zero, marker, horizontal };
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
    const fragment = document.createDocumentFragment();
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
      const label = svg("text", isHorizontal
        ? { x: position + 3, y: 11 }
        : { x: SIZE - 3, y: position - 4, "text-anchor": "end" });
      label.textContent = Math.abs(value) < 1e-9 ? "0" : value.toFixed(state.precision);
      if (i === 0) label.setAttribute("fill", "#2563eb");
      fragment.append(label);
    }
    ticks.setAttribute("d", smallPath);
    majorTicks.setAttribute("d", largePath);
    zero.setAttribute("d", zeroPath);
    labels.replaceChildren(fragment);
  }

  function renderViewport() {
    viewport = currentViewport();
    viewportDirty = false;
    if (!(viewport.zoom > 0) || !viewport.width || !viewport.height) return;
    const { x, y, width, height, zoom } = viewport;
    if (gridVisible) {
      [[minor, viewport.minorStep], [major, viewport.majorStep]].forEach(([item, step]) => {
        const spacing = step * zoom;
        item.node.setAttribute("width", spacing);
        item.node.setAttribute("height", spacing);
        item.node.setAttribute("x", ((x % spacing) + spacing) % spacing);
        item.node.setAttribute("y", ((y % spacing) + spacing) % spacing);
        item.path.setAttribute("d", `M${spacing} 0H0V${spacing}`);
      });
      axes.setAttribute("d", `M${x} 0V${height}M0 ${y}H${width}`);
    }
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
      r.marker.style.display = active && position >= 0 && position <= limit ? "" : "none";
      if (active) r.marker.setAttribute("transform", r.horizontal ? `translate(${position} 0)` : `translate(0 ${position})`);
    });
  }

  function render() {
    frame = 0;
    if (editor.classList.contains("gizli")) return;
    if (viewportDirty) renderViewport();
    renderCursor();
  }

  function schedule(viewChanged = false) {
    if (viewChanged) viewportDirty = true;
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
    syncButtons();
    // Reuse the editor's existing viewport resize handlers for its handles and
    // open inspector panels when the ruler changes the available canvas area.
    window.dispatchEvent(new Event("resize"));
  });
  // Camera writes are already limited to one per frame. Update in that same
  // frame so the grid cannot trail the drawing during pan or pinch.
  canvas.addEventListener("kroki:viewboxchange", () => {
    viewportDirty = true;
    if (editor.classList.contains("gizli")) return;
    renderViewport();
    renderCursor();
  });
  canvas.addEventListener("pointermove", (event) => {
    cursor = { clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
    if (rulersVisible) schedule();
  }, { capture: true, passive: true });
  function clearCursor() { cursor = null; schedule(); }
  canvas.addEventListener("pointerleave", clearCursor, { passive: true });
  canvas.addEventListener("pointercancel", clearCursor, { passive: true });
  canvas.addEventListener("pointerup", (event) => { if (event.pointerType !== "mouse") clearCursor(); }, { passive: true });
  new ResizeObserver(() => schedule(true)).observe(canvas);

  Kroki.EditorGrid = Object.freeze({ scaleForZoom, snapPoint, anchorForModel, movePoint });
  syncButtons();
})();
