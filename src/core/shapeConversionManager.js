(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const objectManager = Kroki.EditorObjectManager;
  if (!utils || !registry || !objectManager) return;

  const OPEN_FAMILY = [
    { key: "line", title: "Çizgi", short: "Çizgi" },
    { key: "arc", title: "Yay", short: "Yay" },
    { key: "quadratic", title: "Eğri", short: "Eğri" },
    { key: "cubic", title: "Kübik eğri", short: "Kübik" }
  ];
  const CLOSED_FAMILY = [
    { key: "circle", title: "Daire", short: "Daire" },
    { key: "ellipse", title: "Elips", short: "Elips" },
    { key: "rectangle", title: "Dikdörtgen", short: "Dikdörtgen" },
    { key: "closedShape", title: "Kapalı eğri", short: "Kapalı" }
  ];
  const DEFAULT_ARC_RATIO = 0.20;
  const MIN_SIZE = 1;

  const button = document.querySelector("#btnShapeConvert");
  const buttonLabel = document.querySelector("#lblShapeConvert");

  function point(value, fallback = { x: 0, y: 0 }) {
    return {
      x: utils.numberOr(value?.x, fallback.x),
      y: utils.numberOr(value?.y, fallback.y)
    };
  }

  function midpoint(first, second) {
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
  }

  function variantKey(model) {
    if (!model || model.metadata?.draft) return "";
    if (model.type === "bezier") {
      return model.geometry?.bezierType === "cubic" ? "cubic" : "quadratic";
    }
    if (model.type === "closedShape" && model.geometry?.closed === false) return "";
    return model.type || "";
  }

  function familyFor(model) {
    const key = variantKey(model);
    if (OPEN_FAMILY.some((entry) => entry.key === key)) return OPEN_FAMILY;
    if (CLOSED_FAMILY.some((entry) => entry.key === key)) return CLOSED_FAMILY;
    return null;
  }

  function infoFor(model) {
    const family = familyFor(model);
    if (!family) return null;
    const key = variantKey(model);
    const index = family.findIndex((entry) => entry.key === key);
    if (index < 0) return null;
    return {
      family: family === OPEN_FAMILY ? "open" : "closed",
      current: family[index],
      next: family[(index + 1) % family.length]
    };
  }

  function preservedModel(source, type, geometry, metadata = source.metadata) {
    return {
      id: source.id,
      type,
      geometry,
      style: utils.clonePlain(source.style),
      label: utils.clonePlain(source.label),
      metadata: utils.clonePlain(metadata)
    };
  }

  function openEndpoints(model) {
    const start = point(model.geometry?.start);
    return {
      start,
      end: point(model.geometry?.end, start)
    };
  }

  function lineToArc(model) {
    const { start, end } = openEndpoints(model);
    return preservedModel(model, "arc", { start, end, ratio: DEFAULT_ARC_RATIO });
  }

  function arcToQuadratic(model) {
    const { start, end } = openEndpoints(model);
    const straightMidpoint = midpoint(start, end);
    const arcPointAt = registry.get("arc")?.pointAt;
    const curveMidpoint = typeof arcPointAt === "function"
      ? point(arcPointAt(model, 0.5), straightMidpoint)
      : straightMidpoint;
    const q = {
      x: 2 * curveMidpoint.x - straightMidpoint.x,
      y: 2 * curveMidpoint.y - straightMidpoint.y
    };
    return preservedModel(model, "bezier", { bezierType: "quadratic", start, end, q });
  }

  function quadraticToCubic(model) {
    const { start, end } = openEndpoints(model);
    const q = point(model.geometry?.q, midpoint(start, end));
    return preservedModel(model, "bezier", {
      bezierType: "cubic",
      start,
      end,
      c1: {
        x: start.x + (q.x - start.x) * 2 / 3,
        y: start.y + (q.y - start.y) * 2 / 3
      },
      c2: {
        x: end.x + (q.x - end.x) * 2 / 3,
        y: end.y + (q.y - end.y) * 2 / 3
      }
    });
  }

  function cubicToLine(model) {
    return preservedModel(model, "line", openEndpoints(model));
  }

  function basicFrame(model) {
    const geometry = model.geometry || {};
    const radius = Math.max(MIN_SIZE, utils.numberOr(geometry.r, MIN_SIZE));
    return {
      cx: utils.numberOr(geometry.cx, 0),
      cy: utils.numberOr(geometry.cy, 0),
      rx: Math.max(MIN_SIZE, utils.numberOr(geometry.rx, radius)),
      ry: Math.max(MIN_SIZE, utils.numberOr(geometry.ry, radius)),
      rotation: utils.normalizeRotation(geometry.rotation)
    };
  }

  function circleToEllipse(model) {
    const frame = basicFrame(model);
    const radius = Math.max(MIN_SIZE, utils.numberOr(model.geometry?.r, frame.rx));
    return preservedModel(model, "ellipse", {
      cx: frame.cx,
      cy: frame.cy,
      rx: radius,
      ry: radius,
      rotation: frame.rotation
    });
  }

  function ellipseToRectangle(model) {
    return preservedModel(model, "rectangle", basicFrame(model));
  }

  function rotatedFramePoint(frame, localX, localY) {
    const radians = frame.rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: frame.cx + cos * localX - sin * localY,
      y: frame.cy + sin * localX + cos * localY
    };
  }

  function rectangleToClosedShape(model) {
    const frame = basicFrame(model);
    const points = [
      rotatedFramePoint(frame, -frame.rx, -frame.ry),
      rotatedFramePoint(frame, frame.rx, -frame.ry),
      rotatedFramePoint(frame, frame.rx, frame.ry),
      rotatedFramePoint(frame, -frame.rx, frame.ry)
    ];
    const controls = points.map((start, index) => midpoint(start, points[(index + 1) % points.length]));
    return preservedModel(model, "closedShape", {
      points,
      controls,
      closed: true,
      frame: {
        cx: frame.cx,
        cy: frame.cy,
        width: frame.rx * 2,
        height: frame.ry * 2,
        rotation: frame.rotation
      }
    }, { ...(model.metadata || {}), draft: false, pointEdit: false });
  }

  function boundsFromClosedGeometry(geometry) {
    const values = [...(geometry?.points || []), ...(geometry?.controls || [])]
      .map((item) => point(item))
      .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
    if (!values.length) return { cx: 0, cy: 0, width: 2, height: 2, rotation: 0 };
    const xs = values.map((item) => item.x);
    const ys = values.map((item) => item.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      width: Math.max(2, maxX - minX),
      height: Math.max(2, maxY - minY),
      rotation: 0
    };
  }

  function closedFrame(model) {
    const geometry = model.geometry || {};
    const fallback = boundsFromClosedGeometry(geometry);
    const source = geometry.frame || {};
    return {
      cx: utils.numberOr(source.cx, fallback.cx),
      cy: utils.numberOr(source.cy, fallback.cy),
      width: Math.max(2, utils.numberOr(source.width, fallback.width)),
      height: Math.max(2, utils.numberOr(source.height, fallback.height)),
      rotation: utils.normalizeRotation(utils.numberOr(source.rotation, fallback.rotation))
    };
  }

  function closedShapeToCircle(model) {
    const frame = closedFrame(model);
    return preservedModel(model, "circle", {
      cx: frame.cx,
      cy: frame.cy,
      r: Math.max(MIN_SIZE, (frame.width + frame.height) / 4),
      rotation: frame.rotation
    }, { ...(model.metadata || {}), draft: false, pointEdit: false });
  }

  function nextModel(model) {
    switch (variantKey(model)) {
      case "line": return lineToArc(model);
      case "arc": return arcToQuadratic(model);
      case "quadratic": return quadraticToCubic(model);
      case "cubic": return cubicToLine(model);
      case "circle": return circleToEllipse(model);
      case "ellipse": return ellipseToRectangle(model);
      case "rectangle": return rectangleToClosedShape(model);
      case "closedShape": return closedShapeToCircle(model);
      default: return null;
    }
  }

  function syncButton(model) {
    if (!button) return;
    const info = infoFor(model);
    button.classList.toggle("gizli", !info);
    if (!info) return;
    const description = `${info.current.title} → ${info.next.title}`;
    button.title = description;
    button.setAttribute("aria-label", `${info.current.title} çizimini ${info.next.title} türüne dönüştür`);
    if (buttonLabel) buttonLabel.textContent = info.current.short;
  }

  function convert(id, options = {}) {
    const model = objectManager.get(id);
    const info = infoFor(model);
    const converted = nextModel(model);
    if (!info || !converted) return null;
    return objectManager.replaceObjectType(id, converted, {
      label: `${info.current.title} → ${info.next.title}`,
      ...options
    });
  }

  button?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    Kroki.SelectionManager?.promoteToEdit?.();
    const id = Kroki.SelectionManager?.getActiveId?.();
    if (id) convert(id);
  });

  Kroki.ShapeConversionManager = {
    infoFor,
    nextModel,
    convert,
    syncButton
  };
})();
