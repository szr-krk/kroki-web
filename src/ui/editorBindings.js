(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  if (!utils || !manager || !selection) return;

  let draft = null;
  let closedShapeDraftId = "";
  let closedShapeHistory = null;
  let closedShapeTap = null;
  const closedShapeDraftStyle = { fill: "#d1d5db", fillOpacity: 0.45 };
  const TAP_MOVE_LIMIT_PX = 10;
  const closedShapePanel = document.querySelector("#closedShapeDraftPanel");
  const closedShapeCloseButton = document.querySelector("#btnClosedShapeDraftClose");
  const closedShapeCancelButton = document.querySelector("#btnClosedShapeDraftCancel");

  function canvasPoint(event) {
    return utils.pointFromEvent(manager.canvas, event);
  }

  function toolToType(tool) {
    if (tool === "cizgi") return "line";
    if (tool === "arc") return "arc";
    if (tool === "curve" || tool === "cubic") return "bezier";
    if (tool === "daire") return "circle";
    if (tool === "elips") return "ellipse";
    if (tool === "dikdortgen") return "rectangle";
    if (tool === "kapali") return "closedShape";
    if (tool === "olcu") return "callout";
    return "";
  }

  function snapEnd(start, point, type) {
    if (type === "circle" || type === "ellipse" || type === "rectangle" || type === "closedShape" || type === "callout") return point;
    return Kroki.LineSnap?.snapPoint?.(start, point) || point;
  }

  function defaultBezierControls(start, end, bezierType) {
    const lerp = (t) => ({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t
    });
    if (bezierType === "cubic") return { c1: lerp(1 / 3), c2: lerp(2 / 3) };
    return { q: lerp(0.5) };
  }

  function createDraftModel(type, start, tool) {
    const options = { skipHistory: true };
    if (type === "line") return manager.create("line", { start, end: start }, options);
    if (type === "arc") return manager.create("arc", { start, end: start }, options);
    if (type === "bezier") {
      return manager.create("bezier", {
        start,
        end: start,
        bezierType: tool === "cubic" ? "cubic" : "quadratic"
      }, options);
    }
    if (type === "circle") return manager.create("circle", { start, end: start }, options);
    if (type === "ellipse") return manager.create("ellipse", { start, end: start }, options);
    if (type === "rectangle") return manager.create("rectangle", { start, end: start }, options);
    if (type === "callout") return manager.create("callout", { start, end: start, metadata: { draft: true } }, options);
    return null;
  }

  function closedShapeDraftModel() {
    return closedShapeDraftId ? manager.get(closedShapeDraftId) : null;
  }

  function syncClosedShapePanel() {
    const model = closedShapeDraftModel();
    const visible = Boolean(model);
    closedShapePanel?.classList.toggle("gizli", !visible);
    if (closedShapeCloseButton) closedShapeCloseButton.disabled = !model || model.geometry.points.length < 3;
  }

  function clearClosedShapeTap() {
    if (closedShapeTap?.pointerId != null && manager.canvas.hasPointerCapture?.(closedShapeTap.pointerId)) {
      manager.canvas.releasePointerCapture(closedShapeTap.pointerId);
    }
    closedShapeTap = null;
  }

  function cancelClosedShapeDraft(options = {}) {
    clearClosedShapeTap();
    const id = closedShapeDraftId;
    closedShapeDraftId = "";
    closedShapeHistory = null;
    if (id) manager.remove(id, { skipHistory: true });
    syncClosedShapePanel();
    if (options.resetTool !== false) window.krokiEditorRail?.resetCizimAraci?.();
  }

  function ensureClosedShapeDraft(point) {
    if (closedShapeDraftId && manager.get(closedShapeDraftId)) return closedShapeDraftId;
    closedShapeHistory = Kroki.HistoryManager?.begin?.("Kapali sekil ekle") || null;
    const model = manager.create("closedShape", {
      points: [point],
      closed: false,
      style: closedShapeDraftStyle,
      metadata: { draft: true }
    }, { skipHistory: true });
    closedShapeDraftId = model?.id || "";
    syncClosedShapePanel();
    return closedShapeDraftId;
  }

  function addClosedShapePoint(point) {
    const id = closedShapeDraftId || ensureClosedShapeDraft(point);
    if (!id) return;
    const model = manager.get(id);
    const adapter = manager.getAdapter(model);
    if (!model || !adapter) return;
    if (model.geometry.points.length === 1 && Math.hypot(model.geometry.points[0].x - point.x, model.geometry.points[0].y - point.y) < 0.001) {
      syncClosedShapePanel();
      return;
    }
    manager.updateModel(id, (draftModel) => {
      adapter.appendPoint(draftModel, point);
      return draftModel;
    }, { controlPoints: false, styleControls: false, skipHistory: true });
    syncClosedShapePanel();
  }

  function closeClosedShapeDraft(event) {
    event?.stopPropagation();
    event?.preventDefault();
    const id = closedShapeDraftId;
    const model = manager.get(id);
    const adapter = manager.getAdapter(model);
    if (!model || !adapter || model.geometry.points.length < 3) return;
    manager.updateModel(id, (draftModel) => {
      adapter.closeShape(draftModel);
      return draftModel;
    }, { controlPoints: false, skipHistory: true });
    closedShapeDraftId = "";
    clearClosedShapeTap();
    syncClosedShapePanel();
    selection.edit(id);
    window.krokiEditorRail?.resetCizimAraci?.();
    if (closedShapeHistory) Kroki.HistoryManager?.commit?.(closedShapeHistory, "Kapali sekil ekle");
    closedShapeHistory = null;
  }

  function startClosedShapeTap(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (window.krokiEditorCamera?.isGestureActive?.() || window.krokiEditorCamera?.isPanRequested?.()) return;
    if (window.krokiEditorState?.isBlockingOverlayOpen?.()) return;
    closedShapeTap = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false
    };
    manager.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveClosedShapeTap(event) {
    if (!closedShapeTap || closedShapeTap.pointerId !== event.pointerId) return false;
    if (Math.hypot(event.clientX - closedShapeTap.startClientX, event.clientY - closedShapeTap.startClientY) > TAP_MOVE_LIMIT_PX) {
      closedShapeTap.moved = true;
    }
    event.preventDefault();
    return true;
  }

  function finishClosedShapeTap(event) {
    if (!closedShapeTap || closedShapeTap.pointerId !== event.pointerId) return false;
    const wasTap = !closedShapeTap.moved;
    clearClosedShapeTap();
    if (wasTap) {
      const point = canvasPoint(event);
      if (closedShapeDraftId) addClosedShapePoint(point);
      else ensureClosedShapeDraft(point);
    }
    event.preventDefault();
    return true;
  }

  function updateDraftGeometry(point) {
    if (!draft) return;
    const end = snapEnd(draft.start, point, draft.type);

    manager.updateGeometry(draft.model.id, (model) => {
      if (draft.type === "line" || draft.type === "arc") {
        model.geometry.end = { x: end.x, y: end.y };
      } else if (draft.type === "bezier") {
        model.geometry.end = { x: end.x, y: end.y };
        Object.assign(model.geometry, defaultBezierControls(model.geometry.start, model.geometry.end, model.geometry.bezierType));
      } else if (draft.type === "circle") {
        model.geometry = Kroki.CircleGeometry.fromDiameter(draft.start, point, model.geometry.rotation);
      } else if (draft.type === "ellipse") {
        model.geometry = Kroki.EllipseGeometry.fromBounds(draft.start, point, model.geometry.rotation);
      } else if (draft.type === "rectangle") {
        model.geometry = Kroki.RectangleGeometry.fromBounds(draft.start, point, model.geometry.rotation);
      } else if (draft.type === "callout") {
        model.geometry.center = { x: end.x, y: end.y };
        model.geometry.tip = { x: draft.start.x, y: draft.start.y };
      }
    }, { controlPoints: false, skipHistory: true });
  }

  function releaseCapture(pointerId) {
    if (pointerId != null && manager.canvas.hasPointerCapture?.(pointerId)) {
      manager.canvas.releasePointerCapture(pointerId);
    }
  }

  function cancelDraft() {
    if (!draft) return;
    const id = draft.model.id;
    releaseCapture(draft.pointerId);
    draft = null;
    manager.remove(id, { skipHistory: true });
  }

  function startDraft(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (window.krokiEditorCamera?.isGestureActive?.() || window.krokiEditorCamera?.isPanRequested?.()) return;
    if (window.krokiEditorState?.isBlockingOverlayOpen?.()) return;
    if (window.krokiEditorState?.getEditMode?.()) return;
    if (draft) return;

    const tool = window.krokiEditorState?.getActiveTool?.() || "";
    const type = toolToType(tool);
    if (!type) return;
    if (type === "closedShape") {
      startClosedShapeTap(event);
      return;
    }

    const start = canvasPoint(event);
    const transaction = Kroki.HistoryManager?.begin?.("Nesne ekle") || null;
    const model = createDraftModel(type, start, tool);
    if (!model) return;

    draft = {
      type,
      tool,
      start,
      model,
      pointerId: event.pointerId,
      transaction
    };
    manager.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDraft(event) {
    if (moveClosedShapeTap(event)) return;
    if (!draft || draft.pointerId !== event.pointerId) return;
    if (window.krokiEditorCamera?.isGestureActive?.()) {
      cancelDraft();
      return;
    }
    updateDraftGeometry(canvasPoint(event));
    event.preventDefault();
  }

  function finishDraft(event) {
    if (finishClosedShapeTap(event)) return;
    if (!draft || draft.pointerId !== event.pointerId) return;
    if (window.krokiEditorCamera?.isGestureActive?.()) {
      cancelDraft();
      return;
    }

    const end = canvasPoint(event);
    updateDraftGeometry(end);
    releaseCapture(event.pointerId);

    const tooSmall = Math.hypot(end.x - draft.start.x, end.y - draft.start.y) < 2;
    const id = draft.model.id;
    const type = draft.type;
    const transaction = draft.transaction;
    draft = null;

    if (tooSmall) {
      manager.remove(id, { skipHistory: true });
      return;
    }

    if (type === "callout") {
      manager.updateModel(id, (model) => ({
        ...model,
        metadata: { ...(model.metadata || {}), draft: false }
      }), { controlPoints: false, skipHistory: true });
    }

    selection.edit(id);
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Nesne ekle");
    event.preventDefault();
  }

  window.addEventListener("kroki:camera-gesture-start", () => {
    cancelDraft();
    clearClosedShapeTap();
  });
  window.addEventListener("kroki:active-tool-change", (event) => {
    if (event.detail?.tool !== "kapali" && closedShapeDraftId) cancelClosedShapeDraft({ resetTool: false });
  });
  closedShapeCloseButton?.addEventListener("click", closeClosedShapeDraft);
  closedShapeCancelButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    cancelClosedShapeDraft();
  });
  manager.canvas.addEventListener("pointerdown", startDraft);
  manager.canvas.addEventListener("pointermove", moveDraft);
  manager.canvas.addEventListener("pointerup", finishDraft);
  manager.canvas.addEventListener("pointercancel", cancelDraft);

  manager.syncFromDom();
  Kroki.StyleManager.init({ manager, selection });
})();
