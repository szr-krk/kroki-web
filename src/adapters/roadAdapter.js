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
  const SAMPLE_COUNT = 64;
  const MIN_WIDTH = 2;
  const MAX_LANES = 5;
  const DEFAULT_ARC_RATIO = Math.tan((36 * Math.PI / 180) / 2);
  const ROAD_LINE_COLOR = "#000000";

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
    if (value === ARC || value === S_CURVE) return value;
    return STRAIGHT;
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

  function defaultSCurveControls(start, end) {
    const dir = direction(start, end);
    const normal = { x: -dir.y, y: dir.x };
    const bow = Math.max(50, Math.min(160, dir.length * 0.22));
    return {
      c1: {
        x: start.x + dir.x * dir.length / 3 + normal.x * bow,
        y: start.y + dir.y * dir.length / 3 + normal.y * bow
      },
      c2: {
        x: start.x + dir.x * dir.length * 2 / 3 - normal.x * bow,
        y: start.y + dir.y * dir.length * 2 / 3 - normal.y * bow
      }
    };
  }

  function normalizeGeometry(input = {}) {
    const start = point(input.start, { x: 360, y: 360 });
    const end = point(input.end, { x: start.x + 360, y: start.y });
    const rawProfile = input.profile;
    const profile = rawProfile === "curve" ? ARC : normalizeProfile(rawProfile);
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
      const controls = defaultSCurveControls(start, end);
      geometry.c1 = point(input.c1, controls.c1);
      geometry.c2 = point(input.c2, controls.c2);
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

  function roadConfig(model) {
    return normalizeRoadConfig(model?.metadata?.road || {});
  }

  function pointAt(model, t) {
    const geometry = model.geometry;
    if (geometry.profile === ARC) return arcPointAt(model, t);
    if (geometry.profile === S_CURVE) {
      const p01 = lerp(geometry.start, geometry.c1, t);
      const p12 = lerp(geometry.c1, geometry.c2, t);
      const p23 = lerp(geometry.c2, geometry.end, t);
      return lerp(lerp(p01, p12, t), lerp(p12, p23, t), t);
    }
    return lerp(geometry.start, geometry.end, t);
  }

  function tangentAt(model, t) {
    const geometry = model.geometry;
    if (geometry.profile === ARC) return arcTangentAt(model, t);
    if (geometry.profile === S_CURVE) {
      return {
        x: 3 * (1 - t) * (1 - t) * (geometry.c1.x - geometry.start.x)
          + 6 * (1 - t) * t * (geometry.c2.x - geometry.c1.x)
          + 3 * t * t * (geometry.end.x - geometry.c2.x),
        y: 3 * (1 - t) * (1 - t) * (geometry.c1.y - geometry.start.y)
          + 6 * (1 - t) * t * (geometry.c2.y - geometry.c1.y)
          + 3 * t * t * (geometry.end.y - geometry.c2.y)
      };
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
    return pathFromPoints(points);
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
    return pathFromPoints(points);
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
    const samples = samplesFor(model);
    const half = width / 2;
    const left = samples.map((sample) => offsetSample(sample, half));
    const right = samples.slice().reverse().map((sample) => offsetSample(sample, -half));
    return [...left, ...right];
  }

  function surfacePathData(model, width) {
    return pathFromPoints(surfaceOutline(model, width), true);
  }

  function bandPathData(model, startOffset, endOffset) {
    const samples = samplesFor(model);
    const left = samples.map((sample) => offsetSample(sample, endOffset));
    const right = samples.slice().reverse().map((sample) => offsetSample(sample, startOffset));
    return pathFromPoints([...left, ...right], true);
  }

  function addWidth(sections, width, role, options = {}) {
    const cleanWidth = widthOr(width, 0, 0, 300);
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
      addStyledLine(parent, model, boundary.offset, boundaryStyle(config, boundary, fallbackBoundaryStyle(config, boundary)), boundaryClassName(boundary));
    }
  }

  function addStyledLine(parent, model, offset, marking, className) {
    const segments = marking.segments?.length ? marking.segments : [{ from: 0, to: 1, style: marking.style, width: marking.width }];
    const drawSegment = (lineOffset, segment, dashed) => {
      const path = addPath(parent, className, offsetPathDataRange(model, lineOffset, segment.from, segment.to));
      if (path) strokeAttributes(path, ROAD_LINE_COLOR, segment.width, dashed ? "18 14" : "");
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
    const surface = addPath(element, "editor-road-surface", surfacePathData(model, section.totalWidth));
    surface.setAttribute("fill", "#ffffff");
    surface.setAttribute("stroke", "none");
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
      model.geometry.c1 = startState.geometry.c1;
      model.geometry.c2 = startState.geometry.c2;
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
    ["start", "end", "c1", "c2"].forEach((key) => {
      if (!model.geometry[key]) return;
      model.geometry[key].x += dx;
      model.geometry[key].y += dy;
    });
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
      const section = crossSection(roadConfig(model));
      return distanceToCenterline(model, pointValue) <= section.totalWidth / 2 + tolerance;
    },

    getControlPoints(model, metrics, mode) {
      const points = [
        { id: "start", ...endpointHandlePoint(model, "start", metrics.endpointOffset), role: "move", cursor: "grab" },
        { id: "end", ...endpointHandlePoint(model, "end", metrics.endpointOffset), role: "move", cursor: "grab" }
      ];
      if (model.geometry.profile === ARC) points.push({ id: "arc", ...arcControlPoint(model), role: "curve", cursor: "grab" });
      if (model.geometry.profile === S_CURVE) {
        points.push(
          { id: "c1", ...model.geometry.c1, role: "curve", cursor: "grab" },
          { id: "c2", ...model.geometry.c2, role: "curve", cursor: "grab" }
        );
      }
      points.push(...segmentBoundaryControlPoints(model, metrics, mode));
      return points;
    },

    beginControlPointMove(model, cpId, pointValue) {
      return { cpId, point: pointValue, geometry: utils.clonePlain(model.geometry), road: roadConfig(model) };
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      if (moveSegmentBoundaryPoint(model, cpId, worldPoint, modifiers)) return;
      if (cpId === "arc") {
        const basisValue = arcBasis(model.geometry.start, model.geometry.end);
        model.geometry.ratio = basisValue ? arcRatioFromPoint(basisValue, worldPoint) : DEFAULT_ARC_RATIO;
        return;
      }
      if (cpId === "c1" || cpId === "c2") {
        model.geometry[cpId] = { x: worldPoint.x, y: worldPoint.y };
        return;
      }
      moveGeometryPoint(model, cpId, worldPoint, modifiers);
    },

    move(model, dx, dy) {
      moveAllPoints(model, dx, dy);
    },

    getBounds(model) {
      const section = crossSection(roadConfig(model));
      return boundsFromPoints(surfaceOutline(model, section.totalWidth));
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
      element.setAttribute("stroke-width", "4");
      element.setAttribute("stroke-linejoin", "round");
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    pointAt,
    normalizeRoadConfig,
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
    handleEditTap,
    offsetPathData,
    midpointTangentAngle(model, reverse = false) {
      const tangent = tangentAt(model, 0.5);
      const angle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
      return reverse ? angle + 180 : angle;
    }
  };

  registry.register("road", adapter);
})();
