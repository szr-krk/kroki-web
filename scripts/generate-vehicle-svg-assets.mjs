import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourceFile = path.join(rootDir, "svg arac kaynağı.xml");
const catalogFile = path.join(rootDir, "src", "data", "vehicle-catalog-data.js");
const outRoot = path.join(rootDir, "ARAÇLAR");

const METERS_TO_UNITS = 50 / 3.5;
const STROKE_WIDTH = 0.3;
const PADDING = STROKE_WIDTH / 2;
const DEFAULT_VEHICLE_COLOR = "#ff0000";
const VIEW_BY_INDEX = new Map([
  ["0", "top"],
  ["1", "side"],
  ["2", "upsideDown"]
]);
const FILE_BY_VIEW = {
  top: "top.svg",
  side: "side.svg",
  upsideDown: "upsideDown.svg"
};

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join("-"))
    .join(" ");
}

function typeFolderName(title) {
  const match = String(title || "").match(/^(\d+)\s+(.+)$/);
  if (!match) return titleCase(title || "Arac");
  return `${match[1]} ${titleCase(match[2])}`;
}

function variantFolderName(variantName, variantId) {
  if (variantId === "sedan") return "Sedan";
  return titleCase(variantName || variantId || "Arac");
}

function attrMap(source) {
  const attrs = {};
  const re = /([:\w-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(source))) attrs[match[1]] = match[2];
  return attrs;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  const clean = Object.is(rounded, -0) ? 0 : rounded;
  return String(clean).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function parseSourceSvgs() {
  const source = fs.readFileSync(sourceFile, "utf8");
  const re = /let\s+([A-Za-z0-9_ğĞıİöÖüÜşŞçÇ]+)\s*=\s*`([\s\S]*?)`;/g;
  const byBase = new Map();
  let match;
  while ((match = re.exec(source))) {
    const [, tag, svg] = match;
    const tagMatch = tag.match(/^(.+)_(\d+)$/);
    if (!tagMatch) continue;
    const [, base, index] = tagMatch;
    const view = VIEW_BY_INDEX.get(index);
    if (!view) continue;
    const svgAttrs = attrMap(svg.match(/<svg\b([^>]*)>/i)?.[1] || "");
    const paths = [...svg.matchAll(/<path\b([^>]*)\/?>/gi)].map((pathMatch) => ({
      attrs: attrMap(pathMatch[1] || "")
    })).filter((item) => item.attrs.d);
    if (!byBase.has(base)) byBase.set(base, {});
    byBase.get(base)[view] = { tag, base, view, svgAttrs, paths };
  }
  return byBase;
}

function parseCatalogVariants() {
  const source = fs.readFileSync(catalogFile, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: catalogFile });
  const data = context.window.KrokiVehicleCatalogData || {};
  return (Array.isArray(data.types) ? data.types : []).flatMap((type) => {
    return (Array.isArray(type.variants) ? type.variants : []).map((variant) => ({
      typeTitle: type.title,
      id: variant.id,
      name: variant.name,
      kind: variant.kind,
      lengthM: Number(variant.nominalLengthM ?? variant.lengthM),
      widthM: Number(variant.nominalWidthM ?? variant.widthM),
      heightM: Number(variant.nominalHeightM ?? variant.heightM),
      color: variant.color,
      sourceBase: sourceBaseFromExistingAsset(type.title, variant.name, variant.id)
    }));
  }).filter((variant) => variant.sourceBase);
}

function sourceBaseFromExistingAsset(typeTitle, variantName, variantId) {
  const file = path.join(outRoot, typeFolderName(typeTitle), variantFolderName(variantName, variantId), "top.svg");
  if (!fs.existsSync(file)) return null;
  const source = fs.readFileSync(file, "utf8");
  const attrs = attrMap(source.match(/<svg\b([^>]*)>/i)?.[1] || "");
  return attrs["data-kroki-source-base"] || null;
}

function pathTokens(d) {
  return String(d || "").match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
}

function isCommand(token) {
  return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(token);
}

const PARAMS = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7,
  m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7
};

