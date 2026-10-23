(() => {
  const K = window.Kroki = window.Kroki || {};
  const version = document.querySelector('meta[name="kroki-version"]')?.content || "2.0";
  const build = document.querySelector('meta[name="kroki-build"]')?.content || "";
  const versionLabel = document.querySelector("#homeVersion");
  if (versionLabel) {
    versionLabel.textContent = version;
    versionLabel.setAttribute("aria-label", "Sürüm " + version);
    versionLabel.title = "Yayın " + build;
  }
  const RESUME_KEY = "kroki.update.resume.v1";
  const INTERVAL = 5 * 60 * 1000;
  const enabled = /^https?:$/.test(location.protocol);
  const pointers = new Set();
  let pending = null, deferred = false, checking = false, prompting = false, applying = false;
  let lastCheck = 0, promptTimer = 0;

  function compare(a, b) {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const difference = (x[i] || 0) - (y[i] || 0);
      if (difference) return difference;
    }
    return 0;
  }
  function newer(release) {
    return compare(release.version, version) > 0 ||
      (compare(release.version, version) === 0 && compare(release.build, build) > 0);
  }
  function valid(release) {
    return release?.app === "Kroki" && /^\d+\.\d+(?:\.\d+){0,2}$/.test(release.version) &&
      /^\d{8}\.\d{1,6}$/.test(release.build);
  }
  function inEditor() { return !document.querySelector("#editor")?.classList.contains("gizli"); }
  function busy() {
    return document.hidden || pointers.size > 0 || Boolean(
      document.activeElement?.matches?.('input, textarea, [contenteditable="true"]') ||
      document.querySelector('.kroki-dialog-layer:not(.gizli), .kroki-preview-layer, .modal-panel:not(.gizli), .rail-menu-panel:not(.gizli), #freeTextComposer:not(.gizli), #closedShapeDraftPanel:not(.gizli)')
    );
  }
  async function fresh(url, asJson = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error("update-http-" + response.status);
      return await (asJson ? response.json() : response.text());
    } finally { clearTimeout(timer); }
  }
  function savingCover() {
    const cover = document.createElement("div");
    cover.className = "kroki-update-saving";
    cover.setAttribute("role", "status");
    cover.setAttribute("aria-live", "polite");
    cover.textContent = "Çiziminiz güvenle kaydediliyor. Lütfen bekleyin…";
    document.body.append(cover);
    return cover;
  }
  async function apply() {
    if (!enabled || !pending || applying || pointers.size || document.hidden) return false;
    applying = true;
    clearTimeout(promptTimer);
    const cover = savingCover();
    const stopKeys = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const inputEvents = ["keydown", "pointerdown", "drop", "paste"];
    inputEvents.forEach(name => document.addEventListener(name, stopKeys, true));
    try {
      const destination = new URL(location.href);
      destination.searchParams.set("_kroki", pending.build);
      destination.hash = "";
      // Do not leave a drawing for a manifest published before the actual HTML.
      const text = await fresh(destination.href);
      const html = new DOMParser().parseFromString(text, "text/html");
      if (html.querySelector('meta[name="kroki-build"]')?.content !== pending.build ||
          html.querySelector('meta[name="kroki-version"]')?.content !== pending.version) {
        throw new Error("update-release-not-ready");
      }
      const checkpoint = await window.KrokiMainMenu.prepareUpdate();
      const token = { ...checkpoint, target: pending.build, version: pending.version };
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(token));
      if (sessionStorage.getItem(RESUME_KEY) !== JSON.stringify(token)) throw new Error("update-token-write-failed");
      cover.textContent = "Yeni sürüm açılıyor…";
      location.replace(destination.href);
      return true;
    } catch (error) {
      deferred = true;
      cover.remove();
      inputEvents.forEach(name => document.removeEventListener(name, stopKeys, true));
      applying = false;
      await K.Dialog.alert("Güncelleme tamamlanamadı. Sayfa yenilenmedi; çiziminiz açık ve korunuyor. Daha sonra yeniden deneyebilirsiniz.", "Güncelleme");
      return false;
    }
  }
  function schedulePrompt() {
    clearTimeout(promptTimer);
    if (!pending || deferred || applying) return;
    promptTimer = setTimeout(() => { void offer(); }, 1000);
  }
  async function offer() {
    if (!pending || deferred || applying || prompting) return;
    if (busy()) { schedulePrompt(); return; }
    prompting = true;
    try {
      const editing = inEditor();
      const answer = await K.Dialog.choice({
        kind: "update",
        title: "Yeni güncelleme mevcut",
        message: `Kroki ${pending.version} sürümü hazır. ` + (editing
          ? "Şimdi güncellerseniz çiziminiz kaydedilir ve yeni sürümde yeniden açılır."
          : "Yeni sürümü şimdi açabilirsiniz."),
        actions: [
          { label: "Evet, güncelle", value: "update", variant: "primary" },
          { label: editing ? "Hayır, bu çizim bittikten sonra güncelle" : "Daha sonra", value: "later" }
        ]
      });
      if (answer === "update") await apply();
      else deferred = true;
    } finally { prompting = false; }
  }
  async function check(options = {}) {
    if (!enabled || checking || applying || document.hidden) return false;
    if (!options.force && Date.now() - lastCheck < 60000) return false;
    checking = true;
    lastCheck = Date.now();
    try {
      const url = new URL("src/version.json", document.baseURI);
      url.searchParams.set("t", String(Math.floor(Date.now() / 60000)));
      const release = await fresh(url.href, true);
      if (!valid(release) || !newer(release)) return false;
      if (pending?.build !== release.build || pending?.version !== release.version) {
        pending = release;
        deferred = false;
        schedulePrompt();
      }
      return true;
    } catch { return false; }
    finally { checking = false; }
  }
  async function restore() {
    let raw;
    try { raw = sessionStorage.getItem(RESUME_KEY); } catch { return; }
    if (!raw) return;
    try {
      const token = JSON.parse(raw);
      if (token.resume) {
        if (typeof token.id !== "string" || !token.id.startsWith("update_")) throw new Error("invalid-update-checkpoint");
        await window.KrokiMainMenu.restoreUpdate(token.id);
      }
      sessionStorage.removeItem(RESUME_KEY);
      if (token.target !== build) {
        K.Dialog.toast("Çiziminiz açıldı. Sunucu henüz yeni sürümü sunmuyor; güncellemeyi daha sonra tekrar deneyin.");
      } else K.Dialog.toast(token.resume ? "Güncelleme tamamlandı. Çiziminiz geri yüklendi." : "Güncelleme tamamlandı.");
    } catch {
      await K.Dialog.alert("Güncelleme öncesi kayıt otomatik açılamadı. Kayıt silinmedi; Son Krokiler listesindeki ‘Güncelleme öncesi kroki’ kaydını açabilirsiniz.", "Çizimi yeniden açma");
    }
  }
  K.UpdateManager = {
    check,
    apply,
    getState() { return { version, build, pending: pending && { ...pending }, deferred, applying, enabled }; }
  };
  window.addEventListener("pointerdown", event => pointers.add(event.pointerId), { capture: true, passive: true });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    window.addEventListener(name, event => pointers.delete(event.pointerId), { capture: true, passive: true });
  }
  window.addEventListener("blur", () => pointers.clear());
  window.addEventListener("kroki:home-shown", () => {
    if (pending && deferred) setTimeout(() => { if (!inEditor() && !busy()) void apply(); }, 0);
  });
  window.addEventListener("online", () => { void check(); });
  window.addEventListener("focus", () => { void check(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void check(); });
  void restore().then(() => {
    if (!enabled) return;
    setTimeout(() => { void check({ force: true }); }, 3000);
    setInterval(() => { void check(); }, INTERVAL);
  });
})();
