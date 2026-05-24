(() => {
  const Kroki = window.Kroki = window.Kroki || {};

  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 120;
  const listeners = new Set();
  let suspended = 0;

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  function sameSnapshot(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function inputOwnsShortcut(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  function captureState() {
    const documentState = Kroki.DocumentSerializer?.exportDocument?.({ stableTimestamps: true });
    if (!documentState) return null;
    return {
      document: documentState,
      selection: Kroki.SelectionManager?.getState?.() || null,
      multiSelection: Kroki.MultiSelectManager?.getState?.() || null
    };
  }

  function restoreState(state) {
    if (!state?.document) return;
    suspend(() => {
      Kroki.SelectionManager?.clear?.({ silent: true });
      Kroki.MultiSelectManager?.clear?.({ silent: true });
      Kroki.DocumentSerializer?.importDocument?.(state.document, { skipHistory: true });
      if (state.multiSelection?.ids?.length) Kroki.MultiSelectManager?.restoreState?.(state.multiSelection);
      else if (state.selection?.id) Kroki.SelectionManager?.restoreState?.(state.selection);
      else {
        Kroki.ControlPointManager?.clear?.();
        Kroki.StyleManager?.syncControls?.();
      }
    });
  }

  function trimUndoStack() {
    while (undoStack.length > MAX_HISTORY) undoStack.shift();
  }

  function size() {
    return { undo: undoStack.length, redo: redoStack.length };
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function notifyChange() {
    const detail = { ...size(), canUndo: canUndo(), canRedo: canRedo() };
    window.dispatchEvent(new CustomEvent("kroki:historychange", { detail }));
    listeners.forEach((callback) => {
      try {
        callback(detail);
      } catch (error) {
        console.warn("Kroki history listener failed", error);
      }
    });
  }

  function push(command) {
    if (suspended || !command?.before || !command?.after || sameSnapshot(command.before, command.after)) return false;
    undoStack.push({
      label: command.label || "Islem",
      before: clonePlain(command.before),
      after: clonePlain(command.after)
    });
    trimUndoStack();
    redoStack.length = 0;
    notifyChange();
    return true;
  }

  function begin(label) {
    if (suspended) return null;
    return {
      label: label || "Islem",
      before: captureState()
    };
  }

  function commit(transaction, label) {
    if (!transaction?.before || suspended) return false;
    return push({
      label: label || transaction.label,
      before: transaction.before,
      after: captureState()
    });
  }

  function record(label, fn) {
    const transaction = begin(label);
    const result = typeof fn === "function" ? fn() : undefined;
    commit(transaction, label);
    return result;
  }

  function suspend(fn) {
    suspended += 1;
    try {
      return typeof fn === "function" ? fn() : undefined;
    } finally {
      suspended -= 1;
    }
  }

  function undo() {
    if (suspended || !undoStack.length) return false;
    const command = undoStack.pop();
    redoStack.push(command);
    restoreState(command.before);
    notifyChange();
    return true;
  }

  function redo() {
    if (suspended || !redoStack.length) return false;
    const command = redoStack.pop();
    undoStack.push(command);
    restoreState(command.after);
    notifyChange();
    return true;
  }

  function clear() {
    undoStack.length = 0;
    redoStack.length = 0;
    notifyChange();
  }

  function onChange(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    callback({ ...size(), canUndo: canUndo(), canRedo: canRedo() });
    return () => listeners.delete(callback);
  }

  function bindHistoryButtons() {
    const undoButton = document.querySelector("#btnEditorUndo");
    const redoButton = document.querySelector("#btnEditorRedo");
    if (!undoButton && !redoButton) return;
    const updateButtons = () => {
      if (undoButton) undoButton.disabled = !canUndo();
      if (redoButton) redoButton.disabled = !canRedo();
    };
    undoButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      undo();
    });
    redoButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      redo();
    });
    onChange(updateButtons);
  }

  document.addEventListener("keydown", (event) => {
    if (inputOwnsShortcut(event.target) || !event.ctrlKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" && event.shiftKey) {
      if (redo()) event.preventDefault();
      return;
    }
    if (key === "z") {
      if (undo()) event.preventDefault();
      return;
    }
    if (key === "y") {
      if (redo()) event.preventDefault();
    }
  });

  Kroki.HistoryManager = {
    begin,
    commit,
    record,
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    suspend,
    captureState,
    restoreState,
    onChange,
    isSuspended() {
      return suspended > 0;
    },
    clear,
    size
  };

  bindHistoryButtons();
})();
