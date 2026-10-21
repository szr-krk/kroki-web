(() => {
  const K = window.Kroki = window.Kroki || {};
  const U = K.EditorUtils;
  const choices = [
    { id: "none", title: "Yok — normal çizgi" },
    { id: "water", title: "Su akıntısı", base: "#91d6ef", ink: "#1677ad" },
    { id: "mud", title: "Çamur akıntısı", base: "#ba926b", ink: "#704622" },
    { id: "brake", title: "Fren izi", base: "transparent", ink: "#242424" },
    { id: "tire", title: "Kesintili lastik izi", base: "transparent", ink: "#303030" },
    { id: "oil", title: "Yağ / yakıt izi", base: "#a5a5a5", ink: "#44444c" },
    { id: "grit", title: "Kum / çakıl", base: "#ddc9a4", ink: "#897359" }
  ];
  // Vehicle catalog uses 50 units per 3.5 metres. One path is one tyre.
  const brakeWidths = [
    { id: "thin", title: "İnce", width: 1.8 },
    { id: "normal", title: "Normal", width: 3.2 },
    { id: "wide", title: "Geniş", width: 4.8 }
  ];
  const brakeWidthChoice = value => brakeWidths.find(c => c.id === value) || brakeWidths[1];
  const strokeWidth = style => style?.pathPattern === "brake"
    ? brakeWidthChoice(style.brakeWidth).width * Math.max(.001, Number(style.brakeScale) || 1)
    : style.strokeWidth;
  const cache = new WeakMap();
  const normalize = value => choices.some(c => c.id === value) ? value : "none";
  const fmt = n => String(Math.round(n * 100) / 100);
  const xy = p => fmt(p.x) + " " + fmt(p.y);

  // One SVG paint tile per object. Geometry stays on the original line/path,
  // so hit testing, controls, groups and export retain their existing contracts.
  function ensure(canvas, model, adapter, style, element) {
    const choice = choices.find(c => c.id === style.pathPattern);
    if (!choice || choice.id === "none" || !adapter.pointAt || !canvas) return null;
    let defs = canvas.querySelector("#editorFillPatternDefs");
    if (!defs) { defs = U.createSvgElement("defs", { id: "editorFillPatternDefs" }); canvas.prepend(defs); }
    const id = "editor-fill-pattern-trace-" + String(model.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    let pattern = Array.from(defs.children).find(p => p.id === id);
    if (!pattern) { pattern = U.createSvgElement("pattern", { id }); defs.append(pattern); }
    // Endpoint markers can trim or reshape the visible path. Sample that same
    // geometry, and include it in the cache key when arrow settings change.
    const marked = element && (style.arrowStart !== "none" || style.arrowEnd !== "none");
    const rendered = marked ? ["d", "x1", "y1", "x2", "y2"].map(name => element.getAttribute(name)) : null;
    const key = JSON.stringify([model.geometry, strokeWidth(style), choice.id, style.pathPatternReverse, rendered]);
    if (cache.get(pattern) === key) return pattern;
    cache.set(pattern, key);
    const width = Math.max(.01, strokeWidth(style));
    const rough = marked ? null : Array.from({ length: 33 }, (_, i) => adapter.pointAt(model, i / 32));
    const length = marked ? element.getTotalLength() : rough.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - rough[i].x, p.y - rough[i].y), 0);
    const count = Math.min(160, Math.max(24, Math.ceil(length / Math.max(3, width * .22))));
    const points = Array.from({ length: count + 1 }, (_, i) => marked ? element.getPointAtLength(length * i / count) : adapter.pointAt(model, i / count));
    let distance = 0;
    const samples = points.map((p, i) => {
      if (i) distance += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
      const a = points[Math.max(0, i - 1)], b = points[Math.min(count, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: p.x, y: p.y, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len, s: distance };
    });
    const minX = Math.min(...points.map(p => p.x)) - width * 2;
    const minY = Math.min(...points.map(p => p.y)) - width * 2;
    const w = Math.max(1, Math.max(...points.map(p => p.x)) - minX + width * 2);
    const h = Math.max(1, Math.max(...points.map(p => p.y)) - minY + width * 2);
    let childIndex = 0;
    const paint = (tag, attrs) => {
      let node = pattern.children[childIndex++];
      if (node?.localName !== tag) {
        const next = U.createSvgElement(tag);
        if (node) node.replaceWith(next); else pattern.append(next);
        node = next;
      }
      Array.from(node.attributes).forEach(attr => { if (!(attr.name in attrs)) node.removeAttribute(attr.name); });
      Object.entries(attrs).forEach(([name, value]) => U.setAttributeIfChanged(node, name, String(value)));
    };
    for (const [k, v] of Object.entries({ patternUnits: "userSpaceOnUse", patternContentUnits: "userSpaceOnUse", x: minX, y: minY, width: w, height: h, viewBox: `${minX} ${minY} ${w} ${h}`, "data-path-pattern": choice.id })) pattern.setAttribute(k, String(v));
    // The original stroke clips the tile to exactly the user-selected width.
    if (choice.base !== "transparent") paint("rect", { x: minX, y: minY, width: w, height: h, fill: choice.base });
    const position = (p, offset) => ({ x: p.x + p.nx * offset * width, y: p.y + p.ny * offset * width });
    const path = (d, thickness, color, extra = {}) => paint("path", { d, fill: "none", stroke: color, "stroke-width": width * thickness, "stroke-linecap": "round", "stroke-linejoin": "round", ...extra });
    if (choice.id === "brake") {
      // Staggered irregular micro-dashes follow each offset curve. Seven paths
      // provide grain without thousands of individual DOM nodes or raster assets.
      const scale = Math.max(.001, Number(style.brakeScale) || 1);
      for (let rail = -3; rail <= 3; rail++) {
        const d = samples.map((p, i) => (i ? "L" : "M") + xy(position(p, rail * .14))).join(" ");
        const grain = [.58, .43, .92, .67, .38, .61, .74, .49].map((v, i) => fmt(v * scale * (1 + Math.sin(rail * 3.7 + i * 1.9) * .22))).join(" ");
        path(d, .105, rail % 2 ? "#262626" : "#454545", {
          "stroke-dasharray": grain, "stroke-dashoffset": fmt(rail * .71 * scale),
          "stroke-linecap": "butt", opacity: Math.abs(rail) === 3 ? .38 : Math.abs(rail) === 2 ? .7 : .92
        });
      }
    } else if (choice.id === "grit") {
      let dots = "";
      for (let i = 1; i < count; i += 2) {
        const p = position(samples[i], Math.sin(i * 12.9898) * .42), r = width * (.02 + .018 * (1 + Math.sin(i * 7)));
        dots += `M${fmt(p.x-r)} ${fmt(p.y)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r*2)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r*2)} 0 `;
      }
      paint("path", { d: dots, fill: choice.ink });
    } else {
      for (let lane = -2; lane <= 2; lane++) {
        const d = samples.map((p, i) => {
          const wave = ["water", "mud", "oil"].includes(choice.id) ? Math.sin(p.s / Math.max(width * .65, .01) + lane * 1.8) * (choice.id === "oil" ? .09 : .045) : 0;
          return (i ? "L" : "M") + xy(position(p, lane * .18 + wave));
        }).join(" ");
        const extra = choice.id === "tire" ? { "stroke-dasharray": `${width*.5} ${width*.32}`, "stroke-linecap": "butt" } : {};
        path(d, choice.id === "oil" ? .19 : .065, choice.ink, extra);
      }
      if (choice.id === "water" || choice.id === "mud") {
        let arrows = "";
        const step = Math.max(5, Math.ceil(count / 18));
        const direction = style.pathPatternReverse ? -1 : 1;
        for (let i = step; i < count; i += step) {
          const p = samples[i], size = width * .14;
          const tip = { x: p.x + p.ny * size * direction, y: p.y - p.nx * size * direction };
          const back = { x: p.x - p.ny * size * direction, y: p.y + p.nx * size * direction };
          arrows += `M${xy({x:back.x+p.nx*size,y:back.y+p.ny*size})}L${xy(tip)}L${xy({x:back.x-p.nx*size,y:back.y-p.ny*size})} `;
        }
        path(arrows, .045, choice.id === "water" ? "#e4f8ff" : "#ecd3aa");
      }
    }
    while (pattern.children.length > childIndex) pattern.lastElementChild.remove();
    return pattern;
  }
  K.PathTracePatterns = { choices, normalize, ensure, brakeWidths, brakeWidthChoice, strokeWidth };
})();
