(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  const styleManager = Kroki.StyleManager;
  if (!manager || !selection || !styleManager) return;

  const DEFAULT_STATE = {
    text: "METIN",
    size: 28,
    color: "#111827",
    opacity: 1,
    align: "center",
    bold: false,
    italic: false,
    underline: false
  };

  const panel = document.querySelector("#freeTextComposer");
  if (!panel) return;

  const controls = {
    input: panel.querySelector("#freeTextInput")
  };

  let state = { ...DEFAULT_STATE };
  let mode = "create";
  let editModelId = "";
  let liveEditTransaction = null;
  let initialEditSnapshot = null;

  function cloneModel(model) {
    if (!model) return null;
    return Kroki.EditorUtils?.clonePlain?.(model) || JSON.parse(JSON.stringify(model));
  }

  function normalizeText(value) {
    return styleManager.normalizeLabelText(value ?? "");
  }

  function hexToRgb(hex) {
    const match = String(hex || "").match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!match) return { r: 17, g: 24, b: 39 };
    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16)
    };
  }

  function previewTextColor() {
    const rgb = hexToRgb(state.color);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${state.opacity})`;
  }

  function syncPreview() {
    if (!controls.input) return;
    controls.input.style.textAlign = state.align;
    controls.input.style.color = previewTextColor();
    controls.input.style.fontSize = "";
    controls.input.style.fontWeight = state.bold ? "900" : "500";
    controls.input.style.fontStyle = state.italic ? "italic" : "normal";
    controls.input.style.textDecoration = state.underline ? "underline" : "none";
    controls.input.style.lineHeight = "1.22";
  }

  function sync() {
    if (controls.input && controls.input.value !== state.text) controls.input.value = state.text;
    syncPreview();
  }

  function stateFromModel(model) {
    const label = styleManager.normalizeLabel(model?.label, "text");
    const style = styleManager.normalizeStyle(model?.style, "text");
    return {
      text: label.text || DEFAULT_STATE.text,
      size: label.size,
      color: label.color,
      opacity: style.opacity,
      align: label.position.align || DEFAULT_STATE.align,
      bold: label.bold,
      italic: label.italic,
      underline: label.underline
    };
  }

  function ensureLiveEditTransaction() {
    if (mode !== "edit" || !editModelId || liveEditTransaction) return;
    liveEditTransaction = Kroki.HistoryManager?.beginObjectChange?.(editModelId, "Metin guncelle") || null;
  }

  function commitLiveEditTransaction() {
    if (!liveEditTransaction) return;
    Kroki.HistoryManager?.commitObjectChange?.(liveEditTransaction, "Metin guncelle");
    liveEditTransaction = null;
  }

  function discardLiveEditTransaction() {
    liveEditTransaction = null;
  }

  function applyLiveEdit(options = {}) {
    if (mode !== "edit" || !editModelId) return;
    const model = manager.get(editModelId);
    if (!model || model.type !== "text") return;
    const text = normalizeText(controls.input?.value ?? state.text);
    if (!text.trim()) return;
    state.text = text;
    ensureLiveEditTransaction();
    const label = styleManager.normalizeLabel(model.label, model.type);
    manager.updateModel(model.id, (draft) => ({
      ...draft,
      style: styleManager.normalizeStyle({ ...draft.style, opacity: state.opacity }, draft.type),
      label: styleManager.normalizeLabel({
        ...draft.label,
        text,
        size: state.size,
        color: state.color,
        position: { ...label.position, align: state.align },
        bold: state.bold,
        italic: state.italic,
        underline: state.underline
      }, draft.type)
    }), { skipHistory: true, label: "Metin guncelle", ...options });
  }

  function showCreate() {
    commitLiveEditTransaction();
    mode = "create";
    editModelId = "";
    initialEditSnapshot = null;
    selection.clear();
    panel.classList.remove("gizli");
    state = { ...DEFAULT_STATE };
    panel.setAttribute("aria-label", "Metin ekle");
    sync();
    window.setTimeout(() => {
      controls.input?.focus();
      controls.input?.select();
    }, 0);
  }

  function showEdit(modelId) {
    commitLiveEditTransaction();
    const model = manager.get(modelId);
    if (!model || model.type !== "text") return;
    mode = "edit";
    editModelId = model.id;
    initialEditSnapshot = cloneModel(model);
    panel.classList.remove("gizli");
    state = stateFromModel(model);
    panel.setAttribute("aria-label", "Metni duzenle");
    sync();
    window.setTimeout(() => {
      controls.input?.focus();
      controls.input?.select();
    }, 0);
  }

  function hide() {
    document.querySelector("#btnLineText")?.setAttribute("aria-expanded", "false");
    panel.classList.add("gizli");
    mode = "create";
    editModelId = "";
    initialEditSnapshot = null;
  }

  function visibleCanvasPoint() {
    const viewBox = manager.canvas.viewBox?.baseVal;
    if (viewBox && viewBox.width && viewBox.height) {
      return {
        x: viewBox.x + viewBox.width * 0.5,
        y: viewBox.y + viewBox.height * 0.46
      };
    }
    return { x: 600, y: 368 };
  }

  function createText() {
    const text = normalizeText(controls.input?.value ?? state.text);
    if (!text.trim()) {
      hide();
      window.krokiEditorRail?.resetCizimAraci?.();
      return;
    }
    const point = visibleCanvasPoint();
    const model = manager.create("text", {
      geometry: { x: point.x, y: point.y, rotation: 0 },
      style: { opacity: state.opacity },
      label: {
        text,
        size: state.size,
        color: state.color,
        position: { align: state.align },
        bold: state.bold,
        italic: state.italic,
        underline: state.underline
      }
    });
    if (model) selection.edit(model.id);
    hide();
    window.krokiEditorRail?.resetCizimAraci?.();
  }

  function updateText() {
    const model = manager.get(editModelId);
    if (!model || model.type !== "text") {
      hide();
      return;
    }

    const text = normalizeText(controls.input?.value ?? state.text);
    if (!text.trim()) {
      cancelText();
      return;
    }

    state.text = text;
    applyLiveEdit();
    commitLiveEditTransaction();
    hide();
  }

  function submitText() {
    if (mode === "edit") updateText();
    else createText();
  }

  function cancelText() {
    const wasCreateMode = mode === "create";
    if (!wasCreateMode && initialEditSnapshot?.id && manager.get(initialEditSnapshot.id)) {
      const snapshot = cloneModel(initialEditSnapshot);
      manager.updateModel(snapshot.id, () => snapshot, { skipHistory: true });
      discardLiveEditTransaction();
    }
    hide();
    if (wasCreateMode) window.krokiEditorRail?.resetCizimAraci?.();
  }

  controls.input?.addEventListener("input", () => {
    const normalized = normalizeText(controls.input.value);
    if (controls.input.value !== normalized) {
      const start = controls.input.selectionStart;
      const end = controls.input.selectionEnd;
      controls.input.value = normalized;
      controls.input.setSelectionRange(start, end);
    }
    state.text = normalized;
    applyLiveEdit({ controlPoints: false, styleControls: false });
  });
  controls.input?.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      submitText();
      return;
    }
    if (event.key === "Escape") cancelText();
  });
  document.addEventListener("pointerdown", (event) => {
    if (panel.classList.contains("gizli") || panel.contains(event.target)) return;
    if (event.target?.closest?.("#btnLineText")) return;
    const canvasTap = Boolean(event.target?.closest?.("#editorCanvas"));
    submitText();
    if (canvasTap) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener("kroki:active-tool-change", (event) => {
    if (event.detail?.tool === "metin") showCreate();
    else if (!panel.classList.contains("gizli")) cancelText();
  });

  Kroki.FreeTextComposer = {
    openEdit: showEdit,
    isOpenFor(modelId) {
      return mode === "edit" && editModelId === modelId && !panel.classList.contains("gizli");
    },
    complete: submitText,
    hideEdit() {
      if (mode === "edit") updateText();
    }
  };
})();
