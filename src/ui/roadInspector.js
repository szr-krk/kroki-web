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
  const ROAD_PROFILES = [
    { id: "straight", title: "Duz", short: "D" },
    { id: "arc", title: "Viraj", short: "V" },
    { id: "sCurve", title: "S viraj", short: "SV" }
  ];
  const POCKET_STATES = [
    { id: "none", title: "Cep yok" },
    { id: "right", title: "Sa\u011f cep" },
    { id: "left", title: "Sol cep" },
    { id: "double", title: "\u00c7ift cep" }
  ];
  const MIN_S_CURVE_CONTROLS = 2;
  const MAX_S_CURVE_CONTROLS = 2;
  const ROAD_LINE_COLOR = "#000000";
  let activeBoundaryKey = "";

  const controls = {
    root: document.querySelector("#roadIpControls"),
    laneCount: document.querySelector("#roadLaneCountIpInput"),
    laneCountControl: document.querySelector("#roadLaneCountIpInput")?.closest(".road-ip-stepper"),
    laneCountPlus: document.querySelector("#btnRoadLaneCountPlus"),
    laneCountMinus: document.querySelector("#btnRoadLaneCountMinus"),
    laneWidth: document.querySelector("#roadLaneWidthIpInput"),
    laneWidthControl: document.querySelector("#roadLaneWidthIpInput")?.closest(".road-ip-stepper"),
    laneWidthPlus: document.querySelector("#btnRoadLaneWidthPlus"),
    laneWidthMinus: document.querySelector("#btnRoadLaneWidthMinus"),
    profile: document.querySelector("#btnRoadProfileIp"),
    profileLabel: document.querySelector("#lblRoadProfileIp"),
    pocket: document.querySelector("#btnRoadPocketIp"),
    pocketLabel: document.querySelector("#lblRoadPocketIp"),
    sCurveControls: document.querySelector("#roadSCurveControlIp"),
    sCurveControlCount: document.querySelector("#roadSCurveControlCountIpInput"),
    sCurveControlPlus: document.querySelector("#btnRoadSCurveControlPlus"),
    sCurveControlMinus: document.querySelector("#btnRoadSCurveControlMinus"),
    xAxisSymmetry: document.querySelector("#btnRoadXAxisSymmetryIp"),
    yAxisSymmetry: document.querySelector("#btnRoadYAxisSymmetryIp"),
    upperLine: document.querySelector("#btnRoadUpperLinePanel"),
    lowerLine: document.querySelector("#btnRoadLowerLinePanel"),
    addBarrier: document.querySelector("#btnRoadAddBarrierIp"),
    barrierControls: document.querySelector("#roadBarrierControlsIp"),
    barrierAttached: document.querySelector("#btnRoadBarrierAttachedIp"),
    barrierEndCaps: document.querySelector("#btnRoadBarrierEndCapsIp"),
    barrierEndCapsLabel: document.querySelector("#lblRoadBarrierEndCapsIp"),
    barrierSpacing: document.querySelector("#roadBarrierSpacingIpInput"),
    barrierSpacingPlus: document.querySelector("#btnRoadBarrierSpacingPlus"),
    barrierSpacingMinus: document.querySelector("#btnRoadBarrierSpacingMinus"),
    barrierDelete: document.querySelector("#btnRoadBarrierDeleteIp"),
    barrierDone: document.querySelector("#btnRoadBarrierDoneIp"),
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
    pocketIslandDone: document.querySelector("#btnRoadPocketIslandDoneIp"),
    globalControls: Array.from(document.querySelectorAll("#roadIpControls .road-global-control")),
    symmetryControls: Array.from(document.querySelectorAll("#roadIpControls .road-symmetry-control")),
    sectionControls: Array.from(document.querySelectorAll("#roadIpControls .road-lane-only-control"))
  };
  const bindHoldAction = window.krokiObjectEditCore?.bindHoldAction || ((button, action) => {
    button?.addEventListener("click", action);
    return () => {};
  });

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
    if (typeof adapter?.roadConfig === "function") return adapter.roadConfig(model, source || model?.metadata?.road || {});
    return adapter?.normalizeRoadConfig?.(source || model?.metadata?.road || {}) || source || {};
  }

  function isIslandRoad(model) {
    return Boolean(adapterFor(model)?.isIsland?.(model));
  }

  function selectedSectionInfo(model) {
    return adapterFor(model)?.selectedSectionInfo?.(model) || null;
  }

  function selectedBarrierInfo(model) {
    return adapterFor(model)?.selectedBarrierInfo?.(model) || null;
  }

  function selectedPocketIslandInfo(model) {
    return adapterFor(model)?.selectedPocketIslandInfo?.(model) || null;
  }

  function barrierTargetsForSelection(model, section) {
    return adapterFor(model)?.barrierTargetsForSelection?.(model, section) || [];
  }

  function nextBarrierTarget(model, section) {
    return barrierTargetsForSelection(model, section)
      .filter((target) => target.remaining > 0)
      .sort((a, b) => a.count - b.count || barrierTargetSortValue(a.edgeKey) - barrierTargetSortValue(b.edgeKey))[0] || null;
  }

  function barrierTargetSortValue(edgeKey) {
    if (edgeKey === "rightOuter") return 0;
    if (edgeKey === "rightInner") return 1;
    if (edgeKey === "leftInner") return 2;
    if (edgeKey === "leftOuter") return 3;
    return 4;
  }

  function barrierTargetTitle(target) {
    if (target?.title) return target.title;
    if (!target?.edgeKey) return target?.side === "left" ? "sol" : "sag";
    if (target.edgeKey === "rightOuter") return "gidis sag";
    if (target.edgeKey === "rightInner") return "gidis sol";
    if (target.edgeKey === "leftInner") return "donus sag";
    if (target.edgeKey === "leftOuter") return "donus sol";
    return target.side === "left" ? "sol" : "sag";
  }

  function barrierEndCaps(endCaps) {
    return {
      start: Boolean(endCaps?.start),
      end: Boolean(endCaps?.end)
    };
  }

  function barrierEndCapsTitle(endCaps) {
    const caps = barrierEndCaps(endCaps);
    if (caps.start && caps.end) return "Çift kapalı";
    if (caps.end) return "Sağ kapalı";
    if (caps.start) return "Sol kapalı";
    return "Açık";
  }

  function barrierEndCapsLabel(endCaps) {
    const caps = barrierEndCaps(endCaps);
    if (caps.start && caps.end) return ["Çift", "Kapalı"];
    if (caps.end) return ["Sağ", "Kapalı"];
    if (caps.start) return ["Sol", "Kapalı"];
    return ["İki Uç", "Açık"];
  }

  function setBarrierEndCapsLabel(endCaps) {
    if (!controls.barrierEndCapsLabel) return;
    controls.barrierEndCapsLabel.replaceChildren(...barrierEndCapsLabel(endCaps).map((line, index) => {
      const node = document.createElement(index ? "span" : "strong");
      node.textContent = line;
      return node;
    }));
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    const clean = Number.isFinite(number) ? number : fallback;
    return Math.min(max, Math.max(min, clean));
  }

  function clampInt(value, min, max, fallback) {
    return Math.round(clamp(value, min, max, fallback));
  }

  function pickerInt(value, fallback) {
    const number = Number(value);
    return Math.round(Number.isFinite(number) ? number : fallback);
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

  function updateActiveRoadModel(mutator, label) {
    const model = activeRoadModel();
    if (!model) return;
    selection.promoteToEdit?.();
    manager.updateModel(model.id, (draft) => {
      mutator(draft, adapterFor(draft));
      return draft;
    }, { label: label || "Yol guncelle" });
  }

  function reflectActiveRoad(method, label) {
    const model = activeRoadModel();
    if (!model || isIslandRoad(model)) return;
    updateActiveRoadModel((draft, adapter) => adapter?.[method]?.(draft), label);
  }

  function updateLaneCountValue(value, label) {
    const model = activeRoadModel();
    if (!model) return;
    if (isIslandRoad(model)) {
      updateActiveRoadModel((draft, adapter) => adapter?.setIslandLaneCount?.(draft, value), label || "Ada serit sayisi");
      return;
    }
    updateRoad((config) => setLaneCount(config, value), label || "Yol serit sayisi");
  }

  function updateLaneWidthValue(value, label) {
    const model = activeRoadModel();
    if (!model) return;
    const width = pickerInt(value, 50);
    if (isIslandRoad(model)) {
      updateActiveRoadModel((draft, adapter) => {
        const section = adapter?.selectedSectionInfo?.(draft);
        if (section?.sectionId) adapter?.setIslandSectionWidth?.(draft, section.sectionId, width);
        else adapter?.setIslandLaneWidth?.(draft, width);
      }, label || "Ada serit genisligi");
      return;
    }
    updateActiveRoad((config, section, draft) => {
      setSelectedSectionWidth(draft, config, section, width);
    }, label || "Yol kesit genisligi");
  }

  function commitLaneWidthPicker() {
    if (!controls.laneWidth || controls.laneWidth.value === "") return;
    const width = pickerInt(controls.laneWidth.value, 50);
    controls.laneWidth.value = String(width);
    const model = activeRoadModel();
    if (!model) return;
    const config = normalizeConfig(model, model.metadata?.road);
    const section = selectedSectionInfo(model);
    if (pickerInt(section?.width || config.laneWidth, 50) === width) return;
    updateLaneWidthValue(width, isIslandRoad(model) ? "Ada serit genisligi" : "Yol kesit genisligi");
  }

  function updateSelectedBarrier(mutator, label) {
    updateActiveRoad((config, section, draft) => {
      const adapter = adapterFor(draft);
      const barrier = adapter?.selectedBarrierInfo?.(draft);
      if (!barrier) return;
      mutator(adapter, draft, config, barrier, section);
      draft.metadata = {
        ...(draft.metadata || {}),
        roadBarrierEdit: { id: barrier.id }
      };
    }, label || "Yol bariyeri");
  }

  function updateBarrierSpacingValue(value, label) {
    const spacing = clampInt(value, 18, 180, 42);
    updateSelectedBarrier((adapter, draft, config, barrier) => {
      adapter?.setBarrierSpacing?.(config, barrier.id, spacing);
    }, label || "Bariyer direk araligi");
  }

  function commitBarrierSpacingPicker() {
    if (!controls.barrierSpacing || controls.barrierSpacing.value === "") return;
    const spacing = clampInt(controls.barrierSpacing.value, 18, 180, 42);
    controls.barrierSpacing.value = String(spacing);
    const model = activeRoadModel();
    const barrier = selectedBarrierInfo(model);
    if (!barrier || clampInt(barrier.spacing, 18, 180, 42) === spacing) return;
    updateBarrierSpacingValue(spacing);
  }

  function nudgeBarrierSpacing(delta) {
    const barrier = selectedBarrierInfo(activeRoadModel());
    if (!barrier) return;
    updateBarrierSpacingValue(clampInt(barrier.spacing, 18, 180, 42) + delta);
  }

  function deleteSelectedBarrier() {
    updateActiveRoad((config, section, draft) => {
      const adapter = adapterFor(draft);
      const barrier = adapter?.selectedBarrierInfo?.(draft);
      if (!barrier) return;
      adapter?.removeBarrierFromConfig?.(draft, config, barrier.id);
    }, "Yol bariyeri sil");
  }

  function cycleSelectedBarrierEndCaps() {
    updateSelectedBarrier((adapter, draft, config, barrier) => {
      adapter?.cycleBarrierEndCaps?.(config, barrier.id);
    }, "Bariyer uçları");
  }

  function profileInfo(profile) {
    return ROAD_PROFILES.find((item) => item.id === profile) || ROAD_PROFILES[0];
  }

  function nextProfile(profile) {
    const index = Math.max(0, ROAD_PROFILES.findIndex((item) => item.id === profile));
    return ROAD_PROFILES[(index + 1) % ROAD_PROFILES.length].id;
  }

  function pocketState(model) {
    const adapter = adapterFor(model);
    const id = adapter?.pocketMode?.(model) || "none";
    return POCKET_STATES.find((item) => item.id === id) || POCKET_STATES[0];
  }

  function nextPocketState(model) {
    const current = pocketState(model);
    const index = Math.max(0, POCKET_STATES.findIndex((item) => item.id === current.id));
    return POCKET_STATES[(index + 1) % POCKET_STATES.length];
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
      delete metadata.roadBarrierEdit;
      delete metadata.roadPocketEdit;
      delete metadata.roadPocketIslandEdit;
      return { ...draft, metadata };
    }, { skipHistory: true });
  }

  function clearBarrierSelection() {
    const model = activeRoadModel();
    if (!model) return;
    manager.updateModel(model.id, (draft) => {
      const adapter = adapterFor(draft);
      adapter?.clearBarrierSelection?.(draft);
      return draft;
    }, { skipHistory: true });
  }

  function clearPocketIslandSelection() {
    const model = activeRoadModel();
    if (!model) return;
    Kroki.StyleManager?.hidePanels?.();
    manager.updateModel(model.id, (draft) => {
      const metadata = { ...(draft.metadata || {}) };
      delete metadata.roadPocketIslandEdit;
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
      controls.pocketIslandDone?.classList.add("gizli");
      closeBoundaryPanel();
      return;
    }
    keepRoadLayersAtBack();
    const config = normalizeConfig(model, model.metadata?.road);
    const section = selectedSectionInfo(model);
    const barrier = selectedBarrierInfo(model);
    const pocketIsland = selectedPocketIslandInfo(model);
    const pocketIslandMode = Boolean(pocketIsland);
    controls.root?.classList.toggle("gizli", pocketIslandMode);
    controls.pocketIslandDone?.classList.toggle("gizli", !pocketIslandMode);
    const island = isIslandRoad(model);
    const barrierMode = Boolean(barrier);
    const sectionMode = Boolean(section) && !barrierMode;
    if (pocketIslandMode) closeBoundaryPanel();
    const pocketSectionMode = sectionMode && section?.role === "pocket";
    const barrierTargets = !barrierMode && sectionMode && !pocketSectionMode ? barrierTargetsForSelection(model, section) : [];
    const addBarrierTarget = barrierTargets.filter((target) => target.remaining > 0)
      .sort((a, b) => a.count - b.count || barrierTargetSortValue(a.edgeKey) - barrierTargetSortValue(b.edgeKey))[0] || null;
    controls.globalControls.forEach((control) => control.classList.toggle("gizli", sectionMode || barrierMode));
    controls.sectionControls.forEach((control) => control.classList.toggle("gizli", !sectionMode));
    controls.upperLine?.classList.toggle("gizli", !sectionMode || pocketSectionMode);
    controls.lowerLine?.classList.toggle("gizli", !sectionMode || pocketSectionMode);
    controls.symmetryControls.forEach((control) => control.classList.toggle("gizli", island || sectionMode || barrierMode));
    controls.laneWidthControl?.classList.toggle("gizli", barrierMode);
    controls.addBarrier?.classList.toggle("gizli", barrierTargets.length === 0);
    if (controls.addBarrier) {
      controls.addBarrier.disabled = !addBarrierTarget;
      controls.addBarrier.setAttribute("aria-disabled", String(!addBarrierTarget));
      controls.addBarrier.setAttribute("title", addBarrierTarget ? "Bariyer ekle (" + barrierTargetTitle(addBarrierTarget) + ")" : "Bu kenara en fazla iki bariyer eklenebilir");
      controls.addBarrier.setAttribute("aria-label", addBarrierTarget ? "Bariyer ekle " + barrierTargetTitle(addBarrierTarget) : "Bariyer ekle");
    }
    controls.barrierControls?.classList.toggle("gizli", !barrierMode);
    if (barrierMode) {
      closeBoundaryPanel();
      togglePressed(controls.barrierAttached, barrier.attached);
      controls.barrierAttached?.setAttribute("title", barrier.attached ? "Yola yapisik" : "Serbest bariyer");
      controls.barrierAttached?.setAttribute("aria-label", barrier.attached ? "Yola yapisik" : "Serbest bariyer");
      const endCapsTitle = "Bariyer uçları: " + barrierEndCapsTitle(barrier.endCaps);
      setBarrierEndCapsLabel(barrier.endCaps);
      if (controls.barrierEndCaps) {
        controls.barrierEndCaps.disabled = false;
        controls.barrierEndCaps.setAttribute("aria-disabled", "false");
        controls.barrierEndCaps.setAttribute("title", endCapsTitle);
        controls.barrierEndCaps.setAttribute("aria-label", endCapsTitle);
      }
      const spacing = clampInt(barrier.spacing, 18, 180, 42);
      if (controls.barrierSpacing && controls.barrierSpacing.value !== String(spacing)) controls.barrierSpacing.value = String(spacing);
    }
    if (island) {
      controls.profile?.classList.add("gizli");
      controls.pocket?.classList.add("gizli");
      controls.sCurveControls?.classList.add("gizli");
      controls.leftShoulder?.classList.add("gizli");
      controls.rightShoulder?.classList.add("gizli");
      controls.markingStyle?.classList.add("gizli");
    } else {
      controls.profile?.classList.toggle("gizli", sectionMode || barrierMode);
      controls.pocket?.classList.toggle("gizli", sectionMode || barrierMode || model.geometry?.profile !== "straight");
      controls.leftShoulder?.classList.toggle("gizli", sectionMode || barrierMode);
      controls.rightShoulder?.classList.toggle("gizli", sectionMode || barrierMode);
      controls.markingStyle?.classList.toggle("gizli", sectionMode || barrierMode);
    }
    if (controls.laneCount) controls.laneCount.max = island ? "3" : "5";
    const profile = profileInfo(model.geometry?.profile);
    controls.profile?.setAttribute("title", "Yol profili: " + profile.title);
    controls.profile?.setAttribute("aria-label", "Yol profili: " + profile.title);
    if (controls.profileLabel) controls.profileLabel.textContent = profile.short;
    const pocket = pocketState(model);
    controls.pocket?.setAttribute("title", pocket.title);
    controls.pocket?.setAttribute("aria-label", pocket.title);
    if (controls.pocketLabel) controls.pocketLabel.textContent = pocket.title;
    togglePressed(controls.pocket, pocket.id !== "none");
    const sCurveCount = clampInt(adapterFor(model)?.sCurveControlCount?.(model), MIN_S_CURVE_CONTROLS, MAX_S_CURVE_CONTROLS, MIN_S_CURVE_CONTROLS);
    if (controls.sCurveControlCount && controls.sCurveControlCount.value !== String(sCurveCount)) controls.sCurveControlCount.value = String(sCurveCount);
    if (!island) controls.sCurveControls?.classList.toggle("gizli", sectionMode || barrierMode || model.geometry?.profile !== "sCurve");
    if (!sectionMode || pocketSectionMode) closeBoundaryPanel();
    if (controls.laneCount && controls.laneCount.value !== String(config.laneCount)) controls.laneCount.value = String(config.laneCount);
    const widthValue = pickerInt(sectionMode ? section.width : config.laneWidth, 50);
    if (controls.laneWidth && controls.laneWidth.value !== String(widthValue)) controls.laneWidth.value = String(widthValue);
    togglePressed(controls.leftShoulder, config.leftShoulder?.enabled);
    togglePressed(controls.rightShoulder, config.rightShoulder?.enabled);
    const marking = MARKING_STYLES[styleIndex(config.marking?.style)];
    controls.markingStyle?.setAttribute("title", "Yol cizgi stili: " + marking.title);
    controls.markingStyle?.setAttribute("aria-label", "Yol cizgi stili: " + marking.title);
    renderLineStyleIcon(controls.markingStyleIcon, config.marking?.style);
    if (sectionMode && !pocketSectionMode) syncBoundaryPanel(config, section);
  }

  bindHoldAction(controls.laneCountPlus, () => {
    const model = activeRoadModel();
    const config = normalizeConfig(model, model?.metadata?.road);
    updateLaneCountValue((config.laneCount || 1) + 1, isIslandRoad(model) ? "Ada serit sayisi" : "Yol serit sayisi");
  });
  bindHoldAction(controls.laneCountMinus, () => {
    const model = activeRoadModel();
    const config = normalizeConfig(model, model?.metadata?.road);
    updateLaneCountValue((config.laneCount || 1) - 1, isIslandRoad(model) ? "Ada serit sayisi" : "Yol serit sayisi");
  });
  controls.laneCount?.addEventListener("change", () => updateLaneCountValue(controls.laneCount.value, isIslandRoad(activeRoadModel()) ? "Ada serit sayisi" : "Yol serit sayisi"));
  bindHoldAction(controls.laneWidthPlus, () => {
    const model = activeRoadModel();
    const config = normalizeConfig(model, model?.metadata?.road);
    const section = selectedSectionInfo(model);
    const current = pickerInt(section?.width || config.laneWidth, 50);
    updateLaneWidthValue(current + 5, isIslandRoad(model) ? "Ada serit genisligi" : "Yol kesit genisligi");
  });
  bindHoldAction(controls.laneWidthMinus, () => {
    const model = activeRoadModel();
    const config = normalizeConfig(model, model?.metadata?.road);
    const section = selectedSectionInfo(model);
    const current = pickerInt(section?.width || config.laneWidth, 50);
    updateLaneWidthValue(current - 5, isIslandRoad(model) ? "Ada serit genisligi" : "Yol kesit genisligi");
  });
  controls.laneWidth?.addEventListener("input", () => {
    if (controls.laneWidth.value === "") return;
    controls.laneWidth.value = String(pickerInt(controls.laneWidth.value, 50));
  });
  controls.laneWidth?.addEventListener("change", commitLaneWidthPicker);
  controls.laneWidth?.addEventListener("blur", commitLaneWidthPicker);
  controls.profile?.addEventListener("click", () => updateActiveRoadModel((draft, adapter) => {
    adapter?.setProfile?.(draft, nextProfile(draft.geometry?.profile));
  }, "Yol profili"));
  controls.pocket?.addEventListener("click", () => updateActiveRoadModel((draft, adapter) => {
    if (draft.geometry?.profile !== "straight") return;
    adapter?.setPocketMode?.(draft, nextPocketState(draft).id);
  }, "Yol cebi"));
  controls.xAxisSymmetry?.addEventListener("click", () => reflectActiveRoad("reflectAcrossBoundsXAxis", "Yol X ekseni simetrisi"));
  controls.yAxisSymmetry?.addEventListener("click", () => reflectActiveRoad("reflectAcrossBoundsYAxis", "Yol Y ekseni simetrisi"));
  bindHoldAction(controls.sCurveControlPlus, () => updateActiveRoadModel((draft, adapter) => {
    if (draft.geometry?.profile !== "sCurve") return;
    const count = adapter?.sCurveControlCount?.(draft) || MIN_S_CURVE_CONTROLS;
    adapter?.setSCurveControlCount?.(draft, count + 1);
  }, "S viraj kontrol noktasi"));
  bindHoldAction(controls.sCurveControlMinus, () => updateActiveRoadModel((draft, adapter) => {
    if (draft.geometry?.profile !== "sCurve") return;
    const count = adapter?.sCurveControlCount?.(draft) || MIN_S_CURVE_CONTROLS;
    adapter?.setSCurveControlCount?.(draft, count - 1);
  }, "S viraj kontrol noktasi"));
  controls.sCurveControlCount?.addEventListener("change", () => updateActiveRoadModel((draft, adapter) => {
    if (draft.geometry?.profile !== "sCurve") return;
    adapter?.setSCurveControlCount?.(draft, controls.sCurveControlCount.value);
  }, "S viraj kontrol noktasi"));
  controls.upperLine?.addEventListener("click", () => openBoundaryPanel("start", controls.upperLine));
  controls.lowerLine?.addEventListener("click", () => openBoundaryPanel("end", controls.lowerLine));
  controls.addBarrier?.addEventListener("click", () => updateActiveRoad((config, section, draft) => {
    adapterFor(draft)?.addBarrierToConfig?.(draft, config, section);
  }, "Yol bariyeri ekle"));
  controls.barrierAttached?.addEventListener("click", () => updateSelectedBarrier((adapter, draft, config, barrier) => {
    adapter?.setBarrierAttached?.(draft, config, barrier.id, !barrier.attached);
  }, "Bariyer yola yapisik"));
  controls.barrierEndCaps?.addEventListener("click", cycleSelectedBarrierEndCaps);
  bindHoldAction(controls.barrierSpacingPlus, () => nudgeBarrierSpacing(1), { repeatDelay: 55 });
  bindHoldAction(controls.barrierSpacingMinus, () => nudgeBarrierSpacing(-1), { repeatDelay: 55 });
  controls.barrierSpacing?.addEventListener("input", () => {
    if (controls.barrierSpacing.value === "") return;
    controls.barrierSpacing.value = String(clampInt(controls.barrierSpacing.value, 18, 180, 42));
  });
  controls.barrierSpacing?.addEventListener("change", commitBarrierSpacingPicker);
  controls.barrierSpacing?.addEventListener("blur", commitBarrierSpacingPicker);
  controls.barrierDelete?.addEventListener("click", deleteSelectedBarrier);
  controls.barrierDone?.addEventListener("click", clearBarrierSelection);
  controls.sectionDone?.addEventListener("click", clearSectionSelection);
  controls.pocketIslandDone?.addEventListener("click", clearPocketIslandSelection);
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
