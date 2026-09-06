(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const rectangleGeometry = Kroki.RectangleGeometry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !rectangleGeometry || !styleManager) return;

  const CORNERS = [
    { id: "nw", sx: -1, sy: -1 },
    { id: "ne", sx: 1, sy: -1 },
    { id: "se", sx: 1, sy: 1 },
    { id: "sw", sx: -1, sy: 1 }
  ];
  const CORNER_HANDLE_OFFSET_RATIO = 1.15;

  function cornerById(id) {
    return CORNERS.find((corner) => corner.id === id) || null;
  }

  function cornerHandleOffset(metrics) {
    return Math.max(metrics?.minGap || 0, (metrics?.visibleRadius || 0) * CORNER_HANDLE_OFFSET_RATIO);
  }

  function geometryFromElement(element) {
    const x = utils.numberOr(element.getAttribute("x"), 0);
    const y = utils.numberOr(element.getAttribute("y"), 0);
    const width = Math.max(2, utils.numberOr(element.getAttribute("width"), 2));
    const height = Math.max(2, utils.numberOr(element.getAttribute("height"), 2));
    return {
      cx: x + width / 2,
      cy: y + height / 2,
      rx: Math.max(1, width / 2),
      ry: Math.max(1, height / 2),
      rotation: utils.normalizeRotation(element.dataset.rotation)
    };
  }

  function hasFill(model) {
    const style = styleManager.normalizeStyle(model.style, "rectangle");
    return Boolean(
      (style.fill && style.fill !== "none" && style.fill !== "transparent") ||
      style.fillPattern !== "none"
    );
  }

  function isInside(local, rx, ry) {
    return Math.abs(local.x) <= rx && Math.abs(local.y) <= ry;
  }

  function cornerPoint(model, corner, metrics) {
    const offset = cornerHandleOffset(metrics);
    return rectangleGeometry.localPoint(
      model.geometry,
      corner.sx * (model.geometry.rx + offset),
      corner.sy * (model.geometry.ry + offset)
    );
  }

  function offsetWorldPoint(point, state, offset) {
    const axes = rectangleGeometry.rotationAxes(state.rotation);
    return {
      x: point.x - axes.xAxis.x * state.sx * offset - axes.yAxis.x * state.sy * offset,
      y: point.y - axes.xAxis.y * state.sx * offset - axes.yAxis.y * state.sy * offset
    };
  }

  const adapter = {
    elementTag: "rect",
    className: "editor-rectangle",
    capabilities: { arrows: false, fill: true, curvedLabel: false },

    getRotation(model) {
      return utils.normalizeRotation(model.geometry?.rotation);
    },

    setRotation(model, rotation) {
      model.geometry.rotation = utils.normalizeRotation(rotation);
    },

    create(initialData = {}) {
      const geometry = initialData.geometry || rectangleGeometry.fromBounds(
        initialData.start || { x: 0, y: 0 },
        initialData.end || initialData.start || { x: 0, y: 0 },
        initialData.rotation
      );
      return {
        type: "rectangle",
        geometry: {
          cx: utils.numberOr(geometry.cx, 0),
          cy: utils.numberOr(geometry.cy, 0),
          rx: Math.max(1, utils.numberOr(geometry.rx, 1)),
          ry: Math.max(1, utils.numberOr(geometry.ry, 1)),
          rotation: utils.normalizeRotation(geometry.rotation)
        },
        style: initialData.style,
        label: initialData.label,
        metadata: initialData.metadata
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "rectangle",
        geometry: geometryFromElement(element),
        style: styleManager.readStyleFromElement(element, "rectangle"),
        label: styleManager.readLabelFromElement(element, "rectangle"),
        metadata: {}
      };
    },

    render(model, element) {
      const geometry = model.geometry;
      const rx = Math.max(1, geometry.rx);
      const ry = Math.max(1, geometry.ry);
      utils.setAttributeIfChanged(element, "x", String(geometry.cx - rx));
      utils.setAttributeIfChanged(element, "y", String(geometry.cy - ry));
      utils.setAttributeIfChanged(element, "width", String(rx * 2));
      utils.setAttributeIfChanged(element, "height", String(ry * 2));
      utils.setAttributeIfChanged(element, "data-rotation", String(utils.normalizeRotation(geometry.rotation)));
      utils.setAttributeIfChanged(element, "transform", `rotate(${utils.normalizeRotation(geometry.rotation)} ${geometry.cx} ${geometry.cy})`);
    },

    hitTest(model, point, tolerance) {
      const geometry = model.geometry;
      const local = rectangleGeometry.pointToLocal(geometry, point);
      if (hasFill(model)) {
        return isInside(local, geometry.rx + tolerance, geometry.ry + tolerance);
      }

      const edge = model.style.strokeWidth / 2 + tolerance;
      const outer = isInside(local, geometry.rx + edge, geometry.ry + edge);
      const inner = isInside(local, Math.max(0, geometry.rx - edge), Math.max(0, geometry.ry - edge));
      return outer && !inner;
    },

    getControlPoints(model, metrics) {
      const points = CORNERS.map((corner) => ({
        id: corner.id,
        ...cornerPoint(model, corner, metrics),
        role: "resize",
        sx: corner.sx,
        sy: corner.sy,
        cursor: "grab"
      }));
      points.push({
        id: "rotate",
        ...rectangleGeometry.localPoint(model.geometry, model.geometry.rx + metrics.handleGap, 0),
        role: "rotate",
        cursor: "grab"
      });
      return points;
    },

    beginControlPointMove(model, cpId, point, metrics) {
      const corner = cornerById(cpId);
      if (!corner) return { cpId, geometry: utils.clonePlain(model.geometry) };
      return {
        cpId,
        fixedPoint: rectangleGeometry.localPoint(model.geometry, -corner.sx * model.geometry.rx, -corner.sy * model.geometry.ry),
        rotation: model.geometry.rotation,
        sx: corner.sx,
        sy: corner.sy,
        cornerHandleOffset: cornerHandleOffset(metrics)
      };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      if (cpId === "rotate") {
        const angle = Math.atan2(worldPoint.y - model.geometry.cy, worldPoint.x - model.geometry.cx) * 180 / Math.PI;
        model.geometry.rotation = utils.normalizeRotation(Kroki.EditorGrid?.snapAngle(angle, modifiers) ?? angle);
        return;
      }

      const state = modifiers.startState;
      if (!state?.fixedPoint) return;
      const axes = rectangleGeometry.rotationAxes(state.rotation);
      let cornerPoint = offsetWorldPoint(
        worldPoint,
        state,
        utils.numberOr(state.cornerHandleOffset, cornerHandleOffset(modifiers.metrics))
      );
      cornerPoint = Kroki.EditorGrid?.snapPoint(cornerPoint, modifiers) || cornerPoint;
      const dx = cornerPoint.x - state.fixedPoint.x;
      const dy = cornerPoint.y - state.fixedPoint.y;
      const localX = dx * axes.xAxis.x + dy * axes.xAxis.y;
      const localY = dx * axes.yAxis.x + dy * axes.yAxis.y;
      const halfX = rectangleGeometry.signedHalfDistance(localX, state.sx);
      const halfY = rectangleGeometry.signedHalfDistance(localY, state.sy);
      model.geometry.cx = state.fixedPoint.x + axes.xAxis.x * halfX + axes.yAxis.x * halfY;
      model.geometry.cy = state.fixedPoint.y + axes.xAxis.y * halfX + axes.yAxis.y * halfY;
      model.geometry.rx = Math.abs(halfX);
      model.geometry.ry = Math.abs(halfY);
      model.geometry.rotation = state.rotation;
    },

    move(model, dx, dy) {
      model.geometry.cx += dx;
      model.geometry.cy += dy;
    },

    getBounds(model) {
      return rectangleGeometry.bounds(model.geometry);
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("rect", { class: "editor-object-selection editor-rectangle-selection" });
    },

    renderSelection(element, model, style, mode) {
      const geometry = model.geometry;
      utils.setAttributeIfChanged(element, "x", String(geometry.cx - geometry.rx));
      utils.setAttributeIfChanged(element, "y", String(geometry.cy - geometry.ry));
      utils.setAttributeIfChanged(element, "width", String(geometry.rx * 2));
      utils.setAttributeIfChanged(element, "height", String(geometry.ry * 2));
      utils.setAttributeIfChanged(element, "stroke-width", String(style.strokeWidth + 4));
      utils.setAttributeIfChanged(element, "transform", `rotate(${geometry.rotation} ${geometry.cx} ${geometry.cy})`);
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    }
  };

  registry.register("rectangle", adapter);
})();
