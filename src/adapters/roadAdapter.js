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
  const MIN_WIDTH = 2;
  const MAX_LANES = 5;
  const DEFAULT_ARC_RATIO = Math.tan((36 * Math.PI / 180) / 2);
  const ROAD_LINE_COLOR = "#000000";
  const MIN_S_CURVE_CONTROLS = 2;
  const MAX_S_CURVE_CONTROLS = 5;
  const DEFAULT_ISLAND_INNER_DIAMETER = 160;
  const DEFAULT_ISLAND_LANE_COUNT = 1;
  const DEFAULT_ISLAND_LANE_WIDTH = 50;
  const MIN_ISLAND_INNER_DIAMETER = 20;
  const MIN_ISLAND_LANE_WIDTH = 10;
  const MAX_ISLAND_DIAMETER = 1600;

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

  function catmullRomPoint(p0, p1, p2, p3, u) {
    const u2 = u * u;
    const u3 = u2 * u;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3)
    };
  }

  function catmullRomTangent(p0, p1, p2, p3, u) {
    const u2 = u * u;
    return {
      x: 0.5 * ((-p0.x + p2.x) + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u + 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u2),
      y: 0.5 * ((-p0.y + p2.y) + 2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u + 3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u2)
    };
  }

  function extrapolateBefore(a, b) {
    return { x: a.x + (a.x - b.x), y: a.y + (a.y - b.y) };
  }

  function extrapolateAfter(a, b) {
    return { x: b.x + (b.x - a.x), y: b.y + (b.y - a.y) };
  }

  function sCurvePointAt(geometry, t) {
    const points = sCurveThroughPoints(geometry);
    if (points.length < 2) return points[0] || { x: 0, y: 0 };
    if (points.length === 2) return lerp(points[0], points[1], t);
    const info = sCurveSegmentInfo(points, t);
    const i = info.index;
    const p1 = points[i];
    const p2 = points[i + 1] || p1;
    const p0 = points[i - 1] || extrapolateBefore(p1, p2);
    const p3 = points[i + 2] || extrapolateAfter(p1, p2);
    return catmullRomPoint(p0, p1, p2, p3, info.u);
  }

  function sCurveTangentAt(geometry, t) {
    const points = sCurveThroughPoints(geometry);
    if (points.length < 2) return { x: 1, y: 0 };
    if (points.length === 2) return { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
    const info = sCurveSegmentInfo(points, t);
    const i = info.index;
    const p1 = points[i];
    const p2 = points[i + 1] || p1;
    const p0 = points[i - 1] || extrapolateBefore(p1, p2);
    const p3 = points[i + 2] || extrapolateAfter(p1, p2);
    const tangent = catmullRomTangent(p0, p1, p2, p3, info.u);
    if (Math.hypot(tangent.x, tangent.y) < 0.001) {
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

  function normalizeRoadConfig(source = {}) {
    const base = DEFAULT_ROAD_CONFIG;
    const laneCount = clampInt(source.laneCount, 1, MAX_LANES, base.laneCount);
    const laneWidth = widthOr(source.laneWidth, base.laneWidth, 10, 180);
    return {
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
      autoIntersection: boolOr(source.autoIntersection, base.autoIntersection),
      bridge: boolOr(source.bridge, base.bridge),
      segments: normalizeSegments(source.segments)
    };
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

  function samplesFor(model) {
    const samples = [];
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const t = index / SAMPLE_COUNT;
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

  function offsetPathData(model, offset = 0, reverse = false) {
    const points = samplesFor(model).map((sample) => offsetSample(sample, offset));
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

  function surfaceOutline(model, width) {
    if (isIslandGeometry(model?.geometry)) {
      const center = point(model.geometry.center);
      const radii = islandRadii(model.geometry);
      return circlePoints(center, radii.outerRadius, false, SAMPLE_COUNT);
    }
    const samples = samplesFor(model);
    const half = width / 2;
    const left = samples.map((sample) => offsetSample(sample, half));
    const right = samples.slice().reverse().map((sample) => offsetSample(sample, -half));
    return [...left, ...right];
  }

  function islandRingPathData(model) {
    const center = point(model.geometry.center);
    const radii = islandRadii(model.geometry);
    const outer = circlePoints(center, radii.outerRadius, false, SAMPLE_COUNT);
    const inner = circlePoints(center, radii.innerRadius, true, SAMPLE_COUNT);
    return pathFromPoints(outer, true) + " " + pathFromPoints(inner, true);
  }

  function surfacePathData(model, width) {
    if (isIslandGeometry(model?.geometry)) return islandRingPathData(model);
    return pathFromPoints(surfaceOutline(model, width), true);
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

  function shouldSkipRoadBoundary(model, boundary) {
    const engine = Kroki.RoadIntersectionEngine;
    const isOuterEdge = boundary?.role === "edge" && (!boundary.before || !boundary.after);
    // Kavşakta sadece yolun gerçek dış sınır edge'leri iptal edilir.
    // Banket/shoulder ile taşıt yolu arasındaki iç edge çizgileri banket çizgisi olarak kalmalıdır.
    return Boolean(isOuterEdge && engine?.isRoadMember?.(model.id));
  }

  function addStyledLine(parent, model, offset, marking, className, boundary = null) {
    if (shouldSkipRoadBoundary(model, boundary)) return;
    const segments = marking.segments?.length ? marking.segments : [{ from: 0, to: 1, style: marking.style, width: marking.width }];
    const drawSegment = (lineOffset, segment, dashed) => {
      intersectionVisibleRanges(model, lineOffset, segment.from, segment.to, boundary).forEach((range) => {
        if (!range || range.to <= range.from) return;
        const path = addPath(parent, className, offsetPathDataRange(model, lineOffset, range.from, range.to));
        if (path) {
          strokeAttributes(path, ROAD_LINE_COLOR, segment.width, dashed ? "18 14" : "");
          path.dataset.visibleFrom = String(range.from);
          path.dataset.visibleTo = String(range.to);
        }
      });
    };
    segments.forEach((segment) => {
      if (segment.style === "none") return;
      const gap = Math.max(4, segment.width * 2);
      if (segment.style === "doubleSolid" || segment.style === "doubleDash") {
        const dashed = segment.style === "doubleDash";
        drawSegment(offset - gap / 2, segment, dashed);
        drawSegment(offset + gap / 2, segment, dashed);
        return;
      }
      if (segment.style === "leftSolidRightDash") {
        drawSegment(offset + gap / 2, segment, false);
        drawSegment(offset - gap / 2, segment, true);
        return;
      }
      if (segment.style === "rightSolidLeftDash") {
        drawSegment(offset - gap / 2, segment, false);
        drawSegment(offset + gap / 2, segment, true);
        return;
      }
      drawSegment(offset, segment, Boolean(dashForStyle(segment.style)));
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
    config.boundaryStyles = boundaryStyles;
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
    delete metadata.roadSelection;
    delete metadata.roadBoundaryEdit;
    model.metadata = metadata;
    return model;
  }

  function roadBounds(model) {
    if (isIslandGeometry(model?.geometry)) {
      const center = point(model.geometry.center);
      const radii = islandRadii(model.geometry);
      return { x: center.x - radii.outerRadius, y: center.y - radii.outerRadius, width: radii.outerRadius * 2, height: radii.outerRadius * 2 };
    }
    const section = crossSection(roadConfig(model));
    return boundsFromPoints(surfaceOutline(model, section.totalWidth));
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
      section.boundaries.forEach((boundary) => addBoundaryLine(element, model, boundary, config));
      renderActiveBoundaryEdit(model, element, section, config);
      element.removeAttribute("transform");
    },

    hitTest(model, pointValue, tolerance) {
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
      const section = crossSection(roadConfig(model));
      element.setAttribute("d", surfacePathData(model, section.totalWidth));
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
    selectedSectionInfo,
    selectedLaneInfo: selectedSectionInfo,
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
