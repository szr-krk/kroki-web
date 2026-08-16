import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const assetsRoot = path.join(rootDir, "ARAÇLAR");
const catalogFile = path.join(rootDir, "src", "data", "vehicle-catalog-data.js");
const METERS_TO_UNITS = 50 / 3.5;
const DEFAULT_COLOR = "#ff0000";
const VIEW_FILES = [
  ["top", "top.svg"],
  ["side", "side.svg"],
  ["upsideDown", "upsideDown.svg"]
];

function attrMap(source) {
  const attrs = {};
  const re = /([:\w-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(source))) attrs[match[1]] = match[2];
  return attrs;
}

function escapeString(value) {
  return JSON.stringify(String(value ?? ""));
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  const clean = Object.is(rounded, -0) ? 0 : rounded;
  return String(clean).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function parseViewBox(value) {
  const parts = String(value || "").trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  return { raw: parts.map(formatNumber).join(" "), width: parts[2], height: parts[3] };
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "arac";
}

function normalizeName(value) {
  return slug(value).replace(/_/g, "");
}

function parseLegacyVariants() {
  if (!fs.existsSync(catalogFile)) return [];
  const source = fs.readFileSync(catalogFile, "utf8");
  const rows = [];
  let currentType = null;
  for (const line of source.split(/\r?\n/)) {
    const title = line.match(/title:\s*"([^"]+)"/);
    if (title) currentType = title[1];
    const variant = line.match(/\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*kind:\s*"([^"]+)",\s*lengthM:\s*([0-9.]+),\s*widthM:\s*([0-9.]+),\s*heightM:\s*([0-9.]+).*?color:\s*"([^"]+)".*?views:\s*VEHICLE_SVG_VIEWS(?:\.|\["?)([A-Za-z0-9_]+)/);
    if (!variant || !currentType) continue;
    const [, id, name, kind, lengthM, widthM, heightM, color, sourceBase] = variant;
    const typeId = (currentType.match(/^(\d+)/) || [])[1] || "";
    rows.push({
      typeId,
      typeTitle: currentType,
      id,
      name,
      kind,
      lengthM: Number(lengthM),
      widthM: Number(widthM),
      heightM: Number(heightM),
      color,
      sourceBase
    });
  }
  return rows;
}

function legacyFor(legacyRows, typeId, variantFolder, sourceBase, typeVariantCount) {
  const byType = legacyRows.filter((row) => row.typeId === typeId);
  const byName = byType.find((row) => normalizeName(row.name) === normalizeName(variantFolder));
  if (byName) return byName;
  const bySource = byType.filter((row) => row.sourceBase === sourceBase);
  if (bySource.length === 1) return bySource[0];
  if (byType.length === 1 && typeVariantCount === 1) return byType[0];
  return null;
}

function parseSvg(file) {
  const source = fs.readFileSync(file, "utf8");
  const svgAttrs = attrMap(source.match(/<svg\b([^>]*)>/i)?.[1] || "");
  const viewBox = parseViewBox(svgAttrs.viewBox);
  if (!viewBox) throw new Error(`viewBox okunamadi: ${file}`);
  const paths = [...source.matchAll(/<path\b([^>]*)\/?>/gi)].map((match) => {
    const attrs = attrMap(match[1] || "");
    if (!attrs.d) return null;
    const fillMode = attrs["data-kroki-fill"] || "fixed";
    const item = {
      role: attrs["data-kroki-role"] || "detail",
      fill: fillMode === "vehicle" ? "vehicle" : (attrs.fill || "none"),
      d: attrs.d
    };
    if (attrs.stroke && attrs.stroke.toLowerCase() !== "none") item.stroke = attrs.stroke;
    if (attrs["stroke-width"] != null) item.strokeWidth = Number(attrs["stroke-width"]);
    if (attrs["data-kroki-ghost"]) item.ghost = attrs["data-kroki-ghost"];
    if (attrs["data-kroki-ghost-dash"]) item.ghostDash = attrs["data-kroki-ghost-dash"];
    if (attrs["stroke-linecap"]) item.lineCap = attrs["stroke-linecap"];
    if (attrs["stroke-linejoin"]) item.lineJoin = attrs["stroke-linejoin"];
    if (attrs.transform) item.transform = attrs.transform;
    if (attrs["data-kroki-paintable"] === "true") item.paintable = true;
    return item;
  }).filter(Boolean);
  return { svgAttrs, viewBox, paths };
}

function jsValue(value, indent = 6) {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => index === 0 ? line : `${" ".repeat(indent)}${line}`)
    .join("\n");
}

function viewObjectCode(view) {
  const paths = view.paths.map((pathItem) => jsValue(pathItem, 10)).join(",\n          ");
  return `{
        viewBox: ${escapeString(`0 0 ${view.viewBox.width ? formatNumber(view.viewBox.width) : 0} ${view.viewBox.height ? formatNumber(view.viewBox.height) : 0}`)},
        paths: [
          ${paths}
        ]
      }`;
}

function typeSort(a, b) {
  return Number((a.match(/^(\d+)/) || [0, 0])[1]) - Number((b.match(/^(\d+)/) || [0, 0])[1]) || a.localeCompare(b);
}

function buildCatalog() {
  const legacyRows = parseLegacyVariants();
  const typeDirs = fs.readdirSync(assetsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(typeSort);
  const viewEntries = [];
  const types = [];
  const unsupported = [];

  for (const typeFolder of typeDirs) {
    const typeId = (typeFolder.match(/^(\d+)/) || [])[1] || "";
    const variantFolders = fs.readdirSync(path.join(assetsRoot, typeFolder), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    const variants = [];
    let hasUpsideDown = false;

    for (const variantFolder of variantFolders) {
      const variantDir = path.join(assetsRoot, typeFolder, variantFolder);
      const parsedViews = {};
      for (const [view, fileName] of VIEW_FILES) {
        const file = path.join(variantDir, fileName);
        if (!fs.existsSync(file)) continue;
        parsedViews[view] = parseSvg(file);
      }
      if (!parsedViews.top) continue;
      if (parsedViews.upsideDown) hasUpsideDown = true;

      const sourceBase = parsedViews.top.svgAttrs["data-kroki-source-base"] || slug(variantFolder);
      const legacy = legacyFor(legacyRows, typeId, variantFolder, sourceBase, variantFolders.length);
      const variantId = legacy?.id || slug(variantFolder).replace(/_/g, "-");
      const viewKey = `v${typeId}_${slug(variantId)}`;
      const topBox = parsedViews.top.viewBox;
      const sideBox = parsedViews.side?.viewBox || parsedViews.top.viewBox;
      const nominalLengthM = Number(parsedViews.top.svgAttrs["data-kroki-length-m"]) || legacy?.lengthM || 0;
      const nominalWidthM = Number(parsedViews.top.svgAttrs["data-kroki-width-m"]) || legacy?.widthM || 0;
      const nominalHeightM = Number(parsedViews.top.svgAttrs["data-kroki-height-m"]) || legacy?.heightM || 0;
      const color = parsedViews.top.svgAttrs["data-kroki-default-color"] || DEFAULT_COLOR;
      const source = parsedViews.top.svgAttrs["data-kroki-source"] || "";
      const viewParts = [];
      for (const view of ["top", "side", "upsideDown"]) {
        if (!parsedViews[view]) continue;
        viewParts.push(`      ${view}: ${viewObjectCode(parsedViews[view])}`);
      }
      viewEntries.push(`    ${viewKey}: {
${viewParts.join(",\n")}
    }`);
      variants.push({
        id: variantId,
        name: variantFolder,
        kind: legacy?.kind || "box",
        lengthM: Number(formatNumber(topBox.width / METERS_TO_UNITS)),
        widthM: Number(formatNumber(topBox.height / METERS_TO_UNITS)),
        heightM: Number(formatNumber(sideBox.height / METERS_TO_UNITS)),
        nominalLengthM: Number(formatNumber(nominalLengthM)),
        nominalWidthM: Number(formatNumber(nominalWidthM)),
        nominalHeightM: Number(formatNumber(nominalHeightM)),
        color,
        source,
        viewKey
      });
    }

    if (!hasUpsideDown) unsupported.push(typeId);
    types.push({ id: typeId, title: typeFolder, variants });
  }

  return { viewEntries, types, unsupported };
}

function variantCode(variant) {
  const fields = [
    `id: ${escapeString(variant.id)}`,
    `name: ${escapeString(variant.name)}`,
    `kind: ${escapeString(variant.kind)}`,
    `lengthM: ${formatNumber(variant.lengthM)}`,
    `widthM: ${formatNumber(variant.widthM)}`,
    `heightM: ${formatNumber(variant.heightM)}`,
    `nominalLengthM: ${formatNumber(variant.nominalLengthM)}`,
    `nominalWidthM: ${formatNumber(variant.nominalWidthM)}`,
    `nominalHeightM: ${formatNumber(variant.nominalHeightM)}`,
    `color: ${escapeString(variant.color)}`,
    ...(variant.source ? [`source: ${escapeString(variant.source)}`] : []),
    `views: VEHICLE_SVG_VIEWS.${variant.viewKey}`
  ];
  return `{ ${fields.join(", ")} }`;
}

function typeCode(type) {
  const variants = type.variants.map((variant) => `        ${variantCode(variant)}`).join(",\n");
  return `    {
      id: ${escapeString(type.id)},
      title: ${escapeString(type.title)},
      variants: [
${variants}
      ]
    }`;
}

function writeCatalog() {
  const { viewEntries, types, unsupported } = buildCatalog();
  const output = `(() => {
  const METERS_TO_UNITS = 50 / 3.5;
  const UPSIDE_DOWN_UNSUPPORTED = new Set(${JSON.stringify(unsupported)});
  const VEHICLE_SVG_VIEWS = {
${viewEntries.join(",\n")}
  };

  const TYPES = [
${types.map(typeCode).join(",\n")}
  ];

  window.KrokiVehicleCatalogData = {
    metersToUnits: METERS_TO_UNITS,
    upsideDownUnsupported: Array.from(UPSIDE_DOWN_UNSUPPORTED),
    types: TYPES
  };
})();
`;
  fs.writeFileSync(catalogFile, output, "utf8");
  const fileCount = types.reduce((sum, type) => sum + type.variants.reduce((variantSum, variant) => {
    return variantSum + Object.keys(variant.views || {}).length;
  }, 0), 0);
  console.log(`Wrote ${path.relative(rootDir, catalogFile)} from ${path.relative(rootDir, assetsRoot)}.`);
  console.log(`Types: ${types.length}, variants: ${types.reduce((sum, type) => sum + type.variants.length, 0)}, view sets: ${viewEntries.length}, unsupported: ${unsupported.join(", ") || "none"}`);
}

writeCatalog();
