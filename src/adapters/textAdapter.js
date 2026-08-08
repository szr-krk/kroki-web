(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !styleManager) return;

  const DEFAULT_TEXT = "METIN";
  const DEFAULT_SIZE = 28;
  const LINE_HEIGHT = 1.16;
  const WIDTH_FACTOR = 0.58;

  function labelFor(model) {
    return styleManager.normalizeLabel(model.label, "text");
  }

  function styleFor(model) {
    return styleManager.normalizeStyle(model.style, "text");
  }

  function linesFor(text) {
    const lines = String(text || DEFAULT_TEXT).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    return lines.length ? lines : [DEFAULT_TEXT];
  }

  function textBounds(model) {
    const label = labelFor(model);
    const lines = linesFor(label.text);
    const widthFactor = label.bold ? WIDTH_FACTOR * 1.08 : WIDTH_FACTOR;
    const width = Math.max(label.size, Math.max(...lines.map((line) => Math.max(1, line.length))) * label.size * widthFactor);
    const height = Math.max(label.size, lines.length * label.size * LINE_HEIGHT);
    const align = label.position.align;
    const x = align === "left" ? 0 : align === "right" ? -width : -width / 2;
    return {
      x,
      y: -height / 2,
      width,
      height
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

  function centerLocal(model, bounds = textBounds(model)) {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  }

  function centerWorld(model, bounds = textBounds(model)) {
    const center = centerLocal(model, bounds);
    return {
      x: model.geometry.x + center.x,
      y: model.geometry.y + center.y
    };
  }

  function localPoint(model, localX, localY, bounds = textBounds(model)) {
    const geometry = model.geometry;
    const center = centerLocal(model, bounds);
    const pivot = centerWorld(model, bounds);
    const axes = rotationAxes(geometry.rotation);
    return {
      x: pivot.x + axes.xAxis.x * (localX - center.x) + axes.yAxis.x * (localY - center.y),
      y: pivot.y + axes.xAxis.y * (localX - center.x) + axes.yAxis.y * (localY - center.y)
    };
  }

  function pointToLocal(model, point, bounds = textBounds(model)) {
    const geometry = model.geometry;
    const center = centerLocal(model, bounds);
    const pivot = centerWorld(model, bounds);
    const axes = rotationAxes(geometry.rotation);
    const dx = point.x - pivot.x;
    const dy = point.y - pivot.y;
    return {
      x: center.x + dx * axes.xAxis.x + dy * axes.xAxis.y,
      y: center.y + dx * axes.yAxis.x + dy * axes.yAxis.y
    };
  }

  function isInsideBounds(local, bounds, tolerance) {
    return (
      local.x >= bounds.x - tolerance &&
      local.x <= bounds.x + bounds.width + tolerance &&
      local.y >= bounds.y - tolerance &&
      local.y <= bounds.y + bounds.height + tolerance
    );
  }

  function geometryFromElement(element) {
    return {
      x: utils.numberOr(element.dataset.x || element.getAttribute("x"), 0),
      y: utils.numberOr(element.dataset.y || element.getAttribute("y"), 0),
      rotation: utils.normalizeRotation(element.dataset.rotation)
    };
  }

  function tspanAnchorX(geometry, bounds, align) {
    if (align === "left") return geometry.x + bounds.x;
    if (align === "right") return geometry.x + bounds.x + bounds.width;
    return geometry.x;
  }

  const adapter = {
    elementTag: "text",
    className: "editor-text",
    capabilities: { arrows: false, fill: false, curvedLabel: false, textObject: true },

    getRotation(model) {
      return utils.normalizeRotation(model.geometry?.rotation);
    },

    setRotation(model, rotation) {
      model.geometry.rotation = utils.normalizeRotation(rotation);
    },

    create(initialData = {}) {
      const geometry = initialData.geometry || {};
      return {
        type: "text",
        geometry: {
          x: utils.numberOr(geometry.x, 0),
          y: utils.numberOr(geometry.y, 0),
          rotation: utils.normalizeRotation(geometry.rotation)
        },
        style: initialData.style,
        label: {
          text: initialData.text || DEFAULT_TEXT,
          size: initialData.size || DEFAULT_SIZE,
          color: initialData.color,
          position: { align: initialData.align },
          bold: initialData.bold,
          italic: initialData.italic,
          underline: initialData.underline,
          ...(initialData.label || {})
        },
        metadata: initialData.metadata
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "text",
        geometry: geometryFromElement(element),
        style: styleManager.readStyleFromElement(element, "text"),
        label: styleManager.readLabelFromElement(element, "text"),
        metadata: {}
      };
    },

    render(model, element) {
      const geometry = model.geometry;
      const label = labelFor(model);
      const style = styleFor(model);
      const lines = linesFor(label.text);
      const bounds = textBounds(model);
      const pivot = centerWorld(model, bounds);
      const lineHeight = label.size * LINE_HEIGHT;
      const startY = geometry.y - ((lines.length - 1) * lineHeight) / 2;
      const anchorX = tspanAnchorX(geometry, bounds, label.position.align);

      element.replaceChildren();
      element.dataset.x = String(geometry.x);
      element.dataset.y = String(geometry.y);
      element.dataset.rotation = String(utils.normalizeRotation(geometry.rotation));
      element.setAttribute("x", String(anchorX));
      element.setAttribute("y", String(geometry.y));
      element.setAttribute("fill", label.color);
      element.setAttribute("opacity", String(style.opacity));
      element.setAttribute("font-size", String(label.size));
      element.setAttribute("font-family", "Roboto, Arial, sans-serif");
      element.setAttribute("font-weight", label.bold ? "900" : "500");
      element.setAttribute("font-style", label.italic ? "italic" : "normal");
      element.setAttribute("text-decoration", label.underline ? "underline" : "none");
      element.setAttribute("text-anchor", label.position.align === "left" ? "start" : label.position.align === "right" ? "end" : "middle");
      element.setAttribute("dominant-baseline", "middle");
      element.setAttribute("transform", `rotate(${utils.normalizeRotation(geometry.rotation)} ${pivot.x} ${pivot.y})`);

      lines.forEach((line, index) => {
        const tspan = utils.createSvgElement("tspan", {
          x: String(anchorX),
          y: String(startY + index * lineHeight)
        });
        tspan.textContent = line || " ";
        element.append(tspan);
      });
    },

    hitTest(model, point, tolerance) {
      const bounds = textBounds(model);
      return isInsideBounds(pointToLocal(model, point, bounds), bounds, tolerance);
    },

    getControlPoints(model, metrics) {
      const bounds = textBounds(model);
      return [{
        id: "rotate",
        ...localPoint(model, bounds.x + bounds.width + metrics.handleGap, 0, bounds),
        role: "rotate",
        cursor: "grab"
      }];
    },

    moveControlPoint(model, cpId, worldPoint) {
      if (cpId !== "rotate") return;
      const pivot = centerWorld(model);
      model.geometry.rotation = Math.atan2(worldPoint.y - pivot.y, worldPoint.x - pivot.x) * 180 / Math.PI;
    },

    move(model, dx, dy) {
      model.geometry.x += dx;
      model.geometry.y += dy;
    },

    getBounds(model) {
      const bounds = textBounds(model);
      return {
        x: model.geometry.x + bounds.x,
        y: model.geometry.y + bounds.y,
        width: bounds.width,
        height: bounds.height
      };
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("rect", { class: "editor-object-selection editor-text-selection" });
    },

    renderSelection(element, model, style, mode) {
      const bounds = textBounds(model);
      const pivot = centerWorld(model, bounds);
      element.setAttribute("x", String(model.geometry.x + bounds.x));
      element.setAttribute("y", String(model.geometry.y + bounds.y));
      element.setAttribute("width", String(bounds.width));
      element.setAttribute("height", String(bounds.height));
      element.setAttribute("stroke-width", "4");
      element.setAttribute("transform", `rotate(${model.geometry.rotation} ${pivot.x} ${pivot.y})`);
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    }
  };

  registry.register("text", adapter);
})();
