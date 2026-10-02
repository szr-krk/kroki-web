const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "outputs");
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, body) => {
    if (error) return res.writeHead(404).end();
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }).end(body);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/kilavuz.html?verify=20261002`);
      await page.evaluate(() => document.fonts.ready);
      const check = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        brokenAnchors: Array.from(document.querySelectorAll('a[href^="#"]')).filter(a => !document.getElementById(a.hash.slice(1))).map(a => a.hash),
        missingIcons: Array.from(document.querySelectorAll('use[href^="#"]')).filter(e => !document.getElementById(e.getAttribute("href").slice(1))).length,
        sections: document.querySelectorAll("main section").length,
        text: document.body.innerText
      }));
      assert.equal(check.overflow, false, `Guide overflow at ${viewport.width}`);
      assert.deepEqual(check.brokenAnchors, []);
      assert.equal(check.missingIcons, 0);
      assert.equal(check.sections, 11);
      assert.match(check.text, /Yeni çizginin kalınlığı 2/);
      assert.match(check.text, /Çizimi Kurtar/);
      await page.locator('summary').first().click();
      assert.equal(await page.locator('details').first().getAttribute('open'), "");
      await page.screenshot({ path: path.join(output, `guide-${viewport.width}.png`), fullPage: false });
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator('#btnPrintGuide').isVisible(), false);
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1180, height: 850 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/?verify=20261002-guide`);
    await page.click('#btnKlavuz');
    await page.frameLocator('#homeGuideFrame').locator('#fotograf-kurtarma').waitFor();
    await page.locator('#homeGuideModal button').first().click();
    await page.click('#btnYeniKroki');
    const result = await page.evaluate(() => {
      const K = window.Kroki, m = K.EditorObjectManager, hits = K.HitTestManager;
      const types = ['line','arc','bezier','circle','ellipse','rectangle','closedShape','callout','road','barrier'];
      for (const type of types) {
        const style = K.StyleManager.normalizeStyle(undefined, type);
        if (style.strokeWidth !== 2 || style.lineCap !== 'butt') throw new Error(`Default mismatch: ${type}`);
        const custom = K.StyleManager.normalizeStyle({strokeWidth:100,lineCap:'round'}, type);
        if (custom.strokeWidth !== 100 || custom.lineCap !== 'round') throw new Error(`Custom setting lost: ${type}`);
      }
      const rect = m.add({id:'paver-regression',type:'rectangle',geometry:{cx:616.3481569601867,cy:120.50183768995218,rx:630.3936675519772,ry:22.97410372887606,rotation:-26.942578823329725},style:{fill:'#d6d4ce',fillPattern:'paverTexture',strokeOpacity:0}});
      const line = m.add({id:'thick-regression',type:'line',geometry:{start:{x:400,y:400},end:{x:1260,y:400}},style:{strokeWidth:100,lineCap:'butt'}});
      function verify() {
        for (const x of [-600,-400,0,400,600]) {
          const p = K.RectangleGeometry.localPoint(m.get(rect.id).geometry,x,0);
          if (hits.hitTest(p)?.model.id !== rect.id) throw new Error(`Paver hit failed at ${x}`);
        }
        for (const y of [350,351,375,400,425,449,450]) {
          if (hits.hitTest({x:800,y})?.model.id !== line.id) throw new Error(`Thick line hit failed at ${y}`);
        }
      }
      verify();
      for (let i=0;i<100;i++) m.add({id:`offscreen-${i}`,type:'line',geometry:{start:{x:10000+i*500,y:10000},end:{x:10200+i*500,y:10000}}},{skipHistory:true});
      verify();
      const serialized = K.DocumentSerializer.toJson();
      const imported = K.DocumentSerializer.fromJson(serialized);
      if (!imported.ok) throw new Error('Document roundtrip failed');
      verify();
      const start = performance.now();
      for(let i=0;i<3000;i++) hits.hitTest({x:800,y:350+(i%100)});
      return { defaults:types.length,objects:m.getAll().length,queries:3000,hitTestMs:performance.now()-start };
    });
    assert.deepEqual(errors, [], "Browser errors");
    console.log(JSON.stringify(result));
    console.log("PASS: guide desktop/tablet/mobile, anchors/icons/FAQ/print/embedded opening; defaults/custom styles, patterned and thick hits, spatial index, document roundtrip, 3000 hit queries.");
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
