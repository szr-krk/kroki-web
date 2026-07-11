(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const data = window.KrokiVehicleCatalogData || {};

  const VIEW_ORDER = ["top", "side", "upsideDown"];
  const DEFAULT_COLOR = "#000000";

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
      return variantsForType(keyOrTypeId).find((variant) => variant.id === variantId) || null;
    }
    const key = String(keyOrTypeId || "");
    return allVariants().find((variant) => variant.key === key || variant.id === key) || null;
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
    metadataFor
  };
})();
