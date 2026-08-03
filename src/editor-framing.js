(() => {
  const CONTENT_PADDING_WORLD = 25;

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

  function expandBounds(bounds, amount = CONTENT_PADDING_WORLD) {
    if (!isFiniteBounds(bounds)) return null;
    const padding = Math.max(0, Number(amount) || 0);
    return {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    };
  }

  window.krokiEditorFraming = Object.freeze({
    CONTENT_PADDING_WORLD,
    expandBounds
  });
})();
