(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const ellipseGeometry = Kroki.EllipseGeometry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !ellipseGeometry || !styleManager) return;

  const CORNERS = [
    { id: "nw", sx: -1, sy: -1 },
    { id: "ne", sx: 1, sy: -1 },
    { id: "se", sx: 1, sy: 1 },
    { id: "sw", sx: -1, sy: 1 }
  ];

  function cornerById(id) {
    return CORNERS.find((corner) => corner.id === id) || null;
  }

  function geometryFromElement(element) {
    return {
      cx: utils.numberOr(element.getAttribute("cx"), 0),
      cy: utils.numberOr(element.getAttribute("cy"), 0),
      rx: Math.max(1, utils.numberOr(element.getAttribute("rx"), 1)),
      ry: Math.max(1, utils.numberOr(element.getAttribute("ry"), 1)),
      rotation: utils.normalizeRotation(element.dataset.rotation)
    };
  }

  function hasFill(model) {
    const style = styleManager.normalizeStyle(model.style, "ellipse");
    return Boolean(
      (style.fill && style.fill !== "none" && style.fill !== "transparent") ||
      style.fillPattern !== "none"
    );
  }

  function cornerPoint(model, corner) {
    return ellipseGeometry.localPoint(model.geometry, corner.sx * model.geometry.rx, corner.sy * model.geometry.ry);
  }

  const adapter = {
    elementTag: "ellipse",
    className: "editor-ellipse",
    capabilities: { arrows: false, fill: true, curvedLabel: false },

    getRotation(model) {
      return utils.normalizeRotation(model.geometry?.rotation);
    },

    setRotation(model, rotation) {
      model.geometry.rotation = utils.normalizeRotation(rotation);
    },

    create(initialData = {}) {
      const geometry = initialData.geometry || ellipseGeometry.fromBounds(
        initialData.start || { x: 0, y: 0 },
        initialData.end || initialData.start || { x: 0, y: 0 },
        initialData.rotation
      );
      return {
        type: "ellipse",
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
        type: "ellipse",
        geometry: geometryFromElement(element),
        style: styleManager.readStyleFromElement(element, "ellipse"),
        label: styleManager.readLabelFromElement(element, "ellipse"),
        metadata: {}
      };
    },

    render(model, element) {
      const geometry = model.geometry;
      utils.setAttributeIfChanged(element, "cx", String(geometry.cx));
      utils.setAttributeIfChanged(element, "cy", String(geometry.cy));
      utils.setAttributeIfChanged(element, "rx", String(Math.max(1, geometry.rx)));
      utils.setAttributeIfChanged(element, "ry", String(Math.max(1, geometry.ry)));
      utils.setAttributeIfChanged(element, "data-rotation", String(utils.normalizeRotation(geometry.rotation)));
      utils.setAttributeIfChanged(element, "transform", `rotate(${utils.normalizeRotation(geometry.rotation)} ${geometry.cx} ${geometry.cy})`);
    },

    hitTest(model, point, tolerance) {
      const geometry = model.geometry;
      const local = ellipseGeometry.pointToLocal(geometry, point);
      if (hasFill(model)) {
        const rx = geometry.rx + tolerance;
        const ry = geometry.ry + tolerance;
        return (local.x * local.x) / (rx * rx) + (local.y * local.y) / (ry * ry) <= 1;
      }

      const outerRx = geometry.rx + model.style.strokeWidth / 2 + tolerance;
      const outerRy = geometry.ry + model.style.strokeWidth / 2 + tolerance;
      const innerRx = Math.max(0.001, geometry.rx - model.style.strokeWidth / 2 - tolerance);
      const innerRy = Math.max(0.001, geometry.ry - model.style.strokeWidth / 2 - tolerance);
      const outer = (local.x * local.x) / (outerRx * outerRx) + (local.y * local.y) / (outerRy * outerRy) <= 1;
      const inner = (local.x * local.x) / (innerRx * innerRx) + (local.y * local.y) / (innerRy * innerRy) < 1;
      return outer && !inner;
    },

    getControlPoints(model, metrics) {
      const points = CORNERS.map((corner) => ({
        id: corner.id,
        ...cornerPoint(model, corner),
        role: "resize",
        sx: corner.sx,
        sy: corner.sy,
        cursor: "grab"
      }));
      points.push({
        id: "rotate",
        ...ellipseGeometry.localPoint(model.geometry, model.geometry.rx + metrics.handleGap, 0),
        role: "rotate",
        cursor: "grab"
      });
      return points;
    },

    beginControlPointMove(model, cpId) {
      const corner = cornerById(cpId);
      if (!corner) return { cpId, geometry: utils.clonePlain(model.geometry) };
      return {
        cpId,
        fixedPoint: ellipseGeometry.localPoint(model.geometry, -corner.sx * model.geometry.rx, -corner.sy * model.geometry.ry),
        rotation: model.geometry.rotation,
        sx: corner.sx,
        sy: corner.sy
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
      worldPoint = Kroki.EditorGrid?.snapPoint(worldPoint, modifiers) || worldPoint;
      const axes = ellipseGeometry.rotationAxes(state.rotation);
      const dx = worldPoint.x - state.fixedPoint.x;
      const dy = worldPoint.y - state.fixedPoint.y;
      const localX = dx * axes.xAxis.x + dy * axes.xAxis.y;
      const localY = dx * axes.yAxis.x + dy * axes.yAxis.y;
      const halfX = ellipseGeometry.signedHalfDistance(localX, state.sx);
      const halfY = ellipseGeometry.signedHalfDistance(localY, state.sy);
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
      return ellipseGeometry.bounds(model.geometry);
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("rect", { class: "editor-object-selection editor-ellipse-selection" });
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

  registry.register("ellipse", adapter);
})();
