(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const catalog = Kroki.TrafficSignCatalog;
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  if (!catalog || !manager || !selection) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const categoryList = document.querySelector("#trafficSignCategoryList");
  const grid = document.querySelector("#trafficSignGrid");
  const selectedLabel = document.querySelector("#trafficSignSelectedLabel");
  const addButton = document.querySelector("#btnTrafficSignAdd");
  const panel = document.querySelector("#railMenuLevha");

  let activeCategoryKey = "";
  let selectedKey = "";

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
    if (selectedLabel) selectedLabel.textContent = "Seçilen levha: " + (sign?.name || "Yok");
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

  function renderSignArt(sign) {
    const svg = createSvgElement("svg", {
      viewBox: sign.viewBox,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true"
    });
    svg.innerHTML = sign.art;
    return svg;
  }

  function renderGrid() {
    if (!grid) return;
    const category = activeCategory();
    grid.replaceChildren();
    if (!category) {
      const empty = document.createElement("div");
      empty.className = "traffic-sign-empty";
      empty.textContent = "Levha katalogu bulunamadi.";
      grid.append(empty);
      setSelected(null);
      return;
    }

    category.signs.forEach((sign) => {
      const tile = document.createElement("button");
      tile.className = "traffic-sign-tile";
      tile.type = "button";
      tile.dataset.signKey = sign.key;
      tile.title = `${sign.code ? sign.code + " - " : ""}${sign.name}`;
      tile.setAttribute("aria-label", tile.title);
      tile.setAttribute("aria-pressed", "false");
      tile.append(renderSignArt(sign));
      tile.addEventListener("click", () => setSelected(sign));
      grid.append(tile);
    });
    syncTileSelection();
  }

  function setActiveCategory(key) {
    const nextKey = String(key || "");
    if (activeCategoryKey && activeCategoryKey !== nextKey) setSelected(null);
    activeCategoryKey = nextKey;
    categoryList?.querySelectorAll(".traffic-sign-category").forEach((button) => {
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
      button.className = "traffic-sign-category";
      button.type = "button";
      button.dataset.categoryKey = category.key;
      button.setAttribute("aria-pressed", "false");
      const title = document.createElement("span");
      const count = document.createElement("strong");
      title.textContent = category.title;
      count.textContent = String(category.signs.length);
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
    renderCategories();
  }

  addButton?.addEventListener("click", addSelectedSign);
  panel?.addEventListener("kroki:rail-menu-open", ensureRendered);
  ensureRendered();

  Kroki.TrafficSignLibrary = {
    render: ensureRendered,
    getSelectedSign: selectedSign
  };
})();
