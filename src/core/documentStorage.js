(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const DATABASE_NAME = "krokiPro.documents.v1";
  const DATABASE_VERSION = 1;
  const DOCUMENT_STORE = "documents";
  const ASSET_STORE = "assets";
  const PHOTO_TOKEN = "__KROKI_PHOTO_ASSET__";
  const MAX_RECENTS = 10;

  let databasePromise = null;

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizedKind(value) {
    return value === "template" ? "template" : "recent";
  }

  function documentKey(kind, id) {
    return `${normalizedKind(kind)}:${String(id || "")}`;
  }

  function photoAssetId(kind, id) {
    return `${documentKey(kind, id)}:photo`;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("indexeddb-request-failed")), { once: true });
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(true), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error || new Error("indexeddb-transaction-aborted")), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error || new Error("indexeddb-transaction-failed")), { once: true });
    });
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("indexeddb-unavailable"));
        return;
      }
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
          const store = database.createObjectStore(DOCUMENT_STORE, { keyPath: "key" });
          store.createIndex("kind", "kind", { unique: false });
        }
        if (!database.objectStoreNames.contains(ASSET_STORE)) {
          database.createObjectStore(ASSET_STORE, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("indexeddb-open-failed")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("indexeddb-upgrade-blocked")), { once: true });
    });
    return databasePromise;
  }

  function dataUrlToBlob(value) {
    const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(String(value || ""));
    if (!match) return null;
    const binary = window.atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      if (!(blob instanceof Blob)) {
        reject(new Error("photo-asset-missing"));
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(reader.error || new Error("photo-asset-read-failed")), { once: true });
      reader.readAsDataURL(blob);
    });
  }

  function packEntry(kind, source) {
    const entry = clonePlain(source);
    const assetId = photoAssetId(kind, entry.id);
    const dataUrl = String(entry.document?.photoBackground?.dataUrl || "");
    const blob = dataUrlToBlob(dataUrl);
    if (blob) {
      entry.document.photoBackground.dataUrl = "";
      if (entry.previewSvg) entry.previewSvg = String(entry.previewSvg).split(dataUrl).join(PHOTO_TOKEN);
    }
    return {
      record: {
        key: documentKey(kind, entry.id),
        kind: normalizedKind(kind),
        id: String(entry.id || ""),
        createdAt: entry.createdAt || "",
        updatedAt: entry.updatedAt || "",
        photoAssetId: blob ? assetId : "",
        entry
      },
      asset: blob ? {
        id: assetId,
        blob,
        mimeType: blob.type,
        name: String(source.document?.photoBackground?.name || "Fotoğraf")
      } : null,
      assetId
    };
  }

  async function hydrateRecord(record, assetMap = null, options = {}) {
    if (!record?.entry) return null;
    const entry = clonePlain(record.entry);
    if (options.summary) delete entry.document;
    if (!record.photoAssetId) return entry;
    let asset = assetMap?.get(record.photoAssetId) || null;
    if (!asset) {
      const database = await openDatabase();
      const transaction = database.transaction(ASSET_STORE, "readonly");
      asset = await requestResult(transaction.objectStore(ASSET_STORE).get(record.photoAssetId));
    }
    if (!asset?.blob) return entry;
    const dataUrl = await blobToDataUrl(asset.blob);
    if (!options.summary && entry.document?.photoBackground) entry.document.photoBackground.dataUrl = dataUrl;
    if (entry.previewSvg) entry.previewSvg = String(entry.previewSvg).split(PHOTO_TOKEN).join(dataUrl);
    return entry;
  }

  async function putRaw(database, kind, entry) {
    if (!entry?.id) throw new Error("document-id-missing");
    const packed = packEntry(kind, entry);
    const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], "readwrite");
    transaction.objectStore(DOCUMENT_STORE).put(packed.record);
    if (packed.asset) transaction.objectStore(ASSET_STORE).put(packed.asset);
    else transaction.objectStore(ASSET_STORE).delete(packed.assetId);
    await transactionDone(transaction);
    return clonePlain(entry);
  }

  async function removeRaw(database, kind, id) {
    const transaction = database.transaction([DOCUMENT_STORE, ASSET_STORE], "readwrite");
    transaction.objectStore(DOCUMENT_STORE).delete(documentKey(kind, id));
    transaction.objectStore(ASSET_STORE).delete(photoAssetId(kind, id));
    await transactionDone(transaction);
    return true;
  }

  async function rawRecords(database, kind) {
    const transaction = database.transaction(DOCUMENT_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(DOCUMENT_STORE).getAll());
    return (records || [])
      .filter((record) => record.kind === normalizedKind(kind))
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  }

  async function pruneRecents(database) {
    const records = await rawRecords(database, "recent");
    for (const record of records.slice(MAX_RECENTS)) await removeRaw(database, "recent", record.id);
  }

  async function list(kind, options = {}) {
    const database = await openDatabase();
    const records = await rawRecords(database, kind);
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const assets = await requestResult(transaction.objectStore(ASSET_STORE).getAll());
    const assetMap = new Map((assets || []).map((asset) => [asset.id, asset]));
    const entries = await Promise.all(records.map((record) => hydrateRecord(record, assetMap, options)));
    return entries.filter(Boolean);
  }

  async function get(kind, id) {
    const database = await openDatabase();
    const transaction = database.transaction(DOCUMENT_STORE, "readonly");
    const record = await requestResult(transaction.objectStore(DOCUMENT_STORE).get(documentKey(kind, id)));
    return hydrateRecord(record);
  }

  async function put(kind, entry) {
    const database = await openDatabase();
    const saved = await putRaw(database, kind, entry);
    if (normalizedKind(kind) === "recent") await pruneRecents(database);
    return saved;
  }

  async function remove(kind, id) {
    const database = await openDatabase();
    return removeRaw(database, kind, id);
  }

  Kroki.DocumentStorage = {
    get,
    list,
    put,
    remove
  };
})();
