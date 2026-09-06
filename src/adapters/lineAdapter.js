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
        x: utils.numberOr(element.dataset.geometryStartX, utils.numberOr(element.getAttribute("x1"), 0)),
        y: utils.numberOr(element.dataset.geometryStartY, utils.numberOr(element.getAttribute("y1"), 0))
      },
      end: {
        x: utils.numberOr(element.dataset.geometryEndX, utils.numberOr(element.getAttribute("x2"), 0)),
        y: utils.numberOr(element.dataset.geometryEndY, utils.numberOr(element.getAttribute("y2"), 0))
      }
    };
  }

  function pointAt(model, t) {
    return {
      x: model.geometry.start.x + (model.geometry.end.x - model.geometry.start.x) * t,
      y: model.geometry.start.y + (model.geometry.end.y - model.geometry.start.y) * t
    };
  }

  function renderedEndpoints(model, style = model.style) {
    const renderModel = style === model.style ? model : { ...model, style };
    return lineGeometry.insetSegment(
      model.geometry.start,
      model.geometry.end,
      styleManager.lineEndpointMarkerOffset(renderModel, "start"),
      styleManager.lineEndpointMarkerOffset(renderModel, "end")
    );
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
      const geometry = renderedEndpoints(model);
      utils.setAttributeIfChanged(element, "data-geometry-start-x", String(model.geometry.start.x));
      utils.setAttributeIfChanged(element, "data-geometry-start-y", String(model.geometry.start.y));
      utils.setAttributeIfChanged(element, "data-geometry-end-x", String(model.geometry.end.x));
      utils.setAttributeIfChanged(element, "data-geometry-end-y", String(model.geometry.end.y));
      utils.setAttributeIfChanged(element, "x1", String(geometry.start.x));
      utils.setAttributeIfChanged(element, "y1", String(geometry.start.y));
      utils.setAttributeIfChanged(element, "x2", String(geometry.end.x));
      utils.setAttributeIfChanged(element, "y2", String(geometry.end.y));
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

    beginControlPointMove(model, cpId, point, metrics = {}) {
      const handle = cpId === "start" || cpId === "end"
        ? lineGeometry.lineEndpointControlPoint(
          model.geometry.start,
          model.geometry.end,
          cpId,
          utils.numberOr(metrics.endpointOffset, 0)
        )
        : point;
      return {
        grabOffset: {
          x: handle.x - point.x,
          y: handle.y - point.y
        }
      };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      const metrics = modifiers.metrics || { endpointOffset: 0, minGap: 0 };
      const grabOffset = modifiers.startState?.grabOffset || { x: 0, y: 0 };
      const control = {
        x: worldPoint.x + utils.numberOr(grabOffset.x, 0),
        y: worldPoint.y + utils.numberOr(grabOffset.y, 0)
      };
      if (cpId === "start") {
        const start = lineGeometry.endpointFromControl(model.geometry.start, model.geometry.end, "start", control, metrics);
        model.geometry.start = Kroki.EditorGrid?.snapPoint(start, modifiers) || start;
      }
      if (cpId === "end") {
        const end = lineGeometry.endpointFromControl(model.geometry.start, model.geometry.end, "end", control, metrics);
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
      const geometry = renderedEndpoints(model, style);
      utils.setAttributeIfChanged(element, "d", lineGeometry.pathData(geometry.start, geometry.end));
      utils.setAttributeIfChanged(element, "stroke-width", String(style.strokeWidth + 4));
      utils.setAttributeIfChanged(element, "stroke-linecap", style.lineCap);
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
