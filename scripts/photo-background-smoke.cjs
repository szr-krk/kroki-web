const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.id = "";
  }

  append(child) {
    this.children.push(child);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class FakeFileReader {
  constructor() {
    this.listeners = new Map();
    this.result = null;
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  readAsDataURL(file) {
    this.result = file.testDataUrl;
    this.listeners.get("load")?.();
  }
}

class FakeImage {
  constructor() {
    this.listeners = new Map();
    this.naturalWidth = 1600;
    this.naturalHeight = 900;
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  set src(_value) {
    this.listeners.get("load")?.();
  }
}

const canvas = new FakeElement("svg");
canvas.setAttribute("viewBox", "0 0 1200 800");
const layer = new FakeElement("g");
const context = {
  FileReader: FakeFileReader,
  Image: FakeImage,
  Set,
  document: {
    createElementNS(_namespace, tagName) {
      return new FakeElement(tagName);
    },
    querySelector(selector) {
      if (selector === "#editorCanvas") return canvas;
      if (selector === "#editorBackground") return layer;
      return null;
    }
  },
  window: { Kroki: {} }
};
context.window.window = context.window;

const root = path.join(__dirname, "..");
const managerSource = fs.readFileSync(path.join(root, "src", "core", "photoBackgroundManager.js"), "utf8");
vm.runInNewContext(managerSource, context, { filename: "photoBackgroundManager.js" });

const manager = context.window.Kroki.PhotoBackgroundManager;
assert.ok(manager, "fotoğraf altlık yöneticisi yüklenmedi");

const sourceFile = {
  name: "orijinal.jpg",
  type: "image/jpeg",
  testDataUrl: "data:image/jpeg;base64,QUJD"
};

(async () => {
  const state = await manager.stateFromFile(sourceFile);
  assert.equal(state.dataUrl, sourceFile.testDataUrl, "fotoğraf verisi kopyalanmadı");
  assert.equal(state.naturalWidth, 1600);
  assert.equal(state.naturalHeight, 900);
  assert.equal(sourceFile.name, "orijinal.jpg", "kaynak dosya değiştirilmemeli");

  manager.set(state);
  assert.equal(manager.has(), true);
  assert.equal(layer.children.length, 1, "SVG fotoğraf katmanı oluşmadı");
  assert.equal(layer.children[0].tagName, "image");
  assert.equal(layer.children[0].getAttribute("href"), sourceFile.testDataUrl);
  assert.equal(layer.children[0].getAttribute("preserveAspectRatio"), "xMidYMid meet");
  assert.equal(layer.children[0].getAttribute("pointer-events"), "none");
  assert.deepEqual(
    JSON.parse(JSON.stringify(manager.getBounds())),
    { x: 0, y: 0, width: 1200, height: 800 }
  );

  const exported = manager.exportState();
  exported.bounds.width = 1;
  assert.equal(manager.getBounds().width, 1200, "dışa aktarılan durum iç veriyi değiştirmemeli");

  manager.clear();
  assert.equal(manager.has(), false);
  assert.equal(layer.children.length, 0);

  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const buttonStart = index.indexOf('id="btnFotografYukle"');
  const svgButtonStart = index.indexOf('id="btnSvgYukle"');
  assert.ok(buttonStart > svgButtonStart, "Fotoğraf Yükle, SVG Yükle butonunun altında olmalı");
  assert.ok(index.indexOf('id="editorBackground"') < index.indexOf('id="editorObjects"'));
  assert.ok(index.indexOf("photoBackgroundManager.js") < index.indexOf("documentSerializer.js"));
  assert.ok(index.indexOf("documentStorage.js") < index.indexOf("editor-main-menu.js"));

  const storageSource = fs.readFileSync(path.join(root, "src", "core", "documentStorage.js"), "utf8");
  assert.match(storageSource, /const DOCUMENT_STORE = "documents"/);
  assert.match(storageSource, /const ASSET_STORE = "assets"/);
  assert.doesNotMatch(storageSource, /local(?:Storage)|LEGACY_|migrateLegacyStorage/);

  const mainMenuSource = fs.readFileSync(path.join(root, "src", "editor-main-menu.js"), "utf8");
  const homeCss = fs.readFileSync(path.join(root, "src", "home.css"), "utf8");
  assert.doesNotMatch(mainMenuSource, /local(?:Storage)\./);
  assert.match(mainMenuSource, /documentStorage\.list\("recent", \{ summary: true \}\)/);
  assert.match(mainMenuSource, /documentStorage\.list\("template", \{ summary: true \}\)/);
  assert.match(homeCss, /@font-face\s*\{[^}]*font-family:\s*"KrokiSignNarrow";[^}]*src:\s*url\("\.\/arial-narrow\.ttf"\) format\("truetype"\);/s);
  assert.doesNotMatch(homeCss, /local\("Arial Narrow|local\("ArialNarrow/);
  assert.match(mainMenuSource, /const DOCUMENT_GEOMETRY_STROKE_SELECTOR = \[/);
  assert.match(mainMenuSource, /function normalizeDocumentStrokeScaling\(svgElement\)/);
  assert.doesNotMatch(mainMenuSource, /ROAD_GEOMETRY_STROKE_SELECTOR|normalizeRoadPreviewStrokeScaling/);
  assert.match(mainMenuSource, /async function exportedSvgString\(viewBox, options = \{\}\)/);
  assert.match(mainMenuSource, /containsSignFont\(clone\) \? await prepareExportSignFont\(\) : ""/);
  assert.match(mainMenuSource, /new Blob\(\[buffer\], \{ type: "font\/ttf" \}\)/);
  assert.match(mainMenuSource, /@font-face\{font-family:"\$\{EXPORT_SIGN_FONT_FAMILY\}";src:url\("\$\{signFontDataUrl\}"\) format\("truetype"\);\}/);
  assert.match(mainMenuSource, /const preview = await previewSnapshot\(\)/);
  assert.match(mainMenuSource, /svg = await exportedSvgString\(viewBox, \{ background: true, includeMetadata: false \}\)/);
  assert.match(mainMenuSource, /async function previewSvgForDisplay\(svg\)/);
  assert.match(mainMenuSource, /signFontRequired = containsSignFont\(svgElement\);[^}]*await prepareExportSignFont\(\)/s);
  assert.match(mainMenuSource, /if \(signFontRequired\) throw error/);
  assert.match(mainMenuSource, /async function svgDataUrl\(svg, options = \{\}\)/);
  assert.match(mainMenuSource, /async function renderPreviewInto\(target, entry\)/);
  assert.match(mainMenuSource, /const source = await svgDataUrl\(entry\.previewSvg, \{/);
  assert.match(mainMenuSource, /void renderPreviewInto\(preview, entry\)/);
  assert.match(mainMenuSource, /void renderPreviewInto\(imageBox, entry\)/);
  assert.match(mainMenuSource, /function shareableEntrySvg\(entry\)/);
  assert.match(mainMenuSource, /metadata\.setAttribute\("data-kroki-pro-signature", SVG_SIGNATURE\)/);
  assert.match(mainMenuSource, /new File\(\[blob\], filename, \{ type: mimeType \}\)/);
  assert.match(mainMenuSource, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(mainMenuSource, /await navigator\.share\(\{/);
  assert.match(mainMenuSource, /downloadBlob\(blob, filename\)/);
  assert.match(mainMenuSource, /if \(entryKind === "template"\) actions\.append\(renameButton\)/);
  assert.match(mainMenuSource, /actions\.append\(shareButton, editButton, cancelButton\)/);
  assert.match(mainMenuSource, /await documentStorage\.put\("template", updatedEntry\)/);
  assert.match(homeCss, /\.kroki-preview-actions\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(homeCss, /\.kroki-preview-actions \.btn-share\s*\{/);

  const editorLineCss = fs.readFileSync(path.join(root, "src", "editor-line.css"), "utf8");
  assert.match(editorLineCss, /\.editor-object-cp-visual,\s*\.editor-line-cp-visual\s*\{[^}]*stroke:\s*none;[^}]*stroke-width:\s*0;[^}]*vector-effect:\s*none;/s);
  assert.match(editorLineCss, /\.editor-object-cp-rotate-icon\s*\{[^}]*stroke:\s*none;[^}]*stroke-width:\s*0;/s);

  const serializerSource = fs.readFileSync(path.join(root, "src", "core", "documentSerializer.js"), "utf8");
  let importedBackground = undefined;
  const serializerContext = {
    console,
    window: {
      Kroki: {
        EditorUtils: {
          clonePlain(value) {
            return JSON.parse(JSON.stringify(value));
          }
        },
        ShapeRegistry: {
          has() {
            return true;
          }
        },
        EditorObjectManager: {
          canvas: {
            getAttribute() {
              return "0 0 1200 800";
            },
            setAttribute() {}
          },
          generateId() {
            return "generated-id";
          },
          getAll() {
            return [];
          },
          getObjectsInDomOrder() {
            return [];
          },
          normalizeModel(value) {
            return value;
          },
          renderObject() {},
          replaceAll() {}
        },
        StyleManager: {
          normalizeLabel(value) {
            return value || {};
          },
          normalizeStyle(value) {
            return value || {};
          },
          syncControls() {}
        },
        PhotoBackgroundManager: {
          exportState() {
            return state;
          },
          importState(value) {
            importedBackground = value;
          }
        }
      }
    }
  };
  vm.runInNewContext(serializerSource, serializerContext, { filename: "documentSerializer.js" });
  const serializer = serializerContext.window.Kroki.DocumentSerializer;
  const documentState = serializer.exportDocument({ stableTimestamps: true });
  assert.equal(documentState.photoBackground.dataUrl, sourceFile.testDataUrl);
  serializer.importDocument(documentState, { skipHistory: true });
  assert.equal(importedBackground.dataUrl, sourceFile.testDataUrl);

  console.log("photo background smoke: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
