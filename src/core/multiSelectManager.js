(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  if (!utils || !manager) return;

  const selectedIds = new Set();
  let activeGroupId = "";
  let mode = "";
  let drag = null;
  let multiMode = false;
  let viewportSyncFrame = 0;
  const selectionElements = new Map();
  const groupHandles = new Map();
  let groupFrameElement = null;
  let marquee = null;

  const button = document.querySelector("#btnMultiSelectMode");
  const doneButton = document.querySelector("#btnEditTamam");
  const DRAG_START_THRESHOLD_PX = 3;
  const GROUP_MIN_SIZE = 2;
  const GROUP_CORNERS = [
    { id: "nw", sx: -1, sy: -1 },
    { id: "ne", sx: 1, sy: -1 },
    { id: "se", sx: 1, sy: 1 },
    { id: "sw", sx: -1, sy: 1 }
  ];

  function canvasPoint(event) {
    return utils.pointFromEvent(manager.canvas, event);
  }

  function adapterFor(id) {
    return manager.getAdapter(id);
  }

  function canSelectId(id) {
    const model = manager.get(id);
    if (!model) return false;
    return Kroki.GroupManager?.canGroupObject?.(id) ?? model.type !== "road";
  }

  function canSelectGroup(groupId) {
    const group = Kroki.GroupManager?.get?.(groupId);
    if (!group) return false;
    const leaves = Kroki.GroupManager?.getLeafObjectIds?.(groupId) || group.children || [];
    return leaves.length > 0 && leaves.every(canSelectId);
  }

  function activeSelectionIsRoad() {
    return Kroki.SelectionManager?.getActiveModel?.()?.type === "road";
  }

  function adapterBounds(id) {
    const model = manager.get(id);
    const adapter = adapterFor(id);
    return model && adapter?.getBounds ? adapter.getBounds(model) : null;
  }

  function boundsPoints(bounds) {
    if (!bounds) return [];
    const x = Number(bounds.x);
    const y = Number(bounds.y);
    const width = Number(bounds.width);
    const height = Number(bounds.height);
    if (![x, y, width, height].every(Number.isFinite)) return [];
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ];
  }

  function boundsFromPoints(points) {
    const usable = (points || []).filter((point) => (
      Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))
    ));
    if (!usable.length) return null;
    const minX = Math.min(...usable.map((point) => Number(point.x)));
    const minY = Math.min(...usable.map((point) => Number(point.y)));
    const maxX = Math.max(...usable.map((point) => Number(point.x)));
    const maxY = Math.max(...usable.map((point) => Number(point.y)));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function transformedElementPoints(element) {
    if (!element?.getBBox || !manager.canvas?.createSVGPoint) return [];
    try {
      const box = element.getBBox();
      const elementScreen = element.getScreenCTM?.();
      const canvasScreen = manager.canvas.getScreenCTM?.();
      const matrix = elementScreen && canvasScreen
        ? canvasScreen.inverse().multiply(elementScreen)
        : element.getCTM?.();
      if (!matrix) return [];
      const point = manager.canvas.createSVGPoint();
      return boundsPoints(box).map((corner) => {
        point.x = corner.x;
        point.y = corner.y;
        return point.matrixTransform(matrix);
      });
    } catch (_) {
      return [];
    }
  }

  function modelVisualPoints(id) {
    const points = transformedElementPoints(manager.getElement?.(id));
    if (points.length) return points;
    return boundsPoints(adapterBounds(id));
  }

  function groupVisualPoints(group) {
    return (Kroki.GroupManager?.getLeafObjectIds?.(group?.id) || group?.children || [])
      .flatMap(modelVisualPoints);
  }

  function modelBounds(id) {
    return boundsFromPoints(modelVisualPoints(id));
  }

  function selectionBounds() {
    return boundsFromPoints(Array.from(selectedIds).flatMap(modelVisualPoints));
  }

  function groupBounds(group) {
    return boundsFromPoints(groupVisualPoints(group));
  }

  function intersects(a, b) {
    return Boolean(a && b && a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y);
  }

  function containsPoint(bounds, point) {
    return Boolean(bounds && point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height);
  }

  function containsFramePoint(frame, point) {
    if (!frame || !point) return false;
    const local = framePointToLocal(frame, point);
    return Math.abs(local.x) <= frame.width / 2 && Math.abs(local.y) <= frame.height / 2;
  }

  function frameFromBounds(bounds, rotation = 0) {
    if (!bounds) return null;
    return {
      cx: bounds.x + bounds.width / 2,
      cy: bounds.y + bounds.height / 2,
      width: Math.max(GROUP_MIN_SIZE, bounds.width),
      height: Math.max(GROUP_MIN_SIZE, bounds.height),
      rotation: utils.normalizeRotation?.(rotation) ?? rotation
    };
  }

  function normalizeFrame(frame, fallbackBounds = selectionBounds()) {
    const fallback = frameFromBounds(fallbackBounds) || (frame ? {
      cx: Number(frame.cx) || 0,
      cy: Number(frame.cy) || 0,
      width: Math.max(GROUP_MIN_SIZE, Number(frame.width) || GROUP_MIN_SIZE),
      height: Math.max(GROUP_MIN_SIZE, Number(frame.height) || GROUP_MIN_SIZE),
      rotation: utils.normalizeRotation?.(frame.rotation || 0) ?? (frame.rotation || 0)
    } : null);
    if (!fallback) return null;
    return {
      cx: utils.numberOr?.(frame?.cx, fallback.cx) ?? fallback.cx,
      cy: utils.numberOr?.(frame?.cy, fallback.cy) ?? fallback.cy,
      width: Math.max(GROUP_MIN_SIZE, utils.numberOr?.(frame?.width, fallback.width) ?? fallback.width),
      height: Math.max(GROUP_MIN_SIZE, utils.numberOr?.(frame?.height, fallback.height) ?? fallback.height),
      rotation: utils.normalizeRotation?.(frame?.rotation ?? fallback.rotation) ?? (frame?.rotation ?? fallback.rotation)
    };
  }

  function frameAxes(frame) {
    const radians = (frame.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      xAxis: { x: cos, y: sin },
      yAxis: { x: -sin, y: cos }
    };
  }

  function frameLocalPoint(frame, localX, localY) {
    const axes = frameAxes(frame);
    return {
      x: frame.cx + axes.xAxis.x * localX + axes.yAxis.x * localY,
      y: frame.cy + axes.xAxis.y * localX + axes.yAxis.y * localY
    };
  }

  function framePointToLocal(frame, point) {
    const axes = frameAxes(frame);
    const dx = point.x - frame.cx;
    const dy = point.y - frame.cy;
    return {
      x: dx * axes.xAxis.x + dy * axes.xAxis.y,
      y: dx * axes.yAxis.x + dy * axes.yAxis.y
    };
  }

  function frameCornerPoints(frame) {
    if (!frame) return [];
    return [
      frameLocalPoint(frame, -frame.width / 2, -frame.height / 2),
      frameLocalPoint(frame, frame.width / 2, -frame.height / 2),
      frameLocalPoint(frame, frame.width / 2, frame.height / 2),
      frameLocalPoint(frame, -frame.width / 2, frame.height / 2)
    ];
  }

  function frameBounds(frame) {
    return boundsFromPoints(frameCornerPoints(frame));
  }

  function containsBounds(outer, inner, tolerance = 1.5) {
    if (!outer || !inner) return false;
    return (
      outer.x <= inner.x + tolerance &&
      outer.y <= inner.y + tolerance &&
      outer.x + outer.width >= inner.x + inner.width - tolerance &&
      outer.y + outer.height >= inner.y + inner.height - tolerance
    );
  }

  function groupFrame(groupId) {
    const group = groupId ? Kroki.GroupManager?.get?.(groupId) : null;
    if (!group) return null;
    const bounds = groupBounds(group);
    const storedFrame = normalizeFrame(group.metadata?.frame, bounds);
    if (storedFrame && (!bounds || containsBounds(frameBounds(storedFrame), bounds))) return storedFrame;
    return normalizeFrame(bounds ? frameFromBounds(bounds, 0) : group.metadata?.frame, bounds);
  }

  function activeGroupFrame() {
    if (drag?.type === "group-control" && drag.currentFrame) return drag.currentFrame;
    return groupFrame(activeGroupId);
  }

  function saveGroupFrame(groupId, frame) {
    if (!groupId || !frame) return;
    Kroki.GroupManager?.updateMetadata?.(groupId, (metadata = {}) => ({
      ...(metadata || {}),
      frame: utils.clonePlain(frame)
    }));
  }

  function saveActiveGroupFrame(frame) {
    saveGroupFrame(activeGroupId, frame);
  }

  function groupTreeIds(groupId) {
    return groupId ? [groupId, ...(Kroki.GroupManager?.getDescendantGroupIds?.(groupId) || [])] : [];
  }

  function groupTreeFrames(groupId) {
    return new Map(groupTreeIds(groupId)
      .map((id) => [id, groupFrame(id)])
      .filter((entry) => entry[1]));
  }

  function shiftedFrame(frame, dx, dy) {
    return frame ? { ...frame, cx: frame.cx + dx, cy: frame.cy + dy } : null;
  }

  function transformGroupFrame(frame, mapper, options = {}) {
    if (!frame) return null;
    const center = transformPoint({ x: frame.cx, y: frame.cy }, mapper);
    const scale = options.scale || 1;
    const rotationDelta = options.rotationDelta || 0;
    return {
      cx: center.x,
      cy: center.y,
      width: Math.max(GROUP_MIN_SIZE, frame.width * scale),
      height: Math.max(GROUP_MIN_SIZE, frame.height * scale),
      rotation: normalizeRotation((frame.rotation || 0) + rotationDelta)
    };
  }

  function groupControlMetrics() {
    const metrics = Kroki.ControlPointManager?.metrics?.();
    if (metrics) return metrics;
    const unit = utils.svgUnitsPerScreenPx?.(manager.canvas) || 1;
    return {
      unit,
      visibleRadius: 24 * unit,
      touchRadius: 36 * unit,
      handleGap: 48 * unit,
      minGap: 2 * unit
    };
  }

  function ensureMarquee() {
    if (marquee?.isConnected) return marquee;
    marquee = utils.createSvgElement("rect", { class: "editor-select-marquee" });
    manager.canvas.querySelector("#editorEditLayer")?.append(marquee);
    return marquee;
  }

  function ensureSelectionElement(id, model, adapter) {
    const editLayer = manager.canvas.querySelector("#editorEditLayer");
    if (!editLayer || !adapter?.createSelectionElement) return null;
    let element = selectionElements.get(id);
    if (!element?.isConnected || element.dataset.multiSelectionType !== model.type) {
      element?.remove();
      element = adapter.createSelectionElement(utils);
      element.classList.add("editor-multi-selection");
      element.dataset.multiSelectionId = id;
      element.dataset.multiSelectionType = model.type;
      selectionElements.set(id, element);
      editLayer.append(element);
    }
    return element;
  }

  function ensureGroupFrameElement() {
    const editLayer = manager.canvas.querySelector("#editorEditLayer");
    if (!editLayer) return null;
    if (!groupFrameElement?.isConnected) {
      groupFrameElement?.remove();
      groupFrameElement = utils.createSvgElement("rect", { class: "editor-object-selection editor-group-selection" });
      editLayer.append(groupFrameElement);
    }
    return groupFrameElement;
  }

  function resizeGroupHandle(handle, metrics, cp) {
    if (Kroki.ControlPointManager?.resizeHandle) {
      Kroki.ControlPointManager.resizeHandle(handle, metrics, cp);
      return;
    }
    handle.querySelector(".editor-object-cp-hit")?.setAttribute("r", String(metrics.touchRadius));
    handle.querySelector("circle.editor-object-cp-visual")?.setAttribute("r", String(metrics.visibleRadius));
  }

  function groupControlPoints(frame, metrics) {
    const points = GROUP_CORNERS.map((corner) => ({
      id: corner.id,
      sx: corner.sx,
      sy: corner.sy,
      ...frameLocalPoint(
        frame,
        corner.sx * (frame.width / 2 + metrics.visibleRadius),
        corner.sy * (frame.height / 2 + metrics.visibleRadius)
      )
    }));
    points.push({
      id: "rotate",
      ...frameLocalPoint(frame, frame.width / 2 + metrics.handleGap, 0)
    });
    return points;
  }

  function ensureGroupHandle(cp, metrics) {
    const editLayer = manager.canvas.querySelector("#editorEditLayer");
    if (!editLayer) return null;
    let handle = groupHandles.get(cp.id);
    if (!handle?.isConnected) {
      handle?.remove();
      const visual = Kroki.ControlPointManager?.createVisual?.(cp)
        || utils.createSvgElement("circle", { class: "editor-object-cp-visual" });
      handle = utils.createSvgElement("g", {
        class: "editor-object-cp editor-group-cp",
        "data-point": cp.id,
        "data-cp-role": cp.id === "rotate" ? "rotate" : "resize",
        cursor: "grab"
      });
      handle.append(
        utils.createSvgElement("circle", { class: "editor-object-cp-hit" }),
        visual
      );
      handle.addEventListener("pointerdown", (event) => startGroupControlDrag(event, cp.id));
      groupHandles.set(cp.id, handle);
      editLayer.append(handle);
    }
    resizeGroupHandle(handle, metrics, cp);
    handle.setAttribute("transform", `translate(${cp.x} ${cp.y})`);
    handle.classList.toggle("is-preselect", mode !== "edit");
    return handle;
  }

  function removeSelectionElements() {
    selectionElements.forEach((element) => element.remove());
    selectionElements.clear();
  }

  function removeGroupHandles() {
    groupHandles.forEach((handle) => handle.remove());
    groupHandles.clear();
  }

  function removeGroupEditElements() {
    groupFrameElement?.remove();
    groupFrameElement = null;
    removeGroupHandles();
  }

  function removeMarquee() {
    marquee?.remove();
    marquee = null;
  }

  function setSideIpEmpty(empty) {
    const sideIp = window.krokiObjectEditCore?.sideIp;
    if (!sideIp) return;
    sideIp.classList.toggle("is-empty", Boolean(empty));
    Array.from(sideIp.children).forEach((child) => {
      if (empty) {
        child.dataset.groupEmptyWasHidden = child.classList.contains("gizli") ? "1" : "0";
        child.classList.add("gizli");
        return;
      }
      if (child.dataset.groupEmptyWasHidden === "0") child.classList.remove("gizli");
      delete child.dataset.groupEmptyWasHidden;
    });
  }

  function renderRect(rect, bounds) {
    rect.setAttribute("x", String(bounds.x));
    rect.setAttribute("y", String(bounds.y));
    rect.setAttribute("width", String(Math.max(0, bounds.width)));
    rect.setAttribute("height", String(Math.max(0, bounds.height)));
  }

  function renderGroupSelection() {
    const frame = activeGroupFrame();
    const element = frame ? ensureGroupFrameElement() : null;
    if (!frame || !element) {
      removeGroupEditElements();
      return;
    }
    element.setAttribute("x", String(frame.cx - frame.width / 2));
    element.setAttribute("y", String(frame.cy - frame.height / 2));
    element.setAttribute("width", String(frame.width));
    element.setAttribute("height", String(frame.height));
    element.setAttribute("stroke-width", "4");
    element.setAttribute("transform", `rotate(${frame.rotation} ${frame.cx} ${frame.cy})`);
    element.classList.toggle("is-edit", mode === "edit");
    element.classList.toggle("is-preselect", mode !== "edit");

    const metrics = groupControlMetrics();
    const liveIds = new Set();
    groupControlPoints(frame, metrics).forEach((cp) => {
      liveIds.add(cp.id);
      ensureGroupHandle(cp, metrics);
    });
    groupHandles.forEach((handle, id) => {
      if (!liveIds.has(id)) {
        handle.remove();
        groupHandles.delete(id);
      }
    });
  }

  function syncControls() {
    const has = selectedIds.size > 0;
    const disableMultiSelect = activeSelectionIsRoad();
    const hasActiveGroup = Boolean(activeGroupId);
    const groupedSelectionChildren = hasActiveGroup ? [] : groupingChildrenFromSelection();
    const hasGroupUnits = groupedSelectionChildren.some((id) => Kroki.GroupManager?.has?.(id));
    const hasStandaloneGroup = !hasActiveGroup && Boolean(selectedGroupMatch());
    const groupLikeSelection = hasActiveGroup || hasStandaloneGroup || hasGroupUnits;
    const selectionUnitCount = hasActiveGroup ? 1 : hasGroupUnits ? groupedSelectionChildren.length : selectedIds.size;
    document.querySelectorAll(".multi-only-control").forEach((control) => control.classList.toggle("gizli", selectionUnitCount < 2 || Boolean(activeGroupId)));
    document.querySelectorAll(".group-only-control").forEach((control) => control.classList.toggle("gizli", !activeGroupId));
    button?.classList.toggle("is-active", multiMode);
    button?.setAttribute("aria-pressed", String(multiMode));
    if (button) {
      button.disabled = disableMultiSelect;
      button.setAttribute("aria-disabled", String(disableMultiSelect));
      button.setAttribute("title", disableMultiSelect ? "Yollar çoklu seçime dahil edilemez" : "Çoklu seç");
    }
    if (doneButton) {
      doneButton.disabled = false;
      doneButton.setAttribute("aria-disabled", "false");
      doneButton.setAttribute("title", "Tamam");
    }
    if (has) {
      window.krokiObjectEditCore?.topIp?.classList.remove("gizli");
      window.krokiObjectEditCore?.sideIp?.classList.remove("gizli");
      setSideIpEmpty(groupLikeSelection);
      if (groupLikeSelection) Kroki.StyleManager?.hidePanels?.();
    } else {
      setSideIpEmpty(false);
      if (!Kroki.SelectionManager?.getActiveId?.()) {
        window.krokiObjectEditCore?.topIp?.classList.add("gizli");
        window.krokiObjectEditCore?.sideIp?.classList.add("gizli");
        Kroki.StyleManager?.hidePanels?.();
      }
    }
  }

  function sync() {
    selectedIds.forEach((id) => {
      if (!canSelectId(id)) selectedIds.delete(id);
    });
    if (activeGroupId && !canSelectGroup(activeGroupId)) activeGroupId = "";
    if (!selectedIds.size) {
      activeGroupId = "";
      removeSelectionElements();
      removeGroupEditElements();
      window.krokiEditorState?.clearEditedObject?.();
      syncControls();
      return;
    }
    if (activeGroupId) {
      removeSelectionElements();
      renderGroupSelection();
      window.krokiEditorState?.setEditedObject?.(groupFrameElement, mode === "edit" ? "group" : "group-preselect");
      syncControls();
      return;
    }
    removeGroupEditElements();
    const liveIds = new Set(selectedIds);
    selectionElements.forEach((element, id) => {
      if (!liveIds.has(id)) {
        element.remove();
        selectionElements.delete(id);
      }
    });
    selectedIds.forEach((id) => {
      const model = manager.get(id);
      const adapter = adapterFor(id);
      const element = model && adapter ? ensureSelectionElement(id, model, adapter) : null;
      if (!model || !adapter || !element) return;
      adapter.renderSelection(element, model, model.style, "multi");
      element.classList.add("editor-multi-selection");
      element.classList.toggle("is-edit", mode === "edit");
    });
    window.krokiEditorState?.setEditedObject?.(manager.canvas, mode === "edit" ? "multi" : "multi-preselect");
    syncControls();
    if (selectionHasGroupUnits()) Kroki.StyleManager?.hidePanels?.();
    else Kroki.StyleManager?.syncControls?.();
  }

  function syncViewportNow() {
    viewportSyncFrame = 0;
    if (!selectedIds.size) return;
    if (activeGroupId) {
      renderGroupSelection();
      return;
    }
    selectedIds.forEach((id) => {
      const model = manager.get(id);
      const adapter = adapterFor(id);
      const element = model && adapter ? ensureSelectionElement(id, model, adapter) : null;
      if (!model || !adapter || !element) return;
      adapter.renderSelection(element, model, model.style, "multi");
      element.classList.add("editor-multi-selection");
      element.classList.toggle("is-edit", mode === "edit");
    });
  }

  function syncViewport() {
    if (!selectedIds.size || viewportSyncFrame) return;
    viewportSyncFrame = window.requestAnimationFrame?.(syncViewportNow) || window.setTimeout(syncViewportNow, 16);
  }

  function clear(options = {}) {
    if (drag && !options.keepDrag) drag = null;
    selectedIds.clear();
    activeGroupId = "";
    mode = "";
    if (!options.fromSelection) multiMode = false;
    removeSelectionElements();
    removeGroupEditElements();
    removeMarquee();
    if (!options.fromSelection) window.krokiEditorState?.clearEditedObject?.();
    syncControls();
  }

  function selectIds(ids, options = {}) {
    selectedIds.clear();
    (Array.isArray(ids) ? ids : []).forEach((id) => {
      if (canSelectId(id)) selectedIds.add(id);
    });
    activeGroupId = options.groupId && canSelectGroup(options.groupId) ? options.groupId : "";
    mode = options.mode || "preselect";
    Kroki.SelectionManager?.clear?.({ silent: true, preserveMulti: true });
    Kroki.ControlPointManager?.clear?.();
    sync();
  }

  function addIds(ids, options = {}) {
    (Array.isArray(ids) ? ids : []).forEach((id) => {
      if (canSelectId(id)) selectedIds.add(id);
    });
    activeGroupId = "";
    mode = selectedIds.size ? options.mode || mode || "preselect" : "";
    Kroki.SelectionManager?.clear?.({ silent: true, preserveMulti: true });
    Kroki.ControlPointManager?.clear?.();
    sync();
  }

  function selectGroup(groupId, options = {}) {
    const group = Kroki.GroupManager?.get?.(groupId);
    if (!group || !canSelectGroup(groupId)) return false;
    selectIds(Kroki.GroupManager?.getLeafObjectIds?.(groupId) || group.children, { ...options, groupId });
    return true;
  }

  function selectedGroupMatch() {
    if (!selectedIds.size) return null;
    return (Kroki.GroupManager?.getAll?.() || [])
      .map((group) => ({ group, leaves: Kroki.GroupManager?.getLeafObjectIds?.(group.id) || group.children }))
      .filter((entry) => (
        entry.leaves.every(canSelectId) &&
        entry.leaves.length === selectedIds.size &&
        entry.leaves.every((id) => selectedIds.has(id))
      ))
      .sort((a, b) => b.leaves.length - a.leaves.length)[0]?.group || null;
  }

  function groupingChildrenFromSelection() {
    const remaining = new Set(selectedIds);
    const children = [];
    (Kroki.GroupManager?.getAll?.() || [])
      .map((group) => ({ group, leaves: Kroki.GroupManager?.getLeafObjectIds?.(group.id) || group.children }))
      .filter((entry) => entry.leaves.length > 0 && entry.leaves.every(canSelectId) && entry.leaves.every((id) => remaining.has(id)))
      .sort((a, b) => b.leaves.length - a.leaves.length)
      .forEach((entry) => {
        if (!entry.leaves.every((id) => remaining.has(id))) return;
        children.push(entry.group.id);
        entry.leaves.forEach((id) => remaining.delete(id));
      });
    remaining.forEach((id) => children.push(id));
    return sortGroupChildrenByDomOrder(children);
  }

  function sortGroupChildrenByDomOrder(children) {
    const order = new Map((manager.getObjectsInDomOrder?.() || []).map((model, index) => [model.id, index]));
    const fallback = order.size;
    return [...children].sort((a, b) => {
      const aLeaves = Kroki.GroupManager?.has?.(a) ? Kroki.GroupManager.getLeafObjectIds?.(a) || [] : [a];
      const bLeaves = Kroki.GroupManager?.has?.(b) ? Kroki.GroupManager.getLeafObjectIds?.(b) || [] : [b];
      const aIndex = Math.min(...aLeaves.map((id) => order.get(id) ?? fallback));
      const bIndex = Math.min(...bLeaves.map((id) => order.get(id) ?? fallback));
      return aIndex - bIndex;
    });
  }

  function selectedIdsInDomOrder() {
    const selected = new Set(selectedIds);
    return (manager.getObjectsInDomOrder?.() || [])
      .map((model) => model.id)
      .filter((id) => selected.has(id));
  }

  function selectionHasGroupUnits() {
    return groupingChildrenFromSelection().some((id) => Kroki.GroupManager?.has?.(id));
  }

  function toggleId(id) {
    if (!canSelectId(id)) return;
    activeGroupId = "";
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    mode = selectedIds.size ? "preselect" : "";
    if (!selectedIds.size) multiMode = false;
    Kroki.SelectionManager?.clear?.({ silent: true, preserveMulti: true });
    Kroki.ControlPointManager?.clear?.();
    sync();
  }

  function toggleGroup(groupId) {
    const group = Kroki.GroupManager?.get?.(groupId);
    if (!group || !canSelectGroup(groupId)) return;
    const leaves = Kroki.GroupManager?.getLeafObjectIds?.(groupId) || group.children;
    const allSelected = leaves.every((id) => selectedIds.has(id));
    if (allSelected) {
      leaves.forEach((id) => selectedIds.delete(id));
    } else {
      leaves.forEach((id) => {
        if (canSelectId(id)) selectedIds.add(id);
      });
    }
    const selected = Array.from(selectedIds);
    activeGroupId = selected.length === leaves.length && leaves.every((id) => selectedIds.has(id)) ? group.id : "";
    mode = selectedIds.size ? "preselect" : "";
    if (!selectedIds.size) multiMode = false;
    Kroki.SelectionManager?.clear?.({ silent: true, preserveMulti: true });
    Kroki.ControlPointManager?.clear?.();
    sync();
  }

  function promoteToEdit() {
    if (!selectedIds.size || mode === "edit") return;
    mode = "edit";
    sync();
  }

  function moveSelected(dx, dy, options = {}) {
    const groupFrames = activeGroupId ? groupTreeFrames(activeGroupId) : null;
    selectedIds.forEach((id) => {
      const model = manager.get(id);
      const adapter = adapterFor(id);
      if (!model || !adapter?.move) return;
      manager.updateGeometry(id, (draft) => adapter.move(draft, dx, dy), { skipHistory: true, controlPoints: false, styleControls: false, ...options });
    });
    groupFrames?.forEach((frame, groupId) => saveGroupFrame(groupId, shiftedFrame(frame, dx, dy)));
    sync();
  }

  function supportedStylePatch(id, patch) {
    const model = manager.get(id);
    const adapter = adapterFor(id);
    if (!model || !adapter || !patch || typeof patch !== "object") return null;
    const capabilities = adapter.capabilities || {};
    const next = {};
    Object.entries(patch).forEach(([key, value]) => {
      if ((key === "fill" || key === "fillOpacity" || key === "fillPattern") && !capabilities.fill) return;
      if ((key === "arrowStart" || key === "arrowEnd") && !capabilities.arrows) return;
      if ((key === "dash" || key === "dashSize" || key === "dashGap" || key === "lineCap") && capabilities.textObject) return;
      if ((key === "stroke" || key === "strokeOpacity" || key === "strokeWidth") && capabilities.textObject) return;
      next[key] = value;
    });
    return Object.keys(next).length ? next : null;
  }

  function deleteSelected(options = {}) {
    if (!selectedIds.size) return false;
    const transaction = options.skipHistory ? null : Kroki.HistoryManager?.begin?.("Coklu sil");
    const ids = Array.from(selectedIds);
    clear({ silent: true });
    ids.forEach((id) => manager.remove(id, { skipHistory: true, controlPoints: false, styleControls: false }));
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Coklu sil");
    Kroki.ControlPointManager?.clear?.();
    Kroki.StyleManager?.syncControls?.();
    return true;
  }

  function copySelected(options = {}) {
    if (!selectedIds.size) return [];
    const transaction = options.skipHistory ? null : Kroki.HistoryManager?.begin?.("Coklu kopyala");
    const sourceUnits = activeGroupId ? [activeGroupId] : groupingChildrenFromSelection();
    const sourceGroupIds = sourceUnits.filter((id) => Kroki.GroupManager?.has?.(id));
    const idMap = new Map();
    const copies = [];
    selectedIdsInDomOrder().forEach((id) => {
      const copy = manager.clone(id, { skipHistory: true, controlPoints: false, styleControls: false });
      if (copy) {
        idMap.set(id, copy.id);
        copies.push(copy.id);
      }
    });
    const frameOffset = copies.length ? { dx: 18, dy: 18 } : null;
    const newGroups = sourceGroupIds
      .map((groupId) => Kroki.GroupManager?.cloneGroup?.(groupId, idMap, { frameOffset }))
      .filter(Boolean);
    const groupedCopyIds = new Set(newGroups.flatMap((group) => Kroki.GroupManager?.getLeafObjectIds?.(group.id) || group.children || []));
    if (newGroups.length === 1 && groupedCopyIds.size === copies.length) selectGroup(newGroups[0].id, { mode: "edit" });
    else selectIds(copies, { mode: "edit" });
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Coklu kopyala");
    return copies;
  }

  function bringToFront(options = {}) {
    if (!selectedIds.size) return false;
    const ids = selectedIdsInDomOrder().filter((id) => manager.get?.(id)?.type !== "road");
    if (!ids.length) return false;
    const transaction = options.skipHistory ? null : Kroki.HistoryManager?.begin?.("Coklu one getir");
    ids.forEach((id) => manager.bringToFront(id, { skipHistory: true, controlPoints: false, styleControls: false }));
    sync();
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Coklu one getir");
    return true;
  }

  function sendToBack(options = {}) {
    if (!selectedIds.size) return false;
    const ids = selectedIdsInDomOrder().filter((id) => manager.get?.(id)?.type !== "road");
    if (!ids.length) return false;
    const transaction = options.skipHistory ? null : Kroki.HistoryManager?.begin?.("Coklu arkaya gonder");
    ids.reverse().forEach((id) => manager.sendToBack(id, { skipHistory: true, controlPoints: false, styleControls: false }));
    sync();
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Coklu arkaya gonder");
    return true;
  }

  function applyStyle(patch, options = {}) {
    if (!selectedIds.size) return false;
    if (activeGroupId || selectionHasGroupUnits()) return false;
    const supportedEntries = Array.from(selectedIds)
      .map((id) => ({ id, patch: supportedStylePatch(id, patch) }))
      .filter((entry) => entry.patch);
    if (!supportedEntries.length) return false;
    const transaction = options.skipHistory ? null : Kroki.HistoryManager?.begin?.("Coklu stil");
    supportedEntries.forEach((entry) => manager.updateStyle(entry.id, entry.patch, { skipHistory: true, controlPoints: false, styleControls: false }));
    sync();
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Coklu stil");
    return true;
  }

  function createGroup() {
    if (selectedIds.size < 2) return null;
    const children = groupingChildrenFromSelection();
    if (children.length < 2) return null;
    const transaction = Kroki.HistoryManager?.begin?.("Grupla");
    const group = Kroki.GroupManager?.createGroup?.(children, {
      skipHistory: true,
      metadata: { frame: frameFromBounds(selectionBounds()) }
    });
    if (group) {
      multiMode = false;
      selectGroup(group.id, { mode: "edit" });
    }
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Grupla");
    return group;
  }

  function ungroup() {
    if (!activeGroupId) return false;
    const transaction = Kroki.HistoryManager?.begin?.("Grubu coz");
    const id = activeGroupId;
    const group = Kroki.GroupManager?.get?.(id);
    const directGroupChildren = (group?.children || []).filter((childId) => Kroki.GroupManager?.has?.(childId));
    const children = Array.from(selectedIds);
    const ok = Kroki.GroupManager?.ungroup?.(id, { skipHistory: true });
    if (ok && directGroupChildren.length === 1) selectGroup(directGroupChildren[0], { mode: "preselect" });
    else if (ok) selectIds(children, { mode: "edit" });
    if (transaction) Kroki.HistoryManager?.commit?.(transaction, "Grubu coz");
    return ok;
  }

  function selectedPrimaryModel() {
    const id = Array.from(selectedIds)[0];
    return id ? manager.get(id) : null;
  }

  function clonePlain(value) {
    return utils.clonePlain ? utils.clonePlain(value) : JSON.parse(JSON.stringify(value || null));
  }

  function normalizeRotation(value) {
    return utils.normalizeRotation?.(value) ?? value;
  }

  function transformPoint(point, mapper) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return point;
    return mapper({ x: Number(point.x), y: Number(point.y) });
  }

  function rotatePointAround(point, center, angle) {
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
  }

  function transformCalloutBox(box, center, scale = 1) {
    if (!box) return box;
    const width = Math.max(GROUP_MIN_SIZE, Number(box.width) * scale);
    const height = Math.max(GROUP_MIN_SIZE, Number(box.height) * scale);
    return {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height
    };
  }

  function scaleLabel(label, scale) {
    if (!label || !String(label.text || "").trim() || !Number.isFinite(Number(label.size))) return label;
    return {
      ...label,
      size: Math.max(1, Number(label.size) * scale)
    };
  }

  function scaleStyle(style, scale) {
    if (!style || !Number.isFinite(Number(scale)) || Math.abs(scale - 1) < 0.000001) return style;
    const next = clonePlain(style);
    ["strokeWidth", "dashSize", "dashGap"].forEach((key) => {
      if (Number.isFinite(Number(next[key]))) next[key] = Number(next[key]) * scale;
    });
    next.markerScale = Number.isFinite(Number(next.markerScale))
      ? Number(next.markerScale) * scale
      : scale;
    return next;
  }

  function calloutBoxSignature(label, style) {
    return Kroki.ShapeRegistry?.get?.("callout")?.calloutBoxSignature?.(label, style) || "";
  }

  function transformModelFromStart(draft, source, mapper, options = {}) {
    const scale = options.scale || 1;
    draft.geometry = clonePlain(source.geometry);
    draft.style = scaleStyle(clonePlain(source.style), scale);
    draft.label = scaleLabel(clonePlain(source.label), scale);
    draft.metadata = clonePlain(source.metadata);
    const geometry = draft.geometry || {};
    const rotationDelta = options.rotationDelta || 0;

    function applyRotation(field = "rotation") {
      if (Number.isFinite(Number(geometry[field]))) geometry[field] = normalizeRotation(Number(geometry[field]) + rotationDelta);
    }

    if (source.type === "line" || source.type === "arc") {
      geometry.start = transformPoint(geometry.start, mapper);
      geometry.end = transformPoint(geometry.end, mapper);
      return draft;
    }

    if (source.type === "bezier") {
      ["start", "end", "q", "c1", "c2"].forEach((key) => {
        if (geometry[key]) geometry[key] = transformPoint(geometry[key], mapper);
      });
      return draft;
    }

    if (source.type === "circle") {
      const center = transformPoint({ x: geometry.cx, y: geometry.cy }, mapper);
      geometry.cx = center.x;
      geometry.cy = center.y;
      geometry.r = Math.max(1, Number(geometry.r) * scale);
      applyRotation();
      return draft;
    }

    if (source.type === "ellipse" || source.type === "rectangle") {
      const center = transformPoint({ x: geometry.cx, y: geometry.cy }, mapper);
      geometry.cx = center.x;
      geometry.cy = center.y;
      geometry.rx = Math.max(1, Number(geometry.rx) * scale);
      geometry.ry = Math.max(1, Number(geometry.ry) * scale);
      applyRotation();
      return draft;
    }

    if (source.type === "closedShape") {
      geometry.points = (Array.isArray(geometry.points) ? geometry.points : []).map((point) => transformPoint(point, mapper));
      geometry.controls = (Array.isArray(geometry.controls) ? geometry.controls : []).map((point) => transformPoint(point, mapper));
      if (geometry.frame) {
        const center = transformPoint({ x: geometry.frame.cx, y: geometry.frame.cy }, mapper);
        geometry.frame = {
          ...geometry.frame,
          cx: center.x,
          cy: center.y,
          width: Math.max(GROUP_MIN_SIZE, Number(geometry.frame.width) * scale),
          height: Math.max(GROUP_MIN_SIZE, Number(geometry.frame.height) * scale),
          rotation: normalizeRotation(Number(geometry.frame.rotation || 0) + rotationDelta)
        };
      }
      return draft;
    }

    if (source.type === "text") {
      const origin = transformPoint({ x: geometry.x, y: geometry.y }, mapper);
      geometry.x = origin.x;
      geometry.y = origin.y;
      applyRotation();
      return draft;
    }

    if (source.type === "callout") {
      geometry.center = transformPoint(geometry.center, mapper);
      geometry.tip = transformPoint(geometry.tip, mapper);
      if (draft.metadata?.calloutBox) {
        draft.metadata.calloutBox = transformCalloutBox(draft.metadata.calloutBox, geometry.center, scale);
        const signature = calloutBoxSignature(draft.label, draft.style);
        if (signature) draft.metadata.calloutBoxSignature = signature;
      }
      return draft;
    }

    if (source.type === "trafficSign" || source.type === "otherSymbol") {
      const center = transformPoint({ x: geometry.cx, y: geometry.cy }, mapper);
      geometry.cx = center.x;
      geometry.cy = center.y;
      geometry.scale = Math.min(4, Math.max(0.005, Number(geometry.scale || 0.08) * scale));
      applyRotation();
      return draft;
    }

    if (source.type === "vehicle") {
      const center = transformPoint({ x: geometry.cx, y: geometry.cy }, mapper);
      geometry.cx = center.x;
      geometry.cy = center.y;
      geometry.scale = Math.min(4, Math.max(0.05, Number(geometry.scale || 1) * scale));
      applyRotation();
      return draft;
    }

    return draft;
  }

  function updateGroupGeometry(nextFrame, mapper, options = {}) {
    if (drag?.type === "group-control") drag.currentFrame = nextFrame;
    drag.startModels.forEach((source, id) => {
      manager.updateModel(id, (draft) => transformModelFromStart(draft, source, mapper, options), {
        skipHistory: true,
        controlPoints: false,
        styleControls: false
      });
    });
    drag.startGroupFrames?.forEach((frame, groupId) => {
      saveGroupFrame(groupId, groupId === activeGroupId ? nextFrame : transformGroupFrame(frame, mapper, options));
    });
    sync();
  }

  function groupResizeScale(state, worldPoint) {
    const axes = frameAxes(state.frame);
    const offsetPoint = {
      x: worldPoint.x - axes.xAxis.x * state.sx * state.handleOffset - axes.yAxis.x * state.sy * state.handleOffset,
      y: worldPoint.y - axes.xAxis.y * state.sx * state.handleOffset - axes.yAxis.y * state.sy * state.handleOffset
    };
    const draggedLocal = framePointToLocal(state.frame, offsetPoint);
    const vx = state.movingLocal.x - state.fixedLocal.x;
    const vy = state.movingLocal.y - state.fixedLocal.y;
    const wx = draggedLocal.x - state.fixedLocal.x;
    const wy = draggedLocal.y - state.fixedLocal.y;
    const denominator = vx * vx + vy * vy || 1;
    const rawScale = (wx * vx + wy * vy) / denominator;
    const minScale = GROUP_MIN_SIZE / Math.max(state.frame.width, state.frame.height, GROUP_MIN_SIZE);
    return Math.max(minScale, rawScale);
  }

  function frameForScale(state, scale) {
    const nextMovingLocal = {
      x: state.fixedLocal.x + (state.movingLocal.x - state.fixedLocal.x) * scale,
      y: state.fixedLocal.y + (state.movingLocal.y - state.fixedLocal.y) * scale
    };
    const centerLocal = {
      x: (state.fixedLocal.x + nextMovingLocal.x) / 2,
      y: (state.fixedLocal.y + nextMovingLocal.y) / 2
    };
    const center = frameLocalPoint(state.frame, centerLocal.x, centerLocal.y);
    return {
      cx: center.x,
      cy: center.y,
      width: Math.max(GROUP_MIN_SIZE, state.frame.width * scale),
      height: Math.max(GROUP_MIN_SIZE, state.frame.height * scale),
      rotation: state.frame.rotation
    };
  }

  function resizeMapper(state, scale) {
    return (point) => {
      const local = framePointToLocal(state.frame, point);
      return frameLocalPoint(
        state.frame,
        state.fixedLocal.x + (local.x - state.fixedLocal.x) * scale,
        state.fixedLocal.y + (local.y - state.fixedLocal.y) * scale
      );
    };
  }

  function startGroupControlDrag(event, cpId) {
    if (!activeGroupId) return;
    const frame = activeGroupFrame();
    if (!frame) return;
    const metrics = groupControlMetrics();
    const corner = GROUP_CORNERS.find((item) => item.id === cpId);
    const point = canvasPoint(event);
    promoteToEdit();
    drag = {
      type: "group-control",
      cpId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      frame,
      currentFrame: frame,
      startModels: new Map(Array.from(selectedIds).map((id) => [id, clonePlain(manager.get(id))])),
      startGroupFrames: groupTreeFrames(activeGroupId),
      transaction: Kroki.HistoryManager?.begin?.(cpId === "rotate" ? "Grup dondur" : "Grup boyutlandir")
    };
    if (cpId === "rotate") {
      drag.center = { x: frame.cx, y: frame.cy };
      drag.startAngle = Math.atan2(point.y - frame.cy, point.x - frame.cx) * 180 / Math.PI;
    } else if (corner) {
      drag.sx = corner.sx;
      drag.sy = corner.sy;
      drag.fixedLocal = { x: -corner.sx * frame.width / 2, y: -corner.sy * frame.height / 2 };
      drag.movingLocal = { x: corner.sx * frame.width / 2, y: corner.sy * frame.height / 2 };
      drag.handleOffset = metrics.visibleRadius;
    }
    manager.canvas.setPointerCapture?.(event.pointerId);
    event.stopImmediatePropagation?.();
    event.stopPropagation();
    event.preventDefault();
  }

  function beginMove(event) {
    const point = canvasPoint(event);
    drag = {
      type: "move",
      pointerId: event.pointerId,
      lastPoint: point,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      transaction: null
    };
    manager.canvas.setPointerCapture?.(event.pointerId);
  }

  function beginToggleOrMove(event, target = {}) {
    beginMove(event);
    drag.type = "toggle-or-move";
    drag.toggleId = target.id || "";
    drag.toggleGroupId = target.groupId || "";
  }

  function isGroupSelected(group) {
    const leaves = Kroki.GroupManager?.getLeafObjectIds?.(group?.id) || group?.children || [];
    return Boolean(leaves.length && leaves.every((id) => selectedIds.has(id)));
  }

  function beginMarquee(event) {
    const point = canvasPoint(event);
    drag = {
      type: "marquee",
      pointerId: event.pointerId,
      start: point,
      lastPoint: point
    };
    manager.canvas.setPointerCapture?.(event.pointerId);
    renderRect(ensureMarquee(), { x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handlePointerDown(event, hit) {
    if (event.button !== 0 && event.pointerType === "mouse") return false;
    if (window.krokiEditorState?.getActiveTool?.()) return false;

    const group = hit?.model ? Kroki.GroupManager?.groupForObject?.(hit.model.id) : null;
    const targetId = group ? group.id : hit?.model?.id;
    const point = canvasPoint(event);

    if (event.ctrlKey || event.shiftKey) {
      if (group) toggleGroup(group.id);
      else if (targetId) toggleId(targetId);
      else if (!multiMode) clear();
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    if (multiMode && hit?.model) {
      if (group && isGroupSelected(group)) {
        beginToggleOrMove(event, { groupId: group.id });
      } else if (!group && selectedIds.has(hit.model.id)) {
        beginToggleOrMove(event, { id: hit.model.id });
      } else if (group) {
        toggleGroup(group.id);
      } else {
        toggleId(hit.model.id);
      }
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    if (activeGroupId && mode === "edit") {
      beginMove(event);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    const selectedHit = activeGroupId
      ? containsFramePoint(activeGroupFrame(), point)
      : containsPoint(selectionBounds(), point);
    if (selectedIds.size && selectedHit) {
      beginMove(event);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    if (group) {
      selectGroup(group.id, { mode: "preselect" });
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    if (multiMode && !hit) {
      beginMarquee(event);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    return false;
  }

  function handlePointerMove(event) {
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const point = canvasPoint(event);
    if (drag.type === "group-control") {
      if (!drag.moved) {
        const movedEnough = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) >= DRAG_START_THRESHOLD_PX;
        if (!movedEnough) {
          event.preventDefault();
          return true;
        }
        drag.moved = true;
      }
      if (drag.cpId === "rotate") {
        const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x) * 180 / Math.PI;
        const delta = angle - drag.startAngle;
        const nextFrame = {
          ...drag.frame,
          rotation: normalizeRotation(drag.frame.rotation + delta)
        };
        updateGroupGeometry(nextFrame, (item) => rotatePointAround(item, drag.center, delta), { rotationDelta: delta });
      } else {
        const scale = groupResizeScale(drag, point);
        updateGroupGeometry(frameForScale(drag, scale), resizeMapper(drag, scale), { scale });
      }
      event.preventDefault();
      return true;
    }
    if (drag.type === "move" || drag.type === "toggle-or-move") {
      if (!drag.moved) {
        const movedEnough = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) >= DRAG_START_THRESHOLD_PX;
        if (!movedEnough) {
          event.preventDefault();
          return true;
        }
        promoteToEdit();
        drag.transaction = Kroki.HistoryManager?.begin?.(activeGroupId ? "Grup tasi" : "Coklu tasi");
        drag.moved = true;
      }
      const dx = point.x - drag.lastPoint.x;
      const dy = point.y - drag.lastPoint.y;
      moveSelected(dx, dy, { skipHistory: true });
      drag.lastPoint = point;
      event.preventDefault();
      return true;
    }
    if (drag.type === "marquee") {
      drag.lastPoint = point;
      renderRect(ensureMarquee(), {
        x: Math.min(drag.start.x, point.x),
        y: Math.min(drag.start.y, point.y),
        width: Math.abs(point.x - drag.start.x),
        height: Math.abs(point.y - drag.start.y)
      });
      event.preventDefault();
      return true;
    }
    return false;
  }

  function stopDrag(event) {
    if (!drag || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return false;
    if (drag.pointerId != null && manager.canvas.hasPointerCapture?.(drag.pointerId)) manager.canvas.releasePointerCapture(drag.pointerId);
    if (drag.type === "group-control") {
      if (drag.moved) Kroki.HistoryManager?.commit?.(drag.transaction, drag.cpId === "rotate" ? "Grup dondur" : "Grup boyutlandir");
      drag = null;
      return true;
    }
    if ((drag.type === "move" || drag.type === "toggle-or-move") && drag.moved) {
      Kroki.HistoryManager?.commit?.(drag.transaction, activeGroupId ? "Grup tasi" : "Coklu tasi");
    }
    if (drag.type === "move" && !drag.moved && activeGroupId && mode === "preselect") {
      promoteToEdit();
    }
    if (drag.type === "toggle-or-move" && !drag.moved) {
      if (drag.toggleGroupId) toggleGroup(drag.toggleGroupId);
      else if (drag.toggleId) toggleId(drag.toggleId);
    }
    if (drag.type === "marquee") {
      const rect = {
        x: Math.min(drag.start.x, drag.lastPoint.x),
        y: Math.min(drag.start.y, drag.lastPoint.y),
        width: Math.abs(drag.lastPoint.x - drag.start.x),
        height: Math.abs(drag.lastPoint.y - drag.start.y)
      };
      const isTap = rect.width < 1 && rect.height < 1;
      const ids = isTap ? [] : manager.getObjectsInDomOrder()
        .filter((model) => canSelectId(model.id) && intersects(rect, modelBounds(model.id)))
        .map((model) => model.id);
      if (ids.length) addIds(ids, { mode: "preselect" });
      removeMarquee();
    }
    drag = null;
    return true;
  }

  button?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled || activeSelectionIsRoad()) {
      syncControls();
      return;
    }
    if (multiMode) {
      clear();
      return;
    }
    if (activeGroupId) {
      multiMode = true;
      activeGroupId = "";
      mode = selectedIds.size ? "preselect" : "";
      Kroki.SelectionManager?.clear?.({ silent: true, preserveMulti: true });
      Kroki.ControlPointManager?.clear?.();
      sync();
      return;
    }
    if (selectedIds.size) {
      clear();
      return;
    }
    multiMode = true;
    window.krokiEditorRail?.resetCizimAraci?.();
    const activeId = Kroki.SelectionManager?.getActiveId?.();
    if (activeId && canSelectId(activeId)) selectIds([activeId], { mode: "preselect" });
    else syncControls();
  });

  window.addEventListener("resize", sync);
  manager.canvas?.addEventListener("kroki:viewboxchange", syncViewport);
  window.addEventListener("blur", () => {
    if (drag) stopDrag({ pointerId: drag.pointerId });
  });

  Kroki.MultiSelectManager = {
    clear,
    selectIds,
    addIds,
    selectGroup,
    toggleId,
    sync,
    syncControls,
    handlePointerDown,
    handlePointerMove,
    stopDrag,
    promoteToEdit,
    deleteSelected,
    copySelected,
    bringToFront,
    sendToBack,
    applyStyle,
    createGroup,
    ungroup,
    hasSelection() {
      return selectedIds.size > 0;
    },
    getSelectedIds() {
      return Array.from(selectedIds);
    },
    getPrimaryModel: selectedPrimaryModel,
    getActiveGroupId() {
      return activeGroupId;
    },
    getSelectedGroupId() {
      return activeGroupId || selectedGroupMatch()?.id || "";
    },
    hasGroupUnitSelection: selectionHasGroupUnits,
    getState() {
      return {
        ids: Array.from(selectedIds),
        mode,
        activeGroupId
      };
    },
    restoreState(state) {
      selectIds(state?.ids || [], { mode: state?.mode || "preselect", groupId: state?.activeGroupId || "" });
    }
  };
})();
