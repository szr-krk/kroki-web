const tamEkranButton = document.querySelector("#btnHomeTamEkran");
const tamEkranLabel = document.querySelector("#lblHomeTamEkran");
const homeScreen = document.querySelector("#home");
const editorScreen = document.querySelector("#editor");
const modalPanels = Array.from(document.querySelectorAll(".modal-panel"));
const hazirKavsaklarListesi = document.querySelector("#hazirKavsaklarListesi");
let homeForcedFullscreenOffUntil = 0;

function homeCurrentFullscreenElement() {
  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement
    || null;
}

async function homeRequestAppFullscreen() {
  const target = document.documentElement;
  const request = target.requestFullscreen
    || target.webkitRequestFullscreen
    || target.mozRequestFullScreen
    || target.msRequestFullscreen;
  if (request) await request.call(target);
}

async function homeExitAppFullscreen() {
  const exit = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.mozCancelFullScreen
    || document.msExitFullscreen;
  if (exit) await exit.call(document);
}

function homeIsFullscreenForcedOff() {
  return homeForcedFullscreenOffUntil > Date.now();
}

function homeForceFullscreenOff(event) {
  const ms = Math.max(1000, Number(event?.detail?.ms) || 12000);
  homeForcedFullscreenOffUntil = Date.now() + ms;
  scheduleFullscreenLabelSync();
}

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
    img.loading = "lazy";
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
  const guideUrl = new URL("kilavuz.html", window.location.href).href;
  const guideWindow = window.open(guideUrl, "_blank");
  if (guideWindow) {
    try {
      guideWindow.opener = null;
      guideWindow.focus?.();
    } catch {
      // The guide is already open; browser security may block access to the new window handle.
    }
  } else {
    window.location.href = guideUrl;
  }
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

document.querySelector("#btnFotografYukle")?.addEventListener("click", () => {
  if (window.KrokiMainMenu?.importPhotoFile) window.KrokiMainMenu.importPhotoFile();
  else window.KrokiDialog?.alert("Fotoğraf yükleme hazırlanıyor.", "Fotoğraf Yükle");
});

hazirKavsaklarListesi?.addEventListener("click", (event) => {
  const button = event.target?.closest?.("[data-ready-drawing-id]");
  if (button) openReadyDrawing(button.dataset.readyDrawingId);
});

function syncFullscreenLabel() {
  const active = Boolean(homeCurrentFullscreenElement()) && !homeIsFullscreenForcedOff();
  tamEkranButton?.setAttribute("aria-pressed", active ? "true" : "false");
  tamEkranButton?.setAttribute("aria-label", active ? "Tam ekrandan çık" : "Tam ekran aç");
  if (tamEkranLabel) tamEkranLabel.textContent = active ? "Tam Ekrandan Çık" : "Tam Ekran Aç";
}

function scheduleFullscreenLabelSync() {
  syncFullscreenLabel();
  window.setTimeout(syncFullscreenLabel, 80);
  window.setTimeout(syncFullscreenLabel, 350);
  window.setTimeout(syncFullscreenLabel, 900);
}

tamEkranButton?.addEventListener("click", async () => {
  try {
    const apiActive = Boolean(homeCurrentFullscreenElement());
    const forcedOff = homeIsFullscreenForcedOff();
    const uiActive = apiActive && !forcedOff;
    homeForcedFullscreenOffUntil = 0;
    if (uiActive) await homeExitAppFullscreen();
    else {
      if (apiActive && forcedOff) {
        try {
          await homeExitAppFullscreen();
        } catch {
          // Request below is still attempted for the user's tap.
        }
      }
      await homeRequestAppFullscreen();
    }
  } catch {
    scheduleFullscreenLabelSync();
  }
  scheduleFullscreenLabelSync();
});

["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange", "visibilitychange"].forEach((eventName) => {
  document.addEventListener(eventName, scheduleFullscreenLabelSync);
});
["focus", "pageshow", "resize", "orientationchange", "kroki:fullscreen-state-sync"].forEach((eventName) => {
  window.addEventListener(eventName, scheduleFullscreenLabelSync);
});
window.addEventListener("kroki:fullscreen-force-off", homeForceFullscreenOff);
renderHazirKavsaklar();
scheduleFullscreenLabelSync();
