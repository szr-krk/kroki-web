(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const catalog = Kroki.TrafficSignCatalog;
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  const utils = Kroki.EditorUtils;
  if (!catalog || !manager || !selection || !utils) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const categoryList = document.querySelector("#trafficSignCategoryList");
  const grid = document.querySelector("#trafficSignGrid");
  const selectedLabel = document.querySelector("#trafficSignSelectedLabel");
  const addButton = document.querySelector("#btnTrafficSignAdd");
  const searchInput = document.querySelector("#trafficSignSearch");
  const searchCount = document.querySelector("#trafficSignSearchCount");
  const searchClearButton = document.querySelector("#btnTrafficSignSearchClear");
  const panel = document.querySelector("#railMenuLevha");
  const browser = panel?.querySelector(".traffic-sign-browser");
  const ART_CACHE_LIMIT = 128;

  let activeCategoryKey = "";
  let selectedKey = "";
  let searchQuery = "";
  let searchTimer = 0;
  let rendered = false;
  const artCache = new Map();
  const searchTextCache = new Map();

  function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([name, value]) => {
      if (value != null) element.setAttribute(name, value);
    });
    return element;
  }

  function selectedSign() {
    return selectedKey ? catalog.find(selectedKey) : null;
  }

  function setSelected(sign) {
    selectedKey = sign?.key || "";
    if (selectedLabel) {
      const signLabel = sign ? `${sign.code ? sign.code + " - " : ""}${sign.name || "Levha"}` : "Yok";
      selectedLabel.textContent = "Seçilen levha: " + signLabel;
    }
    addButton?.classList.toggle("gizli", !selectedKey);
    syncTileSelection();
  }

  function syncTileSelection() {
    grid?.querySelectorAll(".traffic-sign-tile").forEach((tile) => {
      const selected = tile.dataset.signKey === selectedKey;
      tile.classList.toggle("is-selected", selected);
      tile.setAttribute("aria-pressed", String(selected));
    });
  }

  function categories() {
    return catalog.categories();
  }

  function activeCategory() {
    const allCategories = categories();
    return allCategories.find((category) => category.key === activeCategoryKey) || allCategories[0] || null;
  }

  function searchableText(sign) {
    const key = sign?.key || "";
    if (key && searchTextCache.has(key)) return searchTextCache.get(key);
    const text = utils.turkishSearchText(`${sign?.code || ""} ${sign?.name || ""} ${sign?.category || ""}`);
    if (key) searchTextCache.set(key, text);
    return text;
  }

  function matchingSigns() {
    if (!searchQuery) return null;
    const queryTokens = searchQuery.split(" ").filter(Boolean);
    return catalog.all().filter((sign) => {
      const signTokens = searchableText(sign).split(" ").filter(Boolean);
      return queryTokens.every((queryToken) => (
        signTokens.some((signToken) => signToken.startsWith(queryToken))
      ));
    });
  }

  function renderSignArt(sign) {
    const cacheKey = sign?.key || "";
    const cached = cacheKey ? utils.lruGet(artCache, cacheKey) : null;
    if (cached) return cached.cloneNode(true);
    const svg = createSvgElement("svg", {
      viewBox: sign.viewBox,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true"
    });
    svg.innerHTML = sign.art;
    if (cacheKey) utils.lruSet(artCache, cacheKey, svg, ART_CACHE_LIMIT);
    return svg.cloneNode(true);
  }

  function renderGrid({ resetScroll = false } = {}) {
    if (!grid) return;
    const category = activeCategory();
    const searchResults = matchingSigns();
    const signs = searchResults || category?.signs || [];
    if (!category && !searchResults) {
      const empty = document.createElement("div");
      empty.className = "traffic-sign-empty";
      empty.textContent = "Levha katalogu bulunamadi.";
      grid.replaceChildren(empty);
      setSelected(null);
      return;
    }

    if (searchCount) {
      searchCount.textContent = String(signs.length);
      searchCount.classList.toggle("gizli", !searchQuery);
      searchCount.title = searchQuery ? `${signs.length} levha bulundu` : "";
    }

    if (!signs.length) {
      const empty = document.createElement("div");
      empty.className = "traffic-sign-empty";
      empty.textContent = "Levha bulunamadı.";
      grid.replaceChildren(empty);
      setSelected(null);
      if (resetScroll && browser) browser.scrollTop = 0;
      return;
    }

    const fragment = document.createDocumentFragment();
    signs.forEach((sign) => {
      const tile = document.createElement("button");
      tile.className = "traffic-sign-tile";
      tile.type = "button";
      tile.dataset.signKey = sign.key;
      tile.title = `${sign.code ? sign.code + " - " : ""}${sign.name}`;
      tile.setAttribute("aria-label", tile.title);
      tile.setAttribute("aria-pressed", "false");
      tile.append(renderSignArt(sign));
      fragment.append(tile);
    });
    grid.replaceChildren(fragment);
    syncTileSelection();
    if (resetScroll && browser) browser.scrollTop = 0;
  }

  function syncCategorySelection() {
    categoryList?.querySelectorAll(".traffic-sign-category").forEach((button) => {
      const selected = !searchQuery && button.dataset.categoryKey === activeCategoryKey;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setSearchValue(value, { render = true } = {}) {
    window.clearTimeout(searchTimer);
    if (searchInput) searchInput.value = String(value || "");
    const nextQuery = utils.turkishSearchText(searchInput?.value || "");
    const changed = nextQuery !== searchQuery;
    searchQuery = nextQuery;
    searchClearButton?.classList.toggle("gizli", !(searchInput?.value || ""));
    syncCategorySelection();
    if (changed) setSelected(null);
    if (render) renderGrid({ resetScroll: true });
  }

  function setActiveCategory(key) {
    const nextKey = String(key || "");
    if (searchQuery || searchInput?.value) setSearchValue("", { render: false });
    if (activeCategoryKey && activeCategoryKey !== nextKey) setSelected(null);
    activeCategoryKey = nextKey;
    syncCategorySelection();
    renderGrid({ resetScroll: true });
  }

  function renderCategories() {
    if (!categoryList) return;
    const allCategories = categories();
    const fragment = document.createDocumentFragment();
    allCategories.forEach((category) => {
      const button = document.createElement("button");
      button.className = "traffic-sign-category";
      button.type = "button";
      button.dataset.categoryKey = category.key;
      button.setAttribute("aria-pressed", "false");
      const title = document.createElement("span");
      const count = document.createElement("strong");
      const categoryTitle = String(category.title || "").replace(/^\s*\d+\s+/, "");
      title.textContent = utils.turkishListLabel(categoryTitle);
      count.textContent = String(category.signs.length);
      button.append(title, count);
      fragment.append(button);
    });
    categoryList.replaceChildren(fragment);
    if (!activeCategoryKey && allCategories[0]) activeCategoryKey = allCategories[0].key;
    setActiveCategory(activeCategoryKey);
  }

  function canvasCenter() {
    const viewBox = manager.canvas?.getAttribute("viewBox") || "0 0 1200 800";
    const parts = viewBox.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { x: parts[0] + parts[2] / 2, y: parts[1] + parts[3] / 2 };
    }
    return { x: 600, y: 400 };
  }

  function addSelectedSign(event) {
    event?.preventDefault();
    event?.stopPropagation();
    const sign = selectedSign();
    if (!sign) return;
    const model = manager.create("trafficSign", {
      sign,
      center: canvasCenter(),
      scale: sign.baseScale
    }, { label: "Levha ekle" });
    if (!model) return;
    selection.edit(model.id);
    window.krokiEditorRail?.closeRailMenus?.();
    setSelected(null);
  }

  function ensureRendered() {
    if (rendered) {
      syncTileSelection();
      return;
    }
    renderCategories();
    rendered = true;
  }

  addButton?.addEventListener("click", addSelectedSign);
  grid?.addEventListener("click", (event) => {
    const tile = event.target.closest?.(".traffic-sign-tile");
    if (!tile || !grid.contains(tile)) return;
    setSelected(catalog.find(tile.dataset.signKey));
  });
  categoryList?.addEventListener("click", (event) => {
    const button = event.target.closest?.(".traffic-sign-category");
    if (!button || !categoryList.contains(button)) return;
    setActiveCategory(button.dataset.categoryKey);
  });
  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => setSearchValue(searchInput.value), 100);
  });
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !searchInput.value) return;
    event.preventDefault();
    setSearchValue("");
  });
  searchClearButton?.addEventListener("click", () => {
    setSearchValue("");
    searchInput?.focus({ preventScroll: true });
  });
  panel?.addEventListener("kroki:rail-menu-open", ensureRendered);
  if (panel && !panel.classList.contains("gizli")) ensureRendered();

  Kroki.TrafficSignLibrary = {
    render: ensureRendered,
    getSelectedSign: selectedSign
  };
})();
