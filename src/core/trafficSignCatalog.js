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

  const CATEGORY_KEY_ALIASES = {
    "tanzim-levhalari": "1-tanzim-levhalari",
    "uyari-levhalari": "2-uyari-levhalari",
    "bilgi-levhalari": "3-bilgi-levhalari"
  };

  const CATEGORY_MAX_INITIAL_SIZE = {
    "4-durma-ve-parketme": 60,
    "5-yapim-bakim-ve-onarim": 80,
    "6-paneller": 60
  };

  const BASE_SCALE_OVERRIDES = new Map([
    ["3-bilgi-levhalari/b-61f-elektronik-denetleme-sistemi", 0.12],
    ["3-bilgi-levhalari/b-63a-karayolu-denetim-istasyonu-bilgi-levhalari", 0.04],
    ["3-bilgi-levhalari/b-63b-karayolu-denetim-istasyonu-bilgi-levhalari", 0.04]
  ]);

  const FORCE_WHITE_TEXT_SIGN_KEYS = new Set([
    "3-bilgi-levhalari/b-53b-u-donusu-levhalari",
    "3-bilgi-levhalari/b-53c-u-donusu-levhalari",
    "3-bilgi-levhalari/b-53d-u-donusu-alt-gecit",
    "3-bilgi-levhalari/b-53e-u-donusu-alt-gecit",
    "3-bilgi-levhalari/b-53f-u-donusu-alt-gecit",
    "3-bilgi-levhalari/b-53g-u-donusu-ust-gecit",
    "3-bilgi-levhalari/b-61b-elektronik-denetleme-sistemi"
  ]);

  function categoryKey(sign) {
    const key = String(sign?.categoryKey || sign?.category || "trafik-levhalari");
    return CATEGORY_KEY_ALIASES[key] || key;
  }

  function categoryTitle(sign, key) {
    const title = String(sign?.category || "Levhalar");
    if (key === "1-tanzim-levhalari" && !/^1(?:\s|$)/.test(title)) return `1 ${title}`;
    if (key === "2-uyari-levhalari" && !/^2(?:\s|$)/.test(title)) return `2 ${title}`;
    if (key === "3-bilgi-levhalari" && !/^3(?:\s|$)/.test(title)) return `3 ${title}`;
    return title;
  }

  function normalizedBaseScale(sign, key, viewBox) {
    const scaleOverride = BASE_SCALE_OVERRIDES.get(String(sign?.key || ""));
    const sourceScale = Number(scaleOverride) || Number(sign?.baseScale) || 0.08;
    if (key === "7-kaplama-isaretleri") return 1;

    const maxInitialSize = CATEGORY_MAX_INITIAL_SIZE[key];
    if (!maxInitialSize) return sourceScale;
    const dimensions = parseViewBox(viewBox, sign?.width, sign?.height);
    const longestSide = Math.max(dimensions.width, dimensions.height);
    if (!Number.isFinite(longestSide) || longestSide <= 0 || longestSide * sourceScale <= maxInitialSize) {
      return sourceScale;
    }
    return Math.round((maxInitialSize / longestSide) * 1e6) / 1e6;
  }

  function normalizedSign(sign) {
    const normalizedCategoryKey = categoryKey(sign);
    const normalizedViewBox = String(sign?.viewBox || `0 0 ${Number(sign?.width) || 100} ${Number(sign?.height) || 100}`);
    const normalizedKey = String(sign?.key || "");
    const normalizeMarkup = (value) => {
      const markup = String(value || "");
      if (!FORCE_WHITE_TEXT_SIGN_KEYS.has(normalizedKey)) return markup;
      return markup.replace(/(<text\b[^>]*?)fill="#000000"/g, '$1fill="#fff"');
    };
    return {
      key: normalizedKey,
      code: String(sign?.code || ""),
      name: String(sign?.name || ""),
      category: categoryTitle(sign, normalizedCategoryKey),
      categoryKey: normalizedCategoryKey,
      file: String(sign?.file || ""),
      width: Number(sign?.width) || 0,
      height: Number(sign?.height) || 0,
      viewBox: normalizedViewBox,
      baseScale: normalizedBaseScale(sign, normalizedCategoryKey, normalizedViewBox),
      art: normalizeMarkup(sign?.art),
      svg: normalizeMarkup(sign?.svg)
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
