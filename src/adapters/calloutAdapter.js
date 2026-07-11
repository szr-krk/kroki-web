(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !styleManager) return;

  const DEFAULT_TEXT = "METIN";
  const DEFAULT_SIZE = 12;
  const LINE_HEIGHT = 1.16;
  const WIDTH_FACTOR = 0.58;
  const PAD_X = 10;
  const PAD_Y = 8;
  const MIN_BOX_SIZE_FACTOR = 1.4;
  const BOX_RADIUS = 8;
  const DEFAULT_STROKE = "#d11f1f";
  const DEFAULT_FILL = "#ffffff";
  const DEFAULT_TEXT_COLOR = "#000000";

  function labelFor(model) {
    return styleManager.normalizeLabel(model.label, "callout");
  }

  function styleFor(model) {
    return styleManager.normalizeStyle(model.style, "callout");
  }

  function linesFor(text) {
    const lines = String(text || DEFAULT_TEXT).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    return lines.length ? lines : [DEFAULT_TEXT];
  }

  function fallbackBoxBounds(model) {
    const label = labelFor(model);
    const lines = linesFor(label.text);
    const widthFactor = label.bold ? WIDTH_FACTOR * 1.08 : WIDTH_FACTOR;
    const textWidth = Math.max(...lines.map((line) => Math.max(1, line.length))) * label.size * widthFactor;
    const textHeight = Math.max(label.size, lines.length * label.size * LINE_HEIGHT);
    const minSize = label.size * MIN_BOX_SIZE_FACTOR;
    const width = Math.max(minSize + PAD_X * 2, textWidth + PAD_X * 2);
    const height = Math.max(minSize + PAD_Y * 2, textHeight + PAD_Y * 2);
    return {
      x: model.geometry.center.x - width / 2,
      y: model.geometry.center.y - height / 2,
      width,
      height
    };
  }

  function boxAroundCenter(model, box) {
    const width = Number(box?.width);
    const height = Number(box?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
      x: model.geometry.center.x - width / 2,
      y: model.geometry.center.y - height / 2,
      width,
      height
    };
  }

  function boxBounds(model) {
    const box = model.metadata?.calloutBox;
    const centered = boxAroundCenter(model, box);
    if (centered) return centered;
    return fallbackBoxBounds(model);
  }

  function calloutBoxSignature(labelInput) {
    const label = styleManager.normalizeLabel(labelInput, "callout");
    return JSON.stringify({
      text: label.text,
      size: label.size,
      bold: Boolean(label.bold),
      italic: Boolean(label.italic)
    });
  }

  function signedBox(model, label) {
    const box = model.metadata?.calloutBox;
    if (!box || model.metadata?.calloutBoxSignature !== calloutBoxSignature(label)) return null;
    return boxAroundCenter(model, box);
  }

  function createTextElement(label, lines, textX, startY, anchor, lineHeight) {
    const text = utils.createSvgElement("text", {
      class: "editor-callout-text",
      x: String(textX),
      y: String(startY),
      fill: label.color,
      opacity: String(label.opacity),
      "font-size": String(label.size),
      "font-family": "Roboto, Arial, sans-serif",
      "font-weight": label.bold ? "900" : "500",
      "font-style": label.italic ? "italic" : "normal",
      "text-decoration": label.underline ? "underline" : "none",
      "text-anchor": anchor,
      "dominant-baseline": "middle"
    });

    lines.forEach((line, index) => {
      const tspan = utils.createSvgElement("tspan", {
        x: String(textX),
        y: String(startY + index * lineHeight)
      });
      tspan.textContent = line || " ";
      text.append(tspan);
    });
    return text;
  }

  function measureText(element, label, lines, lineHeight, anchor) {
    const probe = createTextElement(label, lines, 0, 0, anchor, lineHeight);
    probe.setAttribute("visibility", "hidden");
    element.append(probe);
    try {
      const box = probe.getBBox();
      if (Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0) {
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height
        };
      }
    } catch {
      return null;
    } finally {
      probe.remove();
    }
    return null;
  }

  function boxBoundsFromMeasurement(model, measured) {
    const label = labelFor(model);
    const minSize = label.size * MIN_BOX_SIZE_FACTOR;
    const width = Math.max(minSize + PAD_X * 2, measured.width + PAD_X * 2);
    const height = Math.max(minSize + PAD_Y * 2, measured.height + PAD_Y * 2);
    return {
      x: model.geometry.center.x - width / 2,
      y: model.geometry.center.y - height / 2,
      width,
      height
    };
  }

  function centeredTextStartY(centerY, measured) {
    if (!measured) return centerY;
    return centerY - (measured.y + measured.height / 2);
  }

  function centeredTextX(centerX, measured) {
    if (!measured) return centerX;
    return centerX - (measured.x + measured.width / 2);
  }

  function rememberBox(model, box, label) {
    model.metadata = model.metadata || {};
    model.metadata.calloutBox = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height
    };
    model.metadata.calloutBoxSignature = calloutBoxSignature(label);
  }

  function distanceToSegment(start, end, point) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
    return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
  }

  function isInsideBox(point, box, tolerance = 0) {
    return (
      point.x >= box.x - tolerance &&
      point.x <= box.x + box.width + tolerance &&
      point.y >= box.y - tolerance &&
      point.y <= box.y + box.height + tolerance
    );
  }

  function arrowPath(center, tip, strokeWidth) {
    const dx = tip.x - center.x;
    const dy = tip.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const headLength = Math.max(12, strokeWidth * 5.2);
    const headHalf = Math.max(5, strokeWidth * 2.4);
    const baseX = tip.x - ux * headLength;
    const baseY = tip.y - uy * headLength;
    return [
      "M", tip.x, tip.y,
      "L", baseX + px * headHalf, baseY + py * headHalf,
      "L", baseX - px * headHalf, baseY - py * headHalf,
      "Z"
    ].join(" ");
  }

  function normalizedVector(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return { x: 1, y: 0, length: 0 };
    return { x: dx / length, y: dy / length, length };
  }

  function dashArrayFor(style) {
    if (style.dash === "solid") return "";
    if (style.dash === "dot") return "0 " + style.dashGap;
    return style.dashSize + " " + style.dashGap;
  }

  function applyGeometryStrokeScaling(element, dashed) {
    const vectorEffect = dashed ? "none" : "non-scaling-stroke";
    element.setAttribute("vector-effect", vectorEffect);
    element.style.setProperty("vector-effect", vectorEffect);
  }

  function tipControlPoint(model, metrics = {}) {
    const offset = metrics.endpointOffset || 0;
    const direction = normalizedVector(model.geometry.center, model.geometry.tip);
    return {
      x: model.geometry.tip.x + direction.x * offset,
      y: model.geometry.tip.y + direction.y * offset
    };
  }

  function tipFromControlPoint(center, control, metrics = {}) {
    const direction = normalizedVector(center, control);
    const offset = Math.min(metrics.endpointOffset || 0, Math.max(0, direction.length - (metrics.minGap || 0)));
    return {
      x: control.x - direction.x * offset,
      y: control.y - direction.y * offset
    };
  }

  function textControlOffset(model, metrics = {}) {
    const box = boxBounds(model);
    return {
      x: 0,
      y: -(box.height / 2 + (metrics.handleGap || 0))
    };
  }

  function textControlPoint(model, metrics = {}) {
    const offset = textControlOffset(model, metrics);
    return {
      x: model.geometry.center.x + offset.x,
      y: model.geometry.center.y + offset.y
    };
  }

  function textCenterFromControlPoint(model, control, metrics = {}) {
    const offset = textControlOffset(model, metrics);
    return {
      x: control.x - offset.x,
      y: control.y - offset.y
    };
  }

  function selectionPath(model) {
    const box = boxBounds(model);
    const center = model.geometry.center;
    const tip = model.geometry.tip;
    return [
      "M", box.x, box.y,
      "L", box.x + box.width, box.y,
      "L", box.x + box.width, box.y + box.height,
      "L", box.x, box.y + box.height,
      "Z",
      "M", center.x, center.y,
      "L", tip.x, tip.y
    ].join(" ");
  }

  function unionBounds(model) {
    const box = boxBounds(model);
    const tip = model.geometry.tip;
    const minX = Math.min(box.x, tip.x);
    const minY = Math.min(box.y, tip.y);
    const maxX = Math.max(box.x + box.width, tip.x);
    const maxY = Math.max(box.y + box.height, tip.y);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  function geometryFromElement(element) {
    return {
      center: {
        x: utils.numberOr(element.dataset.centerX, 0),
        y: utils.numberOr(element.dataset.centerY, 0)
      },
      tip: {
        x: utils.numberOr(element.dataset.tipX, 0),
        y: utils.numberOr(element.dataset.tipY, 0)
      }
    };
  }

  function appendPreview(model, element) {
    const style = styleFor(model);
    const line = utils.createSvgElement("line", {
      class: "editor-callout-preview",
      x1: String(model.geometry.tip.x),
      y1: String(model.geometry.tip.y),
      x2: String(model.geometry.center.x),
      y2: String(model.geometry.center.y),
      stroke: style.stroke,
      "stroke-opacity": String(style.strokeOpacity),
      "stroke-width": String(style.strokeWidth),
      "stroke-linecap": "round",
      "stroke-dasharray": "8 5"
    });
    element.append(line);
  }

  function appendCallout(model, element) {
    const style = styleFor(model);
    const label = labelFor(model);
    const center = model.geometry.center;
    const tip = model.geometry.tip;
    const lines = linesFor(label.text);
    const lineHeight = label.size * LINE_HEIGHT;
    const align = label.position.align;
    const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    const measured = measureText(element, label, lines, lineHeight, anchor);
    const box = signedBox(model, label) || (measured ? boxBoundsFromMeasurement(model, measured) : fallbackBoxBounds(model));
    rememberBox(model, box, label);
    const startY = measured ? centeredTextStartY(center.y, measured) : center.y - ((lines.length - 1) * lineHeight) / 2;
    const textX = align === "left" ? box.x + PAD_X : align === "right" ? box.x + box.width - PAD_X : centeredTextX(center.x, measured);
    const leaderAttrs = {
      class: "editor-callout-leader",
      x1: String(center.x),
      y1: String(center.y),
      x2: String(tip.x),
      y2: String(tip.y),
      stroke: style.stroke,
      "stroke-opacity": String(style.strokeOpacity),
      "stroke-width": String(style.strokeWidth),
      "stroke-linecap": style.lineCap
    };
    const dashArray = dashArrayFor(style);
    if (dashArray) leaderAttrs["stroke-dasharray"] = dashArray;
    const dashed = Boolean(dashArray);
    const leader = utils.createSvgElement("line", leaderAttrs);
    const arrow = utils.createSvgElement("path", {
      class: "editor-callout-arrow",
      d: arrowPath(center, tip, style.strokeWidth),
      fill: style.stroke,
      "fill-opacity": String(style.strokeOpacity),
      stroke: style.stroke,
      "stroke-opacity": String(style.strokeOpacity),
      "stroke-width": String(Math.max(1, style.strokeWidth * 0.85)),
      "stroke-linejoin": "round"
    });
    const boxElement = utils.createSvgElement("rect", {
      class: "editor-callout-box",
      x: String(box.x),
      y: String(box.y),
      width: String(box.width),
      height: String(box.height),
      rx: String(Math.min(BOX_RADIUS, box.width / 2, box.height / 2)),
      ry: String(Math.min(BOX_RADIUS, box.width / 2, box.height / 2)),
      fill: style.fill,
      "fill-opacity": String(style.fillOpacity),
      stroke: style.stroke,
      "stroke-opacity": String(style.strokeOpacity),
      "stroke-width": String(style.strokeWidth)
    });
    [leader, arrow, boxElement].forEach((item) => applyGeometryStrokeScaling(item, dashed));

    element.append(leader, arrow, boxElement);

    element.append(createTextElement(label, lines, textX, startY, anchor, lineHeight));
  }

  const adapter = {
    elementTag: "g",
    className: "editor-callout",
    capabilities: { arrows: false, fill: true, curvedLabel: false, ownsLabel: true, textFormatting: true },

    create(initialData = {}) {
      const start = initialData.start || initialData.tip || { x: 0, y: 0 };
      const end = initialData.end || initialData.center || start;
      return {
        type: "callout",
        geometry: {
          center: { x: utils.numberOr(end.x, 0), y: utils.numberOr(end.y, 0) },
          tip: { x: utils.numberOr(start.x, 0), y: utils.numberOr(start.y, 0) }
        },
        style: {
          stroke: DEFAULT_STROKE,
          fill: DEFAULT_FILL,
          strokeWidth: 2,
          ...(initialData.style || {})
        },
        label: {
          text: initialData.text || DEFAULT_TEXT,
          size: initialData.size || DEFAULT_SIZE,
          color: initialData.color || DEFAULT_TEXT_COLOR,
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
        type: "callout",
        geometry: geometryFromElement(element),
        style: styleManager.readStyleFromElement(element, "callout"),
        label: styleManager.readLabelFromElement(element, "callout"),
        metadata: {}
      };
    },

    render(model, element) {
      element.replaceChildren();
      element.dataset.centerX = String(model.geometry.center.x);
      element.dataset.centerY = String(model.geometry.center.y);
      element.dataset.tipX = String(model.geometry.tip.x);
      element.dataset.tipY = String(model.geometry.tip.y);
      if (model.metadata?.draft) appendPreview(model, element);
      else appendCallout(model, element);
    },

    hitTest(model, point, tolerance) {
      const box = boxBounds(model);
      if (isInsideBox(point, box, tolerance)) return true;
      return distanceToSegment(model.geometry.center, model.geometry.tip, point) <= tolerance;
    },

    getControlPoints(model, metrics) {
      return [
        {
          id: "text",
          ...textControlPoint(model, metrics),
          role: "move-text",
          cursor: "grab"
        },
        {
          id: "tip",
          ...tipControlPoint(model, metrics),
          role: "move-tip",
          cursor: "grab"
        }
      ];
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      const metrics = modifiers.metrics || {};
      if (cpId === "text") model.geometry.center = textCenterFromControlPoint(model, worldPoint, metrics);
      if (cpId === "tip") model.geometry.tip = tipFromControlPoint(model.geometry.center, worldPoint, metrics);
    },

    move(model, dx, dy) {
      model.geometry.center.x += dx;
      model.geometry.center.y += dy;
      model.geometry.tip.x += dx;
      model.geometry.tip.y += dy;
    },

    getBounds(model) {
      return unionBounds(model);
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("path", { class: "editor-object-selection editor-callout-selection" });
    },

    renderSelection(element, model, style, mode) {
      element.setAttribute("d", selectionPath(model));
      element.setAttribute("stroke-width", String(style.strokeWidth + 4));
      element.setAttribute("stroke-linecap", "round");
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    calloutBoxSignature
  };

  registry.register("callout", adapter);
})();
