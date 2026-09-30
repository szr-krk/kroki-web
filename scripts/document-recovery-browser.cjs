// Real IndexedDB regression: crash recovery, photo reuse, rollback and low-end CPU scheduling.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const server = http.createServer((req, res) => {
  const file = path.resolve(root, decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(1) || "index.html");
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, body) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream" }).end(body);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 800, height: 1000 } });
  const errors = [];
  context.on("page", p => p.on("pageerror", error => errors.push(error.message)));
  let page = await context.newPage();
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    // Seed the existing database version to exercise migration without losing saved documents.
    await page.route("**/index.html", route => route.fulfill({ body: "<html></html>", contentType: "text/html" }));
    await page.goto(`${url}/index.html`);
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("krokiPro.documents.v1", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("documents", { keyPath: "key" }).createIndex("kind", "kind");
        request.result.createObjectStore("assets", { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put({ key: "recent:existing", kind: "recent", entry: { id: "existing", name: "Existing", document: { schemaVersion: 1, objects: [] } } });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
      request.onerror = () => reject(request.error);
    }));
    await page.unroute("**/index.html");
    await page.goto(url);
    assert.equal(await page.evaluate(async () => (await Kroki.DocumentStorage.get("recent", "existing")).name), "Existing");
    await page.click("#btnYeniKroki");
    await page.evaluate(() => {
      window.addLine = id => Kroki.EditorObjectManager.add({ id, type: "line", geometry: { start: { x: 100, y: 100 }, end: { x: 200, y: 200 } } });
      window.exports = 0;
      const original = Kroki.DocumentSerializer.exportDocument;
      Kroki.DocumentSerializer.exportDocument = (...args) => { window.exports++; return original(...args); };
      addLine("first");
    });
    await page.waitForFunction(async () => (await Kroki.DocumentStorage.listRecovery()).length === 1);
    await page.waitForFunction(() => window.exports > 0);
    const beforeIdle = await page.evaluate(() => window.exports);
    await page.waitForTimeout(2200);
    assert.equal(await page.evaluate(() => window.exports), beforeIdle, "Idle documents must not be serialized periodically");
    await page.evaluate(() => {
      Kroki.PhotoBackgroundManager.set({ dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", naturalWidth: 1, naturalHeight: 1, bounds: { x: 0, y: 0, width: 100, height: 100 } });
      Kroki.DocumentRecovery.markDirty();
    });
    await page.evaluate(() => Kroki.DocumentRecovery.flush());
    await page.evaluate(() => { addLine("second"); return Kroki.DocumentRecovery.flush(); });
    const records = await page.evaluate(() => Kroki.DocumentStorage.listRecovery());
    assert.equal(records.length, 2);
    assert.equal(records[0].document.objects.length, 2);
    assert.equal(records[0].photoKey, records[1].photoKey, "Unchanged photo must reuse asset");
    assert.equal(records[0].document.photoBackground.dataUrl, "");
    assert.equal("undoStack" in records[0], false);
    // Held gestures never serialize recovery; completed edits batch into one snapshot.
    await page.evaluate(() => {
      document.querySelector("#editorCanvas").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 42 }));
      for (let i = 0; i < 50; i++) Kroki.DocumentRecovery.markDirty();
      window.beforeGesture = window.exports;
    });
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => window.exports), await page.evaluate(() => window.beforeGesture));
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 42 })));
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => window.exports), await page.evaluate(() => window.beforeGesture + 1));
    // Failed writes preserve the previous two committed records; the next attempt succeeds.
    await page.evaluate(async () => {
      const original = Kroki.DocumentStorage.putRecovery;
      Kroki.DocumentStorage.putRecovery = () => Promise.reject(new Error("simulated-quota"));
      addLine("third");
      await Kroki.DocumentRecovery.flush();
      Kroki.DocumentStorage.putRecovery = original;
    });
    assert.equal((await page.evaluate(() => Kroki.DocumentStorage.listRecovery()))[0].document.objects.length, 2);
    await page.evaluate(async () => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const result = original.apply(this, args);
        if (this.name === "recoverySnapshots") this.transaction.abort();
        return result;
      };
      try { await Kroki.DocumentRecovery.flush(); }
      finally { IDBObjectStore.prototype.put = original; }
    });
    assert.equal((await page.evaluate(() => Kroki.DocumentStorage.listRecovery()))[0].document.objects.length, 2, "Aborted transaction must retain committed snapshot");
    await page.evaluate(() => Kroki.DocumentRecovery.flush());
    const other = await context.newPage();
    await other.goto(url);
    await other.waitForTimeout(300);
    assert.equal(await other.locator(".recovery-card").count(), 0, "Live tabs must not appear as crashed sessions");
    await other.close();
    await page.evaluate(async () => {
      Kroki.DocumentRecovery.markDirty();
      await Kroki.DocumentRecovery.flush();
      const latest = (await Kroki.DocumentStorage.listRecovery())[0];
      latest.document.schemaVersion = 99;
      await Kroki.DocumentStorage.putRecovery(latest, null);
    });
    // Kill the renderer without pagehide, then reopen the same browser storage.
    const cdp = await context.newCDPSession(page);
    const crashed = page.waitForEvent("crash");
    void cdp.send("Page.crash").catch(() => {});
    await crashed;
    await page.close().catch(() => {});
    page = await context.newPage();
    await page.goto(url);
    await page.locator(".recovery-card").waitFor();
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "recovery-tablet.png") });
    await page.locator(".recovery-row button").first().click();
    await page.waitForFunction(() => Kroki.EditorObjectManager.getAll().length === 3);
    assert.equal(await page.evaluate(() => Kroki.EditorObjectManager.getAll().length), 3);
    assert.equal(await page.evaluate(() => Kroki.PhotoBackgroundManager.has()), true);
    assert.deepEqual(await page.evaluate(() => Kroki.HistoryManager.size()), { undo: 0, redo: 0 });
    await page.evaluate(() => Kroki.DocumentRecovery.flush());
    assert.equal(new Set((await page.evaluate(() => Kroki.DocumentStorage.listRecovery())).map(r => r.session)).size, 1);
    // Snapshot cost under 6x CPU slowdown, without thumbnails or undo captures.
    const throttled = await context.newCDPSession(page);
    await throttled.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const timing = await page.evaluate(async () => {
      for (let i = 0; i < 300; i++) Kroki.EditorObjectManager.add({ id: `perf-${i}`, type: "line", geometry: { start: { x: i, y: 0 }, end: { x: i, y: 200 } } }, { skipHistory: true });
      Kroki.DocumentRecovery.markDirty();
      const original = Kroki.DocumentSerializer.exportDocument;
      let captureMs = 0;
      Kroki.DocumentSerializer.exportDocument = (...args) => { const start = performance.now(); const result = original(...args); captureMs = performance.now() - start; return result; };
      const start = performance.now();
      await Kroki.DocumentRecovery.flush();
      return { objects: Kroki.EditorObjectManager.getAll().length, captureMs, saveMs: performance.now() - start };
    });
    console.log(JSON.stringify(timing));
    await throttled.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    // Clearing while a write is in flight must never resurrect discarded content.
    await page.evaluate(async () => {
      Kroki.DocumentRecovery.markDirty();
      const write = Kroki.DocumentRecovery.flush();
      KrokiMainMenu.resetDocument();
      await write;
    });
    await page.waitForFunction(async () => (await Kroki.DocumentStorage.listRecovery()).length === 0);
    assert.deepEqual(errors, [], "Browser errors");
    console.log("PASS: v1 migration, idle/gesture batching, two snapshots, photo reuse, write failure/abort, live tabs, renderer crash, previous snapshot fallback, recovery without undo, discard/write race.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
