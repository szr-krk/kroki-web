(() => {
  const canvas = document.querySelector("#editorCanvas");
  if (!canvas) return;

  const MIN_SCALE = 0.05;
  const MAX_SCALE = 64;
  const WHEEL_ZOOM_SPEED = 0.0012;
  const FIT_PADDING_WORLD = window.krokiEditorFraming?.CONTENT_PADDING_WORLD ?? 25;
  const FIT_MIN_WORLD_SPAN = 1;

  const activePointers = new Map();
  const baseViewBox = parseViewBoxFromSvg(canvas);
  let currentViewBox = { ...baseViewBox };
  let currentViewBoxText = viewBoxString(currentViewBox);
  let pendingViewBox = null;
  let pendingViewBoxText = "";
  let viewBoxWriteFrame = 0;
  let viewBoxWriteCancel = null;
  let applyingViewBox = false;
  let activePan = null;
  let activePinch = null;
  let gestureActive = false;
  let spacePressed = false;

  function viewBoxString(viewBox) {
    return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  }

  function parseViewBoxFromSvg(svg) {
    const values = (svg.getAttribute("viewBox") || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
      return { x: values[0], y: values[1], width: values[2], height: values[3] };
    }

    return { x: 0, y: 0, width: 1200, height: 800 };
  }

  function readViewBox(svg = canvas) {
    if (svg === canvas) return { ...currentViewBox };
    return parseViewBoxFromSvg(svg);
  }

  function applyViewBox(svg, safeViewBox, text) {
    if (text === currentViewBoxText && svg.getAttribute("viewBox") === text) return false;
    currentViewBoxText = text;
    svg.setAttribute("viewBox", text);
    applyingViewBox = true;
    try {
      svg.dispatchEvent(new CustomEvent("kroki:viewboxchange", { bubbles: true, detail: { ...safeViewBox } }));
    } finally {
      applyingViewBox = false;
    }
    return true;
  }

  function flushPendingViewBox() {
    viewBoxWriteFrame = 0;
    viewBoxWriteCancel = null;
    if (!pendingViewBox) return;
    const viewBox = pendingViewBox;
    const text = pendingViewBoxText;
    pendingViewBox = null;
    pendingViewBoxText = "";
    applyViewBox(canvas, viewBox, text);
  }

  function scheduleViewBoxWrite(safeViewBox, text) {
    pendingViewBox = { ...safeViewBox };
    pendingViewBoxText = text;
    if (viewBoxWriteFrame) return;
    if (window.requestAnimationFrame) {
      viewBoxWriteFrame = window.requestAnimationFrame(flushPendingViewBox);
      viewBoxWriteCancel = () => window.cancelAnimationFrame?.(viewBoxWriteFrame);
    } else {
      viewBoxWriteFrame = window.setTimeout(flushPendingViewBox, 16);
      viewBoxWriteCancel = () => window.clearTimeout?.(viewBoxWriteFrame);
    }
  }

  function cancelPendingViewBoxWrite() {
    if (!viewBoxWriteFrame) return;
    viewBoxWriteCancel?.();
    viewBoxWriteFrame = 0;
    viewBoxWriteCancel = null;
    pendingViewBox = null;
    pendingViewBoxText = "";
  }

  function syncExternalViewBox(event) {
    if (applyingViewBox || event.target !== canvas) return;
    cancelPendingViewBoxWrite();
    currentViewBox = parseViewBoxFromSvg(canvas);
    currentViewBoxText = viewBoxString(currentViewBox);
  }

  function writeViewBox(svg = canvas, viewBox, options = {}) {
    const safeViewBox = {
      x: Number.isFinite(viewBox.x) ? viewBox.x : 0,
      y: Number.isFinite(viewBox.y) ? viewBox.y : 0,
      width: Number.isFinite(viewBox.width) && viewBox.width > 0 ? viewBox.width : baseViewBox.width,
      height: Number.isFinite(viewBox.height) && viewBox.height > 0 ? viewBox.height : baseViewBox.height
    };
    const text = viewBoxString(safeViewBox);

    if (svg !== canvas) {
      if (svg.getAttribute("viewBox") !== text) {
        svg.setAttribute("viewBox", text);
        svg.dispatchEvent(new CustomEvent("kroki:viewboxchange", { bubbles: true, detail: { ...safeViewBox } }));
      }
      return safeViewBox;
    }

    currentViewBox = { ...safeViewBox };
    if (options.defer) scheduleViewBoxWrite(safeViewBox, text);
    else {
      cancelPendingViewBoxWrite();
      applyViewBox(svg, safeViewBox, text);
    }
    return safeViewBox;
  }

  function scaleForViewBox(viewBox) {
    return baseViewBox.width / viewBox.width;
  }

  function clampScale(scale) {
    if (!Number.isFinite(scale)) return 1;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function viewBoxForScale(scale, anchorViewBox = readViewBox(canvas)) {
    const safeScale = clampScale(scale);
    const width = baseViewBox.width / safeScale;
    const anchorAspect = Number.isFinite(anchorViewBox?.width)
      && Number.isFinite(anchorViewBox?.height)
      && anchorViewBox.width > 0
      && anchorViewBox.height > 0
      ? anchorViewBox.width / anchorViewBox.height
      : baseViewBox.width / baseViewBox.height;
    const height = width / anchorAspect;
    return {
      x: anchorViewBox.x,
      y: anchorViewBox.y,
      width,
      height
    };
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

  function transformPoint(matrix, point) {
    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f
    };
  }

  function canvasMatrixForElement(element) {
    const elementMatrix = element?.getScreenCTM?.();
    const canvasMatrix = canvas.getScreenCTM?.();
    if (!elementMatrix || !canvasMatrix) return null;
    try {
      return canvasMatrix.inverse().multiply(elementMatrix);
    } catch {
      return null;
    }
  }

  function boundsForElement(element) {
    if (!element?.getBBox) return null;
    try {
      const box = element.getBBox();
      if (!isFiniteBounds(box)) return null;
      const rawBounds = { x: box.x, y: box.y, width: box.width, height: box.height };
      const matrix = canvasMatrixForElement(element);
      if (!matrix) return rawBounds;
      return boundsFromPoints([
        transformPoint(matrix, { x: rawBounds.x, y: rawBounds.y }),
        transformPoint(matrix, { x: rawBounds.x + rawBounds.width, y: rawBounds.y }),
        transformPoint(matrix, { x: rawBounds.x + rawBounds.width, y: rawBounds.y + rawBounds.height }),
        transformPoint(matrix, { x: rawBounds.x, y: rawBounds.y + rawBounds.height })
      ]) || rawBounds;
    } catch {
      return null;
    }
  }

  function hasArrow(value) {
    return Boolean(value && value !== "none");
  }

  function elementStrokePad(element) {
    const strokeWidth = Math.max(
      0,
      Number(element?.dataset?.strokeWidth ?? element?.getAttribute?.("stroke-width")) || 0
    );
    let pad = strokeWidth / 2;
    if (hasArrow(element?.dataset?.startArrow) || hasArrow(element?.dataset?.endArrow)) {
      const visualStroke = Math.max(3, strokeWidth);
      pad = Math.max(pad, visualStroke * 2 + 10);
    }
    return pad;
  }

  function domContentBounds() {
    const objectLayer = document.querySelector("#editorObjects");
    if (!objectLayer) return null;
    return Array.from(objectLayer.querySelectorAll("[data-kroki-object='true']")).reduce((bounds, element) => {
      let elementBounds = expandBounds(boundsForElement(element), elementStrokePad(element));
      const objectId = element.dataset.objectId;
      if (objectId) {
        objectLayer.querySelectorAll(`[data-label-for="${objectId}"]`).forEach((label) => {
          elementBounds = unionBounds(elementBounds, boundsForElement(label));
        });
      }
      return unionBounds(bounds, elementBounds);
    }, null);
  }

  function fitViewBoxForBounds(bounds, svg = canvas, options = {}) {
    const rect = svg.getBoundingClientRect();
    const rectWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : baseViewBox.width;
    const rectHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : baseViewBox.height;
    const maxPaddingPx = Math.max(0, Math.min(rectWidth, rectHeight) / 2 - 1);
    const paddingPx = Math.min(
      maxPaddingPx,
      Math.max(0, Number(options.paddingPx) || 0)
    );
    const availableWidth = Math.max(1, rectWidth - paddingPx * 2);
    const availableHeight = Math.max(1, rectHeight - paddingPx * 2);
    const paddingWorld = Math.max(0, Number(options.paddingWorld ?? FIT_PADDING_WORLD) || 0);
    const framedBounds = window.krokiEditorFraming?.expandBounds?.(bounds, paddingWorld)
      || expandBounds(bounds, paddingWorld)
      || bounds;
    const minSpan = Math.max(0.001, Number(options.minWorldSpan ?? FIT_MIN_WORLD_SPAN) || FIT_MIN_WORLD_SPAN);
    const aspect = rectWidth / rectHeight;
    const centerX = framedBounds.x + framedBounds.width / 2;
    const centerY = framedBounds.y + framedBounds.height / 2;
    let width = Math.max(minSpan, framedBounds.width) * rectWidth / availableWidth;
    let height = Math.max(minSpan, framedBounds.height) * rectHeight / availableHeight;

    if (width / height > aspect) height = width / aspect;
    else width = height * aspect;

    const minWidth = baseViewBox.width / MAX_SCALE;
    const maxWidth = baseViewBox.width / MIN_SCALE;
    width = Math.min(maxWidth, Math.max(minWidth, width));
    height = width / aspect;

    return {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height
    };
  }

  function fitBounds(bounds, options = {}) {
    if (!isFiniteBounds(bounds)) {
      resetViewBox();
      return readViewBox(canvas);
    }
    const viewBox = fitViewBoxForBounds(bounds, canvas, options);
    writeViewBox(canvas, viewBox);
    return viewBox;
  }

  function fitToContent(options = {}) {
    const managerBounds = window.Kroki?.EditorObjectManager?.getContentBounds?.();
    const bounds = isFiniteBounds(managerBounds) ? managerBounds : domContentBounds();
    return fitBounds(bounds, options);
  }

  function getViewportMetrics(svg = canvas, viewBox = readViewBox(svg)) {
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
    const viewportWidth = viewBox.width * scale;
    const viewportHeight = viewBox.height * scale;

    return {
      rect,
      scale,
      left: rect.left + (rect.width - viewportWidth) / 2,
      top: rect.top + (rect.height - viewportHeight) / 2,
      width: viewportWidth,
      height: viewportHeight
    };
  }

  function clientToWorld(svg = canvas, clientX, clientY, viewBox = readViewBox(svg), clampToViewport = false) {
    const metrics = getViewportMetrics(svg, viewBox);
    if (!Number.isFinite(metrics.scale) || metrics.scale <= 0) {
      return { x: viewBox.x, y: viewBox.y };
    }

    let x = clientX;
    let y = clientY;
    if (clampToViewport) {
      x = Math.min(metrics.left + metrics.width, Math.max(metrics.left, x));
      y = Math.min(metrics.top + metrics.height, Math.max(metrics.top, y));
    }

    return {
      x: viewBox.x + (x - metrics.left) / metrics.scale,
      y: viewBox.y + (y - metrics.top) / metrics.scale
    };
  }

  function panByScreen(svg = canvas, dxScreen, dyScreen) {
    const viewBox = readViewBox(svg);
    const metrics = getViewportMetrics(svg, viewBox);
    if (!Number.isFinite(metrics.scale) || metrics.scale <= 0) return viewBox;

    const nextViewBox = {
      ...viewBox,
      x: viewBox.x - dxScreen / metrics.scale,
      y: viewBox.y - dyScreen / metrics.scale
    };
    writeViewBox(svg, nextViewBox, { defer: svg === canvas });
    return nextViewBox;
  }

  function zoomAtScreen(svg = canvas, factor, clientX, clientY) {
    if (!Number.isFinite(factor) || factor <= 0) return readViewBox(svg);

    const viewBox = readViewBox(svg);
    const currentScale = scaleForViewBox(viewBox);
    const nextScale = clampScale(currentScale * factor);
    if (Math.abs(nextScale - currentScale) < 0.000001) return viewBox;

    const anchor = clientToWorld(svg, clientX, clientY, viewBox, true);
    const rx = (anchor.x - viewBox.x) / viewBox.width;
    const ry = (anchor.y - viewBox.y) / viewBox.height;
    const nextViewBox = viewBoxForScale(nextScale, viewBox);

    nextViewBox.x = anchor.x - rx * nextViewBox.width;
    nextViewBox.y = anchor.y - ry * nextViewBox.height;
    writeViewBox(svg, nextViewBox, { defer: svg === canvas });
    return nextViewBox;
  }

  function pinchFromStart(svg = canvas, startViewBox, startCenter, currentCenter, scaleFactor) {
    if (!startViewBox || !startCenter || !currentCenter || !Number.isFinite(scaleFactor) || scaleFactor <= 0) {
      return readViewBox(svg);
    }

    const startScale = scaleForViewBox(startViewBox);
    const nextScale = clampScale(startScale * scaleFactor);
    const anchor = clientToWorld(svg, startCenter.x, startCenter.y, startViewBox, true);
    const rx = (anchor.x - startViewBox.x) / startViewBox.width;
    const ry = (anchor.y - startViewBox.y) / startViewBox.height;
    const nextViewBox = viewBoxForScale(nextScale, startViewBox);
    const metrics = getViewportMetrics(svg, nextViewBox);

    nextViewBox.x = anchor.x - rx * nextViewBox.width;
    nextViewBox.y = anchor.y - ry * nextViewBox.height;

    if (Number.isFinite(metrics.scale) && metrics.scale > 0) {
      nextViewBox.x -= (currentCenter.x - startCenter.x) / metrics.scale;
      nextViewBox.y -= (currentCenter.y - startCenter.y) / metrics.scale;
    }

    writeViewBox(svg, nextViewBox, { defer: svg === canvas });
    return nextViewBox;
  }

  function resetViewBox() {
    writeViewBox(canvas, baseViewBox);
  }

  function rememberPointer(event) {
    activePointers.set(event.pointerId, {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY
    });
  }

  function updatePointer(event) {
    if (!activePointers.has(event.pointerId)) return;
    rememberPointer(event);
  }

  function forgetPointer(event) {
    activePointers.delete(event.pointerId);
  }

  function centerOf(pointA, pointB) {
    return {
      x: (pointA.clientX + pointB.clientX) / 2,
      y: (pointA.clientY + pointB.clientY) / 2
    };
  }

  function distanceBetween(pointA, pointB) {
    return Math.hypot(pointB.clientX - pointA.clientX, pointB.clientY - pointA.clientY);
  }

  function firstTwoPointers() {
    return Array.from(activePointers.values()).slice(0, 2);
  }

  function setGestureActive(active) {
    if (gestureActive === active) return;
    gestureActive = active;
    canvas.classList.toggle("is-camera-panning", active);

    if (active) {
      window.dispatchEvent(new CustomEvent("kroki:camera-gesture-start"));
    }
  }

  function blockEvent(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  function isEditableTarget(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  function isBlankCanvasTarget(target) {
    return target === canvas || target?.id === "editorObjects" || target?.id === "editorEditLayer";
  }

  function canPanWithTouch(event) {
    const activeModel = window.Kroki?.SelectionManager?.getActiveModel?.();
    const selectionMode = window.Kroki?.SelectionManager?.getMode?.();
    return (
      isBlankCanvasTarget(event.target) &&
      !(activeModel?.type === "vehicle" && selectionMode === "edit") &&
      !window.krokiObjectEditCore?.hasCanvasObjectAt?.(event) &&
      !window.krokiEditorState?.getActiveTool?.() &&
      !window.krokiEditorState?.getEditMode?.()
    );
  }

  function shouldStartPan(event) {
    if (event.pointerType === "mouse") {
      return event.button === 1 || (event.button === 0 && spacePressed);
    }

    if (event.pointerType === "touch") {
      return activePointers.size === 1 && canPanWithTouch(event);
    }

    return false;
  }

  function beginPan(event) {
    activePinch = null;
    activePan = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY
    };
    canvas.setPointerCapture?.(event.pointerId);
    setGestureActive(true);
  }

  function beginPinch(event) {
    const [pointA, pointB] = firstTwoPointers();
    if (!pointA || !pointB) return;

    const distance = distanceBetween(pointA, pointB);
    if (distance < 2) return;

    activePan = null;
    activePinch = {
      pointerIds: [pointA.pointerId, pointB.pointerId],
      startViewBox: readViewBox(canvas),
      startCenter: centerOf(pointA, pointB),
      startDistance: distance
    };
    canvas.setPointerCapture?.(event.pointerId);
    setGestureActive(true);
  }

  function continuePinch(event) {
    const points = activePinch.pointerIds.map((id) => activePointers.get(id));
    const [pointA, pointB] = points;
    if (!pointA || !pointB) return;

    const distance = distanceBetween(pointA, pointB);
    if (distance < 2) return;

    pinchFromStart(
      canvas,
      activePinch.startViewBox,
      activePinch.startCenter,
      centerOf(pointA, pointB),
      distance / activePinch.startDistance
    );
    blockEvent(event);
  }

  function continuePan(event) {
    if (!activePan || activePan.pointerId !== event.pointerId) return;

    panByScreen(canvas, event.clientX - activePan.lastX, event.clientY - activePan.lastY);
    activePan.lastX = event.clientX;
    activePan.lastY = event.clientY;
    blockEvent(event);
  }

  function maybeContinuePanAfterPinch() {
    if (activePointers.size !== 1) {
      activePan = null;
      activePinch = null;
      setGestureActive(false);
      return;
    }

    const [point] = activePointers.values();
    activePan = {
      pointerId: point.pointerId,
      lastX: point.clientX,
      lastY: point.clientY
    };
    activePinch = null;
  }

  function handlePointerDown(event) {
    rememberPointer(event);

    if (activePointers.size >= 2) {
      beginPinch(event);
      blockEvent(event);
      return;
    }

    if (shouldStartPan(event)) {
      beginPan(event);
      blockEvent(event);
    }
  }

  function handlePointerMove(event) {
    updatePointer(event);

    if (activePinch) {
      continuePinch(event);
      return;
    }

    if (activePan) continuePan(event);
  }

  function handlePointerEnd(event) {
    forgetPointer(event);

    if (activePinch) {
      maybeContinuePanAfterPinch();
      blockEvent(event);
      return;
    }

    if (activePan?.pointerId === event.pointerId) {
      activePan = null;
      setGestureActive(false);
      blockEvent(event);
    }
  }

  function wheelDeltaPx(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
    return event.deltaY;
  }

  function handleWheel(event) {
    const factor = Math.exp(-wheelDeltaPx(event) * WHEEL_ZOOM_SPEED);
    zoomAtScreen(canvas, factor, event.clientX, event.clientY);
    event.preventDefault();
  }

  function handleKeyDown(event) {
    if (event.code !== "Space" || isEditableTarget(event.target)) return;
    spacePressed = true;
    canvas.classList.add("is-camera-pan-ready");
    event.preventDefault();
  }

  function handleKeyUp(event) {
    if (event.code !== "Space") return;
    spacePressed = false;
    canvas.classList.remove("is-camera-pan-ready");
  }

  canvas.addEventListener("pointerdown", handlePointerDown, true);
  canvas.addEventListener("pointermove", handlePointerMove, true);
  canvas.addEventListener("pointerup", handlePointerEnd, true);
  canvas.addEventListener("pointercancel", handlePointerEnd, true);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("kroki:viewboxchange", syncExternalViewBox);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => {
    spacePressed = false;
    canvas.classList.remove("is-camera-pan-ready");
  });

  window.krokiEditorCamera = {
    readViewBox,
    writeViewBox,
    getViewportMetrics,
    clientToWorld,
    panByScreen,
    zoomAtScreen,
    pinchFromStart,
    fitBounds,
    fitToContent,
    resetViewBox,
    isGestureActive() {
      return gestureActive;
    },
    isPanRequested() {
      return spacePressed;
    }
  };
})();
