(() => {
  const engine = window.Kroki?.TrafficSignInformationLayout;
  if (!engine) return;
  const entries = [
    ["B-5d", "village", "KAVŞAK İÇİ YÖN LEVHASI (Köy ve Mahalle) 1", 141],
    ["B-5d", "villageArrow", "KAVŞAK İÇİ YÖN LEVHASI (Köy ve Mahalle) 2", 141],
    ["B-6", "airport", "KAVŞAK İÇİ YÖN LEVHASI (Havalimanı) 1", 142],
    ["B-6", "airportArrow", "KAVŞAK İÇİ YÖN LEVHASI (Havalimanı) 2", 142],
    ["B-7", "camp", "KAVŞAK İÇİ YÖN LEVHASI (Kamp Yeri)", 142],
    ["B-8a", "country", "TÜRKİYE DEVLET SINIRI LEVHASI", 143],
    ["B-8b", "province", "İL SINIRI LEVHASI", 144],
    ["B-9", "town", "MESKUN MAHAL LEVHASI (İl-İlçe-Belde-Köy-Mahalle Merkezi)", 146],
    ["B-10", "townEnd", "MESKUN MAHAL SONU LEVHASI (İl-İlçe-Belde-Köy-Mahalle Merkezi)", 147],
    ["B-12a", "region", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Bölge Merkezi)", 150],
    ["B-12b", "branch", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Şube Merkezi)", 150],
    ["B-12c", "maintenance", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Bakımevi)", 151],
    ["B-12d", "construction", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Şantiye)", 151],
    ["B-12e", "restPark", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Dinlenme Parkı)", "152 153 154 155"],
    ["B-12f", "regionBoundary", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Bölge Sınırı)", "152 153 154 155"],
    ["B-12g", "branchBoundary", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Şube Sınırı)", "152 153 154 155"],
    ["B-12h", "responsibilityStart", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Sorumluluk Sahası Başlangıcı)", "152 153 154 155"],
    ["B-12i", "responsibilityEnd", "KARAYOLLARI TEŞKİLATINA AİT BİLGİ LEVHASI (Sorumluluk Sahası Sonu)", "152 153 154 155"],
    ["B-13b", "distanceBoard", "MESAFE LEVHASI", "152 153 154 155"]
  ];
  const catalog = window.KrokiTrafficSignCatalog;
  const signs = entries.map(([code, profile, name, pdf]) => {
    const t = engine.template(profile);
    return { key: `3-bilgi-levhalari/${code.toLowerCase()}-${profile.toLowerCase()}`, code, name,
      category: "3 BİLGİ LEVHALARI", categoryKey: "3-bilgi-levhalari", file: `${code}-${profile}.svg`,
      width: t.width, height: t.height, viewBox: `0 0 ${t.width} ${t.height}`, baseScale: .02,
      layout: { family: "information-v1", profile }, art: t.art, sourcePdf: `${pdf}.pdf` };
  });
  const after = catalog.findIndex(sign => sign.code === "B-5c");
  catalog.splice(after < 0 ? catalog.length : after + 1, 0, ...signs);
})();
