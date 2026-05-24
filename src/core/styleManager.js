(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const strokeStyle = window.krokiStrokeStyle;
  if (!utils || !strokeStyle) return;

  const {
    DASH_PATTERNS,
    LINE_CAPS,
    numberOr,
    colorOr,
    choiceOr,
    choiceById,
    nextChoiceId,
    normalizeDashPattern,
    normalizeLineCap,
    normalizeStrokeWidth,
    normalizeOpacity,
    opacityPercent,
    normalizeDashSize,
    normalizeDashGap,
    dashDefaults,
    lineStylePatch,
    applyStroke,
    applyDash,
    applyOpacity,
    renderLineStyleIcon,
    renderLineCapIcon
  } = strokeStyle;

  const ARROW_TYPES = [
    { id: "none" },
    { id: "triangle" },
    { id: "triangle2" },
    { id: "bar" },
    { id: "trianglewithbar" },
    { id: "circle" }
  ];
  const TEXT_SIDES = [
    { id: "on", title: "Metin cizgi ustunde" },
    { id: "above", title: "Metin cizgi yukarisinda" },
    { id: "below", title: "Metin cizgi asagisinda" }
  ];
  const TEXT_ANCHORS = [
    { id: "start", title: "Metin baslangicta", t: 0, anchor: "start" },
    { id: "middle", title: "Metin ortada", t: 0.5, anchor: "middle" },
    { id: "end", title: "Metin sonda", t: 1, anchor: "end" }
  ];
  const TEXT_ALIGNS = [
    { id: "left", title: "Metin solda", anchor: "start", x: 0 },
    { id: "center", title: "Metin ortada", anchor: "middle", x: 0.5 },
    { id: "right", title: "Metin sagda", anchor: "end", x: 1 }
  ];
  const TEXT_ROTATE_MODES = [
    { id: "shape", title: "Metin sekille doner" },
    { id: "flat", title: "Metin yatay kalir" }
  ];
  const FILL_PATTERNS = [
    { id: "none", title: "Duz dolgu" },
    {
      id: "paver",
      title: "Kilit tasi",
      defaultFill: "#d1d5db",
      width: 28,
      height: 18,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("path", {
            d: "M0 9H28M14 0V9M7 9V18M21 9V18M0 0H28V18H0Z",
            fill: "none",
            stroke: "#475569",
            "stroke-width": "1.05",
            "stroke-linecap": "square",
            opacity: ".52"
          })
        );
      }
    },
    {
      id: "paverTexture",
      title: "Kilit tasi doku",
      defaultFill: "#cbd5e1",
      width: 36,
      height: 24,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("path", {
            d: "M0 12H36M18 0V12M9 12V24M27 12V24M0 0H36V24H0Z",
            fill: "none",
            stroke: "#334155",
            "stroke-width": "1.15",
            opacity: ".52"
          }),
          utils.createSvgElement("path", {
            d: "M4 5L7 3M15 7L19 5M25 4L30 6M5 18L11 16M21 19L25 17M31 15L34 18",
            fill: "none",
            stroke: "#f8fafc",
            "stroke-width": ".9",
            "stroke-linecap": "round",
            opacity: ".38"
          }),
          utils.createSvgElement("circle", { cx: "12", cy: "4", r: ".8", fill: "#475569", opacity: ".28" }),
          utils.createSvgElement("circle", { cx: "31", cy: "8", r: ".75", fill: "#475569", opacity: ".26" }),
          utils.createSvgElement("circle", { cx: "17", cy: "18", r: ".85", fill: "#475569", opacity: ".25" })
        );
      }
    },
    {
      id: "pavement",
      title: "Kaldirim",
      defaultFill: "#e5e7eb",
      width: 24,
      height: 24,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("path", {
            d: "M0 0H24V24H0ZM0 12H24M12 0V24",
            fill: "none",
            stroke: "#64748b",
            "stroke-width": "1",
            opacity: ".46"
          })
        );
      }
    },
    {
      id: "grass",
      title: "Cim",
      defaultFill: "#dcfce7",
      width: 22,
      height: 22,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("path", {
            d: "M5 18Q7 12 10 8M10 18Q12 13 15 9M15 18Q17 13 20 10M2 10Q5 7 8 6M11 5Q14 3 18 3",
            fill: "none",
            stroke: "#15803d",
            "stroke-width": "1.35",
            "stroke-linecap": "round",
            opacity: ".56"
          })
        );
      }
    },
    {
      id: "grassFine",
      title: "Cim ince",
      defaultFill: "#bbf7d0",
      width: 18,
      height: 18,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("path", {
            d: "M2 17Q4 11 7 6M6 18Q8 10 11 4M10 18Q12 11 16 6M14 18Q16 13 18 9M1 8Q5 5 9 4M9 9Q13 6 17 5",
            fill: "none",
            stroke: "#166534",
            "stroke-width": ".95",
            "stroke-linecap": "round",
            opacity: ".52"
          }),
          utils.createSvgElement("path", {
            d: "M4 15Q6 12 8 10M12 15Q14 11 17 8",
            fill: "none",
            stroke: "#22c55e",
            "stroke-width": ".85",
            "stroke-linecap": "round",
            opacity: ".44"
          })
        );
      }
    },
    {
      id: "grassDense",
      title: "Cim yogun",
      defaultFill: "#86efac",
      width: 24,
      height: 24,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("path", {
            d: "M3 22Q5 14 9 8M7 23Q10 14 13 6M12 23Q14 15 19 8M17 22Q20 15 22 11M2 12Q7 8 12 7M8 14Q14 9 21 7M4 20Q10 17 16 16M14 21Q18 17 23 15",
            fill: "none",
            stroke: "#14532d",
            "stroke-width": "1.25",
            "stroke-linecap": "round",
            opacity: ".48"
          }),
          utils.createSvgElement("circle", { cx: "5", cy: "5", r: "1", fill: "#22c55e", opacity: ".35" }),
          utils.createSvgElement("circle", { cx: "18", cy: "4", r: "1.1", fill: "#16a34a", opacity: ".32" }),
          utils.createSvgElement("circle", { cx: "21", cy: "20", r: ".9", fill: "#22c55e", opacity: ".34" })
        );
      }
    },
    {
      id: "grassPatch",
      title: "Cim parcali",
      defaultFill: "#d9f99d",
      width: 28,
      height: 28,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("path", {
            d: "M4 21Q8 13 13 10M7 24Q12 17 17 14M18 8Q21 4 25 3M20 12Q24 8 28 7M2 8Q5 5 9 4M15 24Q19 20 25 18",
            fill: "none",
            stroke: "#15803d",
            "stroke-width": "1.45",
            "stroke-linecap": "round",
            opacity: ".52"
          }),
          utils.createSvgElement("ellipse", { cx: "10", cy: "16", rx: "5", ry: "2.2", fill: "#22c55e", opacity: ".16" }),
          utils.createSvgElement("ellipse", { cx: "22", cy: "8", rx: "4.5", ry: "2", fill: "#16a34a", opacity: ".15" }),
          utils.createSvgElement("ellipse", { cx: "22", cy: "22", rx: "5.5", ry: "2.4", fill: "#4ade80", opacity: ".14" })
        );
      }
    },
    {
      id: "median",
      title: "Refuj",
      defaultFill: "#dcfce7",
      width: 18,
      height: 18,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("path", {
            d: "M-4 22L22 -4M5 23L23 5",
            fill: "none",
            stroke: "#16a34a",
            "stroke-width": "1.4",
            "stroke-linecap": "round",
            opacity: ".48"
          })
        );
      }
    },
    {
      id: "gravel",
      title: "Cakil",
      defaultFill: "#e5e7eb",
      width: 20,
      height: 20,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("circle", { cx: "5", cy: "6", r: "1.5", fill: "#64748b", opacity: ".46" }),
          utils.createSvgElement("circle", { cx: "14", cy: "4", r: "1.2", fill: "#475569", opacity: ".38" }),
          utils.createSvgElement("circle", { cx: "10", cy: "14", r: "1.7", fill: "#64748b", opacity: ".42" }),
          utils.createSvgElement("circle", { cx: "18", cy: "15", r: "1.1", fill: "#475569", opacity: ".34" })
        );
      }
    },
    {
      id: "soil",
      title: "Toprak",
      defaultFill: "#d6a46f",
      width: 24,
      height: 24,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("circle", { cx: "4", cy: "5", r: "1.5", fill: "#92400e", opacity: ".30" }),
          utils.createSvgElement("circle", { cx: "12", cy: "4", r: ".9", fill: "#78350f", opacity: ".26" }),
          utils.createSvgElement("circle", { cx: "20", cy: "7", r: "1.25", fill: "#a16207", opacity: ".28" }),
          utils.createSvgElement("circle", { cx: "8", cy: "15", r: "1.8", fill: "#92400e", opacity: ".24" }),
          utils.createSvgElement("circle", { cx: "17", cy: "17", r: "1.1", fill: "#78350f", opacity: ".24" }),
          utils.createSvgElement("path", {
            d: "M2 21Q7 19 11 21M14 10Q18 9 22 11",
            fill: "none",
            stroke: "#78350f",
            "stroke-width": ".9",
            "stroke-linecap": "round",
            opacity: ".24"
          })
        );
      }
    },
    {
      id: "soilRocky",
      title: "Toprak cakilli",
      defaultFill: "#c08457",
      width: 28,
      height: 28,
      draw(pattern) {
        pattern.append(
          utils.createSvgElement("circle", { cx: "5", cy: "6", r: "1.8", fill: "#78350f", opacity: ".30" }),
          utils.createSvgElement("circle", { cx: "15", cy: "5", r: "1.1", fill: "#fbbf24", opacity: ".20" }),
          utils.createSvgElement("circle", { cx: "23", cy: "9", r: "2", fill: "#92400e", opacity: ".28" }),
          utils.createSvgElement("circle", { cx: "10", cy: "19", r: "2.3", fill: "#57534e", opacity: ".25" }),
          utils.createSvgElement("circle", { cx: "21", cy: "22", r: "1.4", fill: "#78350f", opacity: ".27" }),
          utils.createSvgElement("path", {
            d: "M2 14Q7 11 12 13M16 16Q21 13 27 15M3 25Q8 23 13 25",
            fill: "none",
            stroke: "#7c2d12",
            "stroke-width": "1",
            "stroke-linecap": "round",
            opacity: ".28"
          })
        );
      }
    }
  ];
  const MARKER_BASE = {
    circle: {
      viewBox: "0 0 10 10",
      refX: "5",
      refY: "5",
      draw(marker) {
        marker.append(utils.createSvgElement("circle", { cx: "5", cy: "5", r: "5", fill: "context-stroke" }));
      }
    },
    triangle: {
      viewBox: "0 0 10 10",
      refX: "0",
      refY: "5",
      draw(marker) {
        marker.append(utils.createSvgElement("path", { d: "M0 0L10 5L0 10Z", fill: "context-stroke" }));
      }
    },
    triangle2: {
      viewBox: "0 0 10 10",
      refX: "5",
      refY: "5",
      draw(marker) {
        marker.append(utils.createSvgElement("path", { d: "M0 0L10 5L0 10L4 5Z", fill: "context-stroke" }));
      }
    },
    trianglewithbar: {
      viewBox: "0 0 10 10",
      refX: "0",
      refY: "5",
      draw(marker) {
        marker.append(utils.createSvgElement("path", { d: "M0 0L6 5L0 10ZM6 0L6 10L7 10L7 0Z", fill: "context-stroke" }));
      }
    },
    bar: {
      viewBox: "0 0 10 10",
      refX: "5",
      refY: "5",
      draw(marker) {
        marker.append(utils.createSvgElement("path", {
          d: "M5 0L5 10",
          fill: "none",
          stroke: "context-stroke",
          "stroke-linecap": "round",
          "stroke-width": "2"
        }));
      }
    }
  };

  let manager = null;
  let selection = null;
  let controls = null;
  let bound = false;
  let textInputTransaction = null;

  function normalizeArrowType(value) {
    if (value === "open") return "triangle";
    return choiceOr(value, ARROW_TYPES, "none");
  }

  function normalizeLabelText(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .toLocaleUpperCase("tr-TR");
  }

  function normalizeLabelSize(value) {
    return Math.max(1, Math.round(numberOr(value, 18)));
  }

  function normalizeLabelFlag(value) {
    return value === true || value === 1 || value === "1" || value === "true";
  }

  function normalizeLabelPosition(position, type) {
    const source = position || {};
    if (type === "line" || type === "arc" || type === "bezier") {
      return {
        side: choiceOr(source.side === "center" ? "on" : source.side, TEXT_SIDES, "above"),
        anchor: choiceOr(source.anchor, TEXT_ANCHORS, "middle")
      };
    }

    if (type === "circle") {
      return {
        align: choiceOr(source.align, TEXT_ALIGNS, "center"),
        rotateMode: choiceOr(source.rotateMode, TEXT_ROTATE_MODES, "shape")
      };
    }

    return {
      align: choiceOr(source.align, TEXT_ALIGNS, "center")
    };
  }

  function isShapeWithFill(type) {
    return type === "circle" || type === "ellipse" || type === "rectangle" || type === "closedShape" || type === "callout";
  }

  function normalizeFillPattern(value) {
    return choiceOr(value, FILL_PATTERNS, "none");
  }

  function supportsFillPattern(adapter) {
    return Boolean(adapter?.capabilities?.fill && !adapter?.capabilities?.ownsLabel);
  }

  function defaultStyleFor(type) {
    const fill = isShapeWithFill(type) ? "#ffffff" : "none";
    return {
      stroke: type === "callout" ? "#d11f1f" : isShapeWithFill(type) ? "#000000" : "#111827",
      fill,
      strokeWidth: 2,
      opacity: 1,
      strokeOpacity: 1,
      fillOpacity: 1,
      fillPattern: "none",
      dash: "solid",
      dashSize: 12,
      dashGap: 8,
      lineCap: "round",
      arrowStart: "none",
      arrowEnd: "none"
    };
  }

  function normalizeStyle(style, type) {
    const base = defaultStyleFor(type);
    const source = style || {};
    const merged = { ...base, ...source };
    const dashPattern = normalizeDashPattern(merged.dashPattern || merged.dash);
    const defaults = dashDefaults(dashPattern);
    const legacyOpacity = source.opacity;
    const normalized = {
      stroke: colorOr(merged.stroke || merged.strokeColor, base.stroke),
      fill: isShapeWithFill(type) ? colorOr(merged.fill || merged.fillColor, base.fill) : "none",
      strokeWidth: normalizeStrokeWidth(merged.strokeWidth),
      opacity: normalizeOpacity(merged.opacity),
      strokeOpacity: normalizeOpacity(source.strokeOpacity ?? source.strokeAlpha ?? legacyOpacity ?? base.strokeOpacity),
      fillOpacity: normalizeOpacity(source.fillOpacity ?? source.fillAlpha ?? legacyOpacity ?? base.fillOpacity),
      fillPattern: isShapeWithFill(type) ? normalizeFillPattern(merged.fillPattern || merged.fillTexture || merged.patternFill) : "none",
      dash: dashPattern,
      dashSize: normalizeDashSize(merged.dashSize, defaults.dashSize),
      dashGap: normalizeDashGap(merged.dashGap, defaults.dashGap),
      lineCap: normalizeLineCap(merged.lineCap),
      arrowStart: normalizeArrowType(merged.arrowStart || merged.startArrow),
      arrowEnd: normalizeArrowType(merged.arrowEnd || merged.endArrow)
    };
    if (normalized.dash === "dot") normalized.lineCap = "round";
    return normalized;
  }

  function normalizeLabel(label, type) {
    const source = label || {};
    const defaultColor = type === "callout" ? "#000000" : "#111827";
    return {
      text: normalizeLabelText(source.text || source.labelText),
      size: normalizeLabelSize(source.size || source.labelSize),
      color: colorOr(source.color || source.labelColor, defaultColor),
      opacity: normalizeOpacity(source.opacity ?? source.labelOpacity ?? 1),
      position: normalizeLabelPosition(source.position || source, type),
      bold: normalizeLabelFlag(source.bold ?? source.labelBold),
      italic: normalizeLabelFlag(source.italic ?? source.labelItalic),
      underline: normalizeLabelFlag(source.underline ?? source.labelUnderline)
    };
  }

  function readStyleFromElement(element, type) {
    const dashPattern = normalizeDashPattern(element.dataset.dashPattern);
    const legacyScale = numberOr(element.dataset.dashScale, 1);
    const dashDefault = dashDefaults(dashPattern, legacyScale);
    return normalizeStyle({
      strokeWidth: element.dataset.strokeWidth || element.style.strokeWidth || element.getAttribute("stroke-width"),
      stroke: element.dataset.strokeColor || element.style.stroke || element.getAttribute("stroke"),
      fill: element.dataset.fillColor || element.style.fill || element.getAttribute("fill"),
      fillPattern: element.dataset.fillPattern || element.getAttribute("data-fill-pattern"),
      opacity: element.dataset.opacity || element.style.opacity || element.getAttribute("opacity"),
      strokeOpacity: element.dataset.strokeOpacity || element.style.strokeOpacity || element.getAttribute("stroke-opacity") || element.dataset.opacity || element.style.opacity || element.getAttribute("opacity"),
      fillOpacity: element.dataset.fillOpacity || element.style.fillOpacity || element.getAttribute("fill-opacity") || element.dataset.opacity || element.style.opacity || element.getAttribute("opacity"),
      lineCap: element.dataset.lineCap || element.style.strokeLinecap || element.getAttribute("stroke-linecap"),
      arrowStart: element.dataset.startArrow,
      arrowEnd: element.dataset.endArrow,
      dash: dashPattern,
      dashSize: normalizeDashSize(element.dataset.dashSize, dashDefault.dashSize),
      dashGap: normalizeDashGap(element.dataset.dashGap, dashDefault.dashGap)
    }, type);
  }

  function readLabelFromElement(element, type) {
    return normalizeLabel({
      text: element.dataset.labelText,
      size: element.dataset.labelSize,
      color: element.dataset.labelColor,
      opacity: element.dataset.labelOpacity,
      side: element.dataset.labelSide,
      anchor: element.dataset.labelAnchor,
      align: element.dataset.labelAlign,
      rotateMode: element.dataset.labelRotateMode,
      bold: element.dataset.labelBold,
      italic: element.dataset.labelItalic,
      underline: element.dataset.labelUnderline
    }, type);
  }

  function writeStyleDataset(element, model) {
    const style = normalizeStyle(model.style, model.type);
    const label = normalizeLabel(model.label, model.type);
    element.dataset.strokeWidth = String(style.strokeWidth);
    element.dataset.strokeColor = style.stroke;
    element.dataset.strokeOpacity = String(style.strokeOpacity);
    element.dataset.fillOpacity = String(style.fillOpacity);
    element.dataset.lineCap = style.lineCap;
    element.dataset.dashPattern = style.dash;
    element.dataset.dashSize = String(style.dashSize);
    element.dataset.dashGap = String(style.dashGap);
    element.dataset.startArrow = style.arrowStart;
    element.dataset.endArrow = style.arrowEnd;
    element.dataset.labelText = label.text;
    element.dataset.labelSize = String(label.size);
    element.dataset.labelColor = label.color;
    element.dataset.labelOpacity = String(label.opacity);
    delete element.dataset.dashScale;

    if (model.type === "text") {
      element.dataset.labelAlign = label.position.align;
      element.dataset.labelBold = label.bold ? "1" : "0";
      element.dataset.labelItalic = label.italic ? "1" : "0";
      element.dataset.labelUnderline = label.underline ? "1" : "0";
      element.dataset.opacity = String(style.opacity);
      delete element.dataset.fillColor;
      delete element.dataset.fillPattern;
      delete element.dataset.strokeOpacity;
      delete element.dataset.fillOpacity;
      delete element.dataset.labelSide;
      delete element.dataset.labelAnchor;
      delete element.dataset.labelRotateMode;
      return;
    }

    if (model.type === "callout") {
      element.dataset.fillColor = style.fill;
      delete element.dataset.fillPattern;
      element.dataset.labelAlign = label.position.align;
      element.dataset.labelBold = label.bold ? "1" : "0";
      element.dataset.labelItalic = label.italic ? "1" : "0";
      element.dataset.labelUnderline = label.underline ? "1" : "0";
      delete element.dataset.labelSide;
      delete element.dataset.labelAnchor;
      delete element.dataset.labelRotateMode;
      delete element.dataset.opacity;
      return;
    }

    if (isShapeWithFill(model.type)) {
      element.dataset.fillColor = style.fill;
      if (style.fillPattern && style.fillPattern !== "none") element.dataset.fillPattern = style.fillPattern;
      else delete element.dataset.fillPattern;
      element.dataset.labelAlign = label.position.align;
      delete element.dataset.labelBold;
      delete element.dataset.labelItalic;
      delete element.dataset.labelUnderline;
      delete element.dataset.labelSide;
      delete element.dataset.labelAnchor;
      if (model.type === "circle") element.dataset.labelRotateMode = label.position.rotateMode;
      else delete element.dataset.labelRotateMode;
      delete element.dataset.opacity;
      return;
    }

    delete element.dataset.fillColor;
    delete element.dataset.fillPattern;
    delete element.dataset.opacity;
    element.dataset.labelSide = label.position.side;
    element.dataset.labelAnchor = label.position.anchor;
    delete element.dataset.labelAlign;
    delete element.dataset.labelRotateMode;
    delete element.dataset.labelBold;
    delete element.dataset.labelItalic;
    delete element.dataset.labelUnderline;
  }

  function styleForStrokeHelpers(style) {
    return {
      strokeColor: style.stroke,
      strokeWidth: style.strokeWidth,
      lineCap: style.lineCap,
      dashPattern: style.dash,
      dashSize: style.dashSize,
      dashGap: style.dashGap
    };
  }

  function applyPaintOpacity(element, style, hasFill) {
    element.removeAttribute("opacity");
    element.style.opacity = "";
    element.setAttribute("stroke-opacity", String(style.strokeOpacity));
    element.style.strokeOpacity = String(style.strokeOpacity);
    if (hasFill) {
      element.setAttribute("fill-opacity", String(style.fillOpacity));
      element.style.fillOpacity = String(style.fillOpacity);
      return;
    }
    element.removeAttribute("fill-opacity");
    element.style.fillOpacity = "";
  }

  function markerStrokeUnitSize(strokeWidth) {
    const visualStroke = Math.max(3, normalizeStrokeWidth(strokeWidth));
    const visibleSize = visualStroke * 2 + 10;
    return visibleSize / Math.max(1, normalizeStrokeWidth(strokeWidth));
  }

  function markerId(type, strokeWidth) {
    const visualStroke = Math.max(3, normalizeStrokeWidth(strokeWidth));
    const visibleSize = visualStroke * 2 + 10;
    return [
      "editor-line-marker",
      type,
      "sw" + normalizeStrokeWidth(strokeWidth),
      "v" + Math.round(visibleSize * 100)
    ].join("-");
  }

  function markerUrl(type, strokeWidth) {
    return type === "none" ? "" : "url(#" + markerId(type, strokeWidth) + ")";
  }

  function ensureMarkerDefs(canvas) {
    let defs = canvas.querySelector("#editorLineDefs");
    if (defs) return defs;
    defs = utils.createSvgElement("defs", { id: "editorLineDefs" });
    canvas.insertBefore(defs, canvas.firstChild);
    return defs;
  }

  function ensureMarker(canvas, type, strokeWidth) {
    if (type === "none") return null;
    const config = MARKER_BASE[type];
    if (!config) return null;
    const defs = ensureMarkerDefs(canvas);
    const id = markerId(type, strokeWidth);
    const existing = defs.querySelector("#" + id);
    if (existing) return existing;
    const size = markerStrokeUnitSize(strokeWidth);
    const marker = utils.createSvgElement("marker", {
      id,
      viewBox: config.viewBox,
      refX: config.refX,
      refY: config.refY,
      markerWidth: String(size),
      markerHeight: String(size),
      orient: "auto-start-reverse",
      markerUnits: "strokeWidth"
    });
    config.draw(marker);
    defs.append(marker);
    return marker;
  }

  function ensureFillPatternDefs(canvas) {
    if (!canvas) return null;
    let defs = canvas.querySelector("#editorFillPatternDefs");
    if (defs) return defs;
    defs = utils.createSvgElement("defs", { id: "editorFillPatternDefs" });
    canvas.insertBefore(defs, canvas.firstChild);
    return defs;
  }

  function safePaintId(value) {
    return String(value || "shape")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/^([^a-zA-Z_])/, "_$1")
      .slice(0, 90);
  }

  function fillPatternId(model) {
    return "editor-fill-pattern-" + safePaintId(model?.id);
  }

  function fillPatternBaseColor(style) {
    return style.fill === "none" || style.fill === "transparent" ? "transparent" : colorOr(style.fill, "#ffffff");
  }

  function ensureFillPattern(canvas, model, style) {
    const patternChoice = choiceById(FILL_PATTERNS, style.fillPattern);
    if (!patternChoice || patternChoice.id === "none") return null;
    const defs = ensureFillPatternDefs(canvas);
    if (!defs) return null;
    const id = fillPatternId(model);
    let pattern = document.getElementById(id);
    if (!pattern || pattern.parentNode !== defs) {
      pattern = utils.createSvgElement("pattern", { id });
      defs.append(pattern);
    }

    const width = Math.max(4, Number(patternChoice.width) || 24);
    const height = Math.max(4, Number(patternChoice.height) || width);
    pattern.replaceChildren();
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("patternContentUnits", "userSpaceOnUse");
    pattern.setAttribute("x", "0");
    pattern.setAttribute("y", "0");
    pattern.setAttribute("width", String(width));
    pattern.setAttribute("height", String(height));
    pattern.setAttribute("data-fill-pattern-for", String(model?.id || ""));
    pattern.setAttribute("data-editor-fill-pattern", patternChoice.id);
    pattern.append(utils.createSvgElement("rect", {
      x: "0",
      y: "0",
      width: String(width),
      height: String(height),
      fill: fillPatternBaseColor(style)
    }));
    patternChoice.draw?.(pattern);
    return pattern;
  }

  function collectPaintId(element, attrName, usedIds) {
    const value = element?.getAttribute?.(attrName) || "";
    const match = value.match(/^url\(#([^)]+)\)$/);
    if (match?.[1]?.startsWith("editor-fill-pattern-")) usedIds.add(match[1]);
  }

  function pruneUnusedFillPatterns(canvas) {
    const defs = canvas?.querySelector?.("#editorFillPatternDefs");
    if (!defs) return;
    const usedIds = new Set();
    canvas.querySelectorAll("#editorObjects [data-kroki-object='true']").forEach((element) => {
      collectPaintId(element, "fill", usedIds);
    });
    defs.querySelectorAll("pattern[id^='editor-fill-pattern-']").forEach((pattern) => {
      if (!usedIds.has(pattern.id)) pattern.remove();
    });
  }

  function cleanupDefs(canvas) {
    pruneUnusedFillPatterns(canvas);
    pruneUnusedMarkers(canvas);
  }

  function collectMarkerId(element, attrName, usedIds) {
    const value = element?.getAttribute?.(attrName) || "";
    const match = value.match(/^url\(#([^)]+)\)$/);
    if (match?.[1]?.startsWith("editor-line-marker-")) usedIds.add(match[1]);
  }

  function pruneUnusedMarkers(canvas) {
    const defs = canvas.querySelector("#editorLineDefs");
    if (!defs) return;
    const usedIds = new Set();
    canvas.querySelectorAll("#editorObjects [data-kroki-object='true']").forEach((element) => {
      collectMarkerId(element, "marker-start", usedIds);
      collectMarkerId(element, "marker-end", usedIds);
    });
    defs.querySelectorAll("marker[id^='editor-line-marker-']").forEach((marker) => {
      if (!usedIds.has(marker.id)) marker.remove();
    });
  }

  function applyMarkers(element, style, adapter, canvas) {
    if (!adapter?.capabilities?.arrows) {
      element.removeAttribute("marker-start");
      element.removeAttribute("marker-end");
      return;
    }

    ensureMarker(canvas, style.arrowStart, style.strokeWidth);
    ensureMarker(canvas, style.arrowEnd, style.strokeWidth);
    const startMarker = markerUrl(style.arrowStart, style.strokeWidth);
    const endMarker = markerUrl(style.arrowEnd, style.strokeWidth);
    if (startMarker) element.setAttribute("marker-start", startMarker);
    else element.removeAttribute("marker-start");
    if (endMarker) element.setAttribute("marker-end", endMarker);
    else element.removeAttribute("marker-end");
  }

  function applyStyleToElement(element, model, adapter, canvas) {
    const style = normalizeStyle(model.style, model.type);
    if (adapter?.capabilities?.textObject) {
      applyOpacity(element, style.opacity);
      element.removeAttribute("stroke");
      element.removeAttribute("stroke-width");
      element.removeAttribute("stroke-dasharray");
      element.removeAttribute("stroke-linecap");
      element.removeAttribute("stroke-opacity");
      element.removeAttribute("fill-opacity");
      element.removeAttribute("marker-start");
      element.removeAttribute("marker-end");
      pruneUnusedFillPatterns(canvas);
      pruneUnusedMarkers(canvas);
      return;
    }

    if (adapter?.capabilities?.ownsLabel) {
      element.removeAttribute("stroke");
      element.removeAttribute("stroke-width");
      element.removeAttribute("stroke-dasharray");
      element.removeAttribute("stroke-linecap");
      element.removeAttribute("stroke-opacity");
      element.removeAttribute("opacity");
      element.removeAttribute("fill");
      element.removeAttribute("fill-opacity");
      element.style.stroke = "";
      element.style.strokeWidth = "";
      element.style.strokeDasharray = "";
      element.style.strokeLinecap = "";
      element.style.strokeOpacity = "";
      element.style.opacity = "";
      element.style.fill = "";
      element.style.fillOpacity = "";
      element.removeAttribute("marker-start");
      element.removeAttribute("marker-end");
      pruneUnusedFillPatterns(canvas);
      pruneUnusedMarkers(canvas);
      return;
    }

    applyStroke(element, styleForStrokeHelpers(style));
    applyDash(element, styleForStrokeHelpers(style));
    element.setAttribute("vector-effect", "non-scaling-stroke");

    if (adapter?.capabilities?.fill) {
      const pattern = supportsFillPattern(adapter) ? ensureFillPattern(canvas, model, style) : null;
      const fill = pattern ? "url(#" + pattern.id + ")" : style.fill;
      element.style.fill = fill;
      element.setAttribute("fill", fill);
    } else {
      element.style.fill = "none";
      element.setAttribute("fill", "none");
    }
    applyPaintOpacity(element, style, Boolean(adapter?.capabilities?.fill));

    applyMarkers(element, style, adapter, canvas);
    pruneUnusedFillPatterns(canvas);
    pruneUnusedMarkers(canvas);
  }

  function renderArrowIcon(svg, type, isStart) {
    if (!svg) return;
    const point = isStart ? 10 : 38;
    svg.replaceChildren(utils.createSvgElement("path", {
      d: "M10 12H38",
      fill: "none",
      stroke: "currentColor",
      "stroke-linecap": "round",
      "stroke-width": "3"
    }));

    if (type === "triangle") {
      svg.append(utils.createSvgElement("path", {
        d: isStart ? "M10 12L21 6L21 18Z" : "M38 12L27 6L27 18Z",
        fill: "currentColor"
      }));
      return;
    }
    if (type === "triangle2") {
      svg.append(utils.createSvgElement("path", {
        d: isStart ? "M10 12L21 6L21 18L17 12Z" : "M38 12L27 6L27 18L31 12Z",
        fill: "currentColor"
      }));
      return;
    }
    if (type === "trianglewithbar") {
      svg.append(
        utils.createSvgElement("path", {
          d: isStart ? "M10 12L20 7L20 17Z" : "M38 12L28 7L28 17Z",
          fill: "currentColor"
        }),
        utils.createSvgElement("path", {
          d: isStart ? "M22 6V18" : "M26 6V18",
          fill: "none",
          stroke: "currentColor",
          "stroke-linecap": "round",
          "stroke-width": "3"
        })
      );
      return;
    }
    if (type === "circle") {
      svg.append(utils.createSvgElement("circle", { cx: String(point), cy: "12", r: "4.8", fill: "currentColor" }));
      return;
    }
    if (type === "bar") {
      svg.append(utils.createSvgElement("path", {
        d: `M${point} 5V19`,
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-width": "4"
      }));
    }
  }

  function renderLineSnapIcon(svg) {
    if (!svg) return;
    svg.replaceChildren(
      utils.createSvgElement("path", {
        d: "M11 37H37V11",
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": "4.2"
      }),
      utils.createSvgElement("path", {
        d: "M12 12L36 36",
        fill: "none",
        stroke: "currentColor",
        "stroke-dasharray": "4 4",
        "stroke-linecap": "round",
        "stroke-width": "2.1",
        opacity: ".44"
      }),
      utils.createSvgElement("circle", { cx: "11", cy: "37", r: "2.4", fill: "currentColor" }),
      utils.createSvgElement("circle", { cx: "37", cy: "11", r: "2.4", fill: "currentColor" })
    );
  }

  function renderLineTextAlignIcon(svg, anchorId) {
    if (!svg) return;
    const anchor = choiceById(TEXT_ANCHORS, anchorId);
    const guideX = anchor.id === "start" ? 8 : anchor.id === "end" ? 24 : 16;
    const textWidth = 13;
    const textX = anchor.id === "start" ? guideX : anchor.id === "end" ? guideX - textWidth : guideX - textWidth / 2;
    svg.replaceChildren(
      utils.createSvgElement("path", { d: "M6 25H26", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-width": "2.2" }),
      utils.createSvgElement("path", { d: `M${guideX} 7V27`, fill: "none", stroke: "currentColor", "stroke-dasharray": "2 3", "stroke-linecap": "round", "stroke-width": "1.8", opacity: ".58" }),
      utils.createSvgElement("circle", { cx: String(guideX), cy: "25", r: "2.2", fill: "currentColor" }),
      utils.createSvgElement("rect", { x: String(textX), y: "9", width: String(textWidth), height: "4", rx: "1.4", fill: "currentColor" }),
      utils.createSvgElement("rect", { x: String(textX), y: "16", width: "9", height: "4", rx: "1.4", fill: "currentColor" })
    );
  }

  function renderLineTextSideIcon(svg, sideId) {
    if (!svg) return;
    const side = choiceById(TEXT_SIDES, sideId);
    const textY = side.id === "above" ? 5 : side.id === "below" ? 21 : 12;
    svg.replaceChildren(
      utils.createSvgElement("path", { d: "M5 16H27", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-width": "2.4" }),
      utils.createSvgElement("path", { d: "M16 7V25", fill: "none", stroke: "currentColor", "stroke-dasharray": "2 3", "stroke-linecap": "round", "stroke-width": "1.7", opacity: ".44" }),
      utils.createSvgElement("rect", { x: "9", y: String(textY), width: "14", height: "4", rx: "1.4", fill: "currentColor" }),
      utils.createSvgElement("rect", { x: "11", y: String(textY + 6.5), width: "10", height: "4", rx: "1.4", fill: "currentColor" })
    );
  }

  function renderShapeTextAlignIcon(svg, alignId, type) {
    if (!svg) return;
    const align = choiceById(TEXT_ALIGNS, alignId);
    const guideX = align.id === "left" ? 7 : align.id === "right" ? 25 : 16;
    const textX = align.id === "left" ? 7 : align.id === "right" ? 13 : 10;
    const outline = type === "rectangle"
      ? utils.createSvgElement("rect", { x: "5", y: "7.5", width: "22", height: "17", fill: "none", stroke: "currentColor", "stroke-width": "2.1" })
      : type === "ellipse"
        ? utils.createSvgElement("ellipse", { cx: "16", cy: "16", rx: "12", ry: "8.5", fill: "none", stroke: "currentColor", "stroke-width": "2.1" })
        : utils.createSvgElement("circle", { cx: "16", cy: "16", r: "12", fill: "none", stroke: "currentColor", "stroke-width": "2.1" });
    svg.replaceChildren(
      outline,
      utils.createSvgElement("path", { d: `M${guideX} 8V24`, fill: "none", stroke: "currentColor", "stroke-dasharray": "2 3", "stroke-linecap": "round", "stroke-width": "1.7", opacity: ".58" }),
      utils.createSvgElement("rect", { x: String(textX), y: "12", width: "12", height: "3.8", rx: "1.3", fill: "currentColor" }),
      utils.createSvgElement("rect", { x: String(textX), y: "18", width: "8", height: "3.8", rx: "1.3", fill: "currentColor" })
    );
  }

  function renderFreeTextAlignIcon(svg, alignId) {
    if (!svg) return;
    const align = choiceById(TEXT_ALIGNS, alignId);
    const guideX = align.id === "left" ? 7 : align.id === "right" ? 25 : 16;
    const textX = align.id === "left" ? 7 : align.id === "right" ? 13 : 10;
    svg.replaceChildren(
      utils.createSvgElement("path", { d: `M${guideX} 6V26`, fill: "none", stroke: "currentColor", "stroke-dasharray": "2 3", "stroke-linecap": "round", "stroke-width": "1.7", opacity: ".58" }),
      utils.createSvgElement("rect", { x: String(textX), y: "9", width: "12", height: "3.8", rx: "1.3", fill: "currentColor" }),
      utils.createSvgElement("rect", { x: String(textX), y: "16", width: "9", height: "3.8", rx: "1.3", fill: "currentColor" }),
      utils.createSvgElement("rect", { x: String(textX), y: "23", width: "14", height: "3.8", rx: "1.3", fill: "currentColor" })
    );
  }

  function renderShapeTextRotateIcon(svg, rotateMode) {
    if (!svg) return;
    const followsShape = rotateMode === "shape";
    const shacklePath = followsShape
      ? "M13 15V12.5A4 4 0 0 1 20.2 10.1"
      : "M12 15V12.5A4 4 0 0 1 20 12.5V15";
    svg.replaceChildren(
      utils.createSvgElement("path", { d: "M16 4A12 12 0 1 0 28 16M28 16L24.7 13.1M28 16L25.1 19.3", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2.2" }),
      utils.createSvgElement("path", { d: shacklePath, fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2.2" }),
      utils.createSvgElement("rect", { x: "9.5", y: "15", width: "13", height: "10", rx: "2", fill: "currentColor" }),
      utils.createSvgElement("circle", { cx: "16", cy: "19.2", r: "1.25", fill: "#ffffff" })
    );
  }

  function activeEntry() {
    if (!manager || !selection) return null;
    const model = selection.getActiveModel();
    if (model) {
      const adapter = Kroki.ShapeRegistry.get(model.type);
      return { model, adapter };
    }
    if (Kroki.MultiSelectManager?.getSelectedGroupId?.() || Kroki.MultiSelectManager?.hasGroupUnitSelection?.()) return null;
    const multiModel = Kroki.MultiSelectManager?.hasSelection?.() ? Kroki.MultiSelectManager.getPrimaryModel?.() : null;
    if (!multiModel) return null;
    const adapter = Kroki.ShapeRegistry.get(multiModel.type);
    return { model: multiModel, adapter, multi: true };
  }

  function isTextObjectEntry(entry) {
    return Boolean(entry?.adapter?.capabilities?.textObject);
  }

  function activeIsTextObject() {
    return isTextObjectEntry(activeEntry());
  }

  function hidePanels(options = {}) {
    document.querySelector("#lineStylePanel")?.classList.add("gizli");
    document.querySelector("#lineTextPanel")?.classList.add("gizli");
    document.querySelector("#strokeColorPanel")?.classList.add("gizli");
    document.querySelector("#fillColorPanel")?.classList.add("gizli");
    document.querySelector("#fillPatternPanel")?.classList.add("gizli");
    document.querySelector("#textColorPanel")?.classList.add("gizli");
    controls?.styleButton?.setAttribute("aria-expanded", "false");
    controls?.textButton?.setAttribute("aria-expanded", "false");
    controls?.colorButton?.setAttribute("aria-expanded", "false");
    controls?.fillButton?.setAttribute("aria-expanded", "false");
    controls?.fillPatternButton?.setAttribute("aria-expanded", "false");
    controls?.textColorButton?.setAttribute("aria-expanded", "false");
    controls?.closedShapeEdit?.classList.remove("is-active");
    controls?.closedShapeEdit?.setAttribute("aria-pressed", "false");
    if (!options.keepTextComposer) Kroki.FreeTextComposer?.hideEdit?.();
  }

  function hideColorPanels() {
    document.querySelector("#strokeColorPanel")?.classList.add("gizli");
    document.querySelector("#fillColorPanel")?.classList.add("gizli");
    document.querySelector("#fillPatternPanel")?.classList.add("gizli");
    document.querySelector("#textColorPanel")?.classList.add("gizli");
    controls?.colorButton?.setAttribute("aria-expanded", "false");
    controls?.fillButton?.setAttribute("aria-expanded", "false");
    controls?.fillPatternButton?.setAttribute("aria-expanded", "false");
    controls?.textColorButton?.setAttribute("aria-expanded", "false");
  }

  function setControlVisibility(adapter) {
    const isTextObject = Boolean(adapter?.capabilities?.textObject);
    const isCallout = adapter?.type === "callout";
    const noText = Boolean(adapter?.capabilities?.noText);
    const hasPointEdit = Boolean(adapter?.capabilities?.pointEdit);
    const supportsTextFormatting = isTextObject || Boolean(adapter?.capabilities?.textFormatting);
    const hasFill = Boolean(adapter?.capabilities?.fill);
    const hasFillPattern = supportsFillPattern(adapter);
    const hasArrows = Boolean(adapter?.capabilities?.arrows);
    document.querySelectorAll(".shape-only-control").forEach((control) => control.classList.toggle("gizli", !hasFill));
    document.querySelectorAll(".fill-pattern-control").forEach((control) => control.classList.toggle("gizli", !hasFillPattern));
    document.querySelectorAll(".line-only-control").forEach((control) => control.classList.toggle("gizli", !hasArrows));
    document.querySelectorAll(".text-object-control").forEach((control) => control.classList.toggle("gizli", !supportsTextFormatting));
    document.querySelectorAll(".closed-shape-control").forEach((control) => control.classList.toggle("gizli", !hasPointEdit));
    controls?.textButton?.classList.toggle("gizli", noText);
    if (noText) {
      document.querySelector("#lineTextPanel")?.classList.add("gizli");
      document.querySelector("#textColorPanel")?.classList.add("gizli");
      controls?.textButton?.setAttribute("aria-expanded", "false");
      controls?.textColorButton?.setAttribute("aria-expanded", "false");
    }
    if (!hasFillPattern) {
      document.querySelector("#fillPatternPanel")?.classList.add("gizli");
      controls?.fillPatternButton?.setAttribute("aria-expanded", "false");
    }
    controls?.strokeStepper?.classList.toggle("gizli", isCallout);
    controls?.styleButton?.classList.toggle("gizli", isTextObject);
    controls?.lineCapButton?.classList.toggle("gizli", isTextObject || isCallout);
    controls?.textSide?.classList.toggle("gizli", noText || adapter?.type === "ellipse" || adapter?.type === "rectangle" || supportsTextFormatting);
  }

  function updateStyle(patch) {
    const entry = activeEntry();
    if (!entry) return;
    if (entry.multi) {
      Kroki.MultiSelectManager?.applyStyle?.(patch);
      return;
    }
    selection.promoteToEdit();
    manager.updateStyle(entry.model.id, patch);
  }

  function updateLabel(patch, options = {}) {
    const entry = activeEntry();
    if (!entry) return;
    selection.promoteToEdit();
    manager.updateLabel(entry.model.id, patch, options);
  }

  function beginTextInputHistory() {
    if (textInputTransaction || Kroki.HistoryManager?.isSuspended?.()) return;
    textInputTransaction = Kroki.HistoryManager?.begin?.("Metin guncelle") || null;
  }

  function commitTextInputHistory() {
    if (!textInputTransaction) return;
    Kroki.HistoryManager?.commit?.(textInputTransaction, "Metin guncelle");
    textInputTransaction = null;
  }

  function updatePrimarySize(delta) {
    const entry = activeEntry();
    if (!entry) return;
    if (isTextObjectEntry(entry)) {
      updateLabel({ size: normalizeLabelSize(entry.model.label.size + delta) });
      return;
    }
    updateStyle({ strokeWidth: normalizeStrokeWidth(entry.model.style.strokeWidth + delta) });
  }

  function updatePrimaryColor(color) {
    if (activeIsTextObject()) updateLabel({ color });
    else updateStyle({ stroke: color });
  }

  function setToggleButton(button, value) {
    button?.classList.toggle("is-active", Boolean(value));
    button?.setAttribute("aria-pressed", String(Boolean(value)));
  }

  function colorWithOpacity(color, opacity) {
    const match = String(color || "").match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!match) return color || "#111827";
    return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${normalizeOpacity(opacity)})`;
  }

  function syncTextInputPreview(label, style, enabled) {
    if (!controls?.textInput) return;
    if (!enabled) {
      controls.textInput.style.textAlign = "";
      controls.textInput.style.color = "";
      controls.textInput.style.fontWeight = "";
      controls.textInput.style.fontStyle = "";
      controls.textInput.style.textDecoration = "";
      controls.textInput.style.fontSize = "";
      return;
    }

    controls.textInput.style.textAlign = label.position.align;
    controls.textInput.style.color = colorWithOpacity(label.color, label.opacity);
    controls.textInput.style.fontWeight = label.bold ? "900" : "500";
    controls.textInput.style.fontStyle = label.italic ? "italic" : "normal";
    controls.textInput.style.textDecoration = label.underline ? "underline" : "none";
    controls.textInput.style.fontSize = "";
  }

  function syncControls() {
    const entry = activeEntry();
    if (!entry || !controls) {
      hidePanels();
      return;
    }

    const { model, adapter } = entry;
    const isTextObject = isTextObjectEntry(entry);
    const supportsTextFormatting = isTextObject || Boolean(adapter?.capabilities?.textFormatting);
    const style = normalizeStyle(model.style, model.type);
    const label = normalizeLabel(model.label, model.type);
    const dashPattern = choiceById(DASH_PATTERNS, style.dash);
    const lineCap = choiceById(LINE_CAPS, style.lineCap);
    const fillPattern = choiceById(FILL_PATTERNS, style.fillPattern);
    const strokeOpacityValue = opacityPercent(style.strokeOpacity);
    const fillOpacityValue = opacityPercent(style.fillOpacity);
    const textOpacityValue = opacityPercent(label.opacity);
    const primaryOpacityValue = isTextObject ? opacityPercent(style.opacity) : strokeOpacityValue;

    setControlVisibility(adapter);
    controls.colorButton?.style.setProperty("--side-ip-stroke-color", isTextObject ? label.color : style.stroke);
    controls.fillButton?.style.setProperty("--side-ip-fill-color", style.fill);
    controls.fillPatternButton?.style.setProperty("--side-ip-fill-color", style.fill === "none" ? "#ffffff" : style.fill);
    controls.styleButton?.style.setProperty("--side-ip-stroke-color", style.stroke);
    controls.lineCapButton?.style.setProperty("--side-ip-stroke-color", style.stroke);
    controls.arrowStack?.style.setProperty("--side-ip-stroke-color", style.stroke);
    const primaryColorLabel = isTextObject ? "Metin rengi" : model.type === "callout" ? "Cizgi ve kutu rengi" : "Cizgi rengi";
    controls.colorButton?.setAttribute("title", primaryColorLabel);
    controls.colorButton?.setAttribute("aria-label", primaryColorLabel);
    controls.fillButton?.setAttribute("title", model.type === "callout" ? "Metin arka plan rengi" : "Dolgu rengi");
    controls.fillButton?.setAttribute("aria-label", model.type === "callout" ? "Metin arka plan rengi" : "Dolgu rengi");
    const fillPatternLabel = fillPattern.id === "none" ? "Dolgu deseni" : "Dolgu deseni: " + fillPattern.title;
    controls.fillPatternButton?.classList.toggle("is-active", fillPattern.id !== "none");
    controls.fillPatternButton?.setAttribute("title", fillPatternLabel);
    controls.fillPatternButton?.setAttribute("aria-label", fillPatternLabel);
    controls.textButton?.setAttribute("title", isTextObject ? "Metni duzenle" : "Cizgi metni");
    controls.textButton?.setAttribute("aria-label", isTextObject ? "Metni duzenle" : "Cizgi metni");
    controls.textButton?.setAttribute("aria-controls", isTextObject ? "freeTextComposer" : "lineTextPanel");
    if (controls.colorInput) controls.colorInput.value = isTextObject ? label.color : style.stroke;
    if (controls.fillInput) controls.fillInput.value = style.fill === "none" ? "#ffffff" : style.fill;
    controls.strokeOpacityControl?.classList.remove("gizli");
    controls.strokeOpacityControl?.setAttribute("aria-label", isTextObject ? "Metin opakligi" : "Cizgi opakligi");
    controls.strokeOpacityInput?.setAttribute("aria-label", isTextObject ? "Metin opakligi" : "Cizgi opakligi");
    if (controls.strokeOpacityInput && controls.strokeOpacityInput.value !== String(primaryOpacityValue)) controls.strokeOpacityInput.value = String(primaryOpacityValue);
    if (controls.strokeOpacityValue) controls.strokeOpacityValue.textContent = primaryOpacityValue + "%";
    if (controls.fillOpacityInput && controls.fillOpacityInput.value !== String(fillOpacityValue)) controls.fillOpacityInput.value = String(fillOpacityValue);
    if (controls.fillOpacityValue) controls.fillOpacityValue.textContent = fillOpacityValue + "%";
    if (controls.textOpacityInput && controls.textOpacityInput.value !== String(textOpacityValue)) controls.textOpacityInput.value = String(textOpacityValue);
    if (controls.textOpacityValue) controls.textOpacityValue.textContent = textOpacityValue + "%";
    if (controls.strokeStepper) controls.strokeStepper.setAttribute("aria-label", isTextObject ? "Metin boyutu" : "Cizgi kalinligi");
    controls.strokePlus?.setAttribute("aria-label", isTextObject ? "Metin boyutunu arttir" : "Cizgi kalinligini arttir");
    controls.strokeMinus?.setAttribute("aria-label", isTextObject ? "Metin boyutunu azalt" : "Cizgi kalinligini azalt");
    controls.strokeInput?.setAttribute("aria-label", isTextObject ? "Metin boyutu" : "Cizgi kalinligi");
    const primarySize = isTextObject ? label.size : style.strokeWidth;
    if (controls.strokeInput && controls.strokeInput.value !== String(primarySize)) controls.strokeInput.value = String(primarySize);
    renderLineStyleIcon(controls.styleIcon);
    renderLineCapIcon(controls.lineCapIcon);
    renderLineSnapIcon(controls.lineSnapIcon);
    const snapEnabled = Boolean(Kroki.LineSnap?.isEnabled?.());
    const snapLabel = snapEnabled ? "Yatay dikey cizim yardimcisi acik" : "Yatay dikey cizim yardimcisi kapali";
    controls.lineSnapButton?.classList.toggle("is-active", snapEnabled);
    controls.lineSnapButton?.setAttribute("aria-pressed", String(snapEnabled));
    controls.lineSnapButton?.setAttribute("title", snapLabel);
    controls.lineSnapButton?.setAttribute("aria-label", snapLabel);
    controls.styleChoices.forEach((button) => {
      const isSelected = button.dataset.lineStyle === style.dash;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-checked", String(isSelected));
    });
    controls.fillPatternChoices.forEach((button) => {
      const isSelected = button.dataset.fillPattern === style.fillPattern;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-checked", String(isSelected));
    });
    if (controls.dashSizeValue) controls.dashSizeValue.textContent = String(style.dashSize);
    if (controls.dashGapValue) controls.dashGapValue.textContent = String(style.dashGap);
    controls.styleControls?.classList.toggle("is-empty", !dashPattern.usesDashGap);
    controls.dashSizeControl?.classList.toggle("gizli", !dashPattern.usesDashSize);
    controls.dashGapControl?.classList.toggle("gizli", !dashPattern.usesDashGap);
    controls.lineCapButton?.setAttribute("title", style.dash === "dot" ? "Noktali desende yuvarlak stroke ucu" : lineCap.title);
    controls.lineCapButton?.setAttribute("aria-label", style.dash === "dot" ? "Noktali desende yuvarlak stroke ucu" : lineCap.title);
    renderArrowIcon(controls.startArrowIcon, style.arrowStart, true);
    renderArrowIcon(controls.endArrowIcon, style.arrowEnd, false);
    const pointEditActive = selection.getMode?.() === "edit" && Boolean(model.metadata?.pointEdit);
    controls.closedShapeEdit?.classList.toggle("is-active", pointEditActive);
    controls.closedShapeEdit?.setAttribute("aria-pressed", String(pointEditActive));
    if (controls.textInput && controls.textInput.value !== label.text) controls.textInput.value = label.text;
    if (controls.textColorInput) controls.textColorInput.value = label.color;
    if (controls.textSizeValue) controls.textSizeValue.textContent = String(label.size);
    controls.textColorButton?.style.setProperty("--side-ip-fill-color", label.color);
    setToggleButton(controls.textBold, label.bold);
    setToggleButton(controls.textItalic, label.italic);
    setToggleButton(controls.textUnderline, label.underline);
    setToggleButton(controls.sideTextBold, label.bold);
    setToggleButton(controls.sideTextItalic, label.italic);
    setToggleButton(controls.sideTextUnderline, label.underline);
    syncTextInputPreview(label, style, supportsTextFormatting);

    if (isTextObject) {
      const align = choiceById(TEXT_ALIGNS, label.position.align);
      renderFreeTextAlignIcon(controls.textAlignIcon, align.id);
      controls.textAlign?.setAttribute("title", align.title);
      controls.textAlign?.setAttribute("aria-label", align.title);
      return;
    }

    if (adapter?.capabilities?.textFormatting) {
      const align = choiceById(TEXT_ALIGNS, label.position.align);
      renderFreeTextAlignIcon(controls.textAlignIcon, align.id);
      controls.textAlign?.setAttribute("title", align.title);
      controls.textAlign?.setAttribute("aria-label", align.title);
      return;
    }

    if (model.type === "line" || model.type === "arc" || model.type === "bezier") {
      const textSide = choiceById(TEXT_SIDES, label.position.side);
      const textAnchor = choiceById(TEXT_ANCHORS, label.position.anchor);
      renderLineTextSideIcon(controls.textSideIcon, textSide.id);
      renderLineTextAlignIcon(controls.textAlignIcon, textAnchor.id);
      controls.textSide?.setAttribute("title", textSide.title);
      controls.textSide?.setAttribute("aria-label", textSide.title);
      controls.textAlign?.setAttribute("title", textAnchor.title);
      controls.textAlign?.setAttribute("aria-label", textAnchor.title);
      return;
    }

    const align = choiceById(TEXT_ALIGNS, label.position.align);
    renderShapeTextAlignIcon(controls.textAlignIcon, align.id, model.type);
    controls.textAlign?.setAttribute("title", align.title);
    controls.textAlign?.setAttribute("aria-label", align.title);
    if (model.type === "circle") {
      const rotateMode = choiceById(TEXT_ROTATE_MODES, label.position.rotateMode);
      renderShapeTextRotateIcon(controls.textSideIcon, rotateMode.id);
      controls.textSide?.setAttribute("title", rotateMode.title);
      controls.textSide?.setAttribute("aria-label", rotateMode.title);
    }
  }

  function repositionPanel(panel, button) {
    window.krokiObjectEditCore?.positionOpenPanelNearButton?.(panel, button);
  }

  function showPanel(panel, button) {
    if (!activeEntry() || !panel) return;
    selection.promoteToEdit();
    hidePanels();
    syncControls();
    panel.classList.remove("gizli");
    button?.setAttribute("aria-expanded", "true");
    window.krokiObjectEditCore?.positionPanelNearButton?.(panel, button);
    if (panel.id === "lineTextPanel") {
      controls?.textInput?.focus();
      controls?.textInput?.select();
    }
  }

  function showColorPanel(panel, button, options = {}) {
    if (!activeEntry() || !panel) return;
    if (!panel.classList.contains("gizli")) {
      hideColorPanels();
      return;
    }
    selection.promoteToEdit();
    if (options.keepTextPanel) hideColorPanels();
    else hidePanels();
    syncControls();
    panel.classList.remove("gizli");
    button?.setAttribute("aria-expanded", "true");
    window.krokiObjectEditCore?.positionPanelNearButton?.(panel, button);
  }

  function showTextPanel(textPanel) {
    const entry = activeEntry();
    if (!entry) return;
    if (isTextObjectEntry(entry)) {
      selection.promoteToEdit();
      hidePanels({ keepTextComposer: true });
      syncControls();
      Kroki.FreeTextComposer?.openEdit?.(entry.model.id);
      controls?.textButton?.setAttribute("aria-expanded", "true");
      return;
    }
    showPanel(textPanel, controls.textButton);
  }

  function togglePanel(panel, button) {
    if (!panel) return;
    if (panel.classList.contains("gizli")) showPanel(panel, button);
    else hidePanels();
  }

  function closePanelOnOutsideClick(event, panel, button) {
    if (!panel || panel.classList.contains("gizli")) return;
    if (panel.contains(event.target) || button?.contains(event.target)) return;
    panel.classList.add("gizli");
    button?.setAttribute("aria-expanded", "false");
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    controls = {
      strokeMinus: document.querySelector("#btnLineStrokeWidthMinus"),
      strokePlus: document.querySelector("#btnLineStrokeWidthPlus"),
      strokeInput: document.querySelector("#lineStrokeWidthInput"),
      strokeStepper: document.querySelector(".side-ip-stepper-vertical"),
      colorButton: document.querySelector("#btnLineColor"),
      colorInput: document.querySelector("#lineColorInput"),
      strokeColorPanel: document.querySelector("#strokeColorPanel"),
      strokeOpacityControl: document.querySelector("#strokeOpacityControl"),
      strokeOpacityInput: document.querySelector("#strokeOpacityInput"),
      strokeOpacityValue: document.querySelector("#strokeOpacityValue"),
      fillButton: document.querySelector("#btnShapeFill"),
      fillInput: document.querySelector("#shapeFillInput"),
      fillColorPanel: document.querySelector("#fillColorPanel"),
      fillOpacityInput: document.querySelector("#fillOpacityInput"),
      fillOpacityValue: document.querySelector("#fillOpacityValue"),
      fillPatternButton: document.querySelector("#btnFillPattern"),
      fillPatternPanel: document.querySelector("#fillPatternPanel"),
      fillPatternChoices: Array.from(document.querySelectorAll("button[data-fill-pattern]")),
      textColorPanel: document.querySelector("#textColorPanel"),
      textOpacityInput: document.querySelector("#textOpacityInput"),
      textOpacityValue: document.querySelector("#textOpacityValue"),
      styleButton: document.querySelector("#btnLineStyle"),
      styleIcon: document.querySelector("#iconLineStyle"),
      lineCapButton: document.querySelector("#btnLineCap"),
      lineCapIcon: document.querySelector("#iconLineCap"),
      lineSnapButton: document.querySelector("#btnLineSnap"),
      lineSnapIcon: document.querySelector("#iconLineSnap"),
      closedShapeEdit: document.querySelector("#btnClosedShapeEdit"),
      styleChoices: Array.from(document.querySelectorAll("[data-line-style]")),
      styleControls: document.querySelector(".line-style-controls"),
      dashSizeControl: document.querySelector("#lineDashSizeControl"),
      dashSizeMinus: document.querySelector("#btnLineDashSizeMinus"),
      dashSizePlus: document.querySelector("#btnLineDashSizePlus"),
      dashSizeValue: document.querySelector("#valLineDashSize"),
      dashGapControl: document.querySelector("#lineDashGapControl"),
      dashGapMinus: document.querySelector("#btnLineDashGapMinus"),
      dashGapPlus: document.querySelector("#btnLineDashGapPlus"),
      dashGapValue: document.querySelector("#valLineDashGap"),
      arrowStack: document.querySelector(".side-ip-arrow-stack"),
      startArrow: document.querySelector("#btnLineStartArrow"),
      startArrowIcon: document.querySelector("#iconLineStartArrow"),
      endArrow: document.querySelector("#btnLineEndArrow"),
      endArrowIcon: document.querySelector("#iconLineEndArrow"),
      textButton: document.querySelector("#btnLineText"),
      textInput: document.querySelector("#lineTextInput"),
      textSizeMinus: document.querySelector("#btnLineTextSizeMinus"),
      textSizePlus: document.querySelector("#btnLineTextSizePlus"),
      textSizeValue: document.querySelector("#valLineTextSize"),
      textSide: document.querySelector("#btnLineTextSide"),
      textSideIcon: document.querySelector("#iconLineTextSide"),
      textAlign: document.querySelector("#btnLineTextAlign"),
      textAlignIcon: document.querySelector("#iconLineTextAlign"),
      textColorButton: document.querySelector("#btnLineTextColor"),
      textColorInput: document.querySelector("#lineTextColorInput"),
      textBold: document.querySelector("#btnLineTextBold"),
      textItalic: document.querySelector("#btnLineTextItalic"),
      textUnderline: document.querySelector("#btnLineTextUnderline"),
      sideTextBold: document.querySelector("#btnSideTextBold"),
      sideTextItalic: document.querySelector("#btnSideTextItalic"),
      sideTextUnderline: document.querySelector("#btnSideTextUnderline")
    };

    const core = window.krokiObjectEditCore;
    const bindHoldAction = core?.bindHoldAction || (() => {});
    const stylePanel = document.querySelector("#lineStylePanel");
    const textPanel = document.querySelector("#lineTextPanel");
    const strokeColorPanel = document.querySelector("#strokeColorPanel");
    const fillColorPanel = document.querySelector("#fillColorPanel");
    const fillPatternPanel = document.querySelector("#fillPatternPanel");
    const textColorPanel = document.querySelector("#textColorPanel");

    bindHoldAction(controls.strokeMinus, () => updatePrimarySize(-1));
    bindHoldAction(controls.strokePlus, () => updatePrimarySize(1));
    bindHoldAction(controls.dashSizeMinus, () => updateStyle({ dashSize: normalizeDashSize(activeEntry()?.model.style.dashSize - 1, 1) }));
    bindHoldAction(controls.dashSizePlus, () => updateStyle({ dashSize: normalizeDashSize(activeEntry()?.model.style.dashSize + 1, 1) }));
    bindHoldAction(controls.dashGapMinus, () => updateStyle({ dashGap: normalizeDashGap(activeEntry()?.model.style.dashGap - 1, 1) }));
    bindHoldAction(controls.dashGapPlus, () => updateStyle({ dashGap: normalizeDashGap(activeEntry()?.model.style.dashGap + 1, 1) }));
    bindHoldAction(controls.textSizeMinus, () => updateLabel({ size: normalizeLabelSize(activeEntry()?.model.label.size - 1) }));
    bindHoldAction(controls.textSizePlus, () => updateLabel({ size: normalizeLabelSize(activeEntry()?.model.label.size + 1) }));

    controls.strokeInput?.addEventListener("input", () => {
      if (controls.strokeInput.value === "") return;
      if (activeIsTextObject()) updateLabel({ size: normalizeLabelSize(controls.strokeInput.value) });
      else updateStyle({ strokeWidth: normalizeStrokeWidth(controls.strokeInput.value) });
    });
    controls.strokeInput?.addEventListener("change", () => {
      if (activeIsTextObject()) updateLabel({ size: normalizeLabelSize(controls.strokeInput.value) });
      else updateStyle({ strokeWidth: normalizeStrokeWidth(controls.strokeInput.value) });
    });
    controls.colorButton?.addEventListener("click", () => {
      if (!activeEntry()) return;
      selection.promoteToEdit();
      showColorPanel(strokeColorPanel, controls.colorButton);
    });
    controls.colorInput?.addEventListener("input", () => updatePrimaryColor(controls.colorInput.value));
    controls.strokeOpacityInput?.addEventListener("input", () => {
      const opacity = normalizeOpacity(Number(controls.strokeOpacityInput.value) / 100);
      if (activeIsTextObject()) updateStyle({ opacity });
      else updateStyle({ strokeOpacity: opacity });
    });
    controls.strokeOpacityInput?.addEventListener("change", () => {
      const opacity = normalizeOpacity(Number(controls.strokeOpacityInput.value) / 100);
      if (activeIsTextObject()) updateStyle({ opacity });
      else updateStyle({ strokeOpacity: opacity });
    });
    controls.fillButton?.addEventListener("click", () => {
      if (!activeEntry()) return;
      selection.promoteToEdit();
      showColorPanel(fillColorPanel, controls.fillButton);
    });
    controls.fillInput?.addEventListener("input", () => updateStyle({ fill: controls.fillInput.value }));
    controls.fillOpacityInput?.addEventListener("input", () => updateStyle({ fillOpacity: normalizeOpacity(Number(controls.fillOpacityInput.value) / 100) }));
    controls.fillOpacityInput?.addEventListener("change", () => updateStyle({ fillOpacity: normalizeOpacity(Number(controls.fillOpacityInput.value) / 100) }));
    controls.fillPatternButton?.addEventListener("click", () => togglePanel(fillPatternPanel, controls.fillPatternButton));
    controls.fillPatternChoices.forEach((button) => {
      button.addEventListener("click", () => {
        const entry = activeEntry();
        if (!entry || !supportsFillPattern(entry.adapter)) return;
        const pattern = normalizeFillPattern(button.dataset.fillPattern);
        const currentStyle = normalizeStyle(entry.model.style, entry.model.type);
        if (currentStyle.fillPattern === pattern) return;
        const patternChoice = choiceById(FILL_PATTERNS, pattern);
        const patch = { fillPattern: pattern };
        if (pattern !== "none" && (currentStyle.fill === "none" || currentStyle.fill === "#ffffff")) {
          patch.fill = patternChoice.defaultFill || "#d1d5db";
        }
        updateStyle(patch);
      });
    });
    controls.styleButton?.addEventListener("click", () => togglePanel(stylePanel, controls.styleButton));
    controls.styleChoices.forEach((button) => {
      button.addEventListener("click", () => {
        const entry = activeEntry();
        if (!entry || entry.model.style.dash === button.dataset.lineStyle) return;
        updateStyle(lineStylePatch(button.dataset.lineStyle));
      });
    });
    controls.startArrow?.addEventListener("click", () => {
      const style = activeEntry()?.model.style;
      if (style) updateStyle({ arrowStart: nextChoiceId(style.arrowStart, ARROW_TYPES) });
    });
    controls.endArrow?.addEventListener("click", () => {
      const style = activeEntry()?.model.style;
      if (style) updateStyle({ arrowEnd: nextChoiceId(style.arrowEnd, ARROW_TYPES) });
    });
    controls.lineCapButton?.addEventListener("click", () => {
      const style = activeEntry()?.model.style;
      if (style) updateStyle({ lineCap: nextChoiceId(style.lineCap, LINE_CAPS) });
    });
    controls.lineSnapButton?.addEventListener("click", () => {
      Kroki.LineSnap?.toggle?.();
      syncControls();
    });
    controls.closedShapeEdit?.addEventListener("click", () => {
      const entry = activeEntry();
      if (!entry?.adapter?.capabilities?.pointEdit) return;
      selection.promoteToEdit();
      manager.updateModel(entry.model.id, (model) => ({
        ...model,
        metadata: {
          ...(model.metadata || {}),
          pointEdit: !model.metadata?.pointEdit
        }
      }));
    });
    controls.textButton?.addEventListener("click", () => showTextPanel(textPanel));
    controls.textInput?.addEventListener("focus", beginTextInputHistory);
    controls.textInput?.addEventListener("input", () => {
      beginTextInputHistory();
      const normalized = normalizeLabelText(controls.textInput.value);
      if (controls.textInput.value !== normalized) {
        const selectionStart = controls.textInput.selectionStart;
        const selectionEnd = controls.textInput.selectionEnd;
        controls.textInput.value = normalized;
        controls.textInput.setSelectionRange(selectionStart, selectionEnd);
      }
      updateLabel({ text: normalized }, { skipHistory: true });
    });
    controls.textInput?.addEventListener("change", commitTextInputHistory);
    controls.textInput?.addEventListener("blur", commitTextInputHistory);
    controls.textSide?.addEventListener("click", () => {
      const entry = activeEntry();
      if (!entry) return;
      const label = normalizeLabel(entry.model.label, entry.model.type);
      if (entry.model.type === "circle") updateLabel({ position: { ...label.position, rotateMode: nextChoiceId(label.position.rotateMode, TEXT_ROTATE_MODES) } });
      else updateLabel({ position: { ...label.position, side: nextChoiceId(label.position.side, TEXT_SIDES) } });
    });
    controls.textAlign?.addEventListener("click", () => {
      const entry = activeEntry();
      if (!entry) return;
      const label = normalizeLabel(entry.model.label, entry.model.type);
      if (entry.model.type === "line" || entry.model.type === "arc" || entry.model.type === "bezier") {
        updateLabel({ position: { ...label.position, anchor: nextChoiceId(label.position.anchor, TEXT_ANCHORS) } });
      } else {
        updateLabel({ position: { ...label.position, align: nextChoiceId(label.position.align, TEXT_ALIGNS) } });
      }
    });
    controls.textColorButton?.addEventListener("click", () => {
      if (!activeEntry()) return;
      selection.promoteToEdit();
      showColorPanel(textColorPanel, controls.textColorButton, { keepTextPanel: true });
    });
    controls.textColorInput?.addEventListener("input", () => updateLabel({ color: controls.textColorInput.value }));
    controls.textOpacityInput?.addEventListener("input", () => updateLabel({ opacity: normalizeOpacity(Number(controls.textOpacityInput.value) / 100) }));
    controls.textOpacityInput?.addEventListener("change", () => updateLabel({ opacity: normalizeOpacity(Number(controls.textOpacityInput.value) / 100) }));
    const toggleTextFlag = (flag) => {
      const entry = activeEntry();
      if (!entry) return;
      const label = normalizeLabel(entry.model.label, entry.model.type);
      updateLabel({ [flag]: !label[flag] });
    };
    controls.textBold?.addEventListener("click", () => toggleTextFlag("bold"));
    controls.textItalic?.addEventListener("click", () => toggleTextFlag("italic"));
    controls.textUnderline?.addEventListener("click", () => toggleTextFlag("underline"));
    controls.sideTextBold?.addEventListener("click", () => toggleTextFlag("bold"));
    controls.sideTextItalic?.addEventListener("click", () => toggleTextFlag("italic"));
    controls.sideTextUnderline?.addEventListener("click", () => toggleTextFlag("underline"));
    document.addEventListener("pointerdown", (event) => closePanelOnOutsideClick(event, stylePanel, controls.styleButton), true);
    document.addEventListener("pointerdown", (event) => closePanelOnOutsideClick(event, strokeColorPanel, controls.colorButton), true);
    document.addEventListener("pointerdown", (event) => closePanelOnOutsideClick(event, fillColorPanel, controls.fillButton), true);
    document.addEventListener("pointerdown", (event) => closePanelOnOutsideClick(event, fillPatternPanel, controls.fillPatternButton), true);
    document.addEventListener("pointerdown", (event) => closePanelOnOutsideClick(event, textColorPanel, controls.textColorButton), true);
    document.addEventListener("pointerdown", (event) => closePanelOnOutsideClick(event, textPanel, controls.textButton), true);
    window.addEventListener("resize", () => {
      repositionPanel(stylePanel, controls.styleButton);
      repositionPanel(strokeColorPanel, controls.colorButton);
      repositionPanel(fillColorPanel, controls.fillButton);
      repositionPanel(fillPatternPanel, controls.fillPatternButton);
      repositionPanel(textColorPanel, controls.textColorButton);
      repositionPanel(textPanel, controls.textButton);
    });
  }

  Kroki.StyleManager = {
    constants: { ARROW_TYPES, TEXT_SIDES, TEXT_ANCHORS, TEXT_ALIGNS, TEXT_ROTATE_MODES, FILL_PATTERNS },
    normalizeStyle,
    normalizeLabel,
    normalizeLabelText,
    normalizeLabelSize,
    readStyleFromElement,
    readLabelFromElement,
    writeStyleDataset,
    applyStyleToElement,
    cleanupDefs,
    syncControls,
    hidePanels,
    init(options) {
      manager = options.manager;
      selection = options.selection;
      bindUi();
      syncControls();
    }
  };
})();
