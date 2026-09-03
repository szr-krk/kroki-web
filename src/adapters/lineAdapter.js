(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const lineGeometry = Kroki.LineGeometry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !lineGeometry || !styleManager) return;

  function geometryFromElement(element) {
    return {
      start: {
        x: utils.numberOr(element.getAttribute("x1"), 0),
        y: utils.numberOr(element.getAttribute("y1"), 0)
      },
      end: {
        x: utils.numberOr(element.getAttribute("x2"), 0),
        y: utils.numberOr(element.getAttribute("y2"), 0)
      }
    };
  }

  function pointAt(model, t) {
    return {
      x: model.geometry.start.x + (model.geometry.end.x - model.geometry.start.x) * t,
      y: model.geometry.start.y + (model.geometry.end.y - model.geometry.start.y) * t
    };
  }

  const adapter = {
    elementTag: "line",
    className: "editor-cizgi",
    capabilities: { arrows: true, fill: false, curvedLabel: false },

    create(initialData = {}) {
      const start = initialData.start || { x: 0, y: 0 };
      const end = initialData.end || start;
      return {
        type: "line",
        geometry: {
          start: { x: utils.numberOr(start.x, 0), y: utils.numberOr(start.y, 0) },
          end: { x: utils.numberOr(end.x, 0), y: utils.numberOr(end.y, 0) }
        },
        style: initialData.style,
        label: initialData.label,
        metadata: initialData.metadata
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "line",
        geometry: geometryFromElement(element),
        style: styleManager.readStyleFromElement(element, "line"),
        label: styleManager.readLabelFromElement(element, "line"),
        metadata: {}
      };
    },

    render(model, element) {
      element.setAttribute("x1", String(model.geometry.start.x));
      element.setAttribute("y1", String(model.geometry.start.y));
      element.setAttribute("x2", String(model.geometry.end.x));
      element.setAttribute("y2", String(model.geometry.end.y));
      element.removeAttribute("d");
      element.removeAttribute("transform");
    },

    hitTest(model, point, tolerance) {
      const distance = lineGeometry.distanceToSegment(model.geometry.start, model.geometry.end, point);
      return distance <= tolerance;
    },

    getControlPoints(model, metrics) {
      return [
        {
          id: "start",
          ...lineGeometry.lineEndpointControlPoint(model.geometry.start, model.geometry.end, "start", metrics.endpointOffset),
          role: "move",
          cursor: "grab"
        },
        {
          id: "end",
          ...lineGeometry.lineEndpointControlPoint(model.geometry.start, model.geometry.end, "end", metrics.endpointOffset),
          role: "move",
          cursor: "grab"
        }
      ];
    },

    beginControlPointMove(model, cpId, point) {
      return {
        point: { x: point.x, y: point.y },
        geometry: { start: { ...model.geometry.start }, end: { ...model.geometry.end } }
      };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      const state = modifiers.startState;
      if (state && (cpId === "start" || cpId === "end")) {
        const point = {
          x: state.geometry[cpId].x + worldPoint.x - state.point.x,
          y: state.geometry[cpId].y + worldPoint.y - state.point.y
        };
        model.geometry[cpId] = Kroki.EditorGrid?.snapPoint(point, modifiers) || point;
        return;
      }
      const metrics = modifiers.metrics || { endpointOffset: 0, minGap: 0 };
      if (cpId === "start") {
        const start = lineGeometry.endpointFromControl(model.geometry.start, model.geometry.end, "start", worldPoint, metrics);
        model.geometry.start = Kroki.EditorGrid?.snapPoint(start, modifiers) || start;
      }
      if (cpId === "end") {
        const end = lineGeometry.endpointFromControl(model.geometry.start, model.geometry.end, "end", worldPoint, metrics);
        model.geometry.end = Kroki.EditorGrid?.snapPoint(end, modifiers) || end;
      }
    },

    move(model, dx, dy) {
      model.geometry.start.x += dx;
      model.geometry.start.y += dy;
      model.geometry.end.x += dx;
      model.geometry.end.y += dy;
    },

    getBounds(model) {
      const x = Math.min(model.geometry.start.x, model.geometry.end.x);
      const y = Math.min(model.geometry.start.y, model.geometry.end.y);
      return {
        x,
        y,
        width: Math.abs(model.geometry.end.x - model.geometry.start.x),
        height: Math.abs(model.geometry.end.y - model.geometry.start.y)
      };
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("path", { class: "editor-object-selection editor-line-selection" });
    },

    renderSelection(element, model, style, mode) {
      element.setAttribute("d", lineGeometry.pathData(model.geometry.start, model.geometry.end));
      element.setAttribute("stroke-width", String(style.strokeWidth + 4));
      element.setAttribute("stroke-linecap", style.lineCap);
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    pointAt,

    offsetPathData(model, offset, reverse) {
      return lineGeometry.offsetPathData(model.geometry.start, model.geometry.end, offset, reverse);
    },

    midpointTangentAngle(model, reverse = false) {
      const start = reverse ? model.geometry.end : model.geometry.start;
      const end = reverse ? model.geometry.start : model.geometry.end;
      return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
    }
  };

  registry.register("line", adapter);
})();
