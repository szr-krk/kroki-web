(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  const hitTest = Kroki.HitTestManager;
  const controlPoints = Kroki.ControlPointManager;
  if (!utils || !manager || !hitTest || !controlPoints) return;

  let activeId = "";
  let mode = "";
  let drag = null;
  let viewportSyncFrame = 0;
  const DRAG_START_THRESHOLD_PX = 3;

  function screenMatrix() {
    return manager.canvas.getScreenCTM?.()?.inverse?.() || null;
  }

  function pointFromEvent(event, matrix = null) {
    if (!matrix) return utils.pointFromEvent(manager.canvas, event);
    const point = manager.canvas.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix);
  }

  function setEditorState() {
    if (!activeId) {
      window.krokiEditorState?.clearEditedObject?.();
      return;
    }
    const model = manager.get(activeId);
    const element = manager.getElement(activeId);
    const stateMode = mode === "edit" ? model.type : model.type + "-preselect";
    window.krokiEditorState?.setEditedObject?.(element, stateMode);
  }

  function showPanels() {
    window.krokiObjectEditCore?.topIp?.classList.remove("gizli");
    window.krokiObjectEditCore?.sideIp?.classList.remove("gizli");
  }

  function hidePanels() {
    window.krokiObjectEditCore?.topIp?.classList.add("gizli");
    window.krokiObjectEditCore?.sideIp?.classList.add("gizli");
    Kroki.StyleManager?.hidePanels?.();
  }

  function sync() {
    if (!activeId) {
      controlPoints.clear();
      if (!Kroki.MultiSelectManager?.hasSelection?.()) hidePanels();
      Kroki.StyleManager?.syncControls?.();
      setEditorState();
      Kroki.MultiSelectManager?.syncControls?.();
      return;
    }
    showPanels();
    controlPoints.show(activeId, mode, { onControlPointDown: startControlPointDrag });
    Kroki.StyleManager?.syncControls?.();
    setEditorState();
    Kroki.MultiSelectManager?.syncControls?.();
  }

  function syncViewportNow() {
    viewportSyncFrame = 0;
    if (!activeId) return;
    controlPoints.sync();
  }

  function syncViewport() {
    if (!activeId || viewportSyncFrame) return;
    viewportSyncFrame = window.requestAnimationFrame?.(syncViewportNow) || window.setTimeout(syncViewportNow, 16);
  }

  function cancelQueuedDragFrame(dragState = drag) {
    if (!dragState?.pendingFrame) return;
    if (dragState.pendingFrameIsTimeout) window.clearTimeout(dragState.pendingFrame);
    else window.cancelAnimationFrame?.(dragState.pendingFrame);
    dragState.pendingFrame = 0;
    dragState.pendingFrameIsTimeout = false;
  }

  function applyDragPoint(dragState, point) {
    if (!dragState || drag !== dragState || !point) return false;
    const model = getActiveModel();
    const adapter = manager.getAdapter(model);
    if (!model || !adapter) return false;

    if (dragState.type === "object") {
      const dx = point.x - dragState.lastPoint.x;
      const dy = point.y - dragState.lastPoint.y;
      if (Math.hypot(dx, dy) <= 0.0001) return true;
      if (dragState.liveRoadObjectPreview && dragState.previewModel) {
        adapter.move(dragState.previewModel, dx, dy);
        dragState.totalDx += dx;
        dragState.totalDy += dy;
        updateRoadControlPreview(dragState, dragState.previewModel, adapter);
        dragState.lastPoint = point;
        return true;
      }
      if (dragState.liveTransform) {
        dragState.totalDx += dx;
        dragState.totalDy += dy;
        if (model?.type === "road") updateRoadTransformPreview(dragState, model, adapter);
        else applyLiveTransform(dragState);
        dragState.lastPoint = point;
        return true;
      }
      ensureDragTransaction(dragState);
      manager.updateGeometry(model.id, (draft) => {
        adapter.move(draft, dx, dy);
      }, { skipHistory: true });
      dragState.lastPoint = point;
      return true;
    }

    if (dragState.type === "control") {
      const moved = Math.hypot(point.x - dragState.lastPoint.x, point.y - dragState.lastPoint.y) > 0.0001;
      if (!moved) return true;
      if (dragState.liveRoadControlPreview && dragState.previewModel) {
        const usedPreviewMove = adapter.previewMoveControlPoint?.(dragState.previewModel, dragState.cpId, point, {
          startState: dragState.startState,
          lastPoint: dragState.lastPoint,
          metrics: dragState.metrics || controlPoints.metrics()
        }) === true;
        if (!usedPreviewMove) {
          adapter.moveControlPoint(dragState.previewModel, dragState.cpId, point, {
            startState: dragState.startState,
            lastPoint: dragState.lastPoint,
            metrics: dragState.metrics || controlPoints.metrics()
          });
        } else {
          dragState.previewNeedsFinalize = true;
        }
        updateRoadControlPreview(dragState, dragState.previewModel, adapter);
        dragState.lastPoint = point;
        return true;
      }
      if (dragState.liveLineControlPreview && dragState.previewModel) {
        adapter.moveControlPoint(dragState.previewModel, dragState.cpId, point, {
          startState: dragState.startState,
          lastPoint: dragState.lastPoint,
          metrics: dragState.metrics || controlPoints.metrics()
        });
        updateLineControlPreview(dragState, dragState.previewModel, adapter);
        dragState.lastPoint = point;
        return true;
      }
      ensureDragTransaction(dragState);
      manager.updateGeometry(model.id, (draft) => {
        adapter.moveControlPoint(draft, dragState.cpId, point, {
          startState: dragState.startState,
          lastPoint: dragState.lastPoint,
          metrics: dragState.metrics || controlPoints.metrics()
        });
      }, {
        skipHistory: true,
        labels: false,
        controlPoints: false,
        styleControls: Boolean(adapter.capabilities?.trafficSign || adapter.capabilities?.otherSymbol || adapter.capabilities?.catalogObject || adapter.capabilities?.vehicleObject)
      });
      controlPoints.sync({ reuseMetrics: true, resize: false });
      dragState.lastPoint = point;
      return true;
    }

    return false;
  }

  function ensureDragTransaction(dragState = drag) {
    if (!dragState || dragState.transaction || dragState.historyDisabled) return dragState?.transaction || null;
    dragState.transaction = Kroki.HistoryManager?.beginObjectChange?.(dragState.modelId, dragState.historyLabel)
      || Kroki.HistoryManager?.begin?.(dragState.historyLabel)
      || null;
    dragState.historyDisabled = !dragState.transaction;
    return dragState.transaction;
  }

  function flushQueuedDragPoint(dragState = drag) {
    if (!dragState || drag !== dragState) return false;
    cancelQueuedDragFrame(dragState);
    const point = dragState.pendingPoint;
    dragState.pendingPoint = null;
    return applyDragPoint(dragState, point);
  }

  function queueDragPoint(point) {
    if (!drag) return;
    const dragState = drag;
    dragState.pendingPoint = { x: point.x, y: point.y };
    if (dragState.pendingFrame) return;
    const run = () => {
      if (drag !== dragState) return;
      dragState.pendingFrame = 0;
      dragState.pendingFrameIsTimeout = false;
      flushQueuedDragPoint(dragState);
    };
    if (typeof window.requestAnimationFrame === "function") {
      dragState.pendingFrame = window.requestAnimationFrame(run);
      dragState.pendingFrameIsTimeout = false;
    } else {
      dragState.pendingFrame = window.setTimeout(run, 16);
      dragState.pendingFrameIsTimeout = true;
    }
  }

  function resetPointEdit(id = activeId) {
    const model = manager.get(id);
    const adapter = manager.getAdapter(model);
    const shouldResetPointEdit = Boolean(model?.metadata?.pointEdit && adapter?.capabilities?.pointEdit);
    const shouldResetRoadSelection = Boolean(model?.metadata?.roadSelection && adapter?.capabilities?.roadObject);
    const shouldResetRoadBoundaryEdit = Boolean(model?.metadata?.roadBoundaryEdit && adapter?.capabilities?.roadObject);
    const shouldResetRoadBarrierEdit = Boolean(model?.metadata?.roadBarrierEdit && adapter?.capabilities?.roadObject);
    const shouldResetRoadPocketEdit = Boolean(model?.metadata?.roadPocketEdit && adapter?.capabilities?.roadObject);
    const shouldResetRoadPocketIslandEdit = Boolean(model?.metadata?.roadPocketIslandEdit && adapter?.capabilities?.roadObject);
    if (!shouldResetPointEdit && !shouldResetRoadSelection && !shouldResetRoadBoundaryEdit && !shouldResetRoadBarrierEdit && !shouldResetRoadPocketEdit && !shouldResetRoadPocketIslandEdit) return;
    manager.updateModel(id, (draft) => {
      const metadata = { ...(draft.metadata || {}) };
      if (shouldResetPointEdit) metadata.pointEdit = false;
      if (shouldResetRoadSelection) delete metadata.roadSelection;
      if (shouldResetRoadBoundaryEdit) delete metadata.roadBoundaryEdit;
      if (shouldResetRoadBarrierEdit) delete metadata.roadBarrierEdit;
      if (shouldResetRoadPocketEdit) delete metadata.roadPocketEdit;
      if (shouldResetRoadPocketIslandEdit) delete metadata.roadPocketIslandEdit;
      return { ...draft, metadata };
    }, { skipHistory: true, controlPoints: false, styleControls: false });
  }

  function select(id, nextMode, options = {}) {
    if (!manager.get(id)) return;
    if (!options.preserveMulti) Kroki.MultiSelectManager?.clear?.({ silent: true, fromSelection: true });
    if (activeId && activeId !== id) resetPointEdit(activeId);
    if ((nextMode || "preselect") !== "edit") resetPointEdit(id);
    activeId = id;
    mode = nextMode || "preselect";
    sync();
  }

  function clear(options = {}) {
    if (!options.preserveMulti) Kroki.MultiSelectManager?.clear?.({ silent: true, fromSelection: true });
    resetPointEdit();
    activeId = "";
    mode = "";
    cancelQueuedDragFrame(drag);
    drag = null;
    if (options.silent) {
      setEditorState();
      return;
    }
    sync();
  }

  function promoteToEdit() {
    if (!activeId || mode === "edit") return;
    mode = "edit";
    sync();
  }

  function getActiveModel() {
    return activeId ? manager.get(activeId) : null;
  }

  function liveTransformTargetsFor(id) {
    const targets = [];
    const seen = new Set();
    const pushTarget = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      targets.push(node);
    };
    const element = manager.getElement?.(id);
    pushTarget(element);
    manager.canvas?.querySelectorAll?.("[data-label-for], [data-for-line], [data-for-shape], [data-for-ellipse]")
      .forEach((node) => {
        if (
          node.dataset.labelFor === id ||
          node.dataset.forLine === id ||
          node.dataset.forShape === id ||
          node.dataset.forEllipse === id
        ) {
          pushTarget(node);
        }
      });
    manager.canvas?.querySelectorAll?.("#editorEditLayer [data-selection-type], #editorEditLayer .editor-object-cp:not(.editor-group-cp)")
      .forEach(pushTarget);
    return targets.map((node) => ({
      node,
      baseTransform: node.getAttribute("transform") || "",
      lastTransform: node.getAttribute("transform") || ""
    }));
  }

  function applyLiveTransform(dragState) {
    if (!dragState?.liveTransformTargets?.length) return;
    const translate = `translate(${dragState.totalDx || 0} ${dragState.totalDy || 0})`;
    dragState.liveTransformTargets.forEach((target) => {
      const value = target.baseTransform ? `${translate} ${target.baseTransform}` : translate;
      if (target.lastTransform === value) return;
      target.node.setAttribute("transform", value);
      target.lastTransform = value;
    });
  }

  function clearLiveTransform(dragState) {
    if (!dragState?.liveTransformTargets?.length) return;
    dragState.liveTransformTargets.forEach((target) => {
      if (target.baseTransform) {
        if (target.lastTransform !== target.baseTransform) target.node.setAttribute("transform", target.baseTransform);
      } else if (target.node.hasAttribute("transform")) target.node.removeAttribute("transform");
      target.lastTransform = target.baseTransform;
    });
  }

  function hideLiveRoadObjectSource(dragState) {
    if (!dragState?.liveRoadObjectPreview || dragState.hiddenRoadSource) return;
    const element = manager.getElement?.(dragState.modelId);
    if (!element) return;
    dragState.hiddenRoadSource = {
      element,
      visibility: element.style.visibility || ""
    };
    element.style.visibility = "hidden";
  }

  function restoreLiveRoadObjectSource(dragState) {
    const source = dragState?.hiddenRoadSource;
    if (!source?.element) return;
    source.element.style.visibility = source.visibility;
    dragState.hiddenRoadSource = null;
  }

  function renderLinePreviewElement(element, model) {
    const start = model?.geometry?.start || {};
    const end = model?.geometry?.end || {};
    element?.setAttribute?.("x1", String(start.x || 0));
    element?.setAttribute?.("y1", String(start.y || 0));
    element?.setAttribute?.("x2", String(end.x || 0));
    element?.setAttribute?.("y2", String(end.y || 0));
  }

  function updateLineControlPreview(dragState, model, adapter) {
    if (!dragState || !model || !adapter) return;
    renderLinePreviewElement(dragState.lineElement, model);
    if (dragState.lineSelectionElement?.isConnected && typeof adapter.renderSelection === "function") {
      adapter.renderSelection(dragState.lineSelectionElement, model, model.style, mode);
    }
    updatePreviewControlHandles(dragState, model, adapter, dragState.metrics);
  }

  function roadPreviewInfo(model, adapter, dragState = null) {
    if (!model || !adapter) return "";
    if (dragState?.liveRoadControlPreview && typeof adapter.controlPreviewPathData === "function") {
      const data = adapter.controlPreviewPathData(model, dragState.cpId);
      if (data) return { data, mode: "surface" };
    }
    const config = typeof adapter.roadConfig === "function"
      ? adapter.roadConfig(model)
      : (model.metadata?.road || {});
    const section = typeof adapter.crossSection === "function" ? adapter.crossSection(config) : null;
    const isIsland = model?.geometry?.profile === "islandRing" || adapter?.isIsland?.(model);
    if (!isIsland && typeof adapter.offsetPathData === "function") {
      const previewSamples = model?.geometry?.profile === "sCurve" ? 22 : 8;
      const data = adapter.offsetPathData(model, 0, false, previewSamples);
      if (data) return { data, mode: "stroke", width: Math.max(1, section?.totalWidth || 1) };
    }
    if (typeof adapter.previewSurfacePathData === "function" && Number.isFinite(section?.totalWidth)) {
      return { data: adapter.previewSurfacePathData(model, section.totalWidth), mode: "surface" };
    }
    if (typeof adapter.surfacePathData === "function" && Number.isFinite(section?.totalWidth)) {
      return { data: adapter.surfacePathData(model, section.totalWidth), mode: "surface" };
    }
    const data = typeof adapter.offsetPathData === "function" ? adapter.offsetPathData(model, 0) : "";
    return { data, mode: "stroke", width: Math.max(1, section?.totalWidth || 1) };
  }

  function isIslandRoad(model, adapter) {
    return Boolean(model?.geometry?.profile === "islandRing" || adapter?.isIsland?.(model));
  }

  function numeric(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function islandPreviewGeometry(model) {
    const geometry = model?.geometry || {};
    const innerRadius = Math.max(0, numeric(geometry.innerDiameter, 0) / 2);
    const outerRadius = Math.max(innerRadius + 1, numeric(geometry.outerDiameter, 0) / 2);
    return {
      center: {
        x: numeric(geometry.center?.x, 0),
        y: numeric(geometry.center?.y, 0)
      },
      innerRadius,
      outerRadius,
      centerRadius: (innerRadius + outerRadius) / 2,
      width: Math.max(1, outerRadius - innerRadius)
    };
  }

  function setAttrIfChanged(element, name, value) {
    const next = String(value);
    if (element.getAttribute(name) !== next) element.setAttribute(name, next);
  }

  function ensureIslandCirclePreview(dragState) {
    if (dragState.roadControlPreviewElement?.classList?.contains("editor-road-island-preview")) {
      return dragState.roadControlPreviewElement;
    }
    dragState.roadControlPreviewElement?.remove();
    const editLayer = manager.canvas.querySelector("#editorEditLayer");
    if (!editLayer) return null;
    const group = utils.createSvgElement("g", {
      class: "editor-road-live-preview editor-road-island-preview" + (dragState.type === "control" ? " editor-road-control-preview" : " editor-road-move-preview"),
      "pointer-events": "none"
    });
    group.append(
      utils.createSvgElement("circle", { class: "editor-road-island-preview-band", fill: "none", stroke: "rgba(14, 165, 233, 0.16)", "stroke-linecap": "round", "vector-effect": "none" }),
      utils.createSvgElement("circle", { class: "editor-road-island-preview-outline", fill: "none", stroke: "#0284c7", "vector-effect": "none" }),
      utils.createSvgElement("circle", { class: "editor-road-island-preview-outline", fill: "none", stroke: "#0284c7", "vector-effect": "none" })
    );
    editLayer.insertBefore(group, editLayer.querySelector(".editor-object-cp:not(.editor-group-cp)") || null);
    dragState.roadControlPreviewElement = group;
    return group;
  }

  function updateIslandCirclePreview(dragState, model, options = {}) {
    const element = ensureIslandCirclePreview(dragState);
    if (!element) return false;
    const geometry = islandPreviewGeometry(model);
    const [band, outer, inner] = Array.from(element.children);
    const outlineWidth = Math.max(1, 2 * (dragState.metrics?.unit || utils.svgUnitsPerScreenPx(manager.canvas) || 1));
    [band, outer, inner].forEach((circle) => {
      setAttrIfChanged(circle, "cx", geometry.center.x);
      setAttrIfChanged(circle, "cy", geometry.center.y);
    });
    setAttrIfChanged(band, "r", geometry.centerRadius);
    setAttrIfChanged(band, "stroke-width", geometry.width);
    setAttrIfChanged(outer, "r", geometry.outerRadius);
    setAttrIfChanged(outer, "stroke-width", outlineWidth);
    setAttrIfChanged(inner, "r", geometry.innerRadius);
    setAttrIfChanged(inner, "stroke-width", outlineWidth);
    const dx = numeric(options.dx, 0);
    const dy = numeric(options.dy, 0);
    const transform = Math.hypot(dx, dy) > 0.0001 ? `translate(${dx} ${dy})` : "";
    if (transform) setAttrIfChanged(element, "transform", transform);
    else element.removeAttribute("transform");
    return true;
  }

  function ensureRoadControlPreview(dragState) {
    if (dragState.roadControlPreviewElement) return dragState.roadControlPreviewElement;
    const editLayer = manager.canvas.querySelector("#editorEditLayer");
    if (!editLayer) return null;
    const element = utils.createSvgElement("path", {
      class: "editor-road-live-preview" + (dragState.type === "control" ? " editor-road-control-preview" : " editor-road-move-preview"),
      fill: "rgba(14, 165, 233, 0.16)",
      stroke: "#0284c7",
      "stroke-width": String(Math.max(1, 2 * (dragState.metrics?.unit || utils.svgUnitsPerScreenPx(manager.canvas) || 1))),
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      "pointer-events": "none",
      "vector-effect": "none"
    });
    editLayer.insertBefore(element, editLayer.querySelector(".editor-object-cp:not(.editor-group-cp)") || null);
    dragState.roadControlPreviewElement = element;
    return element;
  }

  function applyRoadPreviewPath(element, dragState, model, adapter) {
    const info = roadPreviewInfo(model, adapter, dragState);
    if (!info?.data) return false;
    element.setAttribute("d", info.data);
    if (info.mode === "stroke") {
      element.setAttribute("fill", "none");
      element.setAttribute("stroke", "rgba(14, 165, 233, 0.22)");
      element.setAttribute("stroke-width", String(info.width || 1));
      element.setAttribute("stroke-linecap", "butt");
      element.removeAttribute("fill-rule");
      return true;
    }
    element.setAttribute("fill", "rgba(14, 165, 233, 0.16)");
    element.setAttribute("stroke", "#0284c7");
    element.setAttribute("stroke-width", String(Math.max(1, 2 * (dragState.metrics?.unit || utils.svgUnitsPerScreenPx(manager.canvas) || 1))));
    element.setAttribute("stroke-linecap", "round");
    if (model?.geometry?.profile === "islandRing" || adapter?.isIsland?.(model)) element.setAttribute("fill-rule", "evenodd");
    else element.removeAttribute("fill-rule");
    return true;
  }

  function updateRoadTransformPreview(dragState, model, adapter) {
    if (model?.type !== "road") return;
    if (isIslandRoad(model, adapter) && updateIslandCirclePreview(dragState, model, { dx: dragState.totalDx || 0, dy: dragState.totalDy || 0 })) {
      if (dragState.usingCanvasRoadPreview) Kroki.RoadDragPreview?.clear?.();
      dragState.usingCanvasRoadPreview = false;
      dragState.roadMovePreviewReady = true;
      return;
    }
    if (dragState.usingCanvasRoadPreview) {
      Kroki.RoadDragPreview?.clear?.();
      dragState.usingCanvasRoadPreview = false;
    }
    const element = ensureRoadControlPreview(dragState);
    if (!element) return;
    if (!dragState.roadMovePreviewReady) {
      if (!applyRoadPreviewPath(element, dragState, model, adapter)) return;
      dragState.roadMovePreviewReady = true;
    }
    const transform = `translate(${dragState.totalDx || 0} ${dragState.totalDy || 0})`;
    if (element.getAttribute("transform") !== transform) element.setAttribute("transform", transform);
  }

  function previewControlHandles(dragState) {
    if (!dragState) return [];
    if (!dragState.previewControlHandles) {
      dragState.previewControlHandles = Array.from(
        manager.canvas.querySelectorAll("#editorEditLayer .editor-object-cp:not(.editor-group-cp)")
      );
    }
    return dragState.previewControlHandles.filter((handle) => handle.isConnected);
  }

  function updatePreviewControlHandles(dragState, model, adapter, metricsValue) {
    if (!model || !adapter) return;
    const metrics = metricsValue || controlPoints.metrics();
    const activeCpId = String(dragState?.cpId || "");
    if (dragState?.liveRoadControlPreview && activeCpId) {
      const handles = previewControlHandles(dragState);
      const handle = handles.find((item) => String(item.dataset.point || "") === activeCpId);
      let cp = typeof adapter.getPreviewControlPoint === "function"
        ? adapter.getPreviewControlPoint(model, metrics, activeCpId)
        : null;
      if (!cp && typeof adapter.getPreviewControlPoints === "function") {
        cp = (adapter.getPreviewControlPoints(model, metrics) || []).find((item) => String(item.id) === activeCpId) || null;
      }
      if (handle && cp) {
        const rotation = Number.isFinite(cp.angle) ? ` rotate(${cp.angle})` : "";
        handle.setAttribute("transform", `translate(${cp.x} ${cp.y})${rotation}`);
        if (cp.cursor) handle.style.cursor = cp.cursor;
        return;
      }
    }
    if (typeof adapter.getControlPoints !== "function") return;
    const cps = (dragState?.liveRoadControlPreview && typeof adapter.getPreviewControlPoints === "function")
      ? adapter.getPreviewControlPoints(model, metrics)
      : adapter.getControlPoints(model, metrics, "edit");
    const cpById = new Map(cps.map((cp) => [String(cp.id), cp]));
    previewControlHandles(dragState).forEach((handle) => {
      const cp = cpById.get(String(handle.dataset.point || ""));
      if (!cp) return;
      const rotation = Number.isFinite(cp.angle) ? ` rotate(${cp.angle})` : "";
      handle.setAttribute("transform", `translate(${cp.x} ${cp.y})${rotation}`);
      if (cp.cursor) handle.style.cursor = cp.cursor;
    });
  }

  function updateRoadControlPreview(dragState, model, adapter) {
    hideLiveRoadObjectSource(dragState);
    if (dragState?.liveRoadControlPreview) {
      if (isIslandRoad(model, adapter) && updateIslandCirclePreview(dragState, model)) {
        if (dragState.usingCanvasRoadPreview) Kroki.RoadDragPreview?.clear?.();
        dragState.usingCanvasRoadPreview = false;
        updatePreviewControlHandles(dragState, model, adapter, dragState.metrics);
        return;
      }
      if (adapter.controlPreviewPointOnly?.(model, dragState.cpId)) {
        if (dragState.usingCanvasRoadPreview) Kroki.RoadDragPreview?.clear?.();
        dragState.usingCanvasRoadPreview = false;
        dragState.roadControlPreviewElement?.remove();
        dragState.roadControlPreviewElement = null;
        updatePreviewControlHandles(dragState, model, adapter, dragState.metrics);
        return;
      }
      if (dragState.usingCanvasRoadPreview) {
        Kroki.RoadDragPreview?.clear?.();
        dragState.usingCanvasRoadPreview = false;
      }
      const element = ensureRoadControlPreview(dragState);
      if (!element) return;
      if (!applyRoadPreviewPath(element, dragState, model, adapter)) return;
      updatePreviewControlHandles(dragState, model, adapter, dragState.metrics);
      return;
    }
    if (Kroki.RoadDragPreview?.update?.(manager.canvas, model, adapter)) {
      dragState.usingCanvasRoadPreview = true;
      dragState.roadControlPreviewElement?.remove();
      dragState.roadControlPreviewElement = null;
      updatePreviewControlHandles(dragState, model, adapter, dragState.metrics);
      return;
    }
    if (dragState.usingCanvasRoadPreview) {
      Kroki.RoadDragPreview?.clear?.();
      dragState.usingCanvasRoadPreview = false;
    }
    const element = ensureRoadControlPreview(dragState);
    if (!element) return;
    if (!applyRoadPreviewPath(element, dragState, model, adapter)) return;
    updatePreviewControlHandles(dragState, model, adapter, dragState.metrics);
  }

  function clearRoadControlPreview(dragState, options = {}) {
    if (dragState?.usingCanvasRoadPreview) Kroki.RoadDragPreview?.clear?.();
    dragState?.roadControlPreviewElement?.remove();
    if (options.restoreSource !== false) restoreLiveRoadObjectSource(dragState);
    if (dragState) {
      dragState.roadControlPreviewElement = null;
      dragState.previewControlHandles = null;
      dragState.usingCanvasRoadPreview = false;
    }
  }

  function beginDrag(type, event, extra = {}) {
    const matrix = screenMatrix();
    const point = pointFromEvent(event, matrix);
    const model = getActiveModel();
    const adapter = manager.getAdapter(model);
    const metricSnapshot = type === "control" ? controlPoints.metrics() : null;
    const liveRoadObjectPreview = false;
    const liveTransform = type === "object" && typeof adapter?.move === "function";
    const liveRoadControlPreview = type === "control" && model?.type === "road" && typeof adapter?.moveControlPoint === "function";
    const liveLineControlPreview = type === "control" && model?.type === "line" && typeof adapter?.moveControlPoint === "function";
    if (model?.type === "road") Kroki.RoadIntersectionEngine?.setSuspended?.(true, liveRoadObjectPreview ? undefined : (liveTransform || liveRoadControlPreview ? { clear: false } : undefined));
    drag = {
      type,
      pointerId: event.pointerId,
      captureTarget: extra.captureTarget || event.currentTarget || manager.canvas,
      screenMatrix: matrix,
      metrics: metricSnapshot,
      lastPoint: point,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: !(extra.clearOnTap || extra.editTapPoint),
      clearOnTap: Boolean(extra.clearOnTap),
      cpId: extra.cpId || "",
      editTapPoint: extra.editTapPoint || null,
      startState: type === "control" ? (adapter?.beginControlPointMove?.(model, extra.cpId, point, metricSnapshot) || null) : null,
      liveTransform,
      liveRoadObjectPreview,
      liveRoadControlPreview,
      liveLineControlPreview,
      previewModel: liveRoadControlPreview || liveRoadObjectPreview || liveLineControlPreview ? utils.clonePlain(model) : null,
      lineElement: liveLineControlPreview ? manager.getElement(model.id) : null,
      lineSelectionElement: liveLineControlPreview ? manager.canvas.querySelector("#editorEditLayer [data-selection-type='line']") : null,
      roadControlPreviewElement: null,
      usingCanvasRoadPreview: false,
      roadMovePreviewReady: false,
      previewNeedsFinalize: false,
      previewControlHandles: null,
      totalDx: 0,
      totalDy: 0,
      pendingPoint: null,
      pendingFrame: 0,
      pendingFrameIsTimeout: false,
      liveTransformTargets: liveTransform && model?.type !== "road" ? liveTransformTargetsFor(model.id) : [],
      hiddenRoadSource: null,
      modelId: model.id,
      historyLabel: type === "control" ? "Geometri duzenle" : "Nesne tasi",
      transaction: null,
      historyDisabled: false
    };
    try {
      drag.captureTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      try {
        manager.canvas.setPointerCapture?.(event.pointerId);
        drag.captureTarget = manager.canvas;
      } catch {
        drag.captureTarget = null;
      }
    }
  }

  function startControlPointDrag(event, cpId) {
    if (!activeId) return;
    if (window.krokiEditorCamera?.isGestureActive?.() || window.krokiEditorCamera?.isPanRequested?.()) return;
    promoteToEdit();
    beginDrag("control", event, { cpId, captureTarget: manager.canvas });
    event.stopImmediatePropagation?.();
    event.stopPropagation();
    event.preventDefault();
  }

  function startObjectDrag(event) {
    promoteToEdit();
    beginDrag("object", event);
    event.stopImmediatePropagation?.();
    event.stopPropagation();
    event.preventDefault();
  }

  function handleVehicleControlPointPointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (window.krokiEditorCamera?.isGestureActive?.() || window.krokiEditorCamera?.isPanRequested?.()) return;
    const handle = event.target?.closest?.(".editor-object-cp:not(.editor-group-cp)");
    const cpId = handle?.dataset?.point || "";
    if (!cpId) return;
    if (getActiveModel()?.type !== "vehicle") return;
    startControlPointDrag(event, cpId);
  }

  function handlePointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (window.krokiEditorCamera?.isGestureActive?.() || window.krokiEditorCamera?.isPanRequested?.()) return;
    if (window.krokiEditorState?.isBlockingOverlayOpen?.()) {
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    if (activeId && mode === "edit") {
      const activeModel = getActiveModel();
      const activeAdapter = manager.getAdapter(activeModel);
      const multiSelectMayHandle = Boolean(
        event.ctrlKey ||
        event.shiftKey ||
        Kroki.MultiSelectManager?.hasSelection?.() ||
        Kroki.MultiSelectManager?.getActiveGroupId?.()
      );
      const needsEditTapHit = typeof activeAdapter?.handleEditTap === "function";
      const point = needsEditTapHit || multiSelectMayHandle ? pointFromEvent(event) : null;
      const hit = needsEditTapHit || multiSelectMayHandle ? hitTest.hitTest(point) : null;

      if (multiSelectMayHandle && Kroki.MultiSelectManager?.handlePointerDown?.(event, hit)) return;

      beginDrag("object", event, {
        editTapPoint: hit?.model?.id === activeId && needsEditTapHit ? point : null
      });
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    const point = pointFromEvent(event);
    const hit = hitTest.hitTest(point);

    if (Kroki.MultiSelectManager?.handlePointerDown?.(event, hit)) return;

    if (!hit) {
      clear();
      return;
    }

    if (hit.model.id === activeId) {
      if (mode === "preselect") {
        event.stopImmediatePropagation?.();
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      startObjectDrag(event);
      return;
    }

    if (window.krokiEditorState?.getActiveTool?.()) return;

    select(hit.model.id, "preselect");
    event.stopImmediatePropagation?.();
    event.stopPropagation();
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (Kroki.MultiSelectManager?.handlePointerMove?.(event)) return;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (window.krokiEditorCamera?.isGestureActive?.()) {
      cancelDrag();
      return;
    }

    const point = pointFromEvent(event, drag.screenMatrix);
    const model = getActiveModel();
    const adapter = manager.getAdapter(model);
    if (!model || !adapter) return;

    if (!drag.moved) {
      const movedEnough = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) >= DRAG_START_THRESHOLD_PX;
      if (!movedEnough) {
        event.preventDefault();
        return;
      }
      drag.moved = true;
    }

    queueDragPoint(point);
    event.preventDefault();
  }

  function stopDrag(event) {
    if (!drag) return;
    const pointerId = event?.pointerId ?? drag.pointerId;
    const shouldClear = drag.clearOnTap && !drag.moved;
    if (pointerId != null && drag.captureTarget?.hasPointerCapture?.(pointerId)) {
      drag.captureTarget.releasePointerCapture(pointerId);
    } else if (pointerId != null && manager.canvas.hasPointerCapture?.(pointerId)) {
      manager.canvas.releasePointerCapture(pointerId);
    }
    if (drag.moved) {
      if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
        drag.pendingPoint = pointFromEvent(event, drag.screenMatrix);
      }
      flushQueuedDragPoint(drag);
    }
    if (!drag.moved && drag.editTapPoint) {
      const model = getActiveModel();
      const adapter = manager.getAdapter(model);
      if (adapter?.handleEditTap?.(model, drag.editTapPoint)) sync();
    }
    const wasRoadDrag = getActiveModel()?.type === "road";
    if (drag.liveRoadControlPreview || drag.liveRoadObjectPreview) {
      const model = getActiveModel();
      const previewModel = drag.previewModel;
      const restoreAfterUpdate = drag.liveRoadObjectPreview && drag.moved && model && previewModel;
      clearRoadControlPreview(drag, { restoreSource: !restoreAfterUpdate });
      if (drag.moved && model && previewModel) {
        if (drag.previewNeedsFinalize) manager.getAdapter(model)?.finalizePreviewControlPoint?.(previewModel, drag.cpId);
        ensureDragTransaction(drag);
        try {
          manager.updateModel(model.id, () => previewModel, {
            skipHistory: true,
            controlPoints: false,
            styleControls: false
          });
        } finally {
          restoreLiveRoadObjectSource(drag);
        }
        if (drag.liveRoadObjectPreview) controlPoints.sync();
      }
    }
    if (drag.liveLineControlPreview) {
      const model = getActiveModel();
      const previewModel = drag.previewModel;
      if (drag.moved && model && previewModel) {
        ensureDragTransaction(drag);
        manager.updateModel(model.id, () => previewModel, {
          skipHistory: true,
          controlPoints: false,
          styleControls: false
        });
      }
    }
    if (drag.liveTransform) {
      const model = getActiveModel();
      const adapter = manager.getAdapter(model);
      const dx = drag.totalDx || 0;
      const dy = drag.totalDy || 0;
      if (drag.roadControlPreviewElement || drag.usingCanvasRoadPreview) {
        clearRoadControlPreview(drag, { restoreSource: false });
      }
      clearLiveTransform(drag);
      if (drag.moved && model && typeof adapter?.move === "function" && Math.hypot(dx, dy) > 0.001) {
        ensureDragTransaction(drag);
        manager.updateGeometry(model.id, (draft) => {
          adapter.move(draft, dx, dy);
        }, { skipHistory: true });
      }
    }
    if (drag.moved && drag.type === "control") {
      const model = getActiveModel();
      if (model) {
        if (!drag.liveRoadControlPreview && !drag.liveLineControlPreview) manager.renderGeometry?.(model.id);
        controlPoints.sync();
      }
    }
    if (drag.moved && drag.transaction?.kind === "object-change") {
      Kroki.HistoryManager?.commitObjectChange?.(drag.transaction, drag.historyLabel, { assumeChanged: true });
    } else if (drag.moved && drag.transaction) {
      Kroki.HistoryManager?.commit?.(drag.transaction, drag.historyLabel, { assumeChanged: true, ownSnapshots: true });
    }
    cancelQueuedDragFrame(drag);
    drag = null;
    if (shouldClear) clear();
    if (wasRoadDrag) {
      Kroki.RoadIntersectionEngine?.setSuspended?.(false);
      Kroki.StyleManager?.syncControls?.();
    }
  }

  function cancelDrag() {
    stopDrag({ pointerId: drag?.pointerId });
  }

  function deleteSelectedBarrier() {
    const model = getActiveModel();
    const adapter = manager.getAdapter(model);
    const barrier = adapter?.selectedBarrierInfo?.(model);
    if (!barrier || typeof adapter?.removeBarrierFromConfig !== "function") return false;
    manager.updateModel(model.id, (draft) => {
      const draftAdapter = manager.getAdapter(draft);
      const config = draftAdapter?.roadConfig?.(draft, draft.metadata?.road) || draft.metadata?.road || {};
      const selected = draftAdapter?.selectedBarrierInfo?.(draft);
      if (!draftAdapter?.removeBarrierFromConfig?.(draft, config, selected?.id || barrier.id)) return draft;
      return {
        ...draft,
        metadata: {
          ...(draft.metadata || {}),
          road: draftAdapter?.roadConfig?.(draft, config) || config
        }
      };
    }, { label: "Yol bariyeri sil" });
    sync();
    return true;
  }

  function deleteActive(event) {
    event?.stopPropagation();
    event?.preventDefault();
    if (Kroki.MultiSelectManager?.hasSelection?.()) {
      Kroki.MultiSelectManager.deleteSelected();
      window.krokiEditorRail?.resetCizimAraci?.();
      return;
    }
    if (!activeId) return;
    if (deleteSelectedBarrier()) return;
    const id = activeId;
    clear();
    manager.remove(id);
    window.krokiEditorRail?.resetCizimAraci?.();
  }

  function copyActive(event) {
    event?.stopPropagation();
    event?.preventDefault();
    if (Kroki.MultiSelectManager?.hasSelection?.()) {
      Kroki.MultiSelectManager.copySelected();
      return;
    }
    if (!activeId) return;
    promoteToEdit();
    const copy = manager.clone(activeId);
    if (copy) select(copy.id, "edit");
  }

  function bringActiveToFront(event) {
    event?.stopPropagation();
    event?.preventDefault();
    if (Kroki.MultiSelectManager?.hasSelection?.()) {
      Kroki.MultiSelectManager.bringToFront();
      return;
    }
    if (!activeId) return;
    promoteToEdit();
    manager.bringToFront(activeId);
    sync();
  }

  function sendActiveToBack(event) {
    event?.stopPropagation();
    event?.preventDefault();
    if (Kroki.MultiSelectManager?.hasSelection?.()) {
      Kroki.MultiSelectManager.sendToBack();
      return;
    }
    if (!activeId) return;
    promoteToEdit();
    manager.sendToBack(activeId);
    sync();
  }

  function finishEdit(event) {
    event?.stopPropagation();
    event?.preventDefault();
    Kroki.MultiSelectManager?.clear?.();
    clear();
    window.krokiEditorRail?.resetCizimAraci?.();
  }

  function promoteActiveInteraction() {
    if (Kroki.MultiSelectManager?.hasSelection?.()) Kroki.MultiSelectManager.promoteToEdit?.();
    else promoteToEdit();
  }

  function bindButtons() {
    const buttons = window.krokiObjectEditCore?.buttons || {};
    buttons.done?.addEventListener("click", finishEdit);
    buttons.copy?.addEventListener("click", copyActive);
    buttons.group?.addEventListener("click", (event) => {
      event?.stopPropagation();
      event?.preventDefault();
      Kroki.MultiSelectManager?.createGroup?.();
    });
    buttons.ungroup?.addEventListener("click", (event) => {
      event?.stopPropagation();
      event?.preventDefault();
      Kroki.MultiSelectManager?.ungroup?.();
    });
    buttons.bringForward?.addEventListener("click", bringActiveToFront);
    buttons.sendBackward?.addEventListener("click", sendActiveToBack);
    buttons.delete?.addEventListener("click", deleteActive);
    window.krokiObjectEditCore?.topIp?.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".top-ip-btn")) promoteActiveInteraction();
    }, true);
    window.krokiObjectEditCore?.sideIp?.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".side-ip-btn, .side-ip-control")) promoteActiveInteraction();
    }, true);
  }

  manager.canvas.addEventListener("pointerdown", handlePointerDown);
  manager.canvas.addEventListener("pointerdown", handleVehicleControlPointPointerDown, true);
  manager.canvas.addEventListener("pointermove", handlePointerMove);
  manager.canvas.addEventListener("pointerup", (event) => {
    if (!Kroki.MultiSelectManager?.stopDrag?.(event)) stopDrag(event);
  });
  manager.canvas.addEventListener("pointercancel", (event) => {
    if (!Kroki.MultiSelectManager?.stopDrag?.(event)) stopDrag(event);
  });
  window.addEventListener("kroki:camera-gesture-start", cancelDrag);
  window.addEventListener("blur", cancelDrag);
  window.addEventListener("resize", sync);
  manager.canvas.addEventListener("kroki:viewboxchange", syncViewport);
  manager.canvas.addEventListener("lostpointercapture", (event) => {
    if (drag && drag.pointerId === event.pointerId) stopDrag(event);
  });
  bindButtons();

  Kroki.SelectionManager = {
    select,
    edit(id) {
      select(id, "edit");
    },
    preselect(id) {
      select(id, "preselect");
    },
    clear,
    promoteToEdit,
    sync,
    getActiveId() {
      return activeId;
    },
    getMode() {
      return mode;
    },
    getActiveModel,
    getState() {
      return activeId && manager.get(activeId) ? { id: activeId, mode } : { id: "", mode: "" };
    },
    restoreState(state) {
      if (state?.id && manager.get(state.id)) select(state.id, state.mode || "preselect");
      else clear();
    }
  };
})();
