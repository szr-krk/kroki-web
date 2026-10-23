(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const data = window.KrokiVehicleCatalogData || {};

  const VIEW_ORDER = ["top", "side", "upsideDown"];
  const DEFAULT_COLOR = "#000000";
  const LEGACY_VARIANT_ALIASES = {
    "10/yolcu-otobusu": "10/otobus"
  };

  function typeList() {
    const unsupported = new Set(data.upsideDownUnsupported || []);
    return (Array.isArray(data.types) ? data.types : []).map((type) => ({
      ...type,
      supportsUpsideDown: !unsupported.has(type.id)
    }));
  }

  function typeById(typeId) {
    return typeList().find((type) => type.id === String(typeId || "")) || null;
  }

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

  function variantsForType(typeId) {
    const type = typeById(typeId);
    return (type?.variants || []).map((variant) => normalizeVariant(type, variant));
  }

  function allVariants() {
    return typeList().flatMap((type) => variantsForType(type.id));
  }

  function findVariant(keyOrTypeId, variantId) {
    if (variantId) {
      const requestedKey = `${String(keyOrTypeId || "")}/${String(variantId || "")}`;
      const aliasedKey = LEGACY_VARIANT_ALIASES[requestedKey];
      if (aliasedKey) return allVariants().find((variant) => variant.key === aliasedKey) || null;
      return variantsForType(keyOrTypeId).find((variant) => variant.id === variantId) || null;
    }
    const key = String(keyOrTypeId || "");
    const normalizedKey = LEGACY_VARIANT_ALIASES[key] || key;
    return allVariants().find((variant) => variant.key === normalizedKey || variant.id === normalizedKey) || null;
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
  function rigLayout(parts, view = "top", angle = 0) {
    const tractor = dimensionsForView(parts.tractor, view);
    const trailer = dimensionsForView(parts.trailer, view);
    const trailerHitch = trailer.width / 2 - metersToUnits(0.75);
    const tractorHitch = tractor.width * (TRACTOR_HITCHES[parts.tractor.key] - 0.5);
    const min = Math.min(-tractorHitch - tractor.width / 2, -trailerHitch - trailer.width / 2);
    const max = Math.max(-tractorHitch + tractor.width / 2, -trailerHitch + trailer.width / 2);
    const hitchX = -(min + max) / 2;
    const height = Math.max(tractor.height, trailer.height);
    // Articulation is a plan-view angle; side elevation remains straight.
    return { tractor, trailer, tractorHitch, trailerHitch, hitchX,
      angle: view === "side" ? 0 : articulationAngle(angle),
      tractorY: view === "side" ? (height - tractor.height) / 2 : 0,
      trailerY: view === "side" ? (height - trailer.height) / 2 : 0,
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
