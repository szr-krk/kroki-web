(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const lineGeometry = Kroki.LineGeometry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !lineGeometry || !styleManager) return;

  const QUADRATIC = "quadratic";
  const CUBIC = "cubic";
  const SAMPLE_COUNT = 64;

  function formatPoint(point) {
    return `${Number(point.x) || 0} ${Number(point.y) || 0}`;
  }

  function lerp(start, end, t) {
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t
    };
  }

  function defaultControls(start, end, type) {
    if (type === CUBIC) {
      return { c1: lerp(start, end, 1 / 3), c2: lerp(start, end, 2 / 3) };
    }
    return { q: lerp(start, end, 0.5) };
  }

  function normalizeType(type) {
    return type === CUBIC ? CUBIC : QUADRATIC;
  }

  function pathData(model) {
    const geometry = model.geometry;
    if (geometry.bezierType === CUBIC) {
      return `M ${formatPoint(geometry.start)} C ${formatPoint(geometry.c1)} ${formatPoint(geometry.c2)} ${formatPoint(geometry.end)}`;
    }
    return `M ${formatPoint(geometry.start)} Q ${formatPoint(geometry.q)} ${formatPoint(geometry.end)}`;
  }

  function pointAt(model, t) {
    const geometry = model.geometry;
    if (geometry.bezierType === CUBIC) {
      const p01 = lerp(geometry.start, geometry.c1, t);
      const p12 = lerp(geometry.c1, geometry.c2, t);
      const p23 = lerp(geometry.c2, geometry.end, t);
      return lerp(lerp(p01, p12, t), lerp(p12, p23, t), t);
    }
    return lerp(lerp(geometry.start, geometry.q, t), lerp(geometry.q, geometry.end, t), t);
  }

  function tangentAt(model, t) {
    const geometry = model.geometry;
    if (geometry.bezierType === CUBIC) {
      return {
        x: 3 * (1 - t) * (1 - t) * (geometry.c1.x - geometry.start.x)
          + 6 * (1 - t) * t * (geometry.c2.x - geometry.c1.x)
          + 3 * t * t * (geometry.end.x - geometry.c2.x),
        y: 3 * (1 - t) * (1 - t) * (geometry.c1.y - geometry.start.y)
          + 6 * (1 - t) * t * (geometry.c2.y - geometry.c1.y)
          + 3 * t * t * (geometry.end.y - geometry.c2.y)
      };
    }
    return {
      x: 2 * (1 - t) * (geometry.q.x - geometry.start.x) + 2 * t * (geometry.end.x - geometry.q.x),
      y: 2 * (1 - t) * (geometry.q.y - geometry.start.y) + 2 * t * (geometry.end.y - geometry.q.y)
    };
  }

  function offsetPathData(model, offset = 0, reverse = false) {
    const points = [];
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const t = index / SAMPLE_COUNT;
      const point = pointAt(model, t);
      const tangent = tangentAt(model, t);
      const length = Math.hypot(tangent.x, tangent.y) || 1;
      points.push({
        x: point.x + (-tangent.y / length) * offset,
        y: point.y + (tangent.x / length) * offset
      });
    }
    if (reverse) points.reverse();
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${formatPoint(point)}`).join(" ");
  }

  function midpointTangentAngle(model, reverse = false) {
    const tangent = tangentAt(model, 0.5);
    const angle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
    return reverse ? angle + 180 : angle;
  }

  function endpointHandlePoint(model, pointId, offset) {
    const base = pointId === "start" ? model.geometry.start : model.geometry.end;
    const tangent = tangentAt(model, pointId === "start" ? 0 : 1);
    const length = Math.hypot(tangent.x, tangent.y);
    if (!Number.isFinite(length) || length < 0.001) {
      return lineGeometry.lineEndpointControlPoint(model.geometry.start, model.geometry.end, pointId, offset);
    }
    const sign = pointId === "start" ? -1 : 1;
    return {
      x: base.x + (tangent.x / length) * offset * sign,
      y: base.y + (tangent.y / length) * offset * sign
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

  function pointFromDataset(element, xKey, yKey, fallback) {
    const x = Number(element.dataset[xKey]);
    const y = Number(element.dataset[yKey]);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    return fallback;
  }

  const adapter = {
    elementTag: "path",
    className: "editor-cizgi",
    capabilities: { arrows: true, fill: false, curvedLabel: true },

    create(initialData = {}) {
      const start = initialData.start || { x: 0, y: 0 };
      const end = initialData.end || start;
      const type = normalizeType(initialData.bezierType);
      const controls = defaultControls(start, end, type);
      return {
        type: "bezier",
        geometry: {
          bezierType: type,
          start: { x: utils.numberOr(start.x, 0), y: utils.numberOr(start.y, 0) },
          end: { x: utils.numberOr(end.x, 0), y: utils.numberOr(end.y, 0) },
          ...controls
        },
        style: initialData.style,
        label: initialData.label,
        metadata: initialData.metadata
      };
    },

    readFromElement(element) {
      const type = normalizeType(element.dataset.bezierType);
      const start = {
        x: utils.numberOr(element.getAttribute("x1"), 0),
        y: utils.numberOr(element.getAttribute("y1"), 0)
      };
      const end = {
        x: utils.numberOr(element.getAttribute("x2"), 0),
        y: utils.numberOr(element.getAttribute("y2"), 0)
      };
      const defaults = defaultControls(start, end, type);
      const geometry = { bezierType: type, start, end };
      if (type === CUBIC) {
        geometry.c1 = pointFromDataset(element, "bezierC1X", "bezierC1Y", defaults.c1);
        geometry.c2 = pointFromDataset(element, "bezierC2X", "bezierC2Y", defaults.c2);
      } else {
        geometry.q = pointFromDataset(element, "bezierQX", "bezierQY", defaults.q);
      }
      return {
        id: element.dataset.objectId,
        type: "bezier",
        geometry,
        style: styleManager.readStyleFromElement(element, "bezier"),
        label: styleManager.readLabelFromElement(element, "bezier"),
        metadata: {}
      };
    },

    render(model, element) {
      const geometry = model.geometry;
      element.setAttribute("x1", String(geometry.start.x));
      element.setAttribute("y1", String(geometry.start.y));
      element.setAttribute("x2", String(geometry.end.x));
      element.setAttribute("y2", String(geometry.end.y));
      element.dataset.bezierType = geometry.bezierType;
      if (geometry.bezierType === CUBIC) {
        element.dataset.bezierC1X = String(geometry.c1.x);
        element.dataset.bezierC1Y = String(geometry.c1.y);
        element.dataset.bezierC2X = String(geometry.c2.x);
        element.dataset.bezierC2Y = String(geometry.c2.y);
        delete element.dataset.bezierQX;
        delete element.dataset.bezierQY;
      } else {
        element.dataset.bezierQX = String(geometry.q.x);
        element.dataset.bezierQY = String(geometry.q.y);
        delete element.dataset.bezierC1X;
        delete element.dataset.bezierC1Y;
        delete element.dataset.bezierC2X;
        delete element.dataset.bezierC2Y;
      }
      element.setAttribute("d", pathData(model));
      element.removeAttribute("transform");
    },

    hitTest(model, point, tolerance, element) {
      return pathDistance(element, point, tolerance);
    },

    getControlPoints(model, metrics) {
      const points = [
        { id: "start", ...endpointHandlePoint(model, "start", metrics.endpointOffset), role: "move", cursor: "grab" },
        { id: "end", ...endpointHandlePoint(model, "end", metrics.endpointOffset), role: "move", cursor: "grab" }
      ];
      if (model.geometry.bezierType === CUBIC) {
        points.push(
          { id: "c1", ...model.geometry.c1, role: "curve", cursor: "grab" },
          { id: "c2", ...model.geometry.c2, role: "curve", cursor: "grab" }
        );
      } else {
        points.push({ id: "q", ...model.geometry.q, role: "curve", cursor: "grab" });
      }
      return points;
    },

    beginControlPointMove(model, cpId, point) {
      return { cpId, point, geometry: utils.clonePlain(model.geometry) };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      if (cpId === "q" || cpId === "c1" || cpId === "c2") {
        const point = Kroki.EditorGrid?.snapPoint(worldPoint, modifiers) || worldPoint;
        model.geometry[cpId] = { x: point.x, y: point.y };
        return;
      }

      const startState = modifiers.startState;
      if (!startState?.geometry || !startState.point) return;
      const dx = worldPoint.x - startState.point.x;
      const dy = worldPoint.y - startState.point.y;
      if (cpId === "start") {
        const start = { x: startState.geometry.start.x + dx, y: startState.geometry.start.y + dy };
        model.geometry.start = Kroki.EditorGrid?.snapPoint(start, modifiers) || start;
      }
      if (cpId === "end") {
        const end = { x: startState.geometry.end.x + dx, y: startState.geometry.end.y + dy };
        model.geometry.end = Kroki.EditorGrid?.snapPoint(end, modifiers) || end;
      }
      if (model.geometry.bezierType === CUBIC) {
        model.geometry.c1 = startState.geometry.c1;
        model.geometry.c2 = startState.geometry.c2;
      } else {
        model.geometry.q = startState.geometry.q;
      }
    },

    move(model, dx, dy) {
      model.geometry.start.x += dx;
      model.geometry.start.y += dy;
      model.geometry.end.x += dx;
      model.geometry.end.y += dy;
      if (model.geometry.bezierType === CUBIC) {
        model.geometry.c1.x += dx;
        model.geometry.c1.y += dy;
        model.geometry.c2.x += dx;
        model.geometry.c2.y += dy;
      } else {
        model.geometry.q.x += dx;
        model.geometry.q.y += dy;
      }
    },

    getBounds(model) {
      const points = [];
      for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
        points.push(pointAt(model, index / SAMPLE_COUNT));
      }
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
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

    pointAt,
    offsetPathData,
    midpointTangentAngle
  };

  registry.register("bezier", adapter);
})();
