(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const ua = navigator.userAgent || "";
  const isSafari = /AppleWebKit/i.test(ua) && /Apple/i.test(navigator.vendor || "")
    && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|OPiOS|Android/i.test(ua);
  Kroki.Browser = Object.freeze({ isSafari, fullscreenEnabled: !isSafari });
})();
