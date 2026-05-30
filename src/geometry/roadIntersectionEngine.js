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
  const MIN_CURB_PREVIEW_ANGLE = 15;
  const CURB_RADIUS_MIN = 35;
  const CURB_RADIUS_MAX = 80;
  const MASK_LAYER_ID = "roadIntersectionMaskLayer";
  const VISUAL_LAYER_ID = "roadIntersectionVisualLayer";
  const CURB_BACK_MASK_LAYER_ID = "roadIntersectionCurbBackMaskLayer";
  const CURB_LAYER_ID = "roadIntersectionCurbLayer";
  const DEBUG_LAYER_ID = "roadIntersectionDebugLayer";
  let lastIntersections = [];
  let lastIntersectionVisuals = [];
  let lastCurbPreviews = [];
  const engine = Kroki.RoadIntersectionEngine || {};

  function numberOr(value, fallback) {
    return utils.numberOr(value, fallback);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

  function getLastIntersectionVisuals() {
    return lastIntersectionVisuals.slice();
  }

  function getLastCurbPreviews() {
    return lastCurbPreviews.slice();
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

  function dotPoint(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function addPoint(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function subtractPoint(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function scalePoint(value, amount) {
    return { x: value.x * amount, y: value.y * amount };
  }

  function signOr(value, fallback) {
    if (value > EPSILON) return 1;
    if (value < -EPSILON) return -1;
    return fallback >= 0 ? 1 : -1;
  }

  function curbPreviewRadius(axisA, axisB) {
    const minRoadWidth = Math.min(axisA.totalWidth, axisB.totalWidth);
    return clamp(minRoadWidth * 0.25, CURB_RADIUS_MIN, CURB_RADIUS_MAX);
  }

  function offsetAxisLinePoint(axis, sideSign) {
    return addPoint(axis.start, scalePoint(axis.normal, sideSign * axis.totalWidth / 2));
  }

  function offsetAxisLineIntersection(axisA, sideA, axisB, sideB) {
    const a0 = offsetAxisLinePoint(axisA, sideA);
    const b0 = offsetAxisLinePoint(axisB, sideB);
    return lineIntersection(a0, addPoint(a0, axisA.direction), b0, addPoint(b0, axisB.direction));
  }

  function validCurbPreview(curb) {
    return Boolean(
      curb?.supported
      && isFinitePoint(curb.start)
      && isFinitePoint(curb.end)
      && isFinitePoint(curb.control)
      && Number.isFinite(curb.radius)
      && curb.radius > 0
    );
  }

  function curbPathData(curb) {
    if (!validCurbPreview(curb)) return "";
    return `M ${curb.start.x} ${curb.start.y} Q ${curb.control.x} ${curb.control.y} ${curb.end.x} ${curb.end.y}`;
  }

  function createCurbPreview(intersection, cornerIndex, start, end, control, radius) {
    const curb = {
      intersectionId: `${intersection.roadAId || ""}:${intersection.roadBId || ""}`,
      kind: intersection.intersectionKind,
      cornerIndex,
      center: point(intersection.approximateCenter),
      start,
      end,
      control,
      radius,
      supported: true
    };
    return validCurbPreview(curb) ? curb : null;
  }

  function buildCrossCurbPreviews(intersection, axisA, axisB) {
    const angle = normalizedParallelAngle(intersection.angleDeg);
    if (!Number.isFinite(angle) || angle < MIN_CURB_PREVIEW_ANGLE) return [];

    const center = point(intersection.approximateCenter);
    const radius = curbPreviewRadius(axisA, axisB);
    const maxAnchorDistance = Math.max(axisA.totalWidth, axisB.totalWidth) * 4 + radius;
    const curbs = [];
    [-1, 1].forEach((sideA) => {
      [-1, 1].forEach((sideB) => {
        const control = offsetAxisLineIntersection(axisA, sideA, axisB, sideB);
        if (!isFinitePoint(control)) return;
        if (Math.hypot(control.x - center.x, control.y - center.y) > maxAnchorDistance) return;

        const fromCenter = subtractPoint(control, center);
        const axisADirectionSign = signOr(dotPoint(fromCenter, axisA.direction), sideA);
        const axisBDirectionSign = signOr(dotPoint(fromCenter, axisB.direction), sideB);
        const start = addPoint(control, scalePoint(axisA.direction, axisADirectionSign * radius));
        const end = addPoint(control, scalePoint(axisB.direction, axisBDirectionSign * radius));
        const curb = createCurbPreview(intersection, curbs.length, start, end, control, radius);
        if (curb) curbs.push(curb);
      });
    });
    return curbs;
  }

  function branchOutDirection(axis, center) {
    const projection = pointProjectionOnAxis(center, axis);
    if (!projection) return null;
    return projection.distanceToStart <= projection.distanceToEnd
      ? axis.direction
      : scalePoint(axis.direction, -1);
  }

  function buildTeeCurbPreviews(intersection, axisA, axisB) {
    const mainAxis = intersection.roadAThrough && !intersection.roadBThrough ? axisA
      : intersection.roadBThrough && !intersection.roadAThrough ? axisB
        : null;
    const branchAxis = mainAxis === axisA ? axisB : mainAxis === axisB ? axisA : null;
    if (!mainAxis || !branchAxis) return [];

    const center = point(intersection.approximateCenter);
    const branchDirection = branchOutDirection(branchAxis, center);
    if (!branchDirection) return [];

    const radius = curbPreviewRadius(mainAxis, branchAxis);
    const maxAnchorDistance = Math.max(mainAxis.totalWidth, branchAxis.totalWidth) * 4 + radius;
    const mainSide = signOr(dotPoint(branchDirection, mainAxis.normal), 1);
    const curbs = [];

    [-1, 1].forEach((branchSide) => {
      const control = offsetAxisLineIntersection(mainAxis, mainSide, branchAxis, branchSide);
      if (!isFinitePoint(control)) return;
      if (Math.hypot(control.x - center.x, control.y - center.y) > maxAnchorDistance) return;

      const fromCenter = subtractPoint(control, center);
      const mainDirectionSign = signOr(dotPoint(fromCenter, mainAxis.direction), branchSide);
      const start = addPoint(control, scalePoint(mainAxis.direction, mainDirectionSign * radius));
      const end = addPoint(control, scalePoint(branchDirection, radius));
      const curb = createCurbPreview(intersection, curbs.length, start, end, control, radius);
      if (curb) curbs.push(curb);
    });
    return curbs;
  }

  function buildCurbsForIntersection(intersection, roadsById) {
    if (intersection?.type !== "flat-intersection") return [];
    const kind = intersection.intersectionKind;
    if (kind !== "cross" && kind !== "tee" && kind !== "skew") return [];

    const roadA = roadsById.get(intersection.roadAId);
    const roadB = roadsById.get(intersection.roadBId);
    const axisA = getRoadAxisInfo(roadA);
    const axisB = getRoadAxisInfo(roadB);
    if (!axisA.supported || !axisB.supported || !isFinitePoint(intersection.approximateCenter)) return [];

    if (kind === "tee") return buildTeeCurbPreviews(intersection, axisA, axisB);
    return buildCrossCurbPreviews(intersection, axisA, axisB);
  }

  function buildCurbPreviewModel(intersections, roadModels) {
    const roads = Array.isArray(roadModels) ? roadModels : getRoadModels();
    const roadsById = new Map(roads.map((model) => [model?.id || "", model]));
    const curbs = [];
    (Array.isArray(intersections) ? intersections : []).forEach((intersection) => {
      try {
        curbs.push(...buildCurbsForIntersection(intersection, roadsById));
      } catch (error) {
        warn("Curb preview hesaplanamadi", error);
      }
    });
    return curbs;
  }

  function supportsIntersectionVisual(intersection) {
    return intersection?.type === "flat-intersection"
      && (intersection.intersectionKind === "cross" || intersection.intersectionKind === "tee" || intersection.intersectionKind === "skew")
      && validPolygon(intersection.overlapPolygon)
      && isFinitePoint(intersection.approximateCenter);
  }

  function visualPatchPadding(intersection) {
    const base = numberOr(intersection?.maskPadding, DEFAULT_EDGE_MASK_PADDING);
    if (intersection?.intersectionKind === "tee") return Math.max(4, Math.min(14, base));
    return Math.max(4, Math.min(18, base));
  }

  function buildIntersectionVisual(intersection, roadsById) {
    if (!supportsIntersectionVisual(intersection)) return null;
    const curbs = buildCurbsForIntersection(intersection, roadsById);
    if (!curbs.length) return null;
    const surfacePatch = expandPolygonFromCenter(intersection.overlapPolygon, visualPatchPadding(intersection));
    if (!validPolygon(surfacePatch)) return null;
    return {
      intersectionId: `${intersection.roadAId || ""}:${intersection.roadBId || ""}`,
      kind: intersection.intersectionKind,
      center: point(intersection.approximateCenter),
      surfacePatch,
      maskPolygon: surfacePatch,
      curbs,
      supported: true
    };
  }

  function buildIntersectionVisualModel(intersections, roadModels) {
    const roads = Array.isArray(roadModels) ? roadModels : getRoadModels();
    const roadsById = new Map(roads.map((model) => [model?.id || "", model]));
    const visuals = [];
    (Array.isArray(intersections) ? intersections : []).forEach((intersection) => {
      try {
        const visual = buildIntersectionVisual(intersection, roadsById);
        if (visual) visuals.push(visual);
      } catch (error) {
        warn("Intersection visual hesaplanamadi", error);
      }
    });
    return visuals;
  }

  function curbsFromVisuals(visuals) {
    return (Array.isArray(visuals) ? visuals : [])
      .flatMap((visual) => Array.isArray(visual?.curbs) ? visual.curbs : [])
      .filter(validCurbPreview);
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

  function isIntersectionObjectLayer(node) {
    return node?.id === MASK_LAYER_ID
      || node?.id === VISUAL_LAYER_ID
      || node?.id === CURB_BACK_MASK_LAYER_ID
      || node?.id === CURB_LAYER_ID;
  }

  function placeIntersectionObjectLayers() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    if (!objectLayer) return;
    const maskLayer = canvas?.querySelector("#" + MASK_LAYER_ID);
    const visualLayer = canvas?.querySelector("#" + VISUAL_LAYER_ID);
    const curbBackMaskLayer = canvas?.querySelector("#" + CURB_BACK_MASK_LAYER_ID);
    const curbLayer = canvas?.querySelector("#" + CURB_LAYER_ID);
    [maskLayer, visualLayer, curbBackMaskLayer, curbLayer].forEach((layer) => {
      if (layer && layer.parentNode !== objectLayer) objectLayer.append(layer);
    });
    let nextNode = Array.from(objectLayer.children).find((node) => (
      !isIntersectionObjectLayer(node) && !isRoadObjectNode(node)
    )) || null;
    [curbLayer, curbBackMaskLayer, visualLayer, maskLayer].forEach((layer) => {
      if (!layer) return;
      if (layer.nextSibling !== nextNode) objectLayer.insertBefore(layer, nextNode);
      nextNode = layer;
    });
  }

  function placeMaskLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    const maskLayer = canvas?.querySelector("#" + MASK_LAYER_ID);
    if (!objectLayer || !maskLayer) return;
    placeIntersectionObjectLayers();
  }

  function placeVisualLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    const visualLayer = canvas?.querySelector("#" + VISUAL_LAYER_ID);
    if (!objectLayer || !visualLayer) return;
    placeIntersectionObjectLayers();
  }

  function placeCurbBackMaskLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    const curbBackMaskLayer = canvas?.querySelector("#" + CURB_BACK_MASK_LAYER_ID);
    if (!objectLayer || !curbBackMaskLayer) return;
    placeIntersectionObjectLayers();
  }

  function placeCurbLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    const curbLayer = canvas?.querySelector("#" + CURB_LAYER_ID);
    if (!objectLayer || !curbLayer) return;
    placeIntersectionObjectLayers();
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

  function ensureVisualLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    if (!canvas || !objectLayer) return null;
    let layer = canvas.querySelector("#" + VISUAL_LAYER_ID);
    if (!layer) {
      layer = utils.createSvgElement("g", {
        id: VISUAL_LAYER_ID,
        "data-road-intersection-visual": "true",
        "pointer-events": "none"
      });
      objectLayer.append(layer);
    }
    placeVisualLayer();
    return layer;
  }

  function ensureCurbBackMaskLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    if (!canvas || !objectLayer) return null;
    let layer = canvas.querySelector("#" + CURB_BACK_MASK_LAYER_ID);
    if (!layer) {
      layer = utils.createSvgElement("g", {
        id: CURB_BACK_MASK_LAYER_ID,
        "data-road-intersection-curb-back-mask": "true",
        "pointer-events": "none"
      });
      objectLayer.append(layer);
    }
    placeCurbBackMaskLayer();
    return layer;
  }

  function ensureCurbLayer() {
    const canvas = manager.canvas;
    const objectLayer = manager.objectLayer || canvas?.querySelector("#editorObjects");
    if (!canvas || !objectLayer) return null;
    let layer = canvas.querySelector("#" + CURB_LAYER_ID);
    if (!layer) {
      layer = utils.createSvgElement("g", {
        id: CURB_LAYER_ID,
        "data-road-intersection-curb": "true",
        "pointer-events": "none"
      });
      objectLayer.append(layer);
    }
    placeCurbLayer();
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

  function clearIntersectionVisuals() {
    ensureVisualLayer()?.replaceChildren();
  }

  function clearCurbBackMasks() {
    ensureCurbBackMaskLayer()?.replaceChildren();
  }

  function clearCurbPreview() {
    ensureCurbLayer()?.replaceChildren();
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

  function renderIntersectionVisuals(visuals) {
    const layer = ensureVisualLayer();
    if (!layer) return [];
    layer.replaceChildren();
    const rendered = [];

    (Array.isArray(visuals) ? visuals : []).forEach((visual) => {
      const d = validPathData(visual?.surfacePatch);
      if (!visual?.supported || !d) return;
      rendered.push(visual);
      const patch = utils.createSvgElement("path", {
        class: "road-intersection-surface-patch",
        d,
        fill: ROAD_SURFACE_FILL,
        stroke: "none",
        "data-intersection-id": visual.intersectionId,
        "data-kind": visual.kind,
        "pointer-events": "none"
      });
      layer.append(patch);
    });
    placeVisualLayer();
    return rendered;
  }

  function buildCurbBackMaskModel(visuals) {
    return curbsFromVisuals(visuals).map((curb) => ({
      ...curb,
      pathData: curbPathData(curb),
      strokeWidth: Math.max(11, Math.min(18, numberOr(curb.radius, CURB_RADIUS_MIN) * 0.18 + 5))
    })).filter((mask) => mask.pathData);
  }

  function renderCurbBackMasks(visuals) {
    const layer = ensureCurbBackMaskLayer();
    if (!layer) return [];
    layer.replaceChildren();
    const masks = buildCurbBackMaskModel(visuals);

    masks.forEach((mask) => {
      const path = utils.createSvgElement("path", {
        class: "road-intersection-curb-back-mask",
        d: mask.pathData,
        fill: "none",
        stroke: ROAD_SURFACE_FILL,
        "stroke-width": String(mask.strokeWidth),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "vector-effect": "non-scaling-stroke",
        "data-intersection-id": mask.intersectionId,
        "data-corner-index": String(mask.cornerIndex),
        "data-kind": mask.kind,
        "pointer-events": "none"
      });
      layer.append(path);
    });
    placeCurbBackMaskLayer();
    return masks;
  }

  function renderCurbPreview(curbs) {
    const layer = ensureCurbLayer();
    if (!layer) return [];
    layer.replaceChildren();
    const rendered = [];

    (Array.isArray(curbs) ? curbs : []).forEach((curb) => {
      const d = curbPathData(curb);
      if (!d) return;
      rendered.push(curb);
      const path = utils.createSvgElement("path", {
        class: "road-intersection-curb-preview",
        d,
        fill: "none",
        stroke: "#111827",
        "stroke-width": "3",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "vector-effect": "non-scaling-stroke",
        "data-intersection-id": curb.intersectionId,
        "data-corner-index": String(curb.cornerIndex),
        "data-kind": curb.kind,
        "pointer-events": "none"
      });
      layer.append(path);

      if (engine.debug) {
        const pointNode = utils.createSvgElement("circle", {
          cx: String(curb.control.x),
          cy: String(curb.control.y),
          r: "4",
          fill: "#111827",
          stroke: "#ffffff",
          "stroke-width": "1.5",
          "vector-effect": "non-scaling-stroke",
          "pointer-events": "none"
        });
        layer.append(pointNode);
      }
    });
    placeCurbLayer();
    return rendered;
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
    clearIntersectionVisuals();
    clearCurbBackMasks();
    clearCurbPreview();
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
    lastIntersectionVisuals = [];
    lastCurbPreviews = [];
    try {
      renderIntersectionMasks(intersections);
    } catch (error) {
      warn("Maskeler cizilemedi", error);
      clearIntersectionMasks();
    }
    try {
      lastIntersectionVisuals = buildIntersectionVisualModel(intersections, roads);
      renderIntersectionVisuals(lastIntersectionVisuals);
      renderCurbBackMasks(lastIntersectionVisuals);
      lastCurbPreviews = curbsFromVisuals(lastIntersectionVisuals);
      renderCurbPreview(lastCurbPreviews);
    } catch (error) {
      warn("Intersection visual cizilemedi", error);
      lastIntersectionVisuals = [];
      lastCurbPreviews = [];
      clearIntersectionVisuals();
      clearCurbBackMasks();
      clearCurbPreview();
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
    else {
      clearDebugOverlay();
      renderCurbPreview(lastCurbPreviews);
    }
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
  engine.buildCurbPreviewModel = buildCurbPreviewModel;
  engine.buildIntersectionVisualModel = buildIntersectionVisualModel;
  engine.renderIntersectionMasks = renderIntersectionMasks;
  engine.renderIntersectionVisuals = renderIntersectionVisuals;
  engine.renderCurbPreview = renderCurbPreview;
  engine.clearIntersectionMasks = clearIntersectionMasks;
  engine.clearIntersectionVisuals = clearIntersectionVisuals;
  engine.clearCurbBackMasks = clearCurbBackMasks;
  engine.clearCurbPreview = clearCurbPreview;
  engine.getLastIntersections = getLastIntersections;
  engine.getLastIntersectionVisuals = getLastIntersectionVisuals;
  engine.getLastCurbPreviews = getLastCurbPreviews;
  engine.setDebug = setDebug;
  engine.refresh = refresh;
  engine.scheduleRefresh = scheduleRefresh;
  engine.clearDebugOverlay = clearDebugOverlay;

  Kroki.RoadIntersectionEngine = engine;
})();
