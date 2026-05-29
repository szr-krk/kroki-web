(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  if (!utils || !manager || !selection) return;

  const MARKING_STYLES = [
    { id: "dash", title: "Kesik" },
    { id: "solid", title: "Duz" },
    { id: "leftSolidRightDash", title: "Sol duz sag kesik" },
    { id: "rightSolidLeftDash", title: "Sag duz sol kesik" },
    { id: "doubleSolid", title: "Cift duz" },
    { id: "doubleDash", title: "Cift kesik" },
    { id: "none", title: "Bos" }
  ];
  const ROAD_LINE_COLOR = "#000000";
  let activeBoundaryKey = "";

  const controls = {
    root: document.querySelector("#roadIpControls"),
    laneCount: document.querySelector("#roadLaneCountIpInput"),
    laneCountPlus: document.querySelector("#btnRoadLaneCountPlus"),
    laneCountMinus: document.querySelector("#btnRoadLaneCountMinus"),
    laneWidth: document.querySelector("#roadLaneWidthIpInput"),
    laneWidthPlus: document.querySelector("#btnRoadLaneWidthPlus"),
    laneWidthMinus: document.querySelector("#btnRoadLaneWidthMinus"),
    upperLine: document.querySelector("#btnRoadUpperLinePanel"),
    lowerLine: document.querySelector("#btnRoadLowerLinePanel"),
    boundaryPanel: document.querySelector("#roadBoundaryPanel"),
    boundaryPanelTitle: document.querySelector("#roadBoundaryPanelTitle"),
    boundaryPanelClose: document.querySelector("#btnRoadBoundaryPanelClose"),
    segmentCount: document.querySelector("#roadBoundarySegmentCountSelect"),
    segmentButtons: document.querySelector("#roadBoundarySegmentButtons"),
    leftShoulder: document.querySelector("#btnRoadLeftShoulderIp"),
    rightShoulder: document.querySelector("#btnRoadRightShoulderIp"),
    markingStyle: document.querySelector("#btnRoadMarkingStyleIp"),
    markingStyleIcon: document.querySelector("#iconRoadMarkingStyle"),
    sectionDone: document.querySelector("#btnRoadSectionDoneIp"),
    globalControls: Array.from(document.querySelectorAll("#roadIpControls .road-global-control")),
    sectionControls: Array.from(document.querySelectorAll("#roadIpControls .road-lane-only-control"))
  };

  function activeRoadModel() {
    const model = selection.getActiveModel?.();
    return model?.type === "road" ? model : null;
  }

  function keepRoadLayersAtBack() {
    if (typeof manager.keepRoadLayersAtBack === "function") {
      manager.keepRoadLayersAtBack();
      return;
    }
    const layer = document.querySelector("#editorObjects");
    if (!layer) return;
    Array.from(layer.children)
      .filter((node) => node.dataset?.krokiObject === "true" && node.dataset.shape === "road")
      .reverse()
      .forEach((node) => layer.insertBefore(node, layer.firstChild));
  }

  function adapterFor(model) {
    return manager.getAdapter(model);
  }

  function normalizeConfig(model, source) {
    const adapter = adapterFor(model);
    return adapter?.normalizeRoadConfig?.(source || model?.metadata?.road || {}) || source || {};
  }

  function selectedSectionInfo(model) {
    return adapterFor(model)?.selectedSectionInfo?.(model) || null;
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    const clean = Number.isFinite(number) ? number : fallback;
    return Math.min(max, Math.max(min, clean));
  }

  function clampInt(value, min, max, fallback) {
    return Math.round(clamp(value, min, max, fallback));
  }

  function resizedWidths(widths, count, fallback) {
    const source = Array.isArray(widths) ? widths : [];
    return Array.from({ length: count }, (_, index) => clamp(source[index], 10, 180, fallback));
  }

  function setLaneCount(config, count) {
    const laneCount = clampInt(count, 1, 5, config.laneCount || 2);
    const laneWidth = clamp(config.laneWidth, 10, 180, 50);
    config.laneCount = laneCount;
    config.laneWidths = resizedWidths(config.laneWidths, laneCount, laneWidth);
    config.dividedLaneWidths = {
      left: resizedWidths(config.dividedLaneWidths?.left, laneCount, laneWidth),
      right: resizedWidths(config.dividedLaneWidths?.right, laneCount, laneWidth)
    };
  }

  function setLaneWidth(config, width) {
    const laneWidth = clamp(width, 10, 180, config.laneWidth || 50);
    config.laneWidth = laneWidth;
    config.laneWidths = Array.from({ length: config.laneCount }, () => laneWidth);
    config.dividedLaneWidths = {
      left: Array.from({ length: config.laneCount }, () => laneWidth),
      right: Array.from({ length: config.laneCount }, () => laneWidth)
    };
  }

  function setSelectedSectionWidth(model, config, section, width) {
    const adapter = adapterFor(model);
    if (section?.sectionId && typeof adapter?.setSectionWidth === "function") {
      adapter.setSectionWidth(config, section.sectionId, width);
      return;
    }
    setLaneWidth(config, width);
  }

  function updateRoad(mutator, label) {
    const model = activeRoadModel();
    if (!model) return;
    selection.promoteToEdit?.();
    manager.updateModel(model.id, (draft) => {
      const config = normalizeConfig(draft, draft.metadata?.road);
      mutator(config);
      return {
        ...draft,
        metadata: {
          ...(draft.metadata || {}),
          road: normalizeConfig(draft, config)
        }
      };
    }, { label: label || "Yol guncelle" });
  }

  function updateActiveRoad(mutator, label) {
    const model = activeRoadModel();
    if (!model) return;
    selection.promoteToEdit?.();
    manager.updateModel(model.id, (draft) => {
      const config = normalizeConfig(draft, draft.metadata?.road);
      const section = selectedSectionInfo(draft);
      mutator(config, section, draft);
      return {
        ...draft,
        metadata: {
          ...(draft.metadata || {}),
          road: normalizeConfig(draft, config)
        }
      };
    }, { label: label || "Yol guncelle" });
  }

  function togglePressed(button, value) {
    button?.classList.toggle("is-active", Boolean(value));
    button?.setAttribute("aria-pressed", String(Boolean(value)));
  }

  function styleIndex(style) {
    return Math.max(0, MARKING_STYLES.findIndex((item) => item.id === style));
  }

  function nextStyle(style) {
    const index = styleIndex(style);
    return MARKING_STYLES[(index + 1) % MARKING_STYLES.length].id;
  }

  function linePath(y, dash) {
    const path = utils.createSvgElement("path", {
      d: `M10 ${y}H38`,
      fill: "none",
      stroke: ROAD_LINE_COLOR,
      "stroke-width": "4",
      "stroke-linecap": "round"
    });
    if (dash) path.setAttribute("stroke-dasharray", "8 7");
    return path;
  }

  function renderLineStyleIcon(svg, style) {
    if (!svg) return;
    svg.replaceChildren();
    if (style === "none") {
      svg.append(
        utils.createSvgElement("path", {
          d: "M14 34L34 14",
          fill: "none",
          stroke: ROAD_LINE_COLOR,
          "stroke-width": "4",
          "stroke-linecap": "round"
        })
      );
      return;
    }
    if (style === "doubleSolid" || style === "doubleDash") {
      const dash = style === "doubleDash";
      svg.append(linePath(19, dash), linePath(29, dash));
      return;
    }
    if (style === "leftSolidRightDash") {
      svg.append(linePath(19, false), linePath(29, true));
      return;
    }
    if (style === "rightSolidLeftDash") {
      svg.append(linePath(19, true), linePath(29, false));
      return;
    }
    svg.append(linePath(24, style === "dash"));
  }

  function boundaryFallbackStyle(config, role) {
    if (role === "edge" || role === "channel") {
      return {
        style: "solid",
        width: clamp(config.edgeLine?.width, 1, 16, 2)
      };
    }
    if (role === "median") {
      return {
        style: "doubleSolid",
        width: clamp(config.marking?.width, 1, 16, 2)
      };
    }
    return {
      style: config.marking?.style || "dash",
      width: clamp(config.marking?.width, 1, 16, 2)
    };
  }

  function boundaryBaseStyle(config, boundaryId, role) {
    const fallback = boundaryFallbackStyle(config, role);
    return {
      style: config.boundaryStyles?.[boundaryId]?.style || fallback.style,
      width: clamp(config.boundaryStyles?.[boundaryId]?.width, 1, 16, fallback.width)
    };
  }

  function boundarySegmentAt(config, boundaryId, role, index) {
    const base = boundaryBaseStyle(config, boundaryId, role);
    const segment = config.boundaryStyles?.[boundaryId]?.segments?.[index];
    return {
      style: segment?.style || base.style,
      width: clamp(segment?.width, 1, 16, base.width)
    };
  }

  function segmentCount(config, boundaryId) {
    return clampInt(config.boundaryStyles?.[boundaryId]?.segments?.length || 1, 1, 5, 1);
  }

  function boundaryFor(section) {
    if (!section || !activeBoundaryKey) return null;
    if (activeBoundaryKey === "end") {
      return {
        id: section.endBoundaryId,
        role: section.endBoundaryRole,
        title: "Alt cizgi",
        button: controls.lowerLine
      };
    }
    return {
      id: section.startBoundaryId,
      role: section.startBoundaryRole,
      title: "Ust cizgi",
      button: controls.upperLine
    };
  }

  function boundaryEditState(boundaryKey, section) {
    if (!section || (boundaryKey !== "start" && boundaryKey !== "end")) return null;
    return {
      key: boundaryKey,
      sectionId: section.sectionId,
      boundaryId: boundaryKey === "end" ? section.endBoundaryId : section.startBoundaryId,
      role: boundaryKey === "end" ? section.endBoundaryRole : section.startBoundaryRole
    };
  }

  function setBoundaryEditState(boundaryKey, section) {
    const model = activeRoadModel();
    if (!model) return;
    const nextState = boundaryEditState(boundaryKey, section);
    const current = model.metadata?.roadBoundaryEdit || null;
    const sameState = current && nextState
      && current.key === nextState.key
      && current.sectionId === nextState.sectionId
      && current.boundaryId === nextState.boundaryId;
    if ((!current && !nextState) || sameState) return;
    manager.updateModel(model.id, (draft) => {
      const metadata = { ...(draft.metadata || {}) };
      if (nextState) metadata.roadBoundaryEdit = nextState;
      else delete metadata.roadBoundaryEdit;
      return { ...draft, metadata };
    }, { skipHistory: true, styleControls: false });
  }

  function clearSectionSelection() {
    const model = activeRoadModel();
    if (!model) return;
    activeBoundaryKey = "";
    controls.boundaryPanel?.classList.add("gizli");
    manager.updateModel(model.id, (draft) => {
      const metadata = { ...(draft.metadata || {}) };
      delete metadata.roadSelection;
      delete metadata.roadBoundaryEdit;
      return { ...draft, metadata };
    }, { skipHistory: true });
  }

  function updateBoundary(boundaryKey, patcher, label) {
    updateActiveRoad((config, section, model) => {
      const boundaryId = boundaryKey === "end" ? section?.endBoundaryId : section?.startBoundaryId;
      const role = boundaryKey === "end" ? section?.endBoundaryRole : section?.startBoundaryRole;
      if (!boundaryId) return;
      patcher(adapterFor(model), config, boundaryId, role);
    }, label || "Yol cizgi segmenti");
  }

  function positionBoundaryPanel(button) {
    const rect = button?.getBoundingClientRect?.();
    if (!rect || !controls.boundaryPanel) return;
    const maxTop = Math.max(8, window.innerHeight - 210);
    controls.boundaryPanel.style.top = Math.round(clamp(rect.top, 8, maxTop, 96)) + "px";
  }

  function closeBoundaryPanel() {
    activeBoundaryKey = "";
    controls.boundaryPanel?.classList.add("gizli");
    togglePressed(controls.upperLine, false);
    togglePressed(controls.lowerLine, false);
    setBoundaryEditState("", null);
  }

  function openBoundaryPanel(boundaryKey, button) {
    const model = activeRoadModel();
    const section = selectedSectionInfo(model);
    if (!section) return;
    activeBoundaryKey = boundaryKey;
    positionBoundaryPanel(button);
    controls.boundaryPanel?.classList.remove("gizli");
    setBoundaryEditState(boundaryKey, section);
    sync({ model: manager.get(model.id) || model });
  }

  function makeSegmentButton(config, boundary, index) {
    const segment = boundarySegmentAt(config, boundary.id, boundary.role, index);
    const style = MARKING_STYLES[styleIndex(segment.style)];
    const button = document.createElement("button");
    button.className = "road-boundary-segment-btn";
    button.type = "button";
    button.title = `S${index + 1}: ${style.title}`;
    button.setAttribute("aria-label", `S${index + 1}: ${style.title}`);
    const svg = utils.createSvgElement("svg", { viewBox: "0 0 48 48", fill: "none", "aria-hidden": "true" });
    renderLineStyleIcon(svg, segment.style);
    button.append(svg);
    button.addEventListener("click", () => updateBoundary(activeBoundaryKey, (adapter, nextConfig, boundaryId, role) => {
      const current = boundarySegmentAt(nextConfig, boundaryId, role, index);
      adapter?.setBoundarySegment?.(nextConfig, boundaryId, index, {
        ...current,
        baseStyle: boundaryFallbackStyle(nextConfig, role),
        style: nextStyle(current.style)
      });
    }, "Yol cizgi segment stili"));
    return button;
  }

  function syncBoundaryPanel(config, section) {
    const boundary = boundaryFor(section);
    if (!boundary || !controls.boundaryPanel || controls.boundaryPanel.classList.contains("gizli")) return;
    controls.boundaryPanelTitle.textContent = boundary.title;
    togglePressed(controls.upperLine, activeBoundaryKey === "start");
    togglePressed(controls.lowerLine, activeBoundaryKey === "end");
    const count = segmentCount(config, boundary.id);
    if (controls.segmentCount && controls.segmentCount.value !== String(count)) controls.segmentCount.value = String(count);
    controls.segmentButtons?.replaceChildren();
    for (let index = 0; index < count; index += 1) {
      controls.segmentButtons?.append(makeSegmentButton(config, boundary, index));
    }
  }

  function sync(entry) {
    const model = entry?.model?.type === "road" ? entry.model : activeRoadModel();
    const visible = Boolean(model);
    controls.root?.classList.toggle("gizli", !visible);
    if (!visible) {
      closeBoundaryPanel();
      return;
    }
    keepRoadLayersAtBack();
    const config = normalizeConfig(model, model.metadata?.road);
    const section = selectedSectionInfo(model);
    const sectionMode = Boolean(section);
    controls.globalControls.forEach((control) => control.classList.toggle("gizli", sectionMode));
    controls.sectionControls.forEach((control) => control.classList.toggle("gizli", !sectionMode));
    if (!sectionMode) closeBoundaryPanel();
    if (controls.laneCount && controls.laneCount.value !== String(config.laneCount)) controls.laneCount.value = String(config.laneCount);
    const widthValue = sectionMode ? section.width : config.laneWidth;
    if (controls.laneWidth && controls.laneWidth.value !== String(widthValue)) controls.laneWidth.value = String(widthValue);
    togglePressed(controls.leftShoulder, config.leftShoulder?.enabled);
    togglePressed(controls.rightShoulder, config.rightShoulder?.enabled);
    const marking = MARKING_STYLES[styleIndex(config.marking?.style)];
    controls.markingStyle?.setAttribute("title", "Yol cizgi stili: " + marking.title);
    controls.markingStyle?.setAttribute("aria-label", "Yol cizgi stili: " + marking.title);
    renderLineStyleIcon(controls.markingStyleIcon, config.marking?.style);
    if (sectionMode) syncBoundaryPanel(config, section);
  }

  controls.laneCountPlus?.addEventListener("click", () => updateRoad((config) => setLaneCount(config, config.laneCount + 1), "Yol serit sayisi"));
  controls.laneCountMinus?.addEventListener("click", () => updateRoad((config) => setLaneCount(config, config.laneCount - 1), "Yol serit sayisi"));
  controls.laneCount?.addEventListener("change", () => updateRoad((config) => setLaneCount(config, controls.laneCount.value), "Yol serit sayisi"));
  controls.laneWidthPlus?.addEventListener("click", () => updateActiveRoad((config, section, model) => {
    setSelectedSectionWidth(model, config, section, (section?.width || config.laneWidth) + 5);
  }, "Yol kesit genisligi"));
  controls.laneWidthMinus?.addEventListener("click", () => updateActiveRoad((config, section, model) => {
    setSelectedSectionWidth(model, config, section, (section?.width || config.laneWidth) - 5);
  }, "Yol kesit genisligi"));
  controls.laneWidth?.addEventListener("change", () => updateActiveRoad((config, section, model) => {
    setSelectedSectionWidth(model, config, section, controls.laneWidth.value);
  }, "Yol kesit genisligi"));
  controls.upperLine?.addEventListener("click", () => openBoundaryPanel("start", controls.upperLine));
  controls.lowerLine?.addEventListener("click", () => openBoundaryPanel("end", controls.lowerLine));
  controls.sectionDone?.addEventListener("click", clearSectionSelection);
  controls.boundaryPanelClose?.addEventListener("click", closeBoundaryPanel);
  controls.segmentCount?.addEventListener("change", () => updateActiveRoad((config, section, model) => {
    const boundary = boundaryFor(section);
    if (!boundary) return;
    adapterFor(model)?.setBoundarySegmentCount?.(config, boundary.id, controls.segmentCount.value, boundaryFallbackStyle(config, boundary.role));
  }, "Yol cizgi segment sayisi"));
  controls.leftShoulder?.addEventListener("click", () => updateRoad((config) => { config.leftShoulder.enabled = !config.leftShoulder.enabled; }, "Yol banket"));
  controls.rightShoulder?.addEventListener("click", () => updateRoad((config) => { config.rightShoulder.enabled = !config.rightShoulder.enabled; }, "Yol banket"));
  controls.markingStyle?.addEventListener("click", () => updateRoad((config) => {
    config.marking.style = nextStyle(config.marking.style);
    config.segments = [{ from: 0, to: 1, markingStyle: config.marking.style }];
  }, "Yol cizgi stili"));
  window.addEventListener("resize", () => {
    const boundaryButton = activeBoundaryKey === "end" ? controls.lowerLine : controls.upperLine;
    positionBoundaryPanel(boundaryButton);
  });

  Kroki.RoadInspector = { sync };
})();
