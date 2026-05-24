(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const circleGeometry = Kroki.CircleGeometry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !circleGeometry || !styleManager) return;

  function geometryFromElement(element) {
    return {
      cx: utils.numberOr(element.getAttribute("cx"), 0),
      cy: utils.numberOr(element.getAttribute("cy"), 0),
      r: Math.max(1, utils.numberOr(element.getAttribute("r"), 1)),
      rotation: utils.normalizeRotation(element.dataset.rotation)
    };
  }

  function hasFill(model) {
    const style = styleManager.normalizeStyle(model.style, "circle");
    return Boolean(
      (style.fill && style.fill !== "none" && style.fill !== "transparent") ||
      style.fillPattern !== "none"
    );
  }

  const adapter = {
    elementTag: "circle",
    className: "editor-circle",
    capabilities: { arrows: false, fill: true, curvedLabel: false },

    create(initialData = {}) {
      const geometry = initialData.geometry || circleGeometry.fromDiameter(
        initialData.start || { x: 0, y: 0 },
        initialData.end || initialData.start || { x: 0, y: 0 },
        initialData.rotation
      );
      return {
        type: "circle",
        geometry: {
          cx: utils.numberOr(geometry.cx, 0),
          cy: utils.numberOr(geometry.cy, 0),
          r: Math.max(1, utils.numberOr(geometry.r, 1)),
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
        type: "circle",
        geometry: geometryFromElement(element),
        style: styleManager.readStyleFromElement(element, "circle"),
        label: styleManager.readLabelFromElement(element, "circle"),
        metadata: {}
      };
    },

    render(model, element) {
      const geometry = model.geometry;
      element.setAttribute("cx", String(geometry.cx));
      element.setAttribute("cy", String(geometry.cy));
      element.setAttribute("r", String(Math.max(1, geometry.r)));
      element.dataset.rotation = String(utils.normalizeRotation(geometry.rotation));
      element.removeAttribute("transform");
    },

    hitTest(model, point, tolerance) {
      const geometry = model.geometry;
      const distance = Math.hypot(point.x - geometry.cx, point.y - geometry.cy);
      if (hasFill(model) && distance <= geometry.r + tolerance) return true;
      const halfStroke = model.style.strokeWidth / 2;
      return Math.abs(distance - geometry.r) <= halfStroke + tolerance;
    },

    getControlPoints(model, metrics) {
      const vector = circleGeometry.rotationVector(model.geometry.rotation);
      const distance = model.geometry.r + metrics.handleGap;
      return [{
        id: "radius",
        x: model.geometry.cx + vector.x * distance,
        y: model.geometry.cy + vector.y * distance,
        role: "resize",
        cursor: "grab"
      }];
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      if (cpId !== "radius") return;
      const dx = worldPoint.x - model.geometry.cx;
      const dy = worldPoint.y - model.geometry.cy;
      model.geometry.r = Math.max(1, Math.hypot(dx, dy) - (modifiers.metrics?.handleGap || 0));
      model.geometry.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
    },

    move(model, dx, dy) {
      model.geometry.cx += dx;
      model.geometry.cy += dy;
    },

    getBounds(model) {
      return circleGeometry.bounds(model.geometry);
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("circle", { class: "editor-object-selection editor-circle-selection" });
    },

    renderSelection(element, model, style, mode) {
      element.setAttribute("cx", String(model.geometry.cx));
      element.setAttribute("cy", String(model.geometry.cy));
      element.setAttribute("r", String(model.geometry.r));
      element.setAttribute("stroke-width", String(style.strokeWidth + 4));
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    }
  };

  registry.register("circle", adapter);
})();
