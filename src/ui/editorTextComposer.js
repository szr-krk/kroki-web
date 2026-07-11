(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  const styleManager = Kroki.StyleManager;
  if (!manager || !selection || !styleManager) return;

  const ALIGN_IDS = ["left", "center", "right"];
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
    input: panel.querySelector("#freeTextInput"),
    done: panel.querySelector("#btnFreeTextDone"),
    cancel: panel.querySelector("#btnFreeTextCancel"),
    sizeMinus: panel.querySelector("#btnFreeTextSizeMinus"),
    sizePlus: panel.querySelector("#btnFreeTextSizePlus"),
    sizeValue: panel.querySelector("#valFreeTextSize"),
    opacityMinus: panel.querySelector("#btnFreeTextOpacityMinus"),
    opacityPlus: panel.querySelector("#btnFreeTextOpacityPlus"),
    opacityValue: panel.querySelector("#valFreeTextOpacity"),
    align: panel.querySelector("#btnFreeTextAlign"),
    bold: panel.querySelector("#btnFreeTextBold"),
    italic: panel.querySelector("#btnFreeTextItalic"),
    underline: panel.querySelector("#btnFreeTextUnderline"),
    color: panel.querySelector("#btnFreeTextColor"),
    colorInput: panel.querySelector("#freeTextColorInput")
  };

  let state = { ...DEFAULT_STATE };
  let mode = "create";
  let editModelId = "";
  const bindHoldAction = window.krokiObjectEditCore?.bindHoldAction || ((button, action) => {
    button?.addEventListener("click", action);
    return () => {};
  });

  function normalizeSize(value) {
    return Math.max(6, Math.min(160, Math.round(Number(value) || DEFAULT_STATE.size)));
  }

  function normalizeOpacity(value) {
    const number = Number(value);
    return Math.max(0, Math.min(1, Number.isFinite(number) ? number : DEFAULT_STATE.opacity));
  }

  function normalizeText(value) {
    return styleManager.normalizeLabelText(value || DEFAULT_STATE.text);
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

  function nextAlign() {
    const index = ALIGN_IDS.indexOf(state.align);
    state.align = ALIGN_IDS[(index + 1 + ALIGN_IDS.length) % ALIGN_IDS.length];
  }

  function setPressed(button, value) {
    button?.classList.toggle("is-active", Boolean(value));
    button?.setAttribute("aria-pressed", String(Boolean(value)));
  }

  function sync() {
    if (controls.input && controls.input.value !== state.text) controls.input.value = state.text;
    if (controls.sizeValue) controls.sizeValue.textContent = String(state.size);
    if (controls.opacityValue) controls.opacityValue.textContent = Math.round(state.opacity * 100) + "%";
    if (controls.colorInput) controls.colorInput.value = state.color;
    syncPreview();
    controls.color?.style.setProperty("--side-ip-fill-color", state.color);
    controls.align?.setAttribute("data-align", state.align);
    controls.align?.setAttribute("title", state.align === "left" ? "Metin solda" : state.align === "right" ? "Metin sagda" : "Metin ortada");
    setPressed(controls.bold, state.bold);
    setPressed(controls.italic, state.italic);
    setPressed(controls.underline, state.underline);
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

  function showCreate() {
    mode = "create";
    editModelId = "";
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
    const model = manager.get(modelId);
    if (!model || model.type !== "text") return;
    mode = "edit";
    editModelId = model.id;
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
    if (mode === "edit") document.querySelector("#btnLineText")?.setAttribute("aria-expanded", "false");
    panel.classList.add("gizli");
    mode = "create";
    editModelId = "";
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
    const text = normalizeText(controls.input?.value || state.text);
    if (!text.trim()) return;
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

    const text = normalizeText(controls.input?.value || state.text);
    if (!text.trim()) return;

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
    }));
    selection.edit(model.id);
    hide();
  }

  function submitText() {
    if (mode === "edit") updateText();
    else createText();
  }

  function changeSize(delta) {
    state.size = normalizeSize(state.size + delta);
    sync();
  }

  function changeOpacity(delta) {
    state.opacity = normalizeOpacity(state.opacity + delta);
    sync();
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
  });
  controls.done?.addEventListener("click", submitText);
  controls.cancel?.addEventListener("click", () => {
    const wasCreateMode = mode === "create";
    hide();
    if (wasCreateMode) window.krokiEditorRail?.resetCizimAraci?.();
  });
  bindHoldAction(controls.sizeMinus, () => changeSize(-1));
  bindHoldAction(controls.sizePlus, () => changeSize(1));
  bindHoldAction(controls.opacityMinus, () => changeOpacity(-0.05));
  bindHoldAction(controls.opacityPlus, () => changeOpacity(0.05));
  controls.align?.addEventListener("click", () => {
    nextAlign();
    sync();
  });
  controls.bold?.addEventListener("click", () => {
    state.bold = !state.bold;
    sync();
  });
  controls.italic?.addEventListener("click", () => {
    state.italic = !state.italic;
    sync();
  });
  controls.underline?.addEventListener("click", () => {
    state.underline = !state.underline;
    sync();
  });
  controls.color?.addEventListener("click", () => controls.colorInput?.click());
  controls.colorInput?.addEventListener("input", () => {
    state.color = controls.colorInput.value;
    sync();
  });
  controls.input?.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      submitText();
    }
  });

  window.addEventListener("kroki:active-tool-change", (event) => {
    if (event.detail?.tool === "metin") showCreate();
    else hide();
  });

  Kroki.FreeTextComposer = {
    openEdit: showEdit,
    hideEdit() {
      if (mode === "edit") hide();
    }
  };
})();
