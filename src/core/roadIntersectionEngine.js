(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  if (!utils || !manager?.canvas || !manager?.objectLayer) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const SAMPLE_COUNT = 96;
  const CLIP_SAMPLE_COUNT = 120;
  const MIN_POINT_DISTANCE = 0.35;
  const DEFAULT_LINE_STROKE_WIDTH = 2;
  const INTERSECTION_PAD = 1.5;
  const SMOOTH_RADIUS = 18;
  const MIN_SMOOTH_ANGLE_DEG = 24;
  const MAX_SMOOTH_ANGLE_DEG = 158;
  const SNAP_TOLERANCE = 1.15;
  const EPS = 1e-7;
  const CONTOUR_MASK_DEFS_ID = "roadIntersectionMaskDefs";
  const CONTOUR_MASK_ID = "roadIntersectionContourMask";

  let debug = false;
  let suspended = false;
  let scheduled = 0;
  let patchDone = false;
  let renderingRoads = false;
  let lastRoadSurfaces = [];
  let lastOuterContours = [];
  let lastIntersectionShapes = [];
  let lastSmoothedContours = [];
  let lastOuterBoundarySegments = [];
  let lastMemberIds = new Set();
  let lastQSegments = [];
  let visibleRangeCache = new Map();
  let selectedQKey = "";
  let qEndpointEdits = new Map();
  let qEndpointDrag = null;
  let qMetricSyncFrame = 0;
  let lastDiagnostics = null;
  let dirtyRoadIds = new Set();
  let fullRoadRerenderNeeded = true;
  let laneSplitTerminals = new Map();
  let laneSplitSiblingRegions = new Map();
  const roadSurfaceCache = new Map();

  function createSvgElement(tag, attrs = {}) {
    if (utils?.createSvgElement) return utils.createSvgElement(tag, attrs);
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function isRoadObjectNode(node) {
    return Boolean(node?.dataset?.krokiObject === "true" && node.dataset.shape === "road");
  }

  function isIntersectionLayerNode(node) {
    return Boolean(node?.dataset?.roadIntersectionLayer === "true");
  }

  function firstNonRoadObjectNode() {
    const parent = manager.objectLayer || manager.canvas;
    return Array.from(parent.children || []).find((node) => {
      if (isIntersectionLayerNode(node)) return false;
      return !isRoadObjectNode(node);
    }) || null;
  }

  function placeLayerInRoadStack(layer) {
    const parent = manager.objectLayer || manager.canvas;
    if (!layer || !parent) return layer;

    // Kavşak dış contour'u ayrı bir canvas sibling'i olursa editorObjects'in üstünde kalır.
    // Bu durumda sonradan çizilen rectangle/circle/text gibi normal objeler bile contour'un
    // altında kalır ve karışık görüntü oluşur. Layer'ı editorObjects içine, yol objelerinin
    // hemen arkasına/üstüne fakat diğer objelerin altına yerleştiriyoruz:
    // road objects -> roadIntersectionContourLayer -> rectangle/text/other objects -> edit layer.
    const reference = firstNonRoadObjectNode();
    if (layer.parentNode !== parent) {
      parent.insertBefore(layer, reference);
      return layer;
    }
    if (reference && layer.nextSibling !== reference) parent.insertBefore(layer, reference);
    else if (!reference && layer.parentNode.lastChild !== layer) parent.append(layer);
    return layer;
  }

  function ensureLayer(id) {
    let layer = manager.canvas.querySelector("#" + id);
    if (!layer) {
      layer = createSvgElement("g", {
        id,
        class: "road-intersection-layer",
        "data-road-intersection-layer": "true",
        "pointer-events": "none"
      });
      layer.style.pointerEvents = "none";
    }
    return placeLayerInRoadStack(layer);
  }

  function contourLayer() {
    return ensureLayer("roadIntersectionContourLayer");
  }

  function ensureContourMaskDefs() {
    let defs = manager.canvas.querySelector("#" + CONTOUR_MASK_DEFS_ID);
    if (defs) return defs;
    defs = createSvgElement("defs", { id: CONTOUR_MASK_DEFS_ID });
    manager.canvas.insertBefore(defs, manager.canvas.firstChild);
    return defs;
  }

  function clearContourMask(layer = contourLayer()) {
    layer?.removeAttribute?.("mask");
    const mask = manager.canvas.querySelector("#" + CONTOUR_MASK_ID);
    const defs = mask?.parentNode;
    mask?.remove();
    if (defs?.id === CONTOUR_MASK_DEFS_ID && !defs.children.length) defs.remove();
  }

  function updateContourMask(layer, surfaces = []) {
    const islandCenters = (surfaces || [])
      .map((surface) => surface?.islandCenterMask)
      .filter((item) => item && Number.isFinite(item.cx) && Number.isFinite(item.cy) && item.radius > 0.5);
    if (!islandCenters.length) {
      clearContourMask(layer);
      return;
    }

    const surfacePoints = (surfaces || []).flatMap((surface) => surface?.polygon || []);
    const surfaceBounds = boundsOfPoints(surfacePoints);
    const viewBox = manager.canvas.viewBox?.baseVal;
    const minX = Math.min(surfaceBounds?.minX ?? 0, Number(viewBox?.x) || 0);
    const minY = Math.min(surfaceBounds?.minY ?? 0, Number(viewBox?.y) || 0);
    const maxX = Math.max(surfaceBounds?.maxX ?? 1, (Number(viewBox?.x) || 0) + Math.max(1, Number(viewBox?.width) || 1));
    const maxY = Math.max(surfaceBounds?.maxY ?? 1, (Number(viewBox?.y) || 0) + Math.max(1, Number(viewBox?.height) || 1));
    const pad = Math.max(100, (maxX - minX) * 0.1, (maxY - minY) * 0.1);
    const x = minX - pad;
    const y = minY - pad;
    const width = Math.max(1, maxX - minX + pad * 2);
    const height = Math.max(1, maxY - minY + pad * 2);

    const defs = ensureContourMaskDefs();
    let mask = defs.querySelector("#" + CONTOUR_MASK_ID);
    if (!mask) {
      mask = createSvgElement("mask", {
        id: CONTOUR_MASK_ID,
        maskUnits: "userSpaceOnUse",
        maskContentUnits: "userSpaceOnUse",
        "mask-type": "luminance"
      });
      defs.append(mask);
    }
    mask.setAttribute("x", String(x));
    mask.setAttribute("y", String(y));
    mask.setAttribute("width", String(width));
    mask.setAttribute("height", String(height));
    mask.replaceChildren(
      createSvgElement("rect", { x: String(x), y: String(y), width: String(width), height: String(height), fill: "#ffffff" }),
      ...islandCenters.map((item) => createSvgElement("circle", {
        cx: String(item.cx),
        cy: String(item.cy),
        r: String(item.radius),
        fill: "#000000"
      }))
    );
    layer.setAttribute("mask", `url(#${CONTOUR_MASK_ID})`);
  }

  function clearClasses(ids = lastMemberIds) {
    ids.forEach((id) => manager.getElement?.(id)?.classList.remove("is-road-intersection-member"));
  }

  function clearLayer() {
    const layer = contourLayer();
    layer.replaceChildren();
    clearContourMask(layer);
  }

  function clear(options = {}) {
    clearLayer();
    if (options.classes !== false) clearClasses();
    lastRoadSurfaces = [];
    lastOuterContours = [];
    lastIntersectionShapes = [];
    lastSmoothedContours = [];
    lastOuterBoundarySegments = [];
    lastMemberIds = new Set();
    lastQSegments = [];
    visibleRangeCache = new Map();
    selectedQKey = "";
    qEndpointEdits = new Map();
    laneSplitTerminals = new Map();
    laneSplitSiblingRegions = new Map();
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function widthOr(value, fallback) {
    return Math.max(0, numberOr(value, fallback));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roadConfig(model) {
    const adapter = manager.getAdapter?.(model);
    const raw = model?.metadata?.road || {};
    if (typeof adapter?.roadConfig === "function") return adapter.roadConfig(model, raw);
    return adapter?.normalizeRoadConfig?.(raw) || raw || {};
  }

  function roadStrokeWidth(config = {}) {
    const edgeWidth = Number(config.edgeLine?.width);
    const markingWidth = Number(config.marking?.width);
    const value = Number.isFinite(markingWidth) ? markingWidth : (Number.isFinite(edgeWidth) ? edgeWidth : DEFAULT_LINE_STROKE_WIDTH);
    return clamp(value, 1, 16);
  }

  function contourStrokeWidth(surfaces = []) {
    const widths = (surfaces || [])
      .map((surface) => roadStrokeWidth(surface?.config || {}))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (!widths.length) return DEFAULT_LINE_STROKE_WIDTH;
    return widths[Math.floor(widths.length / 2)];
  }

  function normalizeContourLineStyle(value) {
    const allowed = new Set(["solid", "dash", "leftSolidRightDash", "rightSolidLeftDash", "doubleSolid", "doubleDash", "none"]);
    return allowed.has(value) ? value : "solid";
  }

  function contourLineWidth(value, fallback = DEFAULT_LINE_STROKE_WIDTH) {
    return clamp(widthOr(value, fallback), 1, 16);
  }

  function normalizeContourSegments(source, fallback) {
    const base = {
      style: normalizeContourLineStyle(fallback?.style || "solid"),
      width: contourLineWidth(fallback?.width, DEFAULT_LINE_STROKE_WIDTH)
    };
    const list = Array.isArray(source) && source.length ? source : [{ from: 0, to: 1, style: base.style, width: base.width }];
    return list.slice(0, 8).map((segment, index, all) => {
      const defaultFrom = index / all.length;
      const defaultTo = (index + 1) / all.length;
      return {
        from: clamp(numberOr(segment?.from, defaultFrom), 0, 1),
        to: clamp(numberOr(segment?.to, defaultTo), 0, 1),
        style: normalizeContourLineStyle(segment?.style || base.style),
        width: contourLineWidth(segment?.width, base.width)
      };
    }).filter((segment) => segment.to > segment.from);
  }

  function contourBoundaryStyle(config = {}, boundaryId = "") {
    const edgeEnabled = config.edgeLine?.enabled !== false;
    const base = {
      style: edgeEnabled ? "solid" : "none",
      width: contourLineWidth(config.edgeLine?.width, DEFAULT_LINE_STROKE_WIDTH)
    };
    const override = config.boundaryStyles?.[boundaryId];
    const own = {
      style: normalizeContourLineStyle(override?.style || base.style),
      width: contourLineWidth(override?.width, base.width)
    };
    return {
      ...own,
      segments: normalizeContourSegments(override?.segments, own)
    };
  }

  function totalRoadWidth(config = {}) {
    if (config.divided) {
      const left = Array.isArray(config.dividedLaneWidths?.left) ? config.dividedLaneWidths.left : [];
      const right = Array.isArray(config.dividedLaneWidths?.right) ? config.dividedLaneWidths.right : [];
      let total = 0;
      right.forEach((width) => { total += widthOr(width, config.laneWidth || 50); });
      if (config.innerShoulder?.enabled) total += widthOr(config.innerShoulder.width, 15);
      if (config.waterChannel?.enabled) total += widthOr(config.waterChannel.width, 30);
      if (config.innerShoulder?.enabled) total += widthOr(config.innerShoulder.width, 15);
      left.forEach((width) => { total += widthOr(width, config.laneWidth || 50); });
      if (config.rightShoulder?.enabled) total += widthOr(config.rightShoulder.width, 20);
      if (config.leftShoulder?.enabled) total += widthOr(config.leftShoulder.width, 20);
      return Math.max(2, total);
    }
    const lanes = Array.isArray(config.laneWidths) && config.laneWidths.length
      ? config.laneWidths
      : Array.from({ length: Math.max(1, Math.round(numberOr(config.laneCount, 2))) }, () => config.laneWidth || 50);
    let total = lanes.reduce((sum, width) => sum + widthOr(width, config.laneWidth || 50), 0);
    if (config.rightShoulder?.enabled) total += widthOr(config.rightShoulder.width, 20);
    if (config.leftShoulder?.enabled) total += widthOr(config.leftShoulder.width, 20);
    return Math.max(2, total);
  }

  function dist(a, b) {
    return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
  }

  function normalizeVector(v) {
    const length = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / length, y: v.y / length };
  }

  function isStraightRoadGeometry(geometry) {
    const profile = geometry?.profile || "straight";
    return profile !== "arc" && profile !== "sCurve" && profile !== "islandRing";
  }

  function addPointIfFar(points, point, tolerance = MIN_POINT_DISTANCE) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const last = points[points.length - 1];
    if (!last || dist(last, point) >= tolerance) points.push({ x: point.x, y: point.y });
  }

  function samplePoint(model, adapter, t, offset = 0) {
    const center = adapter.pointAt?.(model, clamp(t, 0, 1));
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
    let tangent = adapter.tangentAt?.(model, clamp(t, 0, 1));
    if (!tangent || !Number.isFinite(tangent.x) || !Number.isFinite(tangent.y) || Math.hypot(tangent.x, tangent.y) < EPS) {
      const delta = 1 / SAMPLE_COUNT;
      const t0 = clamp(t - delta, 0, 1);
      const t1 = clamp(t + delta, 0, 1);
      const p0 = adapter.pointAt?.(model, t0) || center;
      const p1 = adapter.pointAt?.(model, t1) || center;
      tangent = { x: p1.x - p0.x, y: p1.y - p0.y };
    }
    tangent = normalizeVector(tangent);
    const normal = { x: -tangent.y, y: tangent.x };
    return {
      x: center.x + normal.x * offset,
      y: center.y + normal.y * offset
    };
  }

  function sampleRoad(model, adapter) {
    const samples = [];
    const count = isStraightRoadGeometry(model?.geometry) ? 1 : SAMPLE_COUNT;
    for (let index = 0; index <= count; index += 1) {
      const t = index / count;
      const center = adapter.pointAt?.(model, t);
      if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) continue;
      const step = 1 / Math.max(1, count);
      const t0 = Math.max(0, t - step);
      const t1 = Math.min(1, t + step);
      const p0 = adapter.pointAt?.(model, t0) || center;
      const p1 = adapter.pointAt?.(model, t1) || center;
      const tangent = normalizeVector({ x: p1.x - p0.x, y: p1.y - p0.y });
      const normal = { x: -tangent.y, y: tangent.x };
      samples.push({ t, center, tangent, normal });
    }
    return samples;
  }

  function simplifyPoints(points, tolerance = MIN_POINT_DISTANCE) {
    const result = [];
    (points || []).forEach((point) => addPointIfFar(result, point, tolerance));
    if (result.length > 1 && dist(result[0], result[result.length - 1]) < tolerance) result.pop();
    return result;
  }

  function boundsOfPoints(points) {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    (points || []).forEach((point) => {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    });
    return bounds;
  }

  function boundsOverlap(a, b, pad = 0) {
    return Boolean(a && b && a.minX - pad <= b.maxX && a.maxX + pad >= b.minX && a.minY - pad <= b.maxY && a.maxY + pad >= b.minY);
  }

  function buildSurface(model) {
    const adapter = manager.getAdapter?.(model);
    if (!model || model.type !== "road" || !adapter?.pointAt) return null;
    const config = roadConfig(model);
    const isIsland = model.geometry?.profile === "islandRing" || Boolean(adapter.isIsland?.(model));
    if (config.autoIntersection === false || config.bridge) return null;
    const section = adapter.crossSection?.(config);
    const boundaryCount = Array.isArray(section?.boundaries) ? section.boundaries.length : 0;
    const rightBoundaryId = "b0";
    const leftBoundaryId = boundaryCount > 0 ? "b" + (boundaryCount - 1) : "b1";
    const width = totalRoadWidth(config);
    const half = width / 2;
    const samples = sampleRoad(model, adapter);
    if (samples.length < 2) return null;
    const left = [];
    const right = [];
    samples.forEach((sample) => {
      const widthScale = clamp(numberOr(adapter.widthScaleAt?.(model, sample.t), 1), 0, 1);
      const sampleHalf = half * widthScale;
      addPointIfFar(left, {
        x: sample.center.x + sample.normal.x * sampleHalf,
        y: sample.center.y + sample.normal.y * sampleHalf
      });
      addPointIfFar(right, {
        x: sample.center.x - sample.normal.x * sampleHalf,
        y: sample.center.y - sample.normal.y * sampleHalf
      });
    });
    const terminalCorners = [];
    const terminalCenters = [];
    if (!isIsland && left.length && right.length) {
      terminalCorners.push(left[0], right[0], left[left.length - 1], right[right.length - 1]);
      if (samples[0]?.center) terminalCenters.push(samples[0].center);
      if (samples[samples.length - 1]?.center) terminalCenters.push(samples[samples.length - 1].center);
    }
    const polygon = simplifyPoints([...left, ...right.slice().reverse()]);
    if (polygon.length < 3) return null;
    return {
      id: model.id,
      model,
      config,
      width,
      half,
      samples,
      left,
      right,
      leftCount: left.length,
      isIsland,
      islandCenterMask: isIsland ? {
        cx: numberOr(model.geometry?.center?.x, 0),
        cy: numberOr(model.geometry?.center?.y, 0),
        radius: Math.max(0, numberOr(model.geometry?.innerDiameter, 0) / 2)
      } : null,
      edgeStyles: {
        left: { boundaryId: leftBoundaryId, ...contourBoundaryStyle(config, leftBoundaryId) },
        right: { boundaryId: rightBoundaryId, ...contourBoundaryStyle(config, rightBoundaryId) }
      },
      terminalCorners,
      terminalCenters,
      polygon,
      bounds: boundsOfPoints(polygon)
    };
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const pi = polygon[i];
      const pj = polygon[j];
      const intersect = ((pi.y > point.y) !== (pj.y > point.y))
        && point.x < (pj.x - pi.x) * (point.y - pi.y) / ((pj.y - pi.y) || EPS) + pi.x;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointNearPolygon(point, polygon, tolerance = 1.5) {
    if (!point || !Array.isArray(polygon) || polygon.length < 2) return false;
    if (pointInPolygon(point, polygon)) return true;
    for (let index = 0; index < polygon.length; index += 1) {
      if (distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]) <= tolerance) return true;
    }
    return false;
  }

  function nearestSurfaceSample(surface, point) {
    if (!surface?.samples?.length || !point) return null;
    let best = null;
    surface.samples.forEach((sample) => {
      const distanceValue = dist(point, sample.center);
      if (!best || distanceValue < best.distance) best = { sample, distance: distanceValue };
    });
    return best?.sample || null;
  }

  function signedOffsetOnSurface(surface, point) {
    const sample = nearestSurfaceSample(surface, point);
    if (!sample || !point) return 0;
    return (point.x - sample.center.x) * sample.normal.x + (point.y - sample.center.y) * sample.normal.y;
  }

  function surfaceTerminalEndpoints(surface) {
    if (surface?.isIsland) return [];
    const samples = surface?.samples || [];
    if (samples.length < 2) return [];
    const left = surface?.left || [];
    const right = surface?.right || [];
    return [
      {
        t: 0,
        point: samples[0].center,
        farPoint: samples[samples.length - 1].center,
        corners: [left[0], right[0]].filter(Boolean)
      },
      {
        t: 1,
        point: samples[samples.length - 1].center,
        farPoint: samples[0].center,
        corners: [left[left.length - 1], right[right.length - 1]].filter(Boolean)
      }
    ];
  }

  function terminalCapTouchesHost(endpoint, hostSurface, tolerance) {
    const corners = Array.isArray(endpoint?.corners) ? endpoint.corners : [];
    const probes = [endpoint?.point, ...corners].filter(Boolean);
    if (probes.some((point) => pointNearPolygon(point, hostSurface?.polygon, tolerance))) return true;
    if (corners.length < 2 || !Array.isArray(hostSurface?.polygon)) return false;
    for (let index = 0; index < hostSurface.polygon.length; index += 1) {
      if (segmentIntersection(corners[0], corners[1], hostSurface.polygon[index], hostSurface.polygon[(index + 1) % hostSurface.polygon.length])) {
        return true;
      }
    }
    return false;
  }

  function hostTerminalTouchesSurfaceNear(hostSurface, surface, endpoint, tolerance) {
    if (!hostSurface || !surface || !endpoint?.point) return false;
    const nearDistance = Math.max(12, Math.max(widthOr(surface.width, 0), widthOr(hostSurface.width, 0)) + tolerance * 2);
    return surfaceTerminalEndpoints(hostSurface).some((hostEndpoint) => (
      dist(hostEndpoint.point, endpoint.point) <= nearDistance &&
      terminalCapTouchesHost(hostEndpoint, surface, tolerance)
    ));
  }

  function isWiderMutualTerminalDuplicate(surface, hostSurface, endpoint, tolerance) {
    const surfaceWidth = widthOr(surface?.width, 0);
    const hostWidth = widthOr(hostSurface?.width, 0);
    if (surfaceWidth <= hostWidth + INTERSECTION_PAD) return false;
    return hostTerminalTouchesSurfaceNear(hostSurface, surface, endpoint, tolerance);
  }

  function terminalOpenSign(surface, hostSurface, endpoint) {
    const farOffset = signedOffsetOnSurface(hostSurface, endpoint.farPoint);
    if (Math.abs(farOffset) > 1) return farOffset > 0 ? 1 : -1;
    const samples = surface?.samples || [];
    const probeIndex = endpoint.t === 0
      ? Math.min(samples.length - 1, Math.max(1, Math.round(samples.length * 0.25)))
      : Math.max(0, Math.min(samples.length - 2, Math.round(samples.length * 0.75)));
    const probeOffset = signedOffsetOnSurface(hostSurface, samples[probeIndex]?.center || endpoint.farPoint);
    if (Math.abs(probeOffset) > 1) return probeOffset > 0 ? 1 : -1;
    return 0;
  }

  function surfaceTerminalAttachments(surface, hostSurface) {
    if (!surface || !hostSurface || surface.id === hostSurface.id) return [];
    const tolerance = Math.max(2, INTERSECTION_PAD * 2);
    return surfaceTerminalEndpoints(surface).map((endpoint) => {
      if (!terminalCapTouchesHost(endpoint, hostSurface, tolerance)) return null;
      if (isWiderMutualTerminalDuplicate(surface, hostSurface, endpoint, tolerance)) return null;
      const openSign = terminalOpenSign(surface, hostSurface, endpoint);
      if (!openSign) return null;
      return {
        roadId: surface.id,
        hostId: hostSurface.id,
        host: hostSurface,
        point: endpoint.point,
        endpointT: endpoint.t,
        corners: endpoint.corners,
        openSign
      };
    }).filter(Boolean);
  }

  function surfacePairKey(aId, bId) {
    return [String(aId || ""), String(bId || "")].sort().join("~");
  }

  function areLinkedDepartureSurfaces(first, second) {
    const firstHostId = String(first?.model?.metadata?.roadDeparture?.hostId || "");
    const secondHostId = String(second?.model?.metadata?.roadDeparture?.hostId || "");
    return Boolean(
      (firstHostId && firstHostId === second?.id) ||
      (secondHostId && secondHostId === first?.id)
    );
  }

  function surfaceLaneCount(surface) {
    const widths = Array.isArray(surface?.config?.laneWidths) ? surface.config.laneWidths : [];
    if (widths.length) return widths.length;
    return Math.max(1, Math.round(numberOr(surface?.config?.laneCount, 1)));
  }

  function surfaceLaneWidth(surface) {
    const widths = Array.isArray(surface?.config?.laneWidths) ? surface.config.laneWidths : [];
    if (widths.length) return widths.reduce((sum, width) => sum + widthOr(width, surface?.config?.laneWidth || 50), 0);
    return surfaceLaneCount(surface) * widthOr(surface?.config?.laneWidth, 50);
  }

  function directionFromTerminal(surface, endpointT) {
    const samples = surface?.samples || [];
    if (samples.length < 2) return { x: 0, y: 0 };
    if (endpointT === 0) {
      return normalizeVector({
        x: samples[1].center.x - samples[0].center.x,
        y: samples[1].center.y - samples[0].center.y
      });
    }
    const last = samples.length - 1;
    return normalizeVector({
      x: samples[last - 1].center.x - samples[last].center.x,
      y: samples[last - 1].center.y - samples[last].center.y
    });
  }

  function hostTerminalInfo(hostSurface, point) {
    const endpoints = surfaceTerminalEndpoints(hostSurface);
    if (!endpoints.length || !point) return null;
    return endpoints
      .map((endpoint, index) => ({ endpoint, index, distance: dist(endpoint.point, point) }))
      .sort((a, b) => a.distance - b.distance)[0] || null;
  }

  function hostOutwardDirection(hostSurface, terminalIndex) {
    const samples = hostSurface?.samples || [];
    if (samples.length < 2) return { x: 0, y: 0 };
    if (terminalIndex === 0) {
      return normalizeVector({
        x: samples[0].center.x - samples[1].center.x,
        y: samples[0].center.y - samples[1].center.y
      });
    }
    const last = samples.length - 1;
    return normalizeVector({
      x: samples[last].center.x - samples[last - 1].center.x,
      y: samples[last].center.y - samples[last - 1].center.y
    });
  }

  function addLaneSplitTerminal(roadId, info) {
    const list = laneSplitTerminals.get(roadId) || [];
    if (!list.some((item) => item.hostId === info.hostId && item.siblingId === info.siblingId && item.endpointT === info.endpointT)) {
      list.push(info);
      laneSplitTerminals.set(roadId, list);
    }
  }

  function buildLaneSplitMetadata(surfaces = []) {
    laneSplitTerminals = new Map();
    laneSplitSiblingRegions = new Map();
    (surfaces || []).forEach((hostSurface) => {
      if (hostSurface?.isIsland || hostSurface?.config?.divided || surfaceLaneCount(hostSurface) < 2) return;
      const groups = new Map();
      (surfaces || []).forEach((branchSurface) => {
        if (!branchSurface || branchSurface.id === hostSurface.id || branchSurface.isIsland || branchSurface.config?.divided) return;
        if (surfaceLaneCount(branchSurface) >= surfaceLaneCount(hostSurface)) return;
        const proximity = Math.max(hostSurface.width, branchSurface.width) + 16;
        if (!boundsOverlap(hostSurface.bounds, branchSurface.bounds, proximity)) return;
        surfaceTerminalAttachments(branchSurface, hostSurface).forEach((attachment) => {
          const terminal = hostTerminalInfo(hostSurface, attachment.point);
          if (!terminal) return;
          const nearLimit = Math.max(24, hostSurface.half + branchSurface.half + 12);
          if (terminal.distance > nearLimit) return;
          const branchDirection = directionFromTerminal(branchSurface, attachment.endpointT);
          const hostDirection = hostOutwardDirection(hostSurface, terminal.index);
          const alignment = branchDirection.x * hostDirection.x + branchDirection.y * hostDirection.y;
          if (alignment < 0.45) return;
          const key = `${hostSurface.id}:${terminal.index}`;
          const group = groups.get(key) || { hostSurface, terminal, branches: [] };
          if (!group.branches.some((item) => item.surface.id === branchSurface.id)) {
            group.branches.push({ surface: branchSurface, attachment });
          }
          groups.set(key, group);
        });
      });

      groups.forEach((group) => {
        const branches = group.branches;
        for (let firstIndex = 0; firstIndex < branches.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < branches.length; secondIndex += 1) {
            const first = branches[firstIndex];
            const second = branches[secondIndex];
            if (first.attachment.openSign * second.attachment.openSign >= 0) continue;
            if (surfaceLaneCount(first.surface) + surfaceLaneCount(second.surface) !== surfaceLaneCount(hostSurface)) continue;
            const hostLaneWidth = surfaceLaneWidth(hostSurface);
            const branchLaneWidth = surfaceLaneWidth(first.surface) + surfaceLaneWidth(second.surface);
            if (Math.abs(hostLaneWidth - branchLaneWidth) > Math.max(3, hostLaneWidth * 0.08)) continue;

            const center = group.terminal.endpoint.point;
            const radius = Math.max(80, hostSurface.width * 1.8);
            const region = { hostId: hostSurface.id, center, radius };
            const pairKey = surfacePairKey(first.surface.id, second.surface.id);
            const regions = laneSplitSiblingRegions.get(pairKey) || [];
            regions.push(region);
            laneSplitSiblingRegions.set(pairKey, regions);
            addLaneSplitTerminal(first.surface.id, {
              hostId: hostSurface.id,
              siblingId: second.surface.id,
              endpointT: first.attachment.endpointT
            });
            addLaneSplitTerminal(second.surface.id, {
              hostId: hostSurface.id,
              siblingId: first.surface.id,
              endpointT: second.attachment.endpointT
            });
          }
        }
      });
    });
  }

  function areLaneSplitSiblingsAtPoint(firstSurface, secondSurface, point) {
    if (!firstSurface || !secondSurface || !point) return false;
    const regions = laneSplitSiblingRegions.get(surfacePairKey(firstSurface.id, secondSurface.id)) || [];
    return regions.some((region) => dist(region.center, point) <= region.radius);
  }

  function isLaneSplitTerminalAtHostPoint(surface, hostSurface, point) {
    if (!surface || !hostSurface || !point) return false;
    const entries = laneSplitTerminals.get(surface.id) || [];
    return entries.some((entry) => {
      if (entry.hostId !== hostSurface.id) return false;
      const regions = laneSplitSiblingRegions.get(surfacePairKey(surface.id, entry.siblingId)) || [];
      return regions.some((region) => (
        region.hostId === hostSurface.id && dist(region.center, point) <= region.radius
      ));
    });
  }

  function shouldPreserveLaneSplitShoulderForShape(id, boundary, shape) {
    if (!isRoadShoulderBoundary(boundary)) return false;
    const entries = laneSplitTerminals.get(id) || [];
    const shapeRoadIds = new Set(shape?.roadIds || []);
    return entries.some((entry) => (
      shapeRoadIds.has(id) &&
      (shapeRoadIds.has(entry.hostId) || shapeRoadIds.has(entry.siblingId))
    ));
  }

  function attachmentSideValue(attachment, point) {
    return signedOffsetOnSurface(attachment.host, point) * attachment.openSign;
  }

  function isOnAttachmentOpenSide(attachment, point, pad = 0) {
    return attachmentSideValue(attachment, point) >= -Math.max(0, pad);
  }

  function clipPolygonToAttachmentOpenSide(points, attachment, pad = 0) {
    if (!Array.isArray(points) || points.length < 3 || !attachment) return points || [];
    const valueAt = (point) => attachmentSideValue(attachment, point) + Math.max(0, pad);
    const clipped = [];
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const previous = points[(index - 1 + points.length) % points.length];
      const currentValue = valueAt(current);
      const previousValue = valueAt(previous);
      const currentInside = currentValue >= -EPS;
      const previousInside = previousValue >= -EPS;
      if (currentInside !== previousInside) {
        const denom = previousValue - currentValue;
        const t = Math.abs(denom) <= EPS ? 0 : clamp(previousValue / denom, 0, 1);
        addPointIfFar(clipped, interpolate(previous, current, t), 0.12);
      }
      if (currentInside) addPointIfFar(clipped, current, 0.12);
    }
    return clipped.length >= 3 ? clipped : [];
  }

  function terminalAttachmentsForPair(a, b) {
    return [
      ...surfaceTerminalAttachments(a, b),
      ...surfaceTerminalAttachments(b, a)
    ];
  }

  function clippedHullForTerminalAttachments(hull, a, b) {
    let clipped = hull || [];
    terminalAttachmentsForPair(a, b).forEach((attachment) => {
      if (clipped.length >= 3) clipped = clipPolygonToAttachmentOpenSide(clipped, attachment, INTERSECTION_PAD);
    });
    return clipped.length >= 3 ? clipped : hull;
  }

  function terminalRoadIdsForPair(a, b) {
    return Array.from(new Set(terminalAttachmentsForPair(a, b).map((attachment) => attachment.roadId)));
  }

  function segmentIntersectionParam(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denom = r.x * s.y - r.y * s.x;
    if (Math.abs(denom) < EPS) return null;
    const q = { x: c.x - a.x, y: c.y - a.y };
    const t = (q.x * s.y - q.y * s.x) / denom;
    const u = (q.x * r.y - q.y * r.x) / denom;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return {
      t: clamp(t, 0, 1),
      u: clamp(u, 0, 1),
      point: { x: a.x + r.x * t, y: a.y + r.y * t }
    };
  }

  function segmentIntersection(a, b, c, d) {
    return segmentIntersectionParam(a, b, c, d)?.point || null;
  }

  function uniquePoints(points, tolerance = 0.5) {
    const unique = [];
    (points || []).forEach((point) => {
      if (!unique.some((item) => dist(item, point) <= tolerance)) unique.push({ x: point.x, y: point.y });
    });
    return unique;
  }

  function polygonIntersections(polyA, polyB) {
    const points = [];
    polyA.forEach((point) => { if (pointInPolygon(point, polyB)) points.push(point); });
    polyB.forEach((point) => { if (pointInPolygon(point, polyA)) points.push(point); });
    for (let i = 0; i < polyA.length; i += 1) {
      const a1 = polyA[i];
      const a2 = polyA[(i + 1) % polyA.length];
      for (let j = 0; j < polyB.length; j += 1) {
        const b1 = polyB[j];
        const b2 = polyB[(j + 1) % polyB.length];
        const hit = segmentIntersection(a1, a2, b1, b2);
        if (hit) points.push(hit);
      }
    }
    return uniquePoints(points, 0.75);
  }

  function convexHull(points) {
    const unique = uniquePoints(points, 0.75).sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    if (unique.length < 3) return [];
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    unique.forEach((point) => {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    });
    const upper = [];
    unique.slice().reverse().forEach((point) => {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    });
    upper.pop();
    lower.pop();
    return [...lower, ...upper];
  }

  function polygonCentroid(points) {
    if (!points?.length) return { x: 0, y: 0 };
    const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  function expandPolygon(points, amount) {
    if (!points?.length || !amount) return points || [];
    const center = polygonCentroid(points);
    return points.map((point) => {
      const vector = { x: point.x - center.x, y: point.y - center.y };
      const length = Math.hypot(vector.x, vector.y) || 1;
      return {
        x: point.x + vector.x / length * amount,
        y: point.y + vector.y / length * amount
      };
    });
  }

  function fmt(value) {
    const rounded = Math.round(value * 100) / 100;
    return String(Number.isFinite(rounded) ? rounded : 0);
  }

  function pathFromPoints(points, close = false) {
    if (!points?.length) return "";
    let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
    for (let i = 1; i < points.length; i += 1) d += ` L ${fmt(points[i].x)} ${fmt(points[i].y)}`;
    return d + (close ? " Z" : "");
  }

  function pointKey(point, precision = 2) {
    const factor = Math.pow(10, precision);
    return `${Math.round((point?.x || 0) * factor) / factor},${Math.round((point?.y || 0) * factor) / factor}`;
  }

  function qEventKey(control, baseEntry, baseExit) {
    return `${pointKey(control, 1)}|${pointKey(baseEntry, 1)}|${pointKey(baseExit, 1)}`;
  }

  function qSegmentPath(item) {
    if (!item) return "";
    return `M ${fmt(item.entry.x)} ${fmt(item.entry.y)} Q ${fmt(item.control.x)} ${fmt(item.control.y)} ${fmt(item.exit.x)} ${fmt(item.exit.y)}`;
  }

  function qKeyTouchesIsland(key) {
    const value = String(key || "");
    if (!value.startsWith("intersection:")) return false;
    const qMarkerIndex = value.lastIndexOf(":q:");
    if (qMarkerIndex < 0) return false;
    const identities = value.slice("intersection:".length, qMarkerIndex).split("~");
    const roadIds = new Set(identities.map((identity) => {
      const boundaryIndex = identity.lastIndexOf(":b");
      return boundaryIndex > 0 ? identity.slice(0, boundaryIndex) : "";
    }).filter(Boolean));
    return lastRoadSurfaces.some((surface) => surface?.isIsland && roadIds.has(surface.id));
  }

  function isEditableQSegment(item) {
    return Boolean(item?.key && !qKeyTouchesIsland(item.key));
  }

  function qControlWithEdit(baseControl, edit) {
    return {
      x: baseControl.x + numberOr(edit?.controlDx, 0),
      y: baseControl.y + numberOr(edit?.controlDy, 0)
    };
  }

  function qSegmentFromEvent(event, mode) {
    const baseControl = event.baseControl || event.control;
    const entryVector = normalizeVector({ x: event.baseEntry.x - baseControl.x, y: event.baseEntry.y - baseControl.y });
    const exitVector = normalizeVector({ x: event.baseExit.x - baseControl.x, y: event.baseExit.y - baseControl.y });
    return {
      key: event.key,
      mode,
      entry: { x: event.entry.x, y: event.entry.y },
      control: { x: event.control.x, y: event.control.y },
      baseControl: { x: baseControl.x, y: baseControl.y },
      exit: { x: event.exit.x, y: event.exit.y },
      baseEntry: { x: event.baseEntry.x, y: event.baseEntry.y },
      baseExit: { x: event.baseExit.x, y: event.baseExit.y },
      entryDir: entryVector,
      exitDir: exitVector,
      entryCut: event.entryCut,
      exitCut: event.exitCut,
      entryMaxCut: event.entryMaxCut,
      exitMaxCut: event.exitMaxCut,
      entryTrack: event.entryTrack,
      exitTrack: event.exitTrack,
      d: qSegmentPath(event)
    };
  }

  function qEditForKey(key, aliases = []) {
    if (!key) return {};
    const candidateKeys = [key, ...(aliases || [])].filter(Boolean);
    if (candidateKeys.some(qKeyTouchesIsland)) {
      candidateKeys.forEach((candidateKey) => qEndpointEdits.delete(candidateKey));
      if (candidateKeys.includes(selectedQKey)) selectedQKey = "";
      return {};
    }
    const direct = qEndpointEdits.get(key);
    if (direct) return direct;
    for (const alias of aliases) {
      if (!alias || alias === key || !qEndpointEdits.has(alias)) continue;
      const migrated = qEndpointEdits.get(alias) || {};
      qEndpointEdits.set(key, migrated);
      qEndpointEdits.delete(alias);
      if (selectedQKey === alias) selectedQKey = key;
      return migrated;
    }
    return {};
  }

  function cloneQEndpointEditsMap(source = qEndpointEdits) {
    const copy = new Map();
    source.forEach((value, key) => {
      if (qKeyTouchesIsland(key)) return;
      const entryCut = Number(value?.entryCut);
      const exitCut = Number(value?.exitCut);
      const controlDx = Number(value?.controlDx);
      const controlDy = Number(value?.controlDy);
      const clean = {};
      if (Number.isFinite(entryCut)) clean.entryCut = entryCut;
      if (Number.isFinite(exitCut)) clean.exitCut = exitCut;
      if (Number.isFinite(controlDx) && Math.abs(controlDx) >= 0.01) clean.controlDx = controlDx;
      if (Number.isFinite(controlDy) && Math.abs(controlDy) >= 0.01) clean.controlDy = controlDy;
      if (Object.keys(clean).length) copy.set(String(key), clean);
    });
    return copy;
  }

  function exportState() {
    return {
      version: 1,
      qEndpointEdits: Array.from(cloneQEndpointEditsMap().entries()).map(([key, value]) => ({
        key,
        ...(Number.isFinite(Number(value.entryCut)) ? { entryCut: Number(value.entryCut) } : {}),
        ...(Number.isFinite(Number(value.exitCut)) ? { exitCut: Number(value.exitCut) } : {}),
        ...(Number.isFinite(Number(value.controlDx)) ? { controlDx: Number(value.controlDx) } : {}),
        ...(Number.isFinite(Number(value.controlDy)) ? { controlDy: Number(value.controlDy) } : {})
      }))
    };
  }

  function importState(state, options = {}) {
    const next = new Map();
    (Array.isArray(state?.qEndpointEdits) ? state.qEndpointEdits : []).forEach((item) => {
      const key = String(item?.key || "");
      if (!key) return;
      const entryCut = Number(item.entryCut);
      const exitCut = Number(item.exitCut);
      const controlDx = Number(item.controlDx);
      const controlDy = Number(item.controlDy);
      const clean = {};
      if (Number.isFinite(entryCut)) clean.entryCut = entryCut;
      if (Number.isFinite(exitCut)) clean.exitCut = exitCut;
      if (Number.isFinite(controlDx) && Math.abs(controlDx) >= 0.01) clean.controlDx = controlDx;
      if (Number.isFinite(controlDy) && Math.abs(controlDy) >= 0.01) clean.controlDy = controlDy;
      if (Object.keys(clean).length) next.set(key, clean);
    });
    qEndpointEdits = next;
    selectedQKey = "";
    qEndpointDrag = null;
    if (!options.skipRefresh) scheduleRefresh();
  }

  function qCutFromPoint(item, side, point) {
    const track = side === "entry" ? item.entryTrack : item.exitTrack;
    const trackCut = cutFromTravelTrack(track, point);
    if (Number.isFinite(trackCut)) return trackCut;
    const dir = side === "entry" ? item.entryDir : item.exitDir;
    const maxCut = side === "entry" ? item.entryMaxCut : item.exitMaxCut;
    const origin = item.baseControl || item.control;
    const projected = ((point?.x || 0) - origin.x) * dir.x + ((point?.y || 0) - origin.y) * dir.y;
    return clamp(projected, 0.25, Math.max(0.25, numberOr(maxCut, SMOOTH_RADIUS * 3.2)));
  }

  function cutFromTravelTrack(track, point) {
    if (!point || !Array.isArray(track?.points) || track.points.length < 2) return NaN;
    let best = null;
    for (let index = 0; index < track.points.length - 1; index += 1) {
      const a = track.points[index];
      const b = track.points[index + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq <= EPS) continue;
      const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq, 0, 1);
      const projected = { x: a.x + dx * t, y: a.y + dy * t };
      const distanceValue = dist(point, projected);
      const cut = a.cut + (b.cut - a.cut) * t;
      if (!best || distanceValue < best.distance) best = { distance: distanceValue, cut };
    }
    if (!best) return NaN;
    return clamp(best.cut, 0.25, Math.max(0.25, numberOr(track.maxCut, best.cut)));
  }

  function uniqueSortedCuts(cuts, maxCut) {
    const cleanMax = Math.max(0.25, numberOr(maxCut, 0.25));
    const rounded = new Set();
    (cuts || []).forEach((cut) => {
      const value = clamp(numberOr(cut, 0), 0, cleanMax);
      rounded.add(Math.round(value * 1000) / 1000);
    });
    rounded.add(0);
    rounded.add(Math.round(cleanMax * 1000) / 1000);
    return Array.from(rounded).sort((a, b) => a - b);
  }

  function buildOpenTravelTrack(points, metrics, originS, direction, maxCut) {
    const cleanMax = Math.max(0.25, numberOr(maxCut, 0.25));
    const cuts = [0, cleanMax];
    for (let index = 0; index < points.length; index += 1) {
      const vertexS = metrics.cumulative[index];
      const cut = direction < 0 ? originS - vertexS : vertexS - originS;
      if (cut > EPS && cut < cleanMax - EPS) cuts.push(cut);
    }
    return {
      maxCut: cleanMax,
      points: uniqueSortedCuts(cuts, cleanMax).map((cut) => ({
        cut,
        ...openPointAtDistance(points, metrics, originS + direction * cut)
      }))
    };
  }

  function closedForwardDistance(fromS, toS, total) {
    if (!total) return 0;
    return normalizeDistanceOnClosed(toS - fromS, total);
  }

  function buildClosedTravelTrack(points, metrics, originS, direction, maxCut) {
    const cleanMax = Math.max(0.25, numberOr(maxCut, 0.25));
    const cuts = [0, cleanMax];
    for (let index = 0; index < points.length; index += 1) {
      const vertexS = metrics.cumulative[index];
      const cut = direction < 0
        ? closedForwardDistance(vertexS, originS, metrics.total)
        : closedForwardDistance(originS, vertexS, metrics.total);
      if (cut > EPS && cut < cleanMax - EPS) cuts.push(cut);
    }
    return {
      maxCut: cleanMax,
      points: uniqueSortedCuts(cuts, cleanMax).map((cut) => ({
        cut,
        ...closedPointAtDistance(points, metrics, originS + direction * cut)
      }))
    };
  }

  function closedCandidateLimit(candidates, candidateIndex, direction, total, radius) {
    if (!total) return 0.25;
    const safetyGap = Math.max(2.5, radius * 0.35);
    if (!Array.isArray(candidates) || candidates.length <= 1) {
      return Math.max(2, total * 0.45);
    }
    const current = candidates[candidateIndex];
    const neighborIndex = direction < 0
      ? (candidateIndex - 1 + candidates.length) % candidates.length
      : (candidateIndex + 1) % candidates.length;
    const neighbor = candidates[neighborIndex];
    const distanceValue = direction < 0
      ? closedForwardDistance(neighbor.currentS, current.currentS, total)
      : closedForwardDistance(current.currentS, neighbor.currentS, total);
    return Math.max(2, distanceValue - safetyGap);
  }

  function svgPointFromEvent(event) {
    try {
      return utils.pointFromEvent(manager.canvas, event);
    } catch (_) {
      const pt = manager.canvas.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      return pt.matrixTransform(manager.canvas.getScreenCTM().inverse());
    }
  }


  function perpendicularDistanceToLine(point, a, b) {
    const length = dist(a, b);
    if (length <= EPS) return dist(point, a);
    return Math.abs((b.x - a.x) * (a.y - point.y) - (a.x - point.x) * (b.y - a.y)) / length;
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= EPS) return dist(point, a);
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq, 0, 1);
    return dist(point, { x: a.x + dx * t, y: a.y + dy * t });
  }

  function simplifyPolylineRdp(points, tolerance = 0.35) {
    if (!Array.isArray(points) || points.length <= 2) return (points || []).slice();
    let bestIndex = -1;
    let bestDistance = -1;
    const first = points[0];
    const last = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i += 1) {
      const distanceValue = perpendicularDistanceToLine(points[i], first, last);
      if (distanceValue > bestDistance) {
        bestDistance = distanceValue;
        bestIndex = i;
      }
    }
    if (bestDistance <= tolerance || bestIndex < 0) return [first, last];
    const left = simplifyPolylineRdp(points.slice(0, bestIndex + 1), tolerance);
    const right = simplifyPolylineRdp(points.slice(bestIndex), tolerance);
    return left.slice(0, -1).concat(right);
  }

  function simplifyBoundaryPoints(points, closed = false) {
    const clean = simplifyPoints(points || [], 0.18);
    if (clean.length < (closed ? 4 : 3)) return clean;
    if (!closed) return simplifyPolylineRdp(clean, 0.38);
    // Kapalı contour'da RDP için en güvenli yol: en uzun kenarı başlangıç kırığı olarak
    // kullanıp açık polyline gibi sadeleştirmek. Bu düz/sampled noktaları temizler,
    // gerçek köşeleri ve eğri parçalarını korur.
    let splitIndex = 0;
    let best = -1;
    for (let i = 0; i < clean.length; i += 1) {
      const length = dist(clean[i], clean[(i + 1) % clean.length]);
      if (length > best) {
        best = length;
        splitIndex = (i + 1) % clean.length;
      }
    }
    const rotated = [];
    for (let i = 0; i < clean.length; i += 1) rotated.push(clean[(splitIndex + i) % clean.length]);
    rotated.push(rotated[0]);
    const simplified = simplifyPolylineRdp(rotated, 0.38);
    if (simplified.length > 1 && dist(simplified[0], simplified[simplified.length - 1]) < 0.3) simplified.pop();
    return simplified.length >= 3 ? simplified : clean;
  }

  function minDistanceToPoints(point, points) {
    if (!point || !points?.length) return Infinity;
    let best = Infinity;
    points.forEach((candidate) => {
      best = Math.min(best, dist(point, candidate));
    });
    return best;
  }

  function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < (points?.length || 0); i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  }

  function removeSoftPolylineNoise(points, angleToleranceDeg = 4) {
    const clean = simplifyPoints(points || [], 0.18);
    if (clean.length < 4) return clean;
    const result = [];
    for (let i = 0; i < clean.length; i += 1) {
      const prev = clean[(i - 1 + clean.length) % clean.length];
      const current = clean[i];
      const next = clean[(i + 1) % clean.length];
      const len1 = dist(prev, current);
      const len2 = dist(current, next);
      if (len1 < 0.18 || len2 < 0.18) continue;
      const vPrev = normalizeVector({ x: prev.x - current.x, y: prev.y - current.y });
      const vNext = normalizeVector({ x: next.x - current.x, y: next.y - current.y });
      const dot = clamp(vPrev.x * vNext.x + vPrev.y * vNext.y, -1, 1);
      const angle = Math.acos(dot) * 180 / Math.PI;
      if (Math.abs(180 - angle) <= angleToleranceDeg && Math.min(len1, len2) < 2.2) continue;
      result.push(current);
    }
    return result.length >= 3 ? result : clean;
  }

  function pointAlongClosed(points, index, direction, distanceValue) {
    const n = points.length;
    let remaining = Math.max(0, distanceValue);
    let current = points[index];
    let currentIndex = index;
    let guard = 0;
    while (remaining > EPS && guard < n + 2) {
      guard += 1;
      const nextIndex = direction < 0 ? (currentIndex - 1 + n) % n : (currentIndex + 1) % n;
      const next = points[nextIndex];
      const segmentLength = dist(current, next);
      if (segmentLength <= EPS) {
        currentIndex = nextIndex;
        current = next;
        continue;
      }
      if (remaining <= segmentLength) {
        const t = remaining / segmentLength;
        return {
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t
        };
      }
      remaining -= segmentLength;
      currentIndex = nextIndex;
      current = next;
    }
    return { ...current };
  }

  function distanceAlongClosed(points, fromIndex, direction, maxDistance) {
    const n = points.length;
    let total = 0;
    let current = points[fromIndex];
    let currentIndex = fromIndex;
    let guard = 0;
    while (guard < n + 2 && total < maxDistance) {
      guard += 1;
      const nextIndex = direction < 0 ? (currentIndex - 1 + n) % n : (currentIndex + 1) % n;
      const next = points[nextIndex];
      const segmentLength = dist(current, next);
      total += segmentLength;
      currentIndex = nextIndex;
      current = next;
      if (currentIndex === fromIndex) break;
    }
    return Math.min(total, maxDistance);
  }

  function localCornerAngle(points, index) {
    const n = points.length;
    const prev = points[(index - 1 + n) % n];
    const current = points[index];
    const next = points[(index + 1) % n];
    const vPrev = normalizeVector({ x: prev.x - current.x, y: prev.y - current.y });
    const vNext = normalizeVector({ x: next.x - current.x, y: next.y - current.y });
    const dot = clamp(vPrev.x * vNext.x + vPrev.y * vNext.y, -1, 1);
    return Math.acos(dot) * 180 / Math.PI;
  }

  function buildClosedPathMetrics(points) {
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
      cumulative[i] = cumulative[i - 1] + dist(points[i - 1], points[i]);
    }
    const total = cumulative[points.length - 1] + dist(points[points.length - 1], points[0]);
    return { cumulative, total };
  }

  function normalizeDistanceOnClosed(value, total) {
    if (!total) return 0;
    let next = value % total;
    if (next < 0) next += total;
    return next;
  }

  function closedPointAtDistance(points, metrics, distanceValue) {
    const { cumulative, total } = metrics;
    if (!points?.length || !total) return points?.[0] || { x: 0, y: 0 };
    const target = normalizeDistanceOnClosed(distanceValue, total);
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const start = cumulative[i];
      const end = i === points.length - 1 ? total : cumulative[i + 1];
      if (target >= start - EPS && target <= end + EPS) {
        const len = end - start;
        if (len <= EPS) return { ...a };
        const t = clamp((target - start) / len, 0, 1);
        return interpolate(a, b, t);
      }
    }
    return { ...points[0] };
  }

  function addLineCommandIfFar(path, point, currentPoint, tolerance = 0.08) {
    if (!point) return { path, currentPoint };
    if (!currentPoint || dist(currentPoint, point) > tolerance) {
      return {
        path: `${path} L ${fmt(point.x)} ${fmt(point.y)}`,
        currentPoint: point
      };
    }
    return { path, currentPoint };
  }

  function buildOpenPathMetrics(points) {
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
      cumulative[i] = cumulative[i - 1] + dist(points[i - 1], points[i]);
    }
    return { cumulative, total: cumulative[cumulative.length - 1] || 0 };
  }

  function openPointAtDistance(points, metrics, distanceValue) {
    if (!points?.length) return { x: 0, y: 0 };
    const target = clamp(distanceValue, 0, metrics.total || 0);
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const start = metrics.cumulative[i];
      const end = metrics.cumulative[i + 1];
      if (target >= start - EPS && target <= end + EPS) {
        const len = end - start;
        if (len <= EPS) return { ...a };
        return interpolate(a, b, clamp((target - start) / len, 0, 1));
      }
    }
    return { ...points[points.length - 1] };
  }

  function localOpenCornerAngle(points, index) {
    const prev = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!prev || !current || !next) return 180;
    const vPrev = normalizeVector({ x: prev.x - current.x, y: prev.y - current.y });
    const vNext = normalizeVector({ x: next.x - current.x, y: next.y - current.y });
    const dot = clamp(vPrev.x * vNext.x + vPrev.y * vNext.y, -1, 1);
    return Math.acos(dot) * 180 / Math.PI;
  }

  function buildOpenPathFromSmoothingEvents(points, metrics, events, qCollector = null) {
    function addOriginalVerticesBetween(state, fromS, toS) {
      const vertices = [];
      for (let i = 0; i < points.length; i += 1) {
        const vertexS = metrics.cumulative[i];
        if (vertexS > fromS + EPS && vertexS < toS - EPS) vertices.push({ point: points[i], s: vertexS });
      }
      vertices.sort((a, b) => a.s - b.s);
      let nextState = state;
      vertices.forEach((item) => {
        nextState = addLineCommandIfFar(nextState.path, item.point, nextState.currentPoint);
      });
      return nextState;
    }

    let state = {
      path: `M ${fmt(points[0].x)} ${fmt(points[0].y)}`,
      currentPoint: points[0]
    };
    let cursorS = 0;
    events.forEach((event) => {
      state = addOriginalVerticesBetween(state, cursorS, event.start);
      state = addLineCommandIfFar(state.path, event.entry, state.currentPoint);
      state.path += ` Q ${fmt(event.control.x)} ${fmt(event.control.y)} ${fmt(event.exit.x)} ${fmt(event.exit.y)}`;
      if (Array.isArray(qCollector)) qCollector.push(qSegmentFromEvent(event, "open"));
      state.currentPoint = event.exit;
      cursorS = event.end;
    });
    state = addOriginalVerticesBetween(state, cursorS, metrics.total);
    state = addLineCommandIfFar(state.path, points[points.length - 1], state.currentPoint);
    return state.path;
  }

  function smoothOpenPath(points, radius = SMOOTH_RADIUS, cornerHints = [], blockedHints = [], qCollector = null, keyPrefix = "", keyFactory = null) {
    const clean = simplifyBoundaryPoints(points || [], false);
    if (clean.length < 3) return pathFromPoints(clean, false);
    const hintTolerance = Math.max(radius * 1.35, 22);
    const blockedTolerance = Math.max(5, radius * 0.45);
    const metrics = buildOpenPathMetrics(clean);
    if (!metrics.total) return pathFromPoints(clean, false);

    const rawEvents = [];
    for (let index = 1; index < clean.length - 1; index += 1) {
      const prev = clean[index - 1];
      const current = clean[index];
      const next = clean[index + 1];
      const angle = localOpenCornerAngle(clean, index);
      const nearIntersection = Boolean(cornerHints?.length && minDistanceToPoints(current, cornerHints) <= hintTolerance);
      const nearRoadMouth = Boolean(blockedHints?.length && minDistanceToPoints(current, blockedHints) <= blockedTolerance);
      const hardEnough = angle >= MIN_SMOOTH_ANGLE_DEG && angle <= MAX_SMOOTH_ANGLE_DEG;
      const enoughLength = dist(prev, current) > 1.5 && dist(current, next) > 1.5;
      if (!nearIntersection || nearRoadMouth || !hardEnough || !enoughLength) continue;

      const currentS = metrics.cumulative[index];
      const backLimit = currentS;
      const forwardLimit = metrics.total - currentS;
      const cut = Math.min(radius, backLimit * 0.48, forwardLimit * 0.48);
      if (cut < 1.2) continue;

      const baseControl = { x: current.x, y: current.y };
      const baseEntry = openPointAtDistance(clean, metrics, currentS - cut);
      const baseExit = openPointAtDistance(clean, metrics, currentS + cut);
      const coordinateKey = qEventKey(baseControl, baseEntry, baseExit);
      const generatedKey = typeof keyFactory === "function"
        ? keyFactory({ control: baseControl, entry: baseEntry, exit: baseExit, pointIndex: index, closed: false }, rawEvents.length)
        : "";
      const key = generatedKey || (keyPrefix ? `${keyPrefix}${rawEvents.length}` : coordinateKey);
      const edit = qEditForKey(key, keyPrefix ? [`${keyPrefix}${coordinateKey}`, coordinateKey] : []);
      const control = qControlWithEdit(baseControl, edit);
      // Açık dış-contour parçalarında Q endpoint CP'leri kendi kenarı boyunca
      // parçanın gerçek başlangıç/bitiş ucuna kadar gidebilmeli. Önceki sınırlama
      // radius*3.4 civarında kaldığı için CP sadece kısa bir mesafe hareket ediyordu.
      const entryMaxCut = Math.max(0.25, backLimit);
      const exitMaxCut = Math.max(0.25, forwardLimit);
      const entryCut = clamp(numberOr(edit.entryCut, cut), 0.25, entryMaxCut);
      const exitCut = clamp(numberOr(edit.exitCut, cut), 0.25, exitMaxCut);
      const start = currentS - entryCut;
      const end = currentS + exitCut;
      rawEvents.push({
        index,
        start,
        end,
        entry: openPointAtDistance(clean, metrics, start),
        control,
        baseControl,
        exit: openPointAtDistance(clean, metrics, end),
        baseEntry,
        baseExit,
        entryCut,
        exitCut,
        entryMaxCut,
        exitMaxCut,
        entryTrack: buildOpenTravelTrack(clean, metrics, currentS, -1, entryMaxCut),
        exitTrack: buildOpenTravelTrack(clean, metrics, currentS, 1, exitMaxCut),
        key
      });
    }

    if (!rawEvents.length) return pathFromPoints(clean, false);
    rawEvents.sort((a, b) => a.start - b.start);
    const events = [];
    let lastEnd = -Infinity;
    rawEvents.forEach((event) => {
      if (event.start < lastEnd - 0.4) return;
      events.push(event);
      lastEnd = Math.max(lastEnd, event.end);
    });
    return events.length ? buildOpenPathFromSmoothingEvents(clean, metrics, events, qCollector) : pathFromPoints(clean, false);
  }

  function smoothClosedPath(points, radius = SMOOTH_RADIUS, cornerHints = [], blockedHints = [], qCollector = null, keyPrefix = "", keyFactory = null) {
    const clean = simplifyBoundaryPoints(removeSoftPolylineNoise(points || []), true);
    if (clean.length < 3) return pathFromPoints(clean, true);
    // Tutucu kural:
    // - Quadratic Bezier sadece gerçek intersection çevresindeki dış contour köşesine uygulanır.
    // - Quadratic Bezier'in kapladığı eski sampled/line vertexleri path'ten çıkarılır.
    //   Böylece eğrinin etrafında L 550 455 / L 550 459.58 gibi geri dönen uzantılar kalmaz.
    const hintTolerance = Math.max(radius * 1.35, 22);
    const blockedTolerance = Math.max(5, radius * 0.45);
    const metrics = buildClosedPathMetrics(clean);
    if (!metrics.total) return pathFromPoints(clean, true);

    const candidates = [];
    clean.forEach((current, index) => {
      const prev = clean[(index - 1 + clean.length) % clean.length];
      const next = clean[(index + 1) % clean.length];
      const angle = localCornerAngle(clean, index);
      const nearIntersection = Boolean(cornerHints?.length && minDistanceToPoints(current, cornerHints) <= hintTolerance);
      const nearRoadMouth = Boolean(blockedHints?.length && minDistanceToPoints(current, blockedHints) <= blockedTolerance);
      const hardEnough = angle >= MIN_SMOOTH_ANGLE_DEG && angle <= MAX_SMOOTH_ANGLE_DEG;
      const enoughLength = dist(prev, current) > 1.5 && dist(current, next) > 1.5;
      if (!nearIntersection || nearRoadMouth || !hardEnough || !enoughLength) return;

      const backLimit = distanceAlongClosed(clean, index, -1, radius * 1.35);
      const forwardLimit = distanceAlongClosed(clean, index, 1, radius * 1.35);
      const cut = Math.min(radius, backLimit * 0.48, forwardLimit * 0.48);
      if (cut < 1.2) return;

      const currentS = metrics.cumulative[index];
      const baseControl = { x: current.x, y: current.y };
      const baseEntryS = normalizeDistanceOnClosed(currentS - cut, metrics.total);
      const baseExitS = normalizeDistanceOnClosed(currentS + cut, metrics.total);
      const baseEntry = closedPointAtDistance(clean, metrics, baseEntryS);
      const baseExit = closedPointAtDistance(clean, metrics, baseExitS);
      const coordinateKey = qEventKey(baseControl, baseEntry, baseExit);
      const generatedKey = typeof keyFactory === "function"
        ? keyFactory({ control: baseControl, entry: baseEntry, exit: baseExit, pointIndex: index, closed: true }, candidates.length)
        : "";
      const key = generatedKey || (keyPrefix ? `${keyPrefix}${candidates.length}` : coordinateKey);
      qEditForKey(key, keyPrefix ? [`${keyPrefix}${coordinateKey}`, coordinateKey] : []);
      candidates.push({
        index,
        currentS,
        baseControl,
        corner: current,
        baseEntry,
        baseExit,
        cut,
        key
      });
    });

    if (!candidates.length) return pathFromPoints(clean, true);
    candidates.sort((a, b) => a.currentS - b.currentS);

    const rawEvents = candidates.map((candidate, candidateIndex) => {
      const edit = qEditForKey(candidate.key);
      const entryMaxCut = Math.max(2, closedCandidateLimit(candidates, candidateIndex, -1, metrics.total, radius));
      const exitMaxCut = Math.max(2, closedCandidateLimit(candidates, candidateIndex, 1, metrics.total, radius));
      const entryCut = clamp(numberOr(edit.entryCut, candidate.cut), 2, entryMaxCut);
      const exitCut = clamp(numberOr(edit.exitCut, candidate.cut), 2, exitMaxCut);
      const entryS = normalizeDistanceOnClosed(candidate.currentS - entryCut, metrics.total);
      const exitS = normalizeDistanceOnClosed(candidate.currentS + exitCut, metrics.total);
      const control = qControlWithEdit(candidate.baseControl, edit);
      return {
        index: candidate.index,
        entryS,
        exitS,
        entry: closedPointAtDistance(clean, metrics, entryS),
        control,
        baseControl: candidate.baseControl,
        exit: closedPointAtDistance(clean, metrics, exitS),
        corner: candidate.corner,
        baseEntry: candidate.baseEntry,
        baseExit: candidate.baseExit,
        entryCut,
        exitCut,
        entryMaxCut,
        exitMaxCut,
        entryTrack: buildClosedTravelTrack(clean, metrics, candidate.currentS, -1, entryMaxCut),
        exitTrack: buildClosedTravelTrack(clean, metrics, candidate.currentS, 1, exitMaxCut),
        key: candidate.key
      };
    });

    if (!rawEvents.length) return pathFromPoints(clean, true);

    rawEvents.sort((a, b) => a.entryS - b.entryS);
    const startS = rawEvents[0].entryS;
    const endS = startS + metrics.total;
    const normalizeLinear = (value) => {
      let next = value;
      while (next < startS - EPS) next += metrics.total;
      return next;
    };

    const events = rawEvents
      .map((event) => {
        const start = normalizeLinear(event.entryS);
        let end = normalizeLinear(event.exitS);
        if (end <= start + EPS) end += metrics.total;
        return { ...event, start, end };
      })
      .filter((event) => event.start < endS - EPS)
      .sort((a, b) => a.start - b.start);

    const filteredEvents = [];
    let lastEnd = startS - 1;
    events.forEach((event) => {
      if (event.start < lastEnd - 0.4) return;
      filteredEvents.push(event);
      lastEnd = Math.max(lastEnd, event.end);
    });

    if (!filteredEvents.length) return pathFromPoints(clean, true);

    function addOriginalVerticesBetween(state, fromS, toS) {
      // Kapalı path bir noktadan başlatılıp lineer mesafeye çevrilince bazı aralıklar
      // contour'un 0 noktasını sarar. Eski sürüm vertexleri dizi sırasıyla ekliyordu;
      // wrap eden aralıkta düşük cumulative değerli noktalar önce yazıldığı için path
      // kendi üstüne atlayıp diagonal/ters bağlantılar oluşturabiliyordu.
      // Bu yüzden önce her vertex'in lineer mesafesini hesaplayıp mutlaka mesafeye göre sıralıyoruz.
      const vertices = [];
      for (let i = 0; i < clean.length; i += 1) {
        let vertexS = metrics.cumulative[i];
        while (vertexS <= fromS + EPS) vertexS += metrics.total;
        if (vertexS > fromS + EPS && vertexS < toS - EPS) {
          vertices.push({ point: clean[i], s: vertexS });
        }
      }
      vertices.sort((a, b) => a.s - b.s);
      let nextState = state;
      vertices.forEach((item) => {
        nextState = addLineCommandIfFar(nextState.path, item.point, nextState.currentPoint);
      });
      return nextState;
    }

    const startPoint = closedPointAtDistance(clean, metrics, startS);
    let state = {
      path: `M ${fmt(startPoint.x)} ${fmt(startPoint.y)}`,
      currentPoint: startPoint
    };
    let cursorS = startS;

    filteredEvents.forEach((event) => {
      state = addOriginalVerticesBetween(state, cursorS, event.start);
      state = addLineCommandIfFar(state.path, event.entry, state.currentPoint);
      state.path += ` Q ${fmt(event.control.x)} ${fmt(event.control.y)} ${fmt(event.exit.x)} ${fmt(event.exit.y)}`;
      if (Array.isArray(qCollector)) qCollector.push(qSegmentFromEvent(event, "closed"));
      state.currentPoint = event.exit;
      cursorS = event.end;
    });

    state = addOriginalVerticesBetween(state, cursorS, endS);
    return state.path + " Z";
  }
  function appendPath(parent, attrs) {
    const path = createSvgElement("path", attrs);
    if (attrs?.["vector-effect"] != null) {
      path.style.setProperty("vector-effect", String(attrs["vector-effect"]));
    }
    parent.append(path);
    return path;
  }

  function collectRoads() {
    return (manager.getObjectsInDomOrder?.() || [])
      .filter((model) => model?.type === "road")
      .map((model) => {
        const cached = roadSurfaceCache.get(model.id);
        if (!dirtyRoadIds.has(model.id) && cached?.model === model) return cached.surface;
        const surface = buildSurface(model);
        roadSurfaceCache.set(model.id, { model, surface });
        return surface;
      })
      .filter(Boolean);
  }

  function shapeBounds(shape) {
    return boundsOfPoints(shape?.points || []);
  }

  function shapesShareRoad(a, b) {
    const ids = new Set(a?.roadIds || []);
    return (b?.roadIds || []).some((id) => ids.has(id));
  }

  function shapesBelongToSameJunction(a, b) {
    const aBounds = shapeBounds(a);
    const bBounds = shapeBounds(b);
    if (!boundsOverlap(aBounds, bBounds, INTERSECTION_PAD)) {
      return shapesShareRoad(a, b) && boundsOverlap(aBounds, bBounds, Math.max(8, SMOOTH_RADIUS * 1.4));
    }
    return true;
  }

  function mergeIntersectionShapeClusters(pairShapes) {
    if (!Array.isArray(pairShapes) || pairShapes.length < 2) return pairShapes || [];
    const seen = new Set();
    const result = pairShapes.slice();

    for (let start = 0; start < pairShapes.length; start += 1) {
      if (seen.has(start)) continue;
      const queue = [start];
      const component = [];
      seen.add(start);

      while (queue.length) {
        const index = queue.shift();
        component.push(pairShapes[index]);
        for (let next = 0; next < pairShapes.length; next += 1) {
          if (seen.has(next)) continue;
          if (!component.some((shape) => shapesBelongToSameJunction(shape, pairShapes[next]))) continue;
          seen.add(next);
          queue.push(next);
        }
      }

      const roadIds = Array.from(new Set(component.flatMap((shape) => shape.roadIds || []))).sort();
      if (component.length < 2 || roadIds.length < 3) continue;
      const points = convexHull(component.flatMap((shape) => shape.points || []));
      if (points.length < 3) continue;
      const terminalRoadIds = Array.from(new Set(component.flatMap((shape) => shape.terminalRoadIds || []))).sort();
      result.push({
        roadIds,
        terminalRoadIds,
        points,
        d: smoothClosedPath(points, Math.min(10, SMOOTH_RADIUS), points),
        clustered: true
      });
    }

    return result;
  }

  function candidateSurfacePairs(surfaces, pad = 2) {
    const ordered = surfaces
      .map((surface, index) => ({ surface, index }))
      .sort((a, b) => a.surface.bounds.minX - b.surface.bounds.minX || a.index - b.index);
    const active = [];
    const pairs = [];
    ordered.forEach((entry) => {
      const minX = entry.surface.bounds.minX - pad;
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index].surface.bounds.maxX + pad < minX) active.splice(index, 1);
      }
      active.forEach((other) => {
        if (areLinkedDepartureSurfaces(other.surface, entry.surface)) return;
        if (
          other.surface.bounds.minY - pad > entry.surface.bounds.maxY ||
          other.surface.bounds.maxY + pad < entry.surface.bounds.minY
        ) return;
        const first = other.index < entry.index ? other : entry;
        const second = other.index < entry.index ? entry : other;
        pairs.push([first.surface, second.surface, first.index, second.index]);
      });
      active.push(entry);
    });
    pairs.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
    return pairs;
  }

  function findIntersectionShapes(surfaces) {
    const shapes = [];
    const memberIds = new Set();
    const candidates = candidateSurfacePairs(surfaces, 2);
    candidates.forEach(([a, b]) => {
      const hits = polygonIntersections(a.polygon, b.polygon);
      if (hits.length < 3) return;
      const baseHull = convexHull(hits);
      const hull = expandPolygon(clippedHullForTerminalAttachments(baseHull, a, b), INTERSECTION_PAD);
      if (hull.length < 3) return;
      shapes.push({
        roadIds: [a.id, b.id],
        terminalRoadIds: terminalRoadIdsForPair(a, b),
        points: hull,
        d: smoothClosedPath(hull, Math.min(10, SMOOTH_RADIUS), hull)
      });
      memberIds.add(a.id);
      memberIds.add(b.id);
    });
    return { shapes: mergeIntersectionShapeClusters(shapes), memberIds, candidatePairCount: candidates.length };
  }

  function pointInsideOtherSurfaces(point, sourceId, surfaces) {
    const sourceSurface = (surfaces || []).find((surface) => surface.id === sourceId) || null;
    return surfaces.some((surface) => {
      if (surface.id === sourceId || !boundsOverlap(surface.bounds, { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y }, 0.5)) return false;
      if (!pointInPolygon(point, surface.polygon)) return false;
      if (surface.isIsland) return true;
      if (sourceSurface && areLaneSplitSiblingsAtPoint(sourceSurface, surface, point)) return true;
      const attachments = sourceSurface ? surfaceTerminalAttachments(surface, sourceSurface) : [];
      if (attachments.length && !attachments.some((attachment) => isOnAttachmentOpenSide(attachment, point, INTERSECTION_PAD))) return false;
      return true;
    });
  }

  function isTerminalClosedSideBoundary(surface, point, surfaces) {
    if (!surface || !point) return false;
    return (surfaces || []).some((hostSurface) => {
      if (hostSurface.id === surface.id) return false;
      if (areLaneSplitSiblingsAtPoint(surface, hostSurface, point)) return false;
      if (isLaneSplitTerminalAtHostPoint(surface, hostSurface, point)) return false;
      return surfaceTerminalAttachments(surface, hostSurface).some((attachment) => (
        !isOnAttachmentOpenSide(attachment, point, 0.75)
      ));
    });
  }

  function splitSegmentByPolygonIntersections(a, b, sourceId, surfaces) {
    const params = [0, 1];
    surfaces.forEach((surface) => {
      if (surface.id === sourceId || !boundsOverlap(surface.bounds, boundsOfPoints([a, b]), 1)) return;
      const poly = surface.polygon;
      for (let i = 0; i < poly.length; i += 1) {
        const hit = segmentIntersectionParam(a, b, poly[i], poly[(i + 1) % poly.length]);
        if (hit && hit.t > EPS && hit.t < 1 - EPS) params.push(hit.t);
      }
    });
    return Array.from(new Set(params.map((value) => Math.round(value * 1000000) / 1000000))).sort((x, y) => x - y);
  }

  function interpolate(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function sourceMetaForSurfaceSegment(surface, index) {
    const leftCount = Number(surface.leftCount) || 0;
    const rightCount = Array.isArray(surface.right) ? surface.right.length : 0;
    const polyLength = Array.isArray(surface.polygon) ? surface.polygon.length : 0;
    if (leftCount > 1 && index >= 0 && index < leftCount - 1) {
      return {
        side: "left",
        boundaryId: surface.edgeStyles?.left?.boundaryId || "b1",
        boundaryStyle: surface.edgeStyles?.left,
        sourceFrom: index / (leftCount - 1),
        sourceTo: (index + 1) / (leftCount - 1)
      };
    }
    if (rightCount > 1 && index >= leftCount && index < polyLength - 1) {
      const k = index - leftCount;
      return {
        side: "right",
        boundaryId: surface.edgeStyles?.right?.boundaryId || "b0",
        boundaryStyle: surface.edgeStyles?.right,
        sourceFrom: (rightCount - 1 - k) / (rightCount - 1),
        sourceTo: (rightCount - 2 - k) / (rightCount - 1)
      };
    }
    return null;
  }

  function isIslandInnerBoundarySegment(surface, sourceMeta) {
    if (!surface?.isIsland || !sourceMeta) return false;
    return sourceMeta.boundaryId === (surface.edgeStyles?.right?.boundaryId || "b0");
  }

  function unionBoundarySegments(surfaces) {
    const segments = [];
    surfaces.forEach((surface) => {
      const poly = surface.polygon;
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (dist(a, b) < EPS) continue;
        const params = splitSegmentByPolygonIntersections(a, b, surface.id, surfaces);
        for (let p = 0; p < params.length - 1; p += 1) {
          const fromT = params[p];
          const toT = params[p + 1];
          if (toT - fromT < EPS) continue;
          const mid = interpolate(a, b, (fromT + toT) / 2);
          if (isTerminalClosedSideBoundary(surface, mid, surfaces)) continue;
          if (pointInsideOtherSurfaces(mid, surface.id, surfaces)) continue;
          const sourceMeta = sourceMetaForSurfaceSegment(surface, i);
          if (isIslandInnerBoundarySegment(surface, sourceMeta)) continue;
          const from = interpolate(a, b, fromT);
          const to = interpolate(a, b, toT);
          if (dist(from, to) >= MIN_POINT_DISTANCE) {
            const leftCount = Number(surface.leftCount) || 0;
            const isEndCap = leftCount > 0 && i === leftCount - 1;
            const isStartCap = i === poly.length - 1;
            const sourceT0 = sourceMeta ? sourceMeta.sourceFrom + (sourceMeta.sourceTo - sourceMeta.sourceFrom) * fromT : null;
            const sourceT1 = sourceMeta ? sourceMeta.sourceFrom + (sourceMeta.sourceTo - sourceMeta.sourceFrom) * toT : null;
            segments.push({
              a: from,
              b: to,
              roadId: surface.id,
              kind: isStartCap ? "startCap" : (isEndCap ? "endCap" : "side"),
              side: sourceMeta?.side || "",
              boundaryId: sourceMeta?.boundaryId || "",
              boundaryStyle: sourceMeta?.boundaryStyle || null,
              sourceT0,
              sourceT1
            });
          }
        }
      }
    });
    return segments;
  }

  function snapKey(point, tolerance = SNAP_TOLERANCE) {
    return `${Math.round(point.x / tolerance)}:${Math.round(point.y / tolerance)}`;
  }

  function closeEnough(a, b, tolerance = SNAP_TOLERANCE * 1.4) {
    return dist(a, b) <= tolerance;
  }

  function assembleBoundaryPaths(segments) {
    const unused = segments.map((segment, index) => ({ ...segment, index }));
    const paths = [];
    const attachTolerance = SNAP_TOLERANCE * 2.5;

    function bestAttachment(points) {
      const head = points[0];
      const tail = points[points.length - 1];
      let best = null;
      for (let i = 0; i < unused.length; i += 1) {
        const item = unused[i];
        const candidates = [
          { at: "tail", reverse: false, distance: dist(tail, item.a), point: item.b },
          { at: "tail", reverse: true, distance: dist(tail, item.b), point: item.a },
          { at: "head", reverse: true, distance: dist(head, item.a), point: item.b },
          { at: "head", reverse: false, distance: dist(head, item.b), point: item.a }
        ];
        candidates.forEach((candidate) => {
          if (!best || candidate.distance < best.distance) best = { ...candidate, unusedIndex: i };
        });
      }
      return best && best.distance <= attachTolerance ? best : null;
    }

    while (unused.length) {
      const first = unused.shift();
      const points = [first.a, first.b];
      let guard = 0;
      while (unused.length && guard < 10000) {
        guard += 1;
        const attach = bestAttachment(points);
        if (!attach) break;
        const next = unused.splice(attach.unusedIndex, 1)[0];
        if (attach.at === "tail") addPointIfFar(points, attach.point, 0.1);
        else {
          if (dist(points[0], attach.point) >= 0.1) points.unshift(attach.point);
        }
        if (points.length > 3 && closeEnough(points[0], points[points.length - 1], SNAP_TOLERANCE * 2.6)) break;
      }
      let closed = points.length > 3 && closeEnough(points[0], points[points.length - 1], SNAP_TOLERANCE * 3);
      let clean = simplifyPoints(points, 0.2);
      if (closed && closeEnough(clean[0], clean[clean.length - 1])) clean.pop();
      clean = simplifyBoundaryPoints(clean, closed);
      if (closed && clean.length >= 3) paths.push({ points: clean, closed: true });
      else if (!closed && clean.length >= 2) paths.push({ points: clean, closed: false });
    }
    return paths;
  }

  function boundarySegmentIdentity(segment) {
    if (!segment) return "";
    return [
      String(segment.roadId || "road"),
      String(segment.boundaryId || segment.side || "edge")
    ].join(":");
  }

  function qBoundaryPairIdentity(point, segments) {
    const nearestByIdentity = new Map();
    (segments || []).forEach((segment) => {
      if (segment.kind !== "side") return;
      const identity = boundarySegmentIdentity(segment);
      if (!identity) return;
      const endpointDistance = Math.min(dist(point, segment.a), dist(point, segment.b));
      const previous = nearestByIdentity.get(identity);
      if (!previous || endpointDistance < previous.distance) nearestByIdentity.set(identity, { identity, distance: endpointDistance });
    });
    const nearest = Array.from(nearestByIdentity.values()).sort((a, b) => a.distance - b.distance || a.identity.localeCompare(b.identity));
    if (!nearest.length) return `corner:${pointKey(point, 0)}`;
    const tolerance = Math.max(3, nearest[0].distance + 2.5);
    const identities = nearest.filter((item) => item.distance <= tolerance).slice(0, 2).map((item) => item.identity).sort();
    if (identities.length < 2 && nearest[1]) identities.push(nearest[1].identity);
    return identities.sort().join("~");
  }

  function intersectionQKeyFactory(segments) {
    const occurrences = new Map();
    return (candidate) => {
      const identity = qBoundaryPairIdentity(candidate.control, segments);
      const occurrence = occurrences.get(identity) || 0;
      occurrences.set(identity, occurrence + 1);
      return `intersection:${identity}:q:${occurrence}`;
    };
  }

  function buildOuterContours(memberSurfaces, intersectionShapes = []) {
    if (!memberSurfaces.length) return [];
    // Yol başlangıç/bitişindeki enine kapatma çizgileri dış boundary olarak çizilmez.
    // Bunlar açık yol ağzı gibi davranır; böylece dış contour sadece gerçek yol kenarlarını
    // ve kavşak dönüşlerini çizer, road cap çizgisi gereksiz ağız kapatması yapmaz.
    const segments = unionBoundarySegments(memberSurfaces).filter((segment) => segment.kind !== "startCap" && segment.kind !== "endCap");
    lastOuterBoundarySegments = segments;
    const paths = assembleBoundaryPaths(segments);
    const cornerHints = [];
    intersectionShapes.forEach((shape) => {
      (shape.points || []).forEach((point) => cornerHints.push(point));
    });
    const blockedHints = [];
    memberSurfaces.forEach((surface) => {
      (surface.terminalCorners || []).forEach((point) => blockedHints.push(point));
    });
    const strokeWidth = contourStrokeWidth(memberSurfaces);
    const keyFactory = intersectionQKeyFactory(segments);
    return paths.map((item, contourIndex) => {
      const qSegments = [];
      const keyPrefix = `intersection:legacy-contour:${contourIndex}:q:`;
      const d = item.closed
        ? smoothClosedPath(item.points, SMOOTH_RADIUS, cornerHints, blockedHints, qSegments, keyPrefix, keyFactory)
        : smoothOpenPath(item.points, SMOOTH_RADIUS, cornerHints, blockedHints, qSegments, keyPrefix, keyFactory);
      qSegments.forEach((segment, qIndex) => {
        segment.contourIndex = contourIndex;
        segment.qIndex = qIndex;
      });
      return {
        points: item.points,
        closed: item.closed,
        d,
        rawD: pathFromPoints(item.points, item.closed),
        strokeWidth,
        qSegments
      };
    });
  }

  function roadShapesFor(id) {
    if (!id || suspended) return [];
    return lastIntersectionShapes.filter((shape) => shape.roadIds.includes(id));
  }

  function roadClipShapesFor(id, boundary = null) {
    const allowCluster = boundary?.role === "marking" || isRoadShoulderBoundary(boundary);
    return roadShapesFor(id).filter((shape) => !shape.clustered || allowCluster);
  }

  function pointInsideRoadShapes(id, point) {
    return roadClipShapesFor(id).some((shape) => pointInPolygon(point, shape.points));
  }

  function shouldPreserveBoundaryForShape(id, boundary, shape) {
    if (boundary?.role !== "marking") return false;
    const terminalIds = Array.isArray(shape?.terminalRoadIds) ? shape.terminalRoadIds : [];
    if (!terminalIds.length) return false;
    return !terminalIds.includes(id);
  }

  function isRoadShoulderBoundary(boundary) {
    if (boundary?.role !== "edge") return false;
    const adjacentRoles = [boundary.before?.role, boundary.after?.role].filter(Boolean);
    return adjacentRoles.includes("shoulder") && adjacentRoles.includes("lane");
  }

  function shouldDashTerminalHostBoundaryForShape(id, boundary, shape) {
    if (!isRoadShoulderBoundary(boundary)) return false;
    const terminalIds = Array.isArray(shape?.terminalRoadIds) ? shape.terminalRoadIds : [];
    if (!terminalIds.length || terminalIds.includes(id)) return false;
    return Array.isArray(shape?.roadIds) && shape.roadIds.includes(id);
  }

  function pointInsideTerminalHostSurfaceForLine(id, point, boundary = null) {
    const roadSurface = lastRoadSurfaces.find((surface) => surface.id === id);
    if (!roadSurface) return false;
    return roadClipShapesFor(id).some((shape) => {
      if (shouldPreserveLaneSplitShoulderForShape(id, boundary, shape)) return false;
      const terminalIds = Array.isArray(shape?.terminalRoadIds) ? shape.terminalRoadIds : [];
      if (!terminalIds.includes(id)) return false;
      const hostIds = (shape.roadIds || []).filter((roadId) => roadId !== id && !terminalIds.includes(roadId));
      return hostIds.some((hostId) => {
        const hostSurface = lastRoadSurfaces.find((surface) => surface.id === hostId);
        if (!hostSurface) return false;
        return surfaceTerminalAttachments(roadSurface, hostSurface).some((attachment) => (
          pointInPolygon(point, hostSurface.polygon) || !isOnAttachmentOpenSide(attachment, point)
        ));
      });
    });
  }

  function roadSurfaceForId(id) {
    return lastRoadSurfaces.find((surface) => surface.id === id) || null;
  }

  function isIslandRoadId(id) {
    const surface = roadSurfaceForId(id);
    if (surface?.isIsland) return true;
    const model = manager.get?.(id);
    const adapter = manager.getAdapter?.(model);
    return Boolean(model?.geometry?.profile === "islandRing" || adapter?.isIsland?.(model));
  }

  function isIslandOuterEdgeBoundary(id, boundary = null) {
    return Boolean(
      isIslandRoadId(id) &&
      boundary?.role === "edge" &&
      numberOr(boundary?.offset, 0) > 0
    );
  }

  function pointInsideOtherSurfacePolygon(point, sourceId) {
    if (!point) return false;
    return lastRoadSurfaces.some((surface) => {
      if (surface.id === sourceId) return false;
      if (!boundsOverlap(surface.bounds, { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y }, 0.5)) return false;
      return pointInPolygon(point, surface.polygon);
    });
  }

  function pointInsideRoadShapesForLine(id, point, boundary = null) {
    if (pointInsideTerminalHostSurfaceForLine(id, point, boundary)) return true;
    if (isIslandOuterEdgeBoundary(id, boundary)) return pointInsideOtherSurfacePolygon(point, id);
    return roadClipShapesFor(id, boundary).some((shape) => {
      if (shouldPreserveLaneSplitShoulderForShape(id, boundary, shape)) return false;
      if (shouldPreserveBoundaryForShape(id, boundary, shape)) return false;
      return pointInPolygon(point, shape.points);
    });
  }

  function pointInsideTerminalHostShapesForLine(id, point, boundary = null) {
    return roadClipShapesFor(id).some((shape) => (
      shouldDashTerminalHostBoundaryForShape(id, boundary, shape) && pointInPolygon(point, shape.points)
    ));
  }

  function refineLineTransition(model, adapter, offset, a, b, targetInside, insideAtPoint) {
    let lo = a;
    let hi = b;
    for (let i = 0; i < 12; i += 1) {
      const mid = (lo + hi) / 2;
      const point = samplePoint(model, adapter, mid, offset);
      const inside = point ? insideAtPoint(point) : false;
      if (inside === targetInside) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }

  function lineRangesByIntersectionState(id, offset, from, to, insideAtPoint, includeInside) {
    const start = clamp(numberOr(from, 0), 0, 1);
    const end = clamp(numberOr(to, 1), 0, 1);
    if (end <= start) return [];
    if (suspended || !lastIntersectionShapes.length || !lastMemberIds.has(id)) {
      return includeInside ? [] : [{ from: start, to: end }];
    }
    const model = manager.get?.(id);
    const adapter = manager.getAdapter?.(model);
    if (!model || !adapter?.pointAt) return includeInside ? [] : [{ from: start, to: end }];

    const samples = [];
    const count = Math.max(8, Math.ceil(CLIP_SAMPLE_COUNT * (end - start)));
    for (let i = 0; i <= count; i += 1) {
      const t = start + (end - start) * i / count;
      const point = samplePoint(model, adapter, t, offset);
      samples.push({ t, inside: point ? insideAtPoint(point) : false });
    }

    const cuts = [start, end];
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i - 1].inside !== samples[i].inside) {
        cuts.push(refineLineTransition(model, adapter, offset, samples[i - 1].t, samples[i].t, samples[i].inside, insideAtPoint));
      }
    }
    const sorted = Array.from(new Set(cuts.map((value) => Math.round(value * 1000000) / 1000000))).sort((a, b) => a - b);
    const ranges = [];
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (b - a < 0.0008) continue;
      const mid = (a + b) / 2;
      const point = samplePoint(model, adapter, mid, offset);
      if (point && Boolean(insideAtPoint(point)) === includeInside) ranges.push({ from: a, to: b });
    }
    return ranges;
  }

  function cloneRanges(ranges) {
    return (Array.isArray(ranges) ? ranges : []).map((range) => ({ from: range.from, to: range.to }));
  }

  function visibleRangeCacheKey(kind, id, offset, from, to, boundary) {
    return [
      kind,
      String(id || ""),
      Math.round(numberOr(offset, 0) * 1000) / 1000,
      Math.round(clamp(numberOr(from, 0), 0, 1) * 1000000) / 1000000,
      Math.round(clamp(numberOr(to, 1), 0, 1) * 1000000) / 1000000,
      String(boundary?.id || ""),
      String(boundary?.role || ""),
      String(boundary?.before || ""),
      String(boundary?.after || "")
    ].join("|");
  }

  function cachedRanges(key, calculate) {
    if (visibleRangeCache.has(key)) return cloneRanges(visibleRangeCache.get(key));
    const ranges = cloneRanges(calculate());
    visibleRangeCache.set(key, ranges);
    return cloneRanges(ranges);
  }

  function visibleRangesForLine(id, offset = 0, from = 0, to = 1, boundary = null) {
    const start = clamp(numberOr(from, 0), 0, 1);
    const end = clamp(numberOr(to, 1), 0, 1);
    if (end <= start) return [];
    if (!lastMemberIds.has(id) || !roadClipShapesFor(id, boundary).length) return [{ from: start, to: end }];
    return cachedRanges(visibleRangeCacheKey("visible", id, offset, start, end, boundary), () => {
      if (isIslandOuterEdgeBoundary(id, boundary)) {
        const ranges = lineRangesByIntersectionState(
          id,
          offset,
          start,
          end,
          (point) => pointInsideOtherSurfacePolygon(point, id),
          false
        );
        return visibleLineRangesOutsideQ(id, offset, ranges, boundary);
      }
      return lineRangesByIntersectionState(
        id,
        offset,
        start,
        end,
        (point) => pointInsideRoadShapesForLine(id, point, boundary),
        false
      );
    });
  }

  function terminalHostDashedRangesForLine(id, offset = 0, from = 0, to = 1, boundary = null) {
    if (!isRoadShoulderBoundary(boundary)) return [];
    const start = clamp(numberOr(from, 0), 0, 1);
    const end = clamp(numberOr(to, 1), 0, 1);
    if (end <= start || !lastMemberIds.has(id) || !roadClipShapesFor(id).length) return [];
    return cachedRanges(visibleRangeCacheKey("terminal", id, offset, start, end, boundary), () => (
      lineRangesByIntersectionState(
        id,
        offset,
        start,
        end,
        (point) => pointInsideTerminalHostShapesForLine(id, point, boundary),
        true
      )
    ));
  }

  function rerenderRoads(ids) {
    const list = Array.from(ids || []).filter(Boolean);
    if (!list.length) return;
    renderingRoads = true;
    try {
      list.forEach((id) => {
        if (manager.get?.(id)) manager.renderObject?.(id);
      });
    } finally {
      renderingRoads = false;
    }
  }

  function segmentStyleParts(segment) {
    const style = segment?.boundaryStyle;
    const sourceT0 = Number(segment?.sourceT0);
    const sourceT1 = Number(segment?.sourceT1);
    if (!style || !Number.isFinite(sourceT0) || !Number.isFinite(sourceT1) || Math.abs(sourceT1 - sourceT0) < EPS) return [];
    const lo = Math.min(sourceT0, sourceT1);
    const hi = Math.max(sourceT0, sourceT1);
    const parts = [];
    const segments = normalizeContourSegments(style.segments, style);
    segments.forEach((item) => {
      const overlapFrom = Math.max(lo, item.from);
      const overlapTo = Math.min(hi, item.to);
      if (overlapTo - overlapFrom < 0.0008) return;
      const alpha0 = clamp((overlapFrom - sourceT0) / (sourceT1 - sourceT0), 0, 1);
      const alpha1 = clamp((overlapTo - sourceT0) / (sourceT1 - sourceT0), 0, 1);
      const a = interpolate(segment.a, segment.b, alpha0);
      const b = interpolate(segment.a, segment.b, alpha1);
      if (dist(a, b) < MIN_POINT_DISTANCE) return;
      parts.push({
        a,
        b,
        roadId: segment.roadId,
        boundaryId: segment.boundaryId,
        style: item.style,
        width: item.width
      });
    });
    return parts;
  }

  function isPointInQCutZone(point, qSegments = lastQSegments) {
    if (!point || !Array.isArray(qSegments) || !qSegments.length) return false;
    return qSegments.some((q) => {
      if (isPointNearConsumedQTrack(point, q, "entry") || isPointNearConsumedQTrack(point, q, "exit")) return true;
      const entryDistance = perpendicularDistanceToLine(point, q.control, q.entry);
      const exitDistance = perpendicularDistanceToLine(point, q.control, q.exit);
      const entryDir = normalizeVector({ x: q.entry.x - q.control.x, y: q.entry.y - q.control.y });
      const exitDir = normalizeVector({ x: q.exit.x - q.control.x, y: q.exit.y - q.control.y });
      const entryProjection = (point.x - q.control.x) * entryDir.x + (point.y - q.control.y) * entryDir.y;
      const exitProjection = (point.x - q.control.x) * exitDir.x + (point.y - q.control.y) * exitDir.y;
      const entryLimit = dist(q.control, q.entry) + 0.65;
      const exitLimit = dist(q.control, q.exit) + 0.65;
      return (entryProjection >= -0.65 && entryProjection <= entryLimit && entryDistance <= 1.4)
        || (exitProjection >= -0.65 && exitProjection <= exitLimit && exitDistance <= 1.4);
    });
  }

  function trackPointAtCut(track, cut) {
    if (!Array.isArray(track?.points) || !track.points.length) return null;
    const cleanCut = clamp(numberOr(cut, 0), 0, Math.max(0, numberOr(track.maxCut, cut)));
    for (let index = 0; index < track.points.length - 1; index += 1) {
      const a = track.points[index];
      const b = track.points[index + 1];
      if (cleanCut >= a.cut - EPS && cleanCut <= b.cut + EPS) {
        const span = b.cut - a.cut;
        if (Math.abs(span) <= EPS) return { x: a.x, y: a.y, cut: cleanCut };
        const t = clamp((cleanCut - a.cut) / span, 0, 1);
        return {
          cut: cleanCut,
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t
        };
      }
    }
    const last = track.points[track.points.length - 1];
    return { x: last.x, y: last.y, cut: cleanCut };
  }

  function consumedTrackPoints(q, side) {
    const track = side === "entry" ? q?.entryTrack : q?.exitTrack;
    const cutLimit = side === "entry" ? q?.entryCut : q?.exitCut;
    if (!Array.isArray(track?.points) || track.points.length < 2) return [];
    const cleanLimit = clamp(numberOr(cutLimit, 0), 0, Math.max(0, numberOr(track.maxCut, cutLimit)));
    const points = [];
    track.points.forEach((point) => {
      if (point.cut <= cleanLimit + EPS) addPointIfFar(points, point, 0.05);
    });
    const endpoint = trackPointAtCut(track, cleanLimit);
    if (endpoint) addPointIfFar(points, endpoint, 0.05);
    return points;
  }

  function isPointNearConsumedQTrack(point, q, side, tolerance = 2.4) {
    const points = consumedTrackPoints(q, side);
    if (points.length < 2) return false;
    for (let index = 0; index < points.length - 1; index += 1) {
      if (distanceToSegment(point, points[index], points[index + 1]) <= tolerance) return true;
    }
    return false;
  }

  function sliceBoundarySegment(segment, fromT, toT) {
    const cleanFrom = clamp(numberOr(fromT, 0), 0, 1);
    const cleanTo = clamp(numberOr(toT, 1), 0, 1);
    if (cleanTo - cleanFrom < EPS) return null;
    const sourceT0 = Number(segment?.sourceT0);
    const sourceT1 = Number(segment?.sourceT1);
    return {
      ...segment,
      a: interpolate(segment.a, segment.b, cleanFrom),
      b: interpolate(segment.a, segment.b, cleanTo),
      sourceT0: Number.isFinite(sourceT0) && Number.isFinite(sourceT1)
        ? sourceT0 + (sourceT1 - sourceT0) * cleanFrom
        : segment?.sourceT0,
      sourceT1: Number.isFinite(sourceT0) && Number.isFinite(sourceT1)
        ? sourceT0 + (sourceT1 - sourceT0) * cleanTo
        : segment?.sourceT1
    };
  }

  function visibleBoundarySegmentsOutsideQ(segment, qSegments = lastQSegments) {
    if (!segment || !Array.isArray(qSegments) || !qSegments.length) return segment ? [segment] : [];
    const length = dist(segment.a, segment.b);
    if (length < EPS) return [];
    const sampleCount = clamp(Math.ceil(length / 4), 2, 48);
    const samples = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const t = index / sampleCount;
      samples.push({
        t,
        inside: isPointInQCutZone(interpolate(segment.a, segment.b, t), qSegments)
      });
    }
    const cuts = [0, 1];
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index - 1].inside === samples[index].inside) continue;
      let lo = samples[index - 1].t;
      let hi = samples[index].t;
      const loInside = samples[index - 1].inside;
      for (let step = 0; step < 10; step += 1) {
        const mid = (lo + hi) / 2;
        const midInside = isPointInQCutZone(interpolate(segment.a, segment.b, mid), qSegments);
        if (midInside === loInside) lo = mid;
        else hi = mid;
      }
      cuts.push((lo + hi) / 2);
    }
    const sorted = Array.from(new Set(cuts.map((value) => Math.round(value * 1000000) / 1000000))).sort((a, b) => a - b);
    const visible = [];
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const fromT = sorted[index];
      const toT = sorted[index + 1];
      if (toT - fromT < 0.0008) continue;
      const mid = (fromT + toT) / 2;
      if (isPointInQCutZone(interpolate(segment.a, segment.b, mid), qSegments)) continue;
      const piece = sliceBoundarySegment(segment, fromT, toT);
      if (piece && dist(piece.a, piece.b) >= MIN_POINT_DISTANCE) visible.push(piece);
    }
    return visible;
  }

  function visibleLineRangesOutsideQ(id, offset, ranges, boundary = null) {
    if (!Array.isArray(ranges) || !ranges.length) return [];
    if (!isIslandOuterEdgeBoundary(id, boundary) || !lastQSegments.length) return ranges;
    const visible = [];
    ranges.forEach((range) => {
      visible.push(...lineRangesByIntersectionState(
        id,
        offset,
        range.from,
        range.to,
        (point) => isPointInQCutZone(point, lastQSegments),
        false
      ));
    });
    return visible;
  }

  function offsetLinePiece(piece, amount) {
    if (!amount) return { a: piece.a, b: piece.b };
    const direction = normalizeVector({ x: piece.b.x - piece.a.x, y: piece.b.y - piece.a.y });
    const normal = { x: -direction.y, y: direction.x };
    return {
      a: { x: piece.a.x + normal.x * amount, y: piece.a.y + normal.y * amount },
      b: { x: piece.b.x + normal.x * amount, y: piece.b.y + normal.y * amount }
    };
  }

  function addStyledPiece(pieces, piece, dashed = false, offset = 0) {
    if (!piece || piece.style === "none" || !Number.isFinite(piece.width)) return;
    const shifted = offsetLinePiece(piece, offset);
    if (dist(shifted.a, shifted.b) < MIN_POINT_DISTANCE) return;
    pieces.push({
      a: shifted.a,
      b: shifted.b,
      width: piece.width,
      dashed,
      key: `${piece.roadId || ""}|${piece.boundaryId || ""}|${piece.width}|${dashed ? "dash" : "solid"}`
    });
  }

  function contourRenderPiecesFromBoundarySegments(boundarySegments = [], qSegments = []) {
    const pieces = [];
    (boundarySegments || []).forEach((segment) => {
      if (segment.kind !== "side") return;
      visibleBoundarySegmentsOutsideQ(segment, qSegments).forEach((visibleSegment) => {
        segmentStyleParts(visibleSegment).forEach((part) => {
          const gap = Math.max(4, part.width * 2);
          if (part.style === "doubleSolid" || part.style === "doubleDash") {
            const dashed = part.style === "doubleDash";
            addStyledPiece(pieces, part, dashed, -gap / 2);
            addStyledPiece(pieces, part, dashed, gap / 2);
            return;
          }
          if (part.style === "leftSolidRightDash") {
            addStyledPiece(pieces, part, true, -gap / 2);
            addStyledPiece(pieces, part, false, gap / 2);
            return;
          }
          if (part.style === "rightSolidLeftDash") {
            addStyledPiece(pieces, part, false, -gap / 2);
            addStyledPiece(pieces, part, true, gap / 2);
            return;
          }
          addStyledPiece(pieces, part, part.style === "dash", 0);
        });
      });
    });
    return pieces;
  }

  function assembleLinePieces(pieces) {
    const unused = (pieces || []).map((piece, index) => ({ ...piece, index }));
    const paths = [];
    const tolerance = SNAP_TOLERANCE * 2.5;
    while (unused.length) {
      const first = unused.shift();
      const points = [first.a, first.b];
      const key = first.key;
      const width = first.width;
      const dashed = first.dashed;
      let guard = 0;
      let changed = true;
      while (changed && guard < 10000) {
        guard += 1;
        changed = false;
        const head = points[0];
        const tail = points[points.length - 1];
        let best = null;
        for (let i = 0; i < unused.length; i += 1) {
          const item = unused[i];
          if (item.key !== key) continue;
          const candidates = [
            { at: "tail", point: item.b, distance: dist(tail, item.a) },
            { at: "tail", point: item.a, distance: dist(tail, item.b) },
            { at: "head", point: item.b, distance: dist(head, item.a) },
            { at: "head", point: item.a, distance: dist(head, item.b) }
          ];
          candidates.forEach((candidate) => {
            if (!best || candidate.distance < best.distance) best = { ...candidate, index: i };
          });
        }
        if (best && best.distance <= tolerance) {
          unused.splice(best.index, 1);
          if (best.at === "tail") addPointIfFar(points, best.point, 0.08);
          else if (dist(points[0], best.point) >= 0.08) points.unshift(best.point);
          changed = true;
        }
      }
      if (points.length >= 2) paths.push({ points: simplifyPolylineRdp(points, 0.25), width, dashed });
    }
    return paths;
  }

  function strokeAttrsForContour(width, dashed = false) {
    const attrs = {
      fill: "none",
      stroke: "#000000",
      "stroke-width": String(width || DEFAULT_LINE_STROKE_WIDTH),
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      "vector-effect": "none",
      "pointer-events": "none"
    };
    if (dashed) attrs["stroke-dasharray"] = "18 14";
    return attrs;
  }

  function renderStyledBoundaryContours(layer, boundarySegments, qSegments) {
    const pieces = contourRenderPiecesFromBoundarySegments(boundarySegments, qSegments);
    assembleLinePieces(pieces).forEach((item) => {
      appendPath(layer, {
        class: "road-intersection-outer-contour road-intersection-outer-contour-styled",
        d: pathFromPoints(item.points, false),
        ...strokeAttrsForContour(item.width, item.dashed)
      });
    });
  }

  function styleForQSegment(q, boundarySegments = lastOuterBoundarySegments, fallbackWidth = DEFAULT_LINE_STROKE_WIDTH) {
    let best = null;
    (boundarySegments || []).forEach((segment) => {
      if (segment.kind !== "side") return;
      const score = Math.min(
        dist(q.entry, segment.a), dist(q.entry, segment.b),
        dist(q.exit, segment.a), dist(q.exit, segment.b),
        perpendicularDistanceToLine(q.entry, segment.a, segment.b),
        perpendicularDistanceToLine(q.exit, segment.a, segment.b)
      );
      if (!best || score < best.score) best = { segment, score };
    });
    const style = best?.segment?.boundaryStyle;
    const first = normalizeContourSegments(style?.segments, style || { style: "solid", width: fallbackWidth })
      .find((item) => item.style !== "none") || { style: "solid", width: fallbackWidth };
    return {
      style: first.style === "dash" ? "dash" : "solid",
      width: contourLineWidth(first.width, fallbackWidth)
    };
  }

  function renderQCurveOutlines(layer, qSegments, boundarySegments, fallbackWidth) {
    (qSegments || []).forEach((item) => {
      const style = styleForQSegment(item, boundarySegments, fallbackWidth);
      if (style.style === "none") return;
      appendPath(layer, {
        class: "road-intersection-outer-contour road-intersection-outer-contour-q",
        d: qSegmentPath(item),
        ...strokeAttrsForContour(style.width, style.style === "dash")
      });
    });
  }

  function collectAuxiliaryContourDefinitions() {
    const definitions = [];
    (manager.getAll?.() || []).forEach((model) => {
      const adapter = manager.getAdapter?.(model);
      if (typeof adapter?.intersectionAuxiliaryContours !== "function") return;
      const items = adapter.intersectionAuxiliaryContours(model);
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        if (!Array.isArray(item?.points) || item.points.length < (item.closed ? 3 : 2)) return;
        definitions.push(item);
      });
    });
    return definitions;
  }

  function buildAuxiliaryContours(definitions) {
    return (definitions || []).map((item) => {
      const qSegments = [];
      const prefix = `aux:${String(item.id || item.ownerId || "contour")}:`;
      const cornerHints = Array.isArray(item.cornerHints) ? item.cornerHints : item.points;
      const blockedHints = Array.isArray(item.blockedHints) ? item.blockedHints : [];
      const d = item.closed
        ? smoothClosedPath(item.points, SMOOTH_RADIUS, cornerHints, blockedHints, qSegments, prefix)
        : smoothOpenPath(item.points, SMOOTH_RADIUS, cornerHints, blockedHints, qSegments, prefix);
      qSegments.forEach((segment) => {
        segment.auxiliaryId = item.id;
        segment.ownerId = item.ownerId;
      });
      return { ...item, d, qSegments };
    });
  }

  function auxiliaryFillPaint(item) {
    const style = item?.fillStyle;
    if (!style) return "none";
    const pattern = Kroki.StyleManager?.ensureFillPattern?.(manager.canvas, {
      id: item.fillModelId || item.id
    }, style);
    return pattern ? `url(#${pattern.id})` : (style.fill || "none");
  }

  function renderAuxiliaryContours(items, layer) {
    (items || []).forEach((item) => {
      if (!item?.d) return;
      if (item.fillStyle) {
        appendPath(layer, {
          class: "editor-road-pocket-island-fill",
          d: item.d,
          fill: auxiliaryFillPaint(item),
          "fill-opacity": String(item.fillStyle.fillOpacity ?? 1),
          stroke: "none",
          "data-road-pocket-island": item.side || "",
          "data-road-pocket-owner": item.ownerId || ""
        });
      }
      if (item.stroke !== "none") {
        appendPath(layer, {
          class: `${item.className || "road-intersection-auxiliary-contour"} road-intersection-auxiliary-contour`,
          d: item.d,
          fill: "none",
          stroke: item.stroke || "#000000",
          "stroke-width": String(item.strokeWidth || DEFAULT_LINE_STROKE_WIDTH),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "vector-effect": "none",
          "pointer-events": "none",
          "data-road-pocket-side": item.side || "",
          "data-road-pocket-boundary": item.role || "",
          "data-road-pocket-auto-junction": "true",
          "data-road-pocket-quadratic": "true"
        });
      }
      if (item.selected) {
        appendPath(layer, {
          class: "editor-road-pocket-island-highlight",
          d: item.d,
          "data-road-pocket-island-selection": item.side || ""
        });
      }
    });
  }

  function renderContours(contours, layer, qSegments = lastQSegments) {
    const fallbackWidth = contourStrokeWidth(lastRoadSurfaces.filter((surface) => lastMemberIds.has(surface.id)));
    renderStyledBoundaryContours(layer, lastOuterBoundarySegments, qSegments);
    renderQCurveOutlines(layer, qSegments, lastOuterBoundarySegments, fallbackWidth);
    contours.forEach((contour, index) => {
      if (debug) {
        appendPath(layer, {
          class: "road-intersection-debug-raw-contour",
          d: contour.rawD || pathFromPoints(contour.points, true),
          fill: "none",
          stroke: "rgba(249,115,22,.55)",
          "stroke-width": "1.2",
          "stroke-dasharray": "8 6",
          "data-contour-index": index
        });
      }
    });
  }

  function renderDebugShapes(shapes, layer) {
    if (!debug) return;
    shapes.forEach((shape, index) => {
      appendPath(layer, {
        class: "road-intersection-debug-shape",
        d: shape.d || pathFromPoints(shape.points, true),
        fill: "rgba(249,115,22,.10)",
        stroke: "rgba(249,115,22,.75)",
        "stroke-width": "1.4",
        "data-intersection-index": index,
        "data-road-ids": shape.roadIds.join(" ")
      });
    });
  }


  function qHandleSizes() {
    // Boyutlar ekran pikseli üzerinden sabit tutulur. SVG viewBox zoom yaptığında
    // circle radius/stroke-width otomatik sabit kalmaz; bu yüzden viewBox değişiminde
    // syncQHandleMetrics() ile tekrar SVG unit'e çevrilip yazılır.
    const unit = utils.svgUnitsPerScreenPx?.(manager.canvas) || 1;
    return {
      unit,
      visualRadius: 24 * unit,
      hitRadius: 36 * unit,
      controlVisualRadius: 18 * unit,
      controlHitRadius: 30 * unit,
      hitStroke: 30 * unit,
      guideStroke: Math.max(1.4 * unit, 0.8)
    };
  }

  function syncQHandleMetrics() {
    const layer = manager.canvas?.querySelector?.("#roadIntersectionContourLayer");
    if (!layer) return;
    const sizes = qHandleSizes();

    layer.querySelectorAll(".road-intersection-q-hit").forEach((node) => {
      node.setAttribute("stroke-width", fmt(sizes.hitStroke));
    });

    layer.querySelectorAll(".road-intersection-q-selected").forEach((node) => {
      node.setAttribute("stroke-width", fmt(Math.max(2.2 * sizes.unit, sizes.guideStroke * 2.2)));
    });

    layer.querySelectorAll(".road-intersection-q-guide").forEach((node) => {
      node.setAttribute("stroke-width", fmt(sizes.guideStroke));
      node.setAttribute("stroke-dasharray", `${fmt(sizes.guideStroke * 4)} ${fmt(sizes.guideStroke * 3)}`);
    });

    layer.querySelectorAll(".road-intersection-q-fixed-control").forEach((node) => {
      node.setAttribute("r", fmt(5 * sizes.unit));
      node.setAttribute("stroke-width", fmt(1.5 * sizes.unit));
    });

    layer.querySelectorAll(".road-intersection-q-control-hit").forEach((node) => {
      node.setAttribute("r", fmt(sizes.controlHitRadius));
    });

    layer.querySelectorAll(".road-intersection-q-control-visual").forEach((node) => {
      node.setAttribute("r", fmt(sizes.controlVisualRadius));
      node.setAttribute("stroke-width", fmt(3 * sizes.unit));
    });

    layer.querySelectorAll(".road-intersection-q-endpoint-hit").forEach((node) => {
      node.setAttribute("r", fmt(sizes.hitRadius));
    });

    layer.querySelectorAll(".road-intersection-q-endpoint-visual").forEach((node) => {
      node.setAttribute("r", fmt(sizes.visualRadius));
      node.setAttribute("stroke-width", fmt(3 * sizes.unit));
    });
  }

  function qSegmentByKey(key) {
    return lastQSegments.find((item) => item.key === key) || null;
  }

  function canInteractWithQ() {
    const activeModel = Kroki.SelectionManager?.getActiveModel?.();
    if (activeModel) return activeModel.type === "road";
    if (window.krokiEditorState?.getActiveTool?.()) return false;
    return true;
  }

  function blockQEvent(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  }

  function selectQSegment(key) {
    selectedQKey = qKeyTouchesIsland(key) ? "" : (key || "");
    render();
  }

  function updateQEndpointEdit(item, side, point) {
    if (!isEditableQSegment(item) || !side || !point) return false;
    const current = { ...(qEndpointEdits.get(item.key) || {}) };
    const previous = side === "entry" ? current.entryCut : current.exitCut;
    const nextCut = qCutFromPoint(item, side === "entry" ? "entry" : "exit", point);
    if (Number.isFinite(previous) && Math.abs(previous - nextCut) < 0.01) return false;
    if (side === "entry") current.entryCut = nextCut;
    else current.exitCut = nextCut;
    qEndpointEdits.set(item.key, current);
    return true;
  }

  function updateQControlEdit(item, point) {
    if (!isEditableQSegment(item) || !point) return false;
    const baseControl = item.baseControl || item.control;
    const nextDx = point.x - baseControl.x;
    const nextDy = point.y - baseControl.y;
    const current = { ...(qEndpointEdits.get(item.key) || {}) };
    const previousDx = numberOr(current.controlDx, 0);
    const previousDy = numberOr(current.controlDy, 0);
    if (Math.hypot(previousDx - nextDx, previousDy - nextDy) < 0.01) return false;
    if (Math.abs(nextDx) < 0.01) delete current.controlDx;
    else current.controlDx = nextDx;
    if (Math.abs(nextDy) < 0.01) delete current.controlDy;
    else current.controlDy = nextDy;
    qEndpointEdits.set(item.key, current);
    return true;
  }

  function stopQEndpointDrag(event) {
    if (!qEndpointDrag) return;
    const drag = qEndpointDrag;
    const pointerId = event?.pointerId ?? drag.pointerId;
    try {
      if (pointerId != null && manager.canvas.hasPointerCapture?.(pointerId)) manager.canvas.releasePointerCapture(pointerId);
    } catch (_) {}
    qEndpointDrag = null;
    window.removeEventListener("pointermove", handleQEndpointDrag, true);
    window.removeEventListener("pointerup", stopQEndpointDrag, true);
    window.removeEventListener("pointercancel", stopQEndpointDrag, true);
    if (drag.moved) Kroki.HistoryManager?.commit?.(drag.transaction, "Kavsak Q duzenle");
    scheduleRefresh();
  }

  function handleQEndpointDrag(event) {
    if (!qEndpointDrag || event.pointerId !== qEndpointDrag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const item = qSegmentByKey(qEndpointDrag.key);
    if (!item) return;
    const point = svgPointFromEvent(event);
    const moved = qEndpointDrag.side === "control"
      ? updateQControlEdit(item, point)
      : updateQEndpointEdit(item, qEndpointDrag.side, point);
    if (moved) qEndpointDrag.moved = true;
    render();
  }

  function startQEndpointDrag(event, key, side) {
    if (!canInteractWithQ()) {
      blockQEvent(event);
      return;
    }
    const item = qSegmentByKey(key);
    if (!isEditableQSegment(item)) {
      blockQEvent(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectedQKey = key;
    qEndpointDrag = {
      pointerId: event.pointerId,
      key,
      side,
      moved: false,
      transaction: Kroki.HistoryManager?.begin?.("Kavsak Q duzenle")
    };
    if (event.isTrusted !== false) {
      try { manager.canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
    }
    window.addEventListener("pointermove", handleQEndpointDrag, true);
    window.addEventListener("pointerup", stopQEndpointDrag, true);
    window.addEventListener("pointercancel", stopQEndpointDrag, true);
  }

  function startQControlDrag(event, key) {
    startQEndpointDrag(event, key, "control");
  }

  function createQControlHandle(item, sizes) {
    const point = item.control;
    const group = createSvgElement("g", {
      class: "editor-object-cp road-intersection-q-control",
      "data-q-key": item.key,
      "data-q-side": "control",
      "pointer-events": "all",
      cursor: "move"
    });
    const hit = createSvgElement("circle", {
      class: "editor-object-cp-hit road-intersection-q-control-hit",
      cx: fmt(point.x),
      cy: fmt(point.y),
      r: fmt(sizes.controlHitRadius),
      fill: "transparent",
      stroke: "transparent",
      "pointer-events": "all"
    });
    const visual = createSvgElement("circle", {
      class: "editor-object-cp-visual road-intersection-q-control-visual",
      cx: fmt(point.x),
      cy: fmt(point.y),
      r: fmt(sizes.controlVisualRadius),
      fill: "#ffffff",
      stroke: "#f97316",
      "stroke-width": fmt(3 * sizes.unit),
      "pointer-events": "none",
      "vector-effect": "none"
    });
    group.append(hit, visual);
    group.addEventListener("pointerdown", (event) => startQControlDrag(event, item.key), true);
    return group;
  }

  function createQEndpointHandle(item, side, sizes) {
    const point = side === "entry" ? item.entry : item.exit;
    const group = createSvgElement("g", {
      class: `editor-object-cp road-intersection-q-endpoint road-intersection-q-endpoint-${side}`,
      "data-q-key": item.key,
      "data-q-side": side,
      "pointer-events": "all",
      cursor: "grab"
    });
    const hit = createSvgElement("circle", {
      class: "editor-object-cp-hit road-intersection-q-endpoint-hit",
      cx: fmt(point.x),
      cy: fmt(point.y),
      r: fmt(sizes.hitRadius),
      fill: "transparent",
      stroke: "transparent",
      "pointer-events": "all"
    });
    const visual = createSvgElement("circle", {
      class: "editor-object-cp-visual road-intersection-q-endpoint-visual",
      cx: fmt(point.x),
      cy: fmt(point.y),
      r: fmt(sizes.visualRadius),
      fill: "#fed7aa",
      stroke: "#f97316",
      "stroke-width": fmt(3 * sizes.unit),
      "pointer-events": "none",
      "vector-effect": "none"
    });
    group.append(hit, visual);
    group.addEventListener("pointerdown", (event) => startQEndpointDrag(event, item.key, side), true);
    return group;
  }

  function renderQInteractivity(layer, segments) {
    // Ada bağlantılarındaki otomatik Q'lar düzgün ağız geometrisini korur; kullanıcı
    // editi ise uçları çember boyunca taşıyıp dış kontur kalıntısı üretebildiği için kapalıdır.
    const items = (Array.isArray(segments) ? segments : []).filter(isEditableQSegment);
    if (selectedQKey && !items.some((item) => item.key === selectedQKey)) selectedQKey = "";
    const sizes = qHandleSizes();
    items.forEach((item) => {
      const isSelected = item.key === selectedQKey;
      const hit = appendPath(layer, {
        class: `road-intersection-q-hit${isSelected ? " is-selected" : ""}`,
        d: qSegmentPath(item),
        fill: "none",
        stroke: "transparent",
        "stroke-width": fmt(sizes.hitStroke),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "pointer-events": "stroke",
        "data-q-key": item.key,
        cursor: "pointer"
      });
      hit.addEventListener("pointerdown", (event) => {
        if (!canInteractWithQ()) {
          blockQEvent(event);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        // Q parçasına ilk dokunuş önseçim/edit başlatır; seçiliyken tekrar Q çizgisine
        // veya CP dışındaki alana dokunmak düzenlemeyi bitirir.
        selectedQKey = selectedQKey === item.key ? "" : item.key;
        render();
      }, true);
      if (isSelected) {
        appendPath(layer, {
          class: "road-intersection-q-selected",
          d: qSegmentPath(item),
          fill: "none",
          stroke: "#f97316",
          "stroke-width": fmt(Math.max(2.2 * sizes.unit, sizes.guideStroke * 2.2)),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "pointer-events": "none"
        });
        appendPath(layer, {
          class: "road-intersection-q-guide",
          d: `M ${fmt(item.entry.x)} ${fmt(item.entry.y)} L ${fmt(item.control.x)} ${fmt(item.control.y)} L ${fmt(item.exit.x)} ${fmt(item.exit.y)}`,
          fill: "none",
          stroke: "rgba(249,115,22,.45)",
          "stroke-width": fmt(sizes.guideStroke),
          "stroke-dasharray": `${fmt(sizes.guideStroke * 4)} ${fmt(sizes.guideStroke * 3)}`,
          "pointer-events": "none"
        });
        layer.append(createQControlHandle(item, sizes), createQEndpointHandle(item, "entry", sizes), createQEndpointHandle(item, "exit", sizes));
      }
    });
  }

  function resetQEndpointEdits() {
    const transaction = Kroki.HistoryManager?.begin?.("Kavsak Q sifirla");
    qEndpointEdits = new Map();
    selectedQKey = "";
    scheduleRefresh();
    Kroki.HistoryManager?.commit?.(transaction, "Kavsak Q sifirla");
  }

  function pruneMissingQEdits(segments) {
    const liveKeys = new Set((segments || []).map((item) => item.key).filter(Boolean));
    Array.from(qEndpointEdits.keys()).forEach((key) => {
      if (!liveKeys.has(key) || qKeyTouchesIsland(key)) qEndpointEdits.delete(key);
    });
  }

  function render() {
    const renderStartedAt = performance.now();
    const timings = {};
    const mark = (name, startedAt) => {
      timings[name] = performance.now() - startedAt;
      return performance.now();
    };
    scheduled = 0;
    if (suspended) return;
    let phaseStartedAt = performance.now();
    const layer = contourLayer();
    layer.replaceChildren();

    const previousMemberIds = new Set(lastMemberIds);
    const previousIntersectionShapes = lastIntersectionShapes;
    clearClasses(previousMemberIds);

    const surfaces = collectRoads();
    phaseStartedAt = mark("collectRoadsMs", phaseStartedAt);
    lastRoadSurfaces = surfaces;
    buildLaneSplitMetadata(surfaces);
    updateContourMask(layer, surfaces);
    lastIntersectionShapes = [];
    lastOuterContours = [];
    lastSmoothedContours = [];
    lastOuterBoundarySegments = [];
    lastMemberIds = new Set();
    lastQSegments = [];
    visibleRangeCache = new Map();

    const intersectionResult = surfaces.length >= 2
      ? findIntersectionShapes(surfaces)
      : { shapes: [], memberIds: new Set() };
    phaseStartedAt = mark("findIntersectionsMs", phaseStartedAt);
    const { shapes, memberIds, candidatePairCount = 0 } = intersectionResult;
    lastIntersectionShapes = shapes;
    lastMemberIds = memberIds;
    memberIds.forEach((id) => manager.getElement?.(id)?.classList.add("is-road-intersection-member"));

    const memberSurfaces = surfaces.filter((surface) => memberIds.has(surface.id));
    const contours = shapes.length ? buildOuterContours(memberSurfaces, shapes) : [];
    phaseStartedAt = mark("buildOuterContoursMs", phaseStartedAt);
    lastOuterContours = contours;
    lastSmoothedContours = contours;
    const intersectionQSegments = contours.flatMap((contour) => contour.qSegments || []);

    const affectedIds = new Set();
    if (fullRoadRerenderNeeded) {
      previousMemberIds.forEach((id) => affectedIds.add(id));
      memberIds.forEach((id) => affectedIds.add(id));
    } else {
      previousMemberIds.forEach((id) => {
        if (!memberIds.has(id)) affectedIds.add(id);
      });
      memberIds.forEach((id) => {
        if (!previousMemberIds.has(id)) affectedIds.add(id);
      });
      dirtyRoadIds.forEach((id) => affectedIds.add(id));
      [...previousIntersectionShapes, ...shapes].forEach((shape) => {
        if ((shape.roadIds || []).some((id) => dirtyRoadIds.has(id))) {
          (shape.roadIds || []).forEach((id) => affectedIds.add(id));
        }
      });
    }
    lastQSegments = intersectionQSegments;
    rerenderRoads(affectedIds);
    phaseStartedAt = mark("rerenderRoadsMs", phaseStartedAt);
    dirtyRoadIds = new Set();
    fullRoadRerenderNeeded = false;

    const auxiliaryContours = buildAuxiliaryContours(collectAuxiliaryContourDefinitions());
    phaseStartedAt = mark("buildAuxiliaryContoursMs", phaseStartedAt);
    const auxiliaryQSegments = auxiliaryContours.flatMap((contour) => contour.qSegments || []);
    lastQSegments = [...intersectionQSegments, ...auxiliaryQSegments];
    pruneMissingQEdits(lastQSegments);
    if (selectedQKey && !lastQSegments.some((item) => item.key === selectedQKey)) selectedQKey = "";

    if (shapes.length) {
      renderContours(contours, layer, intersectionQSegments);
      renderDebugShapes(shapes, layer);
    }
    renderAuxiliaryContours(auxiliaryContours, layer);
    renderQInteractivity(layer, lastQSegments);
    mark("renderContoursAndQMs", phaseStartedAt);
    lastDiagnostics = {
      ...timings,
      totalMs: performance.now() - renderStartedAt,
      roadCount: surfaces.length,
      pairCount: surfaces.length * Math.max(0, surfaces.length - 1) / 2,
      candidatePairCount,
      intersectionShapeCount: shapes.length,
      memberRoadCount: memberIds.size,
      contourCount: contours.length,
      qSegmentCount: lastQSegments.length,
      affectedRoadCount: affectedIds.size
    };
  }

  function scheduleRefresh() {
    if (suspended || renderingRoads) return;
    if (scheduled) return;
    scheduled = window.requestAnimationFrame?.(render) || window.setTimeout(render, 16);
  }

  function setSuspended(value, options = {}) {
    const next = Boolean(value);
    if (suspended === next) return;
    suspended = next;
    if (suspended) {
      if (scheduled) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(scheduled);
        else window.clearTimeout(scheduled);
        scheduled = 0;
      }
      if (options.clear !== false) {
        clearLayer();
        clearClasses();
        rerenderRoads(lastMemberIds);
      }
      return;
    }
    scheduleRefresh();
  }
  function isQInteractionTarget(target) {
    return Boolean(target?.closest?.(".road-intersection-q-endpoint,.road-intersection-q-control,.road-intersection-q-hit"));
  }

  function handleCanvasQOutsidePointerDown(event) {
    if (!selectedQKey || qEndpointDrag) return;
    // CP dışında bir yere dokunulursa Q düzenleme biter. Q çizgisine dokunma ise
    // kendi handler'ında toggle/select olarak ele alınır; burada karışmayız.
    if (isQInteractionTarget(event.target)) return;
    selectedQKey = "";
    render();
  }


  function scheduleQMetricSync() {
    if (qMetricSyncFrame) return;
    qMetricSyncFrame = window.requestAnimationFrame?.(() => {
      qMetricSyncFrame = 0;
      syncQHandleMetrics();
    }) || window.setTimeout(() => {
      qMetricSyncFrame = 0;
      syncQHandleMetrics();
    }, 16);
  }

  function isRoadModel(model) {
    return model?.type === "road";
  }

  function managerMutationTouchesRoad(name, args, result, beforeModel) {
    if (name === "clear" || name === "replaceAll") return true;
    if (name === "create") return args?.[0] === "road" || isRoadModel(result);
    if (name === "add") return isRoadModel(args?.[0]) || isRoadModel(result);
    if (name === "updateModel" || name === "updateGeometry" || name === "remove") {
      return isRoadModel(beforeModel) || isRoadModel(result);
    }
    return true;
  }

  function patchManager() {
    if (patchDone || !manager) return;
    patchDone = true;
    manager.canvas?.addEventListener?.("pointerdown", handleCanvasQOutsidePointerDown, true);
    manager.canvas?.addEventListener?.("kroki:viewboxchange", scheduleQMetricSync);
    window.addEventListener("resize", scheduleQMetricSync);
    ["create", "add", "updateModel", "updateGeometry", "remove", "clear", "replaceAll"].forEach((name) => {
      const original = manager[name];
      if (typeof original !== "function" || original.__roadIntersectionPatched) return;
      const wrapped = function roadIntersectionPatched(...args) {
        const beforeModel = (name === "updateModel" || name === "updateGeometry" || name === "remove")
          ? manager.get?.(args[0])
          : null;
        const result = original.apply(this, args);
        if (!renderingRoads && managerMutationTouchesRoad(name, args, result, beforeModel)) {
          if (name === "clear" || name === "replaceAll") {
            fullRoadRerenderNeeded = true;
            dirtyRoadIds = new Set();
            roadSurfaceCache.clear();
          } else {
            const roadId = isRoadModel(result) ? result.id : (isRoadModel(beforeModel) ? beforeModel.id : "");
            if (roadId) {
              dirtyRoadIds.add(roadId);
              if (name === "remove") roadSurfaceCache.delete(roadId);
            }
          }
          if (name === "clear") clear();
          else scheduleRefresh();
        }
        return result;
      };
      wrapped.__roadIntersectionPatched = true;
      manager[name] = wrapped;
    });
  }

  patchManager();

  Kroki.RoadIntersectionEngine = {
    rebuild: render,
    clear,
    clearIntersectionLayer: clear,
    scheduleRefresh,
    setSuspended,
    isSuspended() { return suspended; },
    setDebug(value) { debug = Boolean(value); scheduleRefresh(); },
    isRoadMember(id) { return Boolean(!suspended && lastMemberIds.has(id)); },
    visibleRangesForLine,
    terminalHostDashedRangesForLine,
    getLastRoadSurfaces() { return lastRoadSurfaces.map((surface) => ({ id: surface.id, width: surface.width, polygon: surface.polygon.slice() })); },
    getLastOuterContours() { return lastOuterContours.map((item) => ({ points: item.points.slice(), closed: Boolean(item.closed), d: item.d, rawD: item.rawD, strokeWidth: item.strokeWidth })); },
    getLastIntersectionShapes() { return lastIntersectionShapes.map((item) => ({ roadIds: item.roadIds.slice(), points: item.points.slice(), d: item.d })); },
    getLastSmoothedContours() { return lastSmoothedContours.map((item) => ({ points: item.points.slice(), closed: Boolean(item.closed), d: item.d, strokeWidth: item.strokeWidth })); },
    getLastQSegments() { return lastQSegments.map((item) => ({ key: item.key, entry: item.entry, control: item.control, exit: item.exit, d: qSegmentPath(item) })); },
    getDiagnostics() { return lastDiagnostics ? { ...lastDiagnostics } : null; },
    exportState,
    importState,
    resetQEndpointEdits,
    clearQSelection() { selectedQKey = ""; scheduleRefresh(); }
  };

  window.addEventListener("load", scheduleRefresh, { once: true });
  scheduleRefresh();
})();
