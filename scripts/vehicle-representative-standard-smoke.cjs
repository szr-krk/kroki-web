const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const GRAPHIC_TAGS = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toLowerCase();
    this.attributes = new Map();
    this.children = [];
  }

  append(child) {
    this.children.push(child);
    child.parentNode = this;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }

  querySelectorAll(selector) {
    const tags = new Set(String(selector).split(",").map((item) => item.trim().toLowerCase()));
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (tags.has(child.tagName)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

function createSvgElement(tagName, attrs = {}) {
  const element = new FakeElement(tagName);
  Object.entries(attrs).forEach(([name, value]) => {
    if (value != null) element.setAttribute(name, value);
  });
  return element;
}

function transformScale(transform) {
  let determinant = 1;
  const pattern = /([a-z]+)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = pattern.exec(String(transform || "")))) {
    const values = match[2].trim().split(/[\s,]+/).map(Number);
    if (match[1].toLowerCase() === "matrix" && values.length >= 4) {
      determinant *= Math.abs(values[0] * values[3] - values[1] * values[2]);
    } else if (match[1].toLowerCase() === "scale" && values.length) {
      determinant *= Math.abs(values[0] * (Number.isFinite(values[1]) ? values[1] : values[0]));
    }
  }
  return Math.sqrt(determinant);
}

function internalScaleFor(element, rootElement) {
  let scale = 1;
  for (let current = element; current && current !== rootElement; current = current.parentNode) {
    scale *= transformScale(current.getAttribute("transform"));
  }
  return scale;
}

const context = { window: {} };
vm.runInNewContext(read("src/data/vehicle-catalog-data.js"), context);
const expansionFile = path.join(root, "src", "data", "vehicle-catalog-expansion.js");
if (fs.existsSync(expansionFile)) {
  vm.runInNewContext(fs.readFileSync(expansionFile, "utf8"), context);
}
vm.runInNewContext(read("src/core/vehicleCatalog.js"), context);

const Kroki = context.window.Kroki;
Kroki.EditorUtils = {
  createSvgElement,
  numberOr: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  normalizeRotation: (value) => Number(value) || 0,
  clonePlain: (value) => JSON.parse(JSON.stringify(value)),
};
Kroki.ShapeRegistry = { register() {} };
vm.runInNewContext(read("src/adapters/vehicleAdapter.js"), context);

const catalog = Kroki.VehicleCatalog;
const renderer = Kroki.VehicleRenderer;
assert.equal(typeof renderer?.renderPreviewSvg, "function");

let auditedViews = 0;
for (const variant of catalog.allVariants()) {
  for (const view of catalog.viewOrder) {
    if (!catalog.supportsView(variant, view)) continue;
    const preview = renderer.renderPreviewSvg(variant, { view, ghost: true });
    const shapes = preview.querySelectorAll(Array.from(GRAPHIC_TAGS).join(", "));
    const dimensions = catalog.dimensionsForView(variant, view);
    const expectedDash = Math.max(dimensions.width, dimensions.height) < 50 ? 0.8 : 1;
    assert.ok(shapes.length, `${variant.key}/${view}: temsili geometri yok`);

    for (const shape of shapes) {
      const fill = shape.getAttribute("fill");
      const stroke = shape.getAttribute("stroke");
      if (fill && fill !== "none" && fill !== "transparent") {
        assert.equal(fill, "#ffffff", `${variant.key}/${view}: beyaz dışında dolgu var`);
      }
      if (stroke && stroke !== "none" && stroke !== "transparent") {
        const internalScale = internalScaleFor(shape, preview);
        const dash = shape.getAttribute("stroke-dasharray").split(/\s+/).map(Number);
        assert.equal(stroke, "#111827", `${variant.key}/${view}: standart dışı stroke rengi var`);
        assert.ok(Math.abs(Number(shape.getAttribute("stroke-width")) * internalScale - 0.3) < 0.0001, `${variant.key}/${view}: stroke kalınlığı farklı`);
        assert.ok(dash.length === 2 && dash.every((value) => Math.abs(value * internalScale - expectedDash) < 0.0001), `${variant.key}/${view}: dash ritmi farklı`);
        assert.equal(shape.getAttribute("stroke-linecap"), "butt", `${variant.key}/${view}: dash uç biçimi farklı`);
        assert.equal(shape.getAttribute("vector-effect"), null, `${variant.key}/${view}: zoom sırasında dash sabitlenmiş`);
      }
    }
    auditedViews += 1;
  }
}

assert.ok(auditedViews >= 100, `beklenenden az görünüm denetlendi: ${auditedViews}`);
console.log(`vehicle representative standard smoke: ok (${auditedViews} views)`);
