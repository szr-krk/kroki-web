(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  if (!utils) return;

  const ORTHO_SNAP_TOLERANCE_PX = 10;
  const ORTHO_SNAP_DEAD_ZONE_PX = 0.5;
  let snapEnabled = true;

  function normalizedVector(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return { x: 1, y: 0, length: 0 };
    return { x: dx / length, y: dy / length, length };
  }

  function distanceToSegment(start, end, point) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 0.001) return Math.hypot(point.x - start.x, point.y - start.y);
    const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, rawT));
    return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
  }

  function lineEndpointControlPoint(start, end, pointId, offset) {
    const direction = normalizedVector(start, end);
    const base = pointId === "start" ? start : end;
    const sign = pointId === "start" ? -1 : 1;
    return {
      x: base.x + direction.x * offset * sign,
      y: base.y + direction.y * offset * sign
    };
  }

  function endpointFromControl(start, end, pointId, control, metrics) {
    if (pointId === "start") {
      const direction = normalizedVector(control, end);
      const offset = Math.min(metrics.endpointOffset, Math.max(0, direction.length - metrics.minGap));
      return { x: control.x + direction.x * offset, y: control.y + direction.y * offset };
    }

    const direction = normalizedVector(start, control);
    const offset = Math.min(metrics.endpointOffset, Math.max(0, direction.length - metrics.minGap));
    return { x: control.x - direction.x * offset, y: control.y - direction.y * offset };
  }

  function pathData(start, end) {
    return `M ${Number(start.x) || 0} ${Number(start.y) || 0} L ${Number(end.x) || 0} ${Number(end.y) || 0}`;
  }

  function offsetPathData(start, end, offset = 0, reverse = false) {
    const direction = normalizedVector(start, end);
    const normal = { x: -direction.y, y: direction.x };
    const a = {
      x: start.x + normal.x * offset,
      y: start.y + normal.y * offset
    };
    const b = {
      x: end.x + normal.x * offset,
      y: end.y + normal.y * offset
    };
    return reverse ? pathData(b, a) : pathData(a, b);
  }

  function snapPoint(canvas, anchor, point) {
    if (!snapEnabled || !anchor || !point) return point;
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return point;
    const screenUnit = utils.svgUnitsPerScreenPx(canvas);
    const deadZone = ORTHO_SNAP_DEAD_ZONE_PX * screenUnit;
    if (Math.hypot(dx, dy) <= deadZone) return point;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const tolerance = ORTHO_SNAP_TOLERANCE_PX * screenUnit;
    const nearHorizontal = absDy <= tolerance;
    const nearVertical = absDx <= tolerance;
    if (nearHorizontal && nearVertical) {
      return absDy <= absDx ? { x: point.x, y: anchor.y } : { x: anchor.x, y: point.y };
    }
    if (nearHorizontal) return { x: point.x, y: anchor.y };
    if (nearVertical) return { x: anchor.x, y: point.y };
    return point;
  }

  function snapEndpoint(anchor, point) {
    return snapPoint(Kroki.EditorObjectManager?.canvas || document.querySelector("#editorCanvas"), anchor, point);
  }

  Kroki.LineGeometry = {
    normalizedVector,
    distanceToSegment,
    lineEndpointControlPoint,
    endpointFromControl,
    pathData,
    offsetPathData,
    snapEndpoint
  };

  Kroki.LineSnap = {
    isEnabled() {
      return snapEnabled;
    },
    toggle() {
      snapEnabled = !snapEnabled;
      return snapEnabled;
    },
    snapPoint(anchor, point) {
      return snapEndpoint(anchor, point);
    }
  };

  window.krokiLineSnap = {
    isEnabled: Kroki.LineSnap.isEnabled,
    snapPoint: Kroki.LineSnap.snapPoint
  };
})();
