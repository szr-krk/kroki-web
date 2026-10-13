(() => {
  const Kroki = window.Kroki = window.Kroki || {};
  const data = window.KrokiDirectionSignData;
  if (!data) return;

  const FAMILY = "arrow-single-message-v1";
  const DEFAULT_TEXT = "MERKEZ";
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

  function layoutFor(direction, value) {
    const arrow = data.arrows[direction];
    if (!arrow) return null;
    const text = String(value ?? DEFAULT_TEXT).replace(/[\r\n\t]+/g, " ").slice(0, 120);
    const metrics = textMetrics(text);
    const a = data.unit;
    const height = data.capHeight + 12 * a;
    const width = metrics.width + arrow.width + 16 * a;
    const arrowOnRight = direction === "up-right";
    return {
      text, width, height, arrow,
      textX: (arrowOnRight ? 6 * a : 10 * a + arrow.width) - metrics.left,
      baseline: 6 * a + data.capHeight,
      arrowX: arrowOnRight ? 10 * a + metrics.width : 6 * a,
      arrowY: (height - arrow.height) / 2,
      fontSize: data.capHeight / data.fontCapHeight * data.fontUnitsPerEm
    };
  }

  function template(direction) {
    const layout = layoutFor(direction, DEFAULT_TEXT);
    const a = data.unit;
    const rect = (role, inset, radius) => `<rect data-sign-part="${role}" x="${inset}" y="${inset}" width="${number(layout.width - 2 * inset)}" height="${number(layout.height - 2 * inset)}" rx="${radius}"/>`;
    return {
      width: layout.width, height: layout.height,
      art: `<g data-sign-layout="${FAMILY}" fill="#fff" stroke="#000" stroke-width="${number(data.outline)}" stroke-linejoin="round">
        ${rect("board", 0, 0)}
        ${rect("outer-frame", a, 3 * a)}
        ${rect("inner-frame", 2 * a, 2 * a)}
        <path data-sign-part="arrow" fill="none" d="${escape(layout.arrow.path)}" transform="translate(${number(layout.arrowX)} ${number(layout.arrowY)})"/>
        <text data-sign-part="message" data-editable-text="true" data-text-key="message" data-text-label="Yer / yön adı" data-text-type="text" data-text-maxlength="120" x="${number(layout.textX)}" y="${number(layout.baseline)}" font-family="KrokiSignNarrow, Arial Narrow, Arial, sans-serif" font-size="${number(layout.fontSize)}" font-weight="400" letter-spacing="${a}" style="font-kerning:none;font-variant-ligatures:none" fill="#000" stroke="none" xml:space="preserve">${DEFAULT_TEXT}</text>
      </g>`
    };
  }

  function resolve(sign, model) {
    if (sign?.layout?.family !== FAMILY) return sign;
    const value = model?.metadata?.signTextFields?.message ?? DEFAULT_TEXT;
    const cached = model && modelCache.get(model);
    if (cached?.source === sign && cached.value === value) return cached.sign;
    const layout = layoutFor(sign.layout.direction, value);
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
    const text = group.querySelector('[data-sign-part="message"]');
    text.textContent = layout.text;
    text.setAttribute("x", number(layout.textX));
    return true;
  }

  Kroki.TrafficSignLayout = { template, resolve, apply };
})();
