(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  if (!utils || !manager) return;

  const HIT_TOLERANCE_PX = 24;

  function tolerance() {
    return HIT_TOLERANCE_PX * utils.svgUnitsPerScreenPx(manager.canvas);
  }

  function hitTest(point) {
    const objects = manager.getObjectsInDomOrder().slice().reverse();
    const tol = tolerance();

    for (let index = 0; index < objects.length; index += 1) {
      const model = objects[index];
      const adapter = manager.getAdapter(model);
      const element = manager.getElement(model.id);
      if (adapter?.hitTest?.(model, point, tol, element)) return { model, element, adapter };
    }

    return null;
  }

  function hitTestEvent(event) {
    return hitTest(utils.pointFromEvent(manager.canvas, event));
  }

  Kroki.HitTestManager = {
    tolerance,
    hitTest,
    hitTestEvent,
    hasObjectAt(event) {
      if (!event || window.krokiEditorState?.getActiveTool?.()) return false;
      return Boolean(hitTestEvent(event));
    }
  };

  window.krokiObjectEditCore?.registerCanvasObjectHitTest?.((event) => Kroki.HitTestManager.hasObjectAt(event));
})();
