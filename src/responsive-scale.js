(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const REFERENCE_ROOT_SIZE = 16;

  function scale() {
    const rootSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
    if (!Number.isFinite(rootSize) || rootSize <= 0) return 1;
    return rootSize / REFERENCE_ROOT_SIZE;
  }

  function px(referencePixels) {
    const value = Number(referencePixels);
    return (Number.isFinite(value) ? value : 0) * scale();
  }

  Kroki.ResponsiveScale = Object.freeze({
    referenceWidth: 1280,
    referenceHeight: 720,
    scale,
    px
  });
  Kroki.uiPx = px;
})();
