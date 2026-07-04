(() => {
  // Deprecated shim: index.html now loads editor-main-menu-pro.js.
  return;

  const Kroki = window.Kroki = window.Kroki || {};
  const manager = Kroki.EditorObjectManager;
  const serializer = Kroki.DocumentSerializer;
  if (!manager || !serializer) return;

  const STORAGE_RECENTS = "krokiPro.recentDocuments.v1";
  const STORAGE_TEMPLATES = "krokiPro.templates.v1";
  const STORAGE_LAST = "krokiPro.lastDocument.v1";
  const MAX_RECENTS = 12;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const EXPORT_AREA_PADDING = 24;

  const homeScreen = document.querySelector("#home");
  const editorScreen = document.querySelector("#editor");
  const canvas = manager.canvas || document.querySelector("#editorCanvas");
  const recentList = document.querySelector("#sonKrokilerListesi");
  const templateList = document.querySelector("#sablonlarimListesi");
  const menu = document.querySelector("#railMenuAna");
  const newSketchButton = document.querySelector("#btnYeniKroki");
  let currentDocumentId = "";

  function nowStamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("");
  }

  function displayDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function documentTitle(prefix = "Kroki") {
    return `${prefix} ${displayDate(new Date().toISOString())}`;
  }

  function storageRead(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function storageWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      window.alert("Kayıt için tarayıcı depolama alanı yeterli değil.");
      return false;
    }
  }

  function saveLastDocument(doc) {
    try {
      localStorage.setItem(STORAGE_LAST, JSON.stringify(doc));
    } catch {
      // Recent/template save already reports quota problems; last snapshot is best effort.
    }
  }

  function documentObjectCount(doc) {
    return Array.isArray(doc?.objects) ? doc.objects.length : 0;
  }

  function hasContent() {
    return (manager.getAll?.() || []).length > 0;
  }

  function captureDocument() {
    return serializer.exportDocument();
  }

  function closeHomeModals() {
    document.querySelectorAll(".modal-panel").forEach((modal) => modal.classList.add("gizli"));
  }

  function showHome() {
    closeHomeModals();
    window.krokiEditorRail?.closeRailMenus?.();
    editorScreen?.classList.add("gizli");
    homeScreen?.classList.remove("gizli");
    renderStoredLists();
  }

  function showEditor() {
    closeHomeModals();
    homeScreen?.classList.add("gizli");
    editorScreen?.classList.remove("gizli");
  }

  function resetCanvasView() {
    const viewBox = "0 0 1200 800";
    canvas?.setAttribute("viewBox", viewBox);
    canvas?.dispatchEvent(new CustomEvent("kroki:viewboxchange", {
      bubbles: true,
      detail: { x: 0, y: 0, width: 1200, height: 800 }
    }));
  }

  function resetDocument() {
    window.krokiEditorRail?.resetCizimAraci?.();
    Kroki.SelectionManager?.clear?.({ silent: true });
    Kroki.MultiSelectManager?.clear?.({ silent: true });
    manager.clear?.({ skipHistory: true });
    Kroki.RoadIntersectionEngine?.importState?.(null, { skipRefresh: true });
    Kroki.RoadIntersectionEngine?.scheduleRefresh?.();
    resetCanvasView();
    Kroki.HistoryManager?.clear?.();
    Kroki.StyleManager?.syncControls?.();
    currentDocumentId = "";
  }

  function confirmDiscard(message = "Mevcut kroki kaydedilmeden kapanacak. Devam edilsin mi?") {
    return !hasContent() || window.confirm(message);
  }

  function entryId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function saveRecent(options = {}) {
    const doc = captureDocument();
    const now = new Date().toISOString();
    const recents = storageRead(STORAGE_RECENTS);
    const existingIndex = currentDocumentId
      ? recents.findIndex((entry) => entry.id === currentDocumentId)
      : -1;
    const existing = existingIndex >= 0 ? recents[existingIndex] : null;
    const entry = {
      id: existing?.id || entryId("doc"),
      name: existing?.name || options.name || documentTitle("Kroki"),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      document: doc
    };
    const next = [entry, ...recents.filter((item) => item.id !== entry.id)].slice(0, MAX_RECENTS);
    if (!storageWrite(STORAGE_RECENTS, next)) return null;
    currentDocumentId = entry.id;
    saveLastDocument(doc);
    renderStoredLists();
    return entry;
  }

  function saveTemplate() {
    if (!hasContent()) {
      window.alert("Boş kroki şablon olarak kaydedilmedi.");
      return null;
    }
    const now = new Date().toISOString();
    const entry = {
      id: entryId("tpl"),
      name: documentTitle("Şablon"),
      createdAt: now,
      updatedAt: now,
      document: captureDocument()
    };
    const templates = [entry, ...storageRead(STORAGE_TEMPLATES)];
    if (!storageWrite(STORAGE_TEMPLATES, templates)) return null;
    renderStoredLists();
    return entry;
  }

  function loadDocument(doc, options = {}) {
    const result = serializer.importDocument(doc, { skipHistory: true });
    if (!result?.ok) {
      window.alert("Kroki açılamadı.");
      return false;
    }
    currentDocumentId = options.currentDocumentId || "";
    showEditor();
    Kroki.HistoryManager?.clear?.();
    Kroki.StyleManager?.syncControls?.();
    if (options.fitToContent) window.krokiEditorCamera?.fitToContent?.();
    else dispatchCurrentViewBoxChange();
    return true;
  }

  function openRecent(id) {
    const entry = storageRead(STORAGE_RECENTS).find((item) => item.id === id);
    if (!entry) return;
    if (!confirmDiscard()) return;
    loadDocument(entry.document, { currentDocumentId: entry.id });
  }

  function openTemplate(id) {
    const entry = storageRead(STORAGE_TEMPLATES).find((item) => item.id === id);
    if (!entry) return;
    if (!confirmDiscard()) return;
    loadDocument(entry.document, { currentDocumentId: "", fitToContent: true });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  function parseViewBox(value) {
    const parts = String(value || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
    return { x: 0, y: 0, width: 1200, height: 800 };
  }

  function viewBoxString(viewBox) {
    return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  }

  function currentViewBox() {
    return parseViewBox(canvas?.getAttribute("viewBox"));
  }

  function dispatchCurrentViewBoxChange() {
    const viewBox = currentViewBox();
    canvas?.dispatchEvent(new CustomEvent("kroki:viewboxchange", {
      bubbles: true,
      detail: viewBox
    }));
  }

  function expandBounds(bounds, amount) {
    return {
      x: bounds.x - amount,
      y: bounds.y - amount,
      width: bounds.width + amount * 2,
      height: bounds.height + amount * 2
    };
  }

  function contentViewBox() {
    const bounds = manager.getContentBounds?.();
    if (!bounds) return null;
    return expandBounds(bounds, EXPORT_AREA_PADDING);
  }

  function cssTextForExport() {
    const chunks = [];
    Array.from(document.styleSheets || []).forEach((sheet) => {
      try {
        chunks.push(Array.from(sheet.cssRules || []).map((rule) => rule.cssText).join("\n"));
      } catch {
        // Cross-origin stylesheets are ignored; app styles are same-origin.
      }
    });
    if (chunks.length) return chunks.join("\n");
    return [
      ".editor-line-label,.editor-circle-label-text,.editor-ellipse-label-text,.editor-rectangle-label-text,.editor-vehicle-label{font-family:Roboto,Arial,sans-serif;font-weight:800;paint-order:stroke fill;stroke:#fff;stroke-linejoin:round;stroke-width:4px;}",
      ".editor-text,.editor-callout-text{font-family:Roboto,Arial,sans-serif;}",
      ".editor-road-edge,.editor-road-channel-line,.editor-road-marking,.editor-object-selection{vector-effect:non-scaling-stroke;}"
    ].join("\n");
  }

  function exportedSvgString(viewBox, options = {}) {
    const clone = canvas.cloneNode(true);
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone.setAttribute("viewBox", viewBoxString(viewBox));
    clone.setAttribute("width", String(Math.max(1, Math.round(viewBox.width))));
    clone.setAttribute("height", String(Math.max(1, Math.round(viewBox.height))));
    clone.removeAttribute("class");
    clone.removeAttribute("aria-label");
    clone.querySelector("#editorEditLayer")?.remove();

    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = cssTextForExport();
    clone.insertBefore(style, clone.firstChild);

    if (options.background !== false) {
      const background = document.createElementNS(SVG_NS, "rect");
      background.setAttribute("x", String(viewBox.x));
      background.setAttribute("y", String(viewBox.y));
      background.setAttribute("width", String(viewBox.width));
      background.setAttribute("height", String(viewBox.height));
      background.setAttribute("fill", "#ffffff");
      clone.insertBefore(background, style.nextSibling);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  }

  function exportSvg() {
    const viewBox = currentViewBox();
    const svg = exportedSvgString(viewBox);
    downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `kroki-${nowStamp()}.svg`);
  }

  function pngSizeForViewBox(viewBox, options = {}) {
    if (options.useViewportSize) {
      const rect = canvas?.getBoundingClientRect?.();
      const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      return {
        width: Math.max(1, Math.round((rect?.width || viewBox.width) * ratio)),
        height: Math.max(1, Math.round((rect?.height || viewBox.height) * ratio))
      };
    }

    const maxDim = 4096;
    const minDim = 640;
    const largest = Math.max(viewBox.width, viewBox.height);
    const scale = Math.min(maxDim / largest, Math.max(1, minDim / largest, 2));
    return {
      width: Math.max(1, Math.round(viewBox.width * scale)),
      height: Math.max(1, Math.round(viewBox.height * scale))
    };
  }

  function exportPng(viewBox, filename, options = {}) {
    const svg = exportedSvgString(viewBox);
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    const size = pngSizeForViewBox(viewBox, options);
    image.onload = () => {
      const pngCanvas = document.createElement("canvas");
      pngCanvas.width = size.width;
      pngCanvas.height = size.height;
      const context = pngCanvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(image, 0, 0, size.width, size.height);
      pngCanvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) downloadBlob(blob, filename);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      window.alert("Resim oluşturulamadı.");
    };
    image.src = url;
  }

  function exportCurrentPng() {
    exportPng(currentViewBox(), `kroki-${nowStamp()}.png`, { useViewportSize: true });
  }

  function exportAreaPng() {
    const viewBox = contentViewBox();
    if (!viewBox) {
      window.alert("Kaydedilecek alan yok.");
      return;
    }
    exportPng(viewBox, `kroki-alan-${nowStamp()}.png`);
  }

  function renderEntryButton(entry, action, prefix) {
    const button = document.createElement("button");
    button.className = "stored-doc-card";
    button.type = "button";
    button.dataset[action] = entry.id;

    const title = document.createElement("strong");
    title.textContent = entry.name || prefix;

    const meta = document.createElement("span");
    meta.textContent = `${documentObjectCount(entry.document)} nesne`;

    const date = document.createElement("small");
    date.textContent = displayDate(entry.updatedAt || entry.createdAt);

    button.append(title, meta, date);
    return button;
  }

  function renderList(target, entries, options) {
    if (!target) return;
    target.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.textContent = options.emptyText;
      target.append(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "stored-doc-list";
    entries.forEach((entry) => list.append(renderEntryButton(entry, options.action, options.prefix)));
    target.append(list);
  }

  function renderStoredLists() {
    renderList(recentList, storageRead(STORAGE_RECENTS), {
      action: "openRecent",
      prefix: "Kroki",
      emptyText: "Henüz kayıt yok."
    });
    renderList(templateList, storageRead(STORAGE_TEMPLATES), {
      action: "openTemplate",
      prefix: "Şablon",
      emptyText: "(Boş) - Şablon kaydı yok."
    });
  }

  function saveAndNotify() {
    const entry = saveRecent();
    if (entry) window.alert("Kroki kaydedildi.");
  }

  function saveAndExit() {
    const entry = saveRecent();
    if (!entry) return;
    resetDocument();
    showHome();
  }

  function exitWithoutSave() {
    if (!confirmDiscard()) return;
    resetDocument();
    showHome();
  }

  function newDocument() {
    if (!confirmDiscard("Mevcut kroki kapatılıp yeni boş kroki açılacak. Devam edilsin mi?")) return;
    resetDocument();
    showEditor();
  }

  function handleMenuAction(action) {
    if (action === "export-png") exportCurrentPng();
    else if (action === "export-area-png") exportAreaPng();
    else if (action === "save") saveAndNotify();
    else if (action === "save-exit") saveAndExit();
    else if (action === "exit-nosave") exitWithoutSave();
    else if (action === "save-template") {
      if (saveTemplate()) window.alert("Şablon kaydedildi.");
    } else if (action === "export-svg") exportSvg();
    else if (action === "new-document") newDocument();
  }

  menu?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-menu-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    window.krokiEditorRail?.closeRailMenus?.();
    handleMenuAction(button.dataset.menuAction);
  });

  newSketchButton?.addEventListener("click", (event) => {
    if (!confirmDiscard("Mevcut kroki kapatılıp yeni boş kroki açılacak. Devam edilsin mi?")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showHome();
      return;
    }
    resetDocument();
  }, true);

  recentList?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-open-recent]");
    if (button) openRecent(button.dataset.openRecent);
  });

  templateList?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-open-template]");
    if (button) openTemplate(button.dataset.openTemplate);
  });

  window.KrokiMainMenu = {
    saveRecent,
    saveTemplate,
    renderStoredLists,
    resetDocument
  };

  renderStoredLists();
})();
