(() => {
  const canvas = document.querySelector("#editorCanvas");
  if (!canvas) return;

  const MIN_SCALE = 0.05;
  const MAX_SCALE = 64;
  const WHEEL_ZOOM_SPEED = 0.0012;

  const activePointers = new Map();
  const baseViewBox = readViewBox(canvas);
  let activePan = null;
  let activePinch = null;
  let gestureActive = false;
  let spacePressed = false;

  function readViewBox(svg = canvas) {
    const values = (svg.getAttribute("viewBox") || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
      return { x: values[0], y: values[1], width: values[2], height: values[3] };
    }

    return { x: 0, y: 0, width: 1200, height: 800 };
  }

  function writeViewBox(svg = canvas, viewBox) {
    const safeViewBox = {
      x: Number.isFinite(viewBox.x) ? viewBox.x : 0,
      y: Number.isFinite(viewBox.y) ? viewBox.y : 0,
      width: Number.isFinite(viewBox.width) && viewBox.width > 0 ? viewBox.width : baseViewBox.width,
      height: Number.isFinite(viewBox.height) && viewBox.height > 0 ? viewBox.height : baseViewBox.height
    };

    svg.setAttribute(
      "viewBox",
      `${safeViewBox.x} ${safeViewBox.y} ${safeViewBox.width} ${safeViewBox.height}`
    );
    svg.dispatchEvent(new CustomEvent("kroki:viewboxchange", { bubbles: true, detail: safeViewBox }));
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
    const height = baseViewBox.height / safeScale;
    return {
      x: anchorViewBox.x,
      y: anchorViewBox.y,
      width,
      height
    };
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
    writeViewBox(svg, nextViewBox);
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
    writeViewBox(svg, nextViewBox);
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

    writeViewBox(svg, nextViewBox);
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
    resetViewBox,
    isGestureActive() {
      return gestureActive;
    },
    isPanRequested() {
      return spacePressed;
    }
  };
})();
