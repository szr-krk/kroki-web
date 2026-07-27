(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const lineGeometry = Kroki.LineGeometry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !lineGeometry || !styleManager) return;

  const DEFAULT_RATIO = 0.20;

  function formatPoint(point) {
    return `${Number(point.x) || 0} ${Number(point.y) || 0}`;
  }

  function basis(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return null;
    return {
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      normal: { x: -dy / length, y: dx / length },
      halfLength: length / 2
    };
  }

  function controlFromRatio(arcBasis, ratio) {
    const sagitta = arcBasis.halfLength * ratio;
    return {
      x: arcBasis.mid.x + arcBasis.normal.x * sagitta,
      y: arcBasis.mid.y + arcBasis.normal.y * sagitta
    };
  }

  function ratioFromPoint(arcBasis, point) {
    const sagitta = (point.x - arcBasis.mid.x) * arcBasis.normal.x + (point.y - arcBasis.mid.y) * arcBasis.normal.y;
    return sagitta / arcBasis.halfLength;
  }

  function controlPoint(model) {
    const arcBasis = basis(model.geometry.start, model.geometry.end);
    if (!arcBasis) {
      return {
        x: (model.geometry.start.x + model.geometry.end.x) / 2,
        y: (model.geometry.start.y + model.geometry.end.y) / 2
      };
    }
    return controlFromRatio(arcBasis, utils.numberOr(model.geometry.ratio, DEFAULT_RATIO));
  }

  function circleGeometry(start, end, control) {
    const chordLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (chordLength < 0.001) return null;
    const x1 = start.x;
    const y1 = start.y;
    const x2 = control.x;
    const y2 = control.y;
    const x3 = end.x;
    const y3 = end.y;
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 0.001) return null;
    const startSq = x1 * x1 + y1 * y1;
    const controlSq = x2 * x2 + y2 * y2;
    const endSq = x3 * x3 + y3 * y3;
    const cx = (startSq * (y2 - y3) + controlSq * (y3 - y1) + endSq * (y1 - y2)) / d;
    const cy = (startSq * (x3 - x2) + controlSq * (x1 - x3) + endSq * (x2 - x1)) / d;
    const radius = Math.hypot(x1 - cx, y1 - cy);
    if (!Number.isFinite(radius) || radius < 0.001) return null;
    const tau = Math.PI * 2;
    const normalizeAngle = (angle) => ((angle % tau) + tau) % tau;
    const startAngle = Math.atan2(y1 - cy, x1 - cx);
    const controlAngle = Math.atan2(y2 - cy, x2 - cx);
    const endAngle = Math.atan2(y3 - cy, x3 - cx);
    const clockwiseDelta = normalizeAngle(endAngle - startAngle);
    const controlDelta = normalizeAngle(controlAngle - startAngle);
    const controlOnClockwiseArc = controlDelta <= clockwiseDelta;
    const arcDelta = controlOnClockwiseArc ? clockwiseDelta : tau - clockwiseDelta;
    return {
      cx,
      cy,
      radius,
      startAngle,
      endAngle,
      largeArcFlag: arcDelta > Math.PI + 0.000001 ? 1 : 0,
      sweepFlag: controlOnClockwiseArc ? 1 : 0
    };
  }

  function pathData(model) {
    const start = model.geometry.start;
    const end = model.geometry.end;
    const geometry = circleGeometry(start, end, controlPoint(model));
    if (!geometry) return lineGeometry.pathData(start, end);
    return `M ${formatPoint(start)} A ${geometry.radius} ${geometry.radius} 0 ${geometry.largeArcFlag} ${geometry.sweepFlag} ${formatPoint(end)}`;
  }

  function pointOnCircle(geometry, radius, angle) {
    return {
      x: geometry.cx + Math.cos(angle) * radius,
      y: geometry.cy + Math.sin(angle) * radius
    };
  }

  function normalizeAngle(angle) {
    const tau = Math.PI * 2;
    return ((angle % tau) + tau) % tau;
  }

  function offsetPathData(model, offset = 0, reverse = false) {
    const start = model.geometry.start;
    const end = model.geometry.end;
    const geometry = circleGeometry(start, end, controlPoint(model));
    if (!geometry) return lineGeometry.offsetPathData(start, end, offset, reverse);
    const sweepFlag = reverse ? (geometry.sweepFlag ? 0 : 1) : geometry.sweepFlag;
    const startAngle = reverse ? geometry.endAngle : geometry.startAngle;
    const endAngle = reverse ? geometry.startAngle : geometry.endAngle;
    const radius = Math.max(0.001, geometry.radius + (sweepFlag ? -offset : offset));
    const a = pointOnCircle(geometry, radius, startAngle);
    const b = pointOnCircle(geometry, radius, endAngle);
    return `M ${formatPoint(a)} A ${radius} ${radius} 0 ${geometry.largeArcFlag} ${sweepFlag} ${formatPoint(b)}`;
  }

  function midpointTangentAngle(model, reverse = false) {
    const geometry = circleGeometry(model.geometry.start, model.geometry.end, controlPoint(model));
    if (!geometry) {
      const start = reverse ? model.geometry.end : model.geometry.start;
      const end = reverse ? model.geometry.start : model.geometry.end;
      return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
    }
    const sweepFlag = reverse ? (geometry.sweepFlag ? 0 : 1) : geometry.sweepFlag;
    const startAngle = reverse ? geometry.endAngle : geometry.startAngle;
    const endAngle = reverse ? geometry.startAngle : geometry.endAngle;
    const delta = sweepFlag ? normalizeAngle(endAngle - startAngle) : normalizeAngle(startAngle - endAngle);
    const midAngle = sweepFlag ? startAngle + delta / 2 : startAngle - delta / 2;
    const tangent = sweepFlag
      ? { x: -Math.sin(midAngle), y: Math.cos(midAngle) }
      : { x: Math.sin(midAngle), y: -Math.cos(midAngle) };
    return Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
  }

  function endpointHandlePoint(model, pointId, offset) {
    const geometry = circleGeometry(model.geometry.start, model.geometry.end, controlPoint(model));
    if (!geometry) return lineGeometry.lineEndpointControlPoint(model.geometry.start, model.geometry.end, pointId, offset);
    const pathSign = geometry.sweepFlag ? 1 : -1;
    const extensionSign = pointId === "start" ? -1 : 1;
    const baseAngle = pointId === "start" ? geometry.startAngle : geometry.endAngle;
    const angle = baseAngle + pathSign * extensionSign * (offset / geometry.radius);
    return {
      x: geometry.cx + Math.cos(angle) * geometry.radius,
      y: geometry.cy + Math.sin(angle) * geometry.radius
    };
  }

  function pathDistance(element, point, tolerance) {
    try {
      const length = element.getTotalLength();
      if (!Number.isFinite(length) || length < 0.001) return false;
      const samples = Math.max(16, Math.min(80, Math.ceil(length / Math.max(1, 8 * (tolerance / 24)))));
      for (let index = 0; index <= samples; index += 1) {
        const sample = element.getPointAtLength(length * index / samples);
        if (Math.hypot(point.x - sample.x, point.y - sample.y) <= tolerance) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  const adapter = {
    elementTag: "path",
    className: "editor-cizgi",
    capabilities: { arrows: true, fill: false, curvedLabel: true },

    create(initialData = {}) {
      const start = initialData.start || { x: 0, y: 0 };
      const end = initialData.end || start;
      return {
        type: "arc",
        geometry: {
          start: { x: utils.numberOr(start.x, 0), y: utils.numberOr(start.y, 0) },
          end: { x: utils.numberOr(end.x, 0), y: utils.numberOr(end.y, 0) },
          ratio: utils.numberOr(initialData.ratio, DEFAULT_RATIO)
        },
        style: initialData.style,
        label: initialData.label,
        metadata: initialData.metadata
      };
    },

    readFromElement(element) {
      const start = {
        x: utils.numberOr(element.getAttribute("x1"), 0),
        y: utils.numberOr(element.getAttribute("y1"), 0)
      };
      const end = {
        x: utils.numberOr(element.getAttribute("x2"), 0),
        y: utils.numberOr(element.getAttribute("y2"), 0)
      };
      const arcBasis = basis(start, end);
      let ratio = utils.numberOr(element.dataset.arcSagittaRatio, DEFAULT_RATIO);
      const controlX = Number(element.dataset.arcControlX);
      const controlY = Number(element.dataset.arcControlY);
      if (arcBasis && Number.isFinite(controlX) && Number.isFinite(controlY)) {
        ratio = ratioFromPoint(arcBasis, { x: controlX, y: controlY });
      }
      return {
        id: element.dataset.objectId,
        type: "arc",
        geometry: { start, end, ratio },
        style: styleManager.readStyleFromElement(element, "arc"),
        label: styleManager.readLabelFromElement(element, "arc"),
        metadata: {}
      };
    },

    render(model, element) {
      const control = controlPoint(model);
      element.setAttribute("x1", String(model.geometry.start.x));
      element.setAttribute("y1", String(model.geometry.start.y));
      element.setAttribute("x2", String(model.geometry.end.x));
      element.setAttribute("y2", String(model.geometry.end.y));
      element.dataset.arcControlX = String(control.x);
      element.dataset.arcControlY = String(control.y);
      element.dataset.arcSagittaRatio = String(model.geometry.ratio);
      element.setAttribute("d", pathData(model));
      element.removeAttribute("transform");
    },

    hitTest(model, point, tolerance, element) {
      return pathDistance(element, point, tolerance);
    },

    getControlPoints(model, metrics) {
      return [
        { id: "start", ...endpointHandlePoint(model, "start", metrics.endpointOffset), role: "move", cursor: "grab" },
        { id: "end", ...endpointHandlePoint(model, "end", metrics.endpointOffset), role: "move", cursor: "grab" },
        { id: "control", ...controlPoint(model), role: "curve", cursor: "grab" }
      ];
    },

    beginControlPointMove(model, cpId, point) {
      return { cpId, point, geometry: utils.clonePlain(model.geometry) };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      if (cpId === "control") {
        const arcBasis = basis(model.geometry.start, model.geometry.end);
        model.geometry.ratio = arcBasis ? ratioFromPoint(arcBasis, worldPoint) : DEFAULT_RATIO;
        return;
      }
      const startState = modifiers.startState;
      if (!startState?.geometry || !startState.point) return;
      const dx = worldPoint.x - startState.point.x;
      const dy = worldPoint.y - startState.point.y;
      if (cpId === "start") {
        const start = {
          x: startState.geometry.start.x + dx,
          y: startState.geometry.start.y + dy
        };
        model.geometry.start = lineGeometry.snapEndpoint(model.geometry.end, start);
      }
      if (cpId === "end") {
        const end = {
          x: startState.geometry.end.x + dx,
          y: startState.geometry.end.y + dy
        };
        model.geometry.end = lineGeometry.snapEndpoint(model.geometry.start, end);
      }
      model.geometry.ratio = startState.geometry.ratio;
    },

    move(model, dx, dy) {
      model.geometry.start.x += dx;
      model.geometry.start.y += dy;
      model.geometry.end.x += dx;
      model.geometry.end.y += dy;
    },

    getBounds(model) {
      const control = controlPoint(model);
      const xs = [model.geometry.start.x, model.geometry.end.x, control.x];
      const ys = [model.geometry.start.y, model.geometry.end.y, control.y];
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      };
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("path", { class: "editor-object-selection editor-line-selection" });
    },

    renderSelection(element, model, style, mode) {
      element.setAttribute("d", pathData(model));
      element.setAttribute("stroke-width", String(style.strokeWidth + 4));
      element.setAttribute("stroke-linecap", style.lineCap);
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    pointAt(model, t) {
      const geometry = circleGeometry(model.geometry.start, model.geometry.end, controlPoint(model));
      if (!geometry) {
        return {
          x: model.geometry.start.x + (model.geometry.end.x - model.geometry.start.x) * t,
          y: model.geometry.start.y + (model.geometry.end.y - model.geometry.start.y) * t
        };
      }
      const delta = geometry.sweepFlag
        ? normalizeAngle(geometry.endAngle - geometry.startAngle)
        : -normalizeAngle(geometry.startAngle - geometry.endAngle);
      const angle = geometry.startAngle + delta * t;
      return pointOnCircle(geometry, geometry.radius, angle);
    },

    offsetPathData,
    midpointTangentAngle
  };

  registry.register("arc", adapter);
})();
