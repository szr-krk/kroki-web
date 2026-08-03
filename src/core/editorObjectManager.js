(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const styleManager = Kroki.StyleManager;
  const strokeStyle = window.krokiStrokeStyle;
  if (!utils || !registry || !styleManager || !strokeStyle) return;

  const LABEL_LINE_GAP_PX = 3;
  const TEXT_EDGE_INSET_MIN = 3;
  const TEXT_EDGE_INSET_MAX = 9;
  const TEXT_EDGE_INSET_RATIO = 0.055;
  const TEXT_LINE_HEIGHT = 1.18;
  const TEXT_WIDTH_FACTOR = 0.56;
  const objectMap = new Map();
  const elementMap = new Map();
  let idSeed = 1;
  let viewportLabelFrame = 0;
  let sceneVersion = 0;
  let objectOrderCache = null;

  const canvas = document.querySelector("#editorCanvas");
  const objectLayer = document.querySelector("#editorObjects");

  function markSceneChanged(options = {}) {
    sceneVersion += 1;
    if (options.models !== false) objectOrderCache = null;
    if (options.order !== false) {
      Kroki.HitTestManager?.scheduleWarmup?.();
    }
  }

  function generateId() {
    let id;
    do {
      id = "obj_" + Date.now().toString(36) + "_" + (idSeed += 1).toString(36);
    } while (objectMap.has(id));
    return id;
  }

  function withHistory(options, label, operation) {
    if (options?.skipHistory || Kroki.HistoryManager?.isSuspended?.()) return operation();
    const historyLabel = options?.historyLabel || options?.label || label;
    const transaction = Kroki.HistoryManager?.begin?.(historyLabel);
    const result = operation();
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, historyLabel);
    return result;
  }

  function normalizeModel(model) {
    const type = model?.type || "";
    return {
      id: model?.id || generateId(),
      type,
      geometry: utils.clonePlain(model?.geometry),
      style: styleManager.normalizeStyle(model?.style, type),
      label: styleManager.normalizeLabel(model?.label, type),
      metadata: utils.clonePlain(model?.metadata)
    };
  }

  function adapterFor(modelOrType) {
    return registry.get(typeof modelOrType === "string" ? modelOrType : modelOrType?.type);
  }

  function createElementFor(model) {
    const adapter = adapterFor(model);
    const element = utils.createSvgElement(adapter.elementTag || "path");
    return element;
  }

  function setObjectElementData(element, model, adapter) {
    element.dataset.krokiObject = "true";
    element.dataset.objectId = model.id;
    element.dataset.shape = model.type;
    element.classList.add("editor-object");
    if (adapter.className) element.classList.add(adapter.className);
  }

  function labelNodesFor(id) {
    return Array.from(objectLayer.querySelectorAll(`[data-label-for="${id}"]`));
  }

  function isFiniteBounds(bounds) {
    return Boolean(
      bounds &&
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.y) &&
      Number.isFinite(bounds.width) &&
      Number.isFinite(bounds.height) &&
      bounds.width >= 0 &&
      bounds.height >= 0
    );
  }

  function unionBounds(first, second) {
    if (!isFiniteBounds(first)) return isFiniteBounds(second) ? { ...second } : null;
    if (!isFiniteBounds(second)) return { ...first };
    const minX = Math.min(first.x, second.x);
    const minY = Math.min(first.y, second.y);
    const maxX = Math.max(first.x + first.width, second.x + second.width);
    const maxY = Math.max(first.y + first.height, second.y + second.height);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  function expandBounds(bounds, amount) {
    if (!isFiniteBounds(bounds)) return null;
    const pad = Math.max(0, Number(amount) || 0);
    return {
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2
    };
  }

  function boundsFromPoints(points) {
    const usable = (Array.isArray(points) ? points : []).filter((point) => (
      Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ));
    if (!usable.length) return null;
    const xs = usable.map((point) => point.x);
    const ys = usable.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY
    };
  }

  function rotatePoint(point, center, rotation) {
    const radians = (Number(rotation) || 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  }

  function rotatedBounds(bounds, center, rotation) {
    const angle = Number(rotation) || 0;
    if (!isFiniteBounds(bounds) || !Number.isFinite(center?.x) || !Number.isFinite(center?.y) || !angle) {
      return bounds;
    }
    return boundsFromPoints([
      rotatePoint({ x: bounds.x, y: bounds.y }, center, angle),
      rotatePoint({ x: bounds.x + bounds.width, y: bounds.y }, center, angle),
      rotatePoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, center, angle),
      rotatePoint({ x: bounds.x, y: bounds.y + bounds.height }, center, angle)
    ]) || bounds;
  }

  function transformedModelBounds(model, bounds) {
    const geometry = model?.geometry || {};
    const rotation = Number(geometry.rotation) || 0;
    if (!rotation) return bounds;
    if (model.type === "rectangle" || model.type === "ellipse") {
      return rotatedBounds(bounds, { x: geometry.cx, y: geometry.cy }, rotation);
    }
    if (model.type === "text") {
      return rotatedBounds(bounds, {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      }, rotation);
    }
    return bounds;
  }

  function hasArrow(value) {
    return Boolean(value && value !== "none");
  }

  function visualStrokePad(model, adapter) {
    const capabilities = adapter?.capabilities || {};
    if (
      capabilities.roadObject ||
      capabilities.vehicleObject ||
      capabilities.trafficSign ||
      capabilities.otherSymbol
    ) {
      return 0;
    }

    const strokeWidth = Math.max(0, Number(model?.style?.strokeWidth) || 0);
    let pad = strokeWidth / 2;
    if (capabilities.arrows && (hasArrow(model?.style?.arrowStart) || hasArrow(model?.style?.arrowEnd))) {
      const visualStroke = Math.max(3, strokeWidth);
      pad = Math.max(pad, visualStroke * 2 + 10);
    }
    return pad;
  }

  function boundsFromElement(element) {
    if (!element?.getBBox) return null;
    try {
      const box = element.getBBox();
      return isFiniteBounds(box)
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : null;
    } catch {
      return null;
    }
  }

  function boundsForModel(model) {
    const adapter = adapterFor(model);
    const element = elementMap.get(model?.id);
    const adapterBounds = typeof adapter?.getBounds === "function" ? adapter.getBounds(model) : null;
    let bounds = isFiniteBounds(adapterBounds) ? adapterBounds : boundsFromElement(element);
    if (!isFiniteBounds(bounds)) return null;
    bounds = transformedModelBounds(model, bounds);
    bounds = expandBounds(bounds, visualStrokePad(model, adapter));
    labelNodesFor(model.id).forEach((label) => {
      bounds = unionBounds(bounds, boundsFromElement(label));
    });
    return bounds;
  }

  function getContentBounds() {
    return getObjectsInDomOrder().reduce((bounds, model) => unionBounds(bounds, boundsForModel(model)), null);
  }

  function layerNodesFor(id) {
    const element = elementMap.get(id);
    return element ? [element, ...labelNodesFor(id)] : [];
  }

  function isRoadLayerNode(node) {
    return Boolean(node?.dataset?.krokiObject === "true" && node.dataset.shape === "road");
  }

  function isRoadStackLayerNode(node) {
    return Boolean(isRoadLayerNode(node) || node?.dataset?.roadIntersectionLayer === "true");
  }

  function isRoadObjectId(id) {
    return objectMap.get(id)?.type === "road";
  }

  function keepRoadLayersAtBack() {
    if (!objectLayer) return;
    const roadStackNodes = Array.from(objectLayer.children).filter(isRoadStackLayerNode);
    if (!roadStackNodes.length) return;
    roadStackNodes
      .reverse()
      .forEach((node) => objectLayer.insertBefore(node, objectLayer.firstChild));
    objectOrderCache = null;
  }

  function firstMovableLayerNode(exclude = new Set()) {
    return Array.from(objectLayer.children)
      .find((node) => !exclude.has(node) && !isRoadStackLayerNode(node)) || null;
  }

  function removeLabelArtifacts(id) {
    objectLayer.querySelectorAll(`[data-label-for="${id}"], [data-for-line="${id}"], [data-for-shape="${id}"], [data-for-ellipse="${id}"]`).forEach((node) => node.remove());
    canvas.querySelectorAll(`[data-label-path-for="${id}"], [data-label-clip-for="${id}"], #editor-line-label-path-${id}, #editor-circle-clip-${id}, #editor-ellipse-clip-${id}`).forEach((node) => node.remove());
  }

  function hasLabelArtifacts(id) {
    return Boolean(
      objectLayer.querySelector(`[data-label-for="${id}"], [data-for-line="${id}"], [data-for-shape="${id}"], [data-for-ellipse="${id}"]`) ||
      canvas.querySelector(`[data-label-path-for="${id}"], [data-label-clip-for="${id}"], #editor-line-label-path-${id}, #editor-circle-clip-${id}, #editor-ellipse-clip-${id}`)
    );
  }

  function ensureDefs() {
    let defs = canvas.querySelector("#editorObjectDefs");
    if (defs) return defs;
    defs = utils.createSvgElement("defs", { id: "editorObjectDefs" });
    canvas.insertBefore(defs, canvas.firstChild);
    return defs;
  }

  function ensureLabelPath(model) {
    const id = "editor-line-label-path-" + model.id;
    let path = document.getElementById(id);
    if (path) return path;
    path = utils.createSvgElement("path", {
      id,
      "data-label-path-for": model.id,
      class: "editor-line-label-path",
      fill: "none",
      stroke: "none"
    });
    ensureDefs().append(path);
    return path;
  }

  function ensureShapeClip(model, tag) {
    const id = "editor-" + model.type + "-clip-" + model.id;
    let clipPath = document.getElementById(id);
    if (clipPath) return clipPath;
    clipPath = utils.createSvgElement("clipPath", {
      id,
      "data-label-clip-for": model.id,
      clipPathUnits: "userSpaceOnUse"
    });
    clipPath.append(utils.createSvgElement(tag));
    ensureDefs().append(clipPath);
    return clipPath;
  }

  function labelPathId(model) {
    return "editor-line-label-path-" + model.id;
  }

  function labelClipId(model) {
    return "editor-" + model.type + "-clip-" + model.id;
  }

  function labelFor(model, className, tag = "text") {
    let label = objectLayer.querySelector(`[data-label-for="${model.id}"]`);
    if (label) return label;
    label = utils.createSvgElement(tag, {
      class: className,
      "data-label-for": model.id,
      "dominant-baseline": "middle"
    });
    const element = elementMap.get(model.id);
    const parent = element?.parentNode || objectLayer;
    if (element?.nextSibling) parent.insertBefore(label, element.nextSibling);
    else parent.append(label);
    return label;
  }

  function labelVerticalMetrics(label, fallbackSize) {
    try {
      const box = label.getBBox();
      if (Number.isFinite(box.y) && Number.isFinite(box.height) && box.height > 0) {
        return {
          top: Math.max(0, -box.y),
          bottom: Math.max(0, box.y + box.height)
        };
      }
    } catch {
      return { top: fallbackSize * 0.5, bottom: fallbackSize * 0.5 };
    }
    return { top: fallbackSize * 0.5, bottom: fallbackSize * 0.5 };
  }

  function applyLineLabelStyle(label, model, anchor) {
    label.setAttribute("fill", model.label.color);
    label.setAttribute("font-size", String(model.label.size));
    strokeStyle.applyOpacity(label, model.label.opacity);
    label.setAttribute("text-anchor", anchor.anchor);
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("x", "0");
    label.setAttribute("y", "0");
    label.removeAttribute("transform");
  }

  function renderStraightLineLabel(model, adapter, text) {
    const constants = styleManager.constants;
    const side = strokeStyle.choiceById(constants.TEXT_SIDES, model.label.position.side);
    const anchor = strokeStyle.choiceById(constants.TEXT_ANCHORS, model.label.position.anchor);
    const start = adapter.pointAt(model, 0);
    const end = adapter.pointAt(model, 1);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const rawAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    const reverse = rawAngle > 90 || rawAngle < -90;
    const textStart = reverse ? end : start;
    const textEnd = reverse ? start : end;
    const textDx = textEnd.x - textStart.x;
    const textDy = textEnd.y - textStart.y;
    let angle = reverse ? rawAngle + 180 : rawAngle;
    if (angle > 180) angle -= 360;
    const angleRadians = angle * Math.PI / 180;
    const normal = { x: -Math.sin(angleRadians), y: Math.cos(angleRadians) };
    const label = labelFor(model, "editor-line-label");
    const path = document.getElementById(labelPathId(model));
    if (path) path.remove();

    applyLineLabelStyle(label, model, anchor);
    label.replaceChildren();
    label.textContent = text;

    const unit = utils.svgUnitsPerScreenPx(canvas);
    const clearance = (model.style.strokeWidth / 2 + LABEL_LINE_GAP_PX) * unit;
    const metrics = labelVerticalMetrics(label, model.label.size);
    let offset = 0;
    if (side.id === "above") offset = -(metrics.bottom + clearance);
    if (side.id === "below") offset = metrics.top + clearance;

    const x = textStart.x + textDx * anchor.t + normal.x * offset;
    const y = textStart.y + textDy * anchor.t + normal.y * offset;
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(y));
    label.setAttribute("transform", `rotate(${angle} ${x} ${y})`);
  }

  function renderPathLabel(model, adapter, text) {
    const constants = styleManager.constants;
    const side = strokeStyle.choiceById(constants.TEXT_SIDES, model.label.position.side);
    const anchor = strokeStyle.choiceById(constants.TEXT_ANCHORS, model.label.position.anchor);
    const rawAngle = adapter.midpointTangentAngle(model, false);
    const reverse = rawAngle > 90 || rawAngle < -90;
    const label = labelFor(model, "editor-line-label");
    const path = ensureLabelPath(model);
    let textPath = label.querySelector("textPath");

    if (!textPath) {
      label.replaceChildren();
      textPath = utils.createSvgElement("textPath");
      label.append(textPath);
    }

    applyLineLabelStyle(label, model, anchor);
    textPath.setAttribute("href", "#" + labelPathId(model));
    textPath.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#" + labelPathId(model));
    textPath.setAttribute("startOffset", `${anchor.t * 100}%`);
    textPath.setAttribute("text-anchor", anchor.anchor);
    textPath.setAttribute("method", "align");
    textPath.setAttribute("spacing", "auto");
    textPath.textContent = text;

    const unit = utils.svgUnitsPerScreenPx(canvas);
    const clearance = (model.style.strokeWidth / 2 + LABEL_LINE_GAP_PX) * unit;
    let offset = 0;
    if (side.id === "above") offset = -(model.label.size * 0.5 + clearance);
    if (side.id === "below") offset = model.label.size * 0.5 + clearance;
    path.setAttribute("d", adapter.offsetPathData(model, offset, reverse));
  }

  function wrapParagraph(paragraph, maxChars) {
    if (!paragraph.trim()) return [""];
    const words = paragraph.trim().split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const chunks = [];
      for (let index = 0; index < word.length; index += maxChars) {
        chunks.push(word.slice(index, index + maxChars));
      }
      chunks.forEach((chunk) => {
        const candidate = line ? line + " " + chunk : chunk;
        if (candidate.length <= maxChars) {
          line = candidate;
          return;
        }
        if (line) lines.push(line);
        line = chunk;
      });
    });
    if (line) lines.push(line);
    return lines;
  }

  function lineOffset(index, count, lineHeight) {
    return -((count - 1) * lineHeight) / 2 + index * lineHeight;
  }

  function lineVerticalExtent(offset, lineHeight) {
    return Math.abs(offset) + lineHeight * 0.54;
  }

  function textEdgeInset(primaryRadius, strokeWidth) {
    const shapeInset = Math.min(TEXT_EDGE_INSET_MAX, Math.max(TEXT_EDGE_INSET_MIN, primaryRadius * TEXT_EDGE_INSET_RATIO));
    return Math.max(1, strokeWidth / 2 + shapeInset);
  }

  function wrappedTextLines(text, widthRadius, baseSize) {
    const fontSize = styleManager.normalizeLabelSize(baseSize);
    const lineHeight = fontSize * TEXT_LINE_HEIGHT;
    const paragraphs = text.split("\n");
    const maxChars = Math.max(1, Math.floor((widthRadius * 2) / Math.max(1, fontSize * TEXT_WIDTH_FACTOR)));
    return {
      lines: paragraphs.flatMap((paragraph) => wrapParagraph(paragraph, maxChars)),
      fontSize,
      lineHeight
    };
  }

  function circleLineWidth(radius, vertical) {
    if (vertical >= radius) return 0;
    return Math.max(0, 2 * Math.sqrt(Math.max(0, radius * radius - vertical * vertical)));
  }

  function ellipseLineWidth(rx, ry, vertical) {
    if (vertical >= ry) return 0;
    const ratio = vertical / Math.max(1, ry);
    return Math.max(0, 2 * rx * Math.sqrt(Math.max(0, 1 - ratio * ratio)));
  }

  function isShapeLabelType(type) {
    return type === "circle" || type === "ellipse" || type === "rectangle";
  }

  function renderShapeLabel(model, text) {
    const constants = styleManager.constants;
    const geometry = model.geometry;
    const isCircle = model.type === "circle";
    const isRectangle = model.type === "rectangle";
    const clipPath = ensureShapeClip(model, isCircle ? "circle" : isRectangle ? "rect" : "ellipse");
    const clipShape = clipPath.firstElementChild;
    const labelGroup = labelFor(model, `editor-${model.type}-label`, "g");
    const align = strokeStyle.choiceById(constants.TEXT_ALIGNS, model.label.position.align);
    let textElement = labelGroup.querySelector("text");

    if (!textElement) {
      labelGroup.replaceChildren();
      textElement = utils.createSvgElement("text", {
        class: `editor-${model.type}-label-text`,
        "dominant-baseline": "middle"
      });
      labelGroup.append(textElement);
    }

    if (isCircle) {
      clipShape.setAttribute("cx", String(geometry.cx));
      clipShape.setAttribute("cy", String(geometry.cy));
      clipShape.setAttribute("r", String(Math.max(1, geometry.r - model.style.strokeWidth / 2)));
    } else if (isRectangle) {
      const insetRx = Math.max(1, geometry.rx - model.style.strokeWidth / 2);
      const insetRy = Math.max(1, geometry.ry - model.style.strokeWidth / 2);
      clipShape.setAttribute("x", String(geometry.cx - insetRx));
      clipShape.setAttribute("y", String(geometry.cy - insetRy));
      clipShape.setAttribute("width", String(insetRx * 2));
      clipShape.setAttribute("height", String(insetRy * 2));
      clipShape.setAttribute("transform", `rotate(${geometry.rotation} ${geometry.cx} ${geometry.cy})`);
    } else {
      clipShape.setAttribute("cx", String(geometry.cx));
      clipShape.setAttribute("cy", String(geometry.cy));
      clipShape.setAttribute("rx", String(Math.max(1, geometry.rx - model.style.strokeWidth / 2)));
      clipShape.setAttribute("ry", String(Math.max(1, geometry.ry - model.style.strokeWidth / 2)));
      clipShape.setAttribute("transform", `rotate(${geometry.rotation} ${geometry.cx} ${geometry.cy})`);
    }

    const rotation = isCircle && model.label.position.rotateMode === "flat" ? 0 : geometry.rotation || 0;
    labelGroup.setAttribute("clip-path", `url(#${labelClipId(model)})`);
    labelGroup.removeAttribute("transform");
    if (rotation) textElement.setAttribute("transform", `rotate(${rotation} ${geometry.cx} ${geometry.cy})`);
    else textElement.removeAttribute("transform");

    const rx = isCircle ? geometry.r : geometry.rx;
    const ry = isCircle ? geometry.r : geometry.ry;
    const inset = textEdgeInset(Math.min(rx, ry), model.style.strokeWidth);
    const usableRx = Math.max(1, rx - inset);
    const usableRy = Math.max(1, ry - inset);
    const wrapped = wrappedTextLines(text, usableRx, model.label.size);

    textElement.replaceChildren();
    textElement.setAttribute("fill", model.label.color);
    textElement.setAttribute("font-size", String(wrapped.fontSize));
    textElement.setAttribute("text-anchor", align.anchor);
    strokeStyle.applyOpacity(textElement, model.label.opacity);
    wrapped.lines.forEach((line, index) => {
      const offset = lineOffset(index, wrapped.lines.length, wrapped.lineHeight);
      const vertical = lineVerticalExtent(offset, wrapped.lineHeight);
      const width = isCircle ? circleLineWidth(usableRx, vertical) : isRectangle ? usableRx * 2 : ellipseLineWidth(usableRx, usableRy, vertical);
      const x = geometry.cx - width / 2 + width * align.x;
      const tspan = utils.createSvgElement("tspan", { x: String(x), y: String(geometry.cy + offset) });
      tspan.textContent = line;
      textElement.append(tspan);
    });
  }

  function renderLabel(model) {
    const adapter = adapterFor(model);
    if (adapter?.capabilities?.noText || adapter?.capabilities?.textObject || adapter?.capabilities?.ownsLabel) {
      if (hasLabelArtifacts(model.id)) removeLabelArtifacts(model.id);
      return;
    }

    const text = (model.label.text || "").trim();
    if (!text) {
      if (hasLabelArtifacts(model.id)) removeLabelArtifacts(model.id);
      return;
    }

    if (isShapeLabelType(model.type)) {
      renderShapeLabel(model, text);
      return;
    }

    if (adapter?.capabilities?.curvedLabel) renderPathLabel(model, adapter, text);
    else renderStraightLineLabel(model, adapter, text);
  }

  function labelDependsOnViewport(model) {
    const adapter = adapterFor(model);
    if (!adapter || isShapeLabelType(model?.type)) return false;
    if (adapter.capabilities?.noText || adapter.capabilities?.textObject || adapter.capabilities?.ownsLabel) return false;
    if (!(model?.label?.text || "").trim()) return false;
    return Boolean(adapter.capabilities?.curvedLabel || typeof adapter.offsetPathData === "function");
  }

  function renderViewportDependentLabels() {
    objectMap.forEach((model) => {
      if (labelDependsOnViewport(model)) renderLabel(model);
    });
  }

  function scheduleViewportDependentLabels() {
    if (viewportLabelFrame) return;
    const schedule = window.requestAnimationFrame
      ? (callback) => window.requestAnimationFrame(callback)
      : (callback) => window.setTimeout(callback, 16);
    viewportLabelFrame = schedule(() => {
      viewportLabelFrame = 0;
      renderViewportDependentLabels();
    });
  }

  function renderObject(id) {
    const model = objectMap.get(id);
    const element = elementMap.get(id);
    const adapter = adapterFor(model);
    if (!model || !element || !adapter) return null;

    setObjectElementData(element, model, adapter);
    styleManager.writeStyleDataset(element, model);
    adapter.render(model, element);
    styleManager.applyStyleToElement(element, model, adapter, canvas);
    renderLabel(model);
    return element;
  }

  function renderGeometry(id, options = {}) {
    const model = objectMap.get(id);
    const element = elementMap.get(id);
    const adapter = adapterFor(model);
    if (!model || !element || !adapter) return null;
    adapter.render(model, element);
    if (options.labels !== false && !adapter.capabilities?.ownsLabel && !adapter.capabilities?.noText && !adapter.capabilities?.textObject) {
      renderLabel(model);
    }
    return element;
  }

  function syncLinkedRoadDepartures(hostId) {
    const host = objectMap.get(hostId);
    if (host?.type !== "road") return [];
    const linkedIds = [];
    objectMap.forEach((model, id) => {
      if (
        model?.type !== "road"
        || id === hostId
        || String(model.metadata?.roadDeparture?.hostId || "") !== String(hostId)
      ) {
        return;
      }
      const adapter = adapterFor(model);
      if (typeof adapter?.syncDepartureToHostGeometry !== "function") return;
      adapter.syncDepartureToHostGeometry(model, host);
      linkedIds.push(id);
    });
    return linkedIds;
  }

  function addRaw(modelInput, options = {}) {
    const model = normalizeModel(modelInput);
    const adapter = adapterFor(model);
    if (!adapter) return null;
    if (objectMap.has(model.id)) model.id = generateId();
    const element = options.element || createElementFor(model);
    objectMap.set(model.id, model);
    elementMap.set(model.id, element);
    setObjectElementData(element, model, adapter);

    if (!element.parentNode) {
      const parent = options.beforeNode?.parentNode || objectLayer;
      if (options.beforeNode) parent.insertBefore(element, options.beforeNode);
      else parent.append(element);
    }
    renderObject(model.id);
    keepRoadLayersAtBack();
    markSceneChanged();
    return model;
  }

  function add(modelInput, options = {}) {
    return withHistory(options, "Nesne ekle", () => addRaw(modelInput, options));
  }

  function create(type, initialData = {}, options = {}) {
    const adapter = registry.get(type);
    if (!adapter) return null;
    return withHistory(options, "Nesne ekle", () => {
      const model = adapter.create(initialData);
      return addRaw(model, { ...options, skipHistory: true });
    });
  }

  function readFromElement(element) {
    const type = registry.typeFromElement(element);
    const adapter = registry.get(type);
    if (!adapter) return null;
    const model = normalizeModel(adapter.readFromElement(element));
    model.id = element.dataset.objectId || model.id;
    return addRaw(model, { element });
  }

  function syncFromDom() {
    objectLayer.querySelectorAll(".editor-cizgi, .editor-circle, .editor-ellipse, .editor-rectangle, .editor-closed-shape, .editor-text, .editor-callout, [data-kroki-object='true']").forEach((element) => {
      if (element.dataset.labelFor || elementMap.get(element.dataset.objectId)) return;
      readFromElement(element);
    });
  }

  function syncDependents(options = {}) {
    if (options.controlPoints !== false) Kroki.ControlPointManager?.sync?.();
    if (options.styleControls !== false) Kroki.StyleManager?.syncControls?.();
  }

  function updateModel(id, updater, options = {}) {
    return withHistory(options, "Nesne guncelle", () => updateModelRaw(id, updater, options));
  }

  function updateModelRaw(id, updater, options = {}) {
    const current = objectMap.get(id);
    if (!current) return null;
    const next = typeof updater === "function" ? updater(utils.clonePlain(current)) : { ...current, ...(updater || {}) };
    const normalized = normalizeModel({ ...next, id: current.id, type: current.type });
    objectMap.set(id, normalized);
    const linkedIds = options.roadDependents === false ? [] : syncLinkedRoadDepartures(id);
    renderObject(id);
    linkedIds.forEach((linkedId) => renderObject(linkedId));
    markSceneChanged({ order: false });
    syncDependents(options);
    return normalized;
  }

  function updateGeometry(id, mutator, options = {}) {
    return withHistory(options, "Geometri guncelle", () => updateGeometryRaw(id, mutator, options));
  }

  function updateGeometryRaw(id, mutator, options = {}) {
    const model = objectMap.get(id);
    if (!model || typeof mutator !== "function") return null;
    mutator(model);
    const linkedIds = options.roadDependents === false ? [] : syncLinkedRoadDepartures(id);
    renderGeometry(id, options);
    linkedIds.forEach((linkedId) => renderGeometry(linkedId, { labels: false }));
    markSceneChanged({ order: false, models: false });
    syncDependents({ styleControls: false, ...options });
    return model;
  }

  function updateStyle(id, patch, options = {}) {
    return updateModel(id, (model) => ({
      ...model,
      style: styleManager.normalizeStyle({ ...model.style, ...(patch || {}) }, model.type)
    }), { label: "Stil guncelle", ...options });
  }

  function updateLabel(id, patch, options = {}) {
    return updateModel(id, (model) => ({
      ...model,
      label: styleManager.normalizeLabel({
        ...model.label,
        ...(patch || {}),
        position: { ...(model.label?.position || {}), ...((patch || {}).position || {}) }
      }, model.type)
    }), { label: "Metin guncelle", ...options });
  }

  function remove(id, options = {}) {
    return withHistory(options, "Nesne sil", () => removeRaw(id));
  }

  function roadDepartureRemovalOrder(rootId) {
    const order = [];
    const visited = new Set();

    function visit(id) {
      const normalizedId = String(id || "");
      if (!normalizedId || visited.has(normalizedId) || !objectMap.has(normalizedId)) return;
      visited.add(normalizedId);
      objectMap.forEach((model, candidateId) => {
        if (
          model?.type === "road"
          && String(model.metadata?.roadDeparture?.hostId || "") === normalizedId
        ) {
          visit(candidateId);
        }
      });
      order.push(normalizedId);
    }

    visit(rootId);
    return order;
  }

  function removeRaw(id) {
    const removalOrder = roadDepartureRemovalOrder(id);
    if (!removalOrder.length) return false;

    const removalSet = new Set(removalOrder);
    const rootElement = elementMap.get(id);
    const externalHostIds = new Set();
    removalOrder.forEach((removalId) => {
      const linkedHostId = String(objectMap.get(removalId)?.metadata?.roadDeparture?.hostId || "");
      if (linkedHostId && !removalSet.has(linkedHostId) && objectMap.has(linkedHostId)) {
        externalHostIds.add(linkedHostId);
      }
    });

    const activeRemoved = removalSet.has(String(Kroki.SelectionManager?.getActiveId?.() || ""));
    const multiSelectionRemoved = (Kroki.MultiSelectManager?.getSelectedIds?.() || [])
      .some((selectedId) => removalSet.has(String(selectedId)));

    removalOrder.forEach((removalId) => {
      removeLabelArtifacts(removalId);
      elementMap.get(removalId)?.remove();
      elementMap.delete(removalId);
      objectMap.delete(removalId);
      Kroki.GroupManager?.removeObject?.(removalId);
    });

    styleManager.cleanupDefs?.(canvas);
    if (activeRemoved) Kroki.SelectionManager?.clear?.();
    if (multiSelectionRemoved) Kroki.MultiSelectManager?.sync?.();
    externalHostIds.forEach((hostId) => renderGeometry(hostId, { labels: false }));
    markSceneChanged();
    return Boolean(rootElement);
  }

  function clone(id, options = {}) {
    return withHistory(options, "Nesne kopyala", () => cloneRaw(id, options));
  }

  function cloneRaw(id, options = {}) {
    const model = objectMap.get(id);
    const adapter = adapterFor(model);
    if (!model || !adapter) return null;
    const copy = normalizeModel(adapter.clone(model));
    copy.id = generateId();
    adapter.move(copy, 18, 18);
    const sourceElement = elementMap.get(id);
    const nextNode = layerNodesFor(id).slice(-1)[0]?.nextSibling || sourceElement?.nextSibling || null;
    const added = addRaw(copy, { beforeNode: nextNode, skipHistory: true });
    return added;
  }

  function bringToFront(id, options = {}) {
    if (isRoadObjectId(id)) {
      keepRoadLayersAtBack();
      return false;
    }
    return withHistory(options, "One getir", () => {
      layerNodesFor(id).forEach((node) => objectLayer.append(node));
      objectOrderCache = null;
      syncGroupLayers();
      markSceneChanged();
      syncDependents(options);
      return true;
    });
  }

  function sendToBack(id, options = {}) {
    if (isRoadObjectId(id)) {
      keepRoadLayersAtBack();
      return false;
    }
    return withHistory(options, "Arkaya gonder", () => {
      const nodes = layerNodesFor(id);
      if (!nodes.length) return false;
      const nodeSet = new Set(nodes);
      const reference = firstMovableLayerNode(nodeSet);
      if (reference) nodes.forEach((node) => objectLayer.insertBefore(node, reference));
      else nodes.forEach((node) => objectLayer.append(node));
      objectOrderCache = null;
      syncGroupLayers();
      markSceneChanged();
      syncDependents(options);
      return true;
    });
  }

  function getObjectsInDomOrder() {
    if (objectOrderCache) return objectOrderCache.slice();
    objectOrderCache = Array.from(objectLayer.querySelectorAll("[data-kroki-object='true']"))
      .map((element) => objectMap.get(element.dataset.objectId))
      .filter(Boolean);
    return objectOrderCache.slice();
  }

  function unwrapGroupElement(groupElement) {
    const parent = groupElement.parentNode || objectLayer;
    while (groupElement.firstChild) parent.insertBefore(groupElement.firstChild, groupElement);
    groupElement.remove();
  }

  function appendObjectLayerNodes(parent, id) {
    layerNodesFor(id).forEach((node) => parent.append(node));
  }

  function syncGroupLayers() {
    if (!objectLayer) return;
    objectOrderCache = null;
    const groups = Kroki.GroupManager?.getAll?.() || [];
    const groupMap = new Map(groups.map((group) => [group.id, group]));
    const rootUnits = [];
    const seenUnits = new Set();
    getObjectsInDomOrder().forEach((model) => {
      const group = Kroki.GroupManager?.groupForObject?.(model.id);
      const unitId = group?.id || model.id;
      if (seenUnits.has(unitId)) return;
      seenUnits.add(unitId);
      rootUnits.push({ type: group ? "group" : "object", id: unitId });
    });

    Array.from(objectLayer.querySelectorAll("[data-kroki-group='true']")).reverse().forEach(unwrapGroupElement);

    function appendGroup(parent, groupId, seen = new Set()) {
      const group = groupMap.get(groupId);
      if (!group || seen.has(groupId)) return null;
      seen.add(groupId);
      const element = utils.createSvgElement("g", {
        class: "editor-object-group",
        "data-kroki-group": "true",
        "data-kroki-group-id": group.id
      });
      parent.append(element);
      group.children.forEach((childId) => {
        if (groupMap.has(childId)) appendGroup(element, childId, seen);
        else appendObjectLayerNodes(element, childId);
      });
      return element;
    }

    rootUnits.forEach((unit) => {
      if (unit.type === "group" && groupMap.has(unit.id)) appendGroup(objectLayer, unit.id);
      else if (unit.type === "object") appendObjectLayerNodes(objectLayer, unit.id);
    });
    groups.forEach((group) => {
      if (!seenUnits.has(group.id) && !objectLayer.querySelector(`[data-kroki-group-id="${group.id}"]`)) appendGroup(objectLayer, group.id);
    });
    keepRoadLayersAtBack();
    markSceneChanged();
  }

  function getAll() {
    return getObjectsInDomOrder().map(utils.clonePlain);
  }

  function clear(options = {}) {
    return withHistory(options, "Temizle", () => {
      Kroki.SelectionManager?.clear?.({ silent: true });
      Kroki.MultiSelectManager?.clear?.({ silent: true });
      objectMap.clear();
      elementMap.clear();
      objectLayer.replaceChildren();
      Kroki.GroupManager?.clear?.();
      styleManager.cleanupDefs?.(canvas);
      markSceneChanged();
      syncDependents(options);
      return true;
    });
  }

  function replaceAll(models, options = {}) {
    return withHistory(options, "Belge yukle", () => {
      clear({ skipHistory: true, controlPoints: false, styleControls: false });
      (Array.isArray(models) ? models : []).forEach((model) => addRaw(model, { skipHistory: true }));
      syncDependents(options);
      return getAll();
    });
  }

  canvas.addEventListener("kroki:viewboxchange", scheduleViewportDependentLabels);

  Kroki.EditorObjectManager = {
    canvas,
    objectLayer,
    generateId,
    create,
    add,
    replaceAll,
    syncGroupLayers,
    keepRoadLayersAtBack,
    readFromElement,
    syncFromDom,
    renderObject,
    renderGeometry,
    syncLinkedRoadDepartures,
    renderViewportDependentLabels,
    updateModel,
    updateGeometry,
    updateStyle,
    updateLabel,
    remove,
    clone,
    bringToFront,
    sendToBack,
    clear,
    getAll,
    getContentBounds,
    get(id) {
      return objectMap.get(id) || null;
    },
    getElement(id) {
      return elementMap.get(id) || null;
    },
    getAdapter(idOrModel) {
      return adapterFor(typeof idOrModel === "string" ? objectMap.get(idOrModel) : idOrModel);
    },
    getObjectsInDomOrder,
    normalizeModel,
    removeLabelArtifacts,
    getSceneVersion() {
      return sceneVersion;
    }
  };
})();
