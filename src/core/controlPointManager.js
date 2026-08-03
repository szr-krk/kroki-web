(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  if (!utils || !manager) return;

  const CP_VISIBLE_DIAMETER_PX = 48;
  const CP_TOUCH_DIAMETER_PX = 72;
  const CP_VISIBILITY_INSET_PX = CP_VISIBLE_DIAMETER_PX / 2 + 2;
  const CP_FIT_MAX_PASSES = 4;

  let activeId = "";
  let mode = "";
  let activeType = "";
  let selectionElement = null;
  let onControlPointDown = null;
  const handles = new Map();
  let cachedMetrics = null;
  let ensuringVisible = false;
  let revealOnNextPreselect = false;

  function setRevealPending(enabled) {
    revealOnNextPreselect = Boolean(enabled);
  }

  function computeMetrics() {
    const unit = utils.svgUnitsPerScreenPx(manager.canvas);
    return {
      unit,
      visibleRadius: CP_VISIBLE_DIAMETER_PX * unit / 2,
      touchRadius: CP_TOUCH_DIAMETER_PX * unit / 2,
      endpointOffset: CP_VISIBLE_DIAMETER_PX * unit,
      handleGap: CP_VISIBLE_DIAMETER_PX * unit,
      minGap: 2 * unit
    };
  }

  function metrics() {
    if (!cachedMetrics) cachedMetrics = computeMetrics();
    return cachedMetrics;
  }

  function isFiniteBounds(bounds) {
    return Boolean(
      bounds
      && Number.isFinite(bounds.x)
      && Number.isFinite(bounds.y)
      && Number.isFinite(bounds.width)
      && Number.isFinite(bounds.height)
      && bounds.width >= 0
      && bounds.height >= 0
    );
  }

  function unionBounds(first, second) {
    if (!isFiniteBounds(first)) return isFiniteBounds(second) ? { ...second } : null;
    if (!isFiniteBounds(second)) return { ...first };
    const minX = Math.min(first.x, second.x);
    const minY = Math.min(first.y, second.y);
    const maxX = Math.max(first.x + first.width, second.x + second.width);
    const maxY = Math.max(first.y + first.height, second.y + second.height);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  function boundsFromControlPoints(points) {
    const usable = (Array.isArray(points) ? points : []).filter((point) => (
      Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ));
    if (!usable.length) return null;
    const xs = usable.map((point) => point.x);
    const ys = usable.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY
    };
  }

  function activeControlPoints(sizes = computeMetrics()) {
    const model = activeId ? manager.get(activeId) : null;
    const adapter = manager.getAdapter(model);
    if (!model || typeof adapter?.getControlPoints !== "function") return [];
    return adapter.getControlPoints(model, sizes, mode) || [];
  }

  function controlPointsFitViewport(points, insetPx = CP_VISIBILITY_INSET_PX) {
    const camera = window.krokiEditorCamera;
    const viewBox = camera?.readViewBox?.(manager.canvas);
    const viewport = viewBox ? camera?.getViewportMetrics?.(manager.canvas, viewBox) : null;
    if (!viewport || !Number.isFinite(viewport.scale) || viewport.scale <= 0) return true;
    const inset = Math.min(
      Math.max(0, Number(insetPx) || 0),
      Math.max(0, Math.min(viewport.width, viewport.height) / 2 - 1)
    );
    const left = viewport.left + inset;
    const right = viewport.left + viewport.width - inset;
    const top = viewport.top + inset;
    const bottom = viewport.top + viewport.height - inset;
    return points.every((point) => {
      const clientX = viewport.left + (point.x - viewBox.x) * viewport.scale;
      const clientY = viewport.top + (point.y - viewBox.y) * viewport.scale;
      return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
    });
  }

  function ensureActiveVisible() {
    const camera = window.krokiEditorCamera;
    if (
      !activeId
      || ensuringVisible
      || typeof camera?.fitBounds !== "function"
      || typeof camera?.readViewBox !== "function"
    ) {
      return false;
    }
    ensuringVisible = true;
    let changed = false;
    try {
      for (let pass = 0; pass < CP_FIT_MAX_PASSES; pass += 1) {
        const sizes = computeMetrics();
        const points = activeControlPoints(sizes);
        if (!points.length || controlPointsFitViewport(points)) break;
        const viewBox = camera.readViewBox(manager.canvas);
        const viewport = camera.getViewportMetrics?.(manager.canvas, viewBox);
        const pointBounds = boundsFromControlPoints(points);
        if (!viewport || !pointBounds || !Number.isFinite(viewport.scale) || viewport.scale <= 0) break;
        const insetWorld = CP_VISIBILITY_INSET_PX / viewport.scale;
        const minX = pointBounds.x - insetWorld;
        const minY = pointBounds.y - insetWorld;
        const maxX = pointBounds.x + pointBounds.width + insetWorld;
        const maxY = pointBounds.y + pointBounds.height + insetWorld;
        if (maxX - minX <= viewBox.width && maxY - minY <= viewBox.height) {
          const nextViewBox = {
            ...viewBox,
            x: Math.min(minX, Math.max(maxX - viewBox.width, viewBox.x)),
            y: Math.min(minY, Math.max(maxY - viewBox.height, viewBox.y))
          };
          if (
            Math.abs(nextViewBox.x - viewBox.x) < 0.000001
            && Math.abs(nextViewBox.y - viewBox.y) < 0.000001
          ) {
            break;
          }
          camera.writeViewBox?.(manager.canvas, nextViewBox);
          changed = true;
          continue;
        }
        const contentBounds = manager.getContentBounds?.();
        const framedContent = window.krokiEditorFraming?.expandBounds?.(
          contentBounds,
          window.krokiEditorFraming.CONTENT_PADDING_WORLD
        ) || contentBounds;
        const targetBounds = unionBounds(framedContent, pointBounds);
        if (!targetBounds) break;
        camera.fitBounds(targetBounds, {
          paddingWorld: 0,
          paddingPx: CP_VISIBILITY_INSET_PX
        });
        cachedMetrics = null;
        changed = true;
      }
      if (changed) sync();
      return changed;
    } finally {
      ensuringVisible = false;
    }
  }

  function removeOwnedElements() {
    const editLayer = manager.canvas.querySelector("#editorEditLayer");
    selectionElement?.remove();
    handles.forEach((handle) => handle.remove());
    editLayer?.querySelectorAll("[data-selection-type], .editor-object-cp:not(.editor-group-cp)").forEach((node) => node.remove());
    selectionElement = null;
    handles.clear();
  }

  function clear() {
    removeOwnedElements();
    activeId = "";
    mode = "";
    activeType = "";
    cachedMetrics = null;
  }

  function resizeHandle(handle, sizes, cp = {}) {
    handle.querySelector(".editor-object-cp-hit")?.setAttribute("r", String(sizes.touchRadius));
    const visualCircle = handle.querySelector("circle.editor-object-cp-visual");
    const visualRect = handle.querySelector("rect.editor-object-cp-visual");
    visualCircle?.setAttribute("r", String(sizes.visibleRadius));
    if (visualRect) {
      const width = sizes.visibleRadius * (cp.visualWidthScale || 0.68);
      const height = sizes.visibleRadius * (cp.visualHeightScale || 1.32);
      visualRect.setAttribute("x", String(-width / 2));
      visualRect.setAttribute("y", String(-height / 2));
      visualRect.setAttribute("width", String(width));
      visualRect.setAttribute("height", String(height));
      visualRect.setAttribute("rx", String(width * 0.28));
    }
  }

  function createHandle(cp, sizes) {
    const handle = utils.createSvgElement("g", {
      class: "editor-object-cp" + (cp.role ? " editor-object-cp-role-" + String(cp.role).replace(/[^a-z0-9_-]/gi, "-") : ""),
      "data-point": cp.id,
      "data-cp-role": cp.role || "",
      cursor: cp.cursor || ""
    });
    const visual = cp.shape === "segment"
      ? utils.createSvgElement("rect", { class: "editor-object-cp-visual editor-object-cp-segment-visual" })
      : utils.createSvgElement("circle", { class: "editor-object-cp-visual" });
    handle.append(
      utils.createSvgElement("circle", { class: "editor-object-cp-hit" }),
      visual
    );
    handle.addEventListener("pointerdown", (event) => {
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      event.preventDefault();
      if (typeof onControlPointDown === "function") onControlPointDown(event, cp.id);
    });
    resizeHandle(handle, sizes, cp);
    updateHandle(handle, cp, sizes);
    return handle;
  }

  function updateHandle(handle, cp, sizes, options = {}) {
    if (options.resize !== false) resizeHandle(handle, sizes, cp);
    const rotation = Number.isFinite(cp.angle) ? ` rotate(${cp.angle})` : "";
    handle.setAttribute("transform", `translate(${cp.x} ${cp.y})${rotation}`);
    handle.classList.toggle("is-preselect", mode === "preselect");
    if (cp.cursor) handle.style.cursor = cp.cursor;
  }

  function sync(options = {}) {
    if (!activeId) return;
    const model = manager.get(activeId);
    const adapter = manager.getAdapter(model);
    const editLayer = manager.canvas.querySelector("#editorEditLayer");
    if (!model || !adapter || !editLayer) {
      clear();
      return;
    }

    const sizes = options.reuseMetrics && cachedMetrics ? cachedMetrics : computeMetrics();
    cachedMetrics = sizes;
    if (activeType !== model.type) {
      removeOwnedElements();
      activeType = model.type;
    }

    if (!selectionElement) {
      selectionElement = adapter.createSelectionElement(utils);
      selectionElement.dataset.selectionType = model.type;
      editLayer.append(selectionElement);
    }
    adapter.renderSelection(selectionElement, model, model.style, mode);
    const cps = adapter.getControlPoints(model, sizes, mode);
    const liveIds = new Set(cps.map((cp) => cp.id));

    handles.forEach((handle, id) => {
      if (!liveIds.has(id)) {
        handle.remove();
        handles.delete(id);
      }
    });

    cps.forEach((cp) => {
      let handle = handles.get(cp.id);
      if (!handle) {
        handle = createHandle(cp, sizes);
        handles.set(cp.id, handle);
        editLayer.append(handle);
      } else {
        updateHandle(handle, cp, sizes, options);
      }
    });
  }

  Kroki.ControlPointManager = {
    metrics,
    clear,
    sync,
    show(id, nextMode, callbacks = {}) {
      activeId = id;
      mode = nextMode;
      onControlPointDown = callbacks.onControlPointDown || null;
      const shouldReveal = mode === "preselect" && revealOnNextPreselect;
      if (shouldReveal) setRevealPending(false);
      sync();
      if (shouldReveal) ensureActiveVisible();
    }
  };

  manager.canvas.addEventListener("kroki:viewboxchange", () => {
    cachedMetrics = null;
  });
  manager.canvas.addEventListener("kroki:control-point-reveal-request", (event) => {
    setRevealPending(event.detail?.enabled);
  });
  window.addEventListener("kroki:camera-gesture-start", () => {
    setRevealPending(false);
  });
})();
