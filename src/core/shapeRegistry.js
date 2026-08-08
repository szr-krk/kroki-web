(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const Kroki = window.Kroki = window.Kroki || {};
  const adapters = Object.create(null);

  function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach((name) => {
      const value = attrs[name];
      if (value != null) element.setAttribute(name, value);
    });
    return element;
  }

  function numberOr(value, fallback) {
    if (value == null || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function pointFromEvent(canvas, event) {
    const point = canvas.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(canvas.getScreenCTM().inverse());
  }

  function svgUnitsPerScreenPx(canvas) {
    const ctm = canvas?.getScreenCTM?.();
    const scale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
    return scale > 0 ? 1 / scale : 1;
  }

  function normalizeRotation(value) {
    let angle = numberOr(value, 0) % 360;
    if (angle <= -180) angle += 360;
    if (angle > 180) angle -= 360;
    return angle;
  }

  function turkishListLabel(value) {
    return String(value ?? "")
      .toLocaleLowerCase("tr-TR")
      .replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("tr-TR"));
  }

  function turkishSearchText(value) {
    return String(value ?? "")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function typeFromElement(element) {
    const shape = element?.dataset?.shape;
    if (shape === "arc" || shape === "bezier" || shape === "circle" || shape === "ellipse" || shape === "rectangle" || shape === "closedShape" || shape === "text" || shape === "callout" || shape === "road" || shape === "trafficSign" || shape === "otherSymbol" || shape === "vehicle") return shape;
    if (element?.tagName?.toLowerCase() === "circle") return "circle";
    if (element?.tagName?.toLowerCase() === "ellipse") return "ellipse";
    if (element?.tagName?.toLowerCase() === "rect" && element?.classList?.contains("editor-rectangle")) return "rectangle";
    if (element?.tagName?.toLowerCase() === "path" && element?.classList?.contains("editor-closed-shape")) return "closedShape";
    if (element?.tagName?.toLowerCase() === "text" && element?.classList?.contains("editor-text")) return "text";
    if (element?.tagName?.toLowerCase() === "g" && element?.classList?.contains("editor-callout")) return "callout";
    if (element?.tagName?.toLowerCase() === "g" && element?.classList?.contains("editor-road")) return "road";
    if (element?.tagName?.toLowerCase() === "g" && element?.classList?.contains("editor-traffic-sign")) return "trafficSign";
    if (element?.tagName?.toLowerCase() === "g" && element?.classList?.contains("editor-other-symbol")) return "otherSymbol";
    if (element?.tagName?.toLowerCase() === "g" && element?.classList?.contains("editor-vehicle")) return "vehicle";
    if (element?.classList?.contains("editor-cizgi") || element?.tagName?.toLowerCase() === "line") return "line";
    return "";
  }

  Kroki.EditorUtils = {
    svgNs: SVG_NS,
    createSvgElement,
    numberOr,
    clonePlain,
    pointFromEvent,
    svgUnitsPerScreenPx,
    normalizeRotation,
    turkishListLabel,
    turkishSearchText,
    typeFromElement
  };

  Kroki.ShapeRegistry = {
    register(type, adapter) {
      if (!type || !adapter) return;
      adapters[type] = { ...adapter, type };
    },

    get(type) {
      return adapters[type] || null;
    },

    has(type) {
      return Boolean(adapters[type]);
    },

    all() {
      return Object.keys(adapters).map((type) => adapters[type]);
    },

    typeFromElement
  };
})();
