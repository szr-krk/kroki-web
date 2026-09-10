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
    this.hidden = false;
    this.listeners = new Map();
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  click() {
    this.listeners.get("click")?.forEach((callback) => callback({
      preventDefault() {},
      stopPropagation() {}
    }));
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
const visibilityButton = new FakeElement("button");
const undoButton = new FakeElement("button");
const redoButton = new FakeElement("button");
const context = {
  console,
  CustomEvent: class {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  },
  FileReader: FakeFileReader,
  Image: FakeImage,
  Set,
  document: {
    addEventListener() {},
    createElementNS(_namespace, tagName) {
      return new FakeElement(tagName);
    },
    querySelector(selector) {
      if (selector === "#editorCanvas") return canvas;
      if (selector === "#editorBackground") return layer;
      if (selector === "#btnEditorPhotoVisibility") return visibilityButton;
      if (selector === "#btnEditorUndo") return undoButton;
      if (selector === "#btnEditorRedo") return redoButton;
      return null;
    }
  },
  window: { Kroki: {}, dispatchEvent() {} }
};
context.window.window = context.window;

const root = path.join(__dirname, "..");
const managerSource = fs.readFileSync(path.join(root, "src", "core", "photoBackgroundManager.js"), "utf8");
vm.runInNewContext(managerSource, context, { filename: "photoBackgroundManager.js" });

const manager = context.window.Kroki.PhotoBackgroundManager;
assert.ok(manager, "fotoğraf altlık yöneticisi yüklenmedi");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertVisibility(visible, hasPhoto = true) {
  assert.equal(manager.has(), hasPhoto, "görünürlük fotoğrafın varlığını değiştirmemeli");
  assert.equal(manager.isVisible(), visible);
  assert.equal(layer.getAttribute("display"), visible ? "inline" : "none");
  assert.equal(visibilityButton.hidden, !hasPhoto, "fotoğraf düğmesi yalnız fotoğraflı belgede görünmeli");
  assert.equal(visibilityButton.getAttribute("aria-pressed"), String(visible));
  const label = visible ? "Fotoğrafı gizle" : "Fotoğrafı göster";
  assert.equal(visibilityButton.getAttribute("aria-label"), label);
  assert.equal(visibilityButton.getAttribute("title"), label);
  if (!visible) assert.equal(manager.getBounds(), null, "gizli fotoğraf çıktı kadrajını genişletmemeli");
}

const sourceFile = {
  name: "orijinal.jpg",
  type: "image/jpeg",
  testDataUrl: "data:image/jpeg;base64,QUJD"
};

(async () => {
  assertVisibility(false, false);
  assert.equal(manager.setVisible(true), false, "fotoğrafsız görünürlük değişimi işlem yapmamalı");
  const state = await manager.stateFromFile(sourceFile);
  assert.equal(state.dataUrl, sourceFile.testDataUrl, "fotoğraf verisi kopyalanmadı");
  assert.equal(state.naturalWidth, 1600);
  assert.equal(state.naturalHeight, 900);
  assert.equal(state.visible, true, "yeni fotoğraf görünür başlamalı");
  assert.equal(sourceFile.name, "orijinal.jpg", "kaynak dosya değiştirilmemeli");

  manager.set(state);
  assertVisibility(true);
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

  const originalImage = layer.children[0];
  visibilityButton.click();
  assertVisibility(false);
  assert.equal(manager.exportState().visible, false);
  assert.equal(manager.exportState().dataUrl, sourceFile.testDataUrl, "gizleme fotoğraf verisini silmemeli");
  assert.equal(layer.children[0], originalImage, "gizleme SVG fotoğrafını DOM'dan çıkarmamalı");
  assert.equal(originalImage.getAttribute("data-kroki-photo-background"), "true");
  assert.equal(originalImage.getAttribute("href"), sourceFile.testDataUrl, "SVG yeniden import için fotoğrafı korumalı");
  assert.equal(manager.setVisible(false), false, "aynı görünürlük tekrar uygulanmamalı");
  visibilityButton.click();
  assertVisibility(true);
  assert.equal(layer.children[0], originalImage, "gösterme aynı fotoğraf öğesini kullanmalı");
  assert.deepEqual(plain(manager.getBounds()), plain(state.bounds));

  assert.equal(manager.clear(), true);
  assertVisibility(false, false);
  assert.equal(layer.children.length, 0);
  assert.equal(manager.exportState(), null);
  assert.equal(manager.clear(), false);

  const legacyState = plain(state);
  delete legacyState.visible;
  assert.equal(manager.importState(legacyState), true);
  assertVisibility(true);
  assert.equal(manager.exportState().visible, true, "eski fotoğraf kaydı görünür olarak açılmalı");
  assert.equal(manager.importState({ ...state, visible: false }), true);
  assertVisibility(false);
  assert.equal(layer.children[0].getAttribute("href"), sourceFile.testDataUrl);
  const hiddenState = plain(manager.exportState());
  manager.clear();
  assert.equal(manager.importState(hiddenState), true);
  assertVisibility(false);
  assert.deepEqual(plain(manager.exportState()), hiddenState, "gizli fotoğraf kayıt dönüşünde eksiksiz korunmalı");
  assert.equal(manager.importState(null), true);
  assertVisibility(false, false);

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
  assert.match(mainMenuSource, /if \(entryKind === "template"\) left\.append\(actionButton\("Yeniden Adlandır", "rename"\)\)/);
  assert.match(mainMenuSource, /right\.append\(shareBox, actionButton\("Düzenle", "edit", "btn-ok"\), actionButton\("Kapat", "cancel"\)\)/);
  assert.match(mainMenuSource, /await documentStorage\.put\("template", updatedEntry\)/);
  assert.match(homeCss, /\.kroki-preview-actions\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(homeCss, /\.kroki-preview-actions \.btn-share\s*\{/);

  const editorLineCss = fs.readFileSync(path.join(root, "src", "editor-line.css"), "utf8");
  assert.match(editorLineCss, /\.editor-object-cp-visual,\s*\.editor-line-cp-visual\s*\{[^}]*stroke:\s*none;[^}]*stroke-width:\s*0;[^}]*vector-effect:\s*none;/s);
  assert.match(editorLineCss, /\.editor-object-cp-rotate-icon\s*\{[^}]*fill:\s*#22c55e;[^}]*fill-opacity:\s*\.5;[^}]*stroke:\s*none;[^}]*stroke-width:\s*0;/s);

  const serializerSource = fs.readFileSync(path.join(root, "src", "core", "documentSerializer.js"), "utf8");
  const historySource = fs.readFileSync(path.join(root, "src", "core", "historyManager.js"), "utf8");
  let objects = [];
  let nextId = 0;
  Object.assign(context.window.Kroki, {
    EditorUtils: { clonePlain: (value) => plain(value ?? {}) },
    ShapeRegistry: { has: () => true },
    EditorObjectManager: {
      canvas,
      generateId: () => `generated-${++nextId}`,
      getAll: () => objects,
      getObjectsInDomOrder: () => objects,
      normalizeModel: (value) => value,
      renderObject() {},
      replaceAll(models) { objects = plain(models); }
    },
    StyleManager: {
      normalizeLabel: (value) => value || {},
      normalizeStyle: (value) => value || {},
      syncControls() {}
    }
  });
  vm.runInNewContext(serializerSource, context, { filename: "documentSerializer.js" });
  vm.runInNewContext(historySource, context, { filename: "historyManager.js" });
  const serializer = context.window.Kroki.DocumentSerializer;
  const history = context.window.Kroki.HistoryManager;
  const drawingObject = {
    id: "traced-line",
    type: "line",
    geometry: { start: { x: 50, y: 70 }, end: { x: 110, y: 90 } },
    style: { stroke: "#000000", strokeWidth: 2 },
    label: {},
    metadata: {}
  };
  const documentState = {
    schemaVersion: 1,
    viewport: { viewBox: "10 20 600 400" },
    objects: [drawingObject],
    photoBackground: legacyState
  };
  assert.equal(serializer.importDocument(documentState).ok, true);
  assertVisibility(true);
  const beforeToggle = plain(serializer.exportDocument({ stableTimestamps: true }));
  assert.deepEqual(beforeToggle.objects, [drawingObject]);
  assert.equal(beforeToggle.photoBackground.dataUrl, sourceFile.testDataUrl);
  assert.equal(history.canUndo(), false);

  const photoDuringHistory = layer.children[0];
  const photoGeometry = ["x", "y", "width", "height"].map((name) => photoDuringHistory.getAttribute(name));
  const drawingDuringHistory = objects[0];
  const geometryDuringHistory = objects[0].geometry;
  function assertLightweightVisibilityChange(action) {
    const exportDocument = serializer.exportDocument;
    let snapshotCount = 0;
    serializer.exportDocument = (...args) => {
      snapshotCount += 1;
      return exportDocument(...args);
    };
    try {
      action();
    } finally {
      serializer.exportDocument = exportDocument;
    }
    assert.equal(snapshotCount, 0, "görünürlük geçmişi fotoğraf verisini içeren belge kopyası oluşturmamalı");
    assert.equal(layer.children[0], photoDuringHistory, "görünürlük geçmişi fotoğraf DOM öğesini yeniden oluşturmamalı");
    assert.deepEqual(["x", "y", "width", "height"].map((name) => photoDuringHistory.getAttribute(name)), photoGeometry);
    assert.equal(objects[0], drawingDuringHistory, "görünürlük geçmişi çizim nesnelerini yeniden oluşturmamalı");
    assert.equal(objects[0].geometry, geometryDuringHistory, "görünürlük geçmişi çizim geometrisini yeniden oluşturmamalı");
  }

  assertLightweightVisibilityChange(() => visibilityButton.click());
  assertVisibility(false);
  assert.deepEqual(plain(history.size()), { undo: 1, redo: 0 });
  assert.equal(undoButton.disabled, false);
  const afterToggle = plain(serializer.exportDocument({ stableTimestamps: true }));
  assert.deepEqual(afterToggle, {
    ...beforeToggle,
    photoBackground: { ...beforeToggle.photoBackground, visible: false }
  }, "gizleme yalnız fotoğraf görünürlüğünü değiştirmeli; çizim ve kamera korunmalı");
  manager.setVisible(false);
  assert.deepEqual(plain(history.size()), { undo: 1, redo: 0 }, "tekrarlanan değer geçmişe işlem eklememeli");

  assertLightweightVisibilityChange(() => undoButton.click());
  assertVisibility(true);
  assert.deepEqual(plain(serializer.exportDocument({ stableTimestamps: true })), beforeToggle);
  assert.deepEqual(plain(history.size()), { undo: 0, redo: 1 });
  assert.equal(redoButton.disabled, false);
  assertLightweightVisibilityChange(() => redoButton.click());
  assertVisibility(false);
  assert.deepEqual(plain(serializer.exportDocument({ stableTimestamps: true })), afterToggle);
  assert.deepEqual(plain(history.size()), { undo: 1, redo: 0 });
  assert.equal(layer.children[0].getAttribute("href"), sourceFile.testDataUrl);

  const savedHiddenJson = serializer.toJson();
  assert.equal(serializer.importDocument({ objects: [] }).ok, true);
  assertVisibility(false, false);
  assert.equal(layer.children.length, 0, "yeni belgede önceki fotoğraf kalmamalı");
  assert.equal(serializer.exportDocument().photoBackground, null);
  assert.deepEqual(plain(history.size()), { undo: 0, redo: 0 });
  assert.equal(manager.setVisible(true), false);
  assert.equal(history.canUndo(), false, "fotoğrafsız düğme geçmişe işlem eklememeli");

  assert.equal(serializer.fromJson(savedHiddenJson).ok, true);
  assertVisibility(false);
  assert.deepEqual(plain(serializer.exportDocument({ stableTimestamps: true })), afterToggle,
    "gizli fotoğraf ve çizim gerçek serializer ile kaydet/aç dönüşünde korunmalı");
  assert.equal(history.canUndo(), false, "belge yüklemek görünürlük işlemi üretmemeli");
  visibilityButton.click();
  assertVisibility(true);
  assert.deepEqual(plain(manager.getBounds()), plain(state.bounds));
  assert.equal(history.undo(), true);
  assertVisibility(false);
  assert.equal(history.redo(), true);
  assertVisibility(true);

  history.clear();
  assert.equal(manager.setVisible(false, { skipHistory: true }), true);
  assertVisibility(false);
  assert.equal(history.canUndo(), false, "skipHistory seçeneği geçmiş kaydı oluşturmamalı");
  history.suspend(() => manager.setVisible(true));
  assertVisibility(true);
  assert.equal(history.canUndo(), false, "askıdaki geçmişe görünürlük işlemi eklenmemeli");

  console.log("photo background smoke: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
