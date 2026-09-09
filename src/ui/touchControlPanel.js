(() => {
  const canvas = document.querySelector("#editorCanvas");
  const dock = document.querySelector("#touchControlDock");
  const panel = document.querySelector("#touchControlPanel");
  const zoomValue = document.querySelector("#touchControlZoomValue");
  const restoreButton = document.querySelector("#btnTouchControlRestore");
  const actionButtons = Array.from(document.querySelectorAll("[data-touch-action]"));
  if (!canvas || !dock || !panel || !zoomValue || !restoreButton || !actionButtons.length) return;

  const HOLD_DELAY_MS = 420;
  const REPEAT_INTERVAL_MS = 110 / 3;
  const INACTIVITY_MS = 5000;
  const movementByAction = {
    "move-up": { dx: 0, dy: -1 },
    "move-right": { dx: 1, dy: 0 },
    "move-down": { dx: 0, dy: 1 },
    "move-left": { dx: -1, dy: 0 }
  };

  let activePress = null;
  let inactivityTimer = 0;
  const lastPointerActivation = new WeakMap();

  function currentZoomPercent() {
    const scale = Number(window.krokiEditorCamera?.getScale?.(canvas));
    return Number.isFinite(scale) ? scale * 100 : 100;
  }

  function formatPercent(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
  }

  function renderZoomValue() {
    zoomValue.value = `Zoom: %${formatPercent(currentZoomPercent())}`;
    zoomValue.textContent = zoomValue.value;
  }

  function resolveMoveTarget() {
    const Kroki = window.Kroki || {};
    const multi = Kroki.MultiSelectManager;
    const multiIds = multi?.hasSelection?.() ? (multi.getSelectedIds?.() || []) : [];
    if (multiIds.length) {
      return {
        kind: "multi",
        ids: multiIds.slice(),
        transaction: Kroki.HistoryManager?.begin?.("Seçimi hassas taşı") || null,
        changed: false
      };
    }

    const selection = Kroki.SelectionManager;
    const id = selection?.getActiveId?.() || "";
    const mode = selection?.getMode?.() || "";
    if (id && (mode === "preselect" || mode === "edit")) {
      const model = Kroki.EditorObjectManager?.get?.(id);
      const adapter = Kroki.EditorObjectManager?.getAdapter?.(model);
      return {
        kind: typeof adapter?.move === "function" ? "single" : "blocked",
        id,
        transaction: typeof adapter?.move === "function"
          ? (Kroki.HistoryManager?.beginObjectChange?.(id, "Nesneyi hassas taşı") || null)
          : null,
        changed: false
      };
    }

    return { kind: "camera", changed: false };
  }

  function sameMultiSelection(target) {
    const ids = window.Kroki?.MultiSelectManager?.getSelectedIds?.() || [];
    return ids.length === target.ids.length && target.ids.every((id) => ids.includes(id));
  }

  function moveTarget(target, dx, dy) {
    const Kroki = window.Kroki || {};
    if (target.kind === "camera") {
      window.krokiEditorCamera?.panByWorld?.(canvas, dx, dy);
      return true;
    }
    if (target.kind === "blocked") return false;

    if (target.kind === "multi") {
      if (!sameMultiSelection(target)) return false;
      Kroki.MultiSelectManager?.moveSelected?.(dx, dy);
      target.changed = true;
      return true;
    }

    const selection = Kroki.SelectionManager;
    if (selection?.getActiveId?.() !== target.id || !["preselect", "edit"].includes(selection?.getMode?.())) return false;
    const model = Kroki.EditorObjectManager?.get?.(target.id);
    const adapter = Kroki.EditorObjectManager?.getAdapter?.(model);
    if (!model || typeof adapter?.move !== "function") return false;

    Kroki.EditorObjectManager.updateGeometry(target.id, (draft) => adapter.move(draft, dx, dy), { skipHistory: true });
    target.changed = true;
    return true;
  }

  function finishMoveTarget(target) {
    if (!target?.changed || !target.transaction) return;
    const history = window.Kroki?.HistoryManager;
    if (target.kind === "single") {
      history?.commitObjectChange?.(target.transaction, "Nesneyi hassas taşı", { assumeChanged: true });
    } else if (target.kind === "multi") {
      history?.commit?.(target.transaction, "Seçimi hassas taşı", { assumeChanged: true, ownSnapshots: true });
    }
  }

  function createActionSession(action) {
    return { action, target: resolveMoveTarget() };
  }

  function performAction(session) {
    const movement = movementByAction[session.action];
    return movement ? moveTarget(session.target, movement.dx, movement.dy) : false;
  }

  function cancelInactivityTimer() {
    window.clearTimeout(inactivityTimer);
    inactivityTimer = 0;
  }

  function collapsePanel(options = {}) {
    cancelInactivityTimer();
    if (activePress) stopActivePress(null, false);
    if (panel.hidden) return;
    const shouldRestoreFocus = options.restoreFocus && panel.contains(document.activeElement);
    panel.hidden = true;
    restoreButton.hidden = false;
    restoreButton.setAttribute("aria-expanded", "false");
    if (shouldRestoreFocus) restoreButton.focus({ preventScroll: true });
  }

  function scheduleAutoCollapse() {
    cancelInactivityTimer();
    if (panel.hidden || activePress) return;
    inactivityTimer = window.setTimeout(() => collapsePanel({ restoreFocus: true }), INACTIVITY_MS);
  }

  function openPanel(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    panel.hidden = false;
    restoreButton.hidden = true;
    restoreButton.setAttribute("aria-expanded", "true");
    scheduleAutoCollapse();
    if (event?.detail === 0) actionButtons[0]?.focus({ preventScroll: true });
  }

  function stopActivePress(pointerId, restartInactivity = true) {
    if (!activePress || (pointerId != null && activePress.pointerId !== pointerId)) return;
    const press = activePress;
    activePress = null;
    window.clearTimeout(press.holdTimer);
    window.clearInterval(press.repeatTimer);
    press.button.classList.remove("is-repeating");
    if (press.pointerId != null && press.button.hasPointerCapture?.(press.pointerId)) {
      press.button.releasePointerCapture(press.pointerId);
    }
    finishMoveTarget(press.session.target);
    if (restartInactivity) scheduleAutoCollapse();
  }

  function repeatActivePress(press) {
    if (activePress !== press) return;
    if (!performAction(press.session)) stopActivePress(press.pointerId);
  }

  function startPointerPress(event) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cancelInactivityTimer();
    stopActivePress(null, false);

    const button = event.currentTarget;
    const press = {
      button,
      pointerId: event.pointerId,
      session: createActionSession(button.dataset.touchAction),
      holdTimer: 0,
      repeatTimer: 0
    };
    activePress = press;
    lastPointerActivation.set(button, performance.now());
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch (_) {
      // Synthetic and older pointer implementations may not support capture.
    }
    performAction(press.session);
    press.holdTimer = window.setTimeout(() => {
      if (activePress !== press) return;
      button.classList.add("is-repeating");
      repeatActivePress(press);
      press.repeatTimer = window.setInterval(() => repeatActivePress(press), REPEAT_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  function runKeyboardClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const lastPointerTime = lastPointerActivation.get(event.currentTarget) || 0;
    if (performance.now() - lastPointerTime < 800) return;
    const session = createActionSession(event.currentTarget.dataset.touchAction);
    performAction(session);
    finishMoveTarget(session.target);
    scheduleAutoCollapse();
  }

  function stopPointerEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    lastPointerActivation.set(event.currentTarget, performance.now());
    stopActivePress(event.pointerId);
  }

  actionButtons.forEach((button) => {
    button.addEventListener("pointerdown", startPointerPress);
    button.addEventListener("pointerup", stopPointerEvent);
    button.addEventListener("pointercancel", stopPointerEvent);
    button.addEventListener("lostpointercapture", stopPointerEvent);
    button.addEventListener("click", runKeyboardClick);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  });

  dock.addEventListener("pointerdown", (event) => event.stopPropagation());
  restoreButton.addEventListener("click", openPanel);
  canvas.addEventListener("kroki:viewboxchange", renderZoomValue);
  window.addEventListener("resize", renderZoomValue);
  window.addEventListener("blur", () => collapsePanel());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) collapsePanel();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!panel.hidden && !dock.contains(event.target)) collapsePanel();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      collapsePanel({ restoreFocus: true });
    }
  });

  renderZoomValue();

  window.Kroki = window.Kroki || {};
  window.Kroki.TouchControlPanel = {
    open: openPanel,
    collapse: collapsePanel,
    getZoomPercent: currentZoomPercent,
    isCollapsed() {
      return panel.hidden;
    }
  };
})();
