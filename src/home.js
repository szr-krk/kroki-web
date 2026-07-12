const tamEkranButton = document.querySelector("#btnHomeTamEkran");
const tamEkranLabel = document.querySelector("#lblHomeTamEkran");
const homeScreen = document.querySelector("#home");
const editorScreen = document.querySelector("#editor");
const modalPanels = Array.from(document.querySelectorAll(".modal-panel"));
const hazirKavsaklarListesi = document.querySelector("#hazirKavsaklarListesi");

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(svg || ""))}`;
}

function readyIntersections() {
  return (window.Kroki?.ReadyDrawings || []).filter((item) => item?.type === "intersection");
}

function renderHazirKavsaklar() {
  if (!hazirKavsaklarListesi) return;
  const items = readyIntersections();
  if (!items.length) {
    hazirKavsaklarListesi.textContent = "(Boş) - Hazır kavşaklar daha sonra doldurulacak.";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "stored-doc-list ready-drawing-list";
  items.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "stored-doc-card ready-drawing-card";
    card.dataset.readyDrawingId = item.id;

    const thumb = document.createElement("div");
    thumb.className = "stored-doc-thumb";
    const img = document.createElement("img");
    img.alt = item.title || "Hazır çizim";
    img.src = svgDataUrl(item.svg);
    thumb.append(img);

    const meta = document.createElement("div");
    meta.className = "stored-doc-meta";
    const title = document.createElement("strong");
    title.textContent = item.title || "Hazır çizim";
    const category = document.createElement("small");
    category.textContent = item.category || "Hazır çizim";
    meta.append(title, category);

    card.append(thumb, meta);
    grid.append(card);
  });
  hazirKavsaklarListesi.replaceChildren(grid);
}

function openReadyDrawing(id) {
  const item = readyIntersections().find((entry) => entry.id === id);
  if (!item?.svg) return;
  if (!window.KrokiMainMenu?.importKrokiSvgText) {
    window.KrokiDialog?.alert("Hazır çizim açma altyapısı yüklenmedi.", "Hazır Kavşaklar");
    return;
  }
  void window.KrokiMainMenu.importKrokiSvgText(item.svg);
}

function closeAllModals() {
  modalPanels.forEach((modal) => modal.classList.add("gizli"));
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  closeAllModals();
  modal.classList.remove("gizli");
}

document.querySelectorAll("[data-modal-target]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.modalTarget === "modalHazirKavsaklar") renderHazirKavsaklar();
    openModal(button.dataset.modalTarget);
  });
});

document.querySelectorAll("[data-modal-close]").forEach((button) => {
  button.addEventListener("click", closeAllModals);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAllModals();
});

document.querySelector("#btnKlavuz")?.addEventListener("click", () => {
  window.KrokiDialog?.alert("Kılavuz bölümü sonraki aşamada bağlanacak.", "Kılavuz");
});

document.querySelector("#btnYeniKroki")?.addEventListener("click", () => {
  closeAllModals();
  homeScreen?.classList.add("gizli");
  editorScreen?.classList.remove("gizli");
});

document.querySelector("#btnSvgYukle")?.addEventListener("click", () => {
  if (window.KrokiMainMenu?.importSvgFile) window.KrokiMainMenu.importSvgFile();
  else window.KrokiDialog?.alert("SVG yükleme hazırlanıyor.", "SVG Yükle");
});

hazirKavsaklarListesi?.addEventListener("click", (event) => {
  const button = event.target?.closest?.("[data-ready-drawing-id]");
  if (button) openReadyDrawing(button.dataset.readyDrawingId);
});

function syncFullscreenLabel() {
  const active = Boolean(document.fullscreenElement);
  tamEkranButton?.setAttribute("aria-pressed", active ? "true" : "false");
  tamEkranButton?.setAttribute("aria-label", active ? "Tam ekrandan çık" : "Tam ekran aç");
  if (tamEkranLabel) tamEkranLabel.textContent = active ? "Tam Ekrandan Çık" : "Tam Ekran Aç";
}

tamEkranButton?.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    syncFullscreenLabel();
  }
});

document.addEventListener("fullscreenchange", syncFullscreenLabel);
renderHazirKavsaklar();
syncFullscreenLabel();
