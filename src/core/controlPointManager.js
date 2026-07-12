(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  if (!utils || !manager) return;

  const CP_VISIBLE_DIAMETER_PX = 48;
  const CP_TOUCH_DIAMETER_PX = 72;

  let activeId = "";
  let mode = "";
  let activeType = "";
  let selectionElement = null;
  let onControlPointDown = null;
  const handles = new Map();
  let cachedMetrics = null;

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
      sync();
    }
  };

  manager.canvas.addEventListener("kroki:viewboxchange", () => {
    cachedMetrics = null;
  });
})();