function collectPathPoints(d) {
  const tokens = pathTokens(d);
  const points = [];
  let i = 0;
  let command = null;
  let currentX = 0;
  let currentY = 0;
  let subX = 0;
  let subY = 0;
  let firstMove = true;

  function add(x, y) {
    if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
  }

  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i++];
      firstMove = command === "M" || command === "m";
      if (command === "Z" || command === "z") {
        currentX = subX;
        currentY = subY;
        command = null;
        continue;
      }
    }
    if (!command || !(command in PARAMS)) {
      i++;
      continue;
    }
    const arity = PARAMS[command];
    while (i < tokens.length && !isCommand(tokens[i])) {
      if (i + arity > tokens.length) break;
      const values = tokens.slice(i, i + arity).map(Number);
      if (values.some((value) => !Number.isFinite(value))) break;
      const absolute = command === command.toUpperCase();
      const upper = command.toUpperCase();
      if (upper === "M" || upper === "L" || upper === "T") {
        const x = absolute ? values[0] : currentX + values[0];
        const y = absolute ? values[1] : currentY + values[1];
        add(x, y);
        currentX = x;
        currentY = y;
        if (upper === "M" && firstMove) {
          subX = x;
          subY = y;
          firstMove = false;
        }
      } else if (upper === "H") {
        currentX = absolute ? values[0] : currentX + values[0];
        add(currentX, currentY);
      } else if (upper === "V") {
        currentY = absolute ? values[0] : currentY + values[0];
        add(currentX, currentY);
      } else if (upper === "C") {
        for (let offset = 0; offset < 6; offset += 2) {
          add(absolute ? values[offset] : currentX + values[offset], absolute ? values[offset + 1] : currentY + values[offset + 1]);
        }
        currentX = absolute ? values[4] : currentX + values[4];
        currentY = absolute ? values[5] : currentY + values[5];
      } else if (upper === "S" || upper === "Q") {
        for (let offset = 0; offset < 4; offset += 2) {
          add(absolute ? values[offset] : currentX + values[offset], absolute ? values[offset + 1] : currentY + values[offset + 1]);
        }
        currentX = absolute ? values[2] : currentX + values[2];
        currentY = absolute ? values[3] : currentY + values[3];
      } else if (upper === "A") {
        const x = absolute ? values[5] : currentX + values[5];
        const y = absolute ? values[6] : currentY + values[6];
        add(x, y);
        currentX = x;
        currentY = y;
      }
      i += arity;
      if (upper === "M") command = absolute ? "L" : "l";
    }
  }
  return points;
}

function boundsFor(paths) {
  const points = paths.flatMap((item) => collectPathPoints(item.attrs.d));
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function transformPathData(d, transform) {
  const tokens = pathTokens(d);
  const out = [];
  let i = 0;
  let command = null;
  let firstMove = true;

  function tx(value, relative) {
    return relative ? value * transform.sx : value * transform.sx + transform.ox;
  }

  function ty(value, relative) {
    return relative ? value * transform.sy : value * transform.sy + transform.oy;
  }

  function emit(cmd, values) {
    out.push(cmd, ...values.map(formatNumber));
  }

  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i++];
      if (command === "Z" || command === "z") {
        out.push("Z");
        command = null;
        continue;
      }
      firstMove = command === "M" || command === "m";
    }
    if (!command || !(command in PARAMS)) {
      i++;
      continue;
    }
    const arity = PARAMS[command];
    while (i < tokens.length && !isCommand(tokens[i])) {
      if (i + arity > tokens.length) break;
      const values = tokens.slice(i, i + arity).map(Number);
      if (values.some((value) => !Number.isFinite(value))) break;
      const relative = command !== command.toUpperCase();
      const upper = command.toUpperCase();
      let emitCommand = command;
      let transformed = values.slice();
      if (upper === "M") {
        emitCommand = firstMove ? command : (relative ? "l" : "L");
        firstMove = false;
        transformed = [tx(values[0], relative), ty(values[1], relative)];
      } else if (upper === "L" || upper === "T") {
        transformed = [tx(values[0], relative), ty(values[1], relative)];
      } else if (upper === "H") {
        transformed = [tx(values[0], relative)];
      } else if (upper === "V") {
        transformed = [ty(values[0], relative)];
      } else if (upper === "C") {
        transformed = [tx(values[0], relative), ty(values[1], relative), tx(values[2], relative), ty(values[3], relative), tx(values[4], relative), ty(values[5], relative)];
      } else if (upper === "S" || upper === "Q") {
        transformed = [tx(values[0], relative), ty(values[1], relative), tx(values[2], relative), ty(values[3], relative)];
      } else if (upper === "A") {
        transformed = [
          Math.abs(values[0] * transform.sx),
          Math.abs(values[1] * transform.sy),
          values[2],
          values[3],
          values[4],
          tx(values[5], relative),
          ty(values[6], relative)
        ];
      }
      emit(emitCommand, transformed);
      i += arity;
      if (upper === "M") command = relative ? "l" : "L";
    }
  }
  return out.join(" ");
}

