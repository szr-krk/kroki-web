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
  const DRAG_START_THRESHOLD_PX = 3;

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
      return;
    }
    showPanels();
    controlPoints.show(activeId, mode, { onControlPointDown: startControlPointDrag });
    Kroki.StyleManager?.syncControls?.();
    setEditorState();
  }

  function resetPointEdit(id = activeId) {
    const model = manager.get(id);
    const adapter = manager.getAdapter(model);
    const shouldResetPointEdit = Boolean(model?.metadata?.pointEdit && adapter?.capabilities?.pointEdit);
    const shouldResetRoadSelection = Boolean(model?.metadata?.roadSelection && adapter?.capabilities?.roadObject);
    const shouldResetRoadBoundaryEdit = Boolean(model?.metadata?.roadBoundaryEdit && adapter?.capabilities?.roadObject);
    if (!shouldResetPointEdit && !shouldResetRoadSelection && !shouldResetRoadBoundaryEdit) return;
    manager.updateModel(id, (draft) => {
      const metadata = { ...(draft.metadata || {}) };
      if (shouldResetPointEdit) metadata.pointEdit = false;
      if (shouldResetRoadSelection) delete metadata.roadSelection;
      if (shouldResetRoadBoundaryEdit) delete metadata.roadBoundaryEdit;
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

  function beginDrag(type, event, extra = {}) {
    const point = utils.pointFromEvent(manager.canvas, event);
    const model = getActiveModel();
    const adapter = manager.getAdapter(model);
    drag = {
      type,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget || manager.canvas,
      lastPoint: point,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: !(extra.clearOnTap || extra.editTapPoint),
      clearOnTap: Boolean(extra.clearOnTap),
      cpId: extra.cpId || "",
      editTapPoint: extra.editTapPoint || null,
      startState: adapter?.beginControlPointMove?.(model, extra.cpId, point, controlPoints.metrics()) || null,
      transaction: Kroki.HistoryManager?.begin?.(type === "control" ? "Geometri duzenle" : "Nesne tasi")
    };
    try {
      drag.captureTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      manager.canvas.setPointerCapture?.(event.pointerId);
      drag.captureTarget = manager.canvas;
    }
  }

  function startControlPointDrag(event, cpId) {
    if (!activeId) return;
    if (window.krokiEditorCamera?.isGestureActive?.() || window.krokiEditorCamera?.isPanRequested?.()) return;
    promoteToEdit();
    beginDrag("control", event, { cpId });
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

  function handlePointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (window.krokiEditorCamera?.isGestureActive?.() || window.krokiEditorCamera?.isPanRequested?.()) return;
    if (window.krokiEditorState?.isBlockingOverlayOpen?.()) {
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    const point = utils.pointFromEvent(manager.canvas, event);
    const hit = hitTest.hitTest(point);

    if (Kroki.MultiSelectManager?.handlePointerDown?.(event, hit)) return;

    if (activeId && mode === "edit") {
      const activeModel = getActiveModel();
      const activeAdapter = manager.getAdapter(activeModel);
      beginDrag("object", event, {
        editTapPoint: hit?.model?.id === activeId && typeof activeAdapter?.handleEditTap === "function" ? point : null
      });
      event.stopImmediatePropagation?.();
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    if (!hit) {
      clear();
      return;
    }

    if (hit.model.id === activeId) {
      if (mode === "preselect") {
        select(activeId, "edit");
        beginDrag("object", event);
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

    const point = utils.pointFromEvent(manager.canvas, event);
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

    if (drag.type === "object") {
      const dx = point.x - drag.lastPoint.x;
      const dy = point.y - drag.lastPoint.y;
      manager.updateGeometry(model.id, (draft) => {
        adapter.move(draft, dx, dy);
      }, { skipHistory: true });
      drag.lastPoint = point;
      event.preventDefault();
      return;
    }

    if (drag.type === "control") {
      manager.updateGeometry(model.id, (draft) => {
        adapter.moveControlPoint(draft, drag.cpId, point, {
          startState: drag.startState,
          lastPoint: drag.lastPoint,
          metrics: controlPoints.metrics()
        });
      }, { skipHistory: true });
      drag.lastPoint = point;
      event.preventDefault();
    }
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
    if (!drag.moved && drag.editTapPoint) {
      const model = getActiveModel();
      const adapter = manager.getAdapter(model);
      if (adapter?.handleEditTap?.(model, drag.editTapPoint)) sync();
    }
    if (drag.moved) Kroki.HistoryManager?.commit?.(drag.transaction, drag.type === "control" ? "Geometri duzenle" : "Nesne tasi");
    drag = null;
    if (shouldClear) clear();
  }

  function cancelDrag() {
    stopDrag({ pointerId: drag?.pointerId });
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
  manager.canvas.addEventListener("kroki:viewboxchange", sync);
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
