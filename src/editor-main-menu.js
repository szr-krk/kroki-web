(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const manager = Kroki.EditorObjectManager;
  const serializer = Kroki.DocumentSerializer;
  const documentStorage = Kroki.DocumentStorage;
  if (!manager || !serializer || !documentStorage) return;
  const uiPx = Kroki.uiPx || ((value) => Number(value) || 0);

  const SVG_NS = "http://www.w3.org/2000/svg";
  const SVG_SIGNATURE = "KROKI_PRO_DOCUMENT_V1";
  const EXPORT_PADDING = window.krokiEditorFraming?.CONTENT_PADDING_WORLD ?? 25;
  const PNG_MAX_BYTES = 995000;
  const PNG_SCALE_SEARCH_PASSES = 7;
  const DEFAULT_VIEWBOX = { x: 0, y: 0, width: 1200, height: 800 };
  const DOCUMENT_GEOMETRY_STROKE_SELECTOR = [
    "#editorObjects path",
    "#editorObjects line",
    "#editorObjects polyline",
    "#editorObjects polygon",
    "#editorObjects circle",
    "#editorObjects ellipse",
    "#editorObjects rect",
    "#editorObjects use"
  ].join(",");
  const SIGN_FONT_FAMILY = "KrokiSignNarrow";
  const EXPORT_SIGN_FONT_FAMILY = "KrokiSignNarrowEmbedded";
  const SIGN_FONT_URL = new URL("src/arial-narrow.ttf", document.baseURI).href;
  const SIGN_FONT_FACE_PATTERN = /@font-face\s*\{[^{}]*font-family:\s*["']?KrokiSignNarrow["']?;?[^{}]*\}/gi;

  const homeScreen = document.querySelector("#home");
  const editorScreen = document.querySelector("#editor");
  const canvas = manager.canvas || document.querySelector("#editorCanvas");
  const recentList = document.querySelector("#sonKrokilerListesi");
  const templateList = document.querySelector("#sablonlarimListesi");
  const menu = document.querySelector("#railMenuAna");
  const newSketchButton = document.querySelector("#btnYeniKroki");
  let currentDocumentId = "";
  let lastSavedSnapshot = "";
  let previewLayer = null;
  let areaTool = null;
  let busyLayer = null;
  let storedListRenderVersion = 0;
  let exportSignFontDataUrlPromise = null;

  function dialog() {
    return window.KrokiDialog || Kroki.Dialog;
  }

  function notify(message, title = "Kroki Pro") {
    const api = dialog();
    return api?.toast?.(message, title) || api?.alert?.(message, title) || Promise.resolve();
  }

  function nextPaint() {
    return new Promise((resolve) => {
      const raf = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
      raf(() => raf(resolve));
    });
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(reader.error || new Error("Font verisi okunamadi.")), { once: true });
      reader.readAsDataURL(blob);
    });
  }

  function loadExportSignFontDataUrl() {
    if (!exportSignFontDataUrlPromise) {
      exportSignFontDataUrlPromise = fetch(SIGN_FONT_URL, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`Font dosyasi okunamadi (${response.status}).`);
          return response.arrayBuffer();
        })
        .then((buffer) => blobDataUrl(new Blob([buffer], { type: "font/ttf" })))
        .then((dataUrl) => {
          if (!dataUrl.startsWith("data:font/ttf;base64,")) throw new Error("Font verisi gecersiz.");
          return dataUrl;
        })
        .catch((error) => {
          exportSignFontDataUrlPromise = null;
          throw error;
        });
    }
    return exportSignFontDataUrlPromise;
  }

  async function prepareExportSignFont() {
    if (document.fonts?.load) {
      await document.fonts.load(`400 16px "${SIGN_FONT_FAMILY}"`);
      await document.fonts.ready;
      if (document.fonts.check && !document.fonts.check(`400 16px "${SIGN_FONT_FAMILY}"`)) {
        throw new Error("Canli kroki fontu yuklenemedi.");
      }
    }
    return loadExportSignFontDataUrl();
  }

  function hideBusy() {
    busyLayer?.remove?.();
    busyLayer = null;
  }

  function showBusy(message = "Resim hazırlanıyor...") {
    hideBusy();
    const layer = document.createElement("div");
    layer.className = "kroki-busy-layer";
    layer.setAttribute("role", "status");
    layer.setAttribute("aria-live", "polite");

    const card = document.createElement("div");
    card.className = "kroki-busy-card";

    const spinner = document.createElement("span");
    spinner.className = "kroki-busy-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = message;

    card.append(spinner, text);
    layer.append(card);
    (document.querySelector("#uygulama") || document.body || document.documentElement).append(layer);
    busyLayer = layer;
  }

  function ask(message, title = "Onay") {
    return dialog()?.confirm?.(message, title) || Promise.resolve(true);
  }

  function choose(options) {
    return dialog()?.choice?.(options) || Promise.resolve(null);
  }

  function askText(options) {
    return dialog()?.prompt?.(options) || Promise.resolve(options?.value || "");
  }

  function nowStamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "_",
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

  function relativeDate(value) {
    const date = value ? new Date(value) : new Date();
    const time = date.getTime();
    if (Number.isNaN(time)) return "";
    const diff = Math.max(0, Date.now() - time);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < 45 * 1000) return "az önce";
    if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} dk önce`;
    if (diff < day) return `${Math.max(1, Math.round(diff / hour))} saat önce`;
    if (diff < 2 * day) return "dün";
    if (diff < 7 * day) return `${Math.round(diff / day)} gün önce`;
    return displayDate(date);
  }

  function documentTitle(prefix = "Kroki") {
    return `${prefix} ${displayDate(new Date().toISOString())}`;
  }

  function normalizedEntryKind(kind) {
    return kind === "template" ? "template" : "recent";
  }

  function entryPrefix(kind) {
    return kind === "template" ? "Şablon" : "Kroki";
  }

  function hasContent() {
    return (manager.getAll?.() || []).length > 0 || Boolean(Kroki.PhotoBackgroundManager?.has?.());
  }

  function captureDocument(options = {}) {
    return serializer.exportDocument(options);
  }

  function documentSnapshot() {
    try {
      return JSON.stringify(captureDocument({ stableTimestamps: true }));
    } catch {
      return null;
    }
  }

  function markDocumentSaved() {
    lastSavedSnapshot = documentSnapshot() || "";
  }

  function hasUnsavedChanges() {
    if (!hasContent()) return false;
    const snapshot = documentSnapshot();
    return !snapshot || snapshot !== lastSavedSnapshot;
  }

  function closeHomeModals() {
    document.querySelectorAll(".modal-panel").forEach((modal) => modal.classList.add("gizli"));
  }

  function showHome() {
    closeHomeModals();
    closePreview();
    stopAreaTool();
    window.krokiEditorRail?.closeRailMenus?.();
    editorScreen?.classList.add("gizli");
    homeScreen?.classList.remove("gizli");
    void renderStoredLists();
  }

  function showEditor() {
    closeHomeModals();
    closePreview();
    homeScreen?.classList.add("gizli");
    editorScreen?.classList.remove("gizli");
  }

  function resetCanvasView() {
    window.krokiEditorCamera?.resetViewBox?.();
    if (!window.krokiEditorCamera?.resetViewBox) {
      canvas?.setAttribute("viewBox", viewBoxString(DEFAULT_VIEWBOX));
      dispatchViewBoxChange(DEFAULT_VIEWBOX);
    }
  }

  function resetDocument() {
    window.krokiEditorRail?.resetCizimAraci?.();
    Kroki.SelectionManager?.clear?.({ silent: true });
    Kroki.MultiSelectManager?.clear?.({ silent: true });
    manager.clear?.({ skipHistory: true });
    Kroki.PhotoBackgroundManager?.clear?.();
    Kroki.RoadIntersectionEngine?.importState?.(null, { skipRefresh: true });
    Kroki.RoadIntersectionEngine?.scheduleRefresh?.();
    resetCanvasView();
    Kroki.HistoryManager?.clear?.();
    Kroki.StyleManager?.syncControls?.();
    currentDocumentId = "";
    markDocumentSaved();
  }

  async function confirmDiscard(message = "Eski çizimler silinecek. Devam edilsin mi?") {
    return !hasContent() || ask(message, "Onay");
  }

  function entryId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function parseViewBox(value) {
    const parts = String(value || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
    return { ...DEFAULT_VIEWBOX };
  }

  function viewBoxString(viewBox) {
    return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  }

  function currentViewBox() {
    return parseViewBox(canvas?.getAttribute("viewBox"));
  }

  function dispatchViewBoxChange(viewBox = currentViewBox()) {
    canvas?.dispatchEvent(new CustomEvent("kroki:viewboxchange", {
      bubbles: true,
      detail: viewBox
    }));
  }

  function expandBounds(bounds, amount = EXPORT_PADDING) {
    return window.krokiEditorFraming?.expandBounds?.(bounds, amount) || {
      x: bounds.x - amount,
      y: bounds.y - amount,
      width: bounds.width + amount * 2,
      height: bounds.height + amount * 2
    };
  }

  function contentViewBox(padding = EXPORT_PADDING) {
    const bounds = manager.getContentBounds?.();
    if (!bounds) return null;
    return expandBounds(bounds, padding);
  }

  function cssTextForExport(signFontDataUrl = "") {
    const chunks = [];
    Array.from(document.styleSheets || []).forEach((sheet) => {
      try {
        chunks.push(Array.from(sheet.cssRules || []).map((rule) => rule.cssText).join("\n"));
      } catch {
        // Cross-origin stylesheets are ignored; app styles are same-origin.
      }
    });
    const source = chunks.length ? chunks.join("\n") : [
      ".editor-line-label,.editor-circle-label-text,.editor-ellipse-label-text,.editor-rectangle-label-text{font-family:Roboto,Arial,sans-serif;font-weight:800;paint-order:stroke fill;stroke-linejoin:round;stroke-width:.18em;}",
      ".editor-vehicle-label{font-family:Roboto,sans-serif;font-weight:400;paint-order:stroke fill;stroke:#fff;stroke-linejoin:round;stroke-width:.16em;}",
      ".editor-text,.editor-callout-text{font-family:Roboto,Arial,sans-serif;}",
      "#editorObjects path,#editorObjects line,#editorObjects polyline,#editorObjects polygon,#editorObjects circle,#editorObjects ellipse,#editorObjects rect,#editorObjects use{vector-effect:none;}",
      ".editor-object-selection{vector-effect:non-scaling-stroke;}"
    ].join("\n");
    const withoutLiveSignFont = source.replace(SIGN_FONT_FACE_PATTERN, "");
    if (!signFontDataUrl) return withoutLiveSignFont;
    const exportCss = withoutLiveSignFont.replace(/\bKrokiSignNarrow\b/g, EXPORT_SIGN_FONT_FAMILY);
    return `${exportCss}\n${embeddedSignFontFaceCss(signFontDataUrl)}`;
  }

  function embeddedSignFontFaceCss(signFontDataUrl) {
    return `@font-face{font-family:"${EXPORT_SIGN_FONT_FAMILY}";src:url("${signFontDataUrl}") format("truetype");}`;
  }

  function styleTextWithVectorEffect(styleText, value) {
    const declaration = `vector-effect: ${value};`;
    const text = String(styleText || "").trim();
    if (!text) return declaration;
    if (/vector-effect\s*:/i.test(text)) {
      return text.replace(/vector-effect\s*:\s*[^;]+;?/i, declaration);
    }
    return `${text.replace(/;?\s*$/, ";")} ${declaration}`;
  }

  function setInlineVectorEffect(node, value) {
    node.setAttribute("vector-effect", value);
    node.setAttribute("style", styleTextWithVectorEffect(node.getAttribute("style"), value));
    node.style?.setProperty?.("vector-effect", value);
  }

  function normalizeDocumentStrokeScaling(svgElement) {
    svgElement?.querySelectorAll?.(DOCUMENT_GEOMETRY_STROKE_SELECTOR).forEach((node) => {
      setInlineVectorEffect(node, "none");
    });
  }

  function containsSignFont(svgElement) {
    return Array.from(svgElement?.querySelectorAll?.("[font-family],[style],style") || []).some((node) => {
      const value = String(node.getAttribute?.("font-family") || node.getAttribute?.("style") || node.textContent || "");
      return /\bKrokiSignNarrow\b/.test(value);
    });
  }

  function normalizeExportFontFamilies(svgElement) {
    svgElement?.querySelectorAll?.("[font-family],[style]").forEach((node) => {
      const fontFamily = node.getAttribute("font-family");
      if (/\bKrokiSignNarrow\b/.test(fontFamily || "")) {
        node.setAttribute("font-family", fontFamily.replace(/\bKrokiSignNarrow\b/g, EXPORT_SIGN_FONT_FAMILY));
      }
      const styleText = node.getAttribute("style");
      if (/\bKrokiSignNarrow\b/.test(styleText || "")) {
        node.setAttribute("style", styleText.replace(/\bKrokiSignNarrow\b/g, EXPORT_SIGN_FONT_FAMILY));
      }
    });
    svgElement?.querySelectorAll?.("style").forEach((styleElement) => {
      if (/\bKrokiSignNarrow\b/.test(styleElement.textContent || "")) {
        styleElement.textContent = styleElement.textContent.replace(/\bKrokiSignNarrow\b/g, EXPORT_SIGN_FONT_FAMILY);
      }
    });
  }

  async function exportedSvgString(viewBox, options = {}) {
    const clone = canvas.cloneNode(true);
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clone.setAttribute("viewBox", viewBoxString(viewBox));
    clone.setAttribute("width", String(Math.max(1, Math.round(viewBox.width))));
    clone.setAttribute("height", String(Math.max(1, Math.round(viewBox.height))));
    clone.setAttribute("data-kroki-pro-signature", SVG_SIGNATURE);
    clone.setAttribute("data-kroki-pro-version", "1");
    clone.removeAttribute("class");
    clone.removeAttribute("aria-label");
    clone.querySelector("#editorEditLayer")?.remove();
    normalizeDocumentStrokeScaling(clone);

    const signFontDataUrl = containsSignFont(clone) ? await prepareExportSignFont() : "";
    if (signFontDataUrl) normalizeExportFontFamilies(clone);

    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = cssTextForExport(signFontDataUrl);
    clone.insertBefore(style, clone.firstChild);

    if (options.includeMetadata) {
      const metadata = document.createElementNS(SVG_NS, "metadata");
      metadata.id = "krokiProDocument";
      metadata.setAttribute("data-kroki-pro-signature", SVG_SIGNATURE);
      const documentData = options.document || captureDocument();
      const metadataDocument = documentData?.photoBackground
        ? {
          ...documentData,
          photoBackground: {
            ...documentData.photoBackground,
            dataUrl: ""
          }
        }
        : documentData;
      metadata.textContent = JSON.stringify({
        signature: SVG_SIGNATURE,
        app: "Kroki Pro",
        exportedAt: new Date().toISOString(),
        document: metadataDocument
      });
      clone.insertBefore(metadata, style.nextSibling);
    }

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

  async function previewSnapshot() {
    const viewBox = contentViewBox(EXPORT_PADDING) || currentViewBox();
    return {
      viewBox: viewBoxString(viewBox),
      svg: await exportedSvgString(viewBox, { background: true, includeMetadata: false })
    };
  }

  async function previewSvgForDisplay(svg) {
    const source = String(svg || "");
    let signFontRequired = false;
    try {
      const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
      if (parsed.querySelector("parsererror")) return source;
      const svgElement = parsed.documentElement?.localName?.toLowerCase?.() === "svg"
        ? parsed.documentElement
        : parsed.querySelector("svg");
      if (!svgElement) return source;
      const originalWidth = svgElement.getAttribute("width");
      const originalHeight = svgElement.getAttribute("height");
      if (originalWidth && !svgElement.hasAttribute("data-original-width")) {
        svgElement.setAttribute("data-original-width", originalWidth);
      }
      if (originalHeight && !svgElement.hasAttribute("data-original-height")) {
        svgElement.setAttribute("data-original-height", originalHeight);
      }
      svgElement.setAttribute("width", "100%");
      svgElement.setAttribute("height", "100%");
      if (!svgElement.hasAttribute("preserveAspectRatio")) {
        svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
      normalizeDocumentStrokeScaling(svgElement);
      signFontRequired = containsSignFont(svgElement);
      if (signFontRequired) {
        const signFontDataUrl = await prepareExportSignFont();
        svgElement.querySelectorAll("style").forEach((styleElement) => {
          styleElement.textContent = String(styleElement.textContent || "").replace(SIGN_FONT_FACE_PATTERN, "");
        });
        normalizeExportFontFamilies(svgElement);
        const fontStyle = parsed.createElementNS(SVG_NS, "style");
        fontStyle.textContent = embeddedSignFontFaceCss(signFontDataUrl);
        svgElement.insertBefore(fontStyle, svgElement.firstChild);
      }
      return new XMLSerializer().serializeToString(svgElement);
    } catch (error) {
      if (signFontRequired) throw error;
      return source;
    }
  }

  async function svgDataUrl(svg, options = {}) {
    const output = options.fitPreview ? await previewSvgForDisplay(svg, options) : String(svg || "");
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(output)}`;
  }

  async function saveRecent(options = {}) {
    try {
      const doc = captureDocument();
      const now = new Date().toISOString();
      const existing = currentDocumentId
        ? await documentStorage.get("recent", currentDocumentId)
        : null;
      const preview = await previewSnapshot();
      const entry = {
        id: existing?.id || entryId("doc"),
        name: existing?.name || options.name || documentTitle("Kroki"),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        document: doc,
        previewSvg: preview.svg,
        previewViewBox: preview.viewBox
      };
      await documentStorage.put("recent", entry);
      currentDocumentId = entry.id;
      markDocumentSaved();
      await renderStoredLists();
      return entry;
    } catch (error) {
      console.warn("Kroki IndexedDB save failed", error);
      await notify("Kroki cihaz depolamasına kaydedilemedi.");
      return null;
    }
  }

  async function saveTemplate(options = {}) {
    if (!hasContent()) {
      await notify("Boş kroki şablon olarak kaydedilmedi.");
      return null;
    }
    try {
      const now = new Date().toISOString();
      const preview = await previewSnapshot();
      const entry = {
        id: entryId("tpl"),
        name: options.name || documentTitle("Şablon"),
        createdAt: now,
        updatedAt: now,
        document: captureDocument(),
        previewSvg: preview.svg,
        previewViewBox: preview.viewBox
      };
      await documentStorage.put("template", entry);
      await renderStoredLists();
      return entry;
    } catch (error) {
      console.warn("Template IndexedDB save failed", error);
      await notify("Şablon cihaz depolamasına kaydedilemedi.");
      return null;
    }
  }

  function loadDocument(doc, options = {}) {
    const result = serializer.importDocument(doc, { skipHistory: true });
    if (!result?.ok) {
      void notify("Kroki açılamadı.");
      return false;
    }
    currentDocumentId = options.currentDocumentId || "";
    showEditor();
    Kroki.HistoryManager?.clear?.();
    Kroki.StyleManager?.syncControls?.();
    if (options.fitToContent) window.krokiEditorCamera?.fitToContent?.();
    else dispatchViewBoxChange();
    if (options.markSaved === false) lastSavedSnapshot = "";
    else markDocumentSaved();
    return true;
  }

  async function findEntry(kind, id) {
    try {
      return await documentStorage.get(normalizedEntryKind(kind), id);
    } catch (error) {
      console.warn("Stored document read failed", error);
      await notify("Kayıt cihaz depolamasından okunamadı.");
      return null;
    }
  }

  async function deleteEntry(kind, id) {
    try {
      await documentStorage.remove(normalizedEntryKind(kind), id);
      if (kind === "recent" && currentDocumentId === id) currentDocumentId = "";
      await renderStoredLists();
      return true;
    } catch (error) {
      console.warn("Stored document delete failed", error);
      await notify("Kayıt cihaz depolamasından silinemedi.");
      return false;
    }
  }

  function currentFullscreenElement() {
    return document.fullscreenElement
      || document.webkitFullscreenElement
      || document.mozFullScreenElement
      || document.msFullscreenElement
      || null;
  }

  function exitAppFullscreen() {
    const exit = document.exitFullscreen
      || document.webkitExitFullscreen
      || document.mozCancelFullScreen
      || document.msExitFullscreen;
    if (!exit) return null;
    return exit.call(document);
  }

  function pulseFullscreenSync(ms = 12000) {
    [0, 80, 250, 500, 900, 1500, 2500, 4000, 7000, ms]
      .filter((delay, index, items) => delay <= ms && items.indexOf(delay) === index)
      .forEach((delay) => {
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("kroki:fullscreen-state-sync")), delay);
      });
  }

  function prepareForNativeDownload() {
    if (!currentFullscreenElement()) {
      pulseFullscreenSync(3000);
      return;
    }
    window.dispatchEvent(new CustomEvent("kroki:fullscreen-force-off", { detail: { ms: 15000 } }));
    try {
      const result = exitAppFullscreen();
      if (result?.catch) result.catch(() => {});
    } catch {
      // Browser download prompts can break fullscreen asynchronously; UI sync handles the visible state.
    }
    pulseFullscreenSync(15000);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    prepareForNativeDownload();
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  async function exportSvg() {
    if (!hasContent()) {
      void notify("Kaydedilecek kroki yok.");
      return;
    }
    try {
      const viewBox = contentViewBox(EXPORT_PADDING) || currentViewBox();
      const svg = await exportedSvgString(viewBox, { includeMetadata: true, document: captureDocument() });
      downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `kroki_${nowStamp()}.svg`);
    } catch (error) {
      console.warn("Kroki SVG export failed", error);
      await notify("Yazı tipi yüklenemedi. Farklı font kullanan bir SVG oluşturulmadı.");
    }
  }

  function pngSizeForViewBox(viewBox) {
    const maxDim = 4096;
    const minDim = 900;
    const largest = Math.max(viewBox.width, viewBox.height, 1);
    const scale = Math.min(maxDim / largest, Math.max(1, minDim / largest, 2));
    return {
      width: Math.max(1, Math.round(viewBox.width * scale)),
      height: Math.max(1, Math.round(viewBox.height * scale))
    };
  }

  function canvasPngBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
  }

  function scaledCanvas(source, scale) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function encodePngAtScale(source, scale) {
    const canvas = scale >= 0.999999 ? source : scaledCanvas(source, scale);
    if (!canvas) return null;
    const blob = await canvasPngBlob(canvas);
    return blob ? {
      blob,
      scale,
      width: canvas.width,
      height: canvas.height
    } : null;
  }

  async function pngWithinSizeLimit(source, maxBytes = PNG_MAX_BYTES) {
    const original = await encodePngAtScale(source, 1);
    if (!original || original.blob.size <= maxBytes) return original;

    const minimumScale = 1 / Math.max(source.width, source.height, 1);
    let tooLargeScale = 1;
    let scale = Math.max(
      minimumScale,
      Math.min(0.9, Math.sqrt(maxBytes / original.blob.size) * 0.96)
    );
    let best = null;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = await encodePngAtScale(source, scale);
      if (!candidate) return null;
      if (candidate.blob.size <= maxBytes) {
        best = candidate;
        break;
      }
      tooLargeScale = scale;
      if (candidate.width === 1 && candidate.height === 1) break;
      const nextFactor = Math.max(
        0.1,
        Math.min(0.9, Math.sqrt(maxBytes / candidate.blob.size) * 0.96)
      );
      const nextScale = Math.max(minimumScale, scale * nextFactor);
      if (nextScale >= scale || (
        Math.round(source.width * nextScale) === candidate.width
        && Math.round(source.height * nextScale) === candidate.height
      )) {
        scale = Math.max(minimumScale, scale * 0.75);
      } else {
        scale = nextScale;
      }
    }

    if (!best) {
      best = await encodePngAtScale(source, minimumScale);
      if (!best || best.blob.size > maxBytes) {
        const onePixel = document.createElement("canvas");
        onePixel.width = 1;
        onePixel.height = 1;
        const context = onePixel.getContext("2d");
        if (!context) return null;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 1, 1);
        const blob = await canvasPngBlob(onePixel);
        return blob ? { blob, scale: 0, width: 1, height: 1 } : null;
      }
    }

    let fitsScale = best.scale;
    for (let pass = 0; pass < PNG_SCALE_SEARCH_PASSES; pass += 1) {
      const candidateScale = (fitsScale + tooLargeScale) / 2;
      const candidateWidth = Math.max(1, Math.round(source.width * candidateScale));
      const candidateHeight = Math.max(1, Math.round(source.height * candidateScale));
      if (candidateWidth === best.width && candidateHeight === best.height) break;
      const candidate = await encodePngAtScale(source, candidateScale);
      if (!candidate) break;
      if (candidate.blob.size <= maxBytes) {
        best = candidate;
        fitsScale = candidateScale;
      } else {
        tooLargeScale = candidateScale;
      }
    }
    return best;
  }

  async function exportPng(viewBox, filename, options = {}) {
    let svg = "";
    try {
      svg = await exportedSvgString(viewBox, { background: true, includeMetadata: false });
    } catch (error) {
      console.warn("Kroki PNG export font preparation failed", error);
      await notify("Yazı tipi yüklenemedi. Farklı font kullanan bir resim oluşturulmadı.");
      return false;
    }
    return new Promise((resolve) => {
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const image = new Image();
      const size = pngSizeForViewBox(viewBox);
      const padding = Math.max(0, Number(options.outputPaddingPx) || 0);
      image.onload = async () => {
        const pngCanvas = document.createElement("canvas");
        pngCanvas.width = size.width + padding * 2;
        pngCanvas.height = size.height + padding * 2;
        const context = pngCanvas.getContext("2d");
        if (!context) {
          URL.revokeObjectURL(url);
          void notify("Resim oluşturulamadı.");
          resolve(false);
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pngCanvas.width, pngCanvas.height);
        context.drawImage(image, padding, padding, size.width, size.height);
        try {
          const output = await pngWithinSizeLimit(pngCanvas);
          URL.revokeObjectURL(url);
          if (!output?.blob) {
            void notify("Resim oluşturulamadı.");
            resolve(false);
            return;
          }
          downloadBlob(output.blob, filename);
          resolve(true);
        } catch {
          URL.revokeObjectURL(url);
          void notify("Resim oluşturulamadı.");
          resolve(false);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        void notify("Resim oluşturulamadı.");
        resolve(false);
      };
      image.src = url;
    });
  }

  async function exportFullPngAndExit() {
    if (!hasContent()) {
      await notify("Kaydedilecek kroki yok.");
      return;
    }
    showBusy("Resim hazırlanıyor...");
    await nextPaint();
    try {
      window.krokiEditorCamera?.fitToContent?.();
      const entry = await saveRecent();
      if (!entry) return;
      const viewBox = contentViewBox(EXPORT_PADDING);
      if (!viewBox) {
        await notify("Kaydedilecek alan yok.");
        return;
      }
      const ok = await exportPng(viewBox, `kroki_${nowStamp()}.png`);
      if (!ok) return;
      resetDocument();
      showHome();
    } finally {
      hideBusy();
    }
  }

  function renderPreviewPlaceholder(target) {
    const placeholder = document.createElement("span");
    placeholder.textContent = "Önizleme";
    target.replaceChildren(placeholder);
  }

  async function renderPreviewInto(target, entry) {
    target.replaceChildren();
    if (entry.previewSvg) {
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      target.append(image);
      try {
        const source = await svgDataUrl(entry.previewSvg, {
          fitPreview: true
        });
        if (image.parentElement === target) image.src = source;
      } catch (error) {
        console.warn("Kayıt önizlemesi hazırlanamadı.", error);
        if (image.parentElement === target) renderPreviewPlaceholder(target);
      }
      return;
    }
    renderPreviewPlaceholder(target);
  }

  function renderEntryButton(entry, options) {
    const button = document.createElement("button");
    button.className = `stored-doc-card is-${options.kind || "entry"}`;
    button.type = "button";
    button.dataset.entryId = entry.id;
    button.dataset.entryKind = options.kind;
    button.title = `${entry.name || options.prefix} - ${displayDate(entry.updatedAt || entry.createdAt)}`;

    const preview = document.createElement("span");
    preview.className = "stored-doc-thumb";
    void renderPreviewInto(preview, entry);

    const meta = document.createElement("span");
    meta.className = "stored-doc-meta";

    const title = document.createElement("strong");
    title.textContent = entry.name || options.prefix;

    const date = document.createElement("small");
    date.className = "stored-doc-date";
    date.textContent = relativeDate(entry.updatedAt || entry.createdAt);

    if (options.kind === "recent") meta.append(date);
    else meta.append(title, date);
    button.append(preview, meta);
    return button;
  }

  function renderList(target, entries, options) {
    if (!target) return;
    target.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "stored-doc-empty";
      empty.textContent = options.emptyText;
      target.append(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "stored-doc-list";
    entries.forEach((entry) => list.append(renderEntryButton(entry, options)));
    target.append(list);
  }

  async function renderStoredLists() {
    const renderVersion = storedListRenderVersion += 1;
    try {
      const [recents, templates] = await Promise.all([
        documentStorage.list("recent", { summary: true }),
        documentStorage.list("template", { summary: true })
      ]);
      if (renderVersion !== storedListRenderVersion) return false;
      renderList(recentList, recents, {
        kind: "recent",
        prefix: "Kroki",
        emptyText: "Henüz kayıt yok."
      });
      renderList(templateList, templates, {
        kind: "template",
        prefix: "Şablon",
        emptyText: "Şablon kaydı yok."
      });
      return true;
    } catch (error) {
      console.warn("Stored document lists failed", error);
      if (renderVersion === storedListRenderVersion) {
        renderList(recentList, [], {
          kind: "recent",
          prefix: "Kroki",
          emptyText: "Kayıtlar okunamadı."
        });
        renderList(templateList, [], {
          kind: "template",
          prefix: "Şablon",
          emptyText: "Şablonlar okunamadı."
        });
      }
      return false;
    }
  }

  function closePreview() {
    previewLayer?.remove();
    previewLayer = null;
  }

  async function openEntryPreview(kind, id) {
    const entry = await findEntry(kind, id);
    if (!entry) return;
    closePreview();

    previewLayer = document.createElement("div");
    previewLayer.className = "kroki-preview-layer";

    const modal = document.createElement("div");
    modal.className = "kroki-preview-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const header = document.createElement("div");
    header.className = "kroki-preview-header";
    const title = document.createElement("strong");
    title.textContent = entry.name || entryPrefix(kind);
    const date = document.createElement("span");
    date.textContent = `${relativeDate(entry.updatedAt || entry.createdAt)} - ${displayDate(entry.updatedAt || entry.createdAt)}`;
    header.append(title, date);

    const body = document.createElement("div");
    body.className = "kroki-preview-body";
    const imageBox = document.createElement("div");
    imageBox.className = "kroki-preview-image";
    void renderPreviewInto(imageBox, entry);
    body.append(imageBox);

    const actions = document.createElement("div");
    actions.className = "kroki-preview-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn-danger";
    deleteButton.dataset.previewAction = "delete";
    deleteButton.textContent = "Sil";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn-ok";
    editButton.dataset.previewAction = "edit";
    editButton.textContent = "Düzenle";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.dataset.previewAction = "cancel";
    cancelButton.textContent = "İptal";
    actions.append(deleteButton, editButton, cancelButton);

    modal.append(header, body, actions);
    previewLayer.append(modal);
    document.body.append(previewLayer);
    cancelButton.focus({ preventScroll: true });

    previewLayer.addEventListener("pointerdown", (event) => {
      if (event.target === previewLayer) closePreview();
    });
    modal.addEventListener("pointerdown", (event) => event.stopPropagation());
    modal.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = event.target?.closest?.("[data-preview-action]")?.dataset.previewAction || "";
      if (action === "cancel") closePreview();
      else if (action === "edit") {
        if (!(await confirmDiscard())) return;
        closePreview();
        loadDocument(entry.document, {
          currentDocumentId: kind === "recent" ? entry.id : "",
          fitToContent: kind === "template"
        });
      } else if (action === "delete") {
        const ok = await ask(`${entry.name || entryPrefix(kind)} silinsin mi?`, "Sil");
        if (!ok) return;
        await deleteEntry(kind, entry.id);
        closePreview();
      }
    });
  }

  async function saveAndNotify() {
    const entry = await saveRecent();
    if (entry) await notify("Kroki kaydedildi.");
  }

  async function saveAndExit() {
    const entry = await saveRecent();
    if (!entry) return;
    resetDocument();
    showHome();
  }

  async function exitWithoutSave() {
    if (!(await confirmDiscard("Mevcut kroki kaydedilmeden kapanacak. Devam edilsin mi?"))) return;
    resetDocument();
    showHome();
  }

  async function saveTemplateFlow() {
    if (!hasContent()) {
      await notify("Boş kroki şablon olarak kaydedilmedi.");
      return;
    }
    const name = await askText({
      title: "Şablon adı",
      message: "Bu kroki şablon olarak kaydedilecek.",
      label: "Şablon adı",
      value: documentTitle("Şablon"),
      placeholder: "Örn. Kaza kavşağı",
      required: true
    });
    if (!name) return;
    const entry = await saveTemplate({ name });
    if (!entry) return;
    resetDocument();
    showHome();
    await notify("Şablon kaydedildi.");
  }

  async function newDocument() {
    if (!(await confirmDiscard("Eski çizimler silinecek. Yeni boş krokiye geçilsin mi?"))) return;
    resetDocument();
    showEditor();
  }

  async function askHomeSaveDecision() {
    return choose({
      title: "Ana Sayfaya Dön",
      message: "Değişiklikler kaydedilsin mi?",
      actions: [
        { label: "İptal", value: "cancel" },
        { label: "Kaydetmeden Dön", value: "discard" },
        { label: "Kaydet ve Dön", value: "save", variant: "primary" }
      ]
    });
  }

  async function backHome() {
    if (hasUnsavedChanges()) {
      const decision = await askHomeSaveDecision();
      if (decision === "save") {
        const entry = await saveRecent();
        if (!entry) return;
      } else if (decision !== "discard") {
        return;
      }
    }
    resetDocument();
    showHome();
  }

  function clampRect(rect, bounds) {
    const minWidth = uiPx(60);
    const minHeight = uiPx(44);
    const next = { ...rect };
    next.width = Math.max(minWidth, next.width);
    next.height = Math.max(minHeight, next.height);
    next.left = Math.min(bounds.right - next.width, Math.max(bounds.left, next.left));
    next.top = Math.min(bounds.bottom - next.height, Math.max(bounds.top, next.top));
    return next;
  }

  function rectToWorldViewBox(rect) {
    const viewBox = window.krokiEditorCamera?.readViewBox?.(canvas) || currentViewBox();
    const topLeft = window.krokiEditorCamera?.clientToWorld?.(canvas, rect.left, rect.top, viewBox, true);
    const bottomRight = window.krokiEditorCamera?.clientToWorld?.(canvas, rect.left + rect.width, rect.top + rect.height, viewBox, true);
    if (!topLeft || !bottomRight) return null;
    const bounds = {
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y)
    };
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return bounds;
  }

  function stopAreaTool() {
    areaTool?.destroy?.();
    areaTool = null;
  }

  function startAreaTool() {
    if (!hasContent()) {
      void notify("Kaydedilecek alan yok.");
      return;
    }
    stopAreaTool();
    const canvasRect = canvas.getBoundingClientRect();
    const width = Math.min(uiPx(520), Math.max(uiPx(180), canvasRect.width * 0.55));
    const height = Math.min(uiPx(340), Math.max(uiPx(130), canvasRect.height * 0.45));
    let rect = clampRect({
      left: canvasRect.left + (canvasRect.width - width) / 2,
      top: canvasRect.top + (canvasRect.height - height) / 2,
      width,
      height
    }, canvasRect);

    const layer = document.createElement("div");
    layer.className = "area-export-layer";
    const box = document.createElement("div");
    box.className = "area-export-box";
    const actions = document.createElement("div");
    actions.className = "area-export-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "İptal";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn-ok";
    save.textContent = "Kaydet";
    actions.append(cancel, save);
    box.append(actions);

    ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((name) => {
      const handle = document.createElement("span");
      handle.className = `area-export-handle is-${name}`;
      handle.dataset.handle = name;
      box.append(handle);
    });

    layer.append(box);
    document.body.append(layer);

    let drag = null;
    function applyRect() {
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }

    function updateDrag(clientX, clientY) {
      if (!drag) return;
      const dx = clientX - drag.x;
      const dy = clientY - drag.y;
      let next = { ...drag.rect };
      if (drag.mode === "move") {
        next.left += dx;
        next.top += dy;
      } else {
        if (drag.mode.includes("w")) {
          next.left += dx;
          next.width -= dx;
        }
        if (drag.mode.includes("e")) next.width += dx;
        if (drag.mode.includes("n")) {
          next.top += dy;
          next.height -= dy;
        }
        if (drag.mode.includes("s")) next.height += dy;
      }
      rect = clampRect(next, canvasRect);
      applyRect();
    }

    box.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      event.preventDefault();
      const handle = event.target.closest("[data-handle]");
      drag = {
        mode: handle?.dataset.handle || "move",
        x: event.clientX,
        y: event.clientY,
        rect: { ...rect }
      };
      box.setPointerCapture?.(event.pointerId);
    });
    box.addEventListener("pointermove", (event) => updateDrag(event.clientX, event.clientY));
    box.addEventListener("pointerup", () => {
      drag = null;
    });
    box.addEventListener("pointercancel", () => {
      drag = null;
    });

    cancel.addEventListener("click", stopAreaTool);
    save.addEventListener("click", async () => {
      const viewBox = rectToWorldViewBox(rect);
      if (!viewBox) {
        await notify("Seçilen alan okunamadı.");
        return;
      }
      showBusy("Resim hazırlanıyor...");
      await nextPaint();
      try {
        const ok = await exportPng(viewBox, `kroki_alan_${nowStamp()}.png`, { outputPaddingPx: EXPORT_PADDING });
        if (ok) stopAreaTool();
      } finally {
        hideBusy();
      }
    });

    areaTool = {
      destroy() {
        layer.remove();
      }
    };
    applyRect();
  }

  function importKrokiSvgText(text) {
    const parsed = new DOMParser().parseFromString(String(text || ""), "image/svg+xml");
    if (parsed.querySelector("parsererror")) {
      return notify("SVG dosyası okunamadı.", "SVG Yükle");
    }
    const metadata = parsed.querySelector(`metadata[data-kroki-pro-signature="${SVG_SIGNATURE}"]`);
    if (!metadata) {
      return notify("Bu SVG Kroki Pro imzası taşımıyor. Güvenli import için yalnızca Kroki Pro tarafından kaydedilmiş SVG dosyaları açılır.", "SVG Yükle");
    }
    let payload = null;
    try {
      payload = JSON.parse(metadata.textContent || "{}");
    } catch {
      return notify("SVG içindeki Kroki Pro verisi okunamadı.", "SVG Yükle");
    }
    if (payload?.signature !== SVG_SIGNATURE || !payload.document) {
      return notify("SVG içindeki Kroki Pro imzası uyumsuz.", "SVG Yükle");
    }
    if (payload.document.photoBackground && !payload.document.photoBackground.dataUrl) {
      const photo = parsed.querySelector("[data-kroki-photo-background='true']");
      payload.document.photoBackground.dataUrl = photo?.getAttribute("href")
        || photo?.getAttributeNS?.("http://www.w3.org/1999/xlink", "href")
        || "";
    }
    return confirmDiscard("Mevcut kroki kapatılıp SVG içindeki kroki açılacak. Devam edilsin mi?")
      .then((ok) => {
        if (ok) loadDocument(payload.document, { currentDocumentId: "" });
      });
  }

  function importSvgFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text()
        .then(importKrokiSvgText)
        .catch(() => notify("SVG dosyası okunamadı.", "SVG Yükle"));
    }, { once: true });
    input.click();
  }

  function importPhotoFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif";
    input.hidden = true;
    input.addEventListener("cancel", () => input.remove(), { once: true });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        input.remove();
        return;
      }
      showBusy("Fotoğraf kopyalanıyor...");
      try {
        const photoBackground = await Kroki.PhotoBackgroundManager?.stateFromFile?.(file);
        if (!photoBackground) throw new Error("photo-background-unavailable");
        hideBusy();
        const ok = await confirmDiscard("Mevcut kroki kapatılıp fotoğraf altlık olarak açılacak. Devam edilsin mi?");
        if (!ok) return;
        loadDocument({
          schemaVersion: 1,
          app: "Kroki Pro",
          viewport: { viewBox: viewBoxString(DEFAULT_VIEWBOX) },
          objects: [],
          photoBackground,
          groups: [],
          roadIntersection: null
        }, { currentDocumentId: "", markSaved: false });
      } catch {
        await notify("Fotoğraf okunamadı. JPEG, PNG, WebP, GIF, BMP veya AVIF dosyası seçin.", "Fotoğraf Yükle");
      } finally {
        hideBusy();
        input.remove();
      }
    }, { once: true });
    document.body.append(input);
    input.click();
  }

  async function handleMenuAction(action) {
    if (action === "export-png") await exportFullPngAndExit();
    else if (action === "export-area-png") startAreaTool();
    else if (action === "save") await saveAndNotify();
    else if (action === "save-exit") await saveAndExit();
    else if (action === "exit-nosave") await exitWithoutSave();
    else if (action === "save-template") await saveTemplateFlow();
    else if (action === "export-svg") await exportSvg();
    else if (action === "new-document") await newDocument();
    else if (action === "back-home") await backHome();
  }

  menu?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-menu-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    window.krokiEditorRail?.closeRailMenus?.();
    void handleMenuAction(button.dataset.menuAction);
  });

  newSketchButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void newDocument();
  }, true);

  recentList?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-entry-id]");
    if (button) void openEntryPreview(button.dataset.entryKind || "recent", button.dataset.entryId);
  });

  templateList?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-entry-id]");
    if (button) void openEntryPreview(button.dataset.entryKind || "template", button.dataset.entryId);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (areaTool) {
        stopAreaTool();
        return;
      }
      if (previewLayer) closePreview();
    }
  });

  window.KrokiMainMenu = {
    saveRecent,
    saveTemplate,
    renderStoredLists,
    resetDocument,
    importSvgFile,
    importPhotoFile,
    importKrokiSvgText
  };

  void renderStoredLists();
  markDocumentSaved();
})();
