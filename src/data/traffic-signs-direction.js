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
  const tourist = layout.template("right", "tourist-finger-v1");
  signs.push({
    key: "3-bilgi-levhalari/b-5b-kavsak-ici-yon-levhasi-turistik-mahal", code: "B-5b",
    name: "KAVŞAK İÇİ YÖN LEVHASI (Turistik Mahal)",
    category: "3 BİLGİ LEVHALARI", categoryKey: "3-bilgi-levhalari", file: "B-5b.svg",
    width: tourist.width, height: tourist.height, viewBox: `0 0 ${tourist.width} ${tourist.height}`, baseScale: 0.02,
    layout: { family: "tourist-finger-v1", direction: "right" }, art: tourist.art
  });

  signs.push({
    key: "3-bilgi-levhalari/b-5c-kavsak-ici-yon-levhasi-metro", code: "B-5c",
    name: "KAVŞAK İÇİ YÖN LEVHASI (Metro)",
    category: "3 BİLGİ LEVHALARI", categoryKey: "3-bilgi-levhalari", file: "B-5c.svg",
    width: 9225, height: 2750, viewBox: "0 0 9225 2750", baseScale: 0.02,
    art: `<g transform="scale(6.25)" fill="#000" font-family="KrokiSignNarrow, Arial Narrow, Arial, sans-serif" text-anchor="middle">
      <path fill="#fff" stroke="#000" stroke-width="3.8" d="M0 0H1256L1476 220 1256 440H0Z"/>
      <path d="M64 16H1249.373L1453.373 220 1249.373 424H64A48 48 0 0 1 16 376V64A48 48 0 0 1 64 16Z"/>
      <path fill="#fff" d="M64 32H1208L1348 220 1208 408H64A32 32 0 0 1 32 376V64A32 32 0 0 1 64 32Z"/>
      <rect x="80" y="80" width="280" height="280" rx="8" fill="#304faa"/>
      <text data-editable-text="false" x="220" y="330" font-size="307.34" textLength="170" lengthAdjust="spacingAndGlyphs" fill="#fff">P</text>
      <text data-editable-text="false" x="450" y="270" font-size="139.70" font-weight="700" textLength="80" lengthAdjust="spacingAndGlyphs">+</text>
      <text data-editable-text="false" x="857" y="270" font-size="139.70" font-weight="700" letter-spacing="16" textLength="574" lengthAdjust="spacingAndGlyphs">METRO</text>
    </g>`
  });
  const afterB4 = catalog.findIndex(sign => sign.key === "3-bilgi-levhalari/b-4-kavsak-oncesi-serit-secimi-levhasi");
  catalog.splice(afterB4 < 0 ? catalog.length : afterB4 + 1, 0, ...signs);
})();
