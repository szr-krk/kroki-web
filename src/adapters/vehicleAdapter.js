(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const catalog = Kroki.VehicleCatalog;
  if (!utils || !registry || !catalog) return;

  const MIN_SCALE = 0.05;
  const MAX_SCALE = 4;
  const SELECTION_FRAME_SCALE = 1.12;
  const MULTI_SELECTION_STROKE_WIDTH = 4;
  const VEHICLE_LABEL_POSITIONS = ["top", "right", "bottom", "left"];
  const VEHICLE_LABEL_MAX_LENGTH = 24;
  const VEHICLE_LABEL_FONT_SIZE = 16;
  const VEHICLE_LABEL_EDGE_CLEARANCE = 2;
  const REPRESENTATIVE_DASH = "1 1";
  const REPRESENTATIVE_SMALL_DASH = "0.8 0.8";
  const REPRESENTATIVE_SMALL_SIZE_THRESHOLD = 50;
  const REPRESENTATIVE_STROKE = "#111827";
  const REPRESENTATIVE_STROKE_WIDTH = 0.3;
  const metricsCache = new WeakMap();

  function clampScale(value) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return 1;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function normalizeVehicleLabelText(value) {
    return String(value || "")
      .replace(/[\r\n]+/g, " ")
      .toLocaleUpperCase("tr-TR")
      .slice(0, VEHICLE_LABEL_MAX_LENGTH);
  }

  function normalizeVehicleLabelPosition(value) {
    return VEHICLE_LABEL_POSITIONS.includes(value) ? value : "top";
  }

  function normalizeVehicleMetadata(metadata = {}) {
    return {
      ...metadata,
      vehicleLabelText: normalizeVehicleLabelText(metadata.vehicleLabelText),
      vehicleLabelPosition: normalizeVehicleLabelPosition(metadata.vehicleLabelPosition)
    };
  }

  function create(tag, attrs = {}) {
    const element = utils.createSvgElement(tag, attrs);
    Object.entries(attrs || {}).forEach(([name, value]) => {
      if (value == null) element.removeAttribute(name);
    });
    return element;
  }

  function append(parent, tag, attrs = {}) {
    const child = create(tag, attrs);
    parent.append(child);
    return child;
  }

  function vehicleFromModel(model) {
    const metadata = model?.metadata || {};
    return catalog.findVariant(metadata.vehicleVariantKey)
      || catalog.findVariant(metadata.vehicleTypeId, metadata.vehicleVariantId)
      || catalog.allVariants()[0]
      || null;
  }

  function vehicleView(model, variant) {
    return catalog.normalizeView(variant, model?.metadata?.vehicleView || "top");
  }

  function baseMetrics(model) {
    const metadata = model.metadata || {};
    const geometry = model.geometry || {};
    const scale = clampScale(geometry.scale);
    const cacheKey = [
      metadata.vehicleVariantKey || "",
      metadata.vehicleTypeId || "",
      metadata.vehicleVariantId || "",
      metadata.vehicleView || "top",
      scale
    ].join("|");
    const cached = metricsCache.get(model);
    if (cached?.key === cacheKey) return cached.metrics;

    const variant = vehicleFromModel(model);
    const view = vehicleView(model, variant);
    const dimensions = catalog.dimensionsForView(variant, view);
    const metrics = {
      variant,
      view,
      kind: variant?.kind || "car",
      baseWidth: dimensions.width,
      baseHeight: dimensions.height,
      width: dimensions.width * scale,
      height: dimensions.height * scale,
      scale
    };
    metricsCache.set(model, { key: cacheKey, metrics });
    return metrics;
  }

  function bodyStyle(metadata = {}) {
    const ghost = Boolean(metadata.vehicleGhost);
    return {
      fill: ghost ? "#ffffff" : (metadata.vehicleColor || "#000000"),
      stroke: "#111827",
      strokeWidth: 2.2,
      dash: ghost ? "1 1" : null
    };
  }

  function wheel(group, x, y, r, metadata) {
    append(group, "circle", {
      cx: x,
      cy: y,
      r,
      fill: metadata?.vehicleGhost ? "#ffffff" : "#111827",
      stroke: "#111827",
      "stroke-width": 1.6
    });
  }

  function parseViewBox(viewBox) {
    const parts = String(viewBox || "").trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || parts[2] <= 0 || parts[3] <= 0) {
      return null;
    }
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }

  function customViewFor(variant, view) {
    const custom = variant?.views?.[view];
    return custom && Array.isArray(custom.paths) && custom.paths.length && parseViewBox(custom.viewBox)
      ? custom
      : null;
  }

  function pathStyleFor(role, metadata = {}, path = {}) {
    const style = bodyStyle(metadata);
    const color = metadata?.vehicleColor || "#000000";
    const cleanRole = role || "detail";
    const attrs = {
      fill: "none",
      stroke: style.stroke,
      "stroke-width": path.strokeWidth || 3,
      "stroke-linecap": path.lineCap || (style.dash ? "butt" : "round"),
      "stroke-linejoin": path.lineJoin || "round",
      "stroke-dasharray": style.dash
    };

    if (cleanRole === "body") {
      attrs.fill = style.fill;
      attrs.stroke = style.stroke;
      attrs["stroke-width"] = path.strokeWidth || style.strokeWidth;
    } else if (cleanRole === "frame") {
      attrs.stroke = metadata?.vehicleGhost ? style.stroke : color;
    } else if (cleanRole === "window") {
      attrs.fill = metadata?.vehicleGhost ? "#ffffff" : "rgba(255,255,255,.32)";
      attrs.stroke = style.stroke;
      attrs["stroke-width"] = path.strokeWidth || 2.4;
    } else if (cleanRole === "solid") {
      attrs.fill = path.fill || style.stroke;
      attrs.stroke = path.stroke || style.stroke;
    } else if (cleanRole === "wheel") {
      attrs.fill = path.fill || "none";
      attrs.stroke = path.stroke || style.stroke;
    }

    if (path.fill) attrs.fill = path.fill === "vehicle" ? style.fill : path.fill;
    if (path.stroke) attrs.stroke = path.stroke === "vehicle" ? (metadata?.vehicleGhost ? style.stroke : color) : path.stroke;
    return attrs;
  }

  function representativeDashFor(metrics = {}) {
    const longestSide = Math.max(Number(metrics.baseWidth) || 0, Number(metrics.baseHeight) || 0);
    return longestSide > 0 && longestSide < REPRESENTATIVE_SMALL_SIZE_THRESHOLD
      ? REPRESENTATIVE_SMALL_DASH
      : REPRESENTATIVE_DASH;
  }

  function hasVisiblePaint(value) {
    const paint = String(value || "").trim().toLowerCase();
    return Boolean(paint) && paint !== "none" && paint !== "transparent";
  }

  function applyRepresentativeStyle(group, metrics, metadata = {}) {
    if (!metadata.vehicleGhost) return;
    const dash = representativeDashFor(metrics);
    group.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon").forEach((element) => {
      if (hasVisiblePaint(element.getAttribute("fill"))) {
        element.setAttribute("fill", "#ffffff");
      }

      if (!hasVisiblePaint(element.getAttribute("stroke"))) {
        element.removeAttribute("stroke-dasharray");
        return;
      }

      element.setAttribute("stroke", REPRESENTATIVE_STROKE);
      element.setAttribute("stroke-width", String(REPRESENTATIVE_STROKE_WIDTH));
      element.setAttribute("stroke-dasharray", dash);
      element.setAttribute("stroke-linecap", "butt");
      element.setAttribute("vector-effect", "non-scaling-stroke");
    });
  }

  function drawCustomVehicleArt(group, metrics, metadata = {}) {
    const { variant, baseWidth: w, baseHeight: h, view } = metrics;
    const custom = customViewFor(variant, view);
    const box = parseViewBox(custom?.viewBox);
    if (!custom || !box) return false;
    const scale = Math.min(w / box.width, h / box.height);
    const fittedWidth = box.width * scale;
    const fittedHeight = box.height * scale;
    const offsetX = (w - fittedWidth) / 2;
    const offsetY = (h - fittedHeight) / 2;

    const art = append(group, "g", {
      transform: [
        `translate(${-w / 2 + offsetX} ${-h / 2 + offsetY})`,
        `scale(${scale})`,
        `translate(${-box.x} ${-box.y})`
      ].join(" ")
    });

    custom.paths.forEach((path) => {
      if (!path?.d) return;
      if (metadata?.vehicleGhost && path.ghost === "hide") return;
      append(art, "path", {
        d: path.d,
        transform: path.transform || null,
        ...pathStyleFor(path.role, metadata, path)
      });
    });
    return true;
  }

  function drawNarrowTop(group, w, h, metadata) {
    const style = bodyStyle(metadata);
    const r = Math.max(3, w * 0.24);
    append(group, "line", {
      x1: 0,
      y1: -h * 0.34,
      x2: 0,
      y2: h * 0.34,
      stroke: style.stroke,
      "stroke-width": Math.max(3, w * 0.18),
      "stroke-linecap": "round",
      "stroke-dasharray": style.dash
    });
    wheel(group, 0, -h * 0.42, r, metadata);
    wheel(group, 0, h * 0.42, r, metadata);
    append(group, "line", {
      x1: -w * 0.45,
      y1: -h * 0.08,
      x2: w * 0.45,
      y2: -h * 0.08,
      stroke: style.stroke,
      "stroke-width": Math.max(1.5, w * 0.08),
      "stroke-linecap": "round",
      "stroke-dasharray": style.dash
    });
  }

  function drawTopBody(group, w, h, metadata, kind) {
    const style = bodyStyle(metadata);
    const rx = Math.max(3, Math.min(w, h) * (kind === "car" ? 0.22 : 0.12));
    append(group, "rect", {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx,
      fill: style.fill,
      stroke: style.stroke,
      "stroke-width": style.strokeWidth,
      "stroke-dasharray": style.dash
    });

    if (kind === "long" || kind === "rail") {
      append(group, "line", {
        x1: -w * 0.35,
        y1: -h * 0.28,
        x2: w * 0.35,
        y2: -h * 0.28,
        stroke: style.stroke,
        "stroke-width": 1.5,
        "stroke-dasharray": style.dash
      });
      append(group, "line", {
        x1: -w * 0.35,
        y1: h * 0.28,
        x2: w * 0.35,
        y2: h * 0.28,
        stroke: style.stroke,
        "stroke-width": 1.5,
        "stroke-dasharray": style.dash
      });
    } else {
      append(group, "ellipse", {
        cx: 0,
        cy: -h * 0.08,
        rx: w * 0.34,
        ry: h * 0.17,
        fill: metadata?.vehicleGhost ? "#ffffff" : "rgba(255,255,255,.28)",
        stroke: style.stroke,
        "stroke-width": 1.4,
        "stroke-dasharray": style.dash
      });
      append(group, "line", {
        x1: -w * 0.36,
        y1: h * 0.16,
        x2: w * 0.36,
        y2: h * 0.16,
        stroke: style.stroke,
        "stroke-width": 1.3,
        "stroke-dasharray": style.dash
      });
    }
  }

  function drawSideBody(group, w, h, metadata, kind) {
    const style = bodyStyle(metadata);
    const bodyHeight = kind === "narrow" ? h * 0.45 : h * 0.62;
    append(group, "rect", {
      x: -w / 2,
      y: -bodyHeight / 2,
      width: w,
      height: bodyHeight,
      rx: Math.max(3, bodyHeight * 0.18),
      fill: style.fill,
      stroke: style.stroke,
      "stroke-width": style.strokeWidth,
      "stroke-dasharray": style.dash
    });

    if (kind !== "narrow") {
      append(group, "path", {
        d: `M${-w * 0.28} ${-bodyHeight / 2}H${w * 0.15}L${w * 0.3} 0H${-w * 0.38}Z`,
        fill: metadata?.vehicleGhost ? "#ffffff" : "rgba(255,255,255,.32)",
        stroke: style.stroke,
        "stroke-width": 1.4,
        "stroke-dasharray": style.dash
      });
    }

    const wr = Math.max(3, Math.min(w, h) * 0.12);
    wheel(group, -w * 0.32, bodyHeight * 0.44, wr, metadata);
    wheel(group, w * 0.32, bodyHeight * 0.44, wr, metadata);
  }

  function drawUpsideDown(group, w, h, metadata, kind) {
    const ghostMetadata = { ...metadata, vehicleGhost: Boolean(metadata?.vehicleGhost), vehicleColor: "#ffffff" };
    drawTopBody(group, w, h, ghostMetadata, kind);
    append(group, "line", {
      x1: -w * 0.34,
      y1: -h * 0.34,
      x2: w * 0.34,
      y2: h * 0.34,
      stroke: "#111827",
      "stroke-width": 1.6,
      "stroke-linecap": "round",
      "stroke-dasharray": metadata?.vehicleGhost ? "7 5" : null
    });
    append(group, "line", {
      x1: w * 0.34,
      y1: -h * 0.34,
      x2: -w * 0.34,
      y2: h * 0.34,
      stroke: "#111827",
      "stroke-width": 1.6,
      "stroke-linecap": "round",
      "stroke-dasharray": metadata?.vehicleGhost ? "7 5" : null
    });
  }

  function drawVehicleArt(group, metrics, metadata = {}) {
    if (!drawCustomVehicleArt(group, metrics, metadata)) {
      const { baseWidth: w, baseHeight: h, kind, view } = metrics;
      if (kind === "narrow" && view !== "side") {
        drawNarrowTop(group, w, h, metadata);
      } else if (view === "side") {
        drawSideBody(group, w, h, metadata, kind);
      } else if (view === "upsideDown") {
        drawUpsideDown(group, w, h, metadata, kind);
      } else {
        drawTopBody(group, w, h, metadata, kind);
      }
    }
    applyRepresentativeStyle(group, metrics, metadata);
  }

  function vehicleBodyFor(element) {
    return Array.from(element.children || []).find((child) => child.classList?.contains("editor-vehicle-body")) || null;
  }

  function vehicleLabelFor(element) {
    return Array.from(element.children || []).find((child) => child.classList?.contains("editor-vehicle-label")) || null;
  }

  function vehicleBodyTransform(model, metrics, metadata) {
    const geometry = model.geometry || {};
    const mirrorXScale = metadata.vehicleFlipY ? -1 : 1;
    const mirrorYScale = metadata.vehicleFlipX ? -1 : 1;
    return [
      `translate(${utils.numberOr(geometry.cx, 0)} ${utils.numberOr(geometry.cy, 0)})`,
      `rotate(${utils.normalizeRotation(geometry.rotation)})`,
      `scale(${metrics.scale})`,
      `scale(${mirrorXScale} ${mirrorYScale})`
    ].join(" ");
  }

  function vehicleArtKey(metrics, metadata) {
    const variant = metrics.variant || {};
    return [
      variant.key || metadata.vehicleVariantKey || "",
      metrics.view,
      metrics.kind,
      metrics.baseWidth,
      metrics.baseHeight,
      metadata.vehicleColor || "",
      Boolean(metadata.vehicleGhost) ? "ghost" : "solid"
    ].join("|");
  }

  function syncVehicleBody(element, model, metrics, metadata) {
    const key = vehicleArtKey(metrics, metadata);
    let group = vehicleBodyFor(element);
    if (!group || group.dataset.vehicleArtKey !== key) {
      group?.remove();
      group = create("g", { class: "editor-vehicle-body" });
      group.dataset.vehicleArtKey = key;
      drawVehicleArt(group, metrics, metadata);
      element.insertBefore(group, element.firstChild);
    }
    group.setAttribute("transform", vehicleBodyTransform(model, metrics, metadata));
    return group;
  }

  function writeDataset(element, name, value) {
    const text = String(value);
    if (element.dataset[name] !== text) element.dataset[name] = text;
  }

  function renderPreviewSvg(variant, options = {}) {
    const view = catalog.normalizeView(variant, options.view || "side");
    const dimensions = catalog.dimensionsForView(variant, view);
    const pad = 1.45;
    const svg = create("svg", {
      viewBox: `${-dimensions.width * pad / 2} ${-dimensions.height * pad / 2} ${dimensions.width * pad} ${dimensions.height * pad}`,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true"
    });
    const group = append(svg, "g");
    drawVehicleArt(group, {
      variant,
      view,
      kind: variant?.kind || "car",
      baseWidth: dimensions.width,
      baseHeight: dimensions.height
    }, {
      vehicleColor: options.color || variant?.color || "#000000",
      vehicleGhost: Boolean(options.ghost)
    });
    return svg;
  }

  function roundSvgNumber(value) {
    return Math.round(value * 1000) / 1000;
  }

  function localPointFor(model, point) {
    const geometry = model.geometry || {};
    const angle = -utils.normalizeRotation(geometry.rotation || 0) * Math.PI / 180;
    const dx = point.x - geometry.cx;
    const dy = point.y - geometry.cy;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  function rectangleHitTest(model, point, tolerance, metrics) {
    const local = localPointFor(model, point);
    const outsideX = Math.max(Math.abs(local.x) - metrics.width / 2, 0);
    const outsideY = Math.max(Math.abs(local.y) - metrics.height / 2, 0);
    return Math.hypot(outsideX, outsideY) <= Math.max(0, tolerance || 0);
  }

  function localToWorld(model, x, y) {
    const geometry = model.geometry || {};
    const angle = utils.normalizeRotation(geometry.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: geometry.cx + x * cos - y * sin,
      y: geometry.cy + x * sin + y * cos
    };
  }

  function frameVertices(model, metrics, scale = 1) {
    const halfWidth = metrics.width * scale / 2;
    const halfHeight = metrics.height * scale / 2;
    return [
      localToWorld(model, -halfWidth, -halfHeight),
      localToWorld(model, halfWidth, -halfHeight),
      localToWorld(model, halfWidth, halfHeight),
      localToWorld(model, -halfWidth, halfHeight)
    ];
  }

  function polygonBounds(vertices) {
    const xs = vertices.map((point) => point.x);
    const ys = vertices.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function selectionPath(model, metrics) {
    const vertices = frameVertices(model, metrics, SELECTION_FRAME_SCALE);
    return `${vertices.map((point, index) => (
      `${index ? "L" : "M"} ${roundSvgNumber(point.x)} ${roundSvgNumber(point.y)}`
    )).join(" ")} Z`;
  }

  function cpPoint(model, metrics) {
    const distance = baseMetrics(model).width * SELECTION_FRAME_SCALE / 2 + (metrics?.handleGap || 0);
    const radians = utils.normalizeRotation(model.geometry?.rotation || 0) * Math.PI / 180;
    return {
      x: model.geometry.cx + Math.cos(radians) * distance,
      y: model.geometry.cy + Math.sin(radians) * distance
    };
  }

  function rotatedOffset(offset, angleDeg) {
    const angle = angleDeg * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: offset.x * cos - offset.y * sin,
      y: offset.x * sin + offset.y * cos
    };
  }

  function vehicleLabelPoint(model, metrics, position) {
    const halfWidth = metrics.width / 2;
    const halfHeight = metrics.height / 2;
    const centerClearance = VEHICLE_LABEL_EDGE_CLEARANCE + vehicleLabelFontSize(metrics) / 2;
    const local = {
      top: { x: 0, y: -halfHeight - centerClearance },
      right: { x: halfWidth + centerClearance, y: 0 },
      bottom: { x: 0, y: halfHeight + centerClearance },
      left: { x: -halfWidth - centerClearance, y: 0 }
    }[normalizeVehicleLabelPosition(position)];
    const offset = rotatedOffset(local, utils.normalizeRotation(model.geometry?.rotation || 0));
    return {
      x: model.geometry.cx + offset.x,
      y: model.geometry.cy + offset.y
    };
  }

  function vehicleLabelFontSize(metrics) {
    return VEHICLE_LABEL_FONT_SIZE * Math.max(MIN_SCALE, Number(metrics?.scale) || 1);
  }

  function vehicleLabelAngle(model, position) {
    const sideAngle = {
      top: 0,
      right: 90,
      bottom: 180,
      left: 270
    }[normalizeVehicleLabelPosition(position)];
    const rawAngle = Number(model.geometry?.rotation || 0) + sideAngle;
    const normalized = ((rawAngle % 360) + 360) % 360;
    return normalized > 90 && normalized < 270
      ? (normalized + 180) % 360
      : normalized;
  }

  function renderVehicleLabel(parent, model, metrics, metadata) {
    const text = normalizeVehicleLabelText(metadata.vehicleLabelText).trim();
    let label = vehicleLabelFor(parent);
    if (!text) {
      label?.remove();
      return;
    }
    if (label?.tagName?.toLowerCase() !== "text") {
      label?.remove();
      label = null;
    }
    const point = vehicleLabelPoint(model, metrics, metadata.vehicleLabelPosition);
    const angle = vehicleLabelAngle(model, metadata.vehicleLabelPosition);
    if (!label) {
      label = create("text", {
        class: "editor-vehicle-label",
        "font-size": vehicleLabelFontSize(metrics),
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      });
      parent.append(label);
    }
    label.setAttribute("font-size", String(vehicleLabelFontSize(metrics)));
    label.style.fontSize = `${vehicleLabelFontSize(metrics)}px`;
    label.setAttribute("x", String(point.x));
    label.setAttribute("y", String(point.y));
    label.setAttribute("transform", `rotate(${angle} ${point.x} ${point.y})`);
    if (label.textContent !== text) label.textContent = text;
  }

  const adapter = {
    elementTag: "g",
    className: "editor-vehicle",
    capabilities: { arrows: false, fill: false, curvedLabel: false, ownsLabel: true, noText: true, vehicleObject: true },

    create(initialData = {}) {
      const variant = initialData.variant || catalog.findVariant(initialData.vehicleVariantKey) || catalog.allVariants()[0];
      const metadata = normalizeVehicleMetadata(catalog.metadataFor(variant, initialData.metadata || {}));
      const center = initialData.center || initialData.point || {};
      const geometry = initialData.geometry || {};
      return {
        type: "vehicle",
        geometry: {
          cx: utils.numberOr(geometry.cx ?? center.x ?? initialData.x, 0),
          cy: utils.numberOr(geometry.cy ?? center.y ?? initialData.y, 0),
          scale: clampScale(geometry.scale ?? initialData.scale ?? 1),
          rotation: utils.normalizeRotation(geometry.rotation ?? initialData.rotation)
        },
        style: initialData.style,
        label: initialData.label,
        metadata
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "vehicle",
        geometry: {
          cx: utils.numberOr(element.dataset.cx, 0),
          cy: utils.numberOr(element.dataset.cy, 0),
          scale: clampScale(element.dataset.scale),
          rotation: utils.normalizeRotation(element.dataset.rotation)
        },
        style: {},
        label: {},
        metadata: {
          vehicleVariantKey: element.dataset.vehicleVariantKey || "",
          vehicleView: element.dataset.vehicleView || "top",
          vehicleColor: element.dataset.vehicleColor || "#000000",
          vehicleGhost: element.dataset.vehicleGhost === "true",
          vehicleFlipX: element.dataset.vehicleFlipX === "true",
          vehicleFlipY: element.dataset.vehicleFlipY === "true",
          vehicleLabelText: element.dataset.vehicleLabelText || "",
          vehicleLabelPosition: element.dataset.vehicleLabelPosition || "top"
        }
      };
    },

    render(model, element) {
      const metadata = normalizeVehicleMetadata(model.metadata || {});
      const metrics = baseMetrics(model);
      syncVehicleBody(element, model, metrics, metadata);
      renderVehicleLabel(element, model, metrics, metadata);
      writeDataset(element, "cx", model.geometry.cx);
      writeDataset(element, "cy", model.geometry.cy);
      writeDataset(element, "scale", metrics.scale);
      writeDataset(element, "rotation", utils.normalizeRotation(model.geometry.rotation));
      writeDataset(element, "vehicleVariantKey", metadata.vehicleVariantKey || "");
      writeDataset(element, "vehicleView", metrics.view);
      writeDataset(element, "vehicleColor", metadata.vehicleColor || "");
      writeDataset(element, "vehicleGhost", Boolean(metadata.vehicleGhost));
      writeDataset(element, "vehicleFlipX", Boolean(metadata.vehicleFlipX));
      writeDataset(element, "vehicleFlipY", Boolean(metadata.vehicleFlipY));
      writeDataset(element, "vehicleLabelText", metadata.vehicleLabelText || "");
      writeDataset(element, "vehicleLabelPosition", metadata.vehicleLabelPosition || "top");
    },

    hitTest(model, point, tolerance) {
      return rectangleHitTest(model, point, tolerance, baseMetrics(model));
    },

    getControlPoints(model, metrics) {
      return [{
        id: "rotate",
        ...cpPoint(model, metrics),
        role: "rotate",
        cursor: "grab"
      }];
    },

    moveControlPoint(model, cpId, worldPoint) {
      if (cpId !== "rotate") return;
      model.geometry.rotation = utils.normalizeRotation(
        Math.atan2(worldPoint.y - model.geometry.cy, worldPoint.x - model.geometry.cx) * 180 / Math.PI
      );
    },

    move(model, dx, dy) {
      model.geometry.cx += dx;
      model.geometry.cy += dy;
    },

    getBounds(model) {
      return polygonBounds(frameVertices(model, baseMetrics(model), SELECTION_FRAME_SCALE));
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("path", { class: "editor-object-selection editor-traffic-sign-selection editor-vehicle-selection" });
    },

    renderSelection(element, model, style, mode) {
      const isMulti = mode === "multi";
      element.setAttribute("d", selectionPath(model, baseMetrics(model)));
      element.setAttribute("stroke-width", isMulti ? String(MULTI_SELECTION_STROKE_WIDTH) : "0");
      if (isMulti) {
        element.removeAttribute("stroke");
        element.removeAttribute("fill");
      } else {
        element.setAttribute("stroke", "none");
        element.setAttribute("fill", mode === "edit" ? "rgba(34, 197, 94, .5)" : "rgba(239, 68, 68, .5)");
      }
      element.removeAttribute("transform");
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    effectiveLabel() {
      return {};
    }
  };

  registry.register("vehicle", adapter);
  Kroki.VehicleRenderer = {
    renderPreviewSvg,
    metricsForModel: baseMetrics
  };
})();
