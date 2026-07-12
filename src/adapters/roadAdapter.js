(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const lineGeometry = Kroki.LineGeometry;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !lineGeometry || !styleManager) return;

  const STRAIGHT = "straight";
  const ARC = "arc";
  const S_CURVE = "sCurve";
  const ISLAND = "islandRing";
  const SAMPLE_COUNT = 64;
  const PREVIEW_S_CURVE_SAMPLE_COUNT = 22;
  const PREVIEW_ISLAND_SAMPLE_COUNT = 28;
  const MIN_WIDTH = 2;
  const MAX_LANES = 5;
  const DEFAULT_ARC_RATIO = Math.tan((36 * Math.PI / 180) / 2);
  const ROAD_LINE_COLOR = "#000000";
  const MIN_S_CURVE_CONTROLS = 2;
  const MAX_S_CURVE_CONTROLS = 5;
  const S_CURVE_ENDPOINT_AXIS_BLEND = 0.55;
  const S_CURVE_KNOT_ALPHA = 0.5;
  const S_CURVE_TANGENT_STEP = 1 / (SAMPLE_COUNT * 8);
  const DEFAULT_ISLAND_INNER_DIAMETER = 160;
  const DEFAULT_ISLAND_LANE_COUNT = 1;
  const DEFAULT_ISLAND_LANE_WIDTH = 50;
  const MIN_ISLAND_INNER_DIAMETER = 20;
  const MIN_ISLAND_LANE_WIDTH = 10;
  const MAX_ISLAND_DIAMETER = 1600;
  const DEFAULT_BARRIER_SPACING = 42;
  const MIN_BARRIER_SPACING = 18;
  const MAX_BARRIER_SPACING = 180;
  const MAX_BARRIERS_PER_SIDE = 2;
  const BARRIER_DEPTH = 8;
  const BARRIER_TOP_WIDTH = 4;
  const BARRIER_POST_WIDTH = 3;
  const BARRIER_HIT_TOLERANCE = 16;
  const POCKET_MODES = ["none", "right", "left", "double"];
  const DEFAULT_POCKET_WIDTH = 50;
  const DEFAULT_POCKET_GAP = 20;
  const DEFAULT_POCKET_ISLAND_STYLE = {
    fill: "#dcfce7",
    fillOpacity: 1,
    fillPattern: "grass"
  };
  const BARRIER_EDGE_ORDER = ["rightOuter", "rightInner", "leftInner", "leftOuter"];
  const BARRIER_END_CAP_STATES = [
    { start: false, end: false },
    { start: false, end: true },
    { start: true, end: false },
    { start: true, end: true }
  ];
  const sampleCache = new WeakMap();

  const DEFAULT_ROAD_CONFIG = {
    version: 1,
    laneCount: 2,
    laneWidth: 50,
    laneWidths: [50, 50],
    divided: false,
    dividedLaneWidths: { left: [50, 50], right: [50, 50] },
    leftShoulder: { enabled: false, width: 20 },
    rightShoulder: { enabled: false, width: 20 },
    innerShoulder: { enabled: false, width: 15 },
    waterChannel: { enabled: false, width: 30 },
    barrier: { enabled: false, width: 6 },
    marking: { style: "dash", width: 2 },
    edgeLine: { enabled: true, width: 2 },
    boundaryStyles: {},
    pockets: { left: null, right: null },
    barriers: [],
    autoIntersection: true,
    bridge: false,
    segments: [{ from: 0, to: 1, markingStyle: "dash" }]
  };

  function numberOr(value, fallback) {
    return utils.numberOr(value, fallback);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampInt(value, min, max, fallback) {
    const number = Math.round(numberOr(value, fallback));
    return clamp(number, min, max);
  }

  function widthOr(value, fallback, min = MIN_WIDTH, max = 300) {
    return clamp(numberOr(value, fallback), min, max);
  }

  function point(value, fallback = { x: 0, y: 0 }) {
    return {
      x: numberOr(value?.x, fallback.x),
      y: numberOr(value?.y, fallback.y)
    };
  }

  function lerp(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
  }

  function distanceBetween(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function formatPoint(item) {
    return `${Number(item.x) || 0} ${Number(item.y) || 0}`;
  }

  function normalizeProfile(value) {
    if (value === ARC || value === S_CURVE || value === ISLAND) return value;
    return STRAIGHT;
  }

  function isIslandGeometry(geometry) {
    return geometry?.profile === ISLAND;
  }

  function islandLaneCountFromConfig(config) {
    return clampInt(config?.laneCount, 1, 3, DEFAULT_ISLAND_LANE_COUNT);
  }

  function islandLaneWidthFromGeometry(geometry, laneCount = DEFAULT_ISLAND_LANE_COUNT) {
    const radii = islandRadii(geometry);
    return radii.width / Math.max(1, laneCount);
  }

  function islandLaneWidthsFromConfig(geometry, config, laneCount = DEFAULT_ISLAND_LANE_COUNT) {
    const totalWidth = islandRadii(geometry).width;
    const fallbackWidth = islandLaneWidthFromGeometry(geometry, laneCount);
    const minimumWidth = Math.min(MIN_ISLAND_LANE_WIDTH, fallbackWidth);
    const source = Array.isArray(config?.laneWidths) ? config.laneWidths : [];
    const widths = Array.from({ length: laneCount }, (_, index) => (
      widthOr(source[index], config?.laneWidth || fallbackWidth, minimumWidth, MAX_ISLAND_DIAMETER)
    ));
    const remainingWidth = Math.max(0, totalWidth - minimumWidth * laneCount);
    const weights = widths.map((width) => Math.max(0, width - minimumWidth));
    const totalWeight = weights.reduce((sum, width) => sum + width, 0);
    if (totalWeight < 0.001) return Array.from({ length: laneCount }, () => fallbackWidth);
    return weights.map((weight) => minimumWidth + remainingWidth * weight / totalWeight);
  }

  function cleanIslandDiameters(input = {}) {
    let innerDiameter = widthOr(input.innerDiameter, DEFAULT_ISLAND_INNER_DIAMETER, MIN_ISLAND_INNER_DIAMETER, MAX_ISLAND_DIAMETER);
    let outerDiameter = widthOr(input.outerDiameter, innerDiameter + DEFAULT_ISLAND_LANE_WIDTH * DEFAULT_ISLAND_LANE_COUNT * 2, MIN_ISLAND_INNER_DIAMETER + MIN_ISLAND_LANE_WIDTH * 2, MAX_ISLAND_DIAMETER);
    if (outerDiameter < innerDiameter + MIN_ISLAND_LANE_WIDTH * 2) {
      outerDiameter = Math.min(MAX_ISLAND_DIAMETER, innerDiameter + MIN_ISLAND_LANE_WIDTH * 2);
      if (outerDiameter <= innerDiameter) innerDiameter = Math.max(MIN_ISLAND_INNER_DIAMETER, outerDiameter - MIN_ISLAND_LANE_WIDTH * 2);
    }
    return { innerDiameter, outerDiameter };
  }

  function islandRadii(geometry = {}) {
    const clean = cleanIslandDiameters(geometry);
    const innerRadius = clean.innerDiameter / 2;
    const outerRadius = clean.outerDiameter / 2;
    return {
      innerRadius,
      outerRadius,
      centerRadius: (innerRadius + outerRadius) / 2,
      width: Math.max(MIN_WIDTH, outerRadius - innerRadius)
    };
  }

  function islandAngleAt(t) {
    return -Math.PI * 2 * clamp(t, 0, 1);
  }

  function islandPointAt(geometry, t, offset = 0) {
    const center = point(geometry.center, { x: 600, y: 400 });
    const radii = islandRadii(geometry);
    const radius = Math.max(1, radii.centerRadius + offset);
    const angle = islandAngleAt(t);
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    };
  }

  function islandTangentAt(_geometry, t) {
    const angle = islandAngleAt(t);
    return { x: Math.sin(angle), y: -Math.cos(angle) };
  }

  function circlePoints(center, radius, reverse = false, count = SAMPLE_COUNT) {
    const points = [];
    for (let index = 0; index < count; index += 1) {
      const rawT = index / count;
      const t = reverse ? 1 - rawT : rawT;
      const angle = islandAngleAt(t);
      points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    }
    return points;
  }

  function direction(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length, length };
  }

  function arcBasis(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return null;
    return {
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      normal: { x: -dy / length, y: dx / length },
      halfLength: length / 2
    };
  }

  function arcControlFromRatio(basisValue, ratio) {
    const sagitta = basisValue.halfLength * ratio;
    return {
      x: basisValue.mid.x + basisValue.normal.x * sagitta,
      y: basisValue.mid.y + basisValue.normal.y * sagitta
    };
  }

  function arcRatioFromPoint(basisValue, pointValue) {
    const sagitta = (pointValue.x - basisValue.mid.x) * basisValue.normal.x + (pointValue.y - basisValue.mid.y) * basisValue.normal.y;
    return sagitta / basisValue.halfLength;
  }

  function arcControlPoint(model) {
    const basisValue = arcBasis(model.geometry.start, model.geometry.end);
    if (!basisValue) {
      return {
        x: (model.geometry.start.x + model.geometry.end.x) / 2,
        y: (model.geometry.start.y + model.geometry.end.y) / 2
      };
    }
    return arcControlFromRatio(basisValue, numberOr(model.geometry.ratio, DEFAULT_ARC_RATIO));
  }

  function normalizeAngle(angle) {
    const tau = Math.PI * 2;
    return ((angle % tau) + tau) % tau;
  }

  function arcCircleGeometry(start, end, control) {
    const chordLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (chordLength < 0.001) return null;
    const x1 = start.x;
    const y1 = start.y;
    const x2 = control.x;
    const y2 = control.y;
    const x3 = end.x;
    const y3 = end.y;
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 0.001) return null;
    const startSq = x1 * x1 + y1 * y1;
    const controlSq = x2 * x2 + y2 * y2;
    const endSq = x3 * x3 + y3 * y3;
    const cx = (startSq * (y2 - y3) + controlSq * (y3 - y1) + endSq * (y1 - y2)) / d;
    const cy = (startSq * (x3 - x2) + controlSq * (x1 - x3) + endSq * (x2 - x1)) / d;
    const radius = Math.hypot(x1 - cx, y1 - cy);
    if (!Number.isFinite(radius) || radius < 0.001) return null;
    const startAngle = Math.atan2(y1 - cy, x1 - cx);
    const controlAngle = Math.atan2(y2 - cy, x2 - cx);
    const endAngle = Math.atan2(y3 - cy, x3 - cx);
    const clockwiseDelta = normalizeAngle(endAngle - startAngle);
    const controlDelta = normalizeAngle(controlAngle - startAngle);
    const controlOnClockwiseArc = controlDelta <= clockwiseDelta;
    const arcDelta = controlOnClockwiseArc ? clockwiseDelta : Math.PI * 2 - clockwiseDelta;
    return {
      cx,
      cy,
      radius,
      startAngle,
      endAngle,
      sweepFlag: controlOnClockwiseArc ? 1 : 0,
      arcDelta
    };
  }

  function arcGeometry(model) {
    return arcCircleGeometry(model.geometry.start, model.geometry.end, arcControlPoint(model));
  }

  function arcPointAt(model, t) {
    const geometry = arcGeometry(model);
    if (!geometry) return lerp(model.geometry.start, model.geometry.end, t);
    const delta = geometry.sweepFlag
      ? normalizeAngle(geometry.endAngle - geometry.startAngle)
      : -normalizeAngle(geometry.startAngle - geometry.endAngle);
    const angle = geometry.startAngle + delta * t;
    return {
      x: geometry.cx + Math.cos(angle) * geometry.radius,
      y: geometry.cy + Math.sin(angle) * geometry.radius
    };
  }

  function arcTangentAt(model, t) {
    const geometry = arcGeometry(model);
    if (!geometry) {
      return {
        x: model.geometry.end.x - model.geometry.start.x,
        y: model.geometry.end.y - model.geometry.start.y
      };
    }
    const delta = geometry.sweepFlag
      ? normalizeAngle(geometry.endAngle - geometry.startAngle)
      : -normalizeAngle(geometry.startAngle - geometry.endAngle);
    const angle = geometry.startAngle + delta * t;
    return delta >= 0
      ? { x: -Math.sin(angle), y: Math.cos(angle) }
      : { x: Math.sin(angle), y: -Math.cos(angle) };
  }

  function defaultSCurveControlPoints(start, end, count = MIN_S_CURVE_CONTROLS) {
    const cleanCount = clampInt(count, MIN_S_CURVE_CONTROLS, MAX_S_CURVE_CONTROLS, MIN_S_CURVE_CONTROLS);
    const dir = direction(start, end);
    const normal = { x: -dir.y, y: dir.x };
    const bow = Math.max(50, Math.min(160, dir.length * 0.22));
    return Array.from({ length: cleanCount }, (_, index) => {
      const t = (index + 1) / (cleanCount + 1);
      const wave = index % 2 === 0 ? 1 : -1;
      return {
        x: start.x + dir.x * dir.length * t + normal.x * bow * wave,
        y: start.y + dir.y * dir.length * t + normal.y * bow * wave
      };
    });
  }

  function defaultSCurveControls(start, end) {
    const controls = defaultSCurveControlPoints(start, end, MIN_S_CURVE_CONTROLS);
    return { c1: controls[0], c2: controls[1] };
  }

  function cleanSCurveControls(geometry, fallbackCount = MIN_S_CURVE_CONTROLS) {
    const existing = Array.isArray(geometry?.controls)
      ? geometry.controls
      : [geometry?.c1, geometry?.c2].filter(Boolean);
    const count = clampInt(existing.length || geometry?.controlCount || fallbackCount, MIN_S_CURVE_CONTROLS, MAX_S_CURVE_CONTROLS, MIN_S_CURVE_CONTROLS);
    const defaults = defaultSCurveControlPoints(geometry.start, geometry.end, count);
    return Array.from({ length: count }, (_, index) => point(existing[index], defaults[index]));
  }

  function syncLegacySCurveControls(geometry) {
    if (!geometry || geometry.profile !== S_CURVE) return geometry;
    const controls = cleanSCurveControls(geometry);
    geometry.controls = controls;
    geometry.controlCount = controls.length;
    geometry.c1 = controls[0];
    geometry.c2 = controls[1];
    return geometry;
  }

  function isStraightGeometry(geometry) {
    return normalizeProfile(geometry?.profile) === STRAIGHT;
  }

  function sCurveThroughPoints(geometry) {
    const controls = cleanSCurveControls(geometry);
    return [geometry.start, ...controls, geometry.end].map((item) => point(item));
  }

  function sCurveSegmentInfo(points, t) {
    const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
    if (safePoints.length < 2) {
      return { index: 0, u: 0, total: 0, lengths: [] };
    }
    const lengths = [];
    let total = 0;
    for (let index = 0; index < safePoints.length - 1; index += 1) {
      const a = safePoints[index];
      const b = safePoints[index + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      lengths.push(length);
      total += length;
    }
    if (total < 0.001) {
      return { index: 0, u: 0, total, lengths };
    }
    const target = clamp(t, 0, 1) * total;
    let travelled = 0;
    for (let index = 0; index < lengths.length; index += 1) {
      const length = lengths[index];
      if (target <= travelled + length || index === lengths.length - 1) {
        return {
          index,
          u: length > 0.001 ? clamp((target - travelled) / length, 0, 1) : 0,
          total,
          lengths
        };
      }
      travelled += length;
    }
    return { index: Math.max(0, lengths.length - 1), u: 1, total, lengths };
  }

  function extrapolateBefore(a, b) {
    return { x: a.x + (a.x - b.x), y: a.y + (a.y - b.y) };
  }

  function extrapolateAfter(a, b) {
    return { x: b.x + (b.x - a.x), y: b.y + (b.y - a.y) };
  }

  function sCurveKnot(previous, current, previousKnot) {
    return previousKnot + Math.pow(Math.max(distanceBetween(previous, current), 0.001), S_CURVE_KNOT_ALPHA);
  }

  function interpolateKnot(a, b, knotA, knotB, knot) {
    const span = knotB - knotA;
    if (Math.abs(span) < 0.0001) return point(a);
    return lerp(a, b, (knot - knotA) / span);
  }

  function centripetalCatmullRomPoint(p0, p1, p2, p3, u) {
    const knot0 = 0;
    const knot1 = sCurveKnot(p0, p1, knot0);
    const knot2 = sCurveKnot(p1, p2, knot1);
    const knot3 = sCurveKnot(p2, p3, knot2);
    const knot = knot1 + (knot2 - knot1) * clamp(u, 0, 1);
    const a1 = interpolateKnot(p0, p1, knot0, knot1, knot);
    const a2 = interpolateKnot(p1, p2, knot1, knot2, knot);
    const a3 = interpolateKnot(p2, p3, knot2, knot3, knot);
    const b1 = interpolateKnot(a1, a2, knot0, knot2, knot);
    const b2 = interpolateKnot(a2, a3, knot1, knot3, knot);
    return interpolateKnot(b1, b2, knot1, knot2, knot);
  }

  function sCurveEndpointGhost(points, atStart) {
    const lastIndex = points.length - 1;
    const endpoint = atStart ? points[0] : points[lastIndex];
    const neighbor = atStart ? points[1] : points[lastIndex - 1];
    const axis = direction(points[0], points[lastIndex]);
    const segment = atStart
      ? { x: neighbor.x - endpoint.x, y: neighbor.y - endpoint.y }
      : { x: endpoint.x - neighbor.x, y: endpoint.y - neighbor.y };
    const segmentLength = distanceBetween(endpoint, neighbor);
    const tangent = {
      x: segment.x * (1 - S_CURVE_ENDPOINT_AXIS_BLEND) + axis.x * segmentLength * S_CURVE_ENDPOINT_AXIS_BLEND,
      y: segment.y * (1 - S_CURVE_ENDPOINT_AXIS_BLEND) + axis.y * segmentLength * S_CURVE_ENDPOINT_AXIS_BLEND
    };
    return {
      x: endpoint.x + tangent.x * (atStart ? -1 : 1),
      y: endpoint.y + tangent.y * (atStart ? -1 : 1)
    };
  }

  function sCurvePointAtPoints(points, t) {
    if (points.length < 2) return points[0] || { x: 0, y: 0 };
    if (points.length === 2) return lerp(points[0], points[1], t);
    const info = sCurveSegmentInfo(points, t);
    const i = info.index;
    const p1 = points[i];
    const p2 = points[i + 1] || p1;
    const p0 = i === 0 ? sCurveEndpointGhost(points, true) : (points[i - 1] || extrapolateBefore(p1, p2));
    const p3 = i >= points.length - 2 ? sCurveEndpointGhost(points, false) : (points[i + 2] || extrapolateAfter(p1, p2));
    return centripetalCatmullRomPoint(p0, p1, p2, p3, info.u);
  }

  function sCurvePointAt(geometry, t) {
    return sCurvePointAtPoints(sCurveThroughPoints(geometry), t);
  }

  function sCurveTangentAt(geometry, t) {
    const points = sCurveThroughPoints(geometry);
    if (points.length < 2) return { x: 1, y: 0 };
    if (points.length === 2) return { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
    const beforeT = clamp(t - S_CURVE_TANGENT_STEP, 0, 1);
    const afterT = clamp(t + S_CURVE_TANGENT_STEP, 0, 1);
    const before = sCurvePointAtPoints(points, beforeT);
    const after = sCurvePointAtPoints(points, afterT);
    const span = Math.max(afterT - beforeT, 0.0001);
    const tangent = {
      x: (after.x - before.x) / span,
      y: (after.y - before.y) / span
    };
    if (Math.hypot(tangent.x, tangent.y) < 0.001) {
      const info = sCurveSegmentInfo(points, t);
      const p1 = points[info.index];
      const p2 = points[info.index + 1] || p1;
      return { x: p2.x - p1.x, y: p2.y - p1.y };
    }
    return tangent;
  }

  function normalizeGeometry(input = {}) {
    const rawProfile = input.profile;
    const profile = rawProfile === "curve" ? ARC : normalizeProfile(rawProfile);
    if (profile === ISLAND) {
      const center = point(input.center || input.start, { x: 600, y: 400 });
      const diameters = cleanIslandDiameters(input);
      return {
        profile,
        center,
        innerDiameter: diameters.innerDiameter,
        outerDiameter: diameters.outerDiameter
      };
    }
    const start = point(input.start, { x: 360, y: 360 });
    const end = point(input.end, { x: start.x + 360, y: start.y });
    const geometry = { profile, start, end };
    if (profile === ARC) {
      let ratio = numberOr(input.ratio, DEFAULT_ARC_RATIO);
      if (rawProfile === "curve" && input.q) {
        const basisValue = arcBasis(start, end);
        if (basisValue) ratio = arcRatioFromPoint(basisValue, point(input.q));
      }
      geometry.ratio = ratio;
    }
    if (profile === S_CURVE) {
      const fallbackCount = Array.isArray(input.controls) ? input.controls.length : numberOr(input.controlCount, MIN_S_CURVE_CONTROLS);
      const controls = cleanSCurveControls({
        profile,
        start,
        end,
        controls: Array.isArray(input.controls) ? input.controls : undefined,
        c1: input.c1,
        c2: input.c2,
        controlCount: fallbackCount
      }, fallbackCount);
      geometry.controls = controls;
      geometry.controlCount = controls.length;
      geometry.c1 = controls[0];
      geometry.c2 = controls[1];
    }
    return geometry;
  }

  function boolOr(value, fallback) {
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return Boolean(fallback);
  }

  function normalizeShoulder(source, fallback) {
    return {
      enabled: boolOr(source?.enabled, fallback.enabled),
      width: widthOr(source?.width, fallback.width, 0, 180)
    };
  }

  function normalizePocket(source, fallbackWidth = DEFAULT_POCKET_WIDTH) {
    if (!source || typeof source !== "object") return null;
    const width = widthOr(source.width, fallbackWidth, 10, 180);
    const outerFrom = clamp(numberOr(source.outerFrom, 0.08), 0, 0.78);
    const outerTo = clamp(numberOr(source.outerTo, 0.92), outerFrom + 0.11, 1);
    const innerFrom = clamp(numberOr(source.innerFrom, 0.27), outerFrom + 0.025, outerTo - 0.085);
    const innerTo = clamp(numberOr(source.innerTo, 0.73), innerFrom + 0.06, outerTo - 0.025);
    return {
      outerFrom,
      innerFrom,
      innerTo,
      outerTo,
      width,
      outset: widthOr(source.outset, width / 2 + DEFAULT_POCKET_GAP, width / 2, 600),
      islandStyle: styleManager.normalizeStyle(source.islandStyle || DEFAULT_POCKET_ISLAND_STYLE, "closedShape")
    };
  }

  function normalizePockets(source, fallbackWidth = DEFAULT_POCKET_WIDTH) {
    const value = source && typeof source === "object" ? source : {};
    return {
      left: normalizePocket(value.left, fallbackWidth),
      right: normalizePocket(value.right, fallbackWidth)
    };
  }

  function normalizeWidthList(source, count, fallbackWidth) {
    const list = Array.isArray(source) ? source : [];
    return Array.from({ length: count }, (_, index) => widthOr(list[index], fallbackWidth, 10, 180));
  }

  function normalizeMarkingStyle(value) {
    const allowed = new Set([
      "solid",
      "dash",
      "leftSolidRightDash",
      "rightSolidLeftDash",
      "doubleSolid",
      "doubleDash",
      "none"
    ]);
    return allowed.has(value) ? value : "dash";
  }

  function normalizeSegments(source) {
    const items = Array.isArray(source) ? source.slice(0, 5) : DEFAULT_ROAD_CONFIG.segments;
    return items.map((segment) => ({
      from: clamp(numberOr(segment?.from, 0), 0, 1),
      to: clamp(numberOr(segment?.to, 1), 0, 1),
      markingStyle: normalizeMarkingStyle(segment?.markingStyle)
    })).filter((segment) => segment.to > segment.from);
  }

  function normalizeBoundarySegments(source, fallback) {
    if (!Array.isArray(source)) return [];
    return source.slice(0, 5).map((segment, index, list) => {
      const equalFrom = index / list.length;
      const equalTo = (index + 1) / list.length;
      return {
        from: clamp(numberOr(segment?.from, equalFrom), 0, 1),
        to: clamp(numberOr(segment?.to, equalTo), 0, 1),
        style: normalizeMarkingStyle(segment?.style || fallback.style),
        width: widthOr(segment?.width, fallback.width, 1, 16)
      };
    }).filter((segment) => segment.to > segment.from);
  }

  function normalizeBoundaryStyles(source) {
    const styles = source && typeof source === "object" ? source : {};
    return Object.fromEntries(Object.entries(styles)
      .map(([key, value]) => {
        const id = String(key || "");
        if (!/^b\d+$/.test(id)) return null;
        const fallback = {
          style: normalizeMarkingStyle(value?.style),
          width: widthOr(value?.width, DEFAULT_ROAD_CONFIG.marking.width, 1, 16)
        };
        return [id, {
          ...fallback,
          segments: normalizeBoundarySegments(value?.segments, fallback)
        }];
      })
      .filter(Boolean));
  }

  function barrierSide(value) {
    return value === "left" ? "left" : "right";
  }

  function barrierEdge(value, sideFallback = "right") {
    if (BARRIER_EDGE_ORDER.includes(value)) return value;
    return barrierSide(sideFallback) === "left" ? "leftOuter" : "rightOuter";
  }

  function barrierEdgeSide(edgeKey) {
    return edgeKey === "leftOuter" || edgeKey === "rightInner" ? "left" : "right";
  }

  function mirrorBarrierEdge(edgeKey) {
    if (edgeKey === "rightOuter") return "leftOuter";
    if (edgeKey === "leftOuter") return "rightOuter";
    if (edgeKey === "rightInner") return "leftInner";
    if (edgeKey === "leftInner") return "rightInner";
    return edgeKey;
  }

  function barrierEdgeSortValue(edgeKey) {
    if (edgeKey === "rightOuter") return 0;
    if (edgeKey === "rightInner") return 1;
    if (edgeKey === "leftInner") return 2;
    if (edgeKey === "leftOuter") return 3;
    return 4;
  }

  function barrierEdgeTitle(edgeKey, divided = false) {
    if (!divided) return barrierEdgeSide(edgeKey) === "left" ? "sol" : "sag";
    if (edgeKey === "rightOuter") return "gidis sag";
    if (edgeKey === "rightInner") return "gidis sol";
    if (edgeKey === "leftInner") return "donus sag";
    if (edgeKey === "leftOuter") return "donus sol";
    return barrierEdgeSide(edgeKey) === "left" ? "sol" : "sag";
  }

  function barrierSpacing(value) {
    return clampInt(value, MIN_BARRIER_SPACING, MAX_BARRIER_SPACING, DEFAULT_BARRIER_SPACING);
  }

  function barrierId(value, fallback) {
    const safe = String(value || "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/^([^a-zA-Z_])/, "_$1")
      .slice(0, 80);
    return safe || fallback;
  }

  function boundaryForBarrierEdge(config, edgeKey) {
    const cleanEdge = barrierEdge(edgeKey);
    const section = crossSection(config);
    if (!section.boundaries.length) return null;
    if (cleanEdge === "leftOuter") {
      const boundary = section.boundaries[section.boundaries.length - 1];
      return boundary ? { ...boundary, key: "end", edgeKey: cleanEdge, side: "left" } : null;
    }
    if (cleanEdge === "rightOuter") {
      const boundary = section.boundaries[0];
      return boundary ? { ...boundary, key: "start", edgeKey: cleanEdge, side: "right" } : null;
    }
    if (!config.divided) return null;
    if (cleanEdge === "rightInner") {
      const innerShoulder = section.sections.find((item) => item.role === "innerShoulder" && item.side === "right");
      const rightLanes = section.sections.filter((item) => item.role === "lane" && item.side === "right");
      const rightLane = rightLanes[rightLanes.length - 1];
      const target = innerShoulder || rightLane;
      const boundary = section.boundaries.find((item) => item.id === target?.endBoundaryId);
      return boundary ? { ...boundary, key: "end", edgeKey: cleanEdge, side: "left" } : null;
    }
    if (cleanEdge === "leftInner") {
      const innerShoulder = section.sections.find((item) => item.role === "innerShoulder" && item.side === "left");
      const leftLane = section.sections.find((item) => item.role === "lane" && item.side === "left");
      const target = innerShoulder || leftLane;
      const boundary = section.boundaries.find((item) => item.id === target?.startBoundaryId);
      return boundary ? { ...boundary, key: "start", edgeKey: cleanEdge, side: "right" } : null;
    }
    return null;
  }

  function outerBoundaryForSide(config, side) {
    return boundaryForBarrierEdge(config, barrierSide(side) === "left" ? "leftOuter" : "rightOuter");
  }

  function normalizeBarrierFreePoint(value, fallback) {
    return point(value, fallback);
  }

  function normalizeBarrierFree(source = {}) {
    source = source && typeof source === "object" ? source : {};
    const start = normalizeBarrierFreePoint(source.start, { x: 0, y: 0 });
    const end = normalizeBarrierFreePoint(source.end, start);
    return {
      start,
      end,
      c1: normalizeBarrierFreePoint(source.c1, lerp(start, end, 1 / 3)),
      c2: normalizeBarrierFreePoint(source.c2, lerp(start, end, 2 / 3))
    };
  }

  function normalizeBarrierEndCaps(source = {}) {
    return {
      start: boolOr(source?.start, false),
      end: boolOr(source?.end, false)
    };
  }

  function normalizeBarriers(source, config) {
    const counters = Object.create(null);
    return (Array.isArray(source) ? source : []).map((item, index) => {
      const edgeKey = barrierEdge(item?.edgeKey || item?.edge, item?.side);
      counters[edgeKey] = counters[edgeKey] || 0;
      if (counters[edgeKey] >= MAX_BARRIERS_PER_SIDE) return null;
      const boundary = boundaryForBarrierEdge(config, edgeKey);
      if (!boundary) return null;
      const side = boundary.side;
      const rawFrom = clamp(numberOr(item?.from, 0), 0, 0.98);
      const rawTo = clamp(numberOr(item?.to, 1), 0.02, 1);
      const from = Math.min(rawFrom, rawTo - 0.02);
      const to = Math.max(rawTo, from + 0.02);
      counters[edgeKey] += 1;
      return {
        id: barrierId(item?.id, `barrier_${edgeKey}_${index + 1}`),
        edgeKey,
        side,
        boundaryId: boundary.id,
        boundaryKey: boundary.key,
        sectionId: String(item?.sectionId || ""),
        from: clamp(from, 0, 0.98),
        to: clamp(to, 0.02, 1),
        attached: boolOr(item?.attached, true),
        spacing: barrierSpacing(item?.spacing),
        endCaps: normalizeBarrierEndCaps(item?.endCaps),
        free: item?.attached === false ? normalizeBarrierFree(item.free) : null
      };
    }).filter(Boolean);
  }

  function normalizeRoadConfig(source = {}) {
    const base = DEFAULT_ROAD_CONFIG;
    const laneCount = clampInt(source.laneCount, 1, MAX_LANES, base.laneCount);
    const laneWidth = widthOr(source.laneWidth, base.laneWidth, 10, 180);
    const config = {
      version: 1,
      laneCount,
      laneWidth,
      laneWidths: normalizeWidthList(source.laneWidths, laneCount, laneWidth),
      divided: boolOr(source.divided, base.divided),
      dividedLaneWidths: {
        left: normalizeWidthList(source.dividedLaneWidths?.left, laneCount, laneWidth),
        right: normalizeWidthList(source.dividedLaneWidths?.right, laneCount, laneWidth)
      },
      leftShoulder: normalizeShoulder(source.leftShoulder, base.leftShoulder),
      rightShoulder: normalizeShoulder(source.rightShoulder, base.rightShoulder),
      innerShoulder: normalizeShoulder(source.innerShoulder, base.innerShoulder),
      waterChannel: normalizeShoulder(source.waterChannel, base.waterChannel),
      barrier: normalizeShoulder(source.barrier, base.barrier),
      marking: {
        style: normalizeMarkingStyle(source.marking?.style),
        width: widthOr(source.marking?.width, base.marking.width, 1, 16)
      },
      edgeLine: {
        enabled: boolOr(source.edgeLine?.enabled, base.edgeLine.enabled),
        width: widthOr(source.edgeLine?.width, base.edgeLine.width, 1, 16)
      },
      boundaryStyles: normalizeBoundaryStyles(source.boundaryStyles),
      pockets: normalizePockets(source.pockets, laneWidth),
      barriers: [],
      autoIntersection: boolOr(source.autoIntersection, base.autoIntersection),
      bridge: boolOr(source.bridge, base.bridge),
      segments: normalizeSegments(source.segments)
    };
    config.barriers = normalizeBarriers(source.barriers, config);
    return config;
  }

  function safeParseJson(text, fallback) {
    try {
      const parsed = JSON.parse(String(text || ""));
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function roadConfig(model, source = null) {
    const config = normalizeRoadConfig(source || model?.metadata?.road || {});
    if (isIslandGeometry(model?.geometry)) {
      const laneCount = islandLaneCountFromConfig(config);
      const laneWidth = islandLaneWidthFromGeometry(model.geometry, laneCount);
      const laneWidths = islandLaneWidthsFromConfig(model.geometry, config, laneCount);
      config.divided = false;
      config.laneCount = laneCount;
      config.laneWidth = laneWidth;
      config.laneWidths = laneWidths;
      config.dividedLaneWidths = {
        left: laneWidths.slice(),
        right: laneWidths.slice()
      };
      config.leftShoulder.enabled = false;
      config.rightShoulder.enabled = false;
      config.innerShoulder.enabled = false;
      config.waterChannel.enabled = false;
      config.barrier.enabled = false;
      config.barriers = [];
    }
    return config;
  }

  function pointAt(model, t) {
    const geometry = model.geometry;
    if (geometry.profile === ISLAND) return islandPointAt(geometry, t);
    if (geometry.profile === ARC) return arcPointAt(model, t);
    if (geometry.profile === S_CURVE) {
      return sCurvePointAt(geometry, t);
    }
    return lerp(geometry.start, geometry.end, t);
  }

  function tangentAt(model, t) {
    const geometry = model.geometry;
    if (geometry.profile === ISLAND) return islandTangentAt(geometry, t);
    if (geometry.profile === ARC) return arcTangentAt(model, t);
    if (geometry.profile === S_CURVE) {
      return sCurveTangentAt(geometry, t);
    }
    return {
      x: geometry.end.x - geometry.start.x,
      y: geometry.end.y - geometry.start.y
    };
  }

  function sampleCacheKey(model, sampleCount = SAMPLE_COUNT) {
    const geometry = model?.geometry || {};
    if (geometry.profile === ISLAND) {
      const center = point(geometry.center);
      return [ISLAND, sampleCount, center.x, center.y, geometry.innerDiameter, geometry.outerDiameter].join("|");
    }
    const start = point(geometry.start);
    const end = point(geometry.end);
    const parts = [geometry.profile || STRAIGHT, sampleCount, start.x, start.y, end.x, end.y];
    if (geometry.profile === ARC) parts.push(numberOr(geometry.ratio, DEFAULT_ARC_RATIO));
    if (geometry.profile === S_CURVE) {
      cleanSCurveControls(geometry).forEach((control) => {
        parts.push(control.x, control.y);
      });
    }
    return parts.join("|");
  }

  function samplesFor(model, sampleCount = SAMPLE_COUNT) {
    const count = isStraightGeometry(model?.geometry)
      ? 1
      : clampInt(sampleCount, 4, SAMPLE_COUNT, SAMPLE_COUNT);
    const key = sampleCacheKey(model, count);
    const cached = model && typeof model === "object" ? sampleCache.get(model) : null;
    if (cached?.key === key) return cached.samples;
    const samples = [];
    for (let index = 0; index <= count; index += 1) {
      const t = index / count;
      const center = pointAt(model, t);
      const tangent = tangentAt(model, t);
      const length = Math.hypot(tangent.x, tangent.y) || 1;
      samples.push({
        t,
        center,
        tangent: { x: tangent.x / length, y: tangent.y / length },
        normal: { x: -tangent.y / length, y: tangent.x / length }
      });
    }
    if (model && typeof model === "object") sampleCache.set(model, { key, samples });
    return samples;
  }

  function offsetSample(sample, offset) {
    return {
      x: sample.center.x + sample.normal.x * offset,
      y: sample.center.y + sample.normal.y * offset
    };
  }

  function pathFromPoints(points, close = false) {
    if (!points.length) return "";
    return points.map((item, index) => `${index === 0 ? "M" : "L"} ${formatPoint(item)}`).join(" ") + (close ? " Z" : "");
  }

  function offsetPathData(model, offset = 0, reverse = false, sampleCount = SAMPLE_COUNT) {
    const points = samplesFor(model, sampleCount).map((sample) => offsetSample(sample, offset));
    if (reverse) points.reverse();
    return pathFromPoints(points, isIslandGeometry(model?.geometry));
  }

  function offsetPointAt(model, t, offset) {
    const center = pointAt(model, t);
    const tangent = tangentAt(model, t);
    const length = Math.hypot(tangent.x, tangent.y) || 1;
    const normal = { x: -tangent.y / length, y: tangent.x / length };
    return {
      x: center.x + normal.x * offset,
      y: center.y + normal.y * offset
    };
  }

  function offsetPathDataRange(model, offset = 0, from = 0, to = 1, reverse = false) {
    const start = clamp(numberOr(from, 0), 0, 1);
    const end = clamp(numberOr(to, 1), 0, 1);
    if (end <= start) return "";
    if (isStraightGeometry(model?.geometry)) {
      const points = [offsetPointAt(model, start, offset), offsetPointAt(model, end, offset)];
      if (reverse) points.reverse();
      return pathFromPoints(points, false);
    }
    const count = Math.max(2, Math.ceil(SAMPLE_COUNT * (end - start)));
    const points = [];
    for (let index = 0; index <= count; index += 1) {
      points.push(offsetPointAt(model, start + (end - start) * index / count, offset));
    }
    if (reverse) points.reverse();
    const full = isIslandGeometry(model?.geometry) && Math.abs(end - start) > 0.999;
    return pathFromPoints(points, full);
  }

  function centerlineLength(model) {
    const samples = samplesFor(model);
    let total = 0;
    for (let index = 0; index < samples.length - 1; index += 1) {
      const a = samples[index].center;
      const b = samples[index + 1].center;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }

  function surfaceOutline(model, width, sampleCount = SAMPLE_COUNT) {
    if (isIslandGeometry(model?.geometry)) {
      const center = point(model.geometry.center);
      const radii = islandRadii(model.geometry);
      return circlePoints(center, radii.outerRadius, false, sampleCount);
    }
    const samples = samplesFor(model, sampleCount);
    const half = width / 2;
    const left = samples.map((sample) => offsetSample(sample, half));
    const right = samples.slice().reverse().map((sample) => offsetSample(sample, -half));
    return [...left, ...right];
  }

  function islandRingPathData(model, sampleCount = SAMPLE_COUNT) {
    const center = point(model.geometry.center);
    const radii = islandRadii(model.geometry);
    const outer = circlePoints(center, radii.outerRadius, false, sampleCount);
    const inner = circlePoints(center, radii.innerRadius, true, sampleCount);
    return pathFromPoints(outer, true) + " " + pathFromPoints(inner, true);
  }

  function surfacePathData(model, width, options = {}) {
    const sampleCount = clampInt(options.sampleCount, 4, SAMPLE_COUNT, SAMPLE_COUNT);
    if (isIslandGeometry(model?.geometry)) return islandRingPathData(model, sampleCount);
    return pathFromPoints(surfaceOutline(model, width, sampleCount), true);
  }

  function arcOffsetRadius(geometry, offset) {
    const delta = geometry.sweepFlag
      ? normalizeAngle(geometry.endAngle - geometry.startAngle)
      : -normalizeAngle(geometry.startAngle - geometry.endAngle);
    return geometry.radius + (delta >= 0 ? -offset : offset);
  }

  function arcOffsetPoint(geometry, angle, offset) {
    const radius = arcOffsetRadius(geometry, offset);
    return {
      radius,
      point: {
        x: geometry.cx + Math.cos(angle) * radius,
        y: geometry.cy + Math.sin(angle) * radius
      }
    };
  }

  function arcSegmentPath(start, end, radius, largeArcFlag, sweepFlag) {
    return `M ${formatPoint(start)} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${formatPoint(end)}`;
  }

  function arcSurfacePathData(model, width) {
    if (model?.geometry?.profile !== ARC) return "";
    const geometry = arcGeometry(model);
    if (!geometry) return "";
    const half = width / 2;
    const leftStart = arcOffsetPoint(geometry, geometry.startAngle, half);
    const leftEnd = arcOffsetPoint(geometry, geometry.endAngle, half);
    const rightStart = arcOffsetPoint(geometry, geometry.startAngle, -half);
    const rightEnd = arcOffsetPoint(geometry, geometry.endAngle, -half);
    if ([leftStart, leftEnd, rightStart, rightEnd].some((item) => !Number.isFinite(item.radius) || item.radius <= 1)) return "";
    const largeArcFlag = geometry.arcDelta > Math.PI ? 1 : 0;
    const sweepFlag = geometry.sweepFlag ? 1 : 0;
    const reverseSweepFlag = sweepFlag ? 0 : 1;
    return [
      arcSegmentPath(leftStart.point, leftEnd.point, leftStart.radius, largeArcFlag, sweepFlag),
      `L ${formatPoint(rightEnd.point)}`,
      `A ${rightEnd.radius} ${rightEnd.radius} 0 ${largeArcFlag} ${reverseSweepFlag} ${formatPoint(rightStart.point)}`,
      "Z"
    ].join(" ");
  }

  function previewSampleCount(model) {
    const profile = model?.geometry?.profile;
    if (profile === ISLAND) return PREVIEW_ISLAND_SAMPLE_COUNT;
    if (profile === S_CURVE) return PREVIEW_S_CURVE_SAMPLE_COUNT;
    return SAMPLE_COUNT;
  }

  function previewSurfacePathData(model, width) {
    if (model?.geometry?.profile === ARC) return arcSurfacePathData(model, width) || surfacePathData(model, width, { sampleCount: SAMPLE_COUNT });
    return surfacePathData(model, width, { sampleCount: previewSampleCount(model) });
  }

  function bandPathData(model, startOffset, endOffset) {
    const samples = samplesFor(model);
    const left = samples.map((sample) => offsetSample(sample, endOffset));
    const right = samples.slice().reverse().map((sample) => offsetSample(sample, startOffset));
    return pathFromPoints([...left, ...right], true);
  }

  function addWidth(sections, width, role, options = {}) {
    const cleanWidth = widthOr(width, 0, 0, MAX_ISLAND_DIAMETER);
    if (cleanWidth <= 0) return;
    sections.push({ width: cleanWidth, role, ...options });
  }

  function laneIdForSection(section) {
    if (!section || section.role !== "lane") return "";
    if (section.side) return `lane:${section.side}:${section.laneIndex}`;
    return `lane:${section.laneIndex}`;
  }

  function sectionIdForSection(section) {
    if (!section) return "";
    if (section.role === "lane") return laneIdForSection(section);
    if (section.role === "shoulder") return `shoulder:${section.side || section.sectionIndex || 0}`;
    if (section.role === "innerShoulder") return `innerShoulder:${section.side || section.sectionIndex || 0}`;
    if (section.role === "waterChannel") return "waterChannel";
    return `${section.role}:${section.side || section.sectionIndex || 0}`;
  }

  function crossSection(config) {
    const sections = [];
    if (config.rightShoulder.enabled) addWidth(sections, config.rightShoulder.width, "shoulder", { edge: true, side: "right" });
    if (config.divided) {
      config.dividedLaneWidths.right.forEach((width, index) => addWidth(sections, width, "lane", { laneIndex: index, side: "right" }));
      if (config.innerShoulder.enabled) addWidth(sections, config.innerShoulder.width, "innerShoulder", { side: "right" });
      if (config.waterChannel.enabled) addWidth(sections, config.waterChannel.width, "waterChannel");
      if (config.innerShoulder.enabled) addWidth(sections, config.innerShoulder.width, "innerShoulder", { side: "left" });
      config.dividedLaneWidths.left.forEach((width, index) => addWidth(sections, width, "lane", { laneIndex: index, side: "left" }));
    } else {
      config.laneWidths.forEach((width, index) => addWidth(sections, width, "lane", { laneIndex: index }));
    }
    if (config.leftShoulder.enabled) addWidth(sections, config.leftShoulder.width, "shoulder", { edge: true, side: "left" });

    const totalWidth = sections.reduce((sum, section) => sum + section.width, 0);
    const boundaries = [];
    let offset = -totalWidth / 2;
    boundaries.push({ id: "b0", offset, role: "edge" });
    sections.forEach((section, index) => {
      const before = section;
      const after = sections[index + 1] || null;
      const startOffset = offset;
      offset += section.width;
      section.sectionIndex = index;
      section.id = sectionIdForSection(section);
      section.startOffset = startOffset;
      section.endOffset = offset;
      section.centerOffset = (startOffset + offset) / 2;
      section.startBoundaryId = "b" + index;
      section.endBoundaryId = "b" + (index + 1);
      boundaries.push({
        id: "b" + (index + 1),
        offset,
        role: after ? boundaryRole(before, after, config) : "edge",
        before,
        after
      });
    });
    sections.forEach((section) => {
      section.startBoundaryRole = boundaries[section.sectionIndex]?.role || "edge";
      section.endBoundaryRole = boundaries[section.sectionIndex + 1]?.role || "edge";
    });
    return { sections, boundaries, totalWidth: Math.max(MIN_WIDTH, totalWidth) };
  }

  function boundaryRole(before, after, config) {
    if (!before || !after) return "edge";
    if (before.role === "waterChannel" || after.role === "waterChannel") return "channel";
    if (before.role === "innerShoulder" || after.role === "innerShoulder") return "edge";
    if (before.role === "shoulder" || after.role === "shoulder") return "edge";
    if (config.divided && before.side && after.side && before.side !== after.side) return "median";
    if (before.role === "lane" && after.role === "lane") return "marking";
    return "edge";
  }

  function pocketMode(value) {
    const config = value?.metadata ? roadConfig(value) : normalizeRoadConfig(value || {});
    const hasRight = Boolean(config.pockets?.right);
    const hasLeft = Boolean(config.pockets?.left);
    if (hasRight && hasLeft) return "double";
    if (hasRight) return "right";
    if (hasLeft) return "left";
    return "none";
  }

  function defaultPocket(config) {
    return normalizePocket({}, config?.laneWidth || DEFAULT_POCKET_WIDTH);
  }

  function setPocketMode(model, mode) {
    if (!model || model.geometry?.profile !== STRAIGHT) return false;
    const nextMode = POCKET_MODES.includes(mode) ? mode : "none";
    const config = roadConfig(model);
    const current = normalizePockets(config.pockets, config.laneWidth);
    config.pockets = {
      right: nextMode === "right" || nextMode === "double" ? (current.right || defaultPocket(config)) : null,
      left: nextMode === "left" || nextMode === "double" ? (current.left || defaultPocket(config)) : null
    };
    const metadata = { ...(model.metadata || {}), road: normalizeRoadConfig(config) };
    delete metadata.roadSelection;
    delete metadata.roadBoundaryEdit;
    delete metadata.roadBarrierEdit;
    if (nextMode === "none") {
      delete metadata.roadPocketEdit;
      delete metadata.roadPocketIslandEdit;
    }
    else {
      const selectedSide = metadata.roadPocketEdit?.side;
      if (!selectedSide || !config.pockets[selectedSide]) delete metadata.roadPocketEdit;
      const selectedIslandSide = metadata.roadPocketIslandEdit?.side;
      if (!selectedIslandSide || !config.pockets[selectedIslandSide]) delete metadata.roadPocketIslandEdit;
    }
    model.metadata = metadata;
    return true;
  }

  function pocketSideSign(side) {
    return side === "left" ? 1 : -1;
  }

  function pocketGeometry(model, side, config = roadConfig(model)) {
    if (model?.geometry?.profile !== STRAIGHT) return null;
    const pocket = config.pockets?.[side];
    if (!pocket) return null;
    const section = crossSection(config);
    const sign = pocketSideSign(side);
    const attachMagnitude = Math.max(0, section.totalWidth / 2 - pocket.width / 2);
    const bodyMagnitude = section.totalWidth / 2 + pocket.outset;
    const attachOffset = sign * attachMagnitude;
    const bodyOffset = sign * bodyMagnitude;
    const centerPoints = [
      offsetPointAt(model, pocket.outerFrom, attachOffset),
      offsetPointAt(model, pocket.innerFrom, bodyOffset),
      offsetPointAt(model, pocket.innerTo, bodyOffset),
      offsetPointAt(model, pocket.outerTo, attachOffset)
    ];
    return { side, sign, config: pocket, section, attachOffset, bodyOffset, centerPoints };
  }

  function offsetPolyline(points, amount) {
    if (!Array.isArray(points) || points.length < 2) return [];
    const segmentNormals = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const dx = points[index + 1].x - points[index].x;
      const dy = points[index + 1].y - points[index].y;
      const length = Math.hypot(dx, dy) || 1;
      segmentNormals.push({ x: -dy / length, y: dx / length });
    }
    return points.map((item, index) => {
      if (index === 0) return { x: item.x + segmentNormals[0].x * amount, y: item.y + segmentNormals[0].y * amount };
      if (index === points.length - 1) {
        const normal = segmentNormals[segmentNormals.length - 1];
        return { x: item.x + normal.x * amount, y: item.y + normal.y * amount };
      }
      const before = segmentNormals[index - 1];
      const after = segmentNormals[index];
      const mx = before.x + after.x;
      const my = before.y + after.y;
      const mLength = Math.hypot(mx, my) || 1;
      const miter = { x: mx / mLength, y: my / mLength };
      const denominator = Math.max(0.25, Math.abs(miter.x * after.x + miter.y * after.y));
      const scale = amount / denominator;
      return { x: item.x + miter.x * scale, y: item.y + miter.y * scale };
    });
  }

  function pocketBoundaryPoints(geometry) {
    const half = geometry.config.width / 2;
    return {
      first: offsetPolyline(geometry.centerPoints, -half),
      second: offsetPolyline(geometry.centerPoints, half)
    };
  }

  function pocketBandPathData(geometry) {
    if (!geometry) return "";
    const boundaries = pocketBoundaryPoints(geometry);
    return pathFromPoints([...boundaries.first, ...boundaries.second.slice().reverse()], true);
  }

  function pocketBandPoints(geometry) {
    if (!geometry) return [];
    const boundaries = pocketBoundaryPoints(geometry);
    return [...boundaries.first, ...boundaries.second.slice().reverse()];
  }

  function pointInSimplePolygon(pointValue, polygon) {
    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
      const current = polygon[index];
      const previous = polygon[previousIndex];
      const intersects = ((current.y > pointValue.y) !== (previous.y > pointValue.y))
        && pointValue.x < (previous.x - current.x) * (pointValue.y - current.y) / ((previous.y - current.y) || 1e-9) + current.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pocketOutsideHostValue(model, geometry, pointValue) {
    const signed = signedOffsetAtPoint(model, pointValue);
    if (!signed) return -Infinity;
    return signed.offset * geometry.sign - geometry.section.totalWidth / 2;
  }

  function pocketBoundaryVisiblePaths(model, geometry, points) {
    const paths = [];
    let current = [];
    const finish = () => {
      if (current.length >= 2) paths.push(current);
      current = [];
    };
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const aValue = pocketOutsideHostValue(model, geometry, a);
      const bValue = pocketOutsideHostValue(model, geometry, b);
      const aOutside = aValue > 0.01;
      const bOutside = bValue > 0.01;
      if (aOutside && !current.length) current.push(a);
      if (aOutside !== bOutside) {
        const denominator = bValue - aValue;
        const alpha = Math.abs(denominator) < 1e-9 ? 0.5 : clamp(-aValue / denominator, 0, 1);
        const crossing = lerp(a, b, alpha);
        if (aOutside) {
          current.push(crossing);
          finish();
        } else {
          current = [crossing];
        }
      }
      if (bOutside) current.push(b);
    }
    finish();
    return paths;
  }

  function compactPolyline(points) {
    const result = [];
    (points || []).forEach((item) => {
      const previous = result[result.length - 1];
      if (!previous || Math.hypot(item.x - previous.x, item.y - previous.y) > 0.01) result.push(item);
    });
    return result;
  }

  function polylineLength(points) {
    let total = 0;
    for (let index = 0; index < (points || []).length - 1; index += 1) {
      total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    }
    return total;
  }

  function longestVisiblePocketBoundary(model, geometry, points) {
    return pocketBoundaryVisiblePaths(model, geometry, points)
      .sort((a, b) => polylineLength(b) - polylineLength(a))[0] || [];
  }

  function visibleHostEdgeRanges(model, geometry, hostOffset) {
    const boundary = outerBoundaryForSide(roadConfig(model), geometry.side);
    const engine = Kroki.RoadIntersectionEngine;
    if (!engine || typeof engine.visibleRangesForLine !== "function") return [{ from: 0, to: 1 }];
    const ranges = engine.visibleRangesForLine(model.id, hostOffset, 0, 1, boundary) || [];
    return ranges
      .map((range) => ({
        from: clamp(numberOr(range.from, 0), 0, 1),
        to: clamp(numberOr(range.to, 1), 0, 1)
      }))
      .filter((range) => range.to - range.from >= 0.0008)
      .sort((a, b) => a.from - b.from);
  }

  function hostRangeBefore(ranges, t) {
    const clipped = ranges
      .map((range) => ({ from: Math.max(0, range.from), to: Math.min(t, range.to) }))
      .filter((range) => range.to - range.from >= 0.0008)
      .sort((a, b) => b.to - a.to)[0];
    return clipped && clipped.to >= t - 0.001 ? clipped.from : t;
  }

  function hostRangeAfter(ranges, t) {
    const clipped = ranges
      .map((range) => ({ from: Math.max(t, range.from), to: Math.min(1, range.to) }))
      .filter((range) => range.to - range.from >= 0.0008)
      .sort((a, b) => a.from - b.from)[0];
    return clipped && clipped.from <= t + 0.001 ? clipped.to : t;
  }

  function pocketContourGeometry(model, geometry) {
    if (!geometry) return null;
    const boundaries = pocketBoundaryPoints(geometry);
    const candidates = [boundaries.first, boundaries.second].map((points) => {
      const visible = longestVisiblePocketBoundary(model, geometry, points);
      const outside = visible.length
        ? visible.reduce((sum, item) => sum + pocketOutsideHostValue(model, geometry, item), 0) / visible.length
        : -Infinity;
      return { points: visible, outside };
    }).filter((item) => item.points.length >= 2).sort((a, b) => b.outside - a.outside);
    if (candidates.length < 2) return null;
    const outer = candidates[0].points;
    const inner = candidates[1].points;
    const hostOffset = geometry.sign * geometry.section.totalWidth / 2;
    const hostRanges = visibleHostEdgeRanges(model, geometry, hostOffset);
    const outerStartT = parameterAtPoint(model, outer[0]);
    const outerEndT = parameterAtPoint(model, outer[outer.length - 1]);
    const hostStart = offsetPointAt(model, hostRangeBefore(hostRanges, outerStartT), hostOffset);
    const hostEnd = offsetPointAt(model, hostRangeAfter(hostRanges, outerEndT), hostOffset);
    const islandPoints = compactPolyline([
      inner[0],
      inner[inner.length - 1],
      ...inner.slice(1, -1).reverse()
    ]);
    return {
      side: geometry.side,
      outer,
      inner,
      outerPoints: compactPolyline([hostStart, ...outer, hostEnd]),
      islandPoints
    };
  }

  function pocketIslandArea(points) {
    let area = 0;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
      area += points[previous].x * points[index].y - points[index].x * points[previous].y;
    }
    return Math.abs(area) / 2;
  }

  function intersectRanges(first, second) {
    const result = [];
    (first || []).forEach((a) => {
      (second || []).forEach((b) => {
        const from = Math.max(a.from, b.from);
        const to = Math.min(a.to, b.to);
        if (to - from >= 0.0008) result.push({ from, to });
      });
    });
    return result;
  }

  function pocketVisibleRangesForBoundary(model, lineOffset, from, to, boundary) {
    const start = clamp(numberOr(from, 0), 0, 1);
    const end = clamp(numberOr(to, 1), 0, 1);
    if (end <= start) return [];
    const isOuterBoundary = boundary?.role === "edge" && (!boundary.before || !boundary.after);
    if (!isOuterBoundary || model?.geometry?.profile !== STRAIGHT) return [{ from: start, to: end }];
    const geometries = activePocketGeometries(model).filter((geometry) => lineOffset * geometry.sign > 0);
    if (!geometries.length) return [{ from: start, to: end }];
    const polygons = geometries.map((geometry) => pocketBandPoints(geometry));
    const hiddenAt = (t) => {
      const pointValue = offsetPointAt(model, t, lineOffset);
      return polygons.some((polygon) => pointInSimplePolygon(pointValue, polygon));
    };
    const sampleCount = Math.max(24, Math.ceil(160 * (end - start)));
    const samples = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const t = start + (end - start) * index / sampleCount;
      samples.push({ t, hidden: hiddenAt(t) });
    }
    const cuts = [start, end];
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index - 1].hidden === samples[index].hidden) continue;
      let low = samples[index - 1].t;
      let high = samples[index].t;
      const target = samples[index].hidden;
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const mid = (low + high) / 2;
        if (hiddenAt(mid) === target) high = mid;
        else low = mid;
      }
      cuts.push((low + high) / 2);
    }
    const sorted = Array.from(new Set(cuts.map((value) => Math.round(value * 1000000) / 1000000))).sort((a, b) => a - b);
    const ranges = [];
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const range = { from: sorted[index], to: sorted[index + 1] };
      if (range.to - range.from < 0.0008 || hiddenAt((range.from + range.to) / 2)) continue;
      ranges.push(range);
    }
    return ranges;
  }

  function activePocketGeometries(model, config = roadConfig(model)) {
    if (model?.geometry?.profile !== STRAIGHT) return [];
    return ["right", "left"].map((side) => pocketGeometry(model, side, config)).filter(Boolean);
  }

  function strokeAttributes(element, color, width, dash = "") {
    element.setAttribute("fill", "none");
    element.setAttribute("stroke", color);
    element.setAttribute("stroke-width", String(width));
    element.setAttribute("stroke-linecap", "round");
    element.setAttribute("stroke-linejoin", "round");
    element.setAttribute("vector-effect", "none");
    element.style.setProperty("vector-effect", "none");
    if (dash) element.setAttribute("stroke-dasharray", dash);
    else element.removeAttribute("stroke-dasharray");
  }

  function addPath(parent, className, d, attrs = {}) {
    if (!d) return null;
    const path = utils.createSvgElement("path", { class: className, d, ...attrs });
    parent.append(path);
    return path;
  }

  function dashForStyle(style) {
    return style === "dash" || style === "doubleDash" || style === "leftSolidRightDash" || style === "rightSolidLeftDash" ? "18 14" : "";
  }

  function fallbackBoundaryStyle(config, boundary) {
    if (boundary.role === "edge") {
      return {
        style: "solid",
        width: config.edgeLine.width
      };
    }
    if (boundary.role === "channel") {
      return {
        style: "solid",
        width: Math.max(1, config.edgeLine.width)
      };
    }
    if (boundary.role === "median") return { ...config.marking, style: "doubleSolid" };
    return config.marking;
  }

  function boundaryClassName(boundary) {
    if (boundary.role === "edge") return "editor-road-edge";
    if (boundary.role === "channel") return "editor-road-channel-line";
    return "editor-road-marking";
  }

  function boundaryStyle(config, boundary, fallback) {
    const override = config.boundaryStyles?.[boundary.id];
    const base = {
      style: normalizeMarkingStyle(override?.style || fallback.style),
      width: widthOr(override?.width, fallback.width, 1, 16)
    };
    return {
      ...base,
      segments: normalizeBoundarySegments(override?.segments, base)
    };
  }

  function addBoundaryLine(parent, model, boundary, config) {
    if (boundary.role === "edge" && !config.edgeLine.enabled) return;
    if (boundary.role === "edge" || boundary.role === "channel" || boundary.role === "median" || boundary.role === "marking") {
      addStyledLine(parent, model, boundary.offset, boundaryStyle(config, boundary, fallbackBoundaryStyle(config, boundary)), boundaryClassName(boundary), boundary);
    }
  }

  function intersectionVisibleRanges(model, lineOffset, from, to, boundary) {
    const engine = Kroki.RoadIntersectionEngine;
    if (!engine || typeof engine.visibleRangesForLine !== "function") return [{ from, to }];
    return engine.visibleRangesForLine(model.id, lineOffset, from, to, boundary) || [{ from, to }];
  }

  function terminalHostDashedRanges(model, lineOffset, from, to, boundary) {
    const engine = Kroki.RoadIntersectionEngine;
    if (!engine || typeof engine.terminalHostDashedRangesForLine !== "function") return [];
    return engine.terminalHostDashedRangesForLine(model.id, lineOffset, from, to, boundary) || [];
  }

  function isIslandProtectedBoundary(model, boundary) {
    if (!isIslandGeometry(model?.geometry) || boundary?.role !== "edge") return false;
    return numberOr(boundary.offset, 0) < 0;
  }

  function shouldSkipRoadBoundary(model, boundary) {
    const engine = Kroki.RoadIntersectionEngine;
    const isOuterEdge = boundary?.role === "edge" && (!boundary.before || !boundary.after);
    if (isIslandGeometry(model?.geometry) && boundary?.role === "edge") return false;
    // Kavşakta sadece yolun gerçek dış sınır edge'leri iptal edilir.
    // Banket/shoulder ile taşıt yolu arasındaki iç edge çizgileri banket çizgisi olarak kalmalıdır.
    const pocketOwnsBoundary = isOuterEdge && activePocketGeometries(model)
      .some((geometry) => boundary.offset * geometry.sign > 0);
    return Boolean(isOuterEdge && (pocketOwnsBoundary || engine?.isRoadMember?.(model.id)));
  }

  function addStyledLine(parent, model, offset, marking, className, boundary = null) {
    if (shouldSkipRoadBoundary(model, boundary)) return;
    const segments = marking.segments?.length ? marking.segments : [{ from: 0, to: 1, style: marking.style, width: marking.width }];
    const drawSegment = (lineOffset, segment, dashed, derivedShoulderDash = false) => {
      const intersectionRanges = isIslandProtectedBoundary(model, boundary) && !derivedShoulderDash
        ? [{ from: segment.from, to: segment.to }]
        : derivedShoulderDash
        ? terminalHostDashedRanges(model, lineOffset, segment.from, segment.to, boundary)
        : intersectionVisibleRanges(model, lineOffset, segment.from, segment.to, boundary);
      const ranges = intersectRanges(
        intersectionRanges,
        pocketVisibleRangesForBoundary(model, lineOffset, segment.from, segment.to, boundary)
      );
      ranges.forEach((range) => {
        if (!range || range.to <= range.from) return;
        const effectiveDashed = derivedShoulderDash || dashed;
        const derivedClassName = derivedShoulderDash
          ? `${className} editor-road-intersection-shoulder-dash`
          : className;
        const path = addPath(parent, derivedClassName, offsetPathDataRange(model, lineOffset, range.from, range.to));
        if (path) {
          strokeAttributes(path, ROAD_LINE_COLOR, segment.width, effectiveDashed ? "18 14" : "");
          path.dataset.visibleFrom = String(range.from);
          path.dataset.visibleTo = String(range.to);
          if (boundary?.id) path.dataset.roadBoundaryId = String(boundary.id);
          if (derivedShoulderDash) {
            path.dataset.intersectionShoulderDash = "true";
          }
        }
      });
    };
    const renderSegment = (segment, derivedShoulderDash = false) => {
      if (segment.style === "none") return;
      const gap = Math.max(4, segment.width * 2);
      if (segment.style === "doubleSolid" || segment.style === "doubleDash") {
        const dashed = segment.style === "doubleDash";
        drawSegment(offset - gap / 2, segment, dashed, derivedShoulderDash);
        drawSegment(offset + gap / 2, segment, dashed, derivedShoulderDash);
        return;
      }
      if (segment.style === "leftSolidRightDash") {
        drawSegment(offset + gap / 2, segment, false, derivedShoulderDash);
        drawSegment(offset - gap / 2, segment, true, derivedShoulderDash);
        return;
      }
      if (segment.style === "rightSolidLeftDash") {
        drawSegment(offset - gap / 2, segment, false, derivedShoulderDash);
        drawSegment(offset + gap / 2, segment, true, derivedShoulderDash);
        return;
      }
      drawSegment(offset, segment, Boolean(dashForStyle(segment.style)), derivedShoulderDash);
    };
    segments.forEach((segment) => {
      renderSegment(segment, false);
    });
  }

  function renderSurface(model, element, section) {
    // RoadIntersectionEngine artık kavşak içinde beyaz maske/örtme kullanmıyor;
    // yol hit-test'i de adapter.hitTest ile hesaplanıyor. Bu yüzden beyaz dolgulu,
    // çok noktalı editor-road-surface path'ini DOM'a basmak gereksiz yük oluşturuyordu.
    // Geometri gerektiğinde surfacePathData(...) hesap içinde kullanılmaya devam edebilir,
    // fakat normal render'da görünmeyen/etkisiz beyaz kapalı shape üretmiyoruz.
    return null;
  }

  function selectedPocketSide(model) {
    const side = String(model?.metadata?.roadPocketEdit?.side || "");
    if (side !== "left" && side !== "right") return "";
    const config = roadConfig(model);
    return model?.geometry?.profile === STRAIGHT && config.pockets?.[side] ? side : "";
  }

  function selectedPocketIslandSide(model) {
    const side = String(model?.metadata?.roadPocketIslandEdit?.side || "");
    if (side !== "left" && side !== "right") return "";
    const config = roadConfig(model);
    return model?.geometry?.profile === STRAIGHT && config.pockets?.[side] ? side : "";
  }

  function selectedPocketIslandInfo(model) {
    const side = selectedPocketIslandSide(model);
    if (!side) return null;
    const pocket = roadConfig(model).pockets?.[side];
    return pocket ? { side, style: styleManager.normalizeStyle(pocket.islandStyle, "closedShape") } : null;
  }

  function updatePocketIslandStyle(model, patch) {
    const side = selectedPocketIslandSide(model);
    if (!side) return false;
    const config = roadConfig(model);
    const pocket = config.pockets?.[side];
    if (!pocket) return false;
    pocket.islandStyle = styleManager.normalizeStyle({ ...(pocket.islandStyle || {}), ...(patch || {}) }, "closedShape");
    model.metadata = {
      ...(model.metadata || {}),
      road: normalizeRoadConfig(config),
      roadPocketIslandEdit: { side }
    };
    return true;
  }

  function intersectionAuxiliaryContours(model) {
    const config = roadConfig(model);
    const selectedIsland = selectedPocketIslandSide(model);
    return activePocketGeometries(model, config).flatMap((geometry) => {
      const contour = pocketContourGeometry(model, geometry);
      if (!contour) return [];
      const common = {
        ownerId: model.id,
        side: geometry.side,
        stroke: config.edgeLine?.enabled === false ? "none" : ROAD_LINE_COLOR,
        strokeWidth: config.edgeLine?.width || 2,
        cornerHints: null,
        blockedHints: []
      };
      const items = [{
        ...common,
        id: `pocket:${model.id}:${geometry.side}:outer`,
        role: "outer",
        points: contour.outerPoints,
        closed: false,
        cornerHints: contour.outerPoints.slice(1, -1),
        className: "editor-road-edge editor-road-pocket-line"
      }];
      if (pocketIslandArea(contour.islandPoints) >= 1) {
        items.push({
          ...common,
          id: `pocket:${model.id}:${geometry.side}:island`,
          role: "island",
          points: contour.islandPoints,
          closed: true,
          cornerHints: contour.islandPoints,
          fillStyle: styleManager.normalizeStyle(geometry.config.islandStyle, "closedShape"),
          fillModelId: `${model.id}-pocket-${geometry.side}-island`,
          selected: selectedIsland === geometry.side,
          className: "editor-road-edge editor-road-pocket-line"
        });
      }
      return items;
    });
  }

  function renderSelectedPocket(model, element, config) {
    const side = selectedPocketSide(model);
    if (!side) return;
    const geometry = pocketGeometry(model, side, config);
    addPath(element, "editor-road-lane-highlight editor-road-pocket-highlight", pocketBandPathData(geometry), {
      "data-road-pocket-selection": side
    });
  }

  function pocketIslandHitInfo(model, pointValue) {
    for (const geometry of activePocketGeometries(model)) {
      const contour = pocketContourGeometry(model, geometry);
      if (!contour || pocketIslandArea(contour.islandPoints) < 1) continue;
      if (pointInSimplePolygon(pointValue, contour.islandPoints)) return { side: geometry.side, geometry, contour };
    }
    return null;
  }

  function pocketHitInfo(model, pointValue, tolerance = 0) {
    let best = null;
    activePocketGeometries(model).forEach((geometry) => {
      for (let index = 0; index < geometry.centerPoints.length - 1; index += 1) {
        const distance = lineGeometry.distanceToSegment(geometry.centerPoints[index], geometry.centerPoints[index + 1], pointValue);
        if (distance > geometry.config.width / 2 + Math.max(0, tolerance)) continue;
        if (!best || distance < best.distance) best = { side: geometry.side, geometry, distance };
      }
    });
    return best;
  }

  function selectedSectionId(model) {
    return String(model?.metadata?.roadSelection?.sectionId || model?.metadata?.roadSelection?.laneId || "");
  }

  function sectionInfoFromSection(section) {
    if (!section) return null;
    return {
      sectionId: section.id,
      laneId: section.role === "lane" ? section.id : "",
      role: section.role,
      laneIndex: section.laneIndex,
      side: section.side || "",
      width: section.width,
      startBoundaryId: section.startBoundaryId,
      endBoundaryId: section.endBoundaryId,
      startBoundaryRole: section.startBoundaryRole || "edge",
      endBoundaryRole: section.endBoundaryRole || "edge",
      startOffset: section.startOffset,
      endOffset: section.endOffset
    };
  }

  function selectedSectionInfo(model) {
    const pocketSide = selectedPocketSide(model);
    if (pocketSide) {
      const pocket = roadConfig(model).pockets[pocketSide];
      return {
        sectionId: `pocket:${pocketSide}`,
        laneId: `pocket:${pocketSide}`,
        role: "pocket",
        side: pocketSide,
        width: pocket.width,
        startBoundaryId: "",
        endBoundaryId: "",
        startBoundaryRole: "edge",
        endBoundaryRole: "edge"
      };
    }
    const sectionId = selectedSectionId(model);
    if (!sectionId) return null;
    const section = crossSection(roadConfig(model));
    return sectionInfoFromSection(section.sections.find((item) => item.id === sectionId));
  }

  function activeBoundaryKey(model) {
    const key = String(model?.metadata?.roadBoundaryEdit?.key || "");
    return key === "start" || key === "end" ? key : "";
  }

  function activeBoundaryInfo(model, sectionData, config = roadConfig(model)) {
    const key = activeBoundaryKey(model);
    if (!key) return null;
    const sectionId = selectedSectionId(model);
    const selectedSection = sectionData.sections.find((item) => item.id === sectionId);
    if (!selectedSection) return null;
    const boundaryId = key === "end" ? selectedSection.endBoundaryId : selectedSection.startBoundaryId;
    const boundary = sectionData.boundaries.find((item) => item.id === boundaryId);
    if (!boundary) return null;
    return {
      ...boundary,
      key,
      sectionId: selectedSection.id,
      style: boundaryStyle(config, boundary, fallbackBoundaryStyle(config, boundary))
    };
  }

  function boundaryEditForSection(key, section) {
    if (!section || (key !== "start" && key !== "end")) return null;
    return {
      key,
      sectionId: section.sectionId,
      boundaryId: key === "end" ? section.endBoundaryId : section.startBoundaryId,
      role: key === "end" ? section.endBoundaryRole : section.startBoundaryRole
    };
  }

  function renderSelectedSection(model, element, section) {
    const sectionId = selectedSectionId(model);
    if (!sectionId) return;
    const item = section.sections.find((sectionItem) => sectionItem.id === sectionId);
    if (!item) return;
    addPath(element, "editor-road-lane-highlight editor-road-section-highlight", bandPathData(model, item.startOffset, item.endOffset));
  }

  function renderActiveBoundaryEdit(model, element, section, config) {
    const boundary = activeBoundaryInfo(model, section, config);
    if (!boundary) return;
    const path = addPath(element, "editor-road-boundary-active", offsetPathDataRange(model, boundary.offset, 0, 1), {
      "data-road-boundary-active": boundary.id
    });
    if (path) {
      path.setAttribute("stroke", "rgba(59, 130, 246, .34)");
      path.setAttribute("stroke-width", "12");
    }
  }

  function selectedBarrierId(model) {
    return String(model?.metadata?.roadBarrierEdit?.id || "");
  }

  function barrierById(config, id) {
    return (config.barriers || []).find((item) => item.id === id) || null;
  }

  function sideOutwardSign(side) {
    return side === "left" ? 1 : -1;
  }

  function barrierBoundary(config, barrier) {
    const edgeKey = barrierEdge(barrier?.edgeKey || barrier?.edge, barrier?.side);
    const boundary = boundaryForBarrierEdge(config, edgeKey);
    return boundary ? { ...boundary, edgeKey, side: boundary.side } : null;
  }

  function cubicPointAt(free, t) {
    const p01 = lerp(free.start, free.c1, t);
    const p12 = lerp(free.c1, free.c2, t);
    const p23 = lerp(free.c2, free.end, t);
    return lerp(lerp(p01, p12, t), lerp(p12, p23, t), t);
  }

  function cubicTangentAt(free, t) {
    return {
      x: 3 * (1 - t) * (1 - t) * (free.c1.x - free.start.x)
        + 6 * (1 - t) * t * (free.c2.x - free.c1.x)
        + 3 * t * t * (free.end.x - free.c2.x),
      y: 3 * (1 - t) * (1 - t) * (free.c1.y - free.start.y)
        + 6 * (1 - t) * t * (free.c2.y - free.c1.y)
        + 3 * t * t * (free.end.y - free.c2.y)
    };
  }

  function tangentNormal(tangent) {
    const length = Math.hypot(tangent.x, tangent.y) || 1;
    return {
      tangent: { x: tangent.x / length, y: tangent.y / length },
      normal: { x: -tangent.y / length, y: tangent.x / length }
    };
  }

  function barrierAttachedSample(model, barrier, boundary, t) {
    const tangent = tangentAt(model, t);
    const axes = tangentNormal(tangent);
    const base = offsetPointAt(model, t, boundary.offset);
    const sign = sideOutwardSign(barrier.side);
    return {
      t,
      base,
      top: {
        x: base.x + axes.normal.x * sign * BARRIER_DEPTH,
        y: base.y + axes.normal.y * sign * BARRIER_DEPTH
      },
      tangent: axes.tangent
    };
  }

  function freeFromAttached(model, barrier, boundary) {
    const start = barrierAttachedSample(model, barrier, boundary, barrier.from).base;
    const end = barrierAttachedSample(model, barrier, boundary, barrier.to).base;
    const c1 = barrierAttachedSample(model, barrier, boundary, barrier.from + (barrier.to - barrier.from) / 3).base;
    const c2 = barrierAttachedSample(model, barrier, boundary, barrier.from + 2 * (barrier.to - barrier.from) / 3).base;
    return { start, end, c1, c2 };
  }

  function barrierFreeSample(barrier, t) {
    const free = normalizeBarrierFree(barrier.free);
    const axes = tangentNormal(cubicTangentAt(free, t));
    const base = cubicPointAt(free, t);
    const sign = sideOutwardSign(barrier.side);
    return {
      t,
      base,
      top: {
        x: base.x + axes.normal.x * sign * BARRIER_DEPTH,
        y: base.y + axes.normal.y * sign * BARRIER_DEPTH
      },
      tangent: axes.tangent
    };
  }

  function barrierSample(model, barrier, boundary, t) {
    return barrier.attached
      ? barrierAttachedSample(model, barrier, boundary, barrier.from + (barrier.to - barrier.from) * t)
      : barrierFreeSample(barrier, t);
  }

  function barrierSamples(model, barrier, boundary, count = 72) {
    return Array.from({ length: count + 1 }, (_, index) => barrierSample(model, barrier, boundary, index / count));
  }

  function sampleLength(samples, key = "base") {
    let total = 0;
    for (let index = 0; index < samples.length - 1; index += 1) {
      const a = samples[index][key];
      const b = samples[index + 1][key];
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }

  function sampleAtDistance(samples, distance, key = "base") {
    if (!samples.length) return null;
    if (distance <= 0) return samples[0];
    let walked = 0;
    for (let index = 0; index < samples.length - 1; index += 1) {
      const a = samples[index];
      const b = samples[index + 1];
      const segmentLength = Math.hypot(b[key].x - a[key].x, b[key].y - a[key].y);
      if (walked + segmentLength >= distance) {
        const ratio = segmentLength > 0 ? (distance - walked) / segmentLength : 0;
        return {
          t: a.t + (b.t - a.t) * ratio,
          base: lerp(a.base, b.base, ratio),
          top: lerp(a.top, b.top, ratio),
          tangent: tangentNormal(lerp(a.tangent, b.tangent, ratio)).tangent
        };
      }
      walked += segmentLength;
    }
    return samples[samples.length - 1];
  }

  function barrierPostSamples(samples, spacing) {
    const total = sampleLength(samples);
    if (total <= 0) return [];
    const cleanSpacing = barrierSpacing(spacing);
    const count = Math.max(1, Math.floor(total / cleanSpacing));
    const distances = Array.from({ length: count + 1 }, (_, index) => total * index / count);
    return distances.map((distance) => sampleAtDistance(samples, distance)).filter(Boolean);
  }

  function topPathData(samples, posts = [], endCaps = {}) {
    if (!samples.length) return "";
    const caps = normalizeBarrierEndCaps(endCaps);
    if (posts.length > 4) {
      const startRamp = posts[1];
      const endRamp = posts[posts.length - 2];
      const firstRail = posts[2];
      const lastRail = posts[posts.length - 3];
      const railStart = caps.start ? firstRail : samples[0];
      const railEnd = caps.end ? lastRail : samples[samples.length - 1];
      const rail = samples
        .filter((sample) => sample.t > railStart.t && sample.t < railEnd.t)
        .map((sample) => sample.top);
      return pathFromPoints([
        ...(caps.start ? [startRamp.base] : []),
        railStart.top,
        ...rail,
        railEnd.top,
        ...(caps.end ? [endRamp.base] : [])
      ]);
    }
    return pathFromPoints([
      ...(caps.start ? [samples[0].base] : []),
      ...samples.map((sample) => sample.top),
      ...(caps.end ? [samples[samples.length - 1].base] : [])
    ]);
  }

  function postsPathData(posts, endCaps = {}) {
    const caps = normalizeBarrierEndCaps(endCaps);
    if (posts.length <= 4) {
      const endpointPosts = [
        ...(!caps.start && posts[0] ? [posts[0]] : []),
        ...(!caps.end && posts[posts.length - 1] ? [posts[posts.length - 1]] : [])
      ];
      return endpointPosts.map((post) => {
        return `M ${formatPoint(post.top)} L ${formatPoint(post.base)}`;
      }).join(" ");
    }
    const startIndex = caps.start ? 2 : 0;
    const endIndex = caps.end ? posts.length - 2 : posts.length;
    return posts.slice(startIndex, endIndex).map((post) => {
      return `M ${formatPoint(post.top)} L ${formatPoint(post.base)}`;
    }).join(" ");
  }

  function addBarrierStroke(parent, className, d, width, attrs = {}) {
    const path = addPath(parent, className, d, attrs);
    if (!path) return null;
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", ROAD_LINE_COLOR);
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-linecap", "butt");
    path.setAttribute("stroke-linejoin", "miter");
    path.setAttribute("vector-effect", "none");
    path.style.setProperty("vector-effect", "none");
    return path;
  }

  function renderBarrier(model, parent, config, barrier) {
    const boundary = barrierBoundary(config, barrier);
    if (!boundary) return;
    const group = utils.createSvgElement("g", {
      class: "editor-road-barrier" + (selectedBarrierId(model) === barrier.id ? " is-selected" : ""),
      "data-road-barrier-id": barrier.id,
      "data-road-barrier-edge": barrier.edgeKey || barrierEdge(barrier.edgeKey, barrier.side),
      "data-road-barrier-side": barrier.side
    });
    const samples = barrierSamples(model, barrier, boundary);
    const posts = barrierPostSamples(samples, barrier.spacing);
    if (selectedBarrierId(model) === barrier.id) {
      addBarrierStroke(group, "editor-road-barrier-selected", topPathData(samples, posts, barrier.endCaps), BARRIER_TOP_WIDTH + 9);
    }
    addBarrierStroke(group, "editor-road-barrier-top", topPathData(samples, posts, barrier.endCaps), BARRIER_TOP_WIDTH);
    addBarrierStroke(group, "editor-road-barrier-posts", postsPathData(posts, barrier.endCaps), BARRIER_POST_WIDTH);
    parent.append(group);
  }

  function renderBarriers(model, element, config) {
    (config.barriers || []).forEach((barrier) => renderBarrier(model, element, config, barrier));
  }

  function distanceToSamples(pointValue, samples, key = "base") {
    let best = Infinity;
    for (let index = 0; index < samples.length - 1; index += 1) {
      best = Math.min(best, lineGeometry.distanceToSegment(samples[index][key], samples[index + 1][key], pointValue));
    }
    return best;
  }

  function barrierHitInfo(model, pointValue, tolerance = BARRIER_HIT_TOLERANCE) {
    const config = roadConfig(model);
    const hitTolerance = Math.max(BARRIER_HIT_TOLERANCE, tolerance);
    let best = null;
    (config.barriers || []).forEach((barrier) => {
      const boundary = barrierBoundary(config, barrier);
      if (!boundary) return;
      const samples = barrierSamples(model, barrier, boundary, 48);
      const distance = Math.min(distanceToSamples(pointValue, samples, "base"), distanceToSamples(pointValue, samples, "top"));
      if (distance <= hitTolerance && (!best || distance < best.distance)) {
        best = { barrier, distance };
      }
    });
    return best;
  }

  function selectedBarrierInfo(model) {
    const id = selectedBarrierId(model);
    if (!id) return null;
    const config = roadConfig(model);
    const barrier = barrierById(config, id);
    if (!barrier) return null;
    const edgeKey = barrierEdge(barrier.edgeKey, barrier.side);
    const boundary = barrierBoundary(config, barrier);
    return {
      ...barrier,
      edgeKey,
      side: boundary?.side || barrier.side,
      title: barrierEdgeTitle(edgeKey, config.divided),
      endCaps: normalizeBarrierEndCaps(barrier.endCaps),
      boundary
    };
  }

  function outerBarrierTargets(model, sectionInfo = selectedSectionInfo(model)) {
    if (!sectionInfo || isIslandGeometry(model?.geometry)) return [];
    if (sectionInfo.role !== "lane" && sectionInfo.role !== "shoulder" && sectionInfo.role !== "innerShoulder") return [];
    const config = roadConfig(model);
    const targets = [];
    function pushTarget(edgeKey, boundaryKey) {
      const boundary = boundaryForBarrierEdge(config, edgeKey);
      const selectedBoundaryId = boundaryKey === "end" ? sectionInfo.endBoundaryId : sectionInfo.startBoundaryId;
      if (!boundary || selectedBoundaryId !== boundary.id) return;
      targets.push({
        edgeKey,
        side: boundary.side,
        title: barrierEdgeTitle(edgeKey, config.divided),
        boundaryId: boundary.id,
        boundaryKey,
        sectionId: sectionInfo.sectionId,
        count: (config.barriers || []).filter((barrier) => barrierEdge(barrier.edgeKey, barrier.side) === edgeKey).length
      });
    }
    pushTarget("rightOuter", "start");
    if (config.divided) {
      pushTarget("rightInner", "end");
      pushTarget("leftInner", "start");
    }
    pushTarget("leftOuter", "end");
    return targets.map((target) => ({
      ...target,
      remaining: Math.max(0, MAX_BARRIERS_PER_SIDE - target.count)
    }));
  }

  function nextBarrierTarget(model, sectionInfo = selectedSectionInfo(model)) {
    return outerBarrierTargets(model, sectionInfo)
      .filter((target) => target.remaining > 0)
      .sort((a, b) => a.count - b.count || barrierEdgeSortValue(a.edgeKey) - barrierEdgeSortValue(b.edgeKey))[0] || null;
  }

  function generateBarrierId(config, edgeKey) {
    const used = new Set((config.barriers || []).map((barrier) => barrier.id));
    let index = 1;
    let id = "";
    do {
      id = `barrier_${edgeKey}_${Date.now().toString(36)}_${index}`;
      index += 1;
    } while (used.has(id));
    return id;
  }

  function addBarrierToConfig(model, config, sectionInfo = selectedSectionInfo(model)) {
    const target = nextBarrierTarget(model, sectionInfo);
    if (!target) return null;
    const barrier = {
      id: generateBarrierId(config, target.edgeKey),
      edgeKey: target.edgeKey,
      side: target.side,
      boundaryId: target.boundaryId,
      boundaryKey: target.boundaryKey,
      sectionId: target.sectionId,
      from: 0,
      to: 1,
      attached: true,
      spacing: DEFAULT_BARRIER_SPACING,
      endCaps: { start: false, end: false },
      free: null
    };
    config.barriers = normalizeBarriers([...(config.barriers || []), barrier], config);
    model.metadata = {
      ...(model.metadata || {}),
      roadBarrierEdit: { id: barrier.id },
      roadSelection: {
        sectionId: target.sectionId,
        laneId: sectionInfo?.laneId || "",
        role: sectionInfo?.role || "",
        startBoundaryId: sectionInfo?.startBoundaryId || "",
        endBoundaryId: sectionInfo?.endBoundaryId || "",
        startBoundaryRole: sectionInfo?.startBoundaryRole || "",
        endBoundaryRole: sectionInfo?.endBoundaryRole || ""
      }
    };
    delete model.metadata.roadBoundaryEdit;
    return barrier;
  }

  function updateBarrier(config, barrierId, mutator) {
    const barriers = (config.barriers || []).map((barrier) => {
      if (barrier.id !== barrierId) return barrier;
      const next = utils.clonePlain(barrier);
      mutator(next);
      return next;
    });
    config.barriers = normalizeBarriers(barriers, config);
  }

  function setBarrierAttached(model, config, barrierId, attached) {
    updateBarrier(config, barrierId, (barrier) => {
      barrier.attached = Boolean(attached);
      if (barrier.attached) {
        barrier.free = null;
        return;
      }
      const boundary = barrierBoundary(config, barrier);
      barrier.free = boundary ? freeFromAttached(model, barrier, boundary) : normalizeBarrierFree(barrier.free);
    });
  }

  function setBarrierSpacing(config, barrierId, spacing) {
    updateBarrier(config, barrierId, (barrier) => {
      barrier.spacing = barrierSpacing(spacing);
    });
  }

  function barrierEndCapStateIndex(endCaps) {
    const caps = normalizeBarrierEndCaps(endCaps);
    const index = BARRIER_END_CAP_STATES.findIndex((state) => (
      state.start === caps.start && state.end === caps.end
    ));
    return Math.max(0, index);
  }

  function cycleBarrierEndCaps(config, barrierId) {
    const id = String(barrierId || "");
    if (!id) return false;
    let updated = false;
    updateBarrier(config, id, (barrier) => {
      const currentIndex = barrierEndCapStateIndex(barrier.endCaps);
      barrier.endCaps = BARRIER_END_CAP_STATES[(currentIndex + 1) % BARRIER_END_CAP_STATES.length];
      updated = true;
    });
    return updated;
  }

  function removeBarrierFromConfig(model, config, barrierId = selectedBarrierId(model)) {
    const id = String(barrierId || "");
    if (!id) return false;
    const barriers = config.barriers || [];
    const nextBarriers = barriers.filter((barrier) => barrier.id !== id);
    if (nextBarriers.length === barriers.length) return false;
    config.barriers = normalizeBarriers(nextBarriers, config);
    const metadata = { ...(model.metadata || {}) };
    if (metadata.roadBarrierEdit?.id === id) delete metadata.roadBarrierEdit;
    model.metadata = metadata;
    return true;
  }

  function clearBarrierSelection(model) {
    const metadata = { ...(model.metadata || {}) };
    delete metadata.roadBarrierEdit;
    model.metadata = metadata;
  }

  function selectedPocketControlPoints(model, _metrics, mode) {
    if (mode !== "edit") return [];
    const side = selectedPocketSide(model);
    if (!side) return [];
    const geometry = pocketGeometry(model, side);
    if (!geometry) return [];
    const pocket = geometry.config;
    const midT = (pocket.innerFrom + pocket.innerTo) / 2;
    return [
      { id: `pocket:${side}:outerFrom`, ...geometry.centerPoints[0], role: "road-pocket-end", cursor: "grab" },
      { id: `pocket:${side}:innerFrom`, ...geometry.centerPoints[1], role: "road-pocket-length", cursor: "grab" },
      { id: `pocket:${side}:offset`, ...offsetPointAt(model, midT, geometry.bodyOffset), role: "road-pocket-offset", cursor: "grab" },
      { id: `pocket:${side}:innerTo`, ...geometry.centerPoints[2], role: "road-pocket-length", cursor: "grab" },
      { id: `pocket:${side}:outerTo`, ...geometry.centerPoints[3], role: "road-pocket-end", cursor: "grab" }
    ];
  }

  function parsePocketControlId(cpId) {
    const match = /^pocket:(left|right):(outerFrom|innerFrom|offset|innerTo|outerTo)$/.exec(String(cpId || ""));
    return match ? { side: match[1], key: match[2] } : null;
  }

  function movePocketControlPoint(model, cpId, worldPoint, modifiers = {}) {
    const parsed = parsePocketControlId(cpId);
    if (!parsed) return false;
    const config = roadConfig(model);
    const pocket = config.pockets?.[parsed.side];
    if (!pocket || model.geometry?.profile !== STRAIGHT) return true;
    const pathLength = Math.max(1, centerlineLength(model));
    const minGap = clamp((modifiers.metrics?.unit || 1) * 24 / pathLength, 0.015, 0.08);
    const t = parameterAtPoint(model, worldPoint);

    if (parsed.key === "outerFrom") pocket.outerFrom = clamp(t, 0, pocket.innerFrom - minGap);
    if (parsed.key === "outerTo") pocket.outerTo = clamp(t, pocket.innerTo + minGap, 1);
    if (parsed.key === "innerFrom") {
      const taperSpan = pocket.innerFrom - pocket.outerFrom;
      pocket.innerFrom = clamp(t, taperSpan, pocket.innerTo - minGap);
      pocket.outerFrom = pocket.innerFrom - taperSpan;
    }
    if (parsed.key === "innerTo") {
      const taperSpan = pocket.outerTo - pocket.innerTo;
      pocket.innerTo = clamp(t, pocket.innerFrom + minGap, 1 - taperSpan);
      pocket.outerTo = pocket.innerTo + taperSpan;
    }
    if (parsed.key === "offset") {
      const signed = signedOffsetAtPoint(model, worldPoint);
      const section = crossSection(config);
      const magnitude = signed ? signed.offset * pocketSideSign(parsed.side) : section.totalWidth / 2 + pocket.outset;
      pocket.outset = clamp(magnitude - section.totalWidth / 2, pocket.width / 2, 600);
    }

    model.metadata = {
      ...(model.metadata || {}),
      road: normalizeRoadConfig(config),
      roadPocketEdit: { side: parsed.side }
    };
    return true;
  }

  function selectedBarrierControlPoints(model, metrics, mode) {
    if (mode !== "edit") return [];
    const info = selectedBarrierInfo(model);
    if (!info) return [];
    const config = roadConfig(model);
    const boundary = barrierBoundary(config, info);
    if (!boundary) return [];
    if (info.attached) {
      const from = barrierAttachedSample(model, info, boundary, info.from);
      const to = barrierAttachedSample(model, info, boundary, info.to);
      return [
        { id: `barrier:${info.id}:from`, ...from.base, role: "road-barrier", cursor: "grab" },
        { id: `barrier:${info.id}:to`, ...to.base, role: "road-barrier", cursor: "grab" }
      ];
    }
    const free = normalizeBarrierFree(info.free || freeFromAttached(model, info, boundary));
    return [
      { id: `barrier:${info.id}:from`, ...free.start, role: "road-barrier", cursor: "grab" },
      { id: `barrier:${info.id}:to`, ...free.end, role: "road-barrier", cursor: "grab" },
      { id: `barrier:${info.id}:c1`, ...free.c1, role: "road-barrier-free", cursor: "grab" },
      { id: `barrier:${info.id}:c2`, ...free.c2, role: "road-barrier-free", cursor: "grab" }
    ];
  }

  function parseBarrierControlId(cpId) {
    const match = /^barrier:([^:]+):(from|to|c1|c2)$/.exec(String(cpId || ""));
    return match ? { id: match[1], key: match[2] } : null;
  }

  function moveBarrierControlPoint(model, cpId, worldPoint, modifiers = {}) {
    const parsed = parseBarrierControlId(cpId);
    if (!parsed) return false;
    const config = roadConfig(model);
    const barrier = barrierById(config, parsed.id);
    if (!barrier) return true;
    if (barrier.attached) {
      const pathLength = Math.max(1, centerlineLength(model));
      const unit = modifiers.metrics?.unit || 1;
      const minGap = clamp(unit * 24 / pathLength, 0.01, 0.08);
      const t = parameterAtPoint(model, worldPoint);
      updateBarrier(config, parsed.id, (draft) => {
        if (parsed.key === "from") draft.from = clamp(t, 0, draft.to - minGap);
        if (parsed.key === "to") draft.to = clamp(t, draft.from + minGap, 1);
      });
    } else {
      updateBarrier(config, parsed.id, (draft) => {
        const boundary = barrierBoundary(config, draft);
        const free = normalizeBarrierFree(draft.free || (boundary ? freeFromAttached(model, draft, boundary) : null));
        if (parsed.key === "from") free.start = { x: worldPoint.x, y: worldPoint.y };
        if (parsed.key === "to") free.end = { x: worldPoint.x, y: worldPoint.y };
        if (parsed.key === "c1") free.c1 = { x: worldPoint.x, y: worldPoint.y };
        if (parsed.key === "c2") free.c2 = { x: worldPoint.x, y: worldPoint.y };
        draft.free = free;
      });
    }
    model.metadata = {
      ...(model.metadata || {}),
      road: config,
      roadBarrierEdit: { id: parsed.id }
    };
    return true;
  }

  function segmentBoundaryControlPoints(model, metrics, mode) {
    if (mode !== "edit") return [];
    const config = roadConfig(model);
    const section = crossSection(config);
    const boundary = activeBoundaryInfo(model, section, config);
    const segments = boundary?.style?.segments || [];
    if (!boundary || segments.length < 2) return [];
    return segments.slice(0, -1).map((segment, index) => {
      const t = clamp(segment.to, 0, 1);
      const tangent = tangentAt(model, t);
      return {
        id: `segment:${boundary.id}:${index}`,
        ...offsetPointAt(model, t, boundary.offset),
        role: "road-segment-boundary",
        shape: "segment",
        cursor: "grab",
        angle: Math.atan2(tangent.y, tangent.x) * 180 / Math.PI,
        visualWidthScale: 0.62,
        visualHeightScale: 1.38
      };
    });
  }

  function parseSegmentControlId(cpId) {
    const match = /^segment:(b\d+):(\d+)$/.exec(String(cpId || ""));
    if (!match) return null;
    return { boundaryId: match[1], index: Number(match[2]) };
  }

  function endpointHandlePoint(model, pointId, offset) {
    const base = pointId === "start" ? model.geometry.start : model.geometry.end;
    const tangent = tangentAt(model, pointId === "start" ? 0 : 1);
    const length = Math.hypot(tangent.x, tangent.y);
    if (!Number.isFinite(length) || length < 0.001) {
      return lineGeometry.lineEndpointControlPoint(model.geometry.start, model.geometry.end, pointId, offset);
    }
    const sign = pointId === "start" ? -1 : 1;
    return {
      x: base.x + (tangent.x / length) * offset * sign,
      y: base.y + (tangent.y / length) * offset * sign
    };
  }

  function moveGeometryPoint(model, pointId, worldPoint, modifiers = {}) {
    const startState = modifiers.startState;
    if (!startState?.geometry || !startState.point) return;
    const dx = worldPoint.x - startState.point.x;
    const dy = worldPoint.y - startState.point.y;
    if (pointId === "start") {
      const nextStart = { x: startState.geometry.start.x + dx, y: startState.geometry.start.y + dy };
      model.geometry.start = lineGeometry.snapEndpoint(model.geometry.end, nextStart);
    }
    if (pointId === "end") {
      const nextEnd = { x: startState.geometry.end.x + dx, y: startState.geometry.end.y + dy };
      model.geometry.end = lineGeometry.snapEndpoint(model.geometry.start, nextEnd);
    }
    if (model.geometry.profile === ARC) model.geometry.ratio = startState.geometry.ratio;
    if (model.geometry.profile === S_CURVE) {
      model.geometry.controls = utils.clonePlain(startState.geometry.controls || [startState.geometry.c1, startState.geometry.c2].filter(Boolean));
      syncLegacySCurveControls(model.geometry);
    }
  }

  function moveSegmentBoundaryPoint(model, cpId, worldPoint, modifiers = {}) {
    const parsed = parseSegmentControlId(cpId);
    if (!parsed) return false;
    const config = roadConfig(model);
    const section = crossSection(config);
    const boundary = section.boundaries.find((item) => item.id === parsed.boundaryId);
    if (!boundary) return true;
    const style = boundaryStyle(config, boundary, fallbackBoundaryStyle(config, boundary));
    const segments = style.segments || [];
    const before = segments[parsed.index];
    const after = segments[parsed.index + 1];
    if (!before || !after) return true;
    const pathLength = Math.max(1, centerlineLength(model));
    const unit = modifiers.metrics?.unit || 1;
    const minGap = clamp(unit * 18 / pathLength, 0.012, 0.08);
    const lower = before.from + minGap;
    const upper = Math.max(lower, after.to - minGap);
    const split = clamp(parameterAtPoint(model, worldPoint), lower, upper);
    setBoundarySegmentSplit(config, parsed.boundaryId, parsed.index, split, fallbackBoundaryStyle(config, boundary));
    model.metadata = {
      ...(model.metadata || {}),
      road: config
    };
    return true;
  }

  function moveAllPoints(model, dx, dy) {
    if (isIslandGeometry(model?.geometry)) {
      model.geometry.center.x += dx;
      model.geometry.center.y += dy;
      return;
    }
    ["start", "end"].forEach((key) => {
      if (!model.geometry[key]) return;
      model.geometry[key].x += dx;
      model.geometry[key].y += dy;
    });
    if (model.geometry.profile === S_CURVE) {
      const controls = cleanSCurveControls(model.geometry);
      controls.forEach((item) => {
        item.x += dx;
        item.y += dy;
      });
      model.geometry.controls = controls;
      syncLegacySCurveControls(model.geometry);
      return;
    }
    ["c1", "c2"].forEach((key) => {
      if (!model.geometry[key]) return;
      model.geometry[key].x += dx;
      model.geometry[key].y += dy;
    });
  }

  function reflectPointAcrossAxis(pointValue, axis, axisValue) {
    const value = point(pointValue);
    if (axis === "x") return { x: value.x, y: axisValue * 2 - value.y };
    return { x: axisValue * 2 - value.x, y: value.y };
  }

  function mirrorRoadConfig(source) {
    const config = normalizeRoadConfig(source);
    const lastBoundaryIndex = crossSection(config).boundaries.length - 1;
    const boundaryStyles = {};
    Object.entries(config.boundaryStyles).forEach(([id, style]) => {
      const match = id.match(/^b(\d+)$/);
      if (!match) return;
      const index = Number(match[1]);
      if (index > lastBoundaryIndex) return;
      boundaryStyles["b" + (lastBoundaryIndex - index)] = utils.clonePlain(style);
    });
    const leftShoulder = config.leftShoulder;
    config.leftShoulder = config.rightShoulder;
    config.rightShoulder = leftShoulder;
    config.laneWidths = config.laneWidths.slice().reverse();
    const leftLaneWidths = config.dividedLaneWidths.left;
    config.dividedLaneWidths = {
      left: config.dividedLaneWidths.right.slice().reverse(),
      right: leftLaneWidths.slice().reverse()
    };
    const leftPocket = config.pockets?.left || null;
    config.pockets = {
      left: config.pockets?.right || null,
      right: leftPocket
    };
    config.boundaryStyles = boundaryStyles;
    config.barriers = normalizeBarriers((config.barriers || []).map((barrier) => ({
      ...barrier,
      edgeKey: mirrorBarrierEdge(barrierEdge(barrier.edgeKey, barrier.side)),
      side: barrierEdgeSide(mirrorBarrierEdge(barrierEdge(barrier.edgeKey, barrier.side)))
    })), config);
    return config;
  }

  function reflectRoad(model, axis, axisValue) {
    if (!model?.geometry || isIslandGeometry(model.geometry)) return model;
    if (!Number.isFinite(axisValue)) return model;
    const originalGeometry = utils.clonePlain(model.geometry);
    const originalModel = { ...model, geometry: originalGeometry };
    model.geometry.start = reflectPointAcrossAxis(originalGeometry.start, axis, axisValue);
    model.geometry.end = reflectPointAcrossAxis(originalGeometry.end, axis, axisValue);
    if (originalGeometry.profile === ARC) {
      const reflectedControl = reflectPointAcrossAxis(arcControlPoint(originalModel), axis, axisValue);
      const basisValue = arcBasis(model.geometry.start, model.geometry.end);
      model.geometry.ratio = basisValue ? arcRatioFromPoint(basisValue, reflectedControl) : DEFAULT_ARC_RATIO;
    }
    if (originalGeometry.profile === S_CURVE) {
      model.geometry.controls = cleanSCurveControls(originalGeometry).map((control) => reflectPointAcrossAxis(control, axis, axisValue));
      syncLegacySCurveControls(model.geometry);
    }
    const metadata = {
      ...(model.metadata || {}),
      road: mirrorRoadConfig(roadConfig(model))
    };
    metadata.road.barriers = normalizeBarriers((metadata.road.barriers || []).map((barrier) => {
      if (barrier.attached || !barrier.free) return barrier;
      return {
        ...barrier,
        free: {
          start: reflectPointAcrossAxis(barrier.free.start, axis, axisValue),
          end: reflectPointAcrossAxis(barrier.free.end, axis, axisValue),
          c1: reflectPointAcrossAxis(barrier.free.c1, axis, axisValue),
          c2: reflectPointAcrossAxis(barrier.free.c2, axis, axisValue)
        }
      };
    }), metadata.road);
    delete metadata.roadSelection;
    delete metadata.roadBoundaryEdit;
    delete metadata.roadBarrierEdit;
    if (metadata.roadPocketEdit?.side === "left") metadata.roadPocketEdit = { side: "right" };
    else if (metadata.roadPocketEdit?.side === "right") metadata.roadPocketEdit = { side: "left" };
    if (metadata.roadPocketIslandEdit?.side === "left") metadata.roadPocketIslandEdit = { side: "right" };
    else if (metadata.roadPocketIslandEdit?.side === "right") metadata.roadPocketIslandEdit = { side: "left" };
    model.metadata = metadata;
    return model;
  }

  function roadBounds(model) {
    if (isIslandGeometry(model?.geometry)) {
      const center = point(model.geometry.center);
      const radii = islandRadii(model.geometry);
      return { x: center.x - radii.outerRadius, y: center.y - radii.outerRadius, width: radii.outerRadius * 2, height: radii.outerRadius * 2 };
    }
    const config = roadConfig(model);
    const section = crossSection(config);
    const points = surfaceOutline(model, section.totalWidth);
    activePocketGeometries(model, config).forEach((geometry) => {
      const boundaries = pocketBoundaryPoints(geometry);
      points.push(...boundaries.first, ...boundaries.second);
    });
    return boundsFromPoints(points);
  }

  function reflectAcrossBoundsAxis(model, axis) {
    if (!model?.geometry || isIslandGeometry(model.geometry)) return model;
    const bounds = roadBounds(model);
    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
    return reflectRoad(model, axis, axis === "x" ? center.y : center.x);
  }

  function reflectAcrossBoundsXAxis(model) {
    return reflectAcrossBoundsAxis(model, "x");
  }

  function reflectAcrossBoundsYAxis(model) {
    return reflectAcrossBoundsAxis(model, "y");
  }

  function convertProfileGeometry(model, profile) {
    if (!model?.geometry) return null;
    const nextProfile = normalizeProfile(profile);
    const start = point(model.geometry.start);
    const end = point(model.geometry.end, { x: start.x + 360, y: start.y });
    const next = { profile: nextProfile, start, end };
    if (nextProfile === ARC) {
      next.ratio = numberOr(model.geometry.ratio, DEFAULT_ARC_RATIO);
    }
    if (nextProfile === S_CURVE) {
      const existingCount = Array.isArray(model.geometry.controls) ? model.geometry.controls.length : MIN_S_CURVE_CONTROLS;
      next.controls = cleanSCurveControls({ profile: S_CURVE, start, end, controls: model.geometry.controls, c1: model.geometry.c1, c2: model.geometry.c2, controlCount: existingCount }, existingCount);
    }
    return normalizeGeometry(next);
  }

  function setProfile(model, profile) {
    const next = convertProfileGeometry(model, profile);
    if (!next) return model;
    model.geometry = next;
    if (next.profile !== STRAIGHT && (model.metadata?.roadPocketEdit || model.metadata?.roadPocketIslandEdit)) {
      const metadata = { ...(model.metadata || {}) };
      delete metadata.roadPocketEdit;
      delete metadata.roadPocketIslandEdit;
      model.metadata = metadata;
    }
    return model;
  }

  function sCurveControlCount(model) {
    if (!model?.geometry || model.geometry.profile !== S_CURVE) return MIN_S_CURVE_CONTROLS;
    return cleanSCurveControls(model?.geometry || {}).length;
  }

  function setSCurveControlCount(model, count) {
    if (!model?.geometry || model.geometry.profile !== S_CURVE) return model;
    const oldControls = cleanSCurveControls(model.geometry);
    const nextCount = clampInt(count, MIN_S_CURVE_CONTROLS, MAX_S_CURVE_CONTROLS, oldControls.length);
    if (nextCount === oldControls.length) return model;
    const snapshot = utils.clonePlain(model.geometry);
    model.geometry.controls = Array.from({ length: nextCount }, (_, index) => {
      const t = (index + 1) / (nextCount + 1);
      return sCurvePointAt(snapshot, t);
    });
    syncLegacySCurveControls(model.geometry);
    return model;
  }

  function syncIslandRoadMetadata(model) {
    if (!isIslandGeometry(model?.geometry)) return model;
    const config = roadConfig(model);
    model.metadata = {
      ...(model.metadata || {}),
      road: {
        ...(model.metadata?.road || {}),
        ...config,
        laneCount: config.laneCount,
        laneWidth: config.laneWidth,
        laneWidths: config.laneWidths.slice(),
        dividedLaneWidths: {
          left: config.laneWidths.slice(),
          right: config.laneWidths.slice()
        },
        divided: false,
        leftShoulder: { enabled: false, width: 0 },
        rightShoulder: { enabled: false, width: 0 },
        innerShoulder: { enabled: false, width: 0 },
        waterChannel: { enabled: false, width: 0 },
        barrier: { enabled: false, width: 0 }
      }
    };
    return model;
  }

  function setIslandLaneCount(model, count) {
    if (!isIslandGeometry(model?.geometry)) return model;
    const config = roadConfig(model);
    const nextCount = clampInt(count, 1, 3, config.laneCount || DEFAULT_ISLAND_LANE_COUNT);
    const laneWidth = clamp(numberOr(config.laneWidth, DEFAULT_ISLAND_LANE_WIDTH), MIN_ISLAND_LANE_WIDTH, 300);
    model.geometry.outerDiameter = model.geometry.innerDiameter + nextCount * laneWidth * 2;
    model.geometry = normalizeGeometry(model.geometry);
    model.metadata = {
      ...(model.metadata || {}),
      road: {
        ...(model.metadata?.road || {}),
        laneCount: nextCount,
        laneWidth,
        laneWidths: Array.from({ length: nextCount }, () => laneWidth)
      }
    };
    return syncIslandRoadMetadata(model);
  }

  function setIslandLaneWidth(model, width) {
    if (!isIslandGeometry(model?.geometry)) return model;
    const config = roadConfig(model);
    const laneCount = islandLaneCountFromConfig(config);
    const nextWidth = clamp(numberOr(width, config.laneWidth || DEFAULT_ISLAND_LANE_WIDTH), MIN_ISLAND_LANE_WIDTH, 300);
    model.geometry.outerDiameter = model.geometry.innerDiameter + laneCount * nextWidth * 2;
    model.geometry = normalizeGeometry(model.geometry);
    model.metadata = {
      ...(model.metadata || {}),
      road: {
        ...(model.metadata?.road || {}),
        laneCount,
        laneWidth: nextWidth,
        laneWidths: Array.from({ length: laneCount }, () => nextWidth)
      }
    };
    return syncIslandRoadMetadata(model);
  }

  function setIslandInnerDiameter(model, value) {
    if (!isIslandGeometry(model?.geometry)) return model;
    const laneCount = islandLaneCountFromConfig(roadConfig(model));
    const outer = numberOr(model.geometry.outerDiameter, DEFAULT_ISLAND_INNER_DIAMETER + DEFAULT_ISLAND_LANE_WIDTH * 2);
    model.geometry.innerDiameter = clamp(numberOr(value, model.geometry.innerDiameter), MIN_ISLAND_INNER_DIAMETER, Math.max(MIN_ISLAND_INNER_DIAMETER, outer - laneCount * MIN_ISLAND_LANE_WIDTH * 2));
    model.geometry = normalizeGeometry(model.geometry);
    return syncIslandRoadMetadata(model);
  }

  function setIslandOuterDiameter(model, value) {
    if (!isIslandGeometry(model?.geometry)) return model;
    const laneCount = islandLaneCountFromConfig(roadConfig(model));
    const inner = numberOr(model.geometry.innerDiameter, DEFAULT_ISLAND_INNER_DIAMETER);
    model.geometry.outerDiameter = clamp(numberOr(value, model.geometry.outerDiameter), inner + laneCount * MIN_ISLAND_LANE_WIDTH * 2, MAX_ISLAND_DIAMETER);
    model.geometry = normalizeGeometry(model.geometry);
    return syncIslandRoadMetadata(model);
  }

  function setIslandSectionWidth(model, sectionId, width) {
    if (!isIslandGeometry(model?.geometry)) return model;
    const config = roadConfig(model);
    setSectionWidth(config, sectionId, width);
    const totalWidth = config.laneWidths.reduce((sum, laneWidth) => sum + laneWidth, 0);
    model.geometry.outerDiameter = model.geometry.innerDiameter + totalWidth * 2;
    model.geometry = normalizeGeometry(model.geometry);
    model.metadata = {
      ...(model.metadata || {}),
      road: config
    };
    return syncIslandRoadMetadata(model);
  }

  function boundsFromPoints(points) {
    const xs = points.map((item) => item.x);
    const ys = points.map((item) => item.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  }

  function distanceToCenterline(model, pointValue) {
    const points = samplesFor(model).map((sample) => sample.center);
    let best = Infinity;
    for (let index = 0; index < points.length - 1; index += 1) {
      best = Math.min(best, lineGeometry.distanceToSegment(points[index], points[index + 1], pointValue));
    }
    return best;
  }

  function signedOffsetAtPoint(model, pointValue) {
    const samples = samplesFor(model);
    let best = null;
    for (let index = 0; index < samples.length - 1; index += 1) {
      const a = samples[index].center;
      const b = samples[index + 1].center;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 0.001) continue;
      const rawT = ((pointValue.x - a.x) * dx + (pointValue.y - a.y) * dy) / lengthSquared;
      const localT = clamp(rawT, 0, 1);
      const center = { x: a.x + dx * localT, y: a.y + dy * localT };
      const distance = Math.hypot(pointValue.x - center.x, pointValue.y - center.y);
      if (best && distance >= best.distance) continue;
      const normal = {
        x: samples[index].normal.x + (samples[index + 1].normal.x - samples[index].normal.x) * localT,
        y: samples[index].normal.y + (samples[index + 1].normal.y - samples[index].normal.y) * localT
      };
      const normalLength = Math.hypot(normal.x, normal.y) || 1;
      best = {
        distance,
        t: samples[index].t + (samples[index + 1].t - samples[index].t) * localT,
        offset: ((pointValue.x - center.x) * normal.x + (pointValue.y - center.y) * normal.y) / normalLength
      };
    }
    return best;
  }

  function parameterAtPoint(model, pointValue) {
    const signed = signedOffsetAtPoint(model, pointValue);
    return signed ? clamp(signed.t, 0, 1) : 0;
  }

  function sectionAtPoint(model, pointValue) {
    const config = roadConfig(model);
    const section = crossSection(config);
    const signed = signedOffsetAtPoint(model, pointValue);
    if (!signed) return null;
    const item = section.sections.find((sectionItem) => (
      signed.offset >= sectionItem.startOffset &&
      signed.offset <= sectionItem.endOffset
    ));
    return sectionInfoFromSection(item);
  }

  function setSectionWidth(config, sectionId, width) {
    const nextWidth = widthOr(width, config.laneWidth || DEFAULT_ROAD_CONFIG.laneWidth, 10, 180);
    const parts = String(sectionId || "").split(":");
    if (parts.length === 2) {
      if (parts[0] === "pocket" && config.pockets?.[parts[1]]) {
        config.pockets[parts[1]].width = nextWidth;
        config.pockets[parts[1]].outset = Math.max(config.pockets[parts[1]].outset, nextWidth / 2);
        return;
      }
      if (parts[0] === "shoulder") {
        if (parts[1] === "right") config.rightShoulder.width = nextWidth;
        if (parts[1] === "left") config.leftShoulder.width = nextWidth;
        return;
      }
      if (parts[0] === "innerShoulder") {
        config.innerShoulder.width = nextWidth;
        return;
      }
      const index = Number(parts[1]);
      if (parts[0] === "lane" && Number.isInteger(index) && config.laneWidths[index] != null) config.laneWidths[index] = nextWidth;
      return;
    }
    if (parts.length === 3) {
      const side = parts[1];
      const index = Number(parts[2]);
      if (parts[0] === "lane" && Number.isInteger(index) && config.dividedLaneWidths?.[side]?.[index] != null) {
        config.dividedLaneWidths[side][index] = nextWidth;
      }
      return;
    }
    if (parts[0] === "waterChannel") config.waterChannel.width = nextWidth;
  }

  function setLaneWidth(config, laneId, width) {
    setSectionWidth(config, laneId, width);
  }

  function fallbackBoundaryValue(config, boundaryId) {
    const current = config.boundaryStyles?.[boundaryId] || {};
    return {
      style: normalizeMarkingStyle(current.style || config.marking?.style || "dash"),
      width: widthOr(current.width, config.marking?.width || DEFAULT_ROAD_CONFIG.marking.width, 1, 16)
    };
  }

  function boundarySegmentsForEdit(config, boundaryId, segmentIndex, fallbackOverride = null) {
    const index = clampInt(segmentIndex, 0, 4, 0);
    const fallback = fallbackOverride || fallbackBoundaryValue(config, boundaryId);
    const current = normalizeBoundarySegments(config.boundaryStyles?.[boundaryId]?.segments, fallback);
    if (current.length > index) return current;
    const count = Math.max(index + 1, current.length || 1);
    return Array.from({ length: count }, (_, itemIndex) => {
      const source = current[itemIndex] || fallback;
      return {
        from: itemIndex / count,
        to: (itemIndex + 1) / count,
        style: normalizeMarkingStyle(source.style || fallback.style),
        width: widthOr(source.width, fallback.width, 1, 16)
      };
    });
  }

  function setBoundarySegmentSplit(config, boundaryId, segmentIndex, split, baseStyle) {
    const id = String(boundaryId || "");
    if (!/^b\d+$/.test(id)) return;
    const index = clampInt(segmentIndex, 0, 3, 0);
    const sourceFallback = fallbackBoundaryValue(config, id);
    const fallback = {
      style: normalizeMarkingStyle(baseStyle?.style || sourceFallback.style),
      width: widthOr(baseStyle?.width, sourceFallback.width, 1, 16)
    };
    const segments = normalizeBoundarySegments(config.boundaryStyles?.[id]?.segments, fallback);
    if (!segments[index] || !segments[index + 1]) return;
    const nextSplit = clamp(numberOr(split, segments[index].to), segments[index].from, segments[index + 1].to);
    segments[index] = { ...segments[index], to: nextSplit };
    segments[index + 1] = { ...segments[index + 1], from: nextSplit };
    config.boundaryStyles = normalizeBoundaryStyles({
      ...(config.boundaryStyles || {}),
      [id]: {
        ...fallback,
        segments
      }
    });
  }

  function setBoundarySegment(config, boundaryId, segmentIndex, patch) {
    const id = String(boundaryId || "");
    if (!/^b\d+$/.test(id)) return;
    const index = clampInt(segmentIndex, 0, 4, 0);
    const sourceFallback = fallbackBoundaryValue(config, id);
    const patchBase = (patch || {}).baseStyle || {};
    const fallback = {
      style: normalizeMarkingStyle(patchBase.style || sourceFallback.style),
      width: widthOr(patchBase.width, sourceFallback.width, 1, 16)
    };
    const segments = boundarySegmentsForEdit(config, id, index, fallback);
    segments[index] = {
      ...segments[index],
      ...(patch || {}),
      style: normalizeMarkingStyle((patch || {}).style || segments[index].style),
      width: widthOr((patch || {}).width, segments[index].width, 1, 16)
    };
    delete segments[index].baseStyle;
    config.boundaryStyles = normalizeBoundaryStyles({
      ...(config.boundaryStyles || {}),
      [id]: {
        ...fallback,
        segments
      }
    });
  }

  function setBoundarySegmentCount(config, boundaryId, count, baseStyle) {
    const id = String(boundaryId || "");
    if (!/^b\d+$/.test(id)) return;
    const cleanCount = clampInt(count, 1, 5, 1);
    const sourceFallback = fallbackBoundaryValue(config, id);
    const fallback = {
      style: normalizeMarkingStyle(baseStyle?.style || sourceFallback.style),
      width: widthOr(baseStyle?.width, sourceFallback.width, 1, 16)
    };
    const current = normalizeBoundarySegments(config.boundaryStyles?.[id]?.segments, fallback);
    const segments = Array.from({ length: cleanCount }, (_, index) => {
      const source = current[index] || fallback;
      return {
        from: index / cleanCount,
        to: (index + 1) / cleanCount,
        style: normalizeMarkingStyle(source.style || fallback.style),
        width: widthOr(source.width, fallback.width, 1, 16)
      };
    });
    config.boundaryStyles = normalizeBoundaryStyles({
      ...(config.boundaryStyles || {}),
      [id]: {
        ...fallback,
        segments
      }
    });
  }

  function handleEditTap(model, pointValue) {
    const barrierHit = barrierHitInfo(model, pointValue);
    if (barrierHit?.barrier) {
      Kroki.EditorObjectManager?.updateModel?.(model.id, (draft) => {
        const config = roadConfig(draft);
        const barrier = barrierById(config, barrierHit.barrier.id);
        const section = barrier?.sectionId ? crossSection(config).sections.find((item) => item.id === barrier.sectionId) : null;
        const metadata = { ...(draft.metadata || {}) };
        metadata.roadBarrierEdit = { id: barrierHit.barrier.id };
        delete metadata.roadBoundaryEdit;
        delete metadata.roadPocketEdit;
        delete metadata.roadPocketIslandEdit;
        if (section) metadata.roadSelection = sectionInfoFromSection(section);
        return { ...draft, metadata };
      }, { skipHistory: true });
      return true;
    }
    const pocketIslandHit = pocketIslandHitInfo(model, pointValue);
    if (pocketIslandHit) {
      Kroki.EditorObjectManager?.updateModel?.(model.id, (draft) => {
        const metadata = { ...(draft.metadata || {}), roadPocketIslandEdit: { side: pocketIslandHit.side } };
        delete metadata.roadSelection;
        delete metadata.roadBoundaryEdit;
        delete metadata.roadBarrierEdit;
        delete metadata.roadPocketEdit;
        return { ...draft, metadata };
      }, { skipHistory: true });
      return true;
    }
    const pocketHit = pocketHitInfo(model, pointValue);
    if (pocketHit) {
      Kroki.EditorObjectManager?.updateModel?.(model.id, (draft) => {
        const metadata = { ...(draft.metadata || {}), roadPocketEdit: { side: pocketHit.side } };
        delete metadata.roadSelection;
        delete metadata.roadBoundaryEdit;
        delete metadata.roadBarrierEdit;
        delete metadata.roadPocketIslandEdit;
        return { ...draft, metadata };
      }, { skipHistory: true });
      return true;
    }
    const section = sectionAtPoint(model, pointValue);
    const nextSelection = section ? {
      sectionId: section.sectionId,
      laneId: section.laneId || "",
      role: section.role,
      startBoundaryId: section.startBoundaryId,
      endBoundaryId: section.endBoundaryId,
      startBoundaryRole: section.startBoundaryRole,
      endBoundaryRole: section.endBoundaryRole
    } : null;
    Kroki.EditorObjectManager?.updateModel?.(model.id, (draft) => {
      const metadata = { ...(draft.metadata || {}) };
      if (nextSelection) {
        metadata.roadSelection = nextSelection;
        const key = activeBoundaryKey(draft);
        if (key) metadata.roadBoundaryEdit = boundaryEditForSection(key, nextSelection);
      } else {
        delete metadata.roadSelection;
        delete metadata.roadBoundaryEdit;
      }
      delete metadata.roadBarrierEdit;
      delete metadata.roadPocketEdit;
      delete metadata.roadPocketIslandEdit;
      return { ...draft, metadata };
    }, { skipHistory: true });
    return true;
  }

  const adapter = {
    elementTag: "g",
    className: "editor-road",
    capabilities: { arrows: false, fill: false, curvedLabel: false, ownsLabel: true, noText: true, roadObject: true },

    create(initialData = {}) {
      const geometry = normalizeGeometry(initialData.geometry || initialData);
      const metadata = {
        ...(initialData.metadata || {}),
        road: normalizeRoadConfig(initialData.metadata?.road || initialData.road || {})
      };
      return {
        type: "road",
        geometry,
        style: initialData.style,
        label: initialData.label,
        metadata
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "road",
        geometry: normalizeGeometry(safeParseJson(element.dataset.roadGeometry, {})),
        style: styleManager.readStyleFromElement(element, "road"),
        label: styleManager.readLabelFromElement(element, "road"),
        metadata: {
          road: normalizeRoadConfig(safeParseJson(element.dataset.roadConfig, {}))
        }
      };
    },

    render(model, element) {
      const config = roadConfig(model);
      const section = crossSection(config);
      element.dataset.roadGeometry = JSON.stringify(normalizeGeometry(model.geometry));
      element.dataset.roadConfig = JSON.stringify(config);
      element.replaceChildren();
      renderSurface(model, element, section);
      renderSelectedSection(model, element, section);
      renderSelectedPocket(model, element, config);
      section.boundaries.forEach((boundary) => addBoundaryLine(element, model, boundary, config));
      renderActiveBoundaryEdit(model, element, section, config);
      renderBarriers(model, element, config);
      element.removeAttribute("transform");
    },

    hitTest(model, pointValue, tolerance) {
      if (barrierHitInfo(model, pointValue, tolerance)) return true;
      if (pocketIslandHitInfo(model, pointValue)) return true;
      if (pocketHitInfo(model, pointValue, tolerance)) return true;
      if (isIslandGeometry(model?.geometry)) {
        const center = point(model.geometry.center);
        const radii = islandRadii(model.geometry);
        const distance = Math.hypot(pointValue.x - center.x, pointValue.y - center.y);
        return distance >= radii.innerRadius - tolerance && distance <= radii.outerRadius + tolerance;
      }
      const section = crossSection(roadConfig(model));
      return distanceToCenterline(model, pointValue) <= section.totalWidth / 2 + tolerance;
    },

    getControlPoints(model, metrics, mode) {
      if (selectedPocketIslandSide(model)) return [];
      const pocketPoints = selectedPocketControlPoints(model, metrics, mode);
      if (pocketPoints.length) return pocketPoints;
      const barrierPoints = selectedBarrierControlPoints(model, metrics, mode);
      if (barrierPoints.length) return barrierPoints;
      if (isIslandGeometry(model?.geometry)) {
        const center = point(model.geometry.center);
        const radii = islandRadii(model.geometry);
        return [
          { id: "island-inner", x: center.x - radii.innerRadius, y: center.y, role: "curve", cursor: "ew-resize" },
          { id: "island-outer", x: center.x + radii.outerRadius, y: center.y, role: "curve", cursor: "ew-resize" },
          ...segmentBoundaryControlPoints(model, metrics, mode)
        ];
      }
      const points = [
        { id: "start", ...endpointHandlePoint(model, "start", metrics.endpointOffset), role: "move", cursor: "grab" },
        { id: "end", ...endpointHandlePoint(model, "end", metrics.endpointOffset), role: "move", cursor: "grab" }
      ];
      if (model.geometry.profile === ARC) points.push({ id: "arc", ...arcControlPoint(model), role: "curve", cursor: "grab" });
      if (model.geometry.profile === S_CURVE) {
        cleanSCurveControls(model.geometry).forEach((control, index) => {
          points.push({ id: `sctrl-${index}`, ...control, role: "curve", cursor: "grab" });
        });
      }
      points.push(...segmentBoundaryControlPoints(model, metrics, mode));
      return points;
    },

    beginControlPointMove(model, cpId, pointValue) {
      return { cpId, point: pointValue, geometry: utils.clonePlain(model.geometry), road: roadConfig(model) };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      if (movePocketControlPoint(model, cpId, worldPoint, modifiers)) return;
      if (moveBarrierControlPoint(model, cpId, worldPoint, modifiers)) return;
      if (isIslandGeometry(model?.geometry)) {
        if (cpId === "island-inner" || cpId === "island-outer") {
          const center = point(model.geometry.center);
          const distance = Math.hypot(worldPoint.x - center.x, worldPoint.y - center.y);
          if (cpId === "island-inner") setIslandInnerDiameter(model, distance * 2);
          else setIslandOuterDiameter(model, distance * 2);
          return;
        }
      }
      if (moveSegmentBoundaryPoint(model, cpId, worldPoint, modifiers)) return;
      if (cpId === "arc") {
        const basisValue = arcBasis(model.geometry.start, model.geometry.end);
        model.geometry.ratio = basisValue ? arcRatioFromPoint(basisValue, worldPoint) : DEFAULT_ARC_RATIO;
        return;
      }
      const sControlMatch = String(cpId || "").match(/^sctrl-(\d+)$/);
      if (sControlMatch && model.geometry.profile === S_CURVE) {
        const index = Number(sControlMatch[1]);
        const controls = cleanSCurveControls(model.geometry);
        if (controls[index]) {
          controls[index] = { x: worldPoint.x, y: worldPoint.y };
          model.geometry.controls = controls;
          syncLegacySCurveControls(model.geometry);
        }
        return;
      }
      if ((cpId === "c1" || cpId === "c2") && model.geometry.profile === S_CURVE) {
        const index = cpId === "c1" ? 0 : 1;
        const controls = cleanSCurveControls(model.geometry);
        if (controls[index]) {
          controls[index] = { x: worldPoint.x, y: worldPoint.y };
          model.geometry.controls = controls;
          syncLegacySCurveControls(model.geometry);
        }
        return;
      }
      moveGeometryPoint(model, cpId, worldPoint, modifiers);
    },

    move(model, dx, dy) {
      moveAllPoints(model, dx, dy);
    },

    getBounds(model) {
      return roadBounds(model);
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("path", { class: "editor-object-selection editor-road-selection" });
    },

    renderSelection(element, model, style, mode) {
      const config = roadConfig(model);
      const section = crossSection(config);
      const pocketPaths = activePocketGeometries(model, config).map((geometry) => pocketBandPathData(geometry));
      element.setAttribute("d", [surfacePathData(model, section.totalWidth), ...pocketPaths].filter(Boolean).join(" "));
      if (isIslandGeometry(model?.geometry)) element.setAttribute("fill-rule", "evenodd");
      else element.removeAttribute("fill-rule");
      element.setAttribute("stroke-width", "4");
      element.setAttribute("stroke-linejoin", "round");
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    pointAt,
    normalizeRoadConfig,
    roadConfig,
    normalizeMarkingStyle,
    previewSurfacePathData,
    pocketMode,
    setPocketMode,
    intersectionAuxiliaryContours,
    selectedPocketIslandInfo,
    updatePocketIslandStyle,
    selectedSectionInfo,
    selectedLaneInfo: selectedSectionInfo,
    selectedBarrierInfo,
    barrierTargetsForSelection: outerBarrierTargets,
    addBarrierToConfig,
    setBarrierAttached,
    setBarrierSpacing,
    cycleBarrierEndCaps,
    removeBarrierFromConfig,
    clearBarrierSelection,
    sectionAtPoint,
    laneAtPoint: sectionAtPoint,
    setSectionWidth,
    setLaneWidth,
    setBoundarySegment,
    setBoundarySegmentCount,
    setBoundarySegmentSplit,
    setProfile,
    reflectAcrossBoundsXAxis,
    reflectAcrossBoundsYAxis,
    setSCurveControlCount,
    sCurveControlCount,
    isIsland(model) { return isIslandGeometry(model?.geometry); },
    setIslandLaneCount,
    setIslandLaneWidth,
    setIslandSectionWidth,
    setIslandInnerDiameter,
    setIslandOuterDiameter,
    handleEditTap,
    offsetPathData,
    offsetPathDataRange,
    surfacePathData,
    crossSection,
    tangentAt,
    midpointTangentAngle(model, reverse = false) {
      const tangent = tangentAt(model, 0.5);
      const angle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
      return reverse ? angle + 180 : angle;
    }
  };

  registry.register("road", adapter);
})();
