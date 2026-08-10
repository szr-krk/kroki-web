(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const catalog = Kroki.OtherSymbolCatalog;
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  const utils = Kroki.EditorUtils;
  if (!catalog || !manager || !selection || !utils) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const categoryList = document.querySelector("#otherSymbolCategoryList");
  const grid = document.querySelector("#otherSymbolGrid");
  const selectedLabel = document.querySelector("#otherSymbolSelectedLabel");
  const addButton = document.querySelector("#btnOtherSymbolAdd");
  const panel = document.querySelector("#railMenuDiger");
  const ART_CACHE_LIMIT = 64;

  let activeCategoryKey = "";
  let selectedKey = "";
  let rendered = false;
  const artCache = new Map();

  function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([name, value]) => {
      if (value != null) element.setAttribute(name, value);
    });
    return element;
  }

  function selectedSymbol() {
    return selectedKey ? catalog.find(selectedKey) : null;
  }

  function setSelected(symbol) {
    selectedKey = symbol?.key || "";
    if (selectedLabel) {
      selectedLabel.textContent = "Secilen sembol: " + (symbol ? symbol.name || "Sembol" : "Yok");
    }
    addButton?.classList.toggle("gizli", !selectedKey);
    syncTileSelection();
  }

  function syncTileSelection() {
    grid?.querySelectorAll(".catalog-tile").forEach((tile) => {
      const selected = tile.dataset.symbolKey === selectedKey;
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

  function renderSymbolArt(symbol) {
    const cacheKey = symbol?.key || "";
    const cached = cacheKey ? utils.lruGet(artCache, cacheKey) : null;
    if (cached) return cached.cloneNode(true);
    const svg = createSvgElement("svg", {
      viewBox: symbol.viewBox,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true"
    });
    svg.innerHTML = symbol.art;
    if (cacheKey) utils.lruSet(artCache, cacheKey, svg, ART_CACHE_LIMIT);
    return svg.cloneNode(true);
  }

  function renderGrid() {
    if (!grid) return;
    const category = activeCategory();
    if (!category) {
      const empty = document.createElement("div");
      empty.className = "catalog-empty";
      empty.textContent = "Sembol katalogu bulunamadi.";
      grid.replaceChildren(empty);
      setSelected(null);
      return;
    }

    const fragment = document.createDocumentFragment();
    category.symbols.forEach((symbol) => {
      const tile = document.createElement("button");
      tile.className = "catalog-tile";
      tile.type = "button";
      tile.dataset.symbolKey = symbol.key;
      tile.title = symbol.name || "Sembol";
      tile.setAttribute("aria-label", tile.title);
      tile.setAttribute("aria-pressed", "false");
      tile.append(renderSymbolArt(symbol));
      fragment.append(tile);
    });
    grid.replaceChildren(fragment);
    syncTileSelection();
  }

  function setActiveCategory(key) {
    const nextKey = String(key || "");
    if (activeCategoryKey && activeCategoryKey !== nextKey) setSelected(null);
    activeCategoryKey = nextKey;
    categoryList?.querySelectorAll(".catalog-category").forEach((button) => {
      const selected = button.dataset.categoryKey === activeCategoryKey;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderGrid();
  }

  function renderCategories() {
    if (!categoryList) return;
    const allCategories = categories();
    const fragment = document.createDocumentFragment();
    allCategories.forEach((category) => {
      const button = document.createElement("button");
      button.className = "catalog-category";
      button.type = "button";
      button.dataset.categoryKey = category.key;
      button.setAttribute("aria-pressed", "false");
      const title = document.createElement("span");
      const count = document.createElement("strong");
      title.textContent = utils.turkishListLabel(category.title);
      count.textContent = String(category.symbols.length);
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

  function closePanel() {
    const ownerButton = document.querySelector("[data-rail-menu-target='railMenuDiger']");
    window.krokiEditorRail?.closeRailMenus?.();
    panel?.classList.add("gizli");
    ownerButton?.classList.remove("is-menu-open");
    ownerButton?.setAttribute("aria-expanded", "false");
  }

  function addSelectedSymbol(event) {
    event?.preventDefault();
    event?.stopPropagation();
    const symbol = selectedSymbol();
    if (!symbol) return;
    const model = manager.create("otherSymbol", {
      symbol,
      center: canvasCenter(),
      scale: symbol.baseScale
    }, { label: "Sembol ekle" });
    if (!model) return;
    selection.edit(model.id);
    closePanel();
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

  addButton?.addEventListener("click", addSelectedSymbol);
  grid?.addEventListener("click", (event) => {
    const tile = event.target.closest?.(".catalog-tile");
    if (!tile || !grid.contains(tile)) return;
    setSelected(catalog.find(tile.dataset.symbolKey));
  });
  categoryList?.addEventListener("click", (event) => {
    const button = event.target.closest?.(".catalog-category");
    if (!button || !categoryList.contains(button)) return;
    setActiveCategory(button.dataset.categoryKey);
  });
  panel?.addEventListener("kroki:rail-menu-open", ensureRendered);
  if (panel && !panel.classList.contains("gizli")) ensureRendered();

  Kroki.OtherSymbolLibrary = {
    render: ensureRendered,
    getSelectedSymbol: selectedSymbol
  };
})();
