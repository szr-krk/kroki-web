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
  const metricsCache = new WeakMap();
  const artTemplateCache = new Map();
  const editableTextCache = new Map();
  const editableTextPresenceCache = new Map();

  function numericField(id, label, defaultValue, indexes, options = {}) {
    return {
      id,
      label,
      defaultValue,
      maxLength: options.maxLength || String(defaultValue || "").length,
      inputMode: options.inputMode || "numeric",
      valueType: options.valueType || "number",
      legacyLine: options.legacyLine,
      target: {
        indexes,
        prefix: options.prefix || "",
        suffix: options.suffix || "",
        fit: options.fit !== false
      }
    };
  }

  function textField(id, label, defaultValue, indexes, options = {}) {
    return {
      id,
      label,
      defaultValue,
      maxLength: options.maxLength || String(defaultValue || "").length,
      inputMode: options.inputMode || "text",
      valueType: "text",
      legacyLine: options.legacyLine,
      target: {
        indexes,
        prefix: options.prefix || "",
        suffix: options.suffix || "",
        fit: options.fit !== false
      }
    };
  }

  function clockField(id, label, indexes, options = {}) {
    return {
      id,
      label,
      defaultValue: options.defaultValue || label,
      maxLength: 5,
      inputMode: "numeric",
      valueType: "clock",
      legacyLines: options.legacyLines,
      target: { indexes, mode: "clock" }
    };
  }

  const EDITABLE_SIGN_FIELDS = {
    "bilgi-levhalari/kontrol-kesimi-levhasi": [
      textField("roadNumber", "Yol numarası", "D110-03", [0], { maxLength: 12 }),
      textField("sectionNumber", "Kesim numarası", "001", [1], { maxLength: 8, inputMode: "numeric" })
    ],
    "tanzim-levhalari/tt-20-genisligi-metreden-fazla-olan-tasit-giremez": [
      numericField("whole", "2", "2", [0], { maxLength: 2, legacyLine: 0 }),
      numericField("decimal", "30", "30", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-21-yuksekligi-metreden-fazla-olan-tasit-giremez": [
      numericField("whole", "3", "3", [0], { maxLength: 2, legacyLine: 0 }),
      numericField("decimal", "50", "50", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-22-uzunlugu-metreden-fazla-olan-tasit-giremez": [
      numericField("length", "10", "10", [0], { maxLength: 3, suffix: " m", legacyLine: 0 })
    ],
    "tanzim-levhalari/tt-23-dingil-basina-tondan-fazla-yuk-dusen-tasit-giremez": [
      numericField("load", "6", "6", [0], { maxLength: 2, legacyLine: 0 })
    ],
    "tanzim-levhalari/tt-24-yuklu-agirligi-tondan-fazla-yuk-dusen-tasit-giremez": [
      numericField("whole", "7", "7", [0], { maxLength: 2, legacyLine: 0 }),
      numericField("decimal", "00", "00", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-25-ondeki-tasit-metreden-daha-yakin-takip-edilemez": [
      numericField("distance", "70", "70", [0], { maxLength: 3, suffix: " m", legacyLine: 0 })
    ],
    "tanzim-levhalari/tt-29a-azami-hiz-sinirlamasi": [
      numericField("speed", "50", "50", [0], { maxLength: 3, legacyLine: 0 })
    ],
    "tanzim-levhalari/tt-29b-azami-hiz-bolgesi": [
      numericField("speed", "30", "30", [2], { maxLength: 3, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-33a-hiz-sinirlamasi-sonu": [
      numericField("speed", "50", "50", [0, 1], { maxLength: 2, legacyLine: 0 })
    ],
    "tanzim-levhalari/tt-33b-azami-hiz-bolgesi-sonu": [
      numericField("speed", "30", "30", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-41a-mecburi-asgari-hiz": [
      numericField("speed", "30", "30", [0], { maxLength: 3, legacyLine: 0 })
    ],
    "uyari-levhalari/t-3a-tehlikeli-egim-inis": [
      numericField("slope", "10", "10", [0], { maxLength: 2, prefix: "%", legacyLine: 0 })
    ],
    "uyari-levhalari/t-3b-tehlikeli-egim-cikis": [
      numericField("slope", "10", "10", [0], { maxLength: 2, prefix: "%", legacyLine: 0 })
    ],
    "bilgi-levhalari/b-14c-yaya-bolgesi": [
      clockField("start", "08,00", [3, 4], { legacyLines: [3, 4] }),
      clockField("end", "15,00", [6, 7], { legacyLines: [6, 7] })
    ],
    "bilgi-levhalari/b-14d-yaya-bolgesi": [
      clockField("start", "08,00", [2, 3], { legacyLines: [2, 3] }),
      clockField("end", "15,00", [5, 6], { legacyLines: [5, 6] })
    ],
    "bilgi-levhalari/b-50a-serit-duzenleme-levhalari-2": [
      numericField("speed", "50", "50", [0], { maxLength: 3, legacyLine: 0 })
    ],
    "bilgi-levhalari/b-50b-serit-duzenleme-levhalari-2": [
      numericField("speed", "50", "50", [0, 1], { maxLength: 3, legacyLine: 0 })
    ],
    "bilgi-levhalari/b-50c-serit-duzenleme-levhalari-2": [
      numericField("speed", "50", "50", [0], { maxLength: 3, legacyLine: 0 })
    ],
    "bilgi-levhalari/b-50d-serit-duzenleme-levhalari-2": [
      numericField("speed", "50", "50", [0], { maxLength: 3, legacyLine: 0 })
    ],
    "bilgi-levhalari/b-50f-serit-duzenleme-levhalari-3": [
      numericField("whole", "2", "2", [0], { maxLength: 2, legacyLine: 0 }),
      numericField("decimal", "30", "30", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "bilgi-levhalari/b-50f-serit-duzenleme-levhalari-4": [
      numericField("speed50", "50", "50", [2, 3], { maxLength: 3, legacyLine: 1 }),
      numericField("speed80", "80", "80", [0, 1], { maxLength: 3, legacyLine: 0 })
    ],
    "bilgi-levhalari/b-50g-serit-duzenleme-levhalari-2": [
      numericField("speed", "50", "50", [0], { maxLength: 3, legacyLine: 0 })
    ],
    "bilgi-levhalari/b-51a-serit-duzenleme-levhalari-3": [
      numericField("whole", "2", "2", [0], { maxLength: 2, legacyLine: 0 }),
      numericField("decimal", "30", "30", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "bilgi-levhalari/b-51a-serit-duzenleme-levhalari-4": [
      numericField("speed", "50", "50", [0, 1], { maxLength: 3, legacyLine: 0 })
    ],
    "bilgi-levhalari/b-51c-serit-duzenleme-levhalari-2": [
      numericField("speed", "50", "50", [0, 1], { maxLength: 3, legacyLine: 0 })
    ]
  };

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
    return metricsFor(model).radius;
  }

  function selectionRadiusFor(model) {
    return radiusFor(model) * SELECTION_RADIUS_SCALE;
  }

  function artSourceFor(sign) {
    return String(sign?.art || "").trim();
  }

  function artTemplateFor(sign) {
    const art = artSourceFor(sign);
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

  function parseArt(sign) {
    return artTemplateFor(sign).cloneNode(true);
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
    const art = artSourceFor(sign);
    if (editableTextCache.has(art)) return editableTextCache.get(art);
    const fields = editableTextDefinitionsForSign(sign);
    const text = fields.map((field) => field.defaultValue).filter(Boolean).join("\n");
    editableTextCache.set(art, text);
    return text;
  }

  function editableTextDefinitionsForSign(sign) {
    const key = String(sign?.key || "").toLowerCase();
    return EDITABLE_SIGN_FIELDS[key] || [];
  }

  function hasEditableText(modelOrSign) {
    const sign = modelOrSign?.type === "trafficSign" ? signFromModel(modelOrSign) : modelOrSign;
    const cacheKey = String(sign?.key || artSourceFor(sign));
    if (editableTextPresenceCache.has(cacheKey)) return editableTextPresenceCache.get(cacheKey);
    const hasText = editableTextDefinitionsForSign(sign).length > 0;
    editableTextPresenceCache.set(cacheKey, hasText);
    return hasText;
  }

  function defaultLabelForSign(sign, label) {
    return label || {};
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

  function applyLegacyEditableText(model, group) {
    const runs = textRunsFor(group);
    if (!runs.length) return;
    const label = styleManager.normalizeLabel(model.label, model.type);
    if (!label.text) return;
    const text = label.text;
    const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    runs.forEach((run, index) => {
      let value = lines[index] ?? "";
      if (index === runs.length - 1 && lines.length > runs.length) {
        value = [value, ...lines.slice(runs.length)].filter(Boolean).join(" ");
      }
      applyRunText(run, value);
    });
  }

  function normalizeEditableFieldValue(value, field) {
    let text = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
    if (field?.valueType === "number") {
      text = text.replace(/[^\d]/g, "");
    } else if (field?.valueType === "clock") {
      text = text.replace(/[^\d,.:]/g, "").replace(/[.:]/g, ",");
    }
    const maxLength = Number(field?.maxLength);
    if (Number.isFinite(maxLength) && maxLength > 0) text = text.slice(0, maxLength);
    return text;
  }

  function stripFieldAffixes(value, field) {
    let text = String(value ?? "").trim();
    const prefix = field?.target?.prefix || "";
    const suffix = field?.target?.suffix || "";
    if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length);
    if (suffix && text.endsWith(suffix)) text = text.slice(0, -suffix.length);
    return text.trim();
  }

  function legacyValueForField(model, field) {
    const raw = model?.label?.text || model?.label?.labelText || "";
    if (!raw) return "";
    const lines = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (Array.isArray(field.legacyLines)) {
      const parts = field.legacyLines.map((line) => lines[line] || "").filter(Boolean);
      return normalizeEditableFieldValue(parts.join(""), field);
    }
    if (Number.isInteger(field.legacyLine)) {
      return normalizeEditableFieldValue(stripFieldAffixes(lines[field.legacyLine] || "", field), field);
    }
    return "";
  }

  function editableFieldValue(model, field) {
    const values = model?.metadata?.signTextFields || {};
    if (Object.prototype.hasOwnProperty.call(values, field.id)) {
      return normalizeEditableFieldValue(values[field.id], field);
    }
    const legacyValue = legacyValueForField(model, field);
    return legacyValue || normalizeEditableFieldValue(field.defaultValue, field);
  }

  function editableTextFields(modelOrSign) {
    const model = modelOrSign?.type === "trafficSign" ? modelOrSign : null;
    const sign = model ? signFromModel(model) : modelOrSign;
    return editableTextDefinitionsForSign(sign).map((field) => ({
      id: field.id,
      label: field.label,
      value: model ? editableFieldValue(model, field) : field.defaultValue,
      defaultValue: field.defaultValue,
      maxLength: field.maxLength,
      inputMode: field.inputMode || "text",
      valueType: field.valueType || "text"
    }));
  }

  function editableTextFieldsKey(model) {
    const sign = signFromModel(model);
    return editableTextDefinitionsForSign(sign)
      .map((field) => `${field.id}:${editableFieldValue(model, field)}`)
      .join("|");
  }

  function updateEditableTextField(model, fieldId, value) {
    const sign = signFromModel(model);
    const field = editableTextDefinitionsForSign(sign).find((item) => item.id === fieldId);
    if (!field) return model;
    const metadata = { ...(model.metadata || {}) };
    const values = { ...(metadata.signTextFields || {}) };
    values[field.id] = normalizeEditableFieldValue(value, field);
    model.metadata = {
      ...metadata,
      signTextFields: values,
      signTextInitialized: true
    };
    model.label = styleManager.normalizeLabel({ ...(model.label || {}), text: "" }, model.type);
    return model;
  }

  const ORIGINAL_TEXT_ATTRS = ["x", "text-anchor", "textLength", "lengthAdjust", "display", "visibility"];

  function originalDataName(attr) {
    return `data-kroki-original-${attr}`;
  }

  function rememberOriginalTextElement(element) {
    if (!element || element.hasAttribute("data-kroki-original-text")) return;
    element.setAttribute("data-kroki-original-text", element.textContent || "");
    ORIGINAL_TEXT_ATTRS.forEach((attr) => {
      element.setAttribute(originalDataName(attr), element.getAttribute(attr) ?? "");
    });
  }

  function restoreTextElement(element) {
    if (!element) return;
    rememberOriginalTextElement(element);
    ORIGINAL_TEXT_ATTRS.forEach((attr) => {
      const value = element.getAttribute(originalDataName(attr)) ?? "";
      if (value) element.setAttribute(attr, value);
      else element.removeAttribute(attr);
    });
  }

  function numberAttr(element, attr, fallback = 0) {
    const value = Number(element?.getAttribute?.(attr));
    return Number.isFinite(value) ? value : fallback;
  }

  function textWidthFor(element, text) {
    const textLength = Number(element?.getAttribute?.("textLength"));
    if (Number.isFinite(textLength) && textLength > 0) return textLength;
    const fontSize = numberAttr(element, "font-size", 72);
    return Math.max(fontSize * 0.58, String(text || "").length * fontSize * 0.58);
  }

  function textRangeFor(element, text) {
    const x = numberAttr(element, "x", 0);
    const width = textWidthFor(element, text);
    const anchor = element?.getAttribute?.("text-anchor") || "";
    if (anchor === "middle") return { left: x - width / 2, right: x + width / 2 };
    if (anchor === "end") return { left: x - width, right: x };
    return { left: x, right: x + width };
  }

  function mergedTextRange(elements) {
    const ranges = elements.map((element) => textRangeFor(element, element.getAttribute("data-kroki-original-text") || element.textContent || ""));
    const left = Math.min(...ranges.map((range) => range.left));
    const right = Math.max(...ranges.map((range) => range.right));
    return { left, right, width: Math.max(1, right - left), center: (left + right) / 2 };
  }

  function roundSvgNumber(value) {
    return String(Math.round(Number(value) * 1000) / 1000);
  }

  function applyFittedText(element, text, baseText, forceFit) {
    restoreTextElement(element);
    element.textContent = text;
    const originalTextLength = element.getAttribute(originalDataName("textLength"));
    const shouldFit = forceFit || Boolean(originalTextLength) || String(text).length > String(baseText || "").length;
    if (!shouldFit) return;
    const width = Number(originalTextLength) || textWidthFor(element, baseText || text);
    element.setAttribute("textLength", roundSvgNumber(width));
    element.setAttribute("lengthAdjust", "spacingAndGlyphs");
  }

  function applyDistributedText(elements, text) {
    const chars = String(text || "").split("");
    elements.forEach((element, index) => {
      restoreTextElement(element);
      element.textContent = chars[index] || "";
    });
  }

  function applyMergedText(elements, text) {
    const range = mergedTextRange(elements);
    elements.forEach((element, index) => {
      restoreTextElement(element);
      if (index === 0) {
        element.textContent = text;
        element.setAttribute("x", roundSvgNumber(range.center));
        element.setAttribute("text-anchor", "middle");
        element.setAttribute("textLength", roundSvgNumber(range.width));
        element.setAttribute("lengthAdjust", "spacingAndGlyphs");
      } else {
        element.textContent = "";
        element.setAttribute("display", "none");
      }
    });
  }

  function splitClockText(value) {
    const text = normalizeEditableFieldValue(value, { valueType: "clock", maxLength: 5 });
    const match = text.match(/^(\d{1,2})[,]?(\d{0,2})$/);
    if (match) return [`${match[1]},`, match[2] || ""];
    const parts = text.split(",");
    if (parts.length > 1) return [`${parts[0]},`, parts.slice(1).join("").slice(0, 2)];
    return [text, ""];
  }

  function targetTextElements(elements, target) {
    return (target?.indexes || [])
      .map((index) => elements[index])
      .filter(Boolean);
  }

  function applyFieldTarget(elements, field, value) {
    const target = field.target || {};
    const targetElements = targetTextElements(elements, target);
    if (!targetElements.length) return;
    targetElements.forEach(rememberOriginalTextElement);
    if (target.mode === "clock") {
      const [hour, minute] = splitClockText(value);
      applyFittedText(targetElements[0], hour, hour, false);
      if (targetElements[1]) applyFittedText(targetElements[1], minute, minute, false);
      return;
    }

    const text = `${target.prefix || ""}${value}${target.suffix || ""}`;
    const baseText = `${target.prefix || ""}${field.defaultValue || ""}${target.suffix || ""}`;
    if (targetElements.length === 1) {
      const originalText = targetElements[0].getAttribute("data-kroki-original-text") || "";
      const renderedText = !target.prefix && !target.suffix && String(value) === String(field.defaultValue || "") && originalText
        ? originalText
        : text;
      applyFittedText(
        targetElements[0],
        renderedText,
        originalText || baseText,
        target.fit && String(value).length > String(field.defaultValue || "").length
      );
      return;
    }
    if (String(value).length > targetElements.length) {
      applyMergedText(targetElements, text);
      return;
    }
    applyDistributedText(targetElements, text);
  }

  function applyEditableText(model, group) {
    const sign = signFromModel(model);
    const fields = editableTextDefinitionsForSign(sign);
    if (!fields.length) {
      applyLegacyEditableText(model, group);
      return;
    }
    const elements = textElementsIn(group);
    fields.forEach((field) => applyFieldTarget(elements, field, editableFieldValue(model, field)));
  }

  function metricsFor(model) {
    const sign = signFromModel(model);
    const geometry = model.geometry || {};
    const scale = clampScale(geometry.scale);
    const cacheKey = [
      sign.key || "",
      sign.viewBox || "",
      sign.width || "",
      sign.height || "",
      scale
    ].join("|");
    const cached = metricsCache.get(model);
    if (cached?.key === cacheKey) return cached.metrics;

    const viewBox = viewBoxFor(sign);
    const metrics = {
      sign,
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
    return Array.from(element.children || []).find((child) => child.classList?.contains("editor-traffic-sign-art")) || null;
  }

  function artKeyFor(sign) {
    return [
      sign.key || "",
      sign.viewBox || "",
      sign.width || "",
      sign.height || "",
      String(sign.art || "").length
    ].join("|");
  }

  function textKeyFor(model) {
    const sign = signFromModel(model);
    const fieldKey = editableTextFieldsKey(model);
    return [
      sign.key || "",
      fieldKey,
      model.label?.text || model.label?.labelText || "",
      Boolean(model.metadata?.signTextInitialized) ? "initialized" : "fallback"
    ].join("|");
  }

  function syncArt(element, model, sign) {
    const artKey = artKeyFor(sign);
    let art = artFor(element);
    if (!art || art.dataset.signArtKey !== artKey) {
      art = parseArt(sign);
      art.classList.add("editor-traffic-sign-art");
      art.dataset.signArtKey = artKey;
      element.replaceChildren(art);
      element.dataset.signTextKey = "";
    }

    const textKey = textKeyFor(model);
    if (element.dataset.signTextKey !== textKey) {
      applyEditableText(model, art);
      element.dataset.signTextKey = textKey;
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
    className: "editor-traffic-sign",
    capabilities: { arrows: false, fill: false, curvedLabel: false, ownsLabel: true, trafficSign: true },

    create(initialData = {}) {
      const sign = initialData.sign || catalog.find(initialData.signKey);
      const metadata = catalog.metadataFor(sign || {});
      const center = initialData.center || initialData.point || {};
      const geometry = initialData.geometry || {};
      const baseScale = Number(sign?.baseScale) || Number(metadata.signBaseScale) || 0.08;
      const fields = editableTextDefinitionsForSign(sign);
      const initialMetadata = initialData.metadata || {};
      const signTextFields = fields.reduce((values, field) => {
        const sourceValues = initialMetadata.signTextFields || {};
        values[field.id] = Object.prototype.hasOwnProperty.call(sourceValues, field.id)
          ? normalizeEditableFieldValue(sourceValues[field.id], field)
          : normalizeEditableFieldValue(field.defaultValue, field);
        return values;
      }, {});
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
          ...initialMetadata,
          ...(fields.length ? { signTextFields, signTextInitialized: true } : {})
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
      const metrics = metricsFor(model);
      const sign = metrics.sign;
      const geometry = model.geometry || {};
      syncArt(element, model, sign);
      writeDataset(element, "cx", geometry.cx);
      writeDataset(element, "cy", geometry.cy);
      writeDataset(element, "scale", metrics.scale);
      writeDataset(element, "rotation", utils.normalizeRotation(geometry.rotation));
      writeDataset(element, "signKey", sign.key || "");
      writeDataset(element, "signCode", sign.code || "");
      writeDataset(element, "signName", sign.name || "");
      writeDataset(element, "signCategory", sign.category || "");
      writeDataset(element, "signCategoryKey", sign.categoryKey || "");
      writeDataset(element, "signViewBox", sign.viewBox || "");
      writeDataset(element, "signWidth", sign.width || "");
      writeDataset(element, "signHeight", sign.height || "");
      writeDataset(element, "signBaseScale", sign.baseScale || "");
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
    editableTextFields,
    updateEditableTextField,

    effectiveLabel(model) {
      const label = styleManager.normalizeLabel(model.label, model.type);
      const fields = editableTextFields(model);
      if (fields.length) {
        return styleManager.normalizeLabel({ ...label, text: fields.map((field) => field.value).join("\n") }, model.type);
      }
      if (label.text || model.metadata?.signTextInitialized) return label;
      return styleManager.normalizeLabel({ ...label, text: editableTextForSign(signFromModel(model)) }, model.type);
    }
  };

  registry.register("trafficSign", adapter);
})();
