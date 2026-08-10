(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const catalog = Kroki.VehicleCatalog;
  const renderer = Kroki.VehicleRenderer;
  const manager = Kroki.EditorObjectManager;
  const selection = Kroki.SelectionManager;
  const utils = Kroki.EditorUtils;
  if (!catalog || !renderer || !manager || !selection || !utils) return;

  const typeList = document.querySelector("#vehicleTypeList");
  const grid = document.querySelector("#vehicleVariantGrid");
  const selectedLabel = document.querySelector("#vehicleSelectedLabel");
  const addButton = document.querySelector("#btnVehicleAdd");
  const panel = document.querySelector("#railMenuArac");
  const PREVIEW_CACHE_LIMIT = 96;

  let activeTypeId = "";
  let selectedKey = "";
  let rendered = false;
  const previewCache = new Map();

  function selectedVariant() {
    return selectedKey ? catalog.findVariant(selectedKey) : null;
  }

  function setSelected(variant) {
    selectedKey = variant?.key || "";
    if (selectedLabel) {
      selectedLabel.textContent = "Secilen arac: " + (variant ? `${variant.typeTitle} - ${variant.name}` : "Yok");
    }
    addButton?.classList.toggle("gizli", !selectedKey);
    syncTileSelection();
  }

  function syncTileSelection() {
    grid?.querySelectorAll(".vehicle-variant-tile").forEach((tile) => {
      const selected = tile.dataset.vehicleVariantKey === selectedKey;
      tile.classList.toggle("is-selected", selected);
      tile.setAttribute("aria-pressed", String(selected));
    });
  }

  function setActiveType(typeId) {
    const nextTypeId = String(typeId || "");
    if (activeTypeId && activeTypeId !== nextTypeId) setSelected(null);
    activeTypeId = nextTypeId;
    typeList?.querySelectorAll(".vehicle-type-button").forEach((button) => {
      const selected = button.dataset.vehicleTypeId === activeTypeId;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderVariants();
  }

  function renderVariantPreview(variant) {
    const cacheKey = variant?.key ? `${variant.key}:side` : "";
    const cached = cacheKey ? utils.lruGet(previewCache, cacheKey) : null;
    if (cached) return cached.cloneNode(true);
    const svg = renderer.renderPreviewSvg(variant, { view: "side" });
    if (cacheKey) utils.lruSet(previewCache, cacheKey, svg, PREVIEW_CACHE_LIMIT);
    return svg.cloneNode(true);
  }

  function renderTypes() {
    if (!typeList) return;
    const types = catalog.typeList();
    const fragment = document.createDocumentFragment();
    types.forEach((type) => {
      const button = document.createElement("button");
      button.className = "vehicle-type-button";
      button.type = "button";
      button.dataset.vehicleTypeId = type.id;
      button.setAttribute("aria-pressed", "false");

      const title = document.createElement("span");
      title.textContent = utils.turkishListLabel(type.title);
      const count = document.createElement("strong");
      count.textContent = String(type.variants.length);
      button.append(title, count);
      fragment.append(button);
    });
    typeList.replaceChildren(fragment);
    if (!activeTypeId && types[0]) activeTypeId = types[0].id;
    setActiveType(activeTypeId);
  }

  function renderVariants() {
    if (!grid) return;
    const variants = catalog.variantsForType(activeTypeId);
    if (!variants.length) {
      const empty = document.createElement("div");
      empty.className = "vehicle-empty";
      empty.textContent = "Bu tur icin arac bulunamadi.";
      grid.replaceChildren(empty);
      setSelected(null);
      return;
    }

    const fragment = document.createDocumentFragment();
    variants.forEach((variant) => {
      const tile = document.createElement("button");
      tile.className = "vehicle-variant-tile";
      tile.type = "button";
      tile.dataset.vehicleVariantKey = variant.key;
      tile.title = `${variant.typeTitle} - ${variant.name}`;
      tile.setAttribute("aria-label", tile.title);
      tile.setAttribute("aria-pressed", "false");

      const preview = document.createElement("div");
      preview.className = "vehicle-variant-preview";
      preview.append(renderVariantPreview(variant));

      const name = document.createElement("span");
      name.textContent = variant.name;
      tile.append(preview, name);
      fragment.append(tile);
    });
    grid.replaceChildren(fragment);
    syncTileSelection();
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
    const ownerButton = document.querySelector("[data-rail-menu-target='railMenuArac']");
    window.krokiEditorRail?.closeRailMenus?.();
    panel?.classList.add("gizli");
    ownerButton?.classList.remove("is-menu-open");
    ownerButton?.setAttribute("aria-expanded", "false");
  }

  function addSelectedVehicle(event) {
    event?.preventDefault();
    event?.stopPropagation();
    const variant = selectedVariant();
    if (!variant) return;
    const model = manager.create("vehicle", {
      variant,
      center: canvasCenter()
    }, { label: "Arac ekle" });
    if (!model) return;
    setSelected(null);
    closePanel();
    selection.edit(model.id);
  }

  function ensureRendered() {
    if (rendered) {
      syncTileSelection();
      return;
    }
    renderTypes();
    rendered = true;
  }

  addButton?.addEventListener("click", addSelectedVehicle);
  grid?.addEventListener("click", (event) => {
    const tile = event.target.closest?.(".vehicle-variant-tile");
    if (!tile || !grid.contains(tile)) return;
    setSelected(catalog.findVariant(tile.dataset.vehicleVariantKey));
  });
  typeList?.addEventListener("click", (event) => {
    const button = event.target.closest?.(".vehicle-type-button");
    if (!button || !typeList.contains(button)) return;
    setActiveType(button.dataset.vehicleTypeId);
  });
  panel?.addEventListener("kroki:rail-menu-open", ensureRendered);
  if (panel && !panel.classList.contains("gizli")) ensureRendered();

  Kroki.VehicleLibrary = {
    render: ensureRendered,
    getSelectedVariant: selectedVariant
  };
})();
