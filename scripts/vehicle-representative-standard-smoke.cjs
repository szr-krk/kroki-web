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
    const expectedDash = Math.max(dimensions.width, dimensions.height) < 50 ? "0.8 0.8" : "1 1";
    assert.ok(shapes.length, `${variant.key}/${view}: temsili geometri yok`);

    for (const shape of shapes) {
      const fill = shape.getAttribute("fill");
      const stroke = shape.getAttribute("stroke");
      if (fill && fill !== "none" && fill !== "transparent") {
        assert.equal(fill, "#ffffff", `${variant.key}/${view}: beyaz dışında dolgu var`);
      }
      if (stroke && stroke !== "none" && stroke !== "transparent") {
        assert.equal(stroke, "#111827", `${variant.key}/${view}: standart dışı stroke rengi var`);
        assert.equal(shape.getAttribute("stroke-width"), "0.3", `${variant.key}/${view}: stroke kalınlığı farklı`);
        assert.equal(shape.getAttribute("stroke-dasharray"), expectedDash, `${variant.key}/${view}: dash ritmi farklı`);
        assert.equal(shape.getAttribute("stroke-linecap"), "butt", `${variant.key}/${view}: dash uç biçimi farklı`);
        assert.equal(shape.getAttribute("vector-effect"), "non-scaling-stroke", `${variant.key}/${view}: dash ölçekleniyor`);
      }
    }
    auditedViews += 1;
  }
}

assert.ok(auditedViews >= 100, `beklenenden az görünüm denetlendi: ${auditedViews}`);
console.log(`vehicle representative standard smoke: ok (${auditedViews} views)`);
