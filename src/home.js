(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const home = document.querySelector("#home");
  const fullscreenButton = document.querySelector("#btnHomeTamEkran");
  const fullscreenLabel = document.querySelector("#lblHomeTamEkran");
  const readyList = document.querySelector("#hazirKavsaklarListesi");
  const uploadModal = document.querySelector("#homeUploadModal");
  const uploadInput = document.querySelector("#homeUploadInput");
  const uploadError = document.querySelector("#homeUploadError");
  const guideModal = document.querySelector("#homeGuideModal");
  const dropOverlay = document.querySelector("#homeDropOverlay");
  const panels = { recent: "sonKrokilerListesi", template: "sablonlarimListesi", ready: "hazirKavsaklarListesi" };
  const titles = { recent: "Son Krokiler", template: "Şablonlarım", ready: "Hazır Çizimler" };
  let activeTab = "recent";
  let readyRendered = false;
  let modalFocus = null;
  let uploadKind = "svg";
  let selectedFile = null;
  let uploadBusy = false;
  let dragDepth = 0;
  let forcedFullscreenOffUntil = 0;
  let fullscreenPreferred = false;

  function currentFullscreen() {
    return document.fullscreenElement || document.webkitFullscreenElement
      || document.mozFullScreenElement || document.msFullscreenElement || null;
  }

  function requestFullscreen() {
    const target = document.documentElement;
    const request = target.requestFullscreen || target.webkitRequestFullscreen
      || target.mozRequestFullScreen || target.msRequestFullscreen;
    return request ? Promise.resolve(request.call(target)) : Promise.resolve();
  }

  function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen
      || document.mozCancelFullScreen || document.msExitFullscreen;
    return exit ? Promise.resolve(exit.call(document)) : Promise.resolve();
  }

  function restoreFullscreen() {
    if (fullscreenPreferred && !currentFullscreen() && Date.now() >= forcedFullscreenOffUntil) {
      void requestFullscreen().catch(() => {});
    }
  }

  function syncFullscreen() {
    const active = Boolean(currentFullscreen()) && Date.now() >= forcedFullscreenOffUntil;
    fullscreenButton.setAttribute("aria-pressed", String(active));
    fullscreenButton.setAttribute("aria-label", active ? "Tam ekrandan çık" : "Tam ekran aç");
    fullscreenButton.title = active ? "Tam ekrandan çık" : "Tam ekran aç";
    fullscreenLabel.textContent = active ? "Tam Ekrandan Çık" : "Tam Ekran";
  }

  function scheduleFullscreenSync() {
    syncFullscreen();
    window.setTimeout(syncFullscreen, 100);
    window.setTimeout(syncFullscreen, 400);
  }

  function syncCount() {
    document.querySelector("#homeListeAdet").textContent = document.getElementById(panels[activeTab]).dataset.count || "0";
  }

  function renderReady() {
    if (readyRendered) return;
    const items = (Kroki.ReadyDrawings || []).filter((item) => item && item.svg);
    const grid = document.createElement("div");
    grid.className = "stored-doc-list";
    items.forEach((item) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "stored-doc-card";
      card.dataset.readyDrawingId = item.id;
      const thumb = document.createElement("span");
      thumb.className = "stored-doc-thumb";
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(item.svg);
      const category = document.createElement("small");
      category.className = "stored-doc-category";
      category.textContent = item.category || "Hazır çizim";
      thumb.append(image, category);
      const meta = document.createElement("span");
      meta.className = "stored-doc-meta";
      const title = document.createElement("strong");
      title.textContent = item.title || "Hazır çizim";
      meta.append(title);
      card.append(thumb, meta);
      grid.append(card);
    });
    readyList.replaceChildren(grid);
    readyList.dataset.count = String(items.length);
    if (!items.length) readyList.textContent = "Hazır çizim bulunmuyor.";
    readyRendered = true;
  }

  function selectTab(kind) {
    if (!panels[kind]) return;
    activeTab = kind;
    if (kind === "ready") renderReady();
    home.querySelectorAll("[data-home-tab]").forEach((button) => {
      const selected = button.dataset.homeTab === kind;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    home.querySelectorAll("[data-home-panel]").forEach((panel) => panel.classList.toggle("gizli", panel.dataset.homePanel !== kind));
    document.querySelector("#homeListeBaslik").textContent = titles[kind];
    syncCount();
  }

  function trapFocus(event, container) {
    if (event.key !== "Tab") return;
    const nodes = Array.from(container.querySelectorAll('button:not([disabled]), input:not([hidden]), textarea, a[href], iframe, [tabindex="0"]'))
      .filter((node) => node.getClientRects().length && node.tabIndex >= 0);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  function clearUpload() {
    selectedFile = null;
    uploadInput.value = "";
    document.querySelector("#homeUploadCode").value = "";
    document.querySelector("#homeUploadFilename").textContent = "";
    document.querySelector("#homeUploadFilesize").textContent = "";
    document.querySelector("#homeUploadSelected").classList.add("gizli");
    document.querySelector("#homeUploadPick").classList.remove("gizli");
    uploadError.classList.add("gizli");
    uploadError.textContent = "";
  }

  function closeModals(restoreFocus = true) {
    home.querySelectorAll(".modal-panel").forEach((modal) => modal.classList.add("gizli"));
    clearUpload();
    dropOverlay.classList.add("gizli");
    dragDepth = 0;
    if (restoreFocus && modalFocus && !home.classList.contains("gizli")) modalFocus.focus({ preventScroll: true });
    modalFocus = null;
  }

  function openModal(modal) {
    const origin = document.activeElement;
    closeModals(false);
    modalFocus = origin;
    modal.classList.remove("gizli");
    modal.querySelector("button").focus({ preventScroll: true });
  }

  function selectUploadTab(kind) {
    uploadError.classList.add("gizli");
    home.querySelectorAll("[data-upload-tab]").forEach((button) => {
      const selected = button.dataset.uploadTab === kind;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    document.querySelector("#homeUploadFilePanel").classList.toggle("gizli", kind !== "file");
    document.querySelector("#homeUploadPastePanel").classList.toggle("gizli", kind !== "paste");
  }

  function openUpload(kind) {
    if (uploadBusy) return;
    uploadKind = kind === "image" ? "image" : "svg";
    openModal(uploadModal);
    selectUploadTab("file");
    const svg = uploadKind === "svg";
    uploadInput.accept = svg ? ".svg,image/svg+xml" : ".jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif";
    document.querySelector("#homeUploadTitle").textContent = svg ? "SVG Dosyası Yükle" : "Kaza Yeri Fotoğrafı Yükle";
    document.querySelector("#homeUploadHint").textContent = svg ? "Kroki Pro ile kaydedilmiş çiziminizi açın." : "Fotoğrafı çiziminizin altlığı olarak kullanın.";
    document.querySelector("#homeUploadFormats").textContent = svg ? "SVG" : "JPG, PNG, WebP, GIF, BMP, AVIF";
    document.querySelector("#homeUploadTabs").classList.toggle("gizli", !svg);
    document.querySelector("#homeUploadPick").focus({ preventScroll: true });
  }

  function showUploadError(message) {
    uploadError.textContent = message;
    uploadError.classList.remove("gizli");
  }

  function chooseFile(file) {
    if (!file || uploadBusy) return;
    const svg = /\.svg$/i.test(file.name) || file.type === "image/svg+xml";
    const photo = !svg && (/^image\//i.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name));
    if ((uploadKind === "svg" && !svg) || (uploadKind === "image" && !photo)) {
      showUploadError(uploadKind === "svg" ? "Lütfen bir SVG dosyası seçin." : "Lütfen desteklenen bir fotoğraf dosyası seçin.");
      return;
    }
    selectedFile = file;
    uploadError.classList.add("gizli");
    document.querySelector("#homeUploadPick").classList.add("gizli");
    document.querySelector("#homeUploadSelected").classList.remove("gizli");
    document.querySelector("#homeUploadFilename").textContent = file.name;
    document.querySelector("#homeUploadFilesize").textContent = file.size < 1048576
      ? Math.max(1, Math.round(file.size / 1024)) + " KB" : (file.size / 1048576).toFixed(1) + " MB";
    selectUploadTab("file");
    document.querySelector("#homeUploadConfirm").focus({ preventScroll: true });
  }

  async function confirmUpload(paste) {
    if (uploadBusy) return;
    const file = selectedFile;
    const code = document.querySelector("#homeUploadCode").value.trim();
    if (paste ? !code : !file) {
      showUploadError(paste ? "Önce SVG kodunu yapıştırın." : "Önce bir dosya seçin.");
      return;
    }
    restoreFullscreen();
    uploadBusy = true;
    uploadModal.setAttribute("aria-busy", "true");
    uploadModal.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    uploadError.classList.add("gizli");
    try {
      if (paste || uploadKind === "svg") await window.KrokiMainMenu.importKrokiSvgText(paste ? code : await file.text());
      else await window.KrokiMainMenu.importPhoto(file);
      if (home.classList.contains("gizli")) closeModals(false);
    } catch (error) {
      console.warn("Home import failed", error);
      showUploadError("Dosya okunamadı. Dosyanızı kontrol edip yeniden deneyin.");
    } finally {
      uploadBusy = false;
      uploadModal.removeAttribute("aria-busy");
      uploadModal.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  }

  home.querySelectorAll("[data-home-tab]").forEach((button) => {
    button.addEventListener("click", () => selectTab(button.dataset.homeTab));
  });
  readyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ready-drawing-id]");
    if (button) void window.KrokiMainMenu.openEntryPreview("ready", button.dataset.readyDrawingId);
  });
  home.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", () => closeModals()));
  home.querySelectorAll(".modal-panel").forEach((modal) => {
    modal.addEventListener("click", (event) => { if (event.target === modal && !uploadBusy) closeModals(); });
  });
  document.querySelector("#btnSvgYukle").addEventListener("click", () => openUpload("svg"));
  document.querySelector("#btnFotografYukle").addEventListener("click", () => openUpload("image"));
  document.querySelector("#homeUploadPick").addEventListener("click", () => uploadInput.click());
  document.querySelector("#homeUploadChange").addEventListener("click", () => uploadInput.click());
  uploadInput.addEventListener("change", () => chooseFile(uploadInput.files[0]));
  document.querySelector("#homeUploadConfirm").addEventListener("click", () => { void confirmUpload(false); });
  document.querySelector("#homeUploadPasteConfirm").addEventListener("click", () => { void confirmUpload(true); });
  home.querySelectorAll("[data-upload-tab]").forEach((button) => {
    button.addEventListener("click", () => selectUploadTab(button.dataset.uploadTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const kind = event.key === "Home" ? "file" : event.key === "End" ? "paste" : button.dataset.uploadTab === "file" ? "paste" : "file";
      selectUploadTab(kind);
      home.querySelector('[data-upload-tab="' + kind + '"]').focus();
    });
  });
  document.querySelector("#btnKlavuz").addEventListener("click", () => {
    openModal(guideModal);
    const frame = document.querySelector("#homeGuideFrame");
    if (!frame.getAttribute("src")) frame.src = "kilavuz.html";
  });
  document.querySelector("#homeGuideFrame").addEventListener("load", (event) => {
    event.target.contentWindow.addEventListener("keydown", (keyEvent) => { if (keyEvent.key === "Escape") closeModals(); });
  });

  home.addEventListener("dragenter", (event) => {
    if (!Array.from(event.dataTransfer.types).includes("Files") || uploadBusy) return;
    event.preventDefault();
    dragDepth += 1;
    dropOverlay.classList.remove("gizli");
  });
  home.addEventListener("dragover", (event) => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); });
  home.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropOverlay.classList.add("gizli");
  });
  home.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.add("gizli");
    const file = event.dataTransfer.files[0];
    if (!file || uploadBusy) return;
    if (uploadModal.classList.contains("gizli")) openUpload(/\.svg$/i.test(file.name) || file.type === "image/svg+xml" ? "svg" : "image");
    chooseFile(file);
  });
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const modal = home.querySelector(".modal-panel:not(.gizli)");
    if (!modal || document.querySelector(".kroki-dialog-layer:not(.gizli)")) return;
    if (event.key === "Escape" && !uploadBusy) {
      event.preventDefault();
      closeModals();
    }
    else trapFocus(event, modal);
  });
  fullscreenButton.addEventListener("click", async () => {
    const active = Boolean(currentFullscreen()) && Date.now() >= forcedFullscreenOffUntil;
    forcedFullscreenOffUntil = 0;
    fullscreenPreferred = !active;
    try {
      if (active) await exitFullscreen();
      else {
        if (currentFullscreen()) await exitFullscreen();
        await requestFullscreen();
      }
    } catch { /* Fullscreen is optional; keep the application usable. */ }
    scheduleFullscreenSync();
  });
  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange", "visibilitychange"].forEach((name) => document.addEventListener(name, scheduleFullscreenSync));
  ["focus", "pageshow", "resize", "orientationchange", "kroki:fullscreen-state-sync"].forEach((name) => window.addEventListener(name, scheduleFullscreenSync));
  window.addEventListener("kroki:fullscreen-force-off", (event) => {
    forcedFullscreenOffUntil = Date.now() + Math.max(1000, Number(event.detail && event.detail.ms) || 12000);
    scheduleFullscreenSync();
  });
  window.addEventListener("kroki:home-lists-rendered", syncCount);
  Kroki.Home = Object.freeze({ selectTab, closeModals, trapFocus, restoreFullscreen });
  selectTab("recent");
  syncFullscreen();
})();
