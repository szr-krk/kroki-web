// Run with Playwright available through NODE_PATH; optional TEST_BASE_URL tests Pages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", "information-signs");
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(`${process.env.TEST_BASE_URL || `http://127.0.0.1:${server.address().port}`}/?verify=information-v7`);
    await page.click("#btnYeniKroki");
    await page.evaluate(() => document.fonts.load('400 100px "KrokiSignNarrow"'));
    const result = await page.evaluate(() => {
      const K = window.Kroki, m = K.EditorObjectManager, a = K.ShapeRegistry.get("trafficSign");
      const signs = K.TrafficSignCatalog.all().filter(s => s.layout?.family === "information-v1");
      const check = (ok, message) => { if (!ok) throw new Error(message); };
      check(signs.length === 13, "Exactly 13 variants");
      const expected = { village: 2, villageArrow: 2, airport: 0, airportArrow: 0, camp: 1, country: 0, province: 1, town: 1, townEnd: 1, region: 1, branch: 1, maintenance: 2, construction: 4 };
      const previews = [];
      signs.forEach((sign, i) => {
        const profile = sign.layout.profile, model = m.create("trafficSign", { sign, center: { x: 200 + i % 3 * 350, y: 150 + Math.floor(i / 3) * 180 } }, { skipHistory: true });
        const id = model.id, get = () => m.get(id), el = () => m.getElement(id);
        const set = (field, value) => m.updateModel(id, draft => { a.updateEditableTextField(draft, field, value); return draft; }, { skipHistory: true });
        check(a.editableTextFields(get()).length === expected[profile], `${profile} editable fields`);
        const width = a.getBounds(get()).width, textCount = el().querySelectorAll("text").length;
        if (profile.startsWith("village")) {
          set("distance", ""); const blank = a.getBounds(get()).width;
          check(blank < width - 10, `${profile} empty distance removes gap`);
          set("distance", "13"); check(a.getBounds(get()).width > blank, "distance restores width");
          set("name", "Büyükavşar");
        }
        if (profile === "province") {
          set("name", "VAN"); check(Math.abs(a.getBounds(get()).width - width) < .001, "province minimum width");
          set("name", "ÇOK UZUN BİR İL ADI"); check(a.getBounds(get()).width > width, "province expands");
          check(el().textContent.includes("İl sınırı"), "province suffix locked"); set("name", "KAHRAMANMARAŞ");
        }
        if (profile === "townEnd" || profile === "town") {
          set("name", "KAHRAMANMARAŞ"); check(a.getBounds(get()).width > width, "town expands");
          if (profile === "townEnd") {
            const parts = [...el().querySelectorAll("[data-information-part]")];
            const red = parts.find(x => x.getAttribute("fill") === "#ee252c"), text = parts.find(x => x.tagName === "text");
            check(parts.indexOf(red) < parts.indexOf(text), "stripe behind text");
            const before = red.getAttribute("d"); set("name", "VAN");
            check(el().querySelector('[fill="#ee252c"]').getAttribute("d") !== before, "stripe follows width");
            set("name", "KAHRAMANMARAŞ");
          }
        }
        if (["camp", "region", "branch", "maintenance", "construction"].includes(profile)) {
          a.editableTextFields(get()).forEach(f => set(f.id, f.type === "number" ? "12345678" : "ÇIĞ ŞÜ İÖ W".repeat(12)));
          check(Math.abs(a.getBounds(get()).width - width) < .001, `${profile} fixed width`);
          check(el().querySelectorAll("text").length === textCount, "fixed line count");
          const nativeWidth = sign.width / (100 / 20);
          el().querySelectorAll("text").forEach(t => {
            const box = t.getBBox(); check(box.x >= 0 && box.x + box.width <= nativeWidth + 25, `${profile}: long text inside board`);
          });
          a.editableTextFields(get()).forEach(f => set(f.id, ""));
          check(el().querySelectorAll("text").length === textCount, "empty lines preserved");
          const defaults = a.editableTextFields(model); defaults.forEach(f => set(f.id, f.value));
        }
        const art = el().querySelector("[data-information-root]");
        m.updateGeometry(id, draft => { draft.geometry.cx += 10; return draft; }, { skipHistory: true });
        check(el().querySelector("[data-information-root]") === art, "drag reuses art");
        const copy = m.clone(id); check(a.editableTextFields(copy).length === expected[profile], "copy fields"); m.remove(copy.id);
        const resolved = K.TrafficSignLayout.resolve(sign, get());
        previews.push({ name: sign.name, viewBox: resolved.viewBox, art: art.outerHTML });
      });
      const json = K.DocumentSerializer.toJson(); check(K.DocumentSerializer.fromJson(json).ok, "JSON reload");
      check(m.getAll().filter(x => x.type === "trafficSign").length === 13, "JSON count");
      return previews;
    });
    await page.click("#btnEditorMenu");
    const downloadPromise = page.waitForEvent("download");
    await page.click('[data-menu-action="export-svg"]');
    const download = await downloadPromise, target = path.join(output, "information-signs.svg");
    await download.saveAs(target);
    const svg = fs.readFileSync(target, "utf8");
    assert.ok(svg.includes("data:font/ttf;base64,"));
    const pending = page.evaluate(text => window.KrokiMainMenu.importKrokiSvgText(text), svg);
    await page.locator(".kroki-dialog-btn.primary").click(); await pending;
    assert.equal(await page.evaluate(() => window.Kroki.EditorObjectManager.getAll().filter(x => x.type === "trafficSign").length), 13);
    // Full-size contact sheet for comparing actual rendered art with the PDFs.
    await page.evaluate(items => {
      const board = document.createElement("div"); board.id = "sign-review";
      Object.assign(board.style, { position: "fixed", inset: "0", zIndex: "999999", background: "#eee", overflow: "auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", padding: "18px", gap: "18px" });
      for (const item of items) {
        const tile = document.createElement("div"); tile.style.cssText = "background:white;padding:12px;height:220px;font:12px Arial";
        const label = document.createElement("div"); label.textContent = item.name; tile.append(label);
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", item.viewBox); s.style.cssText = "width:100%;height:190px"; s.innerHTML = item.art; tile.append(s); board.append(tile);
      } document.body.append(board);
    }, result);
    await page.setViewportSize({ width: 1600, height: 1350 });
    await page.screenshot({ path: path.join(output, "preview.png") });
    assert.deepEqual(errors, []);
    console.log("PASS: 13 signs; optional distance, minimum/variable width, locked labels, fixed rows, long/empty text, stripe behind text, drag reuse, clone, JSON/SVG and embedded font.");
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

