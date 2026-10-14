(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const data = window.KrokiDirectionSignData;
  if (!data) return;

  const FAMILY = "arrow-single-message-v1";
  const singleFields = [{ id: "message", label: "Yer / yön adı", defaultValue: "MERKEZ" }];
  const doubleFields = [
    { id: "message1", label: "1. yer / yön adı", defaultValue: "MERKEZ" },
    { id: "message2", label: "2. yer / yön adı", defaultValue: "HASTANE" }
  ];
  const FAMILIES = {
    [FAMILY]: { arrows: data.arrows, fields: singleFields },
    "arrow-double-message-v1": { arrows: data.doubleArrows, fields: doubleFields },
    "finger-single-message-v1": { finger: true, fields: singleFields },
    "finger-double-message-v1": { finger: true, fields: doubleFields },
    "tourist-finger-v1": { finger: true, tourist: true, background: "#74352f", foreground: "#fff", fields: [
      { id: "message1", label: "Yer adı", defaultValue: "Belkıs" },
      { id: "message2", label: "2. satır / açıklama", defaultValue: "(Aspendos)" },
      { id: "distance", label: "Mesafe (km)", defaultValue: "4", maxLength: 8 }
    ] }
  };
  const modelCache = new WeakMap();
  const extensions = new Map();
  const number = value => String(Math.round(value * 1000) / 1000);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[char]);

  function textMetrics(text, capHeight = data.capHeight, spacing = data.unit) {
    // Match the bundled font without layout reads or font-loading races.
    // Kerning and ligatures are disabled on this family's SVG text.
    const scale = capHeight / data.fontCapHeight;
    let cursor = 0, left = Infinity, right = -Infinity;
    for (const char of Array.from(text)) {
      const glyph = data.glyphs[char.codePointAt(0)] || data.fallbackGlyph;
      if (glyph[2] > glyph[1]) {
        left = Math.min(left, cursor + glyph[1] * scale);
        right = Math.max(right, cursor + glyph[2] * scale);
      }
      cursor += glyph[0] * scale + spacing;
    }
    return Number.isFinite(left) ? { left, width: right - left } : { left: 0, width: 0 };
  }

  function layoutFor(direction, values, family) {
    const profile = FAMILIES[family];
    const arrow = profile?.arrows?.[direction];
    if (!profile || (!profile.finger && !arrow)) return null;
    const a = data.unit;
    const rows = profile.fields.map(field => {
      const text = String(values?.[field.id] ?? field.defaultValue).replace(/[\r\n\t]+/g, " ").slice(0, field.maxLength || 120);
      return { ...field, text, metrics: textMetrics(text) };
    });
    const nameWidth = profile.tourist ? Math.max(rows[0].metrics.width, rows[1].metrics.width) : 0;
    const textWidth = profile.tourist ? nameWidth + (rows[2].text.trim() ? 9 * a + rows[2].metrics.width : 0) : Math.max(...rows.map(row => row.metrics.width));
    const lineCount = profile.tourist ? 2 : rows.length;
    const height = lineCount * data.capHeight + (12 + 4 * (lineCount - 1)) * a;
    const width = profile.finger ? textWidth + 13 * a + height / 2 : textWidth + arrow.width + 16 * a;
    const arrowOnRight = profile.finger || direction === "right" || direction === "up-right";
    rows.forEach((row, index) => {
      row.textX = (arrowOnRight ? 6 * a : 10 * a + arrow.width) - row.metrics.left;
      if (profile.tourist) row.textX = 6 * a + (index < 2 ? (nameWidth - row.metrics.width) / 2 : nameWidth + 9 * a) - row.metrics.left;
      row.baseline = 6 * a + data.capHeight + (profile.tourist ? Math.min(index, 1) : index) * (data.capHeight + 4 * a);
    });
    return {
      rows, width, height, arrow, finger: !!profile.finger, background: profile.background, foreground: profile.foreground || "#000",
      arrowX: arrowOnRight ? 10 * a + textWidth : 6 * a,
      arrowY: arrow ? (height - arrow.height) / 2 : 0,
      fontSize: data.capHeight / data.fontCapHeight * data.fontUnitsPerEm
    };
  }

  function fingerPath(layout, inset) {
    const a = data.unit, h = layout.height, w = layout.width;
    const shoulder = w - h / 2;
    if (!inset) return `M0 0H${number(shoulder)}L${number(w)} ${number(h / 2)} ${number(shoulder)} ${number(h)}H0Z`;
    const radius = inset === a ? 3 * a : 2 * a;
    const topEnd = inset === a ? shoulder - (Math.SQRT2 - 1) * a : shoulder - 3 * a;
    const tip = inset === a ? w - Math.SQRT2 * a : w - 8 * a;
    return `M${number(inset + radius)} ${number(inset)}H${number(topEnd)}L${number(tip)} ${number(h / 2)} ${number(topEnd)} ${number(h - inset)}H${number(inset + radius)}A${radius} ${radius} 0 0 1 ${inset} ${number(h - inset - radius)}V${number(inset + radius)}A${radius} ${radius} 0 0 1 ${number(inset + radius)} ${inset}Z`;
  }

  function template(direction, family = FAMILY) {
    const layout = layoutFor(direction, {}, family);
    const a = data.unit;
    const rect = (role, inset, radius) => `<rect data-sign-part="${role}" x="${inset}" y="${inset}" width="${number(layout.width - 2 * inset)}" height="${number(layout.height - 2 * inset)}" rx="${radius}"/>`;
    const frame = (role, inset, radius) => layout.finger ? `<path data-sign-part="${role}"${layout.background ? ` fill="${role === "outer-frame" ? layout.foreground : layout.background}"` : ""} d="${fingerPath(layout, inset)}"/>` : rect(role, inset, radius);
    return {
      width: layout.width, height: layout.height,
      art: `<g data-sign-layout="${family}" fill="#fff" stroke="${layout.background ? "none" : "#000"}" stroke-width="${number(data.outline)}" stroke-linejoin="round">
        ${frame("board", 0, 0)}
        ${frame("outer-frame", a, 3 * a)}
        ${frame("inner-frame", 2 * a, 2 * a)}
        ${layout.arrow ? `<path data-sign-part="arrow" fill="none" d="${escape(layout.arrow.path)}" transform="translate(${number(layout.arrowX)} ${number(layout.arrowY)})"/>` : ""}
        ${layout.rows.map(row => `<text data-sign-part="${row.id}" data-editable-text="true" data-text-key="${row.id}" data-text-label="${escape(row.label)}" data-text-type="text" data-text-maxlength="${row.maxLength || 120}" x="${number(row.textX)}" y="${number(row.baseline)}" font-family="KrokiSignNarrow, Arial Narrow, Arial, sans-serif" font-size="${number(layout.fontSize)}" font-weight="400" letter-spacing="${a}" style="font-kerning:none;font-variant-ligatures:none" fill="${layout.foreground}" stroke="none" xml:space="preserve">${escape(row.text)}</text>`).join("\n")}
      </g>`
    };
  }

  function resolve(sign, model) {
    const extension = extensions.get(sign?.layout?.family);
    if (extension) return extension.resolve(sign, model);
    const profile = FAMILIES[sign?.layout?.family];
    if (!profile) return sign;
    const values = model?.metadata?.signTextFields || {};
    const value = JSON.stringify(profile.fields.map(field => values[field.id] ?? field.defaultValue));
    const cached = model && modelCache.get(model);
    if (cached?.source === sign && cached.value === value) return cached.sign;
    const layout = layoutFor(sign.layout.direction, values, sign.layout.family);
    if (!layout) return sign;
    const resolved = { ...sign, width: layout.width, height: layout.height,
      viewBox: `0 0 ${number(layout.width)} ${number(layout.height)}`, resolvedLayout: layout };
    if (model) modelCache.set(model, { source: sign, value, sign: resolved });
    return resolved;
  }

  function apply(group, sign) {
    const extension = extensions.get(sign?.layout?.family);
    if (extension) return extension.apply(group, sign);
    const layout = sign?.resolvedLayout;
    if (!layout) return false;
    for (const [role, inset] of [["board", 0], ["outer-frame", data.unit], ["inner-frame", 2 * data.unit]]) {
      const frame = group.querySelector(`[data-sign-part="${role}"]`);
      if (layout.finger) frame.setAttribute("d", fingerPath(layout, inset));
      else frame.setAttribute("width", number(layout.width - 2 * inset));
    }
    if (layout.arrow) group.querySelector('[data-sign-part="arrow"]').setAttribute("transform", `translate(${number(layout.arrowX)} ${number(layout.arrowY)})`);
    layout.rows.forEach(row => {
      const text = group.querySelector(`[data-sign-part="${row.id}"]`);
      text.textContent = row.text;
      text.setAttribute("x", number(row.textX));
    });
    return true;
  }

  Kroki.TrafficSignLayout = { template, resolve, apply, measureText: textMetrics,
    registerFamily: (family, handler) => extensions.set(family, handler) };
})();
