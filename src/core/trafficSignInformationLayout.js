(() => {
  const K = window.Kroki, engine = K?.TrafficSignLayout;
  if (!engine) return;
  const family = "information-v1", blue = "#304faa", orange = "#f4711f";
  const cache = new WeakMap();
  const n = value => Math.round(value * 1000) / 1000;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
  // Native dimensions from PDFs 141–151; a is normalized to 100 at the root.
  const profiles = {
    village: { a: 16, fields: [["name", "Yer adı", "Beşbıçak"], ["distance", "Mesafe (isteğe bağlı)", "8", "number"]] },
    villageArrow: { a: 16, fields: [["name", "Yer adı", "Hamitler"], ["distance", "Mesafe (isteğe bağlı)", "9", "number"]] },
    airport: { a: 16, fields: [] }, airportArrow: { a: 16, fields: [] },
    camp: { a: 20, fields: [["distance", "Mesafe", "500 m"]] },
    country: { a: 40, fields: [] }, province: { a: 20, fields: [["name", "İl adı", "DİYARBAKIR"]] },
    town: { a: 100, fields: [["name", "Yer adı", "ANKARA"]] },
    townEnd: { a: 100, fields: [["name", "Yer adı", "ANKARA"]] },
    region: { a: 20, fields: [["number", "Bölge numarası", "6", "number"]] },
    branch: { a: 20, fields: [["number", "Şube numarası", "64", "number"]] },
    maintenance: { a: 20, fields: [["line2", "2. satır", "64. Şube Şefliği"], ["line3", "3. satır", "KARADAĞ BAKIMEVİ"]] },
    construction: { a: 20, fields: [["line2", "2. satır", "6. Bölge"], ["line3", "3. satır", "Müdürlüğü"], ["line4", "4. satır", "Pınarbaşı-Gürün Yolu"], ["line5", "5. satır", "Yapım Şantiye Şefliği"]] }
  };
  function build(profile, values = {}) {
    const p = profiles[profile], a = p.a, nodes = [];
    const fields = Object.fromEntries(p.fields.map(([id, label, fallback, type = "text"]) => [id, { id, label, type,
      text: String(values[id] ?? fallback).replace(/[\r\n\t]+/g, " ").slice(0, type === "number" ? 8 : 120) }]));
    const value = id => fields[id].text;
    const metric = (text, cap = 6.25 * a) => engine.measureText(text, cap, a);
    const add = (tag, attrs, text) => nodes.push({ tag, attrs, text });
    const path = (d, fill, attrs = {}) => add("path", { d, fill, ...attrs });
    const rect = (x, y, width, height, fill, rx = 0) => add("rect", { x, y, width, height, rx, fill });
    let w, h;
    function lettering(text, x, baseline, cap, fill, id, available, extra = {}) {
      const m = metric(text, cap), width = available === undefined ? m.width : Math.min(m.width, available);
      const attrs = { x: n(x - m.left * (m.width ? width / m.width : 1)), y: baseline, fill,
        "font-size": n(cap * 2048 / 1466), "letter-spacing": a, "data-editable-text": id ? "true" : "false", ...extra };
      if (available !== undefined && m.width > available) Object.assign(attrs, { textLength: n(available), lengthAdjust: "spacingAndGlyphs" });
      if (id) Object.assign(attrs, { "data-text-key": id, "data-text-label": fields[id].label,
        "data-text-type": fields[id].type, "data-text-maxlength": fields[id].type === "number" ? 8 : 120 });
      add("text", attrs, text);
    }
    function centered(text, y, cap, fill, id, available = w - 12 * a) {
      lettering(text, (w - Math.min(metric(text, cap).width, available)) / 2, y, cap, fill, id, available);
    }
    function frame(bg, fg, finger = false, outlined = false) {
      if (!finger) {
        rect(0, 0, w, h, bg); rect(a, a, w - 2 * a, h - 2 * a, fg, 3 * a);
        rect(2 * a, 2 * a, w - 4 * a, h - 4 * a, bg, 2 * a);
        if (outlined) nodes.slice(-3).forEach(node => Object.assign(node.attrs, { fill: "#fff", stroke: "#000", "stroke-width": a * .14 }));
        return;
      }
      for (let i = 0; i < 3; i++) {
        const inset = i * a, r = (i === 1 ? 3 : 2) * a, shoulder = w - h / 2;
        const end = i === 1 ? shoulder - (Math.SQRT2 - 1) * a : shoulder - 3 * a;
        const tip = i === 1 ? w - Math.SQRT2 * a : w - 8 * a;
        const d = !i ? `M0 0H${n(shoulder)}L${n(w)} ${n(h / 2)} ${n(shoulder)} ${n(h)}H0Z` :
          `M${inset + r} ${inset}H${n(end)}L${n(tip)} ${n(h / 2)} ${n(end)} ${h - inset}H${inset + r}A${r} ${r} 0 0 1 ${inset} ${h - inset - r}V${inset + r}A${r} ${r} 0 0 1 ${inset + r} ${inset}Z`;
        path(d, outlined ? "#fff" : i === 1 ? fg : bg, outlined || !i ? { stroke: "#000", "stroke-width": a * .14 } : {});
      }
    }
    function plane(x, y, size, mirror = false) {
      // One closed outline traced from the PDF, without its triangulated fills.
      const d = "M33.65 15.14H23.2L12.31 0H9.93L14.68 12.31V15.14L5.21 15.86 1.9 11.11H0L1.42 16.31 0 16.79 1.42 17.27 0 22.47H1.9L5.21 17.75 14.68 18.44V21.3L9.93 33.58H12.31L23.2 18.44H33.65C34.72 18.48 35.68 17.8 36 16.79C35.68 15.77 34.72 15.1 33.65 15.14Z";
      path(d, "#fff", { stroke: "#000", "stroke-width": .25, transform: `translate(${n(x + (mirror ? size : 0))} ${n(y)}) scale(${n((mirror ? -1 : 1) * size / 36)} ${n(size / 36)})` });
    }
    if (profile === "village" || profile === "villageArrow") {
      h = 292;
      const nameWidth = metric(value("name")).width, distance = value("distance").trim();
      const textWidth = nameWidth + (distance ? 9 * a + metric(distance).width : 0);
      const arrow = profile === "villageArrow", arrowWidth = 10 * a;
      w = textWidth + (arrow ? 16 * a + arrowWidth : 13 * a + h / 2);
      frame("#fff", "#000", !arrow);
      lettering(value("name"), 6 * a, 196, 100, "#000", "name", undefined, { "font-weight": 700 });
      lettering(distance, 6 * a + nameWidth + (distance ? 9 * a : 0), 196, 100, "#000", "distance", undefined, { "font-weight": 700 });
      if (arrow) path("M600 45L525 345 1076 308V608L525 570 600 870C600 909 556 933 519 908L18 496C-6 476-6 438 18 419L519 7C556-17 600 6 600 45Z", "#000", { transform: `translate(${n(10 * a + textWidth + arrowWidth)} 78) scale(-.149 .149)` });
    } else if (profile === "airport" || profile === "airportArrow") {
      h = 292;
      const tw = metric("Havalimanı").width, size = 9.6 * a, arrow = profile === "airportArrow";
      w = tw + size + (arrow ? 28 * a : 18 * a + h / 2);
      frame("#fff", "#000", !arrow, true);
      const textX = arrow ? 20 * a : 11 * a + size;
      lettering("Havalimanı", textX, 196, 100, "#fff", null, undefined, { stroke: "#000", "stroke-width": 1.4, "font-weight": 700 });
      plane(arrow ? textX + tw + 3 * a : 5 * a, (h - size * 33.58 / 36) / 2, size, arrow);
      if (arrow) path(window.KrokiDirectionSignData.arrows.left.path, "none", { stroke: "#000", "stroke-width": 14, transform: "translate(96 73) scale(.149)" });
    } else if (profile === "camp") {
      w = 1580; h = 500; frame(blue, "#fff", true);
      path("M120 380L278 142 263 120 280 120 288 130 295 120 312 120 298 142 470 380H120Z M255 380H340L296 253Z", "#fff", { "fill-rule": "evenodd" });
      lettering(value("distance"), 550, 380, 125, "#fff", "distance", 640);
    } else if (profile === "country") {
      w = 2450; h = 1700; frame(blue, "#fff");
      rect(755, 280, 940, 640, "#fff"); rect(775, 300, 900, 600, "#ee252c");
      path("M925 600A150 150 0 1 0 1225 600A150 150 0 1 0 925 600Z", "#fff");
      path("M992.5 600A120 120 0 1 0 1232.5 600A120 120 0 1 0 992.5 600Z", "#ee252c");
      const star = Array.from({ length: 10 }, (_, i) => { const t = Math.PI + i * Math.PI / 5, r = i % 2 ? 28.65 : 75; return `${n(1300 + Math.cos(t) * r)} ${n(600 + Math.sin(t) * r)}`; });
      path(`M${star.join("L")}Z`, "#fff");
      lettering("TÜRKİYE", 280, 1420, 250, "#fff", null, undefined, { textLength: 1890, lengthAdjust: "spacingAndGlyphs" });
    } else if (profile === "province") {
      h = 600; w = Math.max(1587, metric(value("name"), 125).width + 240, metric("İl sınırı", 125).width + 240);
      frame(blue, "#fff"); centered(value("name"), 245, 125, "#fff", "name"); centered("İl sınırı", 480, 125, "#fff");
    } else if (profile === "town" || profile === "townEnd") {
      h = 1625; w = Math.max(10 * a + metric(value("name")).width, 12 * a); frame(blue, "#fff");
      if (profile === "townEnd") {
        // Clip analytically to the inner rectangle. The rounded frame covers ends;
        // the red stripe is painted before lettering and follows every new width.
        const x = 2 * a, y = h - 2 * a, right = w - 2 * a, top = 2 * a;
        const slope = (y - top) / (right - x), offset = 1.5 * a * Math.sqrt(1 + slope * slope);
        path(`M${x} ${n(y - offset)}L${n(right - offset / slope)} ${top}H${right}V${n(top + offset)}L${n(x + offset / slope)} ${y}H${x}Z`, "#ee252c");
        // Restore the rounded inner corners without a shared SVG clip-path id.
        const r = 2 * a;
        path(`M${x} ${top + r}V${top}H${x + r}A${r} ${r} 0 0 0 ${x} ${top + r}Z M${right - r} ${top}H${right}V${top + r}A${r} ${r} 0 0 0 ${right - r} ${top}Z M${right} ${y - r}V${y}H${right - r}A${r} ${r} 0 0 0 ${right} ${y - r}Z M${x + r} ${y}H${x}V${y - r}A${r} ${r} 0 0 0 ${x + r} ${y}Z`, "#fff");
      }
      centered(value("name"), 1125, 625, "#fff", "name", w - 10 * a);
    } else {
      w = profile === "maintenance" ? 2062 : profile === "construction" ? 2320 : 1752;
      h = profile === "construction" ? 1300 : 800; frame(orange, "#000");
      centered("KARAYOLLARI", profile === "construction" ? 260 : 245, 125, "#000");
      if (profile === "region" || profile === "branch") {
        const digits = value("number"), suffix = profile === "region" ? ". Bölge" : ". Şube";
        const first = metric(digits, 125), last = metric(suffix, 125), gap = a * 1.3;
        const total = first.width + gap + last.width, scale = Math.min(1, (w - 12 * a) / total);
        const x = (w - total * scale) / 2;
        lettering(digits, x, 465, 125, "#000", "number", first.width * scale);
        lettering(suffix, x + (first.width + gap) * scale, 465, 125, "#000", null, last.width * scale);
        centered(profile === "region" ? "Müdürlüğü" : "Şefliği", 680, 125, "#000");
      } else if (profile === "maintenance") {
        centered(value("line2"), 475, 125, "#000", "line2"); centered(value("line3"), 680, 100, "#000", "line3");
      } else {
        [["line2", 505, 125], ["line3", 750, 125], ["line4", 970, 100], ["line5", 1170, 100]].forEach(([id, y, cap]) => centered(value(id), y, cap, "#000", id));
      }
    }
    return { width: w * 100 / a, height: h * 100 / a, factor: 100 / a, nodes };
  }
  function template(profile) {
    const b = build(profile);
    const art = `<g data-information-root="${profile}" transform="scale(${n(b.factor)})" font-family="KrokiSignNarrow, Arial Narrow, Arial, sans-serif" font-weight="400" style="font-kerning:none;font-variant-ligatures:none">${b.nodes.map((node, i) => `<${node.tag} data-information-part="${i}" ${Object.entries(node.attrs).map(([key, value]) => `${key}="${escape(typeof value === "number" ? n(value) : value)}"`).join(" ")}>${node.text === undefined ? "" : escape(node.text)}</${node.tag}>`).join("")}</g>`;
    return { width: b.width, height: b.height, art };
  }
  function resolve(sign, model) {
    if (!profiles[sign.layout.profile]) return sign;
    const values = model?.metadata?.signTextFields || {}, key = JSON.stringify(values), old = model && cache.get(model);
    if (old?.source === sign && old.key === key) return old.sign;
    const b = build(sign.layout.profile, values);
    const resolved = { ...sign, width: b.width, height: b.height, viewBox: `0 0 ${n(b.width)} ${n(b.height)}`, resolvedLayout: b };
    if (model) cache.set(model, { source: sign, key, sign: resolved });
    return resolved;
  }
  function apply(group, sign) {
    if (!sign.resolvedLayout) return false;
    sign.resolvedLayout.nodes.forEach((node, i) => {
      const element = group.querySelector(`[data-information-part="${i}"]`);
      if (!element) return;
      // Fitting can disappear after replacing a long label with a short one.
      if (node.tag === "text") { element.removeAttribute("textLength"); element.removeAttribute("lengthAdjust"); element.textContent = node.text; }
      Object.entries(node.attrs).forEach(([key, value]) => element.setAttribute(key, typeof value === "number" ? n(value) : value));
    });
    return true;
  }
  engine.registerFamily(family, { resolve, apply });
  K.TrafficSignInformationLayout = { template };
})();
