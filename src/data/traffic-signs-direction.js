(() => {
  const layout = window.Kroki?.TrafficSignLayout;
  if (!layout) return;
  const catalog = window.KrokiTrafficSignCatalog = window.KrokiTrafficSignCatalog || [];
  const signs = ["left", "up", "up-right"].map((direction, index) => {
    const number = index + 1;
    const template = layout.template(direction);
    return {
      key: `3-bilgi-levhalari/b-5a-kavsak-oncesi-yon-levhasi-${number}`,
      code: "B-5a",
      name: `KAVŞAK ÖNCESİ YÖN LEVHASI (Oklu - Tek mesaj) ${number}`,
      category: "3 BİLGİ LEVHALARI", categoryKey: "3-bilgi-levhalari",
      file: `B-5a-${number}.svg`,
      width: template.width, height: template.height,
      viewBox: `0 0 ${template.width} ${template.height}`,
      baseScale: 0.04,
      layout: { family: "arrow-single-message-v1", direction },
      art: template.art
    };
  });
  const afterB4 = catalog.findIndex(sign => sign.key === "3-bilgi-levhalari/b-4-kavsak-oncesi-serit-secimi-levhasi");
  catalog.splice(afterB4 < 0 ? catalog.length : afterB4 + 1, 0, ...signs);
})();
