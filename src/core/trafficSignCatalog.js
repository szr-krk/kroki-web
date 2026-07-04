(() => {
  const Kroki = window.Kroki = window.Kroki || {};

  function source() {
    return Array.isArray(window.KrokiTrafficSignCatalog) ? window.KrokiTrafficSignCatalog : [];
  }

  let cachedSource = null;
  let cachedLength = -1;
  let cachedAll = null;
  let cachedByKey = null;
  let cachedCategories = null;

  function categoryKey(sign) {
    return String(sign?.categoryKey || sign?.category || "trafik-levhalari");
  }

  function normalizedSign(sign) {
    return {
      key: String(sign?.key || ""),
      code: String(sign?.code || ""),
      name: String(sign?.name || ""),
      category: String(sign?.category || "Levhalar"),
      categoryKey: categoryKey(sign),
      file: String(sign?.file || ""),
      width: Number(sign?.width) || 0,
      height: Number(sign?.height) || 0,
      viewBox: String(sign?.viewBox || `0 0 ${Number(sign?.width) || 100} ${Number(sign?.height) || 100}`),
      baseScale: Number(sign?.baseScale) || 0.08,
      art: String(sign?.art || ""),
      svg: String(sign?.svg || "")
    };
  }

  function ensureCache() {
    const current = source();
    if (cachedSource === current && cachedLength === current.length && cachedAll && cachedByKey) {
      return;
    }
    cachedSource = current;
    cachedLength = current.length;
    cachedAll = current.map(normalizedSign).filter((sign) => sign.key && sign.art);
    cachedByKey = new Map(cachedAll.map((sign) => [sign.key, sign]));
    cachedCategories = null;
  }

  function all() {
    ensureCache();
    return cachedAll;
  }

  function find(key) {
    const target = String(key || "");
    ensureCache();
    return cachedByKey.get(target) || null;
  }

  function categories() {
    ensureCache();
    if (cachedCategories) return cachedCategories;
    const map = new Map();
    cachedAll.forEach((sign) => {
      if (!map.has(sign.categoryKey)) {
        map.set(sign.categoryKey, {
          key: sign.categoryKey,
          title: sign.category,
          signs: []
        });
      }
      map.get(sign.categoryKey).signs.push(sign);
    });
    cachedCategories = Array.from(map.values());
    return cachedCategories;
  }

  function parseViewBox(value, width, height) {
    const parts = String(value || "").trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
    return { x: 0, y: 0, width: Math.max(1, Number(width) || 100), height: Math.max(1, Number(height) || 100) };
  }

  Kroki.TrafficSignCatalog = {
    all,
    find,
    categories,
    parseViewBox,
    metadataFor(sign) {
      const normalized = normalizedSign(sign);
      return {
        signKey: normalized.key,
        signCode: normalized.code,
        signName: normalized.name,
        signCategory: normalized.category,
        signCategoryKey: normalized.categoryKey,
        signFile: normalized.file,
        signViewBox: normalized.viewBox,
        signWidth: normalized.width,
        signHeight: normalized.height,
        signBaseScale: normalized.baseScale,
        signArt: normalized.art
      };
    }
  };
})();
