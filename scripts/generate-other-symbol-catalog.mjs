import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourceFile = path.join(root, "svg di\u011fer semboller kayna\u011f\u0131.xml");
const outFile = path.join(root, "src", "data", "other-symbols.generated.js");
const TARGET_MAX_UNITS = 50;

const CATEGORY_TITLES = new Map([
  ["all_insan_svgs", "İnsan"],
  ["all_hayvan_svgs", "Hayvan"],
  ["all_cevre_elemanlari_svgs", "Çevre Elemanları"],
  ["all_diger_svgs", "Çevre Elemanları"],
  ["insan-sembolleri", "İnsan"],
  ["hayvan-sembolleri", "Hayvan"],
  ["cevre-elemanlari", "Çevre Elemanları"]
]);

function attrEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function titleCase(value) {
  return String(value || "")
    .replace(/^all_/, "")
    .replace(/_svgs$/, "")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function slugify(value) {
  return String(value || "")
    .replace(/\u0131/g, "i")
    .replace(/\u0130/g, "I")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sembol";
}

function formatNumber(value) {
  const rounded = Math.round(Number(value) * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/g, "").replace(/\.$/, "");
}

function attrsFrom(text) {
  const attrs = {};
  String(text || "").replace(/([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g, (_, name, value) => {
    attrs[name] = value;
    return "";
  });
  return attrs;
}

function parseViewBox(value) {
  const parts = String(value || "").trim().split(/\s+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3], value: parts.join(" ") };
  }
  return { x: 0, y: 0, width: 100, height: 100, value: "0 0 100 100" };
}

function parseSvg(svg) {
  const match = String(svg || "").match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!match) return null;
  const attrs = attrsFrom(match[1]);
  const viewBox = parseViewBox(attrs.viewBox);
  return {
    attrs,
    viewBox,
    inner: match[2].trim()
  };
}

function indented(value, spaces) {
  const prefix = " ".repeat(spaces);
  return String(value || "").split(/\r?\n/).map((line) => prefix + line).join("\n");
}

function categoryTitleFor(value) {
  const raw = String(value || "").trim();
  const slug = slugify(raw);
  return CATEGORY_TITLES.get(raw.normalize("NFC")) || CATEGORY_TITLES.get(slug) || titleCase(raw);
}

function buildRecord({ svg, varName, categoryTitle, categoryKey, index }) {
  const parsed = parseSvg(svg);
  if (!parsed) throw new Error(`SVG okunamadi: ${varName}`);

  const tag = String(parsed.attrs["data-tag"] || titleCase(varName.replace(/^dgr_/, ""))).trim();
  const name = tag || titleCase(varName.replace(/^dgr_/, ""));
  const baseSlug = slugify(name);
  const key = `${categoryKey}/${baseSlug}`;
  const code = "";
  const file = `${baseSlug}.svg`;
  const maxDimension = Math.max(parsed.viewBox.width, parsed.viewBox.height, 1);
  const baseScale = Number(formatNumber(TARGET_MAX_UNITS / maxDimension));
  const metadataAttrs = [
    `data-other-symbol-key="${attrEscape(key)}"`,
    `data-other-symbol-name="${attrEscape(name)}"`,
    `data-other-symbol-category="${attrEscape(categoryTitle)}"`,
    `data-other-symbol-base-scale="${attrEscape(baseScale)}"`,
    `data-source-var="${attrEscape(varName)}"`,
    `data-source-index="${attrEscape(index + 1)}"`,
    `shape-rendering="geometricPrecision"`
  ].join(" ");
  const art = `<g ${metadataAttrs}>\n${indented(parsed.inner, 4)}\n</g>`;
  return {
    key,
    code,
    name,
    category: categoryTitle,
    categoryKey,
    file,
    width: parsed.viewBox.width,
    height: parsed.viewBox.height,
    viewBox: parsed.viewBox.value,
    baseScale,
    art
  };
}

function parseSource(source) {
  const definitions = new Map();
  const defPattern = /\blet\s+([^\s=]+)\s*=\s*`([\s\S]*?)`;/gu;
  let match;
  while ((match = defPattern.exec(source)) !== null) {
    definitions.set(match[1].normalize("NFC"), match[2]);
  }

  const records = [];
  const arrayPattern = /\blet\s+(all_[^\s=]+)\s*=\s*\[([\s\S]*?)\];/gu;
  while ((match = arrayPattern.exec(source)) !== null) {
    const arrayName = match[1].normalize("NFC");
    const categoryTitle = categoryTitleFor(arrayName);
    const categoryKey = `diger-semboller-${slugify(categoryTitle)}`;
    const refs = match[2].split(",").map((part) => part.trim().normalize("NFC")).filter(Boolean);
    refs.forEach((ref, index) => {
      const svg = definitions.get(ref);
      if (!svg) throw new Error(`Kaynak SVG bulunamadi: ${ref}`);
      records.push(buildRecord({ svg, varName: ref, categoryTitle, categoryKey, index }));
    });
  }
  if (records.length) return records;

  let currentCategoryTitle = "Diğer Semboller";
  let categoryIndex = new Map();
  const tokenPattern = /\/\/\s*===\s*([^=\r\n]+?)\s*===|\blet\s+([^\s=]+)\s*=\s*`([\s\S]*?)`;/gu;
  while ((match = tokenPattern.exec(source)) !== null) {
    if (match[1]) {
      currentCategoryTitle = categoryTitleFor(match[1]);
      continue;
    }
    const varName = match[2].normalize("NFC");
    const svg = match[3];
    const categoryKey = `diger-semboller-${slugify(currentCategoryTitle)}`;
    const index = categoryIndex.get(categoryKey) || 0;
    records.push(buildRecord({ svg, varName, categoryTitle: currentCategoryTitle, categoryKey, index }));
    categoryIndex.set(categoryKey, index + 1);
  }
  return records;
}

function outputFor(records) {
  return `/* AUTO-GENERATED OTHER SYMBOL CATALOG\n * Source file: svg diger semboller kaynagi.xml\n * Symbol count: ${records.length}\n */\n(function () {\n  "use strict";\n\n  const symbols = ${JSON.stringify(records, null, 2).replace(/\n/g, "\n  ")};\n\n  window.KrokiOtherSymbolCatalog = window.KrokiOtherSymbolCatalog || [];\n  window.KrokiOtherSymbolCatalog.push(...symbols);\n})();\n`;
}

const records = parseSource(fs.readFileSync(sourceFile, "utf8"));
if (!records.length) throw new Error("Kaynak dosyada sembol bulunamadi.");
fs.writeFileSync(outFile, outputFor(records), "utf8");
console.log(`Wrote ${path.relative(root, outFile)} from ${path.basename(sourceFile)}.`);
console.log(`Symbols: ${records.length}, categories: ${new Set(records.map((record) => record.categoryKey)).size}`);
