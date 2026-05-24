(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  const DASH_PATTERNS = [
    { id: "solid", usesDashSize: false, usesDashGap: false, defaultDashSize: 12, defaultDashGap: 8 },
    { id: "dash", usesDashSize: true, usesDashGap: true, defaultDashSize: 12, defaultDashGap: 8 },
    { id: "dot", usesDashSize: false, usesDashGap: true, defaultDashSize: 0, defaultDashGap: 8 }
  ];

  const LINE_CAPS = [
    { id: "round", title: "Yuvarlak cizgi ucu" },
    { id: "butt", title: "Duz cizgi ucu" }
  ];

  function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  }

  function numberOr(value, fallback) {
    if (value == null || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function colorOr(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
  }

  function choiceOr(value, choices, fallback) {
    return choices.some((choice) => choice.id === value) ? value : fallback;
  }

  function choiceById(choices, id) {
    return choices.find((choice) => choice.id === id) || choices[0];
  }

  function nextChoiceId(current, choices) {
    const index = choices.findIndex((choice) => choice.id === current);
    return choices[(index + 1 + choices.length) % choices.length].id;
  }

  function normalizeDashPattern(value) {
    return choiceOr(value, DASH_PATTERNS, "solid");
  }

  function normalizeLineCap(value) {
    return choiceOr(value, LINE_CAPS, "round");
  }

  function normalizeStrokeWidth(value) {
    return Math.max(1, Math.round(numberOr(value, 2)));
  }

  function normalizeOpacity(value) {
    return Math.max(0, Math.min(1, numberOr(value, 1)));
  }

  function opacityPercent(value) {
    return Math.round(normalizeOpacity(value) * 100);
  }

  function normalizeDashSize(value, fallback) {
    return Math.max(1, Math.round(numberOr(value, fallback)));
  }

  function normalizeDashGap(value, fallback) {
    return Math.max(1, Math.round(numberOr(value, fallback)));
  }

  function dashDefaults(patternId, legacyScale = 1) {
    const pattern = choiceById(DASH_PATTERNS, patternId);
    return {
      dashSize: normalizeDashSize(pattern.defaultDashSize * legacyScale, pattern.defaultDashSize),
      dashGap: normalizeDashGap(pattern.defaultDashGap * legacyScale, pattern.defaultDashGap)
    };
  }

  function dashArrayForStyle(style) {
    const pattern = choiceById(DASH_PATTERNS, style.dashPattern);
    if (!pattern.usesDashGap) return [];
    if (!pattern.usesDashSize) return [0, style.dashGap];
    return [style.dashSize, style.dashGap];
  }

  function lineStylePatch(patternId) {
    const defaults = dashDefaults(patternId);
    const patch = {
      dashPattern: patternId,
      dashSize: defaults.dashSize,
      dashGap: defaults.dashGap
    };
    if (patternId === "dot") patch.lineCap = "round";
    return patch;
  }

  function applyStroke(element, style) {
    element.style.stroke = style.strokeColor;
    element.style.strokeWidth = String(style.strokeWidth);
    element.style.strokeLinecap = style.lineCap;
    element.setAttribute("stroke", style.strokeColor);
    element.setAttribute("stroke-width", String(style.strokeWidth));
    element.setAttribute("stroke-linecap", style.lineCap);
  }

  function applyDash(element, style) {
    const segments = dashArrayForStyle(style);
    if (!segments.length) {
      element.removeAttribute("stroke-dasharray");
      element.style.strokeDasharray = "";
      return;
    }

    const dashArray = segments
      .map((segment) => String(Math.max(0.1, segment)))
      .join(" ");
    element.setAttribute("stroke-dasharray", dashArray);
    element.style.strokeDasharray = dashArray;
  }

  function applyOpacity(element, opacity) {
    const normalized = normalizeOpacity(opacity);
    element.style.opacity = String(normalized);
    element.setAttribute("opacity", String(normalized));
  }

  function renderLineStyleIcon(svg) {
    if (!svg) return;

    svg.replaceChildren(
      createSvgElement("path", {
        d: "M9 14H39",
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-width": "3.8"
      }),
      createSvgElement("path", {
        d: "M9 24H39",
        fill: "none",
        stroke: "currentColor",
        "stroke-dasharray": "8 5",
        "stroke-linecap": "round",
        "stroke-width": "3.8"
      }),
      createSvgElement("path", {
        d: "M10 34H38",
        fill: "none",
        stroke: "currentColor",
        "stroke-dasharray": "0 7",
        "stroke-linecap": "round",
        "stroke-width": "3.8"
      })
    );
  }

  function renderLineCapIcon(svg) {
    if (!svg) return;

    svg.replaceChildren(
      createSvgElement("path", {
        d: "M10 18H38",
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-width": "7"
      }),
      createSvgElement("path", {
        d: "M10 31H38",
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "butt",
        "stroke-width": "7"
      }),
      createSvgElement("path", {
        d: "M10 26V36M38 26V36",
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-width": "1.7",
        opacity: ".46"
      })
    );
  }

  window.krokiStrokeStyle = {
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
    dashArrayForStyle,
    lineStylePatch,
    applyStroke,
    applyDash,
    applyOpacity,
    renderLineStyleIcon,
    renderLineCapIcon
  };
})();
