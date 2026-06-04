(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const manager = Kroki.EditorObjectManager;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !manager || !styleManager) return;

  const SCHEMA_VERSION = 1;
  const APP_NAME = "Kroki Pro";

  function clonePlain(value) {
    return utils.clonePlain(value);
  }

  function safeId(raw, fallback) {
    const id = String(raw || "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/^([^a-zA-Z_])/, "_$1")
      .slice(0, 80);
    return id || fallback || manager.generateId();
  }

  function cleanMetadata(metadata) {
    const clean = clonePlain(metadata);
    delete clean.draft;
    delete clean.pointEdit;
    delete clean.roadSelection;
    delete clean.roadBarrierEdit;
    return clean;
  }

  function sanitizeModel(model, idMap, usedIds, warnings) {
    const type = String(model?.type || "");
    if (!registry.has(type)) {
      warnings.push("Bilinmeyen nesne tipi atlandi: " + type);
      return null;
    }
    const requestedId = safeId(model?.id, manager.generateId());
    let id = requestedId;
    while (usedIds.has(id)) id = manager.generateId();
    usedIds.add(id);
    if (model?.id) idMap.set(String(model.id), id);
    return manager.normalizeModel({
      id,
      type,
      geometry: clonePlain(model?.geometry),
      style: styleManager.normalizeStyle(model?.style, type),
      label: styleManager.normalizeLabel(model?.label, type),
      metadata: cleanMetadata(model?.metadata)
    });
  }

  function normalizeGroups(groups, idMap, liveIds) {
    const sourceGroups = Array.isArray(groups) ? groups : [];
    const groupIdMap = new Map();
    const usedGroupIds = new Set();
    const drafts = sourceGroups.map((group) => {
      const sourceId = String(group?.id || "");
      let id = safeId(sourceId, Kroki.GroupManager?.generateId?.());
      while (usedGroupIds.has(id)) id = Kroki.GroupManager?.generateId?.() || safeId("", manager.generateId());
      usedGroupIds.add(id);
      if (sourceId && !groupIdMap.has(sourceId)) groupIdMap.set(sourceId, id);
      return { source: group, id };
    });
    const liveGroupIds = new Set(drafts.map((draft) => draft.id));
    return drafts
      .map((draft) => {
        const seenChildren = new Set();
        const children = (Array.isArray(draft.source?.children) ? draft.source.children : [])
          .map((childId) => {
            const raw = String(childId || "");
            const objectId = idMap.get(raw) || (liveIds.has(raw) ? raw : "");
            const groupId = groupIdMap.get(raw) || (liveGroupIds.has(raw) ? raw : "");
            return objectId || groupId;
          })
          .filter((childId) => {
            if (!childId || childId === draft.id || seenChildren.has(childId)) return false;
            if (!liveIds.has(childId) && !liveGroupIds.has(childId)) return false;
            seenChildren.add(childId);
            return true;
          });
        return {
          id: draft.id,
          name: String(draft.source?.name || "Grup"),
          children,
          metadata: clonePlain(draft.source?.metadata)
        };
      })
      .filter((group) => group.children.length >= 2);
  }

  function exportDocument(options = {}) {
    const now = options.stableTimestamps ? "" : new Date().toISOString();
    return {
      schemaVersion: SCHEMA_VERSION,
      app: APP_NAME,
      createdAt: now,
      updatedAt: now,
      viewport: {
        viewBox: manager.canvas?.getAttribute("viewBox") || "0 0 1200 800"
      },
      objects: manager.getAll().map((model) => ({
        id: model.id,
        type: model.type,
        geometry: clonePlain(model.geometry),
        style: styleManager.normalizeStyle(model.style, model.type),
        label: styleManager.normalizeLabel(model.label, model.type),
        metadata: cleanMetadata(model.metadata)
      })),
      groups: Kroki.GroupManager?.getAll?.() || [],
      roadIntersection: Kroki.RoadIntersectionEngine?.exportState?.() || null
    };
  }

  function importDocument(doc, options = {}) {
    const warnings = [];
    const source = doc && typeof doc === "object" ? doc : {};
    const idMap = new Map();
    const usedIds = new Set();
    const models = [];
    (Array.isArray(source.objects) ? source.objects : []).forEach((model) => {
      const normalized = sanitizeModel(model, idMap, usedIds, warnings);
      if (normalized) models.push(normalized);
    });

    const runImport = () => {
      Kroki.SelectionManager?.clear?.({ silent: true });
      Kroki.MultiSelectManager?.clear?.({ silent: true });
      manager.replaceAll(models, { skipHistory: true });
      if (source.viewport?.viewBox) manager.canvas?.setAttribute("viewBox", String(source.viewport.viewBox));
      const liveIds = new Set(models.map((model) => model.id));
      Kroki.GroupManager?.replaceGroups?.(normalizeGroups(source.groups, idMap, liveIds));
      manager.getObjectsInDomOrder().forEach((model) => manager.renderObject(model.id));
      Kroki.RoadIntersectionEngine?.importState?.(source.roadIntersection || null, { skipRefresh: true });
      Kroki.ControlPointManager?.clear?.();
      Kroki.StyleManager?.syncControls?.();
      Kroki.RoadIntersectionEngine?.scheduleRefresh?.();
    };

    if (Kroki.HistoryManager?.suspend) Kroki.HistoryManager.suspend(runImport);
    else runImport();

    if (!options.skipHistory) Kroki.HistoryManager?.clear?.();
    return { ok: true, warnings };
  }

  function toJson() {
    return JSON.stringify(exportDocument(), null, 2);
  }

  function fromJson(json, options = {}) {
    try {
      return importDocument(JSON.parse(String(json || "{}")), options);
    } catch (error) {
      console.warn("Kroki document parse failed", error);
      return { ok: false, warnings: ["JSON okunamadi"] };
    }
  }

  Kroki.DocumentSerializer = {
    exportDocument,
    importDocument,
    toJson,
    fromJson
  };
})();
