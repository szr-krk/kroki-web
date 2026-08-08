(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const SVG_NS = "http://www.w3.org/2000/svg";
  const DEFAULT_VIEWBOX = { x: 0, y: 0, width: 1200, height: 800 };
  const SUPPORTED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/avif"
  ]);
  const MIME_BY_EXTENSION = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };

  const canvas = document.querySelector("#editorCanvas");
  const layer = document.querySelector("#editorBackground");
  let backgroundState = null;

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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

  function normalizedMimeType(value) {
    const mimeType = String(value || "").trim().toLowerCase();
    if (mimeType === "image/jpg") return "image/jpeg";
    return SUPPORTED_MIME_TYPES.has(mimeType) ? mimeType : "";
  }

  function mimeTypeFromFile(file) {
    const declared = normalizedMimeType(file?.type);
    if (declared) return declared;
    const extension = String(file?.name || "").split(".").pop()?.toLowerCase() || "";
    return MIME_BY_EXTENSION[extension] || "";
  }

  function normalizedDataUrl(value, preferredMimeType = "") {
    const source = String(value || "");
    const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(source);
    if (!match) return "";
    const mimeType = normalizedMimeType(preferredMimeType || match[1]);
    if (!mimeType) return "";
    return `data:${mimeType};base64,${match[2]}`;
  }

  function normalizeBounds(source) {
    const fallback = parseViewBox(canvas?.getAttribute("viewBox"));
    const bounds = source && typeof source === "object" ? source : {};
    const width = finiteNumber(bounds.width, fallback.width);
    const height = finiteNumber(bounds.height, fallback.height);
    return {
      x: finiteNumber(bounds.x, fallback.x),
      y: finiteNumber(bounds.y, fallback.y),
      width: width > 0 ? width : fallback.width,
      height: height > 0 ? height : fallback.height
    };
  }

  function normalizeState(source) {
    if (!source || typeof source !== "object") return null;
    const preferredMimeType = normalizedMimeType(source.mimeType);
    const dataUrl = normalizedDataUrl(source.dataUrl, preferredMimeType);
    if (!dataUrl) return null;
    const embeddedMimeType = dataUrl.slice(5, dataUrl.indexOf(";"));
    return {
      dataUrl,
      mimeType: preferredMimeType || normalizedMimeType(embeddedMimeType),
      name: String(source.name || "Fotoğraf"),
      naturalWidth: Math.max(1, finiteNumber(source.naturalWidth, 1)),
      naturalHeight: Math.max(1, finiteNumber(source.naturalHeight, 1)),
      bounds: normalizeBounds(source.bounds)
    };
  }

  function render() {
    if (!layer) return;
    layer.replaceChildren();
    if (!backgroundState) return;
    const image = document.createElementNS(SVG_NS, "image");
    const bounds = backgroundState.bounds;
    image.id = "editorPhotoBackgroundImage";
    image.setAttribute("x", String(bounds.x));
    image.setAttribute("y", String(bounds.y));
    image.setAttribute("width", String(bounds.width));
    image.setAttribute("height", String(bounds.height));
    image.setAttribute("href", backgroundState.dataUrl);
    image.setAttribute("preserveAspectRatio", "xMidYMid meet");
    image.setAttribute("pointer-events", "none");
    image.setAttribute("data-kroki-photo-background", "true");
    layer.append(image);
  }

  function exportState() {
    if (!backgroundState) return null;
    return {
      ...backgroundState,
      bounds: { ...backgroundState.bounds }
    };
  }

  function set(source) {
    backgroundState = normalizeState(source);
    render();
    return exportState();
  }

  function clear() {
    const changed = Boolean(backgroundState);
    backgroundState = null;
    render();
    return changed;
  }

  function importState(source) {
    if (!source) {
      clear();
      return true;
    }
    return Boolean(set(source));
  }

  function fileAsDataUrl(file, mimeType) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = normalizedDataUrl(reader.result, mimeType);
        if (dataUrl) resolve(dataUrl);
        else reject(new Error("unsupported-image"));
      }, { once: true });
      reader.addEventListener("error", () => reject(reader.error || new Error("image-read-failed")), { once: true });
      reader.readAsDataURL(file);
    });
  }

  function imageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => {
        resolve({
          width: Math.max(1, image.naturalWidth || image.width || 1),
          height: Math.max(1, image.naturalHeight || image.height || 1)
        });
      }, { once: true });
      image.addEventListener("error", () => reject(new Error("image-decode-failed")), { once: true });
      image.src = dataUrl;
    });
  }

  async function stateFromFile(file) {
    const mimeType = mimeTypeFromFile(file);
    if (!file || !mimeType) throw new Error("unsupported-image");
    const dataUrl = await fileAsDataUrl(file, mimeType);
    const dimensions = await imageDimensions(dataUrl);
    return normalizeState({
      dataUrl,
      mimeType,
      name: file.name || "Fotoğraf",
      naturalWidth: dimensions.width,
      naturalHeight: dimensions.height,
      bounds: parseViewBox(canvas?.getAttribute("viewBox"))
    });
  }

  Kroki.PhotoBackgroundManager = {
    clear,
    exportState,
    getBounds() {
      return backgroundState ? { ...backgroundState.bounds } : null;
    },
    has() {
      return Boolean(backgroundState);
    },
    importState,
    set,
    stateFromFile
  };
})();
