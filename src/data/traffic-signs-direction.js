(() => {
  const layout = window.Kroki?.TrafficSignLayout;
  if (!layout) return;
  const catalog = window.KrokiTrafficSignCatalog = window.KrokiTrafficSignCatalog || [];
  const variants = [
    ["left", "single"], ["up", "single"], ["up-right", "single"],
    ["up", "double"], ["right", "double"], ["up-right", "double"],
    ["right", "single", "finger"], ["right", "double", "finger"]
  ];
  const signs = variants.map(([direction, messageType, shape = "arrow"], index) => {
    const number = index + 1;
    const family = `${shape}-${messageType}-message-v1`;
    const template = layout.template(direction, family);
    return {
      key: `3-bilgi-levhalari/b-5a-kavsak-oncesi-yon-levhasi-${number}`,
      code: "B-5a",
      name: `KAVŞAK ÖNCESİ YÖN LEVHASI (${shape === "finger" ? "Parmak" : `Oklu - ${messageType === "double" ? "Çift" : "Tek"} mesaj`}) ${number}`,
      category: "3 BİLGİ LEVHALARI", categoryKey: "3-bilgi-levhalari",
      file: `B-5a-${number}.svg`,
      width: template.width, height: template.height,
      viewBox: `0 0 ${template.width} ${template.height}`,
      baseScale: 0.02,
      layout: { family, direction },
      art: template.art
    };
  });
  // Fixed 1980 x 684 drawing from 139.pdf, normalized from a=24 to a=100.
  // Fixed labels use the existing sign font; both circles use SVG arcs.
  signs.push({
    key: "3-bilgi-levhalari/sehir-merkezi-levhasi", code: "", name: "ŞEHİR MERKEZİ LEVHASI",
    category: "3 BİLGİ LEVHALARI", categoryKey: "3-bilgi-levhalari", file: "sehir-merkezi.svg",
    width: 8250, height: 2850, viewBox: "0 0 8250 2850", baseScale: 0.02,
    art: `<g transform="scale(4.166666667)" fill="#000">
      <path fill="#fff" stroke="#000" stroke-width="5.08" d="M0 0H1638L1980 342 1638 684H0Z"/>
      <path d="M96 24H1628.059L1946.059 342 1628.059 660H96A72 72 0 0 1 24 588V96A72 72 0 0 1 96 24Z"/>
      <path fill="#fff" d="M96 48H1566L1788 342 1566 636H96A48 48 0 0 1 48 588V96A48 48 0 0 1 96 48Z"/>
      <path data-sign-part="city-symbol" fill-rule="evenodd" d="M1248 342A150 150 0 1 0 1548 342A150 150 0 1 0 1248 342Z M1260 342A138 138 0 1 0 1536 342A138 138 0 1 0 1260 342Z M1338 342A60 60 0 1 0 1458 342A60 60 0 1 0 1338 342Z"/>
      <g data-sign-part="city-lettering" font-family="KrokiSignNarrow, Arial Narrow, Arial, sans-serif" font-size="209.55" font-weight="700" letter-spacing="24" text-anchor="middle">
        <text data-editable-text="false" x="648" y="294" textLength="696" lengthAdjust="spacingAndGlyphs">Şehir</text>
        <text data-editable-text="false" x="648" y="540" textLength="1008" lengthAdjust="spacingAndGlyphs">Merkezi</text>
      </g>
    </g>`
  });
  const afterB4 = catalog.findIndex(sign => sign.key === "3-bilgi-levhalari/b-4-kavsak-oncesi-serit-secimi-levhasi");
  catalog.splice(afterB4 < 0 ? catalog.length : afterB4 + 1, 0, ...signs);
})();
