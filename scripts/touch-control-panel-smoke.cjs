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

function closeTo(actual, expected, epsilon = 1e-6, message = "values differ") {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
}

async function nextPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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

    const placement = await page.evaluate(() => {
      const panel = document.querySelector("#touchControlPanel").getBoundingClientRect();
      const canvas = document.querySelector("#editorCanvas").getBoundingClientRect();
      const mainButton = document.querySelector("[data-touch-action='move-left']").getBoundingClientRect();
      const headerButton = document.querySelector("#btnTouchControlCollapse").getBoundingClientRect();
      const plainRect = (rect) => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      });
      return {
        panel: plainRect(panel),
        canvas: plainRect(canvas),
        mainButton: plainRect(mainButton),
        headerButton: plainRect(headerButton)
      };
    });
    assert.ok(placement.panel.right <= placement.canvas.right, "panel must remain inside the canvas right edge");
    assert.ok(placement.panel.bottom <= placement.canvas.bottom, "panel must remain inside the canvas bottom edge");
    assert.ok(placement.panel.right > placement.canvas.right - 40, "panel must dock at the canvas bottom-right");
    assert.ok(
      placement.mainButton.width >= 48 && placement.mainButton.height >= 48,
      `primary controls need touch-sized targets: ${JSON.stringify(placement.mainButton)}`
    );
    assert.ok(
      placement.headerButton.width >= 48 && placement.headerButton.height >= 48,
      `header controls need touch-sized targets: ${JSON.stringify(placement.headerButton)}`
    );
    if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH });

    const initialView = await page.evaluate(() => window.krokiEditorCamera.readViewBox());
    await page.click("[data-touch-action='zoom-in']");
    await nextPaint(page);
    const zoomed = await page.evaluate(() => ({
      viewBox: window.krokiEditorCamera.readViewBox(),
      percent: window.Kroki.TouchControlPanel.getZoomPercent(),
      label: document.querySelector("#touchControlZoomValue").textContent
    }));
    closeTo(zoomed.percent, 101, 1e-8, "zoom-in must add one percentage point");
    closeTo(zoomed.viewBox.x + zoomed.viewBox.width / 2, initialView.x + initialView.width / 2, 1e-7, "zoom center x changed");
    closeTo(zoomed.viewBox.y + zoomed.viewBox.height / 2, initialView.y + initialView.height / 2, 1e-7, "zoom center y changed");
    assert.equal(zoomed.label, "Zoom: %101");

    await page.click("[data-touch-action='zoom-out']");
    await page.click("[data-touch-action='move-right']");
    await nextPaint(page);
    const panned = await page.evaluate(() => window.krokiEditorCamera.readViewBox());
    closeTo(panned.x, initialView.x - 1, 1e-7, "right arrow must move the scene one world unit");
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
    await page.click("[data-touch-action='move-right']");
    const objectMoved = await page.evaluate(() => ({
      geometry: structuredClone(window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry),
      mode: window.Kroki.SelectionManager.getMode(),
      canUndo: window.Kroki.HistoryManager.canUndo(),
      viewBox: window.krokiEditorCamera.readViewBox()
    }));
    closeTo(objectMoved.geometry.start.x, objectBefore.geometry.start.x + 1, 1e-8, "selected object start did not move exactly one unit");
    closeTo(objectMoved.geometry.end.x, objectBefore.geometry.end.x + 1, 1e-8, "selected object end did not move exactly one unit");
    assert.equal(objectMoved.mode, "preselect", "precision move must preserve preselect mode");
    assert.equal(objectMoved.canUndo, true, "precision object movement must be undoable");
    assert.deepEqual(objectMoved.viewBox, objectBefore.viewBox, "selected object movement must not pan the scene");
    await page.evaluate(() => window.Kroki.HistoryManager.undo());
    assert.deepEqual(
      await page.evaluate(() => window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry),
      objectBefore.geometry,
      "single-step undo did not restore object geometry"
    );

    const selectedZoomBefore = await page.evaluate(() => ({
      geometry: structuredClone(window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry),
      viewBox: window.krokiEditorCamera.readViewBox()
    }));
    await page.click("[data-touch-action='zoom-in']");
    const selectedZoomAfter = await page.evaluate(() => ({
      geometry: structuredClone(window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry),
      viewBox: window.krokiEditorCamera.readViewBox()
    }));
    assert.deepEqual(selectedZoomAfter.geometry, selectedZoomBefore.geometry, "zoom must not transform the selected object");
    closeTo(
      selectedZoomAfter.viewBox.x + selectedZoomAfter.viewBox.width / 2,
      selectedZoomBefore.viewBox.x + selectedZoomBefore.viewBox.width / 2,
      1e-7,
      "selected-state zoom center x changed"
    );
    closeTo(
      selectedZoomAfter.viewBox.y + selectedZoomAfter.viewBox.height / 2,
      selectedZoomBefore.viewBox.y + selectedZoomBefore.viewBox.height / 2,
      1e-7,
      "selected-state zoom center y changed"
    );
    await page.click("[data-touch-action='zoom-out']");

    await page.evaluate(() => {
      window.Kroki.SelectionManager.promoteToEdit();
      window.Kroki.HistoryManager.clear();
    });
    const editBeforeY = await page.evaluate(() => window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.y);
    await page.click("[data-touch-action='move-down']");
    const editMoved = await page.evaluate(() => ({
      y: window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.y,
      mode: window.Kroki.SelectionManager.getMode()
    }));
    closeTo(editMoved.y, editBeforeY + 1, 1e-8, "edit-mode object did not move exactly one unit");
    assert.equal(editMoved.mode, "edit", "precision move must preserve edit mode");
    await page.evaluate(() => window.Kroki.HistoryManager.undo());

    await page.evaluate(() => window.Kroki.HistoryManager.clear());
    const holdBefore = await page.evaluate(() => window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.x);
    const rightButton = await page.locator("[data-touch-action='move-right']").boundingBox();
    await page.mouse.move(rightButton.x + rightButton.width / 2, rightButton.y + rightButton.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(540);
    await page.mouse.up();
    const holdAfter = await page.evaluate(() => ({
      x: window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.x,
      historySize: window.Kroki.HistoryManager.size()
    }));
    assert.ok(holdAfter.x - holdBefore >= 3, "long press must repeat movement");
    assert.ok(Number.isInteger(holdAfter.x - holdBefore), "long press must repeat in exact one-unit steps");
    assert.equal(holdAfter.historySize.undo, 1, "one long press must create one undo record");
    await page.evaluate(() => window.Kroki.HistoryManager.undo());
    closeTo(
      await page.evaluate(() => window.Kroki.EditorObjectManager.get("touch-control-test-line").geometry.start.x),
      holdBefore,
      1e-8,
      "long-press undo did not restore the starting position"
    );

    await page.click("#btnTouchControlOpacity");
    assert.equal(await page.locator("#btnTouchControlOpacity").getAttribute("data-opacity"), "0.75");
    await page.click("#btnTouchControlCollapse");
    assert.equal(await page.locator("#touchControlPanel").isHidden(), true);
    assert.equal(await page.locator("#btnTouchControlRestore").isVisible(), true);
    await page.click("#btnTouchControlRestore");
    assert.equal(await page.locator("#touchControlPanel").isVisible(), true);
    assert.equal(await page.locator("#btnTouchControlRestore").isHidden(), true);

    assert.deepEqual(errors, [], "browser errors");
    console.log("PASS: touch panel placement, 1-unit scene/object movement, centered 1-point zoom, long press/undo, opacity and collapse/restore.");
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.close());
