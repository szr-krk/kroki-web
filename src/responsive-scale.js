(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const REFERENCE_ROOT_SIZE = 16;
  const TEXT_ENTRY_SELECTOR = [
    "textarea",
    "input:not([type])",
    "input[type='text']",
    "input[type='search']",
    "input[type='email']",
    "input[type='number']",
    "input[type='tel']",
    "input[type='url']",
    "input[type='password']",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='textbox']"
  ].join(",");
  const TEXT_ENTRY_HOST_SELECTOR = [
    ".kroki-dialog-panel",
    ".free-text-composer",
    ".line-text-panel",
    ".road-departure-stepper",
    ".road-builder-stepper",
    ".road-ip-stepper",
    ".side-ip-stepper-vertical"
  ].join(",");
  const TOUCH_TEXT_ENTRY_QUERY = "(hover: none) and (pointer: coarse)";
  const touchTextEntryMedia = window.matchMedia?.(TOUCH_TEXT_ENTRY_QUERY) || null;
  const root = document.documentElement;
  let activeTextEntry = null;
  let activeTextEntryHost = null;
  let clearTextEntryTimer = 0;

  function scale() {
    const rootSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
    if (!Number.isFinite(rootSize) || rootSize <= 0) return 1;
    return rootSize / REFERENCE_ROOT_SIZE;
  }

  function px(referencePixels) {
    const value = Number(referencePixels);
    return (Number.isFinite(value) ? value : 0) * scale();
  }

  function isTextEntryControl(node) {
    return Boolean(node?.matches?.(TEXT_ENTRY_SELECTOR));
  }

  function syncTextEntryMode() {
    root.classList.toggle("kroki-touch-entry-mode", Boolean(touchTextEntryMedia?.matches));
  }

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth || root.clientWidth || 1;
    const height = viewport?.height || window.innerHeight || root.clientHeight || 1;
    const offsetTop = viewport?.offsetTop || 0;
    const offsetLeft = viewport?.offsetLeft || 0;

    root.style.setProperty("--kroki-visual-viewport-width", `${Math.max(1, width)}px`);
    root.style.setProperty("--kroki-visual-viewport-height", `${Math.max(1, height)}px`);
    root.style.setProperty("--kroki-visual-viewport-top", `${Math.max(0, offsetTop)}px`);
    root.style.setProperty("--kroki-visual-viewport-left", `${Math.max(0, offsetLeft)}px`);
  }

  function keepTextEntryVisible() {
    if (!activeTextEntry?.isConnected) return;
    window.requestAnimationFrame(() => {
      try {
        activeTextEntry.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {
        activeTextEntry.scrollIntoView?.();
      }
    });
  }

  function activateTextEntry(control) {
    window.clearTimeout(clearTextEntryTimer);
    syncVisualViewport();

    const host = control.closest?.(TEXT_ENTRY_HOST_SELECTOR) || control.parentElement;
    if (activeTextEntryHost && activeTextEntryHost !== host) {
      activeTextEntryHost.classList.remove("kroki-text-entry-host");
    }

    activeTextEntry = control;
    activeTextEntryHost = host || null;
    activeTextEntryHost?.classList.add("kroki-text-entry-host");
    root.classList.add("kroki-text-entry-active");
    keepTextEntryVisible();
    window.setTimeout(keepTextEntryVisible, 120);
  }

  function clearTextEntry() {
    activeTextEntryHost?.classList.remove("kroki-text-entry-host");
    activeTextEntry = null;
    activeTextEntryHost = null;
    root.classList.remove("kroki-text-entry-active");
  }

  function refreshTextEntryFocus() {
    const focused = document.activeElement;
    if (isTextEntryControl(focused)) activateTextEntry(focused);
    else clearTextEntry();
  }

  document.addEventListener("focusin", (event) => {
    if (isTextEntryControl(event.target)) activateTextEntry(event.target);
  }, true);

  document.addEventListener("focusout", () => {
    window.clearTimeout(clearTextEntryTimer);
    clearTextEntryTimer = window.setTimeout(refreshTextEntryFocus, 350);
  }, true);

  const handleViewportChange = () => {
    syncVisualViewport();
    if (root.classList.contains("kroki-text-entry-active")) {
      keepTextEntryVisible();
      window.setTimeout(keepTextEntryVisible, 120);
    }
  };

  window.visualViewport?.addEventListener("resize", handleViewportChange);
  window.visualViewport?.addEventListener("scroll", handleViewportChange);
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);
  touchTextEntryMedia?.addEventListener?.("change", syncTextEntryMode);
  touchTextEntryMedia?.addListener?.(syncTextEntryMode);
  syncTextEntryMode();
  syncVisualViewport();

  Kroki.ResponsiveScale = Object.freeze({
    referenceWidth: 1280,
    referenceHeight: 720,
    scale,
    px
  });
  Kroki.uiPx = px;
  Kroki.TextEntryGuard = Object.freeze({
    isActive: () => root.classList.contains("kroki-text-entry-active"),
    sync: handleViewportChange
  });
})();
