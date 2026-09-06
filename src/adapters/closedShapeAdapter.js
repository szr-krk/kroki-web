(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !styleManager) return;

  const CORNERS = [
    { id: "nw", sx: -1, sy: -1 },
    { id: "ne", sx: 1, sy: -1 },
    { id: "se", sx: 1, sy: 1 },
    { id: "sw", sx: -1, sy: 1 }
  ];
  const DEFAULT_SIZE = 80;
  const CORNER_HANDLE_OFFSET_RATIO = 1.15;
  const MIN_SCALE_SPAN = 2;
  const SAMPLE_DISTANCE = 8;

  function point(x, y) {
    return { x: utils.numberOr(x, 0), y: utils.numberOr(y, 0) };
  }

  function clonePoint(source) {
    return point(source?.x, source?.y);
  }

  function normalizePoints(points) {
    return Array.isArray(points) ? points.map(clonePoint) : [];
  }

  function defaultControl(start, end) {
    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  }

  function normalizeControls(points, controls, closed) {
    const segmentCount = Math.max(0, points.length - 1 + (closed && points.length > 2 ? 1 : 0));
    const source = Array.isArray(controls) ? controls : [];
    const normalized = [];
    for (let index = 0; index < segmentCount; index += 1) {
      const fallback = defaultControl(points[index], points[(index + 1) % points.length]);
      normalized.push(source[index] ? clonePoint(source[index]) : fallback);
    }
    return normalized;
  }

  function normalizeGeometry(geometry = {}) {
    let points = normalizePoints(geometry.points);
    if (!points.length) {
      const center = point(geometry.cx, geometry.cy);
      points = [
        { x: center.x - DEFAULT_SIZE / 2, y: center.y - DEFAULT_SIZE / 2 },
        { x: center.x + DEFAULT_SIZE / 2, y: center.y - DEFAULT_SIZE / 2 },
        { x: center.x + DEFAULT_SIZE / 2, y: center.y + DEFAULT_SIZE / 2 },
        { x: center.x - DEFAULT_SIZE / 2, y: center.y + DEFAULT_SIZE / 2 }
      ];
    }
    const closed = geometry.closed !== false && points.length > 2;
    const normalized = {
      points,
      controls: normalizeControls(points, geometry.controls, closed),
      closed
    };
    normalized.frame = normalizeFrame(geometry.frame, normalized);
    return normalized;
  }

  function geometryFromInitialData(initialData) {
    if (initialData.geometry?.points) return normalizeGeometry(initialData.geometry);
    if (Array.isArray(initialData.points)) {
      return normalizeGeometry({
        points: initialData.points,
        controls: initialData.controls,
        closed: initialData.closed,
        frame: initialData.frame
      });
    }
    const start = initialData.start || { x: 0, y: 0 };
    const end = initialData.end || start;
    const points = [clonePoint(start)];
    if (Math.hypot(utils.numberOr(end.x, start.x) - utils.numberOr(start.x, 0), utils.numberOr(end.y, start.y) - utils.numberOr(start.y, 0)) > 0.001) {
      points.push(clonePoint(end));
    }
    return normalizeGeometry({ points, closed: false });
  }

  function parseJsonArray(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function parseJsonObject(value) {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function geometryFromElement(element) {
    return normalizeGeometry({
      points: parseJsonArray(element.dataset.closedShapePoints),
      controls: parseJsonArray(element.dataset.closedShapeControls),
      closed: element.dataset.closedShapeClosed !== "false",
      frame: parseJsonObject(element.dataset.closedShapeFrame)
    });
  }

  function segmentCount(geometry) {
    return Math.max(0, geometry.points.length - 1 + (geometry.closed && geometry.points.length > 2 ? 1 : 0));
  }

  function pathDataFromGeometry(geometry) {
    const points = geometry.points;
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    const commands = [`M ${points[0].x} ${points[0].y}`];
    const count = segmentCount(geometry);
    for (let index = 0; index < count; index += 1) {
      const end = points[(index + 1) % points.length];
      const control = geometry.controls[index] || defaultControl(points[index], end);
      commands.push(`Q ${control.x} ${control.y} ${end.x} ${end.y}`);
    }
    if (geometry.closed) commands.push("Z");
    return commands.join(" ");
  }

  function geometryPoints(geometry) {
    return [...geometry.points, ...geometry.controls];
  }

  function boundsFromPoints(points) {
    const usable = points.length ? points : [{ x: 0, y: 0 }];
    const xs = usable.map((item) => item.x);
    const ys = usable.map((item) => item.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(MIN_SCALE_SPAN, maxX - minX),
      height: Math.max(MIN_SCALE_SPAN, maxY - minY)
    };
  }

  function geometryBounds(geometry) {
    return boundsFromPoints(geometryPoints(geometry));
  }

  function centerFromBounds(bounds) {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  }

  function frameFromBounds(bounds, rotation = 0) {
    const center = centerFromBounds(bounds);
    return {
      cx: center.x,
      cy: center.y,
      width: Math.max(MIN_SCALE_SPAN, bounds.width),
      height: Math.max(MIN_SCALE_SPAN, bounds.height),
      rotation: utils.normalizeRotation(rotation)
    };
  }

  function normalizeFrame(frame, geometry) {
    const fallback = frameFromBounds(geometryBounds(geometry));
    const source = frame || {};
    return {
      cx: utils.numberOr(source.cx, fallback.cx),
      cy: utils.numberOr(source.cy, fallback.cy),
      width: Math.max(MIN_SCALE_SPAN, utils.numberOr(source.width, fallback.width)),
      height: Math.max(MIN_SCALE_SPAN, utils.numberOr(source.height, fallback.height)),
      rotation: utils.normalizeRotation(source.rotation)
    };
  }

  function ensureFrame(geometry) {
    geometry.frame = normalizeFrame(geometry.frame, geometry);
    return geometry.frame;
  }

  function frameAxes(frame) {
    const radians = utils.normalizeRotation(frame.rotation) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      xAxis: { x: cos, y: sin },
      yAxis: { x: -sin, y: cos }
    };
  }

  function frameLocalPoint(frame, localX, localY) {
    const axes = frameAxes(frame);
    return {
      x: frame.cx + axes.xAxis.x * localX + axes.yAxis.x * localY,
      y: frame.cy + axes.xAxis.y * localX + axes.yAxis.y * localY
    };
  }

  function framePointToLocal(frame, pointValue) {
    const axes = frameAxes(frame);
    const dx = pointValue.x - frame.cx;
    const dy = pointValue.y - frame.cy;
    return {
      x: dx * axes.xAxis.x + dy * axes.xAxis.y,
      y: dx * axes.yAxis.x + dy * axes.yAxis.y
    };
  }

  function cornerById(id) {
    return CORNERS.find((corner) => corner.id === id) || null;
  }

  function cornerHandleOffset(metrics) {
    return Math.max(metrics?.minGap || 0, (metrics?.visibleRadius || 0) * CORNER_HANDLE_OFFSET_RATIO);
  }

  function cornerPoint(frame, corner, metrics) {
    const offset = cornerHandleOffset(metrics);
    return frameLocalPoint(frame, corner.sx * (frame.width / 2 + offset), corner.sy * (frame.height / 2 + offset));
  }

  function frameCorner(frame, corner) {
    return frameLocalPoint(frame, corner.sx * frame.width / 2, corner.sy * frame.height / 2);
  }

  function offsetResizePoint(pointValue, state, offset) {
    const axes = frameAxes(state.frame);
    return {
      x: pointValue.x - axes.xAxis.x * state.sx * offset - axes.yAxis.x * state.sy * offset,
      y: pointValue.y - axes.xAxis.y * state.sx * offset - axes.yAxis.y * state.sy * offset
    };
  }

  function scalePointInFrame(pointValue, state, scaleX, scaleY) {
    const local = framePointToLocal(state.frame, pointValue);
    return frameLocalPoint(
      state.frame,
      state.fixedLocal.x + (local.x - state.fixedLocal.x) * scaleX,
      state.fixedLocal.y + (local.y - state.fixedLocal.y) * scaleY
    );
  }

  function rotatePointAround(pointValue, center, angle) {
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = pointValue.x - center.x;
    const dy = pointValue.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  }

  function transformGeometry(model, transform) {
    model.geometry.points = model.geometry.points.map(transform);
    model.geometry.controls = model.geometry.controls.map(transform);
  }

  function syncFrameToGeometryBounds(model) {
    model.geometry.frame = frameFromBounds(geometryBounds(model.geometry));
  }

  function shapeEditEnabled(model, mode) {
    return mode === "edit" && Boolean(model.metadata?.pointEdit);
  }

  function hasFill(model) {
    const style = styleManager.normalizeStyle(model.style, "closedShape");
    return Boolean(
      (style.fill && style.fill !== "none" && style.fill !== "transparent") ||
      style.fillPattern !== "none"
    );
  }

  function svgPoint(element, pointValue) {
    const svgPointObject = element.ownerSVGElement.createSVGPoint();
    svgPointObject.x = pointValue.x;
    svgPointObject.y = pointValue.y;
    return svgPointObject;
  }

  function pathDistance(element, pointValue, tolerance) {
    try {
      const length = element.getTotalLength();
      if (!Number.isFinite(length) || length < 0.001) return false;
      const samples = Math.max(24, Math.min(140, Math.ceil(length / SAMPLE_DISTANCE)));
      for (let index = 0; index <= samples; index += 1) {
        const sample = element.getPointAtLength(length * index / samples);
        if (Math.hypot(pointValue.x - sample.x, pointValue.y - sample.y) <= tolerance) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function pointControlPoints(model) {
    const geometry = model.geometry;
    const points = geometry.points.map((item, index) => ({
      id: "p" + index,
      ...item,
      role: "shape-point",
      cursor: "grab"
    }));
    const controls = geometry.controls.map((item, index) => ({
      id: "q" + index,
      ...item,
      role: "shape-curve",
      cursor: "grab"
    }));
    return [...points, ...controls];
  }

  function resizeControlPoints(model, metrics) {
    const frame = ensureFrame(model.geometry);
    const points = CORNERS.map((corner) => ({
      id: corner.id,
      ...cornerPoint(frame, corner, metrics),
      role: "resize",
      sx: corner.sx,
      sy: corner.sy,
      cursor: "grab"
    }));
    points.push({
      id: "rotate",
      ...frameLocalPoint(frame, frame.width / 2 + metrics.handleGap, 0),
      role: "rotate",
      cursor: "grab"
    });
    return points;
  }

  const adapter = {
    elementTag: "path",
    className: "editor-closed-shape",
    capabilities: { arrows: false, fill: true, curvedLabel: false, noText: true, pointEdit: true },

    getRotation(model) {
      return ensureFrame(model.geometry).rotation;
    },

    setRotation(model, rotation) {
      const frame = ensureFrame(model.geometry);
      const nextRotation = utils.normalizeRotation(rotation);
      const delta = utils.normalizeRotation(nextRotation - frame.rotation);
      if (delta) {
        const center = { x: frame.cx, y: frame.cy };
        transformGeometry(model, (item) => rotatePointAround(item, center, delta));
      }
      model.geometry.frame = { ...frame, rotation: nextRotation };
    },

    create(initialData = {}) {
      return {
        type: "closedShape",
        geometry: geometryFromInitialData(initialData),
        style: {
          stroke: "#000000",
          fill: "#ffffff",
          strokeWidth: 2,
          ...(initialData.style || {})
        },
        label: {},
        metadata: initialData.metadata
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "closedShape",
        geometry: geometryFromElement(element),
        style: styleManager.readStyleFromElement(element, "closedShape"),
        label: {},
        metadata: {}
      };
    },

    render(model, element) {
      const geometry = normalizeGeometry(model.geometry);
      model.geometry = geometry;
      utils.setAttributeIfChanged(element, "data-closed-shape-points", JSON.stringify(geometry.points));
      utils.setAttributeIfChanged(element, "data-closed-shape-controls", JSON.stringify(geometry.controls));
      utils.setAttributeIfChanged(element, "data-closed-shape-closed", String(geometry.closed));
      utils.setAttributeIfChanged(element, "data-closed-shape-frame", JSON.stringify(geometry.frame));
      utils.setAttributeIfChanged(element, "d", pathDataFromGeometry(geometry));
      element.removeAttribute("transform");
    },

    hitTest(model, pointValue, tolerance, element) {
      if (!element) return false;
      const testPoint = svgPoint(element, pointValue);
      if (model.geometry.closed && hasFill(model) && element.isPointInFill?.(testPoint)) return true;
      if (element.isPointInStroke?.(testPoint)) return true;
      return pathDistance(element, pointValue, model.style.strokeWidth / 2 + tolerance);
    },

    getControlPoints(model, metrics, mode) {
      if (shapeEditEnabled(model, mode)) return pointControlPoints(model);
      return resizeControlPoints(model, metrics);
    },

    beginControlPointMove(model, cpId, pointValue, metrics) {
      if (cpId === "rotate") {
        const frame = ensureFrame(model.geometry);
        const center = { x: frame.cx, y: frame.cy };
        return {
          cpId,
          center,
          startAngle: Math.atan2(pointValue.y - center.y, pointValue.x - center.x) * 180 / Math.PI,
          frame: utils.clonePlain(frame),
          geometry: utils.clonePlain(model.geometry)
        };
      }

      const corner = cornerById(cpId);
      if (corner) {
        const frame = ensureFrame(model.geometry);
        const fixedCorner = { sx: -corner.sx, sy: -corner.sy };
        return {
          cpId,
          fixedLocal: {
            x: fixedCorner.sx * frame.width / 2,
            y: fixedCorner.sy * frame.height / 2
          },
          movingLocal: {
            x: corner.sx * frame.width / 2,
            y: corner.sy * frame.height / 2
          },
          fixedPoint: frameCorner(frame, fixedCorner),
          movingPoint: frameCorner(frame, corner),
          frame: utils.clonePlain(frame),
          sx: corner.sx,
          sy: corner.sy,
          geometry: utils.clonePlain(model.geometry),
          cornerHandleOffset: cornerHandleOffset(metrics)
        };
      }

      return {
        cpId,
        geometry: utils.clonePlain(model.geometry)
      };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      if (cpId.startsWith("p") || cpId.startsWith("q")) {
        worldPoint = Kroki.EditorGrid?.snapPoint(worldPoint, modifiers) || worldPoint;
      }
      if (cpId.startsWith("p")) {
        const index = Number(cpId.slice(1));
        if (Number.isInteger(index) && model.geometry.points[index]) model.geometry.points[index] = clonePoint(worldPoint);
        syncFrameToGeometryBounds(model);
        return;
      }

      if (cpId.startsWith("q")) {
        const index = Number(cpId.slice(1));
        if (Number.isInteger(index) && model.geometry.controls[index]) model.geometry.controls[index] = clonePoint(worldPoint);
        syncFrameToGeometryBounds(model);
        return;
      }

      const state = modifiers.startState;
      if (!state?.geometry) return;

      if (cpId === "rotate" && state.center) {
        const angle = Math.atan2(worldPoint.y - state.center.y, worldPoint.x - state.center.x) * 180 / Math.PI;
        const rawRotation = utils.normalizeRotation(state.frame.rotation + angle - state.startAngle);
        const rotation = Kroki.EditorGrid?.snapAngle(rawRotation, modifiers) ?? rawRotation;
        const delta = rotation - state.frame.rotation;
        model.geometry = utils.clonePlain(state.geometry);
        transformGeometry(model, (item) => rotatePointAround(item, state.center, delta));
        model.geometry.frame = {
          ...state.frame,
          rotation: utils.normalizeRotation(rotation)
        };
        return;
      }

      if (!state.frame || !state.fixedLocal || !state.movingLocal) return;
      let dragged = offsetResizePoint(
        worldPoint,
        state,
        utils.numberOr(state.cornerHandleOffset, cornerHandleOffset(modifiers.metrics))
      );
      dragged = Kroki.EditorGrid?.snapPoint(dragged, modifiers) || dragged;
      const draggedLocal = framePointToLocal(state.frame, dragged);
      const spanX = state.movingLocal.x - state.fixedLocal.x;
      const spanY = state.movingLocal.y - state.fixedLocal.y;
      const rawSpanX = draggedLocal.x - state.fixedLocal.x;
      const rawSpanY = draggedLocal.y - state.fixedLocal.y;
      const nextSpanX = Math.abs(rawSpanX) < MIN_SCALE_SPAN
        ? Math.sign(spanX || state.sx) * MIN_SCALE_SPAN
        : rawSpanX;
      const nextSpanY = Math.abs(rawSpanY) < MIN_SCALE_SPAN
        ? Math.sign(spanY || state.sy) * MIN_SCALE_SPAN
        : rawSpanY;
      const scaleX = nextSpanX / (spanX || state.sx || 1);
      const scaleY = nextSpanY / (spanY || state.sy || 1);
      const nextMovingLocal = {
        x: state.fixedLocal.x + nextSpanX,
        y: state.fixedLocal.y + nextSpanY
      };
      const nextCenterLocal = {
        x: (state.fixedLocal.x + nextMovingLocal.x) / 2,
        y: (state.fixedLocal.y + nextMovingLocal.y) / 2
      };
      const nextCenter = frameLocalPoint(state.frame, nextCenterLocal.x, nextCenterLocal.y);
      model.geometry = utils.clonePlain(state.geometry);
      transformGeometry(model, (item) => scalePointInFrame(item, state, scaleX, scaleY));
      model.geometry.frame = {
        cx: nextCenter.x,
        cy: nextCenter.y,
        width: Math.abs(nextSpanX),
        height: Math.abs(nextSpanY),
        rotation: state.frame.rotation
      };
    },

    move(model, dx, dy) {
      transformGeometry(model, (item) => ({ x: item.x + dx, y: item.y + dy }));
      const frame = ensureFrame(model.geometry);
      frame.cx += dx;
      frame.cy += dy;
    },

    getBounds(model) {
      return geometryBounds(model.geometry);
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("path", { class: "editor-object-selection editor-closed-shape-selection" });
    },

    renderSelection(element, model, style, mode) {
      utils.setAttributeIfChanged(element, "d", pathDataFromGeometry(model.geometry));
      utils.setAttributeIfChanged(element, "stroke-width", String(style.strokeWidth + 4));
      utils.setAttributeIfChanged(element, "stroke-linecap", "round");
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    appendPoint(model, pointValue) {
      const geometry = normalizeGeometry({ ...model.geometry, closed: false });
      const nextPoint = clonePoint(pointValue);
      if (geometry.points.length) geometry.controls.push(defaultControl(geometry.points[geometry.points.length - 1], nextPoint));
      geometry.points.push(nextPoint);
      geometry.closed = false;
      geometry.controls = normalizeControls(geometry.points, geometry.controls, false);
      geometry.frame = frameFromBounds(geometryBounds(geometry));
      model.geometry = geometry;
    },

    closeShape(model) {
      const geometry = normalizeGeometry(model.geometry);
      if (geometry.points.length < 3) return false;
      geometry.closed = true;
      geometry.controls = normalizeControls(geometry.points, geometry.controls, true);
      geometry.frame = frameFromBounds(geometryBounds(geometry));
      model.geometry = geometry;
      model.metadata = { ...(model.metadata || {}), draft: false, pointEdit: false };
      return true;
    }
  };

  registry.register("closedShape", adapter);
})();
