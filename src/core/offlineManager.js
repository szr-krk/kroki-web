(() => {
  if (window.parent !== window) return;
  const K = window.Kroki = window.Kroki || {};
  const build = document.querySelector('meta[name="kroki-build"]')?.content;
  const supported = /^https?:$/.test(location.protocol) && window.isSecureContext && "serviceWorker" in navigator;
  let registration = null, ready = false, downloading = false, failed = false;
  let connected = navigator.onLine, prepared = null;
  const labels = document.querySelectorAll("[data-offline-status]");

  // Pin all subresources of this tab to the release that produced its HTML.
  if (supported) {
    const url = new URL(location.href);
    url.searchParams.set("_kroki", build);
    history.replaceState(history.state, "", url.href);
  }
  function render() {
    const local = location.protocol === "file:";
    let text = local ? "Yerel dosya" : !supported ? "Çevrimdışı kurulum için HTTPS gerekli" :
      !connected ? (ready ? "Çevrimdışı kullanılıyor" : "Bağlantı yok · kurulum tamamlanmadı") :
      downloading ? (ready ? "Çevrimiçi · güncelleme indiriliyor" : "Çevrimiçi · çevrimdışı kullanım hazırlanıyor") :
      failed ? (ready ? "Çevrimiçi · mevcut sürüm hazır" : "Çevrimiçi · kurulum yeniden denenecek") :
      ready ? "Çevrimiçi · çevrimdışı kullanıma hazır" : "Çevrimiçi · çevrimdışı kullanım hazırlanıyor";
    document.documentElement.classList.toggle("kroki-is-offline", !connected || local);
    for (const label of labels) {
      label.textContent = text;
      label.title = text;
      label.setAttribute("aria-label", text);
    }
    for (const icon of document.querySelectorAll(".home-logo, .editor-grid-controls")) icon.title = text;
  }
  function reachability(value) { connected = value; render(); }
  function message(worker, data, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (!worker) { reject(Error("offline-worker-missing")); return; }
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(Error("offline-worker-timeout")); }, timeout);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      worker.postMessage(data, [channel.port2]);
    });
  }
  async function refresh() {
    if (!registration) return;
    try {
      const active = await message(registration.active, { type: "STATUS" });
      ready = active.ready;
    } catch { ready = false; }
    downloading = Boolean(registration.installing);
    render();
  }
  function observe(worker) {
    if (!worker) return;
    downloading = true; failed = false; render();
    worker.addEventListener("statechange", () => {
      if (worker.state === "redundant") failed = true;
      void refresh();
    });
  }
  async function start() {
    if (!supported) return null;
    try {
      registration = await navigator.serviceWorker.register(new URL("sw.js", document.baseURI), { updateViaCache: "none" });
      registration.addEventListener("updatefound", () => observe(registration.installing));
      observe(registration.installing);
      await refresh();
      // Persistent storage reduces automatic eviction. No user prompt or schema change.
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
      return registration;
    } catch { failed = true; render(); return null; }
  }
  const started = start();
  async function prepare(release) {
    if (!supported) return false;
    const reg = await started;
    if (!reg) throw Error("offline-registration-failed");
    async function candidate() {
      for (const worker of [reg.waiting, reg.active]) {
        if (!worker) continue;
        const status = await message(worker, { type: "STATUS" });
        if (status.ready && status.build === release.build && status.version === release.version) return worker;
      }
      return null;
    }
    let worker = await candidate();
    if (!worker) {
      await reg.update();
      // Installation may take time on the weak connections this feature is for.
      const deadline = Date.now() + 150000;
      while (Date.now() < deadline) {
        worker = await candidate();
        if (worker) break;
        if (!reg.installing) throw Error("offline-release-not-ready");
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    if (!worker) throw Error("offline-download-timeout");
    prepared = { worker, build: release.build };
    await refresh();
    return true;
  }
  async function activate(release) {
    if (!supported) return false;
    await prepare(release);
    const worker = prepared.worker;
    if (worker.state !== "activated") {
      await message(worker, { type: "ACTIVATE", build: release.build });
      const deadline = Date.now() + 15000;
      while (worker.state !== "activated" || navigator.serviceWorker.controller !== worker) {
        if (Date.now() > deadline) throw Error("offline-activation-timeout");
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    return true;
  }
  K.OfflineManager = { prepare, activate, reachability, getState: () => ({ supported, ready, connected, downloading, failed }) };
  window.addEventListener("offline", () => reachability(false));
  window.addEventListener("online", () => { reachability(true); if (registration) void registration.update().catch(() => {}); });
  if (supported) navigator.serviceWorker.addEventListener("controllerchange", () => { void refresh(); });
  render();
})();
