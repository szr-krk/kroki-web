(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const data = window.KrokiVehicleCatalogData || {};

  const VIEW_ORDER = ["top", "side", "upsideDown"];
  const DEFAULT_COLOR = "#000000";
  const LEGACY_VARIANT_ALIASES = {
    "10/yolcu-otobusu": "10/otobus"
  };

  let catalogIndex = null;
  function index() {
    if (catalogIndex) return catalogIndex;
    const unsupported = new Set(data.upsideDownUnsupported || []);
    const types = (Array.isArray(data.types) ? data.types : []).map(type => ({
      ...type, supportsUpsideDown: !unsupported.has(type.id)
    }));
    const byType = new Map(), byKey = new Map(), variants = [];
    types.forEach(type => {
      const items = (type.variants || []).map(variant => normalizeVariant(type, variant));
      byType.set(type.id, items);
      items.forEach(variant => {
        variants.push(variant);
        byKey.set(variant.key, variant);
        if (!byKey.has(variant.id)) byKey.set(variant.id, variant);
      });
    });
    catalogIndex = { types, byType, byKey, variants };
    return catalogIndex;
  }
  function typeList() { return index().types.slice(); }
  function typeById(typeId) { return index().types.find(type => type.id === String(typeId || "")) || null; }

  function normalizeVariant(type, variant) {
    const supportsUpsideDown = variant.supportsUpsideDown != null
      ? Boolean(variant.supportsUpsideDown)
      : Boolean(type.supportsUpsideDown);
    return {
      ...variant,
      typeId: type.id,
      typeTitle: type.title,
      key: `${type.id}/${variant.id}`,
      supportsUpsideDown,
      color: variant.color || DEFAULT_COLOR
    };
  }

  function variantsForType(typeId) { return (index().byType.get(String(typeId || "")) || []).slice(); }
  function allVariants() { return index().variants.slice(); }
  function findVariant(keyOrTypeId, variantId) {
    const key = variantId ? `${String(keyOrTypeId || "")}/${String(variantId)}` : String(keyOrTypeId || "");
    return index().byKey.get(LEGACY_VARIANT_ALIASES[key] || key) || null;
  }

  function metersToUnits(value) {
    const ratio = Number(data.metersToUnits) || (50 / 3.5);
    return Math.max(1, Number(value) * ratio || 1);
  }

  function dimensionsForView(variant, view) {
    const cleanView = view === "side" ? "side" : view === "upsideDown" ? "upsideDown" : "top";
    const length = metersToUnits(variant?.lengthM || 4.5);
    const width = metersToUnits(variant?.widthM || 1.8);
    const height = metersToUnits(variant?.heightM || 1.5);
    if (cleanView === "side") return { width: length, height, view: cleanView };
    return { width: length, height: width, view: cleanView };
  }

  function supportsView(variant, view) {
    if (variant?.views) return Boolean(variant.views[view]);
    if (view === "upsideDown") return Boolean(variant?.supportsUpsideDown);
    return view === "top" || view === "side";
  }

  function normalizeView(variant, view) {
    const clean = VIEW_ORDER.includes(view) ? view : "top";
    return supportsView(variant, clean) ? clean : "top";
  }

  function nextView(variant, currentView) {
    const views = VIEW_ORDER.filter((view) => supportsView(variant, view));
    const current = normalizeView(variant, currentView);
    const index = Math.max(0, views.indexOf(current));
    return views[(index + 1) % views.length] || "top";
  }

  // Hitch positions are measured from the rear along each top-view drawing.
  const TRACTOR_HITCHES = { "09/cekici": 0.22, "09/uc-dingil-cekici": 0.25 };
  const TRAILER_KEYS = ["09/uc-dingil-dorse", "09/tanker-yari-romork", "09/silobas-kasa-yari-romork"];

  function isTractor(variant) { return Object.hasOwn(TRACTOR_HITCHES, variant?.key || ""); }
  function isTrailer(variant) { return TRAILER_KEYS.includes(variant?.key); }
  function rigParts(variant, metadata = {}) {
    const tractor = variant?.key === "09/cekici-ve-dorse" ? findVariant("09/cekici") : variant;
    if (!isTractor(tractor)) return null;
    const trailer = findVariant(metadata.vehicleTrailerVariantKey || (variant?.key === "09/cekici-ve-dorse" ? TRAILER_KEYS[0] : ""));
    return isTractor(tractor) && isTrailer(trailer) ? { tractor, trailer } : null;
  }
  function articulationAngle(value) {
    const angle = Number(value);
    return Number.isFinite(angle) ? Math.max(-120, Math.min(120, angle)) : 0;
  }
  const sideOutlineCache = new Map();
  function sideGround(variant, dimensions, ghost = false) {
    const view = variant.views.side;
    let outlines = sideOutlineCache.get(variant.key);
    if (!outlines) {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.style.cssText = "position:fixed;width:0;height:0;visibility:hidden;pointer-events:none";
      document.body.append(svg);
      try {
        outlines = view.paths.filter(path => path.d).map(source => {
          const path = document.createElementNS(ns, "path");
          path.setAttribute("d", source.d);
          svg.append(path);
          const box = path.getBBox();
          return { bottom: box.y + box.height, stroke: source.stroke === "none" ? 0 : (source.strokeWidth || 3),
            ghostHidden: source.ghost === "hide" };
        });
        sideOutlineCache.set(variant.key, outlines);
      } finally { svg.remove(); }
    }
    const [, y, width, height] = view.viewBox.trim().split(/[\s,]+/).map(Number);
    const fit = Math.min(dimensions.width / width, dimensions.height / height);
    return Math.max(...outlines.filter(outline => !ghost || !outline.ghostHidden).map(outline =>
      (outline.bottom - y - height / 2) * fit + (outline.stroke ? (ghost ? 0.15 : outline.stroke * fit / 2) : 0)));
  }

  function rigLayout(parts, view = "top", angle = 0, appearance = {}) {
    const tractor = dimensionsForView(parts.tractor, view);
    const trailer = dimensionsForView(parts.trailer, view);
    const trailerHitch = trailer.width / 2 - metersToUnits(0.75);
    const tractorHitch = tractor.width * (TRACTOR_HITCHES[parts.tractor.key] - 0.5);
    const min = Math.min(-tractorHitch - tractor.width / 2, -trailerHitch - trailer.width / 2);
    const max = Math.max(-tractorHitch + tractor.width / 2, -trailerHitch + trailer.width / 2);
    const hitchX = -(min + max) / 2;
    const height = Math.max(tractor.height, trailer.height);
    const tractorGround = view === "side" ? sideGround(parts.tractor, tractor, Boolean(appearance.vehicleGhost)) : 0;
    const trailerGround = view === "side" ? sideGround(parts.trailer, trailer,
      Boolean(appearance.vehicleTrailerMetadata?.vehicleGhost ?? appearance.vehicleGhost)) : 0;
    const ground = Math.max(tractorGround, trailerGround);
    // Articulation is a plan-view angle; side elevation remains straight.
    return { tractor, trailer, tractorHitch, trailerHitch, hitchX,
      angle: view === "side" ? 0 : articulationAngle(angle),
      tractorY: ground - tractorGround,
      trailerY: ground - trailerGround,
      width: max - min, height };
  }

  function metadataFor(variant, patch = {}) {
    const normalized = variant?.key ? variant : findVariant(variant?.typeId, variant?.id);
    return {
      vehicleTypeId: normalized?.typeId || "",
      vehicleTypeTitle: normalized?.typeTitle || "",
      vehicleVariantId: normalized?.id || "",
      vehicleVariantKey: normalized?.key || "",
      vehicleVariantName: normalized?.name || "Arac",
      vehicleKind: normalized?.kind || "car",
      vehicleView: "top",
      vehicleColor: normalized?.color || DEFAULT_COLOR,
      vehicleGhost: false,
      vehicleFlipX: false,
      vehicleFlipY: false,
      supportsUpsideDown: Boolean(normalized?.supportsUpsideDown),
      lengthM: Number(normalized?.lengthM) || 0,
      widthM: Number(normalized?.widthM) || 0,
      heightM: Number(normalized?.heightM) || 0,
      ...patch
    };
  }

  function metadataForPart(variant, source = {}) {
    const result = { ...source, ...metadataFor(variant) };
    ["vehicleView", "vehicleColor", "vehicleGhost", "vehicleFlipX", "vehicleFlipY", "vehicleLabelText", "vehicleLabelPosition"].forEach(key => {
      if (source[key] != null) result[key] = source[key];
    });
    ["vehicleTrailerVariantKey", "vehicleTrailerMetadata", "vehicleTrailerStyle", "vehicleTrailerLabel"].forEach(key => delete result[key]);
    return result;
  }

  Kroki.VehicleCatalog = {
    viewOrder: VIEW_ORDER.slice(),
    typeList,
    typeById,
    variantsForType,
    allVariants,
    findVariant,
    metersToUnits,
    dimensionsForView,
    supportsView,
    normalizeView,
    nextView,
    metadataFor,
    isTractor, isTrailer, rigParts, rigLayout, articulationAngle, metadataForPart
  };
})();
