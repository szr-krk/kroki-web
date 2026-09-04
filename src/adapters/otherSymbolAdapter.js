(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const catalog = Kroki.OtherSymbolCatalog;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !catalog || !styleManager) return;

  const MIN_SCALE = 0.005;
  const MAX_SCALE = 4;
  const SELECTION_RADIUS_SCALE = 1.12;
  const MULTI_SELECTION_STROKE_WIDTH = 4;
  const metricsCache = new WeakMap();
  const artTemplateCache = new Map();
  const editableTextCache = new Map();
  const editableTextPresenceCache = new Map();

  function clampScale(value) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return 0.5;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function symbolFromModel(model) {
    const metadata = model?.metadata || {};
    return catalog.find(metadata.symbolKey) || {
      key: metadata.symbolKey || "",
      code: metadata.symbolCode || "",
      name: metadata.symbolName || "Sembol",
      category: metadata.symbolCategory || "Diğer Semboller",
      categoryKey: metadata.symbolCategoryKey || "",
      file: metadata.symbolFile || "",
      width: Number(metadata.symbolWidth) || 100,
      height: Number(metadata.symbolHeight) || 100,
      viewBox: metadata.symbolViewBox || `0 0 ${Number(metadata.symbolWidth) || 100} ${Number(metadata.symbolHeight) || 100}`,
      baseScale: Number(metadata.symbolBaseScale) || 0.5,
      art: metadata.symbolArt || ""
    };
  }

  function viewBoxFor(symbol) {
    return catalog.parseViewBox(symbol?.viewBox, symbol?.width, symbol?.height);
  }

  function radiusFor(model) {
    return metricsFor(model).radius;
  }

  function selectionRadiusFor(model) {
    return radiusFor(model) * SELECTION_RADIUS_SCALE;
  }

  function artSourceFor(symbol) {
    return String(symbol?.art || "").trim();
  }

  function artTemplateFor(symbol) {
    const art = artSourceFor(symbol);
    if (artTemplateCache.has(art)) return artTemplateCache.get(art);
    let template = utils.createSvgElement("g");
    if (!art) {
      artTemplateCache.set(art, template);
      return template;
    }
    const documentText = `<svg xmlns="${utils.svgNs}">${art}</svg>`;
    const parsed = new DOMParser().parseFromString(documentText, "image/svg+xml");
    const group = parsed.documentElement?.querySelector("g");
    if (group) template = document.importNode(group, true);
    artTemplateCache.set(art, template);
    return template;
  }

  function parseArt(symbol) {
    return artTemplateFor(symbol).cloneNode(true);
  }

  function textElementsIn(group) {
    return Array.from(group?.querySelectorAll?.("text") || []);
  }

  function textRunsFor(group) {
    return textElementsIn(group).map((element) => ({
      elements: [element],
      text: element.textContent.trim()
    }));
  }

  function editableTextFromGroup(group) {
    return textRunsFor(group)
      .map((run) => run.text)
      .filter((text) => text.length)
      .join("\n");
  }

  function editableTextForSymbol(symbol) {
    const art = artSourceFor(symbol);
    if (editableTextCache.has(art)) return editableTextCache.get(art);
    const text = editableTextFromGroup(artTemplateFor(symbol));
    editableTextCache.set(art, text);
    return text;
  }

  function hasEditableText(modelOrSymbol) {
    const symbol = modelOrSymbol?.type === "otherSymbol" ? symbolFromModel(modelOrSymbol) : modelOrSymbol;
    const art = artSourceFor(symbol);
    if (editableTextPresenceCache.has(art)) return editableTextPresenceCache.get(art);
    const hasText = textElementsIn(artTemplateFor(symbol)).length > 0;
    editableTextPresenceCache.set(art, hasText);
    return hasText;
  }

  function defaultLabelForSymbol(symbol, label) {
    const source = label || {};
    if (source.text || source.labelText) return source;
    const text = editableTextForSymbol(symbol);
    return text ? { ...source, text } : source;
  }

  function applyEditableText(model, group) {
    const runs = textRunsFor(group);
    if (!runs.length) return;
    const label = styleManager.normalizeLabel(model.label, model.type);
    const fallbackText = editableTextFromGroup(group);
    const text = label.text || (model.metadata?.symbolTextInitialized ? "" : fallbackText);
    const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    runs.forEach((run, index) => {
      run.elements[0].textContent = lines[index] ?? "";
    });
  }

  function metricsFor(model) {
    const symbol = symbolFromModel(model);
    const geometry = model.geometry || {};
    const scale = clampScale(geometry.scale);
    const cacheKey = [
      symbol.key || "",
      symbol.viewBox || "",
      symbol.width || "",
      symbol.height || "",
      scale
    ].join("|");
    const cached = metricsCache.get(model);
    if (cached?.key === cacheKey) return cached.metrics;

    const viewBox = viewBoxFor(symbol);
    const metrics = {
      symbol,
      viewBox,
      scale,
      radius: Math.max(viewBox.width, viewBox.height) * scale / 2
    };
    metricsCache.set(model, { key: cacheKey, metrics });
    return metrics;
  }

  function transformFor(model, metrics) {
    const geometry = model.geometry || {};
    const viewBox = metrics.viewBox;
    const rotation = utils.normalizeRotation(geometry.rotation);
    const centerX = viewBox.x + viewBox.width / 2;
    const centerY = viewBox.y + viewBox.height / 2;
    return `translate(${geometry.cx} ${geometry.cy}) rotate(${rotation}) scale(${metrics.scale}) translate(${-centerX} ${-centerY})`;
  }

  function artFor(element) {
    return Array.from(element.children || []).find((child) => child.classList?.contains("editor-other-symbol-art")) || null;
  }

  function artKeyFor(symbol) {
    return [
      symbol.key || "",
      symbol.viewBox || "",
      symbol.width || "",
      symbol.height || "",
      String(symbol.art || "").length
    ].join("|");
  }

  function textKeyFor(model) {
    return [
      model.label?.text || model.label?.labelText || "",
      Boolean(model.metadata?.symbolTextInitialized) ? "initialized" : "fallback"
    ].join("|");
  }

  function syncArt(element, model, symbol) {
    const artKey = artKeyFor(symbol);
    let art = artFor(element);
    if (!art || art.dataset.symbolArtKey !== artKey) {
      art = parseArt(symbol);
      art.classList.add("editor-other-symbol-art");
      art.dataset.symbolArtKey = artKey;
      element.replaceChildren(art);
      element.dataset.symbolTextKey = "";
    }

    const textKey = textKeyFor(model);
    if (element.dataset.symbolTextKey !== textKey) {
      applyEditableText(model, art);
      element.dataset.symbolTextKey = textKey;
    }
    return art;
  }

  function writeDataset(element, name, value) {
    const text = String(value);
    if (element.dataset[name] !== text) element.dataset[name] = text;
  }

  function cpPoint(model, metrics) {
    const geometry = model.geometry;
    const radius = radiusFor(model);
    const distance = radius + (metrics?.handleGap || 0);
    const radians = utils.normalizeRotation(geometry.rotation) * Math.PI / 180;
    return {
      x: geometry.cx + Math.cos(radians) * distance,
      y: geometry.cy + Math.sin(radians) * distance
    };
  }

  function pointDistance(model, point) {
    const geometry = model.geometry || {};
    return Math.hypot(point.x - geometry.cx, point.y - geometry.cy);
  }

  const adapter = {
    elementTag: "g",
    className: "editor-other-symbol",
    capabilities: { arrows: false, fill: false, curvedLabel: false, ownsLabel: true, otherSymbol: true, catalogObject: true, gridSnap: false },

    create(initialData = {}) {
      const symbol = initialData.symbol || catalog.find(initialData.symbolKey);
      const metadata = catalog.metadataFor(symbol || {});
      const center = initialData.center || initialData.point || {};
      const geometry = initialData.geometry || {};
      const baseScale = Number(symbol?.baseScale) || Number(metadata.symbolBaseScale) || 0.5;
      const editableText = editableTextForSymbol(symbol);
      return {
        type: "otherSymbol",
        geometry: {
          cx: utils.numberOr(geometry.cx ?? center.x ?? initialData.x, 0),
          cy: utils.numberOr(geometry.cy ?? center.y ?? initialData.y, 0),
          scale: clampScale(geometry.scale ?? initialData.scale ?? baseScale),
          rotation: utils.normalizeRotation(geometry.rotation ?? initialData.rotation)
        },
        style: initialData.style,
        label: defaultLabelForSymbol(symbol, initialData.label),
        metadata: {
          ...metadata,
          ...(initialData.metadata || {}),
          symbolTextInitialized: Boolean(editableText)
        }
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "otherSymbol",
        geometry: {
          cx: utils.numberOr(element.dataset.cx, 0),
          cy: utils.numberOr(element.dataset.cy, 0),
          scale: clampScale(element.dataset.scale),
          rotation: utils.normalizeRotation(element.dataset.rotation)
        },
        style: {},
        label: {},
        metadata: {
          symbolKey: element.dataset.symbolKey || "",
          symbolCode: element.dataset.symbolCode || "",
          symbolName: element.dataset.symbolName || "",
          symbolCategory: element.dataset.symbolCategory || "",
          symbolCategoryKey: element.dataset.symbolCategoryKey || "",
          symbolViewBox: element.dataset.symbolViewBox || "",
          symbolWidth: utils.numberOr(element.dataset.symbolWidth, 100),
          symbolHeight: utils.numberOr(element.dataset.symbolHeight, 100),
          symbolBaseScale: utils.numberOr(element.dataset.symbolBaseScale, 0.5),
          otherSymbol: true
        }
      };
    },

    render(model, element) {
      const metrics = metricsFor(model);
      const symbol = metrics.symbol;
      const geometry = model.geometry || {};
      syncArt(element, model, symbol);
      writeDataset(element, "cx", geometry.cx);
      writeDataset(element, "cy", geometry.cy);
      writeDataset(element, "scale", metrics.scale);
      writeDataset(element, "rotation", utils.normalizeRotation(geometry.rotation));
      writeDataset(element, "symbolKey", symbol.key || "");
      writeDataset(element, "symbolCode", symbol.code || "");
      writeDataset(element, "symbolName", symbol.name || "");
      writeDataset(element, "symbolCategory", symbol.category || "");
      writeDataset(element, "symbolCategoryKey", symbol.categoryKey || "");
      writeDataset(element, "symbolViewBox", symbol.viewBox || "");
      writeDataset(element, "symbolWidth", symbol.width || "");
      writeDataset(element, "symbolHeight", symbol.height || "");
      writeDataset(element, "symbolBaseScale", symbol.baseScale || "");
      element.setAttribute("transform", transformFor(model, metrics));
    },

    hitTest(model, point, tolerance) {
      return pointDistance(model, point) <= radiusFor(model) + tolerance;
    },

    getControlPoints(model, metrics) {
      return [{
        id: "rotate",
        ...cpPoint(model, metrics),
        role: "rotate",
        cursor: "grab"
      }];
    },

    moveControlPoint(model, cpId, worldPoint, modifiers = {}) {
      if (cpId !== "rotate") return;
      const angle = Math.atan2(worldPoint.y - model.geometry.cy, worldPoint.x - model.geometry.cx) * 180 / Math.PI;
      model.geometry.rotation = utils.normalizeRotation(Kroki.EditorGrid?.snapAngle(angle, modifiers) ?? angle);
    },

    move(model, dx, dy) {
      model.geometry.cx += dx;
      model.geometry.cy += dy;
    },

    getBounds(model) {
      const radius = radiusFor(model);
      return {
        x: model.geometry.cx - radius,
        y: model.geometry.cy - radius,
        width: radius * 2,
        height: radius * 2
      };
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("circle", { class: "editor-object-selection editor-other-symbol-selection" });
    },

    renderSelection(element, model, style, mode) {
      const isMulti = mode === "multi";
      element.setAttribute("cx", String(model.geometry.cx));
      element.setAttribute("cy", String(model.geometry.cy));
      element.setAttribute("r", String(selectionRadiusFor(model)));
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

    hasEditableText,

    effectiveLabel(model) {
      const label = styleManager.normalizeLabel(model.label, model.type);
      if (label.text || model.metadata?.symbolTextInitialized) return label;
      return styleManager.normalizeLabel({ ...label, text: editableTextForSymbol(symbolFromModel(model)) }, model.type);
    }
  };

  registry.register("otherSymbol", adapter);
})();
