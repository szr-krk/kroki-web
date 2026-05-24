const railMenuButtons = Array.from(document.querySelectorAll("[data-rail-menu-target]"));
const railMenuPanels = Array.from(document.querySelectorAll(".rail-menu-panel"));
const cizimToolButtons = Array.from(document.querySelectorAll("#gridCizimAraclari .rail-tool-btn[data-arac]"));
const cizimRailButton = document.querySelector("#btnCizimAraclari");
const editorFloatingFitButton = document.querySelector("#btnEditorFitScreen");
const editorFloatingFullscreenButton = document.querySelector("#btnEditorTamEkran");
const editorFloatingScreen = document.querySelector("#editor");
const cizimRailDefaultNodes = Array.from(cizimRailButton?.childNodes || []).map((node) => node.cloneNode(true));
const cizimRailDefaultLabel = cizimRailButton?.getAttribute("aria-label") || "";
const cizimRailDefaultTitle = cizimRailButton?.getAttribute("title") || "";

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
}

railMenuButtons.forEach((button) => {
  button.addEventListener("click", () => openRailMenu(button));
});

function fitEditorToScreen(event) {
  event?.preventDefault();
  event?.stopPropagation();
  closeRailMenus();
  window.krokiEditorCamera?.resetViewBox?.();
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
      const target = editorFloatingScreen && !editorFloatingScreen.classList.contains("gizli") ? editorFloatingScreen : document.documentElement;
      await target.requestFullscreen?.();
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
