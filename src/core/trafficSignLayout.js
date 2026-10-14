(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const data = window.KrokiDirectionSignData;
  if (!data) return;

  const FAMILY = "arrow-single-message-v1";
  const FAMILIES = {
    [FAMILY]: { arrows: data.arrows, fields: [{ id: "message", label: "Yer / yön adı", defaultValue: "MERKEZ" }] },
    "arrow-double-message-v1": { arrows: data.doubleArrows, fields: [
      { id: "message1", label: "1. yer / yön adı", defaultValue: "MERKEZ" },
      { id: "message2", label: "2. yer / yön adı", defaultValue: "HASTANE" }
    ] }
  };
  const modelCache = new WeakMap();
  const number = value => String(Math.round(value * 1000) / 1000);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[char]);

  function textMetrics(text) {
    // Match the bundled font without layout reads or font-loading races.
    // Kerning and ligatures are disabled on this family's SVG text.
    const scale = data.capHeight / data.fontCapHeight;
    let cursor = 0, left = Infinity, right = -Infinity;
    for (const char of Array.from(text)) {
      const glyph = data.glyphs[char.codePointAt(0)] || data.fallbackGlyph;
      if (glyph[2] > glyph[1]) {
        left = Math.min(left, cursor + glyph[1] * scale);
        right = Math.max(right, cursor + glyph[2] * scale);
      }
      cursor += glyph[0] * scale + data.unit;
    }
    return Number.isFinite(left) ? { left, width: right - left } : { left: 0, width: 0 };
  }

  function layoutFor(direction, values, family) {
    const profile = FAMILIES[family];
    const arrow = profile?.arrows?.[direction];
    if (!arrow) return null;
    const a = data.unit;
    const rows = profile.fields.map(field => {
      const text = String(values?.[field.id] ?? field.defaultValue).replace(/[\r\n\t]+/g, " ").slice(0, 120);
      return { ...field, text, metrics: textMetrics(text) };
    });
    const textWidth = Math.max(...rows.map(row => row.metrics.width));
    const height = rows.length * data.capHeight + (12 + 4 * (rows.length - 1)) * a;
    const width = textWidth + arrow.width + 16 * a;
    const arrowOnRight = direction === "right" || direction === "up-right";
    rows.forEach((row, index) => {
      row.textX = (arrowOnRight ? 6 * a : 10 * a + arrow.width) - row.metrics.left;
      row.baseline = 6 * a + data.capHeight + index * (data.capHeight + 4 * a);
    });
    return {
      rows, width, height, arrow,
      arrowX: arrowOnRight ? 10 * a + textWidth : 6 * a,
      arrowY: (height - arrow.height) / 2,
      fontSize: data.capHeight / data.fontCapHeight * data.fontUnitsPerEm
    };
  }

  function template(direction, family = FAMILY) {
    const layout = layoutFor(direction, {}, family);
    const a = data.unit;
    const rect = (role, inset, radius) => `<rect data-sign-part="${role}" x="${inset}" y="${inset}" width="${number(layout.width - 2 * inset)}" height="${number(layout.height - 2 * inset)}" rx="${radius}"/>`;
    return {
      width: layout.width, height: layout.height,
      art: `<g data-sign-layout="${family}" fill="#fff" stroke="#000" stroke-width="${number(data.outline)}" stroke-linejoin="round">
        ${rect("board", 0, 0)}
        ${rect("outer-frame", a, 3 * a)}
        ${rect("inner-frame", 2 * a, 2 * a)}
        <path data-sign-part="arrow" fill="none" d="${escape(layout.arrow.path)}" transform="translate(${number(layout.arrowX)} ${number(layout.arrowY)})"/>
        ${layout.rows.map(row => `<text data-sign-part="${row.id}" data-editable-text="true" data-text-key="${row.id}" data-text-label="${escape(row.label)}" data-text-type="text" data-text-maxlength="120" x="${number(row.textX)}" y="${number(row.baseline)}" font-family="KrokiSignNarrow, Arial Narrow, Arial, sans-serif" font-size="${number(layout.fontSize)}" font-weight="400" letter-spacing="${a}" style="font-kerning:none;font-variant-ligatures:none" fill="#000" stroke="none" xml:space="preserve">${escape(row.text)}</text>`).join("\n")}
      </g>`
    };
  }

  function resolve(sign, model) {
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
    const layout = sign?.resolvedLayout;
    if (!layout) return false;
    for (const [role, inset] of [["board", 0], ["outer-frame", data.unit], ["inner-frame", 2 * data.unit]]) {
      group.querySelector(`[data-sign-part="${role}"]`).setAttribute("width", number(layout.width - 2 * inset));
    }
    group.querySelector('[data-sign-part="arrow"]').setAttribute("transform", `translate(${number(layout.arrowX)} ${number(layout.arrowY)})`);
    layout.rows.forEach(row => {
      const text = group.querySelector(`[data-sign-part="${row.id}"]`);
      text.textContent = row.text;
      text.setAttribute("x", number(row.textX));
    });
    return true;
  }

  Kroki.TrafficSignLayout = { template, resolve, apply };
})();
