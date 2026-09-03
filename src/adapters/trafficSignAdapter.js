(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const utils = Kroki.EditorUtils;
  const registry = Kroki.ShapeRegistry;
  const catalog = Kroki.TrafficSignCatalog;
  const styleManager = Kroki.StyleManager;
  if (!utils || !registry || !catalog || !styleManager) return;

  const MIN_SCALE = 0.005;
  const MAX_SCALE = 4;
  const SELECTION_FRAME_SCALE = 1.12;
  const MULTI_SELECTION_STROKE_WIDTH = 4;
  // Standard triangular sign canvases are ~1.138; more elongated canvases use their rectangular frame.
  const RECTANGULAR_FRAME_MIN_ASPECT = 1.15;
  const RECTANGULAR_CATEGORY_KEYS = new Set([
    "3-bilgi-levhalari",
    "5-yapim-bakim-ve-onarim",
    "6-paneller",
    "7-kaplama-isaretleri"
  ]);
  const metricsCache = new WeakMap();
  const artTemplateCache = new Map();
  const editableTextCache = new Map();
  const editableTextDefinitionCache = new Map();
  const editableTextPresenceCache = new Map();

  function numericField(id, label, defaultValue, indexes, options = {}) {
    return {
      id,
      label,
      defaultValue,
      maxLength: options.maxLength || String(defaultValue || "").length,
      inputMode: options.inputMode || "numeric",
      valueType: options.valueType || "number",
      min: options.min,
      max: options.max,
      legacyLine: options.legacyLine,
      target: {
        indexes,
        mode: options.mode,
        prefix: options.prefix || "",
        suffix: options.suffix || "",
        fit: options.fit !== false,
        fitWidth: options.fitWidth,
        fitCenterX: options.fitCenterX,
        mergeCenterX: options.mergeCenterX,
        fitThreshold: options.fitThreshold
      }
    };
  }

  function textField(id, label, defaultValue, indexes, options = {}) {
    return {
      id,
      label,
      defaultValue,
      maxLength: options.maxLength || String(defaultValue || "").length,
      inputMode: options.inputMode || "text",
      valueType: options.valueType || "text",
      min: options.min,
      max: options.max,
      legacyLine: options.legacyLine,
      legacySource: options.legacySource || null,
      target: {
        indexes,
        mode: options.mode,
        prefix: options.prefix || "",
        suffix: options.suffix || "",
        fit: options.fit !== false,
        fitWidth: options.fitWidth,
        fitCenterX: options.fitCenterX,
        mergeCenterX: options.mergeCenterX,
        fitThreshold: options.fitThreshold
      }
    };
  }

  function clockField(id, label, indexes, options = {}) {
    return {
      id,
      label,
      defaultValue: options.defaultValue || label,
      maxLength: 5,
      inputMode: "numeric",
      valueType: "clock",
      legacyLines: options.legacyLines,
      target: { indexes, mode: "clock" }
    };
  }

  const EDITABLE_SIGN_FIELDS = {
    "bilgi-levhalari/kontrol-kesimi-levhasi": [
      textField("roadNumber", "Yol- Kesim No", "D110-03", [0], { maxLength: 12 }),
      textField("sectionNumber", "Kilometre", "001", [1], { maxLength: 8, inputMode: "numeric" })
    ],
    "6-paneller/kontrol-kesimi-levhasi": [
      textField("roadNumber", "Yol- Kesim No", "D110-03", [0], { maxLength: 12 }),
      textField("sectionNumber", "Kilometre", "001", [1], { maxLength: 8, inputMode: "numeric" })
    ],
    "tanzim-levhalari/tt-20-genisligi-metreden-fazla-olan-tasit-giremez": [
      numericField("whole", "2", "2", [0], { maxLength: 2, legacyLine: 0 }),
      numericField("decimal", "30", "30", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-21-yuksekligi-metreden-fazla-olan-tasit-giremez": [
      numericField("whole", "M", "3", [0], { maxLength: 1, min: 1, max: 9, legacyLine: 0 }),
      numericField("decimal", "Cm", "50", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-22-uzunlugu-metreden-fazla-olan-tasit-giremez": [
      numericField("length", "Metre", "10", [0], {
        maxLength: 3,
        suffix: " m",
        fitWidth: 145,
        fitCenterX: 300,
        legacyLine: 0
      })
    ],
    "tanzim-levhalari/tt-23-dingil-basina-tondan-fazla-yuk-dusen-tasit-giremez": [
      numericField("load", "Ton", "6", [0], { maxLength: 1, legacyLine: 0 })
    ],
    "tanzim-levhalari/tt-24-yuklu-agirligi-tondan-fazla-yuk-dusen-tasit-giremez": [
      numericField("whole", "Ton", "7", [0], { maxLength: 1, legacyLine: 0 }),
      numericField("decimal", "Ton küsuratı", "00", [2, 3], { maxLength: 2, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-25-ondeki-tasit-metreden-daha-yakin-takip-edilemez": [
      numericField("distance", "Metre", "70", [0], {
        maxLength: 3,
        suffix: " m",
        fitWidth: 190,
        fitCenterX: 300,
        legacyLine: 0
      })
    ],
    "tanzim-levhalari/tt-29a-azami-hiz-sinirlamasi": [
      numericField("speed", "Km/s", "50", [0], { maxLength: 3, legacyLine: 0 })
    ],
    "tanzim-levhalari/tt-29b-azami-hiz-bolgesi": [
      numericField("speed", "Km/s", "30", [2], { maxLength: 3, legacyLine: 2 })
    ],
    "tanzim-levhalari/tt-33a-hiz-sinirlamasi-sonu": [
      numericField("speed", "Km/s", "50", [0, 1], {
        maxLength: 3,
        mode: "splitTwoNaturalThree",
        mergeCenterX: 300,
        legacyLine: 0
      })
    ],
    "tanzim-levhalari/tt-33b-azami-hiz-bolgesi-sonu": [
      numericField("speed", "Km/s", "30", [2, 3], {
        maxLength: 3,
        mode: "splitTwoNaturalThree",
        mergeCenterX: 300,
        legacyLine: 2
      })
    ],
    "tanzim-levhalari/tt-41a-mecburi-asgari-hiz": [
      numericField("speed", "Km/s", "30", [0], { maxLength: 3, legacyLine: 0 })
    ],
    "uyari-levhalari/t-3a-tehlikeli-egim-inis": [
      numericField("slope", "Eğim %", "10", [0], { maxLength: 2, prefix: "%", legacyLine: 0 })
    ],
    "uyari-levhalari/t-3b-tehlikeli-egim-cikis": [
      numericField("slope", "Eğim %", "10", [0], { maxLength: 2, prefix: "%", legacyLine: 0 })
    ],
    "bilgi-levhalari/b-14c-yaya-bolgesi": [
      clockField("start", "Başlangıç saati", [3, 4], {
        defaultValue: "08,00",
        legacyLines: [3, 4]
      }),
      clockField("end", "Bitiş saati", [6, 7], {
        defaultValue: "15,00",
        legacyLines: [6, 7]
      })
    ],
    "bilgi-levhalari/b-14d-yaya-bolgesi": [
      clockField("start", "Başlangıç saati", [2, 3], {
        defaultValue: "08,00",
        legacyLines: [2, 3]
      }),
      clockField("end", "Bitiş saati", [5, 6], {
        defaultValue: "15,00",
        legacyLines: [5, 6]
      })
    ],
    "bilgi-levhalari/b-50a-serit-duzenleme-levhalari-2": [
      numericField("speed", "Km/s", "50", [0], {
        maxLength: 3,
        fitWidth: 240,
        fitCenterX: 640,
        legacyLine: 0
      })
    ],
    "bilgi-levhalari/b-50b-serit-duzenleme-levhalari-2": [
      numericField("speed", "Km/s", "50", [0, 1], {
        maxLength: 3,
        mode: "splitTwoNaturalThree",
        mergeCenterX: 600,
        fitWidth: 240,
        legacyLine: 0
      })
    ],
    "bilgi-levhalari/b-50c-serit-duzenleme-levhalari-2": [
      numericField("speed", "Km/s", "50", [0], {
        maxLength: 3,
        fitWidth: 240,
        fitCenterX: 752,
        legacyLine: 0
      })
    ],
    "bilgi-levhalari/b-50d-serit-duzenleme-levhalari-2": [
      numericField("speed", "Km/s", "50", [0], {
        maxLength: 3,
        mode: "spacedTwoNaturalThree",
        mergeCenterX: 940,
        fitWidth: 240,
        legacyLine: 0
      })
    ],
    "bilgi-levhalari/b-50f-serit-duzenleme-levhalari-3": [
      numericField("whole", "M", "2", [0], {
        maxLength: 1,
        min: 1,
        max: 9,
        legacyLine: 0
      }),
      numericField("decimal", "Cm", "30", [2, 3], {
        maxLength: 2,
        legacyLine: 2
      })
    ],
    "bilgi-levhalari/b-50f-serit-duzenleme-levhalari-4": [
      numericField("speed80", "Km/s(sol)", "80", [0, 1], {
        maxLength: 3,
        mode: "splitTwoNaturalThree",
        mergeCenterX: 240,
        fitWidth: 240,
        legacyLine: 0
      }),
      numericField("speed50", "Km/s(orta)", "50", [2, 3], {
        maxLength: 3,
        mode: "splitTwoNaturalThree",
        mergeCenterX: 600,
        fitWidth: 240,
        legacyLine: 1
      })
    ],
    "bilgi-levhalari/b-50g-serit-duzenleme-levhalari-2": [
      numericField("speed", "Km/s", "50", [0], {
        maxLength: 3,
        mode: "spacedTwoNaturalThree",
        mergeCenterX: 260,
        fitWidth: 240,
        legacyLine: 0
      })
    ],
    "bilgi-levhalari/b-51a-serit-duzenleme-levhalari-3": [
      numericField("whole", "M", "2", [0], {
        maxLength: 1,
        min: 1,
        max: 9,
        legacyLine: 0
      }),
      numericField("decimal", "Cm", "30", [2, 3], {
        maxLength: 2,
        legacyLine: 2
      })
    ],
    "bilgi-levhalari/b-51a-serit-duzenleme-levhalari-4": [
      numericField("speed", "Km/s", "50", [0, 1], {
        maxLength: 3,
        mode: "splitTwoNaturalThree",
        mergeCenterX: 600,
        fitWidth: 240,
        legacyLine: 0
      })
    ],
    "bilgi-levhalari/b-51c-serit-duzenleme-levhalari-2": [
      numericField("speed", "Km/s", "50", [0, 1], {
        maxLength: 3,
        mode: "splitTwoNaturalThree",
        mergeCenterX: 900,
        fitWidth: 240,
        legacyLine: 0
      })
    ],
    "bilgi-levhalari/b-51d-serit-duzenleme-levhalari-2": [
      numericField("speed80", "Km/s(sol)", "80", [0], {
        maxLength: 3,
        fitWidth: 240,
        fitCenterX: 280,
        legacyLine: 0
      }),
      numericField("speed50", "Km/s(orta)", "50", [1], {
        maxLength: 3,
        fitWidth: 240,
        fitCenterX: 600,
        legacyLine: 1
      })
    ],
    "bilgi-levhalari/b-61d-elektronik-denetleme-sistemi": [
      numericField("carSpeed", "Otomobil (Km/s)", "110", [0], {
        maxLength: 3,
        fitWidth: 135,
        fitCenterX: 364,
        legacyLine: 0
      }),
      numericField("panelVanSpeed", "Panelvan (Km/s)", "100", [1], {
        maxLength: 3,
        fitWidth: 135,
        fitCenterX: 564,
        legacyLine: 1
      }),
      numericField("busSpeed", "Otobüs (Km/s)", "90", [2], {
        maxLength: 3,
        fitWidth: 135,
        fitCenterX: 764,
        legacyLine: 2
      }),
      numericField("truckSpeed", "Kamyon (Km/s)", "85", [3], {
        maxLength: 3,
        fitWidth: 135,
        fitCenterX: 964,
        legacyLine: 3
      })
    ],
    "bilgi-levhalari/b-61e-elektronik-denetleme-sistemi": [
      textField("averageSpeedText", "Ortalama hız tespiti metni", "Ortalama Hız Tespiti 3km", [0], {
        maxLength: 40,
        legacyLine: 0
      }),
      numericField("carSpeed", "Otomobil (Km/s)", "82", [1], {
        maxLength: 3,
        fitWidth: 70,
        fitCenterX: 230,
        legacyLine: 1
      }),
      numericField("busSpeed", "Otobüs (Km/s)", "70", [2], {
        maxLength: 3,
        fitWidth: 70,
        fitCenterX: 350.3,
        legacyLine: 2
      }),
      numericField("truckSpeed", "Kamyon (Km/s)", "70", [3], {
        maxLength: 3,
        fitWidth: 70,
        fitCenterX: 470.3,
        legacyLine: 3
      })
    ],
    "bilgi-levhalari/b-61f-elektronik-denetleme-sistemi": [
      numericField("carSpeed", "Otomobil (Km/s)", "90", [1], {
        maxLength: 3,
        fitWidth: 44,
        fitCenterX: 67,
        legacyLine: 1
      }),
      numericField("panelVanSpeed", "Panelvan (Km/s)", "85", [2], {
        maxLength: 3,
        fitWidth: 44,
        fitCenterX: 167,
        legacyLine: 2
      }),
      numericField("truckSpeed", "Kamyon (Km/s)", "80", [3], {
        maxLength: 3,
        fitWidth: 44,
        fitCenterX: 267,
        legacyLine: 3
      })
    ],
    "bilgi-levhalari/b-61g-elektronik-denetleme-sistemi": [
      textField("distance", "Mesafe", "3 Km", [2], {
        maxLength: 20,
        mode: "fitLongText",
        fitWidth: 280,
        fitCenterX: 167,
        fitThreshold: 8,
        legacyLine: 2
      }),
      numericField("carSpeed", "Otomobil (Km/s)", "90", [4], {
        maxLength: 3,
        fitWidth: 44,
        fitCenterX: 67,
        legacyLine: 4
      }),
      numericField("panelVanSpeed", "Panelvan (Km/s)", "85", [5], {
        maxLength: 3,
        fitWidth: 44,
        fitCenterX: 167,
        legacyLine: 5
      }),
      numericField("truckSpeed", "Kamyon (Km/s)", "80", [6], {
        maxLength: 3,
        fitWidth: 44,
        fitCenterX: 267,
        legacyLine: 6
      })
    ],
    "bilgi-levhalari/b-63a-karayolu-denetim-istasyonu-bilgi-levhalari": [
      textField("distance", "Mesafe", "300 m", [2], {
        maxLength: 20,
        legacyLine: 2
      })
    ],
    "bilgi-levhalari/b-63c-karayolu-denetim-istasyonu-bilgi-levhalari": [
      numericField("speed", "Km/s", "70", [0], {
        maxLength: 3,
        fitWidth: 210,
        fitCenterX: 376,
        legacyLine: 0
      })
    ],
    "bilgi-levhalari/b-63d-karayolu-denetim-istasyonu-bilgi-levhalari": [
      numericField("speed", "Km/s", "50", [0], {
        maxLength: 3,
        fitWidth: 210,
        fitCenterX: 376,
        legacyLine: 0
      })
    ],
    "5-yapim-bakim-ve-onarim/yb-1a-yapim-bakim-bilgi-levhasi-yol-yapimi": [
      textField("text", "Metin", "Yol Yapımı", [0], {
        maxLength: 60,
        fitWidth: 1400,
        fitCenterX: 760,
        legacyLine: 0
      })
    ],
    "5-yapim-bakim-ve-onarim/yb-1b-yapim-bakim-bilgi-levhasi-asfalt-yapimi": [
      textField("text", "Metin", "Asfalt Yapımı", [0], {
        maxLength: 60,
        fitWidth: 1690,
        fitCenterX: 915,
        legacyLine: 0
      })
    ],
    "5-yapim-bakim-ve-onarim/yb-1c-yapim-bakim-bilgi-levhasi-yol-bakimi": [
      textField("text", "Metin", "Yol Onarımı", [0], {
        maxLength: 60,
        fitWidth: 1500,
        fitCenterX: 817.5,
        legacyLine: 0
      })
    ],
    "5-yapim-bakim-ve-onarim/yb-1d-yapim-bakim-bilgi-levhasi-kopru-bakimi": [
      textField("text", "Metin", "Köprü Onarımı", [0], {
        maxLength: 60,
        fitWidth: 1800,
        fitCenterX: 965,
        legacyLine: 0
      })
    ],
    "5-yapim-bakim-ve-onarim/yb-3-yaya-yonlendirme-levhasi": [
      textField("text", "Metin", "Yayalar", [0], {
        maxLength: 60,
        fitWidth: 830,
        fitCenterX: 500,
        legacyLine: 0
      })
    ]
  };

  const STRICT_LEGACY_EDITABLE_SIGN_KEYS = new Set([
    "tanzim-levhalari/tt-21-yuksekligi-metreden-fazla-olan-tasit-giremez",
    "tanzim-levhalari/tt-22-uzunlugu-metreden-fazla-olan-tasit-giremez",
    "tanzim-levhalari/tt-23-dingil-basina-tondan-fazla-yuk-dusen-tasit-giremez",
    "tanzim-levhalari/tt-24-yuklu-agirligi-tondan-fazla-yuk-dusen-tasit-giremez",
    "tanzim-levhalari/tt-25-ondeki-tasit-metreden-daha-yakin-takip-edilemez",
    "tanzim-levhalari/tt-29a-azami-hiz-sinirlamasi",
    "tanzim-levhalari/tt-29b-azami-hiz-bolgesi",
    "tanzim-levhalari/tt-33a-hiz-sinirlamasi-sonu",
    "tanzim-levhalari/tt-33b-azami-hiz-bolgesi-sonu",
    "tanzim-levhalari/tt-41a-mecburi-asgari-hiz",
    "uyari-levhalari/t-3a-tehlikeli-egim-inis",
    "uyari-levhalari/t-3b-tehlikeli-egim-cikis",
    "bilgi-levhalari/b-14c-yaya-bolgesi",
    "bilgi-levhalari/b-14d-yaya-bolgesi",
    "bilgi-levhalari/b-50a-serit-duzenleme-levhalari-2",
    "bilgi-levhalari/b-50b-serit-duzenleme-levhalari-2",
    "bilgi-levhalari/b-50c-serit-duzenleme-levhalari-2",
    "bilgi-levhalari/b-50d-serit-duzenleme-levhalari-2",
    "bilgi-levhalari/b-50f-serit-duzenleme-levhalari-3",
    "bilgi-levhalari/b-50f-serit-duzenleme-levhalari-4",
    "bilgi-levhalari/b-50g-serit-duzenleme-levhalari-2",
    "bilgi-levhalari/b-51a-serit-duzenleme-levhalari-3",
    "bilgi-levhalari/b-51a-serit-duzenleme-levhalari-4",
    "bilgi-levhalari/b-51c-serit-duzenleme-levhalari-2",
    "bilgi-levhalari/b-51d-serit-duzenleme-levhalari-2",
    "bilgi-levhalari/b-61d-elektronik-denetleme-sistemi",
    "bilgi-levhalari/b-61e-elektronik-denetleme-sistemi",
    "bilgi-levhalari/b-61f-elektronik-denetleme-sistemi",
    "bilgi-levhalari/b-61g-elektronik-denetleme-sistemi",
    "bilgi-levhalari/b-63a-karayolu-denetim-istasyonu-bilgi-levhalari",
    "bilgi-levhalari/b-63c-karayolu-denetim-istasyonu-bilgi-levhalari",
    "bilgi-levhalari/b-63d-karayolu-denetim-istasyonu-bilgi-levhalari",
    "5-yapim-bakim-ve-onarim/yb-1a-yapim-bakim-bilgi-levhasi-yol-yapimi",
    "5-yapim-bakim-ve-onarim/yb-1b-yapim-bakim-bilgi-levhasi-asfalt-yapimi",
    "5-yapim-bakim-ve-onarim/yb-1c-yapim-bakim-bilgi-levhasi-yol-bakimi",
    "5-yapim-bakim-ve-onarim/yb-1d-yapim-bakim-bilgi-levhasi-kopru-bakimi",
    "5-yapim-bakim-ve-onarim/yb-3-yaya-yonlendirme-levhasi"
  ]);

  const NON_EDITABLE_TEXT_SIGN_KEYS = new Set([
    "tanzim-levhalari/tt-2-dur",
    "tanzim-levhalari/tt-31-gumruk-durmadan-gecmek-yasaktir",
    "uyari-levhalari/t-28a-demiryolu-gecidi-yaklasim-levhalari-sag",
    "uyari-levhalari/t-28b-demiryolu-gecidi-yaklasim-levhalari-sol",
    "uyari-levhalari/t-29a-demiryolu-gecidi-yaklasim-levhalari-sag",
    "uyari-levhalari/t-29b-demiryolu-gecidi-yaklasim-levhalari-sol",
    "uyari-levhalari/t-30a-demiryolu-gecidi-yaklasim-levhalari-sag",
    "uyari-levhalari/t-30b-demiryolu-gecidi-yaklasim-levhalari-sol",
    "bilgi-levhalari/b-14e-yaya-bolgesi",
    "bilgi-levhalari/b-14f-yaya-bolgesi",
    "bilgi-levhalari/b-16a-tek-yonlu-yol",
    "bilgi-levhalari/b-16b-ileri-tek-yonlu-yol",
    "bilgi-levhalari/b-23-ilk-yardim",
    "bilgi-levhalari/b-49a-tunel",
    "bilgi-levhalari/b-53b-u-donusu-levhalari",
    "bilgi-levhalari/b-53c-u-donusu-levhalari",
    "bilgi-levhalari/b-53d-u-donusu-alt-gecit",
    "bilgi-levhalari/b-53e-u-donusu-alt-gecit",
    "bilgi-levhalari/b-53f-u-donusu-alt-gecit",
    "bilgi-levhalari/b-53g-u-donusu-ust-gecit",
    "bilgi-levhalari/b-56-yaya-oncelikli-yol",
    "bilgi-levhalari/b-57-yaya-oncelikli-yolun-sonu",
    "bilgi-levhalari/b-61b-elektronik-denetleme-sistemi",
    "bilgi-levhalari/b-61c-elektronik-denetleme-sistemi",
    "bilgi-levhalari/b-63b-karayolu-denetim-istasyonu-bilgi-levhalari"
  ]);

  function clampScale(value) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return 0.08;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  function signFromModel(model) {
    const metadata = model?.metadata || {};
    return catalog.find(metadata.signKey) || {
      key: metadata.signKey || "",
      code: metadata.signCode || "",
      name: metadata.signName || "Levha",
      category: metadata.signCategory || "Levhalar",
      categoryKey: metadata.signCategoryKey || "",
      file: metadata.signFile || "",
      width: Number(metadata.signWidth) || 100,
      height: Number(metadata.signHeight) || 100,
      viewBox: metadata.signViewBox || `0 0 ${Number(metadata.signWidth) || 100} ${Number(metadata.signHeight) || 100}`,
      baseScale: Number(metadata.signBaseScale) || 0.08,
      art: metadata.signArt || "",
      svg: ""
    };
  }

  function viewBoxFor(sign) {
    return catalog.parseViewBox(sign?.viewBox, sign?.width, sign?.height);
  }

  function frameShapeFor(sign, viewBox) {
    const categoryKey = String(sign?.categoryKey || "").toLowerCase();
    const signKey = String(sign?.key || "").toLowerCase();
    const shorterSide = Math.min(viewBox.width, viewBox.height);
    const longerSide = Math.max(viewBox.width, viewBox.height);
    const aspect = shorterSide > 0 ? longerSide / shorterSide : 1;
    if (/(?:^|\/)tt-1-yol-ver$/.test(signKey)) return "triangle-down";
    if (
      categoryKey === "2-uyari-levhalari" &&
      viewBox.width > viewBox.height &&
      aspect > 1.1 &&
      aspect < RECTANGULAR_FRAME_MIN_ASPECT
    ) {
      return "triangle-up";
    }
    if (RECTANGULAR_CATEGORY_KEYS.has(categoryKey)) return "rectangle";
    if (categoryKey === "4-durma-ve-parketme" && !/^P-[12]$/i.test(String(sign?.code || ""))) {
      return "rectangle";
    }
    return aspect >= RECTANGULAR_FRAME_MIN_ASPECT ? "rectangle" : "circle";
  }

  function artSourceFor(sign) {
    return String(sign?.art || "").trim();
  }

  function artTemplateFor(sign) {
    const art = artSourceFor(sign);
    if (artTemplateCache.has(art)) return artTemplateCache.get(art);
    let template = utils.createSvgElement("g");
    if (!art) {
      artTemplateCache.set(art, template);
      return template;
    }
    const documentText = `<svg xmlns="${utils.svgNs}">${art}</svg>`;
    const parsed = new DOMParser().parseFromString(documentText, "image/svg+xml");
    const group = parsed.documentElement?.querySelector("g");
    if (group) template = document.importNode(group, true);
    artTemplateCache.set(art, template);
    return template;
  }

  function parseArt(sign) {
    return artTemplateFor(sign).cloneNode(true);
  }

  function textElementsIn(group) {
    return Array.from(group?.querySelectorAll?.("text") || []);
  }

  function isSingleGlyphText(value) {
    return /^[0-9]$/.test(String(value || "").trim());
  }

  function textRunsFor(group) {
    const elements = textElementsIn(group);
    const runs = [];
    for (let index = 0; index < elements.length; index += 1) {
      const text = elements[index].textContent.trim();
      if (!isSingleGlyphText(text)) {
        runs.push({ elements: [elements[index]], text });
        continue;
      }

      const digits = [text];
      const runElements = [elements[index]];
      while (index + 1 < elements.length && isSingleGlyphText(elements[index + 1].textContent)) {
        index += 1;
        digits.push(elements[index].textContent.trim());
        runElements.push(elements[index]);
      }
      runs.push({ elements: runElements, text: digits.join("") });
    }
    return runs;
  }

  function editableTextFromGroup(group) {
    return textRunsFor(group)
      .map((run) => run.text)
      .filter((text) => text.length)
      .join("\n");
  }

  function editableTextForSign(sign) {
    const art = artSourceFor(sign);
    if (editableTextCache.has(art)) return editableTextCache.get(art);
    const fields = editableTextDefinitionsForSign(sign);
    const text = fields.map((field) => field.defaultValue).filter(Boolean).join("\n");
    editableTextCache.set(art, text);
    return text;
  }

  function editableSignKey(sign) {
    return String(sign?.key || "")
      .toLowerCase()
      .replace(/^([1-3])-/, "");
  }

  function editableTextDefinitionsForSign(sign) {
    const art = artSourceFor(sign);
    const cacheKey = `${editableSignKey(sign)}\n${art}`;
    if (editableTextDefinitionCache.has(cacheKey)) return editableTextDefinitionCache.get(cacheKey);

    const legacyFields = EDITABLE_SIGN_FIELDS[editableSignKey(sign)] || [];
    const elements = textElementsIn(artTemplateFor(sign));
    const taggedElements = elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => element.dataset.editableText === "true");
    const hasEditableTextMetadata = elements.some((element) => element.hasAttribute("data-editable-text"));
    if (hasEditableTextMetadata) {
      const groups = new Map();
      taggedElements.forEach(({ element, index }) => {
        const id = element.dataset.textKey || `textNode${index + 1}`;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push({ element, index });
      });
      const fields = Array.from(groups, ([id, items]) => {
        const first = items[0].element;
        const prefix = first.dataset.textPrefix || "";
        const suffix = first.dataset.textSuffix || "";
        let defaultValue = items.map(({ element }) => String(element.textContent || "").trim()).join("");
        if (prefix && defaultValue.startsWith(prefix)) defaultValue = defaultValue.slice(prefix.length);
        if (suffix && defaultValue.endsWith(suffix)) defaultValue = defaultValue.slice(0, -suffix.length);
        defaultValue = defaultValue.trim();
        const maxLength = Number(first.dataset.textMaxlength);
        const min = Number(first.dataset.textMin);
        const max = Number(first.dataset.textMax);
        const fitWidth = Number(first.dataset.textFitWidth);
        const fitCenterX = Number(first.dataset.textFitCenterX);
        const mergeCenterX = Number(first.dataset.textMergeCenterX);
        const fitThreshold = Number(first.dataset.textFitThreshold);
        return textField(
          id,
          first.dataset.textLabel || id,
          defaultValue,
          items.map(({ index }) => index),
          {
            maxLength: Number.isFinite(maxLength) && maxLength > 0 ? maxLength : Math.max(1, defaultValue.length),
            inputMode: first.dataset.textType === "number" ? "numeric" : "text",
            valueType: first.dataset.textType || "text",
            min: Number.isFinite(min) ? min : undefined,
            max: Number.isFinite(max) ? max : undefined,
            prefix,
            suffix,
            mode: first.dataset.textMode || undefined,
            fitWidth: Number.isFinite(fitWidth) && fitWidth > 0 ? fitWidth : undefined,
            fitCenterX: Number.isFinite(fitCenterX) ? fitCenterX : undefined,
            mergeCenterX: Number.isFinite(mergeCenterX) ? mergeCenterX : undefined,
            fitThreshold: Number.isFinite(fitThreshold) && fitThreshold >= 0 ? fitThreshold : undefined,
            fit: true
          }
        );
      });
      editableTextDefinitionCache.set(cacheKey, fields);
      return fields;
    }

    if (NON_EDITABLE_TEXT_SIGN_KEYS.has(editableSignKey(sign))) {
      editableTextDefinitionCache.set(cacheKey, []);
      return [];
    }

    if (STRICT_LEGACY_EDITABLE_SIGN_KEYS.has(editableSignKey(sign))) {
      editableTextDefinitionCache.set(cacheKey, legacyFields);
      return legacyFields;
    }

    const fields = elements.map((element, index) => {
      const defaultValue = String(element.textContent || "").trim();
      const legacyField = legacyFields.find((field) => field?.target?.indexes?.includes(index)) || null;
      const legacyPosition = legacyField ? legacyField.target.indexes.indexOf(index) : -1;
      const singleTargetLegacyField = legacyField?.target?.indexes?.length === 1 ? legacyField : null;
      return textField(
        `textNode${index + 1}`,
        singleTargetLegacyField?.label || `Metin ${index + 1}`,
        defaultValue,
        [index],
        {
          maxLength: Math.max(24, Math.min(120, Math.max(1, defaultValue.length) * 3)),
          inputMode: singleTargetLegacyField?.inputMode || "text",
          fit: true,
          legacyLine: index,
          legacySource: legacyField
            ? {
              field: legacyField,
              position: legacyPosition
            }
            : null
        }
      );
    });
    editableTextDefinitionCache.set(cacheKey, fields);
    return fields;
  }

  function hasEditableText(modelOrSign) {
    const sign = modelOrSign?.type === "trafficSign" ? signFromModel(modelOrSign) : modelOrSign;
    const cacheKey = String(sign?.key || artSourceFor(sign));
    if (editableTextPresenceCache.has(cacheKey)) return editableTextPresenceCache.get(cacheKey);
    const hasText = editableTextDefinitionsForSign(sign).length > 0;
    editableTextPresenceCache.set(cacheKey, hasText);
    return hasText;
  }

  function defaultLabelForSign(sign, label) {
    return label || {};
  }

  function applyRunText(run, value) {
    const elements = run.elements || [];
    if (elements.length === 1) {
      elements[0].textContent = value;
      return;
    }

    const text = String(value || "");
    const perElement = Math.max(1, Math.ceil(text.length / elements.length));
    elements.forEach((element, index) => {
      element.textContent = text.slice(index * perElement, index * perElement + perElement);
    });
  }

  function applyLegacyEditableText(model, group) {
    const runs = textRunsFor(group);
    if (!runs.length) return;
    const label = styleManager.normalizeLabel(model.label, model.type);
    if (!label.text) return;
    const text = label.text;
    const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    runs.forEach((run, index) => {
      let value = lines[index] ?? "";
      if (index === runs.length - 1 && lines.length > runs.length) {
        value = [value, ...lines.slice(runs.length)].filter(Boolean).join(" ");
      }
      applyRunText(run, value);
    });
  }

  function normalizeEditableFieldValue(value, field) {
    let text = String(value ?? "").replace(/[\r\n\t]+/g, " ");
    if (field?.valueType === "number") {
      text = text.trim().replace(/[^\d]/g, "");
    } else if (field?.valueType === "clock") {
      text = text.trim().replace(/[^\d,.:]/g, "").replace(/[.:]/g, ",");
    }
    const maxLength = Number(field?.maxLength);
    if (Number.isFinite(maxLength) && maxLength > 0) text = text.slice(0, maxLength);
    if (field?.valueType === "number" && text) {
      const number = Number(text);
      const min = Number(field?.min);
      const max = Number(field?.max);
      if (Number.isFinite(min) && number < min) text = String(min);
      if (Number.isFinite(max) && number > max) text = String(max);
    }
    return text;
  }

  function stripFieldAffixes(value, field) {
    let text = String(value ?? "").trim();
    const prefix = field?.target?.prefix || "";
    const suffix = field?.target?.suffix || "";
    if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length);
    if (suffix && text.endsWith(suffix)) text = text.slice(0, -suffix.length);
    return text.trim();
  }

  function legacyValueForField(model, field) {
    const raw = model?.label?.text || model?.label?.labelText || "";
    if (!raw) return "";
    const lines = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (Array.isArray(field.legacyLines)) {
      const parts = field.legacyLines.map((line) => lines[line] || "").filter(Boolean);
      return normalizeEditableFieldValue(parts.join(""), field);
    }
    if (Number.isInteger(field.legacyLine)) {
      return normalizeEditableFieldValue(stripFieldAffixes(lines[field.legacyLine] || "", field), field);
    }
    return "";
  }

  function legacyMetadataValueForField(model, field) {
    const source = field?.legacySource;
    const legacyField = source?.field;
    if (!legacyField) return "";
    const values = model?.metadata?.signTextFields || {};
    if (!Object.prototype.hasOwnProperty.call(values, legacyField.id)) return "";

    const legacyValue = normalizeEditableFieldValue(values[legacyField.id], legacyField);
    const target = legacyField.target || {};
    let migratedValue = "";
    if (target.mode === "clock") {
      migratedValue = splitClockText(legacyValue)[source.position] || "";
      if (String(field.defaultValue || "").endsWith(",") && migratedValue && !migratedValue.endsWith(",")) {
        migratedValue += ",";
      }
    } else {
      const renderedValue = `${target.prefix || ""}${legacyValue}${target.suffix || ""}`;
      const targetCount = Math.max(1, target.indexes?.length || 1);
      if (targetCount === 1) {
        migratedValue = renderedValue;
      } else {
        const perElement = Math.max(1, Math.ceil(renderedValue.length / targetCount));
        const start = Math.max(0, source.position) * perElement;
        migratedValue = renderedValue.slice(start, start + perElement);
      }
    }
    return normalizeEditableFieldValue(migratedValue, field);
  }

  function editableFieldValue(model, field) {
    const values = model?.metadata?.signTextFields || {};
    if (Object.prototype.hasOwnProperty.call(values, field.id)) {
      return normalizeEditableFieldValue(values[field.id], field);
    }
    const migratedValue = legacyMetadataValueForField(model, field);
    if (migratedValue) return migratedValue;
    const legacyValue = legacyValueForField(model, field);
    return legacyValue || normalizeEditableFieldValue(field.defaultValue, field);
  }

  function editableTextFields(modelOrSign) {
    const model = modelOrSign?.type === "trafficSign" ? modelOrSign : null;
    const sign = model ? signFromModel(model) : modelOrSign;
    return editableTextDefinitionsForSign(sign).map((field) => ({
      id: field.id,
      label: field.label,
      value: model ? editableFieldValue(model, field) : field.defaultValue,
      defaultValue: field.defaultValue,
      maxLength: field.maxLength,
      inputMode: field.inputMode || "text",
      valueType: field.valueType || "text",
      min: field.min,
      max: field.max
    }));
  }

  function editableTextFieldsKey(model) {
    const sign = signFromModel(model);
    return editableTextDefinitionsForSign(sign)
      .map((field) => `${field.id}:${editableFieldValue(model, field)}`)
      .join("|");
  }

  function updateEditableTextField(model, fieldId, value) {
    const sign = signFromModel(model);
    const field = editableTextDefinitionsForSign(sign).find((item) => item.id === fieldId);
    if (!field) return model;
    const metadata = { ...(model.metadata || {}) };
    const values = { ...(metadata.signTextFields || {}) };
    values[field.id] = normalizeEditableFieldValue(value, field);
    model.metadata = {
      ...metadata,
      signTextFields: values,
      signTextInitialized: true
    };
    model.label = styleManager.normalizeLabel({ ...(model.label || {}), text: "" }, model.type);
    return model;
  }

  const ORIGINAL_TEXT_ATTRS = ["x", "text-anchor", "textLength", "lengthAdjust", "display", "visibility"];

  function originalDataName(attr) {
    return `data-kroki-original-${attr}`;
  }

  function rememberOriginalTextElement(element) {
    if (!element || element.hasAttribute("data-kroki-original-text")) return;
    element.setAttribute("data-kroki-original-text", element.textContent || "");
    ORIGINAL_TEXT_ATTRS.forEach((attr) => {
      element.setAttribute(originalDataName(attr), element.getAttribute(attr) ?? "");
    });
  }

  function restoreTextElement(element) {
    if (!element) return;
    rememberOriginalTextElement(element);
    ORIGINAL_TEXT_ATTRS.forEach((attr) => {
      const value = element.getAttribute(originalDataName(attr)) ?? "";
      if (value) element.setAttribute(attr, value);
      else element.removeAttribute(attr);
    });
  }

  function numberAttr(element, attr, fallback = 0) {
    const value = Number(element?.getAttribute?.(attr));
    return Number.isFinite(value) ? value : fallback;
  }

  function textWidthFor(element, text) {
    const textLength = Number(element?.getAttribute?.("textLength"));
    if (Number.isFinite(textLength) && textLength > 0) return textLength;
    const fontSize = numberAttr(element, "font-size", 72);
    return Math.max(fontSize * 0.58, String(text || "").length * fontSize * 0.58);
  }

  function textRangeFor(element, text) {
    const x = numberAttr(element, "x", 0);
    const width = textWidthFor(element, text);
    const anchor = element?.getAttribute?.("text-anchor") || "";
    if (anchor === "middle") return { left: x - width / 2, right: x + width / 2 };
    if (anchor === "end") return { left: x - width, right: x };
    return { left: x, right: x + width };
  }

  function mergedTextRange(elements) {
    const ranges = elements.map((element) => textRangeFor(element, element.getAttribute("data-kroki-original-text") || element.textContent || ""));
    const left = Math.min(...ranges.map((range) => range.left));
    const right = Math.max(...ranges.map((range) => range.right));
    return { left, right, width: Math.max(1, right - left), center: (left + right) / 2 };
  }

  function roundSvgNumber(value) {
    return String(Math.round(Number(value) * 1000) / 1000);
  }

  function applyFittedText(element, text, baseText, forceFit) {
    restoreTextElement(element);
    element.textContent = text;
    const originalTextLength = element.getAttribute(originalDataName("textLength"));
    const shouldFit = forceFit || Boolean(originalTextLength) || String(text).length > String(baseText || "").length;
    if (!shouldFit) return;
    const width = Number(originalTextLength) || textWidthFor(element, baseText || text);
    element.setAttribute("textLength", roundSvgNumber(width));
    element.setAttribute("lengthAdjust", "spacingAndGlyphs");
  }

  function applyDistributedText(elements, text) {
    const chars = String(text || "").split("");
    elements.forEach((element, index) => {
      restoreTextElement(element);
      element.textContent = chars[index] || "";
    });
  }

  function applyMergedText(elements, text) {
    const range = mergedTextRange(elements);
    elements.forEach((element, index) => {
      restoreTextElement(element);
      if (index === 0) {
        element.textContent = text;
        element.setAttribute("x", roundSvgNumber(range.center));
        element.setAttribute("text-anchor", "middle");
        element.setAttribute("textLength", roundSvgNumber(range.width));
        element.setAttribute("lengthAdjust", "spacingAndGlyphs");
      } else {
        element.textContent = "";
        element.setAttribute("display", "none");
      }
    });
  }

  function applySplitTwoNaturalThree(elements, value, target) {
    const text = String(value || "");
    if (text.length === 2) {
      applyDistributedText(elements, text);
      return;
    }

    elements.forEach(restoreTextElement);
    const primary = elements[0];
    if (!primary) return;
    primary.textContent = text;
    primary.setAttribute("x", roundSvgNumber(Number(target.mergeCenterX) || 300));
    primary.setAttribute("text-anchor", "middle");
    const fitWidth = Number(target.fitWidth);
    if (Number.isFinite(fitWidth) && fitWidth > 0) {
      primary.setAttribute("textLength", roundSvgNumber(fitWidth));
      primary.setAttribute("lengthAdjust", "spacingAndGlyphs");
    } else {
      primary.removeAttribute("textLength");
      primary.removeAttribute("lengthAdjust");
    }
    elements.slice(1).forEach((element) => {
      element.textContent = "";
      element.setAttribute("display", "none");
    });
  }

  function applySpacedTwoNaturalThree(element, value, target) {
    restoreTextElement(element);
    const text = String(value || "");
    if (text.length === 2) {
      element.textContent = `${text[0]} ${text[1]}`;
      return;
    }

    element.textContent = text;
    element.setAttribute("x", roundSvgNumber(Number(target.mergeCenterX) || numberAttr(element, "x", 0)));
    element.setAttribute("text-anchor", "middle");
    const fitWidth = Number(target.fitWidth);
    if (text.length === 3 && Number.isFinite(fitWidth) && fitWidth > 0) {
      element.setAttribute("textLength", roundSvgNumber(fitWidth));
      element.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
  }

  function applyLongTextFit(element, value, target) {
    restoreTextElement(element);
    const text = String(value ?? "");
    element.textContent = text;
    const fitThreshold = Number(target.fitThreshold);
    const fitWidth = Number(target.fitWidth);
    if (text.length > (Number.isFinite(fitThreshold) ? fitThreshold : 8) && Number.isFinite(fitWidth) && fitWidth > 0) {
      element.setAttribute("textLength", roundSvgNumber(fitWidth));
      element.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
    if (Number.isFinite(Number(target.fitCenterX))) {
      element.setAttribute("x", roundSvgNumber(target.fitCenterX));
      element.setAttribute("text-anchor", "middle");
    }
  }

  function splitClockText(value) {
    const text = normalizeEditableFieldValue(value, { valueType: "clock", maxLength: 5 });
    const match = text.match(/^(\d{1,2})[,]?(\d{0,2})$/);
    if (match) return [`${match[1]},`, match[2] || ""];
    const parts = text.split(",");
    if (parts.length > 1) return [`${parts[0]},`, parts.slice(1).join("").slice(0, 2)];
    return [text, ""];
  }

  function targetTextElements(elements, target) {
    return (target?.indexes || [])
      .map((index) => elements[index])
      .filter(Boolean);
  }

  function applyFieldTarget(elements, field, value) {
    const target = field.target || {};
    const targetElements = targetTextElements(elements, target);
    if (!targetElements.length) return;
    targetElements.forEach(rememberOriginalTextElement);
    if (target.mode === "splitTwoNaturalThree") {
      applySplitTwoNaturalThree(targetElements, value, target);
      return;
    }
    if (target.mode === "spacedTwoNaturalThree") {
      applySpacedTwoNaturalThree(targetElements[0], value, target);
      return;
    }
    if (target.mode === "fitLongText") {
      applyLongTextFit(targetElements[0], value, target);
      return;
    }
    if (target.mode === "clock") {
      const [hour, minute] = splitClockText(value);
      applyFittedText(targetElements[0], hour, hour, false);
      if (targetElements[1]) applyFittedText(targetElements[1], minute, minute, false);
      return;
    }

    const text = `${target.prefix || ""}${value}${target.suffix || ""}`;
    const baseText = `${target.prefix || ""}${field.defaultValue || ""}${target.suffix || ""}`;
    if (targetElements.length === 1) {
      const originalText = targetElements[0].getAttribute("data-kroki-original-text") || "";
      const renderedText = !target.prefix && !target.suffix && String(value) === String(field.defaultValue || "") && originalText
        ? originalText
        : text;
      const isLongerThanDefault = String(value).length > String(field.defaultValue || "").length;
      applyFittedText(
        targetElements[0],
        renderedText,
        baseText,
        target.fit && isLongerThanDefault
      );
      if (isLongerThanDefault && Number.isFinite(Number(target.fitWidth))) {
        targetElements[0].setAttribute("textLength", roundSvgNumber(target.fitWidth));
        targetElements[0].setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
      if (isLongerThanDefault && Number.isFinite(Number(target.fitCenterX))) {
        targetElements[0].setAttribute("x", roundSvgNumber(target.fitCenterX));
        targetElements[0].setAttribute("text-anchor", "middle");
      }
      return;
    }
    if (String(value).length > targetElements.length) {
      applyMergedText(targetElements, text);
      return;
    }
    applyDistributedText(targetElements, text);
  }

  function applyEditableText(model, group) {
    const sign = signFromModel(model);
    const fields = editableTextDefinitionsForSign(sign);
    if (!fields.length) {
      applyLegacyEditableText(model, group);
      return;
    }
    const elements = textElementsIn(group);
    fields.forEach((field) => applyFieldTarget(elements, field, editableFieldValue(model, field)));
  }

  function metricsFor(model) {
    const sign = signFromModel(model);
    const geometry = model.geometry || {};
    const scale = clampScale(geometry.scale);
    const cacheKey = [
      sign.key || "",
      sign.viewBox || "",
      sign.width || "",
      sign.height || "",
      scale
    ].join("|");
    const cached = metricsCache.get(model);
    if (cached?.key === cacheKey) return cached.metrics;

    const viewBox = viewBoxFor(sign);
    const metrics = {
      sign,
      viewBox,
      scale,
      halfWidth: viewBox.width * scale / 2,
      halfHeight: viewBox.height * scale / 2,
      radius: Math.max(viewBox.width, viewBox.height) * scale / 2,
      frameShape: frameShapeFor(sign, viewBox)
    };
    metricsCache.set(model, { key: cacheKey, metrics });
    return metrics;
  }

  function transformFor(model, metrics) {
    const geometry = model.geometry || {};
    const viewBox = metrics.viewBox;
    const rotation = utils.normalizeRotation(geometry.rotation);
    const centerX = viewBox.x + viewBox.width / 2;
    const centerY = viewBox.y + viewBox.height / 2;
    return `translate(${geometry.cx} ${geometry.cy}) rotate(${rotation}) scale(${metrics.scale}) translate(${-centerX} ${-centerY})`;
  }

  function artFor(element) {
    return Array.from(element.children || []).find((child) => child.classList?.contains("editor-traffic-sign-art")) || null;
  }

  function artKeyFor(sign) {
    return [
      sign.key || "",
      sign.viewBox || "",
      sign.width || "",
      sign.height || "",
      String(sign.art || "").length
    ].join("|");
  }

  function textKeyFor(model) {
    const sign = signFromModel(model);
    const fieldKey = editableTextFieldsKey(model);
    return [
      sign.key || "",
      fieldKey,
      model.label?.text || model.label?.labelText || "",
      Boolean(model.metadata?.signTextInitialized) ? "initialized" : "fallback"
    ].join("|");
  }

  function syncArt(element, model, sign) {
    const artKey = artKeyFor(sign);
    let art = artFor(element);
    if (!art || art.dataset.signArtKey !== artKey) {
      art = parseArt(sign);
      art.classList.add("editor-traffic-sign-art");
      art.dataset.signArtKey = artKey;
      element.replaceChildren(art);
      element.dataset.signTextKey = "";
    }

    const textKey = textKeyFor(model);
    if (element.dataset.signTextKey !== textKey) {
      applyEditableText(model, art);
      element.dataset.signTextKey = textKey;
    }
    return art;
  }

  function writeDataset(element, name, value) {
    const text = String(value);
    if (element.dataset[name] !== text) element.dataset[name] = text;
  }

  function cpPoint(model, metrics) {
    const geometry = model.geometry;
    const signMetrics = metricsFor(model);
    const edgeDistance = signMetrics.frameShape === "circle" ? signMetrics.radius : signMetrics.halfWidth;
    const distance = edgeDistance + (metrics?.handleGap || 0);
    const radians = utils.normalizeRotation(geometry.rotation) * Math.PI / 180;
    return {
      x: geometry.cx + Math.cos(radians) * distance,
      y: geometry.cy + Math.sin(radians) * distance
    };
  }

  function pointDistance(model, point) {
    const geometry = model.geometry || {};
    return Math.hypot(point.x - geometry.cx, point.y - geometry.cy);
  }

  function localPointFor(model, point) {
    const geometry = model.geometry || {};
    const radians = utils.normalizeRotation(geometry.rotation) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - geometry.cx;
    const dy = point.y - geometry.cy;
    return {
      x: cos * dx + sin * dy,
      y: -sin * dx + cos * dy
    };
  }

  function rectangleHitTest(model, point, tolerance, metrics) {
    const local = localPointFor(model, point);
    const outsideX = Math.max(Math.abs(local.x) - metrics.halfWidth, 0);
    const outsideY = Math.max(Math.abs(local.y) - metrics.halfHeight, 0);
    return Math.hypot(outsideX, outsideY) <= tolerance;
  }

  function triangleVertices(metrics, scale = 1) {
    const halfWidth = metrics.halfWidth * scale;
    const halfHeight = metrics.halfHeight * scale;
    const apexY = metrics.frameShape === "triangle-down" ? halfHeight : -halfHeight;
    const baseY = -apexY;
    return [
      { x: 0, y: apexY },
      { x: halfWidth, y: baseY },
      { x: -halfWidth, y: baseY }
    ];
  }

  function crossProduct(a, b, point) {
    return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  }

  function pointInsideTriangle(point, vertices) {
    const sides = vertices.map((vertex, index) =>
      crossProduct(vertex, vertices[(index + 1) % vertices.length], point)
    );
    return !(
      sides.some((value) => value < 0) &&
      sides.some((value) => value > 0)
    );
  }

  function pointToSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const ratio = Math.max(
      0,
      Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
    );
    return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
  }

  function triangleHitTest(model, point, tolerance, metrics) {
    const local = localPointFor(model, point);
    const vertices = triangleVertices(metrics);
    if (pointInsideTriangle(local, vertices)) return true;
    return vertices.some((vertex, index) =>
      pointToSegmentDistance(local, vertex, vertices[(index + 1) % vertices.length]) <= tolerance
    );
  }

  function rotatedRectangleBounds(model, metrics) {
    const geometry = model.geometry || {};
    const radians = utils.normalizeRotation(geometry.rotation) * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const halfWidth = cos * metrics.halfWidth + sin * metrics.halfHeight;
    const halfHeight = sin * metrics.halfWidth + cos * metrics.halfHeight;
    return {
      x: geometry.cx - halfWidth,
      y: geometry.cy - halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2
    };
  }

  function localToWorld(model, point) {
    const geometry = model.geometry || {};
    const radians = utils.normalizeRotation(geometry.rotation) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: geometry.cx + cos * point.x - sin * point.y,
      y: geometry.cy + sin * point.x + cos * point.y
    };
  }

  function polygonBounds(model, vertices) {
    const points = vertices.map((point) => localToWorld(model, point));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  function selectionPath(model, metrics) {
    const geometry = model.geometry || {};
    const cx = geometry.cx;
    const cy = geometry.cy;
    if (metrics.frameShape === "circle") {
      const radius = metrics.radius * SELECTION_FRAME_SCALE;
      return [
        `M${roundSvgNumber(cx - radius)} ${roundSvgNumber(cy)}`,
        `A${roundSvgNumber(radius)} ${roundSvgNumber(radius)} 0 1 0 ${roundSvgNumber(cx + radius)} ${roundSvgNumber(cy)}`,
        `A${roundSvgNumber(radius)} ${roundSvgNumber(radius)} 0 1 0 ${roundSvgNumber(cx - radius)} ${roundSvgNumber(cy)}`,
        "Z"
      ].join(" ");
    }

    const localVertices = metrics.frameShape === "rectangle"
      ? [
        { x: -metrics.halfWidth * SELECTION_FRAME_SCALE, y: -metrics.halfHeight * SELECTION_FRAME_SCALE },
        { x: metrics.halfWidth * SELECTION_FRAME_SCALE, y: -metrics.halfHeight * SELECTION_FRAME_SCALE },
        { x: metrics.halfWidth * SELECTION_FRAME_SCALE, y: metrics.halfHeight * SELECTION_FRAME_SCALE },
        { x: -metrics.halfWidth * SELECTION_FRAME_SCALE, y: metrics.halfHeight * SELECTION_FRAME_SCALE }
      ]
      : triangleVertices(metrics, SELECTION_FRAME_SCALE);
    return localVertices
      .map((point) => localToWorld(model, point))
      .map((point, index) => `${index ? "L" : "M"}${roundSvgNumber(point.x)} ${roundSvgNumber(point.y)}`)
      .concat("Z")
      .join(" ");
  }

  const adapter = {
    elementTag: "g",
    className: "editor-traffic-sign",
    capabilities: { arrows: false, fill: false, curvedLabel: false, ownsLabel: true, trafficSign: true, gridSnap: false },

    create(initialData = {}) {
      const sign = initialData.sign || catalog.find(initialData.signKey);
      const metadata = catalog.metadataFor(sign || {});
      const center = initialData.center || initialData.point || {};
      const geometry = initialData.geometry || {};
      const baseScale = Number(sign?.baseScale) || Number(metadata.signBaseScale) || 0.08;
      const fields = editableTextDefinitionsForSign(sign);
      const initialMetadata = initialData.metadata || {};
      const signTextFields = fields.reduce((values, field) => {
        const sourceValues = initialMetadata.signTextFields || {};
        values[field.id] = Object.prototype.hasOwnProperty.call(sourceValues, field.id)
          ? normalizeEditableFieldValue(sourceValues[field.id], field)
          : normalizeEditableFieldValue(field.defaultValue, field);
        return values;
      }, {});
      return {
        type: "trafficSign",
        geometry: {
          cx: utils.numberOr(geometry.cx ?? center.x ?? initialData.x, 0),
          cy: utils.numberOr(geometry.cy ?? center.y ?? initialData.y, 0),
          scale: clampScale(geometry.scale ?? initialData.scale ?? baseScale),
          rotation: utils.normalizeRotation(geometry.rotation ?? initialData.rotation)
        },
        style: initialData.style,
        label: defaultLabelForSign(sign, initialData.label),
        metadata: {
          ...metadata,
          ...initialMetadata,
          ...(fields.length ? { signTextFields, signTextInitialized: true } : {})
        }
      };
    },

    readFromElement(element) {
      return {
        id: element.dataset.objectId,
        type: "trafficSign",
        geometry: {
          cx: utils.numberOr(element.dataset.cx, 0),
          cy: utils.numberOr(element.dataset.cy, 0),
          scale: clampScale(element.dataset.scale),
          rotation: utils.normalizeRotation(element.dataset.rotation)
        },
        style: {},
        label: {},
        metadata: {
          signKey: element.dataset.signKey || "",
          signCode: element.dataset.signCode || "",
          signName: element.dataset.signName || "",
          signCategory: element.dataset.signCategory || "",
          signCategoryKey: element.dataset.signCategoryKey || "",
          signViewBox: element.dataset.signViewBox || "",
          signWidth: utils.numberOr(element.dataset.signWidth, 100),
          signHeight: utils.numberOr(element.dataset.signHeight, 100),
          signBaseScale: utils.numberOr(element.dataset.signBaseScale, 0.08)
        }
      };
    },

    render(model, element) {
      const metrics = metricsFor(model);
      const sign = metrics.sign;
      const geometry = model.geometry || {};
      syncArt(element, model, sign);
      writeDataset(element, "cx", geometry.cx);
      writeDataset(element, "cy", geometry.cy);
      writeDataset(element, "scale", metrics.scale);
      writeDataset(element, "rotation", utils.normalizeRotation(geometry.rotation));
      writeDataset(element, "signKey", sign.key || "");
      writeDataset(element, "signCode", sign.code || "");
      writeDataset(element, "signName", sign.name || "");
      writeDataset(element, "signCategory", sign.category || "");
      writeDataset(element, "signCategoryKey", sign.categoryKey || "");
      writeDataset(element, "signViewBox", sign.viewBox || "");
      writeDataset(element, "signWidth", sign.width || "");
      writeDataset(element, "signHeight", sign.height || "");
      writeDataset(element, "signBaseScale", sign.baseScale || "");
      element.setAttribute("transform", transformFor(model, metrics));
    },

    hitTest(model, point, tolerance) {
      const metrics = metricsFor(model);
      if (metrics.frameShape === "rectangle") return rectangleHitTest(model, point, tolerance, metrics);
      if (metrics.frameShape.startsWith("triangle")) return triangleHitTest(model, point, tolerance, metrics);
      return pointDistance(model, point) <= metrics.radius + tolerance;
    },

    getControlPoints(model, metrics) {
      return [{
        id: "rotate",
        ...cpPoint(model, metrics),
        role: "rotate",
        cursor: "grab"
      }];
    },

    moveControlPoint(model, cpId, worldPoint) {
      if (cpId !== "rotate") return;
      model.geometry.rotation = utils.normalizeRotation(
        Math.atan2(worldPoint.y - model.geometry.cy, worldPoint.x - model.geometry.cx) * 180 / Math.PI
      );
    },

    move(model, dx, dy) {
      model.geometry.cx += dx;
      model.geometry.cy += dy;
    },

    getBounds(model) {
      const metrics = metricsFor(model);
      if (metrics.frameShape === "rectangle") return rotatedRectangleBounds(model, metrics);
      if (metrics.frameShape.startsWith("triangle")) {
        return polygonBounds(model, triangleVertices(metrics));
      }
      const radius = metrics.radius;
      return {
        x: model.geometry.cx - radius,
        y: model.geometry.cy - radius,
        width: radius * 2,
        height: radius * 2
      };
    },

    clone(model) {
      return utils.clonePlain(model);
    },

    createSelectionElement() {
      return utils.createSvgElement("path", { class: "editor-object-selection editor-traffic-sign-selection" });
    },

    renderSelection(element, model, style, mode) {
      const isMulti = mode === "multi";
      element.setAttribute("d", selectionPath(model, metricsFor(model)));
      element.setAttribute("stroke-width", isMulti ? String(MULTI_SELECTION_STROKE_WIDTH) : "0");
      if (isMulti) {
        element.removeAttribute("stroke");
        element.removeAttribute("fill");
      } else {
        element.setAttribute("stroke", "none");
        element.setAttribute("fill", mode === "edit" ? "rgba(34, 197, 94, .5)" : "rgba(239, 68, 68, .5)");
      }
      element.removeAttribute("transform");
      element.classList.toggle("is-edit", mode === "edit");
      element.classList.toggle("is-preselect", mode === "preselect");
    },

    hasEditableText,
    editableTextFields,
    updateEditableTextField,

    effectiveLabel(model) {
      const label = styleManager.normalizeLabel(model.label, model.type);
      const fields = editableTextFields(model);
      if (fields.length) {
        return styleManager.normalizeLabel({ ...label, text: fields.map((field) => field.value).join("\n") }, model.type);
      }
      if (label.text || model.metadata?.signTextInitialized) return label;
      return styleManager.normalizeLabel({ ...label, text: editableTextForSign(signFromModel(model)) }, model.type);
    }
  };

  registry.register("trafficSign", adapter);
})();
