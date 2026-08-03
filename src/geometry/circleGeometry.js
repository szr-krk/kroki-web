(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  if (!utils) return;

  function fromDiameter(start, end, rotation) {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    return {
      cx,
      cy,
      r: Math.max(1, Math.hypot(end.x - start.x, end.y - start.y) / 2),
      rotation: utils.normalizeRotation(rotation)
    };
  }

  function rotationVector(rotation) {
    const radians = utils.normalizeRotation(rotation) * Math.PI / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
  }

  Kroki.CircleGeometry = {
    fromDiameter,
    rotationVector,
    bounds(geometry) {
      return {
        x: geometry.cx - geometry.r,
        y: geometry.cy - geometry.r,
        width: geometry.r * 2,
        height: geometry.r * 2
      };
    }
  };
})();
