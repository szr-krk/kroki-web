const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ttf": "font/ttf" };
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, body) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }).end(body);
  });
});

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "portrait", width: 768, height: 1024 }
];
const photos = [
  { name: "landscape", width: 640, height: 360 },
  { name: "portrait", width: 360, height: 640 },
  { name: "square", width: 480, height: 480 }
];
const staleView = { x: -730, y: 915, width: 375, height: 250 };
const savedView = { x: -123, y: 456, width: 900, height: 1200 };
const epsilon = 0.75;

function closeTo(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}

async function nextPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function screenshot(page, name) {
  if (!process.env.SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${name}.png`) });
}

async function upload(page, kind, file) {
  await page.click(kind === "photo" ? "#btnFotografYukle" : "#btnSvgYukle");
  await page.locator("#homeUploadInput").setInputFiles(file);
  await page.click("#homeUploadConfirm");
  await page.locator("#editor").waitFor({ state: "visible" });
  await nextPaint(page);
}

function assertTightContain(metrics, label) {
  const { canvas, painted, scaleX, scaleY } = metrics;
  assert.ok(canvas.width > 0 && canvas.height > 0, `${label}: canvas must be visible`);
  closeTo(scaleX, scaleY, 1e-8, `${label}: world-to-screen scale must be isotropic`);
  closeTo(painted.left + painted.width / 2, canvas.left + canvas.width / 2, epsilon, `${label}: horizontal center`);
  closeTo(painted.top + painted.height / 2, canvas.top + canvas.height / 2, epsilon, `${label}: vertical center`);
  assert.ok(painted.left >= canvas.left - epsilon && painted.right <= canvas.right + epsilon, `${label}: horizontal crop`);
  assert.ok(painted.top >= canvas.top - epsilon && painted.bottom <= canvas.bottom + epsilon, `${label}: vertical crop`);
  const touchesWidth = Math.abs(painted.left - canvas.left) < epsilon && Math.abs(painted.right - canvas.right) < epsilon;
  const touchesHeight = Math.abs(painted.top - canvas.top) < epsilon && Math.abs(painted.bottom - canvas.bottom) < epsilon;
  assert.ok(touchesWidth || touchesHeight, `${label}: one pair of edges must touch the canvas without extra margin`);
}

async function photoMetrics(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector("#editorCanvas");
    const element = document.querySelector("#editorPhotoBackgroundImage");
    const decoded = new Image();
    decoded.src = element.getAttribute("href");
    await decoded.decode();
    const bounds = {
      x: Number(element.getAttribute("x")), y: Number(element.getAttribute("y")),
      width: Number(element.getAttribute("width")), height: Number(element.getAttribute("height"))
    };
    const scale = Math.min(bounds.width / decoded.naturalWidth, bounds.height / decoded.naturalHeight);
    const width = decoded.naturalWidth * scale;
    const height = decoded.naturalHeight * scale;
    const x = bounds.x + (bounds.width - width) / 2;
    const y = bounds.y + (bounds.height - height) / 2;
    const matrix = element.getScreenCTM();
    const first = new DOMPoint(x, y).matrixTransform(matrix);
    const last = new DOMPoint(x + width, y + height).matrixTransform(matrix);
    return {
      canvas: canvas.getBoundingClientRect().toJSON(),
      painted: { left: first.x, top: first.y, right: last.x, bottom: last.y, width: last.x - first.x, height: last.y - first.y },
      scaleX: Math.hypot(matrix.a, matrix.b), scaleY: Math.hypot(matrix.c, matrix.d),
      naturalWidth: decoded.naturalWidth, naturalHeight: decoded.naturalHeight,
      state: window.Kroki.PhotoBackgroundManager.exportState(),
      viewBox: window.krokiEditorCamera.readViewBox(),
      preserveAspectRatio: element.getAttribute("preserveAspectRatio")
    };
  });
}

async function objectMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#editorCanvas");
    const bounds = window.Kroki.EditorObjectManager.getContentBounds();
    const matrix = canvas.getScreenCTM();
    const first = new DOMPoint(bounds.x, bounds.y).matrixTransform(matrix);
    const last = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height).matrixTransform(matrix);
    return {
      canvas: canvas.getBoundingClientRect().toJSON(),
      painted: { left: first.x, top: first.y, right: last.x, bottom: last.y, width: last.x - first.x, height: last.y - first.y },
      scaleX: Math.hypot(matrix.a, matrix.b), scaleY: Math.hypot(matrix.c, matrix.d)
    };
  });
}

function signedSvg(documentData, embeddedPhoto = "") {
  const signature = "KROKI_PRO_DOCUMENT_V1";
  const text = JSON.stringify({ signature, document: documentData }).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><metadata data-kroki-pro-signature="${signature}">${text}</metadata>${embeddedPhoto ? `<image data-kroki-photo-background="true" href="${embeddedPhoto}"/>` : ""}</svg>`);
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  const errors = [];
  let photoCases = 0;
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${viewport.name}: ${error.message}`));
      const url = `http://127.0.0.1:${server.address().port}`;
      await page.goto(url);
      const fixtures = await page.evaluate((definitions) => definitions.map((definition) => {
        const canvas = document.createElement("canvas");
        canvas.width = definition.width;
        canvas.height = definition.height;
        const paint = canvas.getContext("2d");
        paint.fillStyle = "#1687a7";
        paint.fillRect(0, 0, canvas.width, canvas.height);
        paint.strokeStyle = "#f29d38";
        paint.lineWidth = 8;
        paint.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
        return { ...definition, dataUrl: canvas.toDataURL("image/png") };
      }), photos);

      for (const fixture of fixtures) {
        let baseline = null;
        for (const withOldCamera of [false, true]) {
          await page.goto(url);
          if (withOldCamera) {
            await page.evaluate((view) => window.krokiEditorCamera.writeViewBox(document.querySelector("#editorCanvas"), view), staleView);
          }
          const label = `${viewport.name}/${fixture.name}/${withOldCamera ? "old-camera" : "fresh"}`;
          await upload(page, "photo", { name: `${fixture.name}.png`, mimeType: "image/png", buffer: Buffer.from(fixture.dataUrl.split(",")[1], "base64") });
          const metrics = await photoMetrics(page);
          assertTightContain(metrics, label);
          assert.equal(metrics.naturalWidth, fixture.width, `${label}: decoded width`);
          assert.equal(metrics.naturalHeight, fixture.height, `${label}: decoded height`);
          assert.equal(metrics.preserveAspectRatio, "xMidYMid meet", `${label}: photo must use contain fitting`);
          closeTo(metrics.painted.width / metrics.painted.height, fixture.width / fixture.height, 1e-8, `${label}: photo ratio`);
          assert.equal(metrics.state.bounds.x, 0, `${label}: initial world x`);
          assert.equal(metrics.state.bounds.y, 0, `${label}: initial world y`);
          closeTo(metrics.state.bounds.width / metrics.state.bounds.height, fixture.width / fixture.height, 1e-8, `${label}: stored photo ratio`);
          if (baseline) {
            assert.deepEqual(metrics.state.bounds, baseline.state.bounds, `${label}: previous camera must not change photo coordinates`);
            assert.deepEqual(metrics.viewBox, baseline.viewBox, `${label}: previous camera must not change initial framing`);
          } else baseline = metrics;
          if (viewport.name === "desktop" && fixture.name === "landscape" && !withOldCamera) {
            await screenshot(page, "photo-centered");
          }
          await page.click("#btnEditorPhotoVisibility");
          assert.equal(await page.locator("#editorBackground").getAttribute("display"), "none", `${label}: hide photo`);
          assert.deepEqual(await page.evaluate(() => window.krokiEditorCamera.readViewBox()), metrics.viewBox, `${label}: hiding photo must not move camera`);
          await page.click("#btnEditorPhotoVisibility");
          assert.equal(await page.locator("#editorBackground").getAttribute("display"), "inline", `${label}: show photo`);
          assert.deepEqual(await page.evaluate(() => window.krokiEditorCamera.readViewBox()), metrics.viewBox, `${label}: showing photo must not move camera`);
          photoCases += 1;
        }
      }

      // Use the app's normalized model shape, then import it through the real SVG file input.
      await page.goto(url);
      const documentData = await page.evaluate(() => {
        const K = window.Kroki;
        const line = K.ShapeRegistry.get("line").create({ start: { x: 200, y: 180 }, end: { x: 980, y: 610 } });
        K.EditorObjectManager.add({ ...line, id: "import-framing-line" }, { skipHistory: true });
        const result = K.DocumentSerializer.exportDocument();
        window.KrokiMainMenu.resetDocument();
        return result;
      });
      documentData.viewport.viewBox = "9000 -8000 50 30";
      const originalObjects = structuredClone(documentData.objects);
      assert.deepEqual(originalObjects[0].geometry, { start: { x: 200, y: 180 }, end: { x: 980, y: 610 } }, "fixture line must stay inside the legacy photo's painted area");
      await upload(page, "svg", { name: "stale-viewport.svg", mimeType: "image/svg+xml", buffer: signedSvg(documentData) });
      assertTightContain(await objectMetrics(page), `${viewport.name}/svg-objects`);
      assert.deepEqual(await page.evaluate(() => window.Kroki.DocumentSerializer.exportDocument().objects), originalObjects, "SVG fitting must preserve object world data");
      if (viewport.name === "desktop") await screenshot(page, "svg-centered");

      // A legacy photo has letterboxing in stored bounds; the overlay must not move when framing its pixels.
      const fixture = fixtures[0];
      const legacyPhoto = {
        dataUrl: "", mimeType: "image/png", name: "legacy.png", visible: true,
        naturalWidth: fixture.width, naturalHeight: fixture.height,
        bounds: { x: 35, y: 45, width: 1200, height: 800 }
      };
      documentData.photoBackground = legacyPhoto;
      await page.goto(url);
      await upload(page, "svg", { name: "legacy-photo.svg", mimeType: "image/svg+xml", buffer: signedSvg(documentData, fixture.dataUrl) });
      const legacyMetrics = await photoMetrics(page);
      assertTightContain(legacyMetrics, `${viewport.name}/legacy-photo-svg`);
      assert.deepEqual(legacyMetrics.state.bounds, legacyPhoto.bounds, "legacy photo world box must not move or resize");
      assert.deepEqual(await page.evaluate(() => window.Kroki.DocumentSerializer.exportDocument().objects), originalObjects, "legacy photo overlay world data must stay aligned");
      if (viewport.name === "desktop") await screenshot(page, "legacy-photo-svg-centered");

      // Persist and reopen a real recent through its preview: camera restoration must remain distinct from file import.
      await page.evaluate((view) => window.krokiEditorCamera.writeViewBox(document.querySelector("#editorCanvas"), view), savedView);
      const recent = await page.evaluate(() => window.KrokiMainMenu.saveRecent());
      assert.ok(recent?.id, "recent save must succeed");
      await page.goto(url);
      await page.locator(`[data-entry-id="${recent.id}"]`).click();
      await page.locator('[data-preview-action="edit"]').click();
      await page.locator("#editor").waitFor({ state: "visible" });
      await nextPaint(page);
      assert.deepEqual(await page.evaluate(() => window.krokiEditorCamera.readViewBox()), savedView, "reopening a recent must preserve its saved viewport");
      assert.deepEqual(await page.evaluate(() => window.Kroki.PhotoBackgroundManager.exportState().bounds), legacyPhoto.bounds, "reopening a recent must preserve photo world bounds");
      assert.deepEqual(await page.evaluate(() => window.Kroki.DocumentSerializer.exportDocument().objects), originalObjects, "reopening a recent must preserve overlay world data");
      await context.close();
    }
    assert.deepEqual(errors, [], "browser errors");
    console.log(`PASS: ${photoCases} photo imports across desktop/tablet/portrait, centered uncropped ratio-preserving tight fit, prior camera independence, photo visibility, SVG/legacy-photo framing, and saved recent viewport restoration.`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
