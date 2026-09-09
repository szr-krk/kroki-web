const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, body) => {
    if (error) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }).end(body);
  });
});

const buttonPoint = {
  "move-up": { x: 58, y: 23 },
  "move-right": { x: 93, y: 58 },
  "move-down": { x: 58, y: 93 },
  "move-left": { x: 23, y: 58 }
};

function closeTo(actual, expected, epsilon = 1e-6, message = "values differ") {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
}

async function nextPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function pressDirection(page, action, holdMs = 0) {
  const box = await page.locator(`[data-touch-action='${action}']`).boundingBox();
  assert.ok(box, `${action} control is not visible`);
  const point = buttonPoint[action];
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await nextPaint(page);
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: Number(process.env.VIEWPORT_WIDTH) || 1180,
        height: Number(process.env.VIEWPORT_HEIGHT) || 850
      },
      hasTouch: true
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.click("#btnYeniKroki");
    await page.evaluate(() => {
      window.krokiEditorCamera.resetViewBox();
      window.Kroki.SelectionManager.clear();
      window.Kroki.MultiSelectManager.clear();
      window.Kroki.HistoryManager.clear();
    });
    await nextPaint(page);

    assert.equal(await page.locator("#touchControlPanel").isHidden(), true, "direction pad must start collapsed");
    assert.equal(await page.locator("#btnTouchControlRestore").isVisible(), true, "collapsed launcher must be visible");
    closeTo(
      Number(await page.locator("#btnTouchControlRestore").evaluate((node) => getComputedStyle(node).opacity)),
      .5,
      1e-8,
      "collapsed launcher opacity"
    );

    const gridLayout = await page.evaluate(() => {
      const controls = document.querySelector(".editor-grid-controls").getBoundingClientRect();
      const buttons = document.querySelector(".editor-grid-control-buttons").getBoundingClientRect();
      const zoom = document.querySelector("#touchControlZoomValue").getBoundingClientRect();
      const ruler = document.querySelector("#btnEditorRulers").getBoundingClientRect();
      return {
        controls: { height: controls.height, top: controls.top, bottom: controls.bottom },
        buttons: { bottom: buttons.bottom },
        zoom: { top: zoom.top, bottom: zoom.bottom },
        ruler: { width: ruler.width, height: ruler.height }
      };
    });
    closeTo(gridLayout.controls.height, 54, .1, "grid control group height must stay unchanged");
    assert.ok(gridLayout.zoom.top >= gridLayout.buttons.bottom, "zoom label must sit below the grid buttons");
    assert.ok(gridLayout.ruler.width <= 34.1 && gridLayout.ruler.height <= 34.1, "grid buttons must make room for zoom text");

    await page.click("#btnTouchControlRestore");
    await page.waitForTimeout(180);
    assert.equal(await page.locator("#touchControlPanel").isVisible(), true, "launcher must open direction pad");
    assert.equal(await page.locator("#btnTouchControlRestore").isHidden(), true, "launcher must hide while pad is open");
    assert.equal(await page.locator("[data-touch-action]").count(), 4, "pad must contain only four direction controls");
    assert.equal(await page.locator("[data-touch-action^='zoom-']").count(), 0, "zoom buttons must be removed");

    const placement = await page.evaluate(() => {
      const panel = document.querySelector("#touchControlPanel").getBoundingClientRect();
      const canvas = document.querySelector("#editorCanvas").getBoundingClientRect();
      return {
        panel: { width: panel.width, height: panel.height, right: panel.right, bottom: panel.bottom },
        canvas: { right: canvas.right, bottom: canvas.bottom }
      };
    });
    closeTo(placement.panel.width, 120, .1, "diamond panel width");
    closeTo(placement.panel.height, 120, .1, "diamond panel height");
    assert.ok(placement.panel.right <= placement.canvas.right && placement.panel.right > placement.canvas.right - 40, "panel must dock at canvas right");
    assert.ok(placement.panel.bottom <= placement.canvas.bottom && placement.panel.bottom > placement.canvas.bottom - 40, "panel must dock at canvas bottom");
    if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH });

    const initialView = await page.evaluate(() => window.krokiEditorCamera.readViewBox());
    await page.evaluate(() => window.krokiEditorCamera.zoomByPercentagePointAtCenter(document.querySelector("#editorCanvas"), 1));
    await nextPaint(page);
    const zoomed = await page.evaluate(() => ({
      viewBox: window.krokiEditorCamera.readViewBox(),
      label: document.querySelector("#touchControlZoomValue").textContent
    }));
    assert.equal(zoomed.label, "Zoom: %101", "zoom information must follow camera changes");
    closeTo(zoomed.viewBox.x + zoomed.viewBox.width / 2, initialView.x + initialView.width / 2, 1e-7, "zoom center x changed");
    closeTo(zoomed.viewBox.y + zoomed.viewBox.height / 2, initialView.y + initialView.height / 2, 1e-7, "zoom center y changed");
    await page.evaluate(() => window.krokiEditorCamera.zoomByPercentagePointAtCenter(document.querySelector("#editorCanvas"), -1));
    await nextPaint(page);

    await pressDirection(page, "move-right");
    const panned = await page.evaluate(() => window.krokiEditorCamera.readViewBox());
    closeTo(panned.x, initialView.x - 1, 1e-7, "right segment must move the scene one world unit");
    closeTo(panned.y, initialView.y, 1e-7, "horizontal scene movement changed y");

    const objectBefore = await page.evaluate(() => {
      const K = window.Kroki;
      const model = { ...K.ShapeRegistry.get("line").create({ start: { x: 20, y: 30 }, end: { x: 80, y: 50 } }), id: "touch-control-test-line" };
      K.EditorObjectManager.add(model, { skipHistory: true });
      K.SelectionManager.preselect(model.id);
      K.HistoryManager.clear();
      return {
        geometry: structuredClone(K.EditorObjectManager.get(model.id).geometry),
        viewBox: window.krokiEditorCamera.readViewBox()
      };
    });
    await pressDirection(page, "move-right");
    const objectMoved = await page.evaluate(() => ({
      geometry: structuredClone(window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry),
      mode: window.Kroki.SelectionManager.getMode(),
      canUndo: window.Kroki.HistoryManager.canUndo(),
      viewBox: window.krokiEditorCamera.readViewBox()
    }));
    closeTo(objectMoved.geometry.start.x, objectBefore.geometry.start.x + 1, 1e-8, "selected object start did not move one unit");
    closeTo(objectMoved.geometry.end.x, objectBefore.geometry.end.x + 1, 1e-8, "selected object end did not move one unit");
    assert.equal(objectMoved.mode, "preselect", "precision move must preserve preselect mode");
    assert.equal(objectMoved.canUndo, true, "precision object movement must be undoable");
    assert.deepEqual(objectMoved.viewBox, objectBefore.viewBox, "selected object movement must not pan the scene");
    await page.evaluate(() => window.Kroki.HistoryManager.undo());
    assert.deepEqual(
      await page.evaluate(() => window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry),
      objectBefore.geometry,
      "single-step undo did not restore object geometry"
    );

    await page.evaluate(() => {
      window.Kroki.SelectionManager.promoteToEdit();
      window.Kroki.HistoryManager.clear();
    });
    const editBeforeY = await page.evaluate(() => window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.y);
    await pressDirection(page, "move-down");
    const editMoved = await page.evaluate(() => ({
      y: window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.y,
      mode: window.Kroki.SelectionManager.getMode()
    }));
    closeTo(editMoved.y, editBeforeY + 1, 1e-8, "edit-mode object did not move one unit");
    assert.equal(editMoved.mode, "edit", "precision move must preserve edit mode");
    await page.evaluate(() => window.Kroki.HistoryManager.undo());

    await page.evaluate(() => window.Kroki.HistoryManager.clear());
    const holdBefore = await page.evaluate(() => window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.x);
    await pressDirection(page, "move-right", 800);
    const holdAfter = await page.evaluate(() => ({
      x: window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.x,
      historySize: window.Kroki.HistoryManager.size()
    }));
    assert.ok(holdAfter.x - holdBefore >= 4, "long press must repeat movement");
    assert.ok(holdAfter.x - holdBefore <= 6, "long press repetition must stay at the calmer rate");
    assert.ok(Number.isInteger(holdAfter.x - holdBefore), "long press must repeat in exact one-unit steps");
    assert.equal(holdAfter.historySize.undo, 1, "one long press must create one undo record");
    await page.evaluate(() => window.Kroki.HistoryManager.undo());
    closeTo(
      await page.evaluate(() => window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.x),
      holdBefore,
      1e-8,
      "long-press undo did not restore the starting position"
    );

    await page.waitForTimeout(5200);
    assert.equal(await page.locator("#touchControlPanel").isHidden(), true, "pad must auto-collapse after five idle seconds");
    assert.equal(await page.locator("#btnTouchControlRestore").isVisible(), true, "launcher must return after auto-collapse");

    await page.click("#btnTouchControlRestore");
    await page.mouse.click(400, 400);
    assert.equal(await page.locator("#touchControlPanel").isHidden(), true, "outside click should collapse the transient pad");
    assert.deepEqual(errors, [], "browser errors");
    console.log("PASS: compact diamond pad, four-way 1-unit movement, long press/undo, zoom readout, outside-click and five-second auto-collapse.");
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
