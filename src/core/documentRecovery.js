(() => {
  const K = window.Kroki;
  const storage = K?.DocumentStorage;
  if (!storage) return;
  const pointers = new Set();
  const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let session = id(), documentId = "", active = false, revision = 0, savedRevision = 0;
  let timer = 0, idle = 0, writing = null, slot = 0, lastWrite = 0, lastStamp = 0, firstDirty = 0;
  let photoSource = "", photoKey = "", failures = 0, warned = false, sourceSession = "";
  let releaseLock = null;

  function cancelSchedule() {
    clearTimeout(timer);
    timer = 0;
    if (idle) window.cancelIdleCallback?.(idle);
    idle = 0;
  }

  function warn() {
    if (warned) return;
    warned = true;
    window.KrokiDialog?.toast?.("Otomatik kurtarma kaydı alınamadı. Çiziminizi Kaydet menüsünden kaydedin.", "Kurtarma Kaydı");
  }

  function schedule() {
    cancelSchedule();
    if (!active || revision === savedRevision || pointers.size || writing) return;
    // Debounce completed edits, cap postponement, and limit writes to once per two seconds.
    const now = Date.now();
    const delay = Math.max(lastWrite + 2000 - now, Math.min(1000, Math.max(0, firstDirty + 8000 - now)), failures ? Math.min(30000, 2000 * 2 ** failures) : 0);
    timer = window.setTimeout(() => {
      timer = 0;
      if (window.requestIdleCallback) idle = window.requestIdleCallback(() => { idle = 0; void flush(); }, { timeout: 500 });
      else void flush();
    }, delay);
  }

  function markDirty() {
    if (!active) return;
    if (revision === savedRevision) firstDirty = Date.now();
    revision += 1;
    schedule();
  }

  async function flush(background = false) {
    cancelSchedule();
    if (!active || revision === savedRevision || (!background && pointers.size)) return;
    if (writing) return writing;
    const savedSession = session, savedVersion = revision, savedSlot = slot;
    writing = (async () => {
      try {
        const doc = K.DocumentSerializer.exportDocument({ stableTimestamps: true });
        const dataUrl = doc.photoBackground?.dataUrl || "";
        const nextPhotoKey = dataUrl ? (dataUrl === photoSource ? photoKey : `${savedSession}:photo:${id()}`) : "";
        const stamp = Math.max(Date.now(), lastStamp + 1);
        if (doc.photoBackground) doc.photoBackground.dataUrl = "";
        await storage.putRecovery({
          key: `${savedSession}:${savedSlot}`, session: savedSession, slot: savedSlot,
          updatedAt: stamp, documentId, document: doc, photoKey: nextPhotoKey
        }, dataUrl && nextPhotoKey !== photoKey ? { key: nextPhotoKey, session: savedSession, dataUrl } : null);
        if (session !== savedSession) return;
        savedRevision = savedVersion;
        slot = 1 - savedSlot;
        photoSource = dataUrl;
        photoKey = nextPhotoKey;
        lastWrite = Date.now();
        lastStamp = stamp;
        failures = 0;
        warned = false;
        if (sourceSession) {
          await storage.removeRecovery(sourceSession);
          sourceSession = "";
        }
      } catch (error) {
        if (session !== savedSession) return;
        failures += 1;
        console.warn("Kroki recovery save failed", error);
        warn();
      }
    })();
    try { await writing; }
    finally {
      writing = null;
      if (active && revision !== savedRevision && document.hidden && !failures) void flush(true);
      else schedule();
    }
  }

  function stop() {
    active = false;
    cancelSchedule();
    pointers.clear();
    const oldSession = session;
    const oldSource = sourceSession;
    const pending = writing || Promise.resolve();
    releaseLock?.();
    releaseLock = null;
    session = id();
    revision = savedRevision = slot = lastWrite = lastStamp = failures = 0;
    photoSource = photoKey = documentId = sourceSession = "";
    void pending.then(async () => {
      await storage.removeRecovery(oldSession);
      if (oldSource) await storage.removeRecovery(oldSource);
    }).catch(warn);
  }

  function start(options = {}) {
    stop();
    active = true;
    documentId = options.documentId || "";
    sourceSession = options.sourceSession || "";
    if (navigator.locks) {
      const lockSession = session;
      void navigator.locks.request(`kroki-recovery:${lockSession}`, () => {
        if (session !== lockSession || !active) return;
        return new Promise(resolve => { releaseLock = resolve; });
      }).catch(() => {});
    }
    if (options.dirty) markDirty();
  }

  window.addEventListener("kroki:historychange", markDirty);
  document.addEventListener("pointerdown", event => {
    if (!active || !event.target.closest?.("#editor")) return;
    pointers.add(event.pointerId);
    cancelSchedule();
  }, true);
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    window.addEventListener(name, event => { pointers.delete(event.pointerId); schedule(); });
  }
  window.addEventListener("blur", () => { pointers.clear(); schedule(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { pointers.clear(); void flush(true); }
    else schedule();
  });
  window.addEventListener("pagehide", () => { void flush(true); });

  K.DocumentRecovery = {
    start, stop, markDirty, flush,
    setDocumentId(value) { documentId = value || ""; },
    async candidates() {
      const records = await storage.listRecovery();
      const held = navigator.locks ? (await navigator.locks.query()).held.map(lock => lock.name) : [];
      return records.filter(record => !held.includes(`kroki-recovery:${record.session}`));
    },
    read: storage.readRecovery,
    discard: storage.removeRecovery
  };
})();
