(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const MAX_DPR = 1.5;
  let overlay = null;
  let context = null;
  let host = null;

  function ensureOverlay(svg) {
    const nextHost = svg?.parentElement;
    if (!svg || !nextHost || typeof window.Path2D !== "function") return false;
    if (overlay && host === nextHost) return true;
    clear();
    overlay = document.createElement("canvas");
    overlay.className = "editor-road-drag-preview";
    overlay.setAttribute("aria-hidden", "true");
    nextHost.appendChild(overlay);
    context = overlay.getContext("2d", { alpha: true, desynchronized: true });
    host = nextHost;
    if (!context) {
      clear();
      return false;
    }
    return true;
  }

  function canvasTransform(svg) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox?.baseVal;
    if (!viewBox || rect.width <= 0 || rect.height <= 0 || viewBox.width <= 0 || viewBox.height <= 0) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) {
      overlay.width = pixelWidth;
      overlay.height = pixelHeight;
    }
    const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
    return {
      dpr,
      scale,
      x: -viewBox.x * scale,
      y: -viewBox.y * scale
    };
  }

  function pathData(model, adapter) {
    const config = typeof adapter?.roadConfig === "function"
      ? adapter.roadConfig(model)
      : (model?.metadata?.road || {});
    const section = typeof adapter?.crossSection === "function" ? adapter.crossSection(config) : null;
    if (typeof adapter?.previewSurfacePathData === "function" && Number.isFinite(section?.totalWidth)) {
      return adapter.previewSurfacePathData(model, section.totalWidth);
    }
    if (typeof adapter?.surfacePathData === "function" && Number.isFinite(section?.totalWidth)) {
      return adapter.surfacePathData(model, section.totalWidth);
    }
    return typeof adapter?.offsetPathData === "function" ? adapter.offsetPathData(model, 0) : "";
  }

  function isIslandPreview(model, adapter) {
    return Boolean(model?.geometry?.profile === "islandRing" || adapter?.isIsland?.(model));
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function islandPreviewGeometry(model) {
    const geometry = model?.geometry || {};
    const center = {
      x: numberOr(geometry.center?.x, 0),
      y: numberOr(geometry.center?.y, 0)
    };
    const innerRadius = Math.max(0, numberOr(geometry.innerDiameter, 0) / 2);
    const outerRadius = Math.max(innerRadius + 1, numberOr(geometry.outerDiameter, 0) / 2);
    if (![center.x, center.y, innerRadius, outerRadius].every(Number.isFinite)) return null;
    return { center, innerRadius, outerRadius };
  }

  function updateIsland(svg, model) {
    if (!ensureOverlay(svg)) return false;
    const transform = canvasTransform(svg);
    const geometry = islandPreviewGeometry(model);
    if (!transform || !geometry) return false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, overlay.width, overlay.height);
    context.setTransform(
      transform.dpr * transform.scale,
      0,
      0,
      transform.dpr * transform.scale,
      transform.dpr * transform.x,
      transform.dpr * transform.y
    );
    context.beginPath();
    context.arc(geometry.center.x, geometry.center.y, geometry.outerRadius, 0, Math.PI * 2);
    context.arc(geometry.center.x, geometry.center.y, geometry.innerRadius, 0, Math.PI * 2, true);
    context.fillStyle = "rgba(14, 165, 233, 0.16)";
    context.strokeStyle = "#0284c7";
    context.lineWidth = 2 / Math.max(transform.scale, 0.0001);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.fill("evenodd");
    context.stroke();
    overlay.classList.add("is-active");
    return true;
  }

  function update(svg, model, adapter) {
    if (isIslandPreview(model, adapter)) return updateIsland(svg, model);
    if (!ensureOverlay(svg)) return false;
    const transform = canvasTransform(svg);
    const data = pathData(model, adapter);
    if (!transform || !data) return false;
    let path;
    try {
      path = new Path2D(data);
    } catch {
      return false;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, overlay.width, overlay.height);
    context.setTransform(
      transform.dpr * transform.scale,
      0,
      0,
      transform.dpr * transform.scale,
      transform.dpr * transform.x,
      transform.dpr * transform.y
    );
    context.fillStyle = "rgba(14, 165, 233, 0.16)";
    context.strokeStyle = "#0284c7";
    context.lineWidth = 2 / Math.max(transform.scale, 0.0001);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.fill(path, model?.geometry?.profile === "islandRing" ? "evenodd" : "nonzero");
    context.stroke(path);
    overlay.classList.add("is-active");
    return true;
  }

  function clear() {
    if (overlay && context) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, overlay.width || 0, overlay.height || 0);
    }
    if (overlay) {
      overlay.classList.remove("is-active");
      overlay.width = 0;
      overlay.height = 0;
      overlay.remove();
    }
    overlay = null;
    context = null;
    host = null;
  }

  Kroki.RoadDragPreview = { update, clear };
})();
