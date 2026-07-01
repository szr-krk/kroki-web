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
      art: metadata.symbolArt || "",
      svg: ""
    };
  }

  function viewBoxFor(symbol) {
    return catalog.parseViewBox(symbol?.viewBox, symbol?.width, symbol?.height);
  }

  function radiusFor(model) {
    const symbol = symbolFromModel(model);
    const viewBox = viewBoxFor(symbol);
    return Math.max(viewBox.width, viewBox.height) * clampScale(model.geometry?.scale) / 2;
  }

  function selectionRadiusFor(model) {
    return radiusFor(model) * SELECTION_RADIUS_SCALE;
  }

  function parseArt(symbol) {
    const art = String(symbol?.art || "").trim();
    if (!art) return utils.createSvgElement("g");
    const documentText = `<svg xmlns="${utils.svgNs}">${art}</svg>`;
    const parsed = new DOMParser().parseFromString(documentText, "image/svg+xml");
    const group = parsed.documentElement?.querySelector("g");
    if (!group) return utils.createSvgElement("g");
    return document.importNode(group, true);
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
    return editableTextFromGroup(parseArt(symbol));
  }

  function hasEditableText(modelOrSymbol) {
    const symbol = modelOrSymbol?.type === "otherSymbol" ? symbolFromModel(modelOrSymbol) : modelOrSymbol;
    return textElementsIn(parseArt(symbol)).length > 0;
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

  function transformFor(model, symbol) {
    const geometry = model.geometry || {};
    const viewBox = viewBoxFor(symbol);
    const scale = clampScale(geometry.scale);
    const rotation = utils.normalizeRotation(geometry.rotation);
    const centerX = viewBox.x + viewBox.width / 2;
    const centerY = viewBox.y + viewBox.height / 2;
    return `translate(${geometry.cx} ${geometry.cy}) rotate(${rotation}) scale(${scale}) translate(${-centerX} ${-centerY})`;
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
    capabilities: { arrows: false, fill: false, curvedLabel: false, ownsLabel: true, otherSymbol: true, catalogObject: true },

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
      const symbol = symbolFromModel(model);
      const geometry = model.geometry || {};
      const art = parseArt(symbol);
      applyEditableText(model, art);
      element.replaceChildren(art);
      element.dataset.cx = String(geometry.cx);
      element.dataset.cy = String(geometry.cy);
      element.dataset.scale = String(clampScale(geometry.scale));
      element.dataset.rotation = String(utils.normalizeRotation(geometry.rotation));
      element.dataset.symbolKey = symbol.key || "";
      element.dataset.symbolCode = symbol.code || "";
      element.dataset.symbolName = symbol.name || "";
      element.dataset.symbolCategory = symbol.category || "";
      element.dataset.symbolCategoryKey = symbol.categoryKey || "";
      element.dataset.symbolViewBox = symbol.viewBox || "";
      element.dataset.symbolWidth = String(symbol.width || "");
      element.dataset.symbolHeight = String(symbol.height || "");
      element.dataset.symbolBaseScale = String(symbol.baseScale || "");
      element.setAttribute("transform", transformFor(model, symbol));
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
