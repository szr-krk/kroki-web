const tamEkranButton = document.querySelector("#btnHomeTamEkran");
const tamEkranLabel = document.querySelector("#lblHomeTamEkran");
const homeScreen = document.querySelector("#home");
const editorScreen = document.querySelector("#editor");
const modalPanels = Array.from(document.querySelectorAll(".modal-panel"));

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
  button.addEventListener("click", () => openModal(button.dataset.modalTarget));
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
syncFullscreenLabel();