function normalizeFill(fill) {
  const clean = String(fill || "").trim();
  if (!clean || /^#?none$/i.test(clean)) return "none";
  return clean;
}

function isBlack(fill) {
  const clean = normalizeFill(fill).toLowerCase();
  return clean === "#000000" || clean === "#000" || clean === "black";
}

function isWhite(fill) {
  const clean = normalizeFill(fill).toLowerCase();
  return clean === "#ffffff" || clean === "#fff" || clean === "white";
}

function rolePlan(paths, view, sourceBase) {
  if (sourceBase === "bisiklet") {
    if (view === "top") {
      return paths.map((_, index) => index === 0
        ? { role: "detail", fillMode: "fixed", paintable: false, ghost: "preserve" }
        : { role: "body", fillMode: "vehicle", paintable: true, ghost: "auto", noStroke: true });
    }
    if (view === "side") {
      return paths.map((_, index) => index === 0
        ? { role: "body", fillMode: "vehicle", paintable: true, ghost: "auto", noStroke: true }
        : { role: "wheel", fillMode: "fixed", paintable: false, ghost: "preserve" });
    }
  }

  if (view === "upsideDown") {
    return paths.map((_, index) => ({
      role: index === 0 ? "body" : index === 1 ? "damage-cross" : "wheel",
      fillMode: index === 1 ? "none" : "fixed",
      paintable: false,
      ghost: index <= 1 ? "auto" : "preserve"
    }));
  }

  let paintableIndex = paths.findIndex((item) => isBlack(item.attrs.fill));
  if (paintableIndex < 0) {
    paintableIndex = paths.findIndex((item) => normalizeFill(item.attrs.fill) !== "none");
  }

  return paths.map((item, index) => {
    const fill = normalizeFill(item.attrs.fill);
    const paintable = index === paintableIndex;
    if (paintable) {
      return { role: "body", fillMode: "vehicle", paintable: true, ghost: "auto" };
    }
    if (fill === "none") {
      return { role: "frame", fillMode: "none", paintable: false, ghost: "preserve" };
    }
    if (view === "side" && isWhite(fill)) {
      return { role: "window", fillMode: "fixed", paintable: false, ghost: "preserve" };
    }
    if (isBlack(fill)) {
      return { role: view === "side" ? "wheel" : "detail", fillMode: "fixed", paintable: false, ghost: "preserve" };
    }
    return { role: "detail", fillMode: "fixed", paintable: false, ghost: "preserve" };
  });
}

function svgPathAttributes(item, plan, transform) {
  const attrs = item.attrs;
  const originalFill = normalizeFill(attrs.fill);
  const hasOriginalStroke = attrs.stroke && !/^none$/i.test(attrs.stroke);
  const addStroke = !plan.noStroke && (hasOriginalStroke || plan.paintable || plan.role === "damage-cross" || plan.role === "body");
  const outputFill = plan.fillMode === "vehicle"
    ? DEFAULT_VEHICLE_COLOR
    : plan.fillMode === "none"
      ? "none"
      : originalFill;
  const parts = [
    `data-kroki-role="${escapeAttr(plan.role)}"`,
    `data-kroki-fill="${escapeAttr(plan.fillMode)}"`,
    `data-kroki-paintable="${plan.paintable ? "true" : "false"}"`,
    `data-kroki-ghost="${escapeAttr(plan.ghost)}"`,
    `d="${escapeAttr(transformPathData(attrs.d, transform))}"`,
    `fill="${escapeAttr(outputFill)}"`
  ];
  if (addStroke) {
    parts.push(`stroke="#000000"`, `stroke-width="${formatNumber(STROKE_WIDTH)}"`);
    if (plan.ghost === "auto") parts.push(`stroke-linecap="butt"`);
    const lineJoin = attrs["stroke-linejoin"] || "round";
    parts.push(`stroke-linejoin="${escapeAttr(lineJoin)}"`);
  }
  return parts.join(" ");
}

function effectivePaths(source) {
  if (source.base !== "bisiklet" || source.view !== "side" || !source.paths.length) {
    return source.paths;
  }
  return source.paths.map((item, index) => {
    if (index !== 0) return item;
    const attrs = { ...item.attrs };
    attrs.d = attrs.d.replace(/\s*M\s+51\.2\s+32\.5[\s\S]*$/i, " Z");
    return { ...item, attrs };
  });
}

function sourceMetrics(source) {
  const bounds = boundsFor(effectivePaths(source));
  if (!bounds) throw new Error(`Path siniri bulunamadi: ${source.tag}`);
  return {
    bounds,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY)
  };
}

