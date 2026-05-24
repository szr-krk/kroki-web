(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  if (!utils) return;

  const groups = new Map();
  let groupSeed = 1;

  function clonePlain(value) {
    return utils.clonePlain(value);
  }

  function generateId() {
    let id;
    do {
      id = "grp_" + Date.now().toString(36) + "_" + (groupSeed += 1).toString(36);
    } while (groups.has(id));
    return id;
  }

  function sanitizeId(value, fallback) {
    const safe = String(value || "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/^([^a-zA-Z_])/, "_$1")
      .slice(0, 80);
    return safe || fallback || generateId();
  }

  function isObjectChild(id) {
    return Boolean(Kroki.EditorObjectManager?.get?.(id));
  }

  function isGroupChild(id) {
    return groups.has(id);
  }

  function childExists(id) {
    return isObjectChild(id) || isGroupChild(id);
  }

  function leafIdsForChild(childId, seen = new Set()) {
    if (isObjectChild(childId)) return [childId];
    const group = groups.get(childId);
    if (!group || seen.has(childId)) return [];
    seen.add(childId);
    return group.children.flatMap((id) => leafIdsForChild(id, seen));
  }

  function getLeafObjectIds(groupId) {
    return leafIdsForChild(groupId);
  }

  function getDescendantGroupIds(groupId, seen = new Set()) {
    const group = groups.get(groupId);
    if (!group || seen.has(groupId)) return [];
    seen.add(groupId);
    return group.children.flatMap((childId) => {
      if (!groups.has(childId)) return [];
      return [childId, ...getDescendantGroupIds(childId, seen)];
    });
  }

  function groupContainsGroup(sourceGroupId, targetGroupId, seen = new Set()) {
    if (!sourceGroupId || !targetGroupId || seen.has(sourceGroupId)) return false;
    const group = groups.get(sourceGroupId);
    if (!group) return false;
    seen.add(sourceGroupId);
    return group.children.some((childId) => childId === targetGroupId || groupContainsGroup(childId, targetGroupId, seen));
  }

  function uniqueExistingChildren(children, groupId = "") {
    const seen = new Set();
    return (Array.isArray(children) ? children : [])
      .map((id) => String(id || ""))
      .filter((id) => {
        if (!id || seen.has(id) || !childExists(id)) return false;
        if (id === groupId || groupContainsGroup(id, groupId)) return false;
        seen.add(id);
        return true;
      });
  }

  function normalizeGroup(group, options = {}) {
    const id = options.keepId === false ? generateId() : sanitizeId(group?.id, generateId());
    const children = uniqueExistingChildren(group?.children, id);
    if (children.length < 2) return null;
    return {
      id,
      name: String(group?.name || "Grup"),
      children,
      metadata: clonePlain(group?.metadata)
    };
  }

  function detachChildrenFromOtherGroups(children, keepGroupId = "") {
    const moving = new Set(children || []);
    const removedGroups = [];
    groups.forEach((group, id) => {
      if (id === keepGroupId) return;
      const nextChildren = group.children.filter((childId) => !moving.has(childId));
      if (nextChildren.length === group.children.length) return;
      if (nextChildren.length < 2) {
        removedGroups.push(id);
        return;
      }
      group.children = nextChildren;
    });
    removedGroups.forEach((id) => remove(id));
  }

  function syncLayers() {
    Kroki.EditorObjectManager?.syncGroupLayers?.();
  }

  function get(id) {
    const group = groups.get(id);
    return group ? clonePlain(group) : null;
  }

  function getRaw(id) {
    return groups.get(id) || null;
  }

  function getAll() {
    return Array.from(groups.values()).map(clonePlain);
  }

  function groupForObject(objectId) {
    const matches = [];
    for (const group of groups.values()) {
      if (getLeafObjectIds(group.id).includes(objectId)) matches.push(group);
    }
    const topMatches = matches.filter((group) => !matches.some((candidate) => candidate.id !== group.id && groupContainsGroup(candidate.id, group.id)));
    if (topMatches.length <= 1) return topMatches[0] ? clonePlain(topMatches[0]) : null;
    console.warn("Kroki group membership conflict", objectId);
    return null;
  }

  function clear() {
    groups.clear();
    syncLayers();
  }

  function add(group, options = {}) {
    const normalized = normalizeGroup(group, options);
    if (!normalized) return null;
    detachChildrenFromOtherGroups(normalized.children, normalized.id);
    groups.set(normalized.id, normalized);
    syncLayers();
    return clonePlain(normalized);
  }

  function remove(groupId, visited = new Set()) {
    const id = String(groupId || "");
    if (!id || visited.has(id)) return false;
    visited.add(id);
    const existed = groups.delete(id);
    const removedGroups = [];
    groups.forEach((group, parentId) => {
      const nextChildren = group.children.filter((childId) => childId !== id);
      if (nextChildren.length === group.children.length) return;
      if (nextChildren.length < 2) {
        removedGroups.push(parentId);
        return;
      }
      group.children = nextChildren;
    });
    removedGroups.forEach((parentId) => remove(parentId, visited));
    if (existed || removedGroups.length) syncLayers();
    return existed || removedGroups.length > 0;
  }

  function updateMetadata(groupId, updater) {
    const group = groups.get(groupId);
    if (!group) return null;
    const current = clonePlain(group.metadata);
    const next = typeof updater === "function" ? updater(current) : updater;
    group.metadata = clonePlain(next);
    return clonePlain(group);
  }

  function removeObject(objectId) {
    const removedGroups = [];
    groups.forEach((group, id) => {
      const nextChildren = group.children.filter((childId) => childId !== objectId);
      if (nextChildren.length === group.children.length) return;
      if (nextChildren.length < 2) {
        removedGroups.push(id);
        return;
      }
      group.children = nextChildren;
    });
    removedGroups.forEach((groupId) => remove(groupId));
    if (removedGroups.length) syncLayers();
    return removedGroups;
  }

  function removeObjects(objectIds) {
    const ids = new Set(objectIds || []);
    ids.forEach((id) => removeObject(id));
  }

  function createGroup(children, options = {}) {
    const transaction = options.skipHistory ? null : Kroki.HistoryManager?.begin?.("Grupla");
    const group = add({
      id: options.id,
      name: options.name || "Grup " + (groups.size + 1),
      children,
      metadata: options.metadata
    }, { keepId: options.keepId });
    if (group && transaction) Kroki.HistoryManager?.commit?.(transaction, "Grupla");
    return group;
  }

  function ungroup(groupId, options = {}) {
    const transaction = options.skipHistory ? null : Kroki.HistoryManager?.begin?.("Grubu coz");
    const removed = remove(groupId);
    if (removed && transaction) Kroki.HistoryManager?.commit?.(transaction, "Grubu coz");
    return removed;
  }

  function importGroups(nextGroups) {
    replaceGroups(nextGroups);
  }

  function replaceGroups(nextGroups) {
    clear();
    const sourceGroups = Array.isArray(nextGroups) ? nextGroups : [];
    const usedIds = new Set();
    const idMap = new Map();
    const drafts = sourceGroups.map((group) => {
      const sourceId = String(group?.id || "");
      let id = sanitizeId(sourceId, generateId());
      while (usedIds.has(id)) id = generateId();
      usedIds.add(id);
      if (sourceId && !idMap.has(sourceId)) idMap.set(sourceId, id);
      return { source: group, id };
    }).map((draft) => {
      const seen = new Set();
      const children = (Array.isArray(draft.source?.children) ? draft.source.children : [])
        .map((childId) => {
          const raw = String(childId || "");
          return idMap.get(raw) || raw;
        })
        .filter((childId) => {
          if (!childId || childId === draft.id || seen.has(childId)) return false;
          seen.add(childId);
          return true;
        });
      return {
        id: draft.id,
        name: String(draft.source?.name || "Grup"),
        children,
        metadata: clonePlain(draft.source?.metadata)
      };
    });
    const draftMap = new Map(drafts.map((draft) => [draft.id, draft]));
    const resolving = new Set();

    function resolveDraft(id) {
      if (groups.has(id)) return groups.get(id);
      const draft = draftMap.get(id);
      if (!draft || resolving.has(id)) return null;
      resolving.add(id);
      const seenChildren = new Set();
      const children = [];
      draft.children.forEach((childId) => {
        let resolvedId = "";
        if (isObjectChild(childId)) resolvedId = childId;
        else if (draftMap.has(childId) && resolveDraft(childId)) resolvedId = childId;
        if (!resolvedId || resolvedId === id || seenChildren.has(resolvedId)) return;
        seenChildren.add(resolvedId);
        children.push(resolvedId);
      });
      resolving.delete(id);
      if (children.length < 2) return null;
      const group = {
        id: draft.id,
        name: draft.name,
        children,
        metadata: clonePlain(draft.metadata)
      };
      groups.set(group.id, group);
      return group;
    }

    drafts.forEach((draft) => resolveDraft(draft.id));
    syncLayers();
  }

  function offsetMetadata(metadata, offset) {
    const next = clonePlain(metadata);
    if (offset && next?.frame) {
      next.frame.cx = Number(next.frame.cx || 0) + offset.dx;
      next.frame.cy = Number(next.frame.cy || 0) + offset.dy;
    }
    return next;
  }

  function cloneGroup(groupId, idMap, options = {}, isRoot = true) {
    const source = getRaw(groupId);
    if (!source) return null;
    const children = source.children.map((id) => {
      if (isObjectChild(id)) return idMap?.get?.(id);
      if (isGroupChild(id)) return cloneGroup(id, idMap, options, false)?.id;
      return "";
    }).filter(Boolean);
    return add({
      name: source.name,
      children,
      metadata: isRoot && options.metadata ? options.metadata : offsetMetadata(source.metadata, options.frameOffset)
    }, options);
  }

  Kroki.GroupManager = {
    generateId,
    sanitizeId,
    add,
    createGroup,
    ungroup,
    remove,
    updateMetadata,
    removeObject,
    removeObjects,
    clear,
    importGroups,
    replaceGroups,
    cloneGroup,
    get,
    getAll,
    getLeafObjectIds,
    getDescendantGroupIds,
    groupForObject,
    has(id) {
      return groups.has(id);
    }
  };
})();
