(() => {
  const K = window.Kroki = window.Kroki || {};
  const canvas = document.querySelector("#editorCanvas");
  const overlay = document.querySelector("#editorCenterGuide");
  const camera = window.krokiEditorCamera;
  if (!canvas || !overlay || !camera) return;
  let revision = 0;
  let shownX = false, shownY = false;

  function show(x, y) {
    if (shownX !== x) overlay.classList.toggle("is-snapped-x", x);
    if (shownY !== y) overlay.classList.toggle("is-snapped-y", y);
    shownX = x; shownY = y;
  }
  function end() { show(false, false); }
  function origin() {
    const viewport = camera.getViewportMetrics(canvas);
    const rect = viewport?.rect;
    if (!rect?.width || !rect?.height) return null;
    return camera.clientToWorld(canvas, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  function begin(model, adapter, start, pointerType) {
    end();
    // Only whole road objects, including islandRing. No CP or group gestures.
    if (model?.type !== "road") return null;
    const center = origin(), bounds = adapter?.getBounds?.(model);
    const viewport = camera.getViewportMetrics(canvas);
    if (!center || !bounds || !(viewport?.scale > 0)) return null;
    const anchor = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    if (![anchor.x, anchor.y].every(Number.isFinite)) return null;
    return { center, anchor, start: { x: start.x, y: start.y },
      tolerance: (pointerType === "touch" ? 18 : 12) / viewport.scale,
      movementThreshold: 3 / viewport.scale, active: false, revision };
  }
  function snap(state, raw, ordinary) {
    if (!state || state.revision !== revision) return ordinary;
    if (!state.active && Math.hypot(raw.x - state.start.x, raw.y - state.start.y) < state.movementThreshold) return ordinary;
    state.active = true;
    const x = state.anchor.x + raw.x - state.start.x;
    const y = state.anchor.y + raw.y - state.start.y;
    const snapX = Math.abs(x - state.center.x) <= state.tolerance;
    const snapY = Math.abs(y - state.center.y) <= state.tolerance;
    show(snapX, snapY);
    // Decide attraction from the raw pointer, then override only captured axes.
    // Existing endpoint/grid snapping remains active on the other axis.
    return { ...ordinary,
      x: snapX ? state.start.x + state.center.x - state.anchor.x : ordinary.x,
      y: snapY ? state.start.y + state.center.y - state.anchor.y : ordinary.y };
  }
  function invalidate() { revision++; end(); }
  canvas.addEventListener("kroki:viewboxchange", invalidate);
  window.addEventListener("resize", invalidate);
  if (typeof ResizeObserver === "function") new ResizeObserver(invalidate).observe(canvas);
  window.addEventListener("blur", end);
  K.EditorCenterGuide = { origin, begin, snap, end };
})();
