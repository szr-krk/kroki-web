(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const catalog = Kroki.TrafficSignCatalog;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !catalog || !styleManager) return;

  const MIN_SCALE = 0.005;
  const MAX_SCALE = 4;
  const SELECTION_RADIUS_SCALE = 1.12;
  const MULTI_SELECTION_STROKE_WIDTH = 4;

  function clampScale(value) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return 0.08;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function signFromModel(model) {
    const metadata = model?.metadata || {};
    return catalog.find(metadata.signKey) || {
      key: metadata.signKey || "",
      code: metadata.signCode || "",
      name: metadata.signName || "Levha",
      category: metadata.signCategory || "Levhalar",
      categoryKey: metadata.signCategoryKey || "",
      file: metadata.signFile || "",
      width: Number(metadata.signWidth) || 100,
      height: Number(metadata.signHeight) || 100,
      viewBox: metadata.signViewBox || `0 0 ${Number(metadata.signWidth) || 100} ${Number(metadata.signHeight) || 100}`,
      baseScale: Number(metadata.signBaseScale) || 0.08,
      art: metadata.signArt || "",
      svg: ""
    };
  }

  function viewBoxFor(sign) {
    return catalog.parseViewBox(sign?.viewBox, sign?.width, sign?.height);
  }

  function radiusFor(model) {
    const sign = signFromModel(model);
    const viewBox = viewBoxFor(sign);
    return Math.max(viewBox.width, viewBox.height) * clampScale(model.geometry?.scale) / 2;
  }

  function selectionRadiusFor(model) {
    return radiusFor(model) * SELECTION_RADIUS_SCALE;
  }

  function parseArt(sign) {
    const art = String(sign?.art || "").trim();
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

  function isSingleGlyphText(value) {
    return /^[0-9]$/.test(String(value || "").trim());
  }

  function textRunsFor(group) {
    const elements = textElementsIn(group);
    const runs = [];
    for (let index = 0; index < elements.length; index += 1) {
      const text = elements[index].textContent.trim();
      if (!isSingleGlyphText(text)) {
        runs.push({ elements: [elements[index]], text });
        continue;
      }

      const digits = [text];
      const runElements = [elements[index]];
      while (index + 1 < elements.length && isSingleGlyphText(elements[index + 1].textContent)) {
        index += 1;
        digits.push(elements[index].textContent.trim());
        runElements.push(elements[index]);
      }
      runs.push({ elements: runElements, text: digits.join("") });
    }
    return runs;
  }

  function editableTextFromGroup(group) {
    return textRunsFor(group)
      .map((run) => run.text)
      .filter((text) => text.length)
      .join("\n");
  }

  function editableTextForSign(sign) {
    return editableTextFromGroup(parseArt(sign));
  }

  function hasEditableText(modelOrSign) {
    const sign = modelOrSign?.type === "trafficSign" ? signFromModel(modelOrSign) : modelOrSign;
    return textElementsIn(parseArt(sign)).length > 0;
  }

  function defaultLabelForSign(sign, label) {
    const source = label || {};
    if (source.text || source.labelText) return source;
    const text = editableTextForSign(sign);
    return text ? { ...source, text } : source;
  }

  function applyRunText(run, value) {
    const elements = run.elements || [];
    if (elements.length === 1) {
      elements[0].textContent = value;
      return;
    }

    const text = String(value || "");
    const perElement = Math.max(1, Math.ceil(text.length / elements.length));
    elements.forEach((element, index) => {
      element.textContent = text.slice(index * perElement, index * perElement + perElement);
    });
  }

  function applyEditableText(model, group) {
    const runs = textRunsFor(group);
    if (!runs.length) return;
    const label = styleManager.normalizeLabel(model.label, model.type);
    const fallbackText = editableTextFromGroup(group);
    const text = label.text || (model.metadata?.signTextInitialized ? "" : fallbackText);
    const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    runs.forEach((run, index) => {
      let value = lines[index] ?? "";
      if (index === runs.length - 1 && lines.length > runs.length) {
        value = [value, ...lines.slice(runs.length)].filter(Boolean).join(" ");
      }
      applyRunText(run, value);
    });
  }

  function transformFor(model, sign) {
    const geometry = model.geometry || {};
    const viewBox = viewBoxFor(sign);
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
    className: "editor-traffic-sign",
    capabilities: { arrows: false, fill: false, curvedLabel: false, ownsLabel: true, trafficSign: true },

    create(initialData = {}) {
      const sign = initialData.sign || catalog.find(initialData.signKey);
      const metadata = catalog.metadataFor(sign || {});
      const center = initialData.center || initialData.point || {};
      const geometry = initialData.geometry || {};
      const baseScale = Number(sign?.baseScale) || Number(metadata.signBaseScale) || 0.08;
      const editableText = editableTextForSign(sign);
      return {
        type: "trafficSign",
        geometry: {
          cx: utils.numberOr(geometry.cx ?? center.x ?? initialData.x, 0),
          cy: utils.numberOr(geometry.cy ?? center.y ?? initialData.y, 0),
          scale: clampScale(geometry.scale ?? initialData.scale ?? baseScale),
          rotation: utils.normalizeRotation(geometry.rotation ?? initialData.rotation)
        },
        style: initialData.style,
        label: defaultLabelForSign(sign, initialData.label),
        metadata: {
          ...metadata,
          ...(initialData.metadata || {}),
          signTextInitialized: Boolean(editableText)
        }
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "trafficSign",
        geometry: {
          cx: utils.numberOr(element.dataset.cx, 0),
          cy: utils.numberOr(element.dataset.cy, 0),
          scale: clampScale(element.dataset.scale),
          rotation: utils.normalizeRotation(element.dataset.rotation)
        },
        style: {},
        label: {},
        metadata: {
          signKey: element.dataset.signKey || "",
          signCode: element.dataset.signCode || "",
          signName: element.dataset.signName || "",
          signCategory: element.dataset.signCategory || "",
          signCategoryKey: element.dataset.signCategoryKey || "",
          signViewBox: element.dataset.signViewBox || "",
          signWidth: utils.numberOr(element.dataset.signWidth, 100),
          signHeight: utils.numberOr(element.dataset.signHeight, 100),
          signBaseScale: utils.numberOr(element.dataset.signBaseScale, 0.08)
        }
      };
    },

    render(model, element) {
      const sign = signFromModel(model);
      const geometry = model.geometry || {};
      const art = parseArt(sign);
      applyEditableText(model, art);
      element.replaceChildren(art);
      element.dataset.cx = String(geometry.cx);
      element.dataset.cy = String(geometry.cy);
      element.dataset.scale = String(clampScale(geometry.scale));
      element.dataset.rotation = String(utils.normalizeRotation(geometry.rotation));
      element.dataset.signKey = sign.key || "";
      element.dataset.signCode = sign.code || "";
      element.dataset.signName = sign.name || "";
      element.dataset.signCategory = sign.category || "";
      element.dataset.signCategoryKey = sign.categoryKey || "";
      element.dataset.signViewBox = sign.viewBox || "";
      element.dataset.signWidth = String(sign.width || "");
      element.dataset.signHeight = String(sign.height || "");
      element.dataset.signBaseScale = String(sign.baseScale || "");
      element.setAttribute("transform", transformFor(model, sign));
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
      return utils.createSvgElement("circle", { class: "editor-object-selection editor-traffic-sign-selection" });
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
      if (label.text || model.metadata?.signTextInitialized) return label;
      return styleManager.normalizeLabel({ ...label, text: editableTextForSign(signFromModel(model)) }, model.type);
    }
  };

  registry.register("trafficSign", adapter);
})();
