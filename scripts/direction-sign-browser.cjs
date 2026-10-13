// Run with Playwright available through NODE_PATH; optional TEST_BASE_URL tests Pages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", "direction-signs");
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, body) => {
    if (error) return res.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ttf": "font/ttf" };
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }).end(body);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/?verify=20261014-direction-signs`);
    await page.click("#btnYeniKroki");
    await page.click("#btnLevhaEkle");
    await page.fill("#trafficSignSearch", "B-5a kavşak");
    await page.waitForFunction(() => document.querySelectorAll("#trafficSignGrid .traffic-sign-tile").length === 3);
    const titles = await page.locator("#trafficSignGrid .traffic-sign-tile").evaluateAll(items => items.map(item => item.title));
    titles.forEach((title, i) => assert.ok(title.endsWith(` ${i + 1}`), title));
    await page.locator("#trafficSignGrid .traffic-sign-tile").first().click();
    await page.click("#btnTrafficSignAdd");
    await page.evaluate(() => document.fonts.load('400 100px "KrokiSignNarrow"'));
    await page.click("#btnLineText");
    const input = page.locator('[data-traffic-sign-field-input="message"]');
    await input.fill("KAHRAMANMARAŞ");
    await input.press("Tab");
    const edited = await page.evaluate(() => {
      const K = window.Kroki, m = K.EditorObjectManager, a = K.ShapeRegistry.get("trafficSign");
      const model = m.getAll().find(x => x.type === "trafficSign");
      return { id: model.id, text: a.editableTextFields(model)[0].value, width: a.getBounds(model).width };
    });
    assert.equal(edited.text, "KAHRAMANMARAŞ");
    await page.evaluate(() => window.Kroki.HistoryManager.undo());
    assert.equal(await page.evaluate(id => window.Kroki.EditorObjectManager.get(id).metadata.signTextFields.message, edited.id), "MERKEZ");
    await page.evaluate(() => window.Kroki.HistoryManager.redo());
    assert.equal(await page.evaluate(id => window.Kroki.EditorObjectManager.get(id).metadata.signTextFields.message, edited.id), "KAHRAMANMARAŞ");

    const results = await page.evaluate(() => {
      const K = window.Kroki, m = K.EditorObjectManager, a = K.ShapeRegistry.get("trafficSign");
      const check = (ok, message) => { if (!ok) throw new Error(message); };
      const near = (x, y, message, epsilon = 3) => check(Math.abs(x - y) <= epsilon, `${message}: ${x} vs ${y}`);
      K.SelectionManager.clear();
      m.getAll().forEach(model => m.remove(model.id, { skipHistory: true }));
      const signs = K.TrafficSignCatalog.all().filter(sign => sign.code === "B-5a");
      check(signs.length === 3, "three catalog entries");
      const results = [];
      const set = (id, text) => m.updateModel(id, draft => a.updateEditableTextField(draft, "message", text), { skipHistory: true });
      for (const [index, sign] of signs.entries()) {
        const model = m.create("trafficSign", { sign, center: { x: 600, y: 190 + 210 * index }, scale: 0.06 }, { skipHistory: true });
        const id = model.id;
        const node = () => m.getElement(id);
        const arrowPath = node().querySelector('[data-sign-part="arrow"]').getAttribute("d");
        const fontSize = node().querySelector("text").getAttribute("font-size");
        const height = a.getBounds(model).height;
        const widths = {};
        for (const text of ["İL", "WWW", "III", "MERKEZ", "KAHRAMANMARAŞ", "ÇIĞ ŞÜ İÖ", "W".repeat(120), "", "<svg onload=alert(1)>"]) {
          set(id, text);
          const el = node(), message = el.querySelector("text");
          // SVG text getBBox includes side bearings. Measure visible ink independently
          // with the browser's loaded font, rather than the generated metric table.
          const ctx = document.createElement("canvas").getContext("2d");
          ctx.font = `${message.getAttribute("font-size")}px KrokiSignNarrow`;
          ctx.fontKerning = "none";
          let cursor = Number(message.getAttribute("x")), left = Infinity, right = -Infinity;
          for (const char of Array.from(text)) {
            const glyph = ctx.measureText(char);
            if (glyph.actualBoundingBoxLeft + glyph.actualBoundingBoxRight > 0) {
              left = Math.min(left, cursor - glyph.actualBoundingBoxLeft);
              right = Math.max(right, cursor + glyph.actualBoundingBoxRight);
            }
            cursor += glyph.width + Number(message.getAttribute("letter-spacing"));
          }
          const box = { x: left, width: right - left };
          const board = el.querySelector('[data-sign-part="board"]');
          const arrow = el.querySelector('[data-sign-part="arrow"]');
          const bounds = a.getBounds(m.get(id));
          widths[text] = bounds.width;
          near(bounds.height, height, "height invariant", 0.001);
          near(bounds.width, Number(board.getAttribute("width")) * m.get(id).geometry.scale, "bounds track board", 0.001);
          check(message.textContent === text, "literal text preserved");
          check(!message.hasAttribute("textLength"), "letters must not be squeezed");
          check(message.getAttribute("font-size") === fontSize, "fixed font size");
          check(arrow.getAttribute("d") === arrowPath, "arrow shape unchanged");
          check(!el.querySelector("svg"), "text cannot insert SVG markup");
          if (text && !text.includes("<")) {
            const transform = arrow.transform.baseVal.consolidate().matrix;
            const arrowBox = arrow.getBBox();
            if (index < 2) {
              near(box.x - (transform.e + arrowBox.x + arrowBox.width), 400, `arrow to text gap (${index}, ${text})`, 20);
              near(Number(board.getAttribute("width")) - box.x - box.width, 600, "right text margin", 20);
            } else {
              near(box.x, 600, "left text margin", 20);
              near(transform.e + arrowBox.x - box.x - box.width, 400, "text to arrow gap", 20);
            }
          }
          check(a.hitTest(m.get(id), { x: bounds.x + bounds.width - 1, y: m.get(id).geometry.cy }, 0), "wide edge hit");
          check(!a.hitTest(m.get(id), { x: bounds.x + bounds.width + 10, y: m.get(id).geometry.cy }, 0), "outside edge miss");
        }
        check(widths.WWW > widths.III, "real glyph widths, not character count");
        check(widths.KAHRAMANMARAŞ > widths.MERKEZ && widths.MERKEZ > widths.İL && widths.İL > widths[""], "growth and shrink");
        set(id, ["MERKEZ", "KAHRAMANMARAŞ", "İSTANBUL"][index]);
        const before = a.getBounds(m.get(id));
        const copy = m.clone(id, { skipHistory: true });
        near(a.getBounds(copy).width, before.width, "copy width", 0.001);
        m.remove(copy.id, { skipHistory: true });
        m.updateGeometry(id, draft => { draft.geometry.rotation = 90; }, { skipHistory: true });
        near(a.getBounds(m.get(id)).height, before.width, "rotated bounds", 0.001);
        m.updateGeometry(id, draft => { draft.geometry.rotation = 0; }, { skipHistory: true });
        const stableArt = node().firstElementChild;
        for (let i = 0; i < 30; i++) m.updateGeometry(id, draft => { draft.geometry.cx = 600 + i; }, { skipHistory: true });
        check(node().firstElementChild === stableArt, "moving must reuse art");
        m.updateGeometry(id, draft => { draft.geometry.cx = 600; }, { skipHistory: true });
        results.push({ id, direction: sign.layout.direction, width: before.width, textCases: Object.keys(widths).length });
      }
      const json = K.DocumentSerializer.toJson();
      const originalWidths = results.map(({ id }) => a.getBounds(m.get(id)).width);
      check(K.DocumentSerializer.fromJson(json).ok, "document roundtrip");
      results.forEach(({ id }, i) => near(a.getBounds(m.get(id)).width, originalWidths[i], "roundtrip width", 0.001));
      // Metadata still carries the layout and art when a saved catalog key is unavailable.
      const fallback = m.get(results[0].id);
      m.updateModel(fallback.id, draft => { draft.metadata.signKey = "saved-sign-without-catalog"; return draft; }, { skipHistory: true });
      near(a.getBounds(m.get(fallback.id)).width, originalWidths[0], "metadata fallback", 0.001);
      check(m.getElement(fallback.id).querySelector("text").textContent === "MERKEZ", "fallback text");
      K.SelectionManager.clear();
      window.krokiEditorCamera.writeViewBox(m.canvas, { x: 0, y: 0, width: 1200, height: 800 });
      return results;
    });
    await page.locator("#editorCanvas").screenshot({ path: path.join(output, "three-signs.png") });
    await page.click("#btnEditorMenu");
    const downloadPromise = page.waitForEvent("download");
    await page.click('[data-menu-action="export-svg"]');
    const download = await downloadPromise;
    const exportPath = path.join(output, "direction-signs.svg");
    await download.saveAs(exportPath);
    const exported = fs.readFileSync(exportPath, "utf8");
    assert.ok(exported.includes("KAHRAMANMARAŞ"));
    assert.ok(exported.includes("data:font/ttf;base64,"), "font embedded in export");
    const roundtrip = page.evaluate(svg => window.KrokiMainMenu.importKrokiSvgText(svg), exported);
    await page.locator(".kroki-dialog-btn.primary").click();
    await roundtrip;
    await page.evaluate(() => {
      const models = window.Kroki.EditorObjectManager.getAll().filter(m => m.type === "trafficSign");
      if (models.length !== 3 || !models.every(m => m.metadata.signLayout)) throw new Error("SVG import lost dynamic layout");
    });
    // Touch layout keeps text fields usable on a tablet.
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.evaluate(() => window.Kroki.SelectionManager.edit(window.Kroki.EditorObjectManager.getAll()[1].id));
    if (!(await input.isVisible())) await page.click("#btnLineText");
    await input.fill("ŞANLIURFA");
    await input.press("Tab");
    await page.screenshot({ path: path.join(output, "tablet.png") });
    assert.deepEqual(errors, [], "page errors");
    console.log(JSON.stringify({ base, titles, results }, null, 2));
    console.log("PASS: library and editable UI; natural widths, margins, long/empty/Turkish text, arrows, hit tests, rotation, copy, drag reuse, undo/redo, JSON and SVG roundtrip, font export, tablet.");
  } catch (error) {
    await page.screenshot({ path: path.join(output, "failure.png") });
    console.error("Diagnostics", JSON.stringify(await page.evaluate(() => ({
      signs: window.Kroki?.TrafficSignCatalog?.all().filter(sign => sign.code === "B-5a").map(sign => sign.name),
      search: document.querySelector("#trafficSignSearch")?.value,
      tiles: Array.from(document.querySelectorAll("#trafficSignGrid .traffic-sign-tile")).map(el => el.title)
    }))), errors);
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
