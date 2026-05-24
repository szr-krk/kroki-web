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

  function metrics() {
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
  }

  function resizeHandle(handle, sizes) {
    handle.querySelector(".editor-object-cp-hit")?.setAttribute("r", String(sizes.touchRadius));
    handle.querySelector(".editor-object-cp-visual")?.setAttribute("r", String(sizes.visibleRadius));
  }

  function createHandle(cp, sizes) {
    const handle = utils.createSvgElement("g", {
      class: "editor-object-cp",
      "data-point": cp.id,
      cursor: cp.cursor || ""
    });
    handle.append(
      utils.createSvgElement("circle", { class: "editor-object-cp-hit" }),
      utils.createSvgElement("circle", { class: "editor-object-cp-visual" })
    );
    handle.addEventListener("pointerdown", (event) => {
      if (typeof onControlPointDown === "function") onControlPointDown(event, cp.id);
    });
    resizeHandle(handle, sizes);
    updateHandle(handle, cp, sizes);
    return handle;
  }

  function updateHandle(handle, cp, sizes) {
    resizeHandle(handle, sizes);
    handle.setAttribute("transform", `translate(${cp.x} ${cp.y})`);
    handle.classList.toggle("is-preselect", mode === "preselect");
    if (cp.cursor) handle.style.cursor = cp.cursor;
  }

  function sync() {
    if (!activeId) return;
    const model = manager.get(activeId);
    const adapter = manager.getAdapter(model);
    const editLayer = manager.canvas.querySelector("#editorEditLayer");
    if (!model || !adapter || !editLayer) {
      clear();
      return;
    }

    const sizes = metrics();
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
        updateHandle(handle, cp, sizes);
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
})();
