(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  if (!utils) return;

  function fromBounds(start, end, rotation) {
    return {
      cx: (start.x + end.x) / 2,
      cy: (start.y + end.y) / 2,
      rx: Math.max(1, Math.abs(end.x - start.x) / 2),
      ry: Math.max(1, Math.abs(end.y - start.y) / 2),
      rotation: utils.normalizeRotation(rotation)
    };
  }

  function rotationAxes(rotation) {
    const radians = utils.normalizeRotation(rotation) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      xAxis: { x: cos, y: sin },
      yAxis: { x: -sin, y: cos }
    };
  }

  function localPoint(geometry, localX, localY) {
    const axes = rotationAxes(geometry.rotation);
    return {
      x: geometry.cx + axes.xAxis.x * localX + axes.yAxis.x * localY,
      y: geometry.cy + axes.xAxis.y * localX + axes.yAxis.y * localY
    };
  }

  function pointToLocal(geometry, point) {
    const axes = rotationAxes(geometry.rotation);
    const dx = point.x - geometry.cx;
    const dy = point.y - geometry.cy;
    return {
      x: dx * axes.xAxis.x + dy * axes.xAxis.y,
      y: dx * axes.yAxis.x + dy * axes.yAxis.y
    };
  }

  function signedHalfDistance(total, fallbackSign) {
    const sign = total < 0 ? -1 : total > 0 ? 1 : fallbackSign;
    return sign * Math.max(1, Math.abs(total) / 2);
  }

  Kroki.RectangleGeometry = {
    fromBounds,
    rotationAxes,
    localPoint,
    pointToLocal,
    signedHalfDistance,
    bounds(geometry) {
      return {
        x: geometry.cx - geometry.rx,
        y: geometry.cy - geometry.ry,
        width: geometry.rx * 2,
        height: geometry.ry * 2
      };
    }
  };
})();
