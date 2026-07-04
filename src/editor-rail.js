const railMenuButtons = Array.from(document.querySelectorAll("[data-rail-menu-target]"));
const railMenuPanels = Array.from(document.querySelectorAll(".rail-menu-panel"));
const cizimToolButtons = Array.from(document.querySelectorAll("#gridCizimAraclari .rail-tool-btn[data-arac]"));
const cizimRailButton = document.querySelector("#btnCizimAraclari");
const editorFloatingFitButton = document.querySelector("#btnEditorFitScreen");
const editorFloatingFullscreenButton = document.querySelector("#btnEditorTamEkran");
const editorCanvas = document.querySelector("#editorCanvas");
const fitBaseViewBox = readFitViewBox(editorCanvas);
const cizimRailDefaultNodes = Array.from(cizimRailButton?.childNodes || []).map((node) => node.cloneNode(true));
const cizimRailDefaultLabel = cizimRailButton?.getAttribute("aria-label") || "";
const cizimRailDefaultTitle = cizimRailButton?.getAttribute("title") || "";
const FIT_PADDING_PX = 56;

function readFitViewBox(svg = editorCanvas) {
  const values = (svg?.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  }
  return { x: 0, y: 0, width: 1200, height: 800 };
}

function isFiniteFitBounds(bounds) {
  return Boolean(
    bounds &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width >= 0 &&
    bounds.height >= 0
  );
}

function resetFitViewBox() {
  if (!editorCanvas) return fitBaseViewBox;
  editorCanvas.setAttribute("viewBox", `${fitBaseViewBox.x} ${fitBaseViewBox.y} ${fitBaseViewBox.width} ${fitBaseViewBox.height}`);
  editorCanvas.dispatchEvent(new CustomEvent("kroki:viewboxchange", { bubbles: true, detail: fitBaseViewBox }));
  return fitBaseViewBox;
}

function writeFitViewBox(viewBox) {
  if (!editorCanvas) return null;
  const safeViewBox = {
    x: Number.isFinite(viewBox.x) ? viewBox.x : fitBaseViewBox.x,
    y: Number.isFinite(viewBox.y) ? viewBox.y : fitBaseViewBox.y,
    width: Number.isFinite(viewBox.width) && viewBox.width > 0 ? viewBox.width : fitBaseViewBox.width,
    height: Number.isFinite(viewBox.height) && viewBox.height > 0 ? viewBox.height : fitBaseViewBox.height
  };
  editorCanvas.setAttribute("viewBox", `${safeViewBox.x} ${safeViewBox.y} ${safeViewBox.width} ${safeViewBox.height}`);
  editorCanvas.dispatchEvent(new CustomEvent("kroki:viewboxchange", { bubbles: true, detail: safeViewBox }));
  return safeViewBox;
}

function fitViewBoxForBounds(bounds) {
  const rect = editorCanvas?.getBoundingClientRect?.();
  const rectWidth = Number.isFinite(rect?.width) && rect.width > 0 ? rect.width : fitBaseViewBox.width;
  const rectHeight = Number.isFinite(rect?.height) && rect.height > 0 ? rect.height : fitBaseViewBox.height;
  const maxPadding = Math.max(0, Math.min(rectWidth, rectHeight) / 2 - 1);
  const paddingPx = Math.min(maxPadding, FIT_PADDING_PX);
  const availableWidth = Math.max(1, rectWidth - paddingPx * 2);
  const availableHeight = Math.max(1, rectHeight - paddingPx * 2);
  const aspect = fitBaseViewBox.width / fitBaseViewBox.height;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  let width = Math.max(1, bounds.width) * rectWidth / availableWidth;
  let height = Math.max(1, bounds.height) * rectHeight / availableHeight;

  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;

  width = Math.max(fitBaseViewBox.width / 64, Math.min(fitBaseViewBox.width / 0.05, width));
  height = width / aspect;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  };
}

function fitBoundsDirect(bounds) {
  if (!isFiniteFitBounds(bounds)) return resetFitViewBox();
  return writeFitViewBox(fitViewBoxForBounds(bounds));
}

function contentBoundsForFit() {
  const bounds = window.Kroki?.EditorObjectManager?.getContentBounds?.();
  return isFiniteFitBounds(bounds) ? bounds : null;
}

function closeRailMenus() {
  railMenuButtons.forEach((button) => {
    button.classList.remove("is-menu-open");
    button.setAttribute("aria-expanded", "false");
  });
  railMenuPanels.forEach((panel) => panel.classList.add("gizli"));
}

function openRailMenu(button) {
  const panel = document.getElementById(button.dataset.railMenuTarget);
  if (!panel) return;
  const isOpen = !panel.classList.contains("gizli");
  closeRailMenus();
  if (isOpen) return;
  button.classList.add("is-menu-open");
  button.setAttribute("aria-expanded", "true");
  panel.classList.remove("gizli");
  panel.dispatchEvent(new CustomEvent("kroki:rail-menu-open", { bubbles: true, detail: { id: panel.id } }));
}

