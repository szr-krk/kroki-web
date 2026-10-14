(() => {
  const layout = window.Kroki?.TrafficSignLayout;
  if (!layout) return;
  const catalog = window.KrokiTrafficSignCatalog = window.KrokiTrafficSignCatalog || [];
  const variants = [
    ["left", "single"], ["up", "single"], ["up-right", "single"],
    ["up", "double"], ["right", "double"], ["up-right", "double"]
  ];
  const signs = variants.map(([direction, messageType], index) => {
    const number = index + 1;
    const family = `arrow-${messageType}-message-v1`;
    const template = layout.template(direction, family);
    return {
      key: `3-bilgi-levhalari/b-5a-kavsak-oncesi-yon-levhasi-${number}`,
      code: "B-5a",
      name: `KAVŞAK ÖNCESİ YÖN LEVHASI (Oklu - ${messageType === "double" ? "Çift" : "Tek"} mesaj) ${number}`,
      category: "3 BİLGİ LEVHALARI", categoryKey: "3-bilgi-levhalari",
      file: `B-5a-${number}.svg`,
      width: template.width, height: template.height,
      viewBox: `0 0 ${template.width} ${template.height}`,
      baseScale: 0.02,
      layout: { family, direction },
      art: template.art
    };
  });
  const afterB4 = catalog.findIndex(sign => sign.key === "3-bilgi-levhalari/b-4-kavsak-oncesi-serit-secimi-levhasi");
  catalog.splice(afterB4 < 0 ? catalog.length : afterB4 + 1, 0, ...signs);
})();
