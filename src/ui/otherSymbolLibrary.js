(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const catalog = Kroki.OtherSymbolCatalog;
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  if (!catalog || !manager || !selection) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const categoryList = document.querySelector("#otherSymbolCategoryList");
  const grid = document.querySelector("#otherSymbolGrid");
  const selectedLabel = document.querySelector("#otherSymbolSelectedLabel");
  const addButton = document.querySelector("#btnOtherSymbolAdd");
  const panel = document.querySelector("#railMenuDiger");

  let activeCategoryKey = "";
  let selectedKey = "";

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
    const svg = createSvgElement("svg", {
      viewBox: symbol.viewBox,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true"
    });
    svg.innerHTML = symbol.art;
    return svg;
  }

  function renderGrid() {
    if (!grid) return;
    const category = activeCategory();
    grid.replaceChildren();
    if (!category) {
      const empty = document.createElement("div");
      empty.className = "catalog-empty";
      empty.textContent = "Sembol katalogu bulunamadi.";
      grid.append(empty);
      setSelected(null);
      return;
    }

    category.symbols.forEach((symbol) => {
      const tile = document.createElement("button");
      tile.className = "catalog-tile";
      tile.type = "button";
      tile.dataset.symbolKey = symbol.key;
      tile.title = symbol.name || "Sembol";
      tile.setAttribute("aria-label", tile.title);
      tile.setAttribute("aria-pressed", "false");
      tile.append(renderSymbolArt(symbol));
      tile.addEventListener("click", () => setSelected(symbol));
      grid.append(tile);
    });
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
    categoryList.replaceChildren();
    allCategories.forEach((category) => {
      const button = document.createElement("button");
      button.className = "catalog-category";
      button.type = "button";
      button.dataset.categoryKey = category.key;
      button.setAttribute("aria-pressed", "false");
      const title = document.createElement("span");
      const count = document.createElement("strong");
      title.textContent = category.title;
      count.textContent = String(category.symbols.length);
      button.append(title, count);
      button.addEventListener("click", () => setActiveCategory(category.key));
      categoryList.append(button);
    });
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
    renderCategories();
  }

  addButton?.addEventListener("click", addSelectedSymbol);
  panel?.addEventListener("kroki:rail-menu-open", ensureRendered);
  ensureRendered();

  Kroki.OtherSymbolLibrary = {
    render: ensureRendered,
    getSelectedSymbol: selectedSymbol
  };
})();
