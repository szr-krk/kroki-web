(() => {
  const canvas = document.querySelector("#editorCanvas");
  const dock = document.querySelector("#touchControlDock");
  const panel = document.querySelector("#touchControlPanel");
  const zoomValue = document.querySelector("#touchControlZoomValue");
  const opacityButton = document.querySelector("#btnTouchControlOpacity");
  const collapseButton = document.querySelector("#btnTouchControlCollapse");
  const restoreButton = document.querySelector("#btnTouchControlRestore");
  const actionButtons = Array.from(document.querySelectorAll("[data-touch-action]"));
  if (!canvas || !dock || !panel || !zoomValue || !opacityButton || !collapseButton || !restoreButton || !actionButtons.length) return;

  const HOLD_DELAY_MS = 360;
  const REPEAT_INTERVAL_MS = 70;
  const OPACITY_LEVELS = [1, .9, .75, .6];
  const OPACITY_STORAGE_KEY = "kroki.touchControls.opacity";
  const movementByAction = {
    "move-up": { dx: 0, dy: -1 },
    "move-left": { dx: -1, dy: 0 },
    "move-right": { dx: 1, dy: 0 },
    "move-down": { dx: 0, dy: 1 }
  };

  let activePress = null;
  const lastPointerActivation = new WeakMap();

  function cameraApi() {
    return window.krokiEditorCamera;
  }

  function currentZoomPercent() {
    const scale = Number(cameraApi()?.getScale?.(canvas));
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
      cameraApi()?.panByWorld?.(canvas, dx, dy);
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
    if (movementByAction[action]) return { type: "move", target: resolveMoveTarget() };
    if (action === "zoom-in") return { type: "zoom", delta: 1 };
    if (action === "zoom-out") return { type: "zoom", delta: -1 };
    return { type: "none" };
  }

  function performAction(session) {
    if (session.type === "move") {
      const movement = movementByAction[session.action];
      return movement ? moveTarget(session.target, movement.dx, movement.dy) : false;
    }
    if (session.type === "zoom") {
      const before = currentZoomPercent();
      cameraApi()?.zoomByPercentagePointAtCenter?.(canvas, session.delta);
      renderZoomValue();
      return Math.abs(currentZoomPercent() - before) > .000001;
    }
    return false;
  }

  function finishActionSession(session) {
    if (session?.type === "move") finishMoveTarget(session.target);
  }

  function stopActivePress(pointerId) {
    if (!activePress || (pointerId != null && activePress.pointerId !== pointerId)) return;
    const press = activePress;
    activePress = null;
    window.clearTimeout(press.holdTimer);
    window.clearInterval(press.repeatTimer);
    press.button.classList.remove("is-repeating");
    if (press.pointerId != null && press.button.hasPointerCapture?.(press.pointerId)) {
      press.button.releasePointerCapture(press.pointerId);
    }
    finishActionSession(press.session);
  }

  function repeatActivePress(press) {
    if (activePress !== press) return;
    if (!performAction(press.session)) stopActivePress(press.pointerId);
  }

  function startPointerPress(event) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopActivePress();

    const button = event.currentTarget;
    const action = button.dataset.touchAction;
    const session = { ...createActionSession(action), action };
    const press = {
      button,
      pointerId: event.pointerId,
      session,
      holdTimer: 0,
      repeatTimer: 0
    };
    activePress = press;
    lastPointerActivation.set(button, performance.now());
    button.setPointerCapture?.(event.pointerId);
    performAction(session);
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
    const action = event.currentTarget.dataset.touchAction;
    const session = { ...createActionSession(action), action };
    performAction(session);
    finishActionSession(session);
  }

  function stopPointerEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    stopActivePress(event.pointerId);
  }

  function readStoredOpacity() {
    try {
      const stored = Number(window.localStorage.getItem(OPACITY_STORAGE_KEY));
      if (OPACITY_LEVELS.includes(stored)) return stored;
    } catch (_) {
      // Storage can be unavailable in privacy-restricted contexts.
    }
    return .9;
  }

  function applyOpacity(value) {
    const safeValue = OPACITY_LEVELS.includes(value) ? value : .9;
    dock.style.setProperty("--touch-control-opacity", String(safeValue));
    const percent = Math.round(safeValue * 100);
    opacityButton.title = `Panel opaklığı: %${percent}`;
    opacityButton.setAttribute("aria-label", `Panel opaklığını değiştir; mevcut yüzde ${percent}`);
    opacityButton.dataset.opacity = String(safeValue);
    try {
      window.localStorage.setItem(OPACITY_STORAGE_KEY, String(safeValue));
    } catch (_) {
      // The visual setting still applies for the current session.
    }
  }

  function cycleOpacity(event) {
    event.preventDefault();
    event.stopPropagation();
    const current = Number(opacityButton.dataset.opacity) || .9;
    const index = OPACITY_LEVELS.indexOf(current);
    applyOpacity(OPACITY_LEVELS[(index + 1) % OPACITY_LEVELS.length]);
  }

  function collapsePanel(event) {
    event.preventDefault();
    event.stopPropagation();
    stopActivePress();
    panel.hidden = true;
    restoreButton.hidden = false;
    restoreButton.focus({ preventScroll: true });
  }

  function restorePanel(event) {
    event.preventDefault();
    event.stopPropagation();
    panel.hidden = false;
    restoreButton.hidden = true;
    collapseButton.focus({ preventScroll: true });
    renderZoomValue();
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
  opacityButton.addEventListener("click", cycleOpacity);
  collapseButton.addEventListener("click", collapsePanel);
  restoreButton.addEventListener("click", restorePanel);
  canvas.addEventListener("kroki:viewboxchange", renderZoomValue);
  window.addEventListener("resize", renderZoomValue);
  window.addEventListener("blur", () => stopActivePress());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopActivePress();
  });

  applyOpacity(readStoredOpacity());
  renderZoomValue();

  window.Kroki = window.Kroki || {};
  window.Kroki.TouchControlPanel = {
    collapse() {
      collapsePanel(new Event("click"));
    },
    restore() {
      restorePanel(new Event("click"));
    },
    getZoomPercent: currentZoomPercent,
    isCollapsed() {
      return panel.hidden;
    }
  };
})();
