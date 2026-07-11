/* CUSTOM TRAFFIC SIGN CATALOG ENTRIES */
(function () {
  "use strict";

  const art = `<g
    data-sign-key="bilgi-levhalari/kontrol-kesimi-levhasi"
    data-sign-code=""
    data-sign-name="KONTROL KESİMİ LEVHASI"
    data-sign-category="BİLGİ LEVHALARI"
    data-sign-base-scale="0.08"
    shape-rendering="geometricPrecision"
    font-family="KrokiSignNarrow, Arial Narrow, Arial, sans-serif"
    font-weight="700"
    fill="#211f21"
  >
    <path
      fill="#fff"
      stroke="#211f21"
      d="M37.5.5h425A37 37 0 0 1 499.5 37.5v325a37 37 0 0 1-37 37h-425a37 37 0 0 1-37-37v-325a37 37 0 0 1 37-37Z"
    />
    <path
      fill="none"
      stroke="#211f21"
      stroke-width="10"
      d="M37.5 15h425A22.5 22.5 0 0 1 485 37.5v325a22.5 22.5 0 0 1-22.5 22.5h-425A22.5 22.5 0 0 1 15 362.5v-325A22.5 22.5 0 0 1 37.5 15Z"
    />
    <path d="M40 195h420v10H40Z" />
    <text
      x="250"
      y="120"
      font-size="150"
      text-anchor="middle"
      dominant-baseline="middle"
      textLength="390"
      lengthAdjust="spacingAndGlyphs"
    >D110-03</text>
    <text
      x="250"
      y="285"
      font-size="150"
      text-anchor="middle"
      dominant-baseline="middle"
    >001</text>
  </g>`;

  const sign = {
    key: "bilgi-levhalari/kontrol-kesimi-levhasi",
    code: "",
    name: "KONTROL KESİMİ LEVHASI",
    category: "BİLGİ LEVHALARI",
    categoryKey: "bilgi-levhalari",
    file: "KONTROL KESİMİ LEVHASI.svg",
    relativePath: "KONTROL KESİMİ LEVHASI.svg",
    width: 500,
    height: 400,
    viewBox: "0 0 500 400",
    baseScale: 0.08,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400" viewBox="0 0 500 400">
  ${art}
</svg>`,
    art
  };

  const catalog = window.KrokiTrafficSignCatalog = window.KrokiTrafficSignCatalog || [];
  const existingIndex = catalog.findIndex((item) => item?.key === sign.key);
  if (existingIndex >= 0) catalog.splice(existingIndex, 1);
  const insertIndex = catalog.findIndex((item) => item?.categoryKey === "bilgi-levhalari");
  catalog.splice(insertIndex >= 0 ? insertIndex : catalog.length, 0, sign);
})();