function buildReference(sourceGroup, variant) {
  const topSource = sourceGroup.top;
  if (!topSource) throw new Error(`${variant.sourceBase}: _0/top kaynak bulunamadi`);
  const top = sourceMetrics(topSource);
  const topTargetHeight = variant.widthM * METERS_TO_UNITS;
  const topScale = Math.max(1, topTargetHeight - PADDING * 2) / top.height;
  const topTargetWidth = top.width * topScale + PADDING * 2;
  return {
    topScale,
    topTargetWidth,
    topTargetHeight
  };
}

function viewTransform(source, view, reference) {
  const metrics = sourceMetrics(source);
  const innerReferenceLength = Math.max(1, reference.topTargetWidth - PADDING * 2);
  if (view === "top") {
    return {
      target: { width: reference.topTargetWidth, height: reference.topTargetHeight },
      transform: {
        sx: reference.topScale,
        sy: reference.topScale,
        ox: PADDING - metrics.bounds.minX * reference.topScale,
        oy: PADDING - metrics.bounds.minY * reference.topScale
      }
    };
  }
  if (view === "upsideDown") {
    const scale = Math.min(
      innerReferenceLength / metrics.width,
      Math.max(1, reference.topTargetHeight - PADDING * 2) / metrics.height
    );
    const contentWidth = metrics.width * scale;
    const contentHeight = metrics.height * scale;
    return {
      target: { width: reference.topTargetWidth, height: reference.topTargetHeight },
      transform: {
        sx: scale,
        sy: scale,
        ox: (reference.topTargetWidth - contentWidth) / 2 - metrics.bounds.minX * scale,
        oy: (reference.topTargetHeight - contentHeight) / 2 - metrics.bounds.minY * scale
      }
    };
  }
  const sideScale = innerReferenceLength / metrics.width;
  return {
    target: { width: reference.topTargetWidth, height: metrics.height * sideScale + PADDING * 2 },
    transform: {
      sx: sideScale,
      sy: sideScale,
      ox: PADDING - metrics.bounds.minX * sideScale,
      oy: PADDING - metrics.bounds.minY * sideScale
    }
  };
}

function buildSvg(source, variant, view, reference) {
  const paths = effectivePaths(source);
  const { target, transform } = viewTransform(source, view, reference);
  const plans = rolePlan(paths, view, source.base);
  const pathLines = paths.map((item, index) => `  <path ${svgPathAttributes(item, plans[index], transform)} />`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" version="1.1" viewBox="0 0 ${formatNumber(target.width)} ${formatNumber(target.height)}" data-tag="${escapeAttr(source.tag)}" data-kroki-type="vehicle" data-kroki-view="${escapeAttr(view)}" data-kroki-source-base="${escapeAttr(source.base)}" data-kroki-length-m="${formatNumber(variant.lengthM)}" data-kroki-width-m="${formatNumber(variant.widthM)}" data-kroki-height-m="${formatNumber(variant.heightM)}" data-kroki-default-color="${escapeAttr(DEFAULT_VEHICLE_COLOR)}" data-kroki-ghost-dash="1 1">`,
    ...pathLines,
    `</svg>`,
    ``
  ].join("\n");
}

function main() {
  const sources = parseSourceSvgs();
  const variants = parseCatalogVariants();
  const usedBases = new Set();
  const written = [];
  const skipped = [];

  for (const variant of variants) {
    const sourceGroup = sources.get(variant.sourceBase);
    if (!sourceGroup) {
      skipped.push(`${variant.sourceBase}: kaynak bulunamadi`);
      continue;
    }
    usedBases.add(variant.sourceBase);
    const reference = buildReference(sourceGroup, variant);
    const variantDir = path.join(outRoot, typeFolderName(variant.typeTitle), variantFolderName(variant.name, variant.id));
    fs.mkdirSync(variantDir, { recursive: true });
    for (const view of ["top", "side", "upsideDown"]) {
      const source = sourceGroup[view];
      if (!source) continue;
      const file = path.join(variantDir, FILE_BY_VIEW[view]);
      fs.writeFileSync(file, buildSvg(source, variant, view, reference), "utf8");
      written.push(file);
    }
  }

  const unused = [...sources.keys()].filter((base) => !usedBases.has(base));
  console.log(`Wrote ${written.length} SVG files under ${path.relative(rootDir, outRoot)}.`);
  if (skipped.length) console.log(`Skipped:\n${skipped.map((item) => `- ${item}`).join("\n")}`);
  if (unused.length) console.log(`Unused source bases: ${unused.join(", ")}`);
}

main();
