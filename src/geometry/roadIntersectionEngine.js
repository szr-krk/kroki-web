(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  const registry = Kroki.ShapeRegistry;
  if (!utils || !manager || !registry) return;

  const EPSILON = 0.0001;
  const MIN_WIDTH = 2;
  const DEFAULT_LANE_COUNT = 2;
  const DEFAULT_LANE_WIDTH = 50;
  const ROAD_SURFACE_FILL = "#ffffff";
  const DEFAULT_EDGE_MASK_PADDING = 8;
  const PARALLEL_ANGLE_TOLERANCE = 8;
  const CROSS_ANGLE_MIN = 75;
  const CROSS_ANGLE_MAX = 105;
  const MASK_LAYER_ID = "roadIntersectionMaskLayer";
  const DEBUG_LAYER_ID = "roadIntersectionDebugLayer";
  let lastIntersections = [];
  const engine = Kroki.RoadIntersectionEngine || {};

  function numberOr(value, fallback) {
    return utils.numberOr(value, fallback);
  }

  function boolOr(value, fallback) {
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return Boolean(fallback);
  }

  function widthOr(value, fallback, min = 0, max = 300) {
    const number = numberOr(value, fallback);
    return Math.min(max, Math.max(min, number));
  }

  function point(value, fallback = { x: 0, y: 0 }) {
    return {
      x: numberOr(value?.x, fallback.x),
      y: numberOr(value?.y, fallback.y)
    };
  }

  function roadAdapter() {
    return registry.get("road");
  }

  function roadConfig(model) {
    const source = model?.metadata?.road || {};
    const adapter = roadAdapter();
    if (typeof adapter?.normalizeRoadConfig === "function") return adapter.normalizeRoadConfig(source);
    const laneCount = Math.max(1, Math.min(5, Math.round(numberOr(source.laneCount, DEFAULT_LANE_COUNT))));
    const laneWidth = widthOr(source.laneWidth, DEFAULT_LANE_WIDTH, 10, 180);
    return {
      laneCount,
      laneWidth,
      laneWidths: normalizeWidthList(source.laneWidths, laneCount, laneWidth),
      divided: boolOr(source.divided, false),
      dividedLaneWidths: {
        left: normalizeWidthList(source.dividedLaneWidths?.left, laneCount, laneWidth),
        right: normalizeWidthList(source.dividedLaneWidths?.right, laneCount, laneWidth)
      },
      leftShoulder: normalizeShoulder(source.leftShoulder, false, 20),
      rightShoulder: normalizeShoulder(source.rightShoulder, false, 20),
      innerShoulder: normalizeShoulder(source.innerShoulder, false, 15),
      waterChannel: normalizeShoulder(source.waterChannel, false, 30),
      barrier: normalizeShoulder(source.barrier, false, 6),
      edgeLine: {
        enabled: boolOr(source.edgeLine?.enabled, true),
        width: widthOr(source.edgeLine?.width, 2, 1, 16)
      },
      marking: {
        width: widthOr(source.marking?.width, 2, 1, 16)
      },
      autoIntersection: boolOr(source.autoIntersection, true),
      bridge: boolOr(source.bridge, false)
    };
  }

  function normalizeShoulder(source, enabled, width) {
    return {
      enabled: boolOr(source?.enabled, enabled),
      width: widthOr(source?.width, width, 0, 180)
    };
  }

  function normalizeWidthList(source, count, fallbackWidth) {
    const list = Array.isArray(source) ? source : [];
    return Array.from({ length: count }, (_, index) => widthOr(list[index], fallbackWidth, 10, 180));
  }

  function sumWidths(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, value) => sum + widthOr(value, DEFAULT_LANE_WIDTH, 0, 300), 0);
  }

  function roadTotalWidth(config) {
    let total = 0;
    if (config.rightShoulder?.enabled) total += widthOr(config.rightShoulder.width, 0);
    if (config.divided) {
      total += sumWidths(config.dividedLaneWidths?.right);
      if (config.innerShoulder?.enabled) total += widthOr(config.innerShoulder.width, 0);
      if (config.waterChannel?.enabled) total += widthOr(config.waterChannel.width, 0);
      if (config.innerShoulder?.enabled) total += widthOr(config.innerShoulder.width, 0);
      total += sumWidths(config.dividedLaneWidths?.left);
    } else {
      total += sumWidths(config.laneWidths);
    }
    if (config.leftShoulder?.enabled) total += widthOr(config.leftShoulder.width, 0);
    return Math.max(MIN_WIDTH, total);
  }

  function getRoadModels() {
    try {
      return (typeof manager.getAll === "function" ? manager.getAll() : [])
        .filter((model) => model?.type === "road");
    } catch (error) {
      warn("Road models okunamadi", error);
    }
    return [];
  }

  function getLastIntersections() {
    return lastIntersections.slice();
  }

  function warn(message, error) {
    if (engine?.debug && window.console?.warn) console.warn("RoadIntersectionEngine: " + message, error || "");
  }

  function isFinitePoint(pointValue) {
    return Number.isFinite(pointValue?.x) && Number.isFinite(pointValue?.y);
  }

  function validPolygon(polygon) {
    return Array.isArray(polygon) && polygon.length >= 3 && polygon.every(isFinitePoint);
  }

  function validPathData(points) {
    return validPolygon(points) ? pathData(points) : "";
  }

  function getRoadSurfacePolygon(model) {
    const geometry = model?.geometry || {};
    const profile = geometry.profile || "straight";
    if (profile !== "straight") {
      return { supported: false, reason: "unsupported-profile", profile, roadId: model?.id || "" };
    }

    const start = point(geometry.start, { x: 0, y: 0 });
    const end = point(geometry.end, { x: start.x + 1, y: start.y });
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < EPSILON) {
      return { supported: false, reason: "degenerate-road", profile, roadId: model?.id || "" };
    }

    const config = roadConfig(model);
    const halfWidth = roadTotalWidth(config) / 2;
    const nx = -dy / length;
    const ny = dx / length;
    const polygon = [
      { x: start.x + nx * halfWidth, y: start.y + ny * halfWidth },
      { x: end.x + nx * halfWidth, y: end.y + ny * halfWidth },
      { x: end.x - nx * halfWidth, y: end.y - ny * halfWidth },
      { x: start.x - nx * halfWidth, y: start.y - ny * halfWidth }
    ];

    return {
      supported: true,
      roadId: model?.id || "",
      profile,
      config,
      totalWidth: halfWidth * 2,
      polygon
    };
  }

  function getRoadAxisInfo(model) {
    const geometry = model?.geometry || {};
    const profile = geometry.profile || "straight";
    if (profile !== "straight") {
      return { supported: false, reason: "unsupported-profile", profile, roadId: model?.id || "" };
    }

    const start = point(geometry.start, { x: 0, y: 0 });
    const end = point(geometry.end, { x: start.x + 1, y: start.y });
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < EPSILON) {
      return { supported: false, reason: "degenerate-road", profile, roadId: model?.id || "" };
    }

    const config = roadConfig(model);
    return {
      supported: true,
      roadId: model?.id || "",
      profile,
      start,
      end,
      direction: { x: dx / length, y: dy / length },
      normal: { x: -dy / length, y: dx / length },
      length,
      totalWidth: roadTotalWidth(config),
      config
    };
  }

  function pointProjectionOnAxis(pointValue, axis) {
    if (!isFinitePoint(pointValue) || !axis?.supported) return null;
    const vx = pointValue.x - axis.start.x;
    const vy = pointValue.y - axis.start.y;
    const distance = vx * axis.direction.x + vy * axis.direction.y;
    const t = distance / axis.length;
    const closest = {
      x: axis.start.x + axis.direction.x * distance,
      y: axis.start.y + axis.direction.y * distance
    };
    const offset = (pointValue.x - closest.x) * axis.normal.x + (pointValue.y - closest.y) * axis.normal.y;
    return {
      t,
      distance,
      distanceToStart: distance,
      distanceToEnd: axis.length - distance,
      offset,
      closest
    };
  }

  function polygonArea(polygon) {
    let area = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
  }

  function cross(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function isInside(pointValue, edgeStart, edgeEnd, orientation) {
    const value = cross(edgeStart, edgeEnd, pointValue);
    return orientation >= 0 ? value >= -EPSILON : value <= EPSILON;
  }

  function lineIntersection(lineStart, lineEnd, clipStart, clipEnd) {
    const r = { x: lineEnd.x - lineStart.x, y: lineEnd.y - lineStart.y };
    const s = { x: clipEnd.x - clipStart.x, y: clipEnd.y - clipStart.y };
    const denominator = r.x * s.y - r.y * s.x;
    if (Math.abs(denominator) < EPSILON) return { x: lineEnd.x, y: lineEnd.y };
    const qpx = clipStart.x - lineStart.x;
    const qpy = clipStart.y - lineStart.y;
    const t = (qpx * s.y - qpy * s.x) / denominator;
    return {
      x: lineStart.x + r.x * t,
      y: lineStart.y + r.y * t
    };
  }

  function compactPolygon(polygon) {
    const compact = [];
    polygon.forEach((item) => {
      const previous = compact[compact.length - 1];
      if (!previous || Math.hypot(item.x - previous.x, item.y - previous.y) > EPSILON) {
        compact.push({ x: item.x, y: item.y });
      }
    });
    if (compact.length > 1) {
      const first = compact[0];
      const last = compact[compact.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) <= EPSILON) compact.pop();
    }
    return compact;
  }

  function convexPolygonIntersection(subjectPolygon, clipPolygon) {
    let output = compactPolygon(subjectPolygon || []);
    const clip = compactPolygon(clipPolygon || []);
    if (output.length < 3 || clip.length < 3) return [];

    const orientation = polygonArea(clip) >= 0 ? 1 : -1;
    for (let edgeIndex = 0; edgeIndex < clip.length; edgeIndex += 1) {
      const clipStart = clip[edgeIndex];
      const clipEnd = clip[(edgeIndex + 1) % clip.length];
      const input = output;
      output = [];
      if (!input.length) break;

      let previous = input[input.length - 1];
      let previousInside = isInside(previous, clipStart, clipEnd, orientation);
      input.forEach((current) => {
        const currentInside = isInside(current, clipStart, clipEnd, orientation);
        if (currentInside) {
          if (!previousInside) output.push(lineIntersection(previous, current, clipStart, clipEnd));
          output.push(current);
        } else if (previousInside) {
          output.push(lineIntersection(previous, current, clipStart, clipEnd));
        }
        previous = current;
        previousInside = currentInside;
      });
      output = compactPolygon(output);
    }
    return Math.abs(polygonArea(output)) > EPSILON ? output : [];
  }

  function polygonCentroid(polygon) {
    const area = polygonArea(polygon);
    if (Math.abs(area) < EPSILON) return averagePoint(polygon);

    let cx = 0;
    let cy = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const factor = current.x * next.y - next.x * current.y;
      cx += (current.x + next.x) * factor;
      cy += (current.y + next.y) * factor;
    }
    const scale = 1 / (6 * area);
    return { x: cx * scale, y: cy * scale };
  }

  function averagePoint(points) {
    const items = Array.isArray(points) ? points : [];
    if (!items.length) return { x: 0, y: 0 };
    return {
      x: items.reduce((sum, item) => sum + item.x, 0) / items.length,
      y: items.reduce((sum, item) => sum + item.y, 0) / items.length
    };
  }

  function angleBetweenAxes(axisA, axisB) {
    if (!axisA?.supported || !axisB?.supported) return null;
    const dot = Math.max(-1, Math.min(1,
      axisA.direction.x * axisB.direction.x + axisA.direction.y * axisB.direction.y
    ));
    return Math.acos(dot) * 180 / Math.PI;
  }

  function normalizedParallelAngle(angleDeg) {
    if (!Number.isFinite(angleDeg)) return null;
    return Math.min(Math.abs(angleDeg), Math.abs(180 - angleDeg));
  }

  function roadThroughAtCenter(axis, center) {
    const projection = pointProjectionOnAxis(center, axis);
    if (!projection) return false;
    const endpointTolerance = Math.max(40, axis.totalWidth * 0.35);
    return projection.distanceToStart > endpointTolerance
      && projection.distanceToEnd > endpointTolerance;
  }

  function parallelIntersectionKind(axisA, axisB, overlapPolygon) {
    const area = Math.abs(polygonArea(overlapPolygon || []));
    const minWidth = Math.max(MIN_WIDTH, Math.min(axisA.totalWidth, axisB.totalWidth));
    const touchArea = Math.max(25, minWidth * minWidth * 0.08);
    return area <= touchArea ? "parallel-touch" : "overlap";
  }

  function classificationConfidence(kind, angleDeg, roadAThrough, roadBThrough) {
    if (kind === "cross") {
      const distanceFromRightAngle = Math.abs(90 - angleDeg);
      return Math.max(0.65, 1 - distanceFromRightAngle / 90);
    }
    if (kind === "skew") return roadAThrough && roadBThrough ? 0.78 : 0.52;
    if (kind === "tee") return roadAThrough !== roadBThrough ? 0.82 : 0.55;
    if (kind === "overlap" || kind === "parallel-touch") return 0.72;
    return 0.25;
  }

  function classifyIntersection(roadA, roadB, overlapPolygon) {
    if (!validPolygon(overlapPolygon)) {
      return {
        intersectionKind: "unsupported",
        roadAThrough: false,
        roadBThrough: false,
        angleDeg: null,
        confidence: 0
      };
    }

    const axisA = getRoadAxisInfo(roadA);
    const axisB = getRoadAxisInfo(roadB);
    if (!axisA.supported || !axisB.supported) {
      return {
        intersectionKind: "unsupported",
        roadAThrough: false,
        roadBThrough: false,
        angleDeg: null,
        confidence: 0
      };
    }

    const center = polygonCentroid(overlapPolygon);
    const angleDeg = angleBetweenAxes(axisA, axisB);
    if (!Number.isFinite(angleDeg)) {
      return {
        intersectionKind: "unsupported",
        roadAThrough: false,
        roadBThrough: false,
        angleDeg: null,
        confidence: 0
      };
    }

    const roadAThrough = roadThroughAtCenter(axisA, center);
    const roadBThrough = roadThroughAtCenter(axisB, center);
    const parallelAngle = normalizedParallelAngle(angleDeg);
    let intersectionKind;

    if (parallelAngle != null && parallelAngle <= PARALLEL_ANGLE_TOLERANCE) {
      intersectionKind = parallelIntersectionKind(axisA, axisB, overlapPolygon);
    } else if (roadAThrough && roadBThrough) {
      intersectionKind = angleDeg >= CROSS_ANGLE_MIN && angleDeg <= CROSS_ANGLE_MAX ? "cross" : "skew";
    } else if (roadAThrough !== roadBThrough) {
      intersectionKind = "tee";
    } else {
      intersectionKind = "skew";
    }

    return {
      intersectionKind,
      roadAThrough,
      roadBThrough,
      angleDeg,
      confidence: classificationConfidence(intersectionKind, angleDeg, roadAThrough, roadBThrough)
    };
  }

  function classifyRoadPair(roadA, roadB, overlapPolygon) {
    return classifyIntersection(roadA, roadB, overlapPolygon);
  }

  function maskPaddingForConfigs(configA, configB) {
    const configured = numberOr(engine.edgeMaskPadding, DEFAULT_EDGE_MASK_PADDING);
    const minRoadWidth = Math.min(roadTotalWidth(configA), roadTotalWidth(configB));
    const computed = Math.max(4, Math.min(18, minRoadWidth * 0.04));
    return Math.max(0, Math.min(30, Math.max(configured, computed)));
  }

  function expandPolygonFromCenter(polygon, padding) {
    const points = compactPolygon(polygon || []);
    if (points.length < 3) return points;
    const center = polygonCentroid(points);
    const amount = Math.max(0, numberOr(padding, 0));
    if (amount <= 0) return points;

    const expandedPoints = points.map((item) => {
      const dx = item.x - center.x;
      const dy = item.y - center.y;
      const distance = Math.hypot(dx, dy);
      if (distance < EPSILON) return { x: item.x, y: item.y };
      return {
        x: item.x + dx / distance * amount,
        y: item.y + dy / distance * amount
      };
    });
    return Math.abs(polygonArea(expandedPoints)) > EPSILON ? expandedPoints : points;
  }

  function detectPairIntersection(roadA, roadB) {
    const roadAId = roadA?.id || "";
    const roadBId = roadB?.id || "";
    const configA = roadConfig(roadA);
    const configB = roadConfig(roadB);
    if (configA.bridge || configB.bridge) {
      return { type: "overpass", roadAId, roadBId };
    }

    const surfaceA = getRoadSurfacePolygon(roadA);
    const surfaceB = getRoadSurfacePolygon(roadB);
    if (!surfaceA.supported || !surfaceB.supported) {
      return {
        type: "unsupported",
        roadAId,
        roadBId,
        roadA: surfaceA,
        roadB: surfaceB
      };
    }

    const overlapPolygon = convexPolygonIntersection(surfaceA.polygon, surfaceB.polygon);
    if (!validPolygon(overlapPolygon)) return { type: "none", roadAId, roadBId };
    const classification = classifyRoadPair(roadA, roadB, overlapPolygon);

    return {
      type: "flat-intersection",
      roadAId,
      roadBId,
      approximateCenter: polygonCentroid(overlapPolygon),
      overlapPolygon,
      maskPadding: maskPaddingForConfigs(configA, configB),
      ...classification
    };
  }

  function pathData(points) {
    if (!Array.isArray(points) || !points.length) return "";
    return points.map((item, index) => `${index ? "L" : "M"} ${item.x} ${item.y}`).join(" ") + " Z";
  }

  function buildIntersectionDebugModel(intersection) {
    if (intersection?.type !== "flat-intersection") return null;
    const angleText = Number.isFinite(intersection.angleDeg) ? " " + Math.round(intersection.angleDeg) + "deg" : "";
    return {
      type: "road-intersection-debug",
      roadAId: intersection.roadAId,
      roadBId: intersection.roadBId,
      intersectionKind: intersection.intersectionKind || "unsupported",
      angleDeg: intersection.angleDeg,
      label: (intersection.intersectionKind || "unsupported") + angleText,
      approximateCenter: intersection.approximateCenter,
      overlapPolygon: intersection.overlapPolygon,
      pathData: validPathData(intersection.overlapPolygon)
    };
  }

  function buildIntersectionMaskModel(intersection) {
    if (intersection?.type !== "flat-intersection") return null;
    if (intersection.intersectionKind === "overlap" || intersection.intersectionKind === "parallel-touch" || intersection.intersectionKind === "unsupported") return null;
    const maskPolygon = expandPolygonFromCenter(intersection.overlapPolygon, intersection.maskPadding);
    if (!validPolygon(maskPolygon)) return null;
    return {
      type: "road-intersection-mask",
      roadAId: intersection.roadAId,
      roadBId: intersection.roadBId,
      intersectionKind: intersection.intersectionKind || "unsupported",
      overlapPolygon: intersection.overlapPolygon,
      maskPolygon,
      pathData: validPathData(maskPolygon)
    };
  }

  function isRoadObjectNode(node) {
    return Boolean(node?.dataset?.krokiObject === "true" && node.dataset.shape === "road");
  }

  function placeMaskLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    const maskLayer = canvas?.querySelector("#" + MASK_LAYER_ID);
    if (!objectLayer || !maskLayer) return;
    if (maskLayer.parentNode !== objectLayer) objectLayer.append(maskLayer);
    const firstNonRoad = Array.from(objectLayer.children).find((node) => node !== maskLayer && !isRoadObjectNode(node));
    if (firstNonRoad) objectLayer.insertBefore(maskLayer, firstNonRoad);
    else objectLayer.append(maskLayer);
  }

  function placeDebugLayer() {
    const canvas = manager.canvas;
    const editLayer = canvas?.querySelector("#editorEditLayer");
    if (!canvas || !editLayer?.parentNode) return;
    const debugLayer = canvas.querySelector("#" + DEBUG_LAYER_ID);
    if (debugLayer) editLayer.parentNode.insertBefore(debugLayer, editLayer);
  }

  function ensureMaskLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    if (!canvas || !objectLayer) return null;
    let layer = canvas.querySelector("#" + MASK_LAYER_ID);
    if (!layer) {
      layer = utils.createSvgElement("g", {
        id: MASK_LAYER_ID,
        "data-road-intersection-mask": "true",
        "pointer-events": "none"
      });
      objectLayer.append(layer);
    }
    placeMaskLayer();
    return layer;
  }

  function ensureDebugLayer() {
    const canvas = manager.canvas;
    if (!canvas) return null;
    let layer = canvas.querySelector("#" + DEBUG_LAYER_ID);
    if (!layer) {
      layer = utils.createSvgElement("g", {
        id: DEBUG_LAYER_ID,
        "data-road-intersection-debug": "true",
        "pointer-events": "none"
      });
      const editLayer = canvas.querySelector("#editorEditLayer");
      if (editLayer?.parentNode) editLayer.parentNode.insertBefore(layer, editLayer);
      else canvas.append(layer);
    }
    placeDebugLayer();
    return layer;
  }

  function clearIntersectionMasks() {
    ensureMaskLayer()?.replaceChildren();
  }

  function clearDebugOverlay() {
    ensureDebugLayer()?.replaceChildren();
  }

  function renderIntersectionMasks(intersections) {
    const layer = ensureMaskLayer();
    if (!layer) return [];
    layer.replaceChildren();
    const maskModels = [];

    intersections.forEach((intersection) => {
      const maskModel = buildIntersectionMaskModel(intersection);
      if (!maskModel?.pathData) return;
      maskModels.push(maskModel);
      const path = utils.createSvgElement("path", {
        class: "road-intersection-mask",
        d: maskModel.pathData,
        fill: ROAD_SURFACE_FILL,
        stroke: "none",
        "data-road-a": maskModel.roadAId,
        "data-road-b": maskModel.roadBId,
        "pointer-events": "none"
      });
      layer.append(path);
    });
    placeMaskLayer();
    return maskModels;
  }

  function renderDebugOverlay(debugModels) {
    const layer = ensureDebugLayer();
    if (!layer) return;
    layer.replaceChildren();
    if (!engine.debug) return;

    debugModels.forEach((debugModel) => {
      if (!debugModel?.pathData) return;
      const group = utils.createSvgElement("g", {
        class: "road-intersection-debug",
        "data-road-a": debugModel.roadAId,
        "data-road-b": debugModel.roadBId
      });
      const area = utils.createSvgElement("path", {
        d: debugModel.pathData,
        fill: "#38bdf8",
        "fill-opacity": ".42",
        stroke: "#0369a1",
        "stroke-opacity": ".9",
        "stroke-width": "3",
        "vector-effect": "non-scaling-stroke"
      });
      const center = utils.createSvgElement("circle", {
        cx: String(debugModel.approximateCenter.x),
        cy: String(debugModel.approximateCenter.y),
        r: "7",
        fill: "#0284c7",
        stroke: "#ffffff",
        "stroke-width": "2",
        "vector-effect": "non-scaling-stroke"
      });
      const label = utils.createSvgElement("text", {
        x: String(debugModel.approximateCenter.x + 10),
        y: String(debugModel.approximateCenter.y - 10),
        fill: "#075985",
        stroke: "#ffffff",
        "stroke-width": "3",
        "paint-order": "stroke",
        "font-size": "14",
        "font-weight": "700",
        "pointer-events": "none"
      });
      label.textContent = debugModel.label || "";
      group.append(area, center, label);
      layer.append(group);
    });
  }

  function refresh() {
    clearIntersectionMasks();
    clearDebugOverlay();
    const roads = getRoadModels();
    const intersections = [];
    const debugModels = [];

    try {
      for (let aIndex = 0; aIndex < roads.length; aIndex += 1) {
        for (let bIndex = aIndex + 1; bIndex < roads.length; bIndex += 1) {
          try {
            const intersection = detectPairIntersection(roads[aIndex], roads[bIndex]);
            intersections.push(intersection);
            const debugModel = buildIntersectionDebugModel(intersection);
            if (debugModel) debugModels.push(debugModel);
          } catch (error) {
            warn("Road cifti hesaplanamadi", error);
          }
        }
      }
    } catch (error) {
      warn("Refresh hesaplamasi durduruldu", error);
    }

    lastIntersections = intersections;
    try {
      renderIntersectionMasks(intersections);
    } catch (error) {
      warn("Maskeler cizilemedi", error);
      clearIntersectionMasks();
    }
    try {
      renderDebugOverlay(debugModels);
    } catch (error) {
      warn("Debug overlay cizilemedi", error);
      clearDebugOverlay();
    }
    return getLastIntersections();
  }

  function scheduleRefresh() {
    if (engine.refreshQueued) return;
    engine.refreshQueued = true;
    const run = () => {
      engine.refreshQueued = false;
      try {
        refresh();
      } catch (error) {
        warn("Zamanlanmis refresh calismadi", error);
      }
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function setDebug(value) {
    engine.debug = Boolean(value);
    if (engine.debug) scheduleRefresh();
    else clearDebugOverlay();
    return engine.debug;
  }

  engine.debug = engine.debug === true;
  engine.edgeMaskPadding = numberOr(engine.edgeMaskPadding, DEFAULT_EDGE_MASK_PADDING);
  engine.getRoadModels = getRoadModels;
  engine.getRoadSurfacePolygon = getRoadSurfacePolygon;
  engine.getRoadAxisInfo = getRoadAxisInfo;
  engine.pointProjectionOnAxis = pointProjectionOnAxis;
  engine.classifyIntersection = classifyIntersection;
  engine.classifyRoadPair = classifyRoadPair;
  engine.detectPairIntersection = detectPairIntersection;
  engine.buildIntersectionDebugModel = buildIntersectionDebugModel;
  engine.renderIntersectionMasks = renderIntersectionMasks;
  engine.clearIntersectionMasks = clearIntersectionMasks;
  engine.getLastIntersections = getLastIntersections;
  engine.setDebug = setDebug;
  engine.refresh = refresh;
  engine.scheduleRefresh = scheduleRefresh;
  engine.clearDebugOverlay = clearDebugOverlay;

  Kroki.RoadIntersectionEngine = engine;
})();
