(() => {
  if (window.KrokiMainMenu) return;
  const currentSrc = document.currentScript?.src || "";
  const nextSrc = currentSrc.replace(/editor-main-menu-pro\.js(?:\?.*)?$/, "editor-main-menu.js?v=20260710-main-menu");
  const script = document.createElement("script");
  script.src = nextSrc && nextSrc !== currentSrc ? nextSrc : "src/editor-main-menu.js?v=20260710-main-menu";
  script.async = false;
  document.head.append(script);
})();