railMenuButtons.forEach((button) => {
  button.addEventListener("click", () => openRailMenu(button));
});

function fitEditorToScreen(event) {
  event?.preventDefault();
  event?.stopPropagation();
  closeRailMenus();
  const camera = window.krokiEditorCamera;
  const bounds = contentBoundsForFit();
  if (bounds) {
    if (camera?.fitBounds) camera.fitBounds(bounds);
    else fitBoundsDirect(bounds);
    return;
  }
  if (camera?.fitToContent) camera.fitToContent();
  else if (camera?.resetViewBox) camera.resetViewBox();
  else resetFitViewBox();
}

function syncEditorFullscreenButton() {
  const active = Boolean(document.fullscreenElement);
  editorFloatingFullscreenButton?.classList.toggle("is-active", active);
  editorFloatingFullscreenButton?.setAttribute("aria-pressed", String(active));
  editorFloatingFullscreenButton?.setAttribute("aria-label", active ? "Tam ekrandan çık" : "Tam ekran");
  editorFloatingFullscreenButton?.setAttribute("title", active ? "Tam ekrandan çık" : "Tam ekran");
  if (editorFloatingFullscreenButton) editorFloatingFullscreenButton.textContent = active ? "Tam Ekrandan Çık" : "Tam Ekran";
}

async function toggleEditorFullscreen(event) {
  event?.preventDefault();
  event?.stopPropagation();
  closeRailMenus();

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen?.();
    }
  } catch {
    syncEditorFullscreenButton();
  }
}

editorFloatingFitButton?.addEventListener("click", fitEditorToScreen);
editorFloatingFullscreenButton?.addEventListener("click", toggleEditorFullscreen);
document.addEventListener("fullscreenchange", syncEditorFullscreenButton);
syncEditorFullscreenButton();

function selectCizimAraci(button) {
  cizimToolButtons.forEach((toolButton) => {
    toolButton.classList.toggle("is-selected", toolButton === button);
  });

  const icon = button.querySelector("svg")?.cloneNode(true);
  const label = button.getAttribute("aria-label") || button.title;
  window.Kroki?.SelectionManager?.clear?.();
  window.krokiEditorState.setActiveTool(button.dataset.arac);
  window.dispatchEvent(new CustomEvent("kroki:active-tool-change", { detail: { tool: button.dataset.arac || "" } }));

  if (cizimRailButton && icon) {
    icon.setAttribute("aria-hidden", "true");
    cizimRailButton.replaceChildren(icon);
    cizimRailButton.classList.add("is-tool-active");
    cizimRailButton.setAttribute("aria-label", `Çizim aracı: ${label}`);
    cizimRailButton.setAttribute("title", `Çizim aracı: ${label}`);
    cizimRailButton.dataset.arac = button.dataset.arac || "";
  }
}

function resetCizimAraci() {
  cizimToolButtons.forEach((toolButton) => toolButton.classList.remove("is-selected"));
  window.krokiEditorState.setActiveTool("");
  window.dispatchEvent(new CustomEvent("kroki:active-tool-change", { detail: { tool: "" } }));

  if (!cizimRailButton) return;
  cizimRailButton.replaceChildren(...cizimRailDefaultNodes.map((node) => node.cloneNode(true)));
  cizimRailButton.classList.remove("is-tool-active");
  cizimRailButton.setAttribute("aria-label", cizimRailDefaultLabel);
  cizimRailButton.setAttribute("title", cizimRailDefaultTitle);
  cizimRailButton.dataset.arac = "";
}

document.querySelectorAll("[data-rail-close]").forEach((button) => {
  button.addEventListener("click", closeRailMenus);
});

document.querySelectorAll("#railMenuAna .rail-menu-btn").forEach((button) => {
  button.addEventListener("click", closeRailMenus);
});

cizimToolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectCizimAraci(button);
    closeRailMenus();
  });
});

const ilkCizimAraci = cizimToolButtons.find((button) => button.classList.contains("is-selected"));
if (ilkCizimAraci) selectCizimAraci(ilkCizimAraci);

document.addEventListener("click", (event) => {
  const openPanel = railMenuPanels.find((panel) => (
    (panel.id === "railMenuAna" || panel.id === "railMenuCizim") && !panel.classList.contains("gizli")
  ));

  if (!openPanel) return;

  const ownerButton = railMenuButtons.find((button) => button.dataset.railMenuTarget === openPanel.id);
  if (openPanel.contains(event.target) || ownerButton?.contains(event.target)) return;

  closeRailMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeRailMenus();
});

window.krokiEditorRail = { closeRailMenus, resetCizimAraci, selectCizimAraci };
