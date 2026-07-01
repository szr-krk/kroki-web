(() => {
  const Kroki = window.Kroki = window.Kroki || {};

  function source() {
    return Array.isArray(window.KrokiOtherSymbolCatalog) ? window.KrokiOtherSymbolCatalog : [];
  }

  function categoryKey(symbol) {
    return String(symbol?.categoryKey || symbol?.category || "diger-semboller");
  }

  function normalizedSymbol(symbol) {
    return {
      key: String(symbol?.key || ""),
      code: String(symbol?.code || ""),
      name: String(symbol?.name || "Sembol"),
      category: String(symbol?.category || "Diger Semboller"),
      categoryKey: categoryKey(symbol),
      file: String(symbol?.file || ""),
      width: Number(symbol?.width) || 0,
      height: Number(symbol?.height) || 0,
      viewBox: String(symbol?.viewBox || `0 0 ${Number(symbol?.width) || 100} ${Number(symbol?.height) || 100}`),
      baseScale: Number(symbol?.baseScale) || 0.5,
      art: String(symbol?.art || ""),
      svg: String(symbol?.svg || "")
    };
  }

  function all() {
    return source().map(normalizedSymbol).filter((symbol) => symbol.key && symbol.art);
  }

  function find(key) {
    const target = String(key || "");
    return all().find((symbol) => symbol.key === target) || null;
  }

  function categories() {
    const map = new Map();
    all().forEach((symbol) => {
      if (!map.has(symbol.categoryKey)) {
        map.set(symbol.categoryKey, {
          key: symbol.categoryKey,
          title: symbol.category,
          symbols: []
        });
      }
      map.get(symbol.categoryKey).symbols.push(symbol);
    });
    return Array.from(map.values());
  }

  function parseViewBox(value, width, height) {
    const parts = String(value || "").trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
    return { x: 0, y: 0, width: Math.max(1, Number(width) || 100), height: Math.max(1, Number(height) || 100) };
  }

  Kroki.OtherSymbolCatalog = {
    all,
    find,
    categories,
    parseViewBox,
    metadataFor(symbol) {
      const normalized = normalizedSymbol(symbol);
      return {
        symbolKey: normalized.key,
        symbolCode: normalized.code,
        symbolName: normalized.name,
        symbolCategory: normalized.category,
        symbolCategoryKey: normalized.categoryKey,
        symbolFile: normalized.file,
        symbolViewBox: normalized.viewBox,
        symbolWidth: normalized.width,
        symbolHeight: normalized.height,
        symbolBaseScale: normalized.baseScale,
        symbolArt: normalized.art,
        otherSymbol: true
      };
    }
  };
})();
