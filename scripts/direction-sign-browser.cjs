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
    await page.waitForFunction(() => document.querySelectorAll("#trafficSignGrid .traffic-sign-tile").length === 8);
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

    await page.evaluate(() => window.Kroki.SelectionManager.clear());
    await page.click("#btnLevhaEkle");
    await page.locator("#trafficSignGrid .traffic-sign-tile").nth(3).click();
    await page.click("#btnTrafficSignAdd");
    const firstMessage = page.locator('[data-traffic-sign-field-input="message1"]');
    const secondMessage = page.locator('[data-traffic-sign-field-input="message2"]');
    if (!(await firstMessage.isVisible())) await page.click("#btnLineText");
    await firstMessage.fill("ANKARA");
    await secondMessage.fill("KAHRAMANMARAŞ");
    await secondMessage.press("Tab");
    await page.evaluate(() => {
      const K = window.Kroki, model = K.EditorObjectManager.getAll().at(-1);
      if (model.geometry.scale !== 0.02) throw new Error("New signs must be inserted at half the previous 0.04 scale");
      if (model.metadata.signTextFields.message1 !== "ANKARA" || model.metadata.signTextFields.message2 !== "KAHRAMANMARAŞ") throw new Error("Independent fields lost");
      K.HistoryManager.undo();
      const restored = K.EditorObjectManager.get(model.id).metadata.signTextFields;
      if (restored.message1 !== "ANKARA" || restored.message2 !== "HASTANE") throw new Error("Second-row undo affected first row");
      K.HistoryManager.redo();
    });

    for (const index of [6, 7]) {
      await page.evaluate(() => window.Kroki.SelectionManager.clear());
      await page.click("#btnLevhaEkle");
      await page.locator("#trafficSignGrid .traffic-sign-tile").nth(index).click();
      await page.click("#btnTrafficSignAdd");
      const field = index === 6 ? input : firstMessage;
      if (!(await field.isVisible())) await page.click("#btnLineText");
      await field.fill("ŞANLIURFA");
      await field.press("Tab");
      if (index === 7) { await secondMessage.fill("GAZİANTEP"); await secondMessage.press("Tab"); }
      assert.equal(await page.locator("[data-traffic-sign-field-input]").count(), index === 6 ? 1 : 2);
    }
    await page.evaluate(() => window.Kroki.SelectionManager.clear());
    await page.click("#btnLevhaEkle");
    await page.fill("#trafficSignSearch", "şehir merkezi");
    await page.locator('#trafficSignGrid [data-sign-key="3-bilgi-levhalari/sehir-merkezi-levhasi"]').click();
    await page.click("#btnTrafficSignAdd");
    assert.equal(await page.locator("#btnLineText").isVisible(), false, "fixed city sign has no text editor");
    await page.evaluate(() => window.Kroki.SelectionManager.clear());
    await page.click("#btnLevhaEkle");
    await page.fill("#trafficSignSearch", "B-5b");
    await page.locator('#trafficSignGrid [data-sign-key="3-bilgi-levhalari/b-5b-kavsak-ici-yon-levhasi-turistik-mahal"]').click();
    await page.click("#btnTrafficSignAdd");
    if (!(await firstMessage.isVisible())) await page.click("#btnLineText");
    await firstMessage.fill("Efes"); await secondMessage.fill("(Antik Kent)");
    const distanceInput = page.locator('[data-traffic-sign-field-input="distance"]');
    await distanceInput.fill("12"); await distanceInput.press("Tab");
    await page.evaluate(() => {
      const K = window.Kroki, id = K.EditorObjectManager.getAll().at(-1).id;
      K.HistoryManager.undo();
      const fields = K.EditorObjectManager.get(id).metadata.signTextFields;
      if (fields.message1 !== "Efes" || fields.message2 !== "(Antik Kent)" || fields.distance !== "4") throw new Error("Tourist field undo is not independent");
      K.HistoryManager.redo();
    });
    await page.evaluate(() => window.Kroki.SelectionManager.clear());
    await page.click("#btnLevhaEkle");
    await page.fill("#trafficSignSearch", "B-5c");
    await page.locator('#trafficSignGrid [data-sign-key="3-bilgi-levhalari/b-5c-kavsak-ici-yon-levhasi-metro"]').click();
    await page.click("#btnTrafficSignAdd");
    assert.equal(await page.locator("#btnLineText").isVisible(), false, "fixed Metro sign has no text editor");

    const results = await page.evaluate(() => {
      const K = window.Kroki, m = K.EditorObjectManager, a = K.ShapeRegistry.get("trafficSign");
      const check = (ok, message) => { if (!ok) throw new Error(message); };
      const near = (x, y, message, epsilon = 3) => check(Math.abs(x - y) <= epsilon, `${message}: ${x} vs ${y}`);
      K.SelectionManager.clear();
      m.getAll().forEach(model => m.remove(model.id, { skipHistory: true }));
      const signs = K.TrafficSignCatalog.all().filter(sign => sign.code === "B-5a");
      check(signs.length === 8, "eight B-5a catalog entries");
      for (const sign of signs) {
        const inserted = m.create("trafficSign", { sign }, { skipHistory: true });
        near(inserted.geometry.scale, 0.02, "half-sized insertion", 0.000001);
        const freshBounds = a.getBounds(inserted);
        // A document saved before this release must retain its explicit 0.04 scale.
        const oldSaved = a.clone(inserted);
        oldSaved.id = `${inserted.id}-old`;
        oldSaved.geometry.scale = 0.04;
        oldSaved.metadata.signBaseScale = 0.04;
        const old = m.add(oldSaved, { skipHistory: true });
        near(a.getBounds(old).width, freshBounds.width * 2, "existing document size preserved", 0.001);
        near(a.getBounds(old).height, freshBounds.height * 2, "existing document height preserved", 0.001);
        m.remove(inserted.id, { skipHistory: true }); m.remove(old.id, { skipHistory: true });
      }
      const results = [];
      const set = (id, text) => m.updateModel(id, draft => a.updateEditableTextField(draft, "message", text), { skipHistory: true });
      for (const [index, sign] of signs.slice(0, 3).entries()) {
        const model = m.create("trafficSign", { sign, center: { x: 320, y: 190 + 210 * index }, scale: 0.03 }, { skipHistory: true });
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
        m.updateGeometry(id, draft => { draft.geometry.cx = 320; }, { skipHistory: true });
        results.push({ id, direction: sign.layout.direction, width: before.width, textCases: Object.keys(widths).length });
      }
      for (const [index, sign] of signs.slice(3, 6).entries()) {
        const model = m.create("trafficSign", { sign, center: { x: 870, y: 190 + 210 * index }, scale: 0.03 }, { skipHistory: true });
        const id = model.id;
        const update = (first, second) => m.updateModel(id, draft => {
          a.updateEditableTextField(draft, "message1", first);
          a.updateEditableTextField(draft, "message2", second);
          return draft;
        }, { skipHistory: true });
        const initialHeight = a.getBounds(model).height;
        const arrowPath = m.getElement(id).querySelector('[data-sign-part="arrow"]').getAttribute("d");
        const widths = [];
        for (const pair of [["İL", "KAHRAMANMARAŞ"], ["KAHRAMANMARAŞ", "İL"], ["WWW", "III"], ["III", "WWW"], ["ÇIĞ ŞÜ İÖ", "İSTANBUL"], ["", ""], ["W".repeat(120), "MERKEZ"], ["MERKEZ", "W".repeat(120)]]) {
          update(...pair);
          const el = m.getElement(id), texts = Array.from(el.querySelectorAll("text"));
          check(texts.length === 2 && texts.every((text, row) => text.textContent === pair[row]), "two independent rows");
          check(texts.every(text => !text.hasAttribute("textLength")), "double rows never squeezed");
          const metrics = texts.map(text => {
            const ctx = document.createElement("canvas").getContext("2d");
            ctx.font = `${text.getAttribute("font-size")}px KrokiSignNarrow`; ctx.fontKerning = "none";
            let cursor = Number(text.getAttribute("x")), left = Infinity, right = -Infinity;
            for (const char of Array.from(text.textContent)) {
              const glyph = ctx.measureText(char);
              if (glyph.actualBoundingBoxLeft + glyph.actualBoundingBoxRight > 0) { left = Math.min(left, cursor - glyph.actualBoundingBoxLeft); right = Math.max(right, cursor + glyph.actualBoundingBoxRight); }
              cursor += glyph.width + Number(text.getAttribute("letter-spacing"));
            }
            return { left, right };
          });
          const board = el.querySelector('[data-sign-part="board"]');
          const arrow = el.querySelector('[data-sign-part="arrow"]');
          const arrowBox = arrow.getBBox(), transform = arrow.transform.baseVal.consolidate().matrix;
          check(arrow.getAttribute("d") === arrowPath, "double arrow shape invariant");
          near(transform.f + arrowBox.y + arrowBox.height / 2, Number(board.getAttribute("height")) / 2, "double arrow centered", 3);
          const visibleRows = metrics.filter(row => Number.isFinite(row.left));
          if (visibleRows.length) {
            if (index === 0) {
              visibleRows.forEach(row => near(row.left - (transform.e + arrowBox.x + arrowBox.width), 400, "double left-aligned rows", 20));
              near(Number(board.getAttribute("width")) - Math.max(...visibleRows.map(row => row.right)), 600, "longest row to right edge", 20);
            } else {
              visibleRows.forEach(row => near(row.left, 600, "double left text margin", 20));
              near(transform.e + arrowBox.x - Math.max(...visibleRows.map(row => row.right)), 400, "longest row to arrow", 20);
            }
          }
          const capHeight = window.KrokiDirectionSignData.capHeight;
          near(Number(texts[1].getAttribute("y")) - Number(texts[0].getAttribute("y")) - capHeight, 400, "4a row gap", 0.001);
          const bounds = a.getBounds(m.get(id));
          widths.push(bounds.width);
          near(bounds.height, initialHeight, "fixed double height", 0.001);
          check(a.hitTest(m.get(id), { x: bounds.x + bounds.width - 1, y: m.get(id).geometry.cy }, 0), "double wide edge selectable");
        }
        near(widths[0], widths[1], "longest row can be first or second", 0.001);
        near(widths[2], widths[3], "same rule for equal character counts", 0.001);
        near(widths[6], widths[7], "120-character rows either position", 0.001);
        check(widths[5] < widths[2] && widths[2] < widths[0] && widths[0] < widths[6], "double growth and shrink");
        update(...[["ANKARA", "İSTANBUL"], ["MERKEZ", "KAHRAMANMARAŞ"], ["HASTANE", "OTOGAR"]][index]);
        const before = a.getBounds(m.get(id));
        const copy = m.clone(id, { skipHistory: true });
        near(a.getBounds(copy).width, before.width, "double copy width", 0.001); m.remove(copy.id, { skipHistory: true });
        m.updateGeometry(id, draft => { draft.geometry.rotation = 90; }, { skipHistory: true });
        near(a.getBounds(m.get(id)).height, before.width, "double rotated bounds", 0.001);
        m.updateGeometry(id, draft => { draft.geometry.rotation = 0; }, { skipHistory: true });
        results.push({ id, direction: sign.layout.direction, rows: 2, width: before.width, textCases: widths.length });
      }
      for (const [index, sign] of signs.slice(6).entries()) {
        const model = m.create("trafficSign", { sign, center: { x: 1430, y: 190 + 210 * index }, scale: 0.03 }, { skipHistory: true });
        const id = model.id, fields = a.editableTextFields(model);
        check(fields.length === index + 1, "finger row count");
        const setRows = values => m.updateModel(id, draft => {
          fields.forEach((field, row) => a.updateEditableTextField(draft, field.id, values[row]));
          return draft;
        }, { skipHistory: true });
        const cases = index === 0 ? [["İL"], ["WWW"], ["III"], ["KAHRAMANMARAŞ"], ["ÇIĞ ŞÜ İÖ"], [""], ["W".repeat(120)]] :
          [["İL", "KAHRAMANMARAŞ"], ["KAHRAMANMARAŞ", "İL"], ["WWW", "III"], ["III", "WWW"], ["ÇIĞ ŞÜ İÖ", "İSTANBUL"], ["", ""], ["W".repeat(120), "İL"]];
        const widths = [];
        const initial = a.getBounds(model);
        for (const values of cases) {
          setRows(values);
          const el = m.getElement(id), board = el.querySelector('[data-sign-part="board"]');
          const inner = el.querySelector('[data-sign-part="inner-frame"]');
          const box = board.getBBox();
          const vertices = board.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number);
          near(box.height, window.KrokiDirectionSignData.capHeight * fields.length + (12 + 4 * index) * 100, "PDF finger height", 0.001);
          near(vertices[3] - vertices[2], box.height / 2, "PDF h/2 pointed end", 0.001);
          near(box.width - (inner.getBBox().x + inner.getBBox().width), 800, "PDF 8a tip gap", 0.001);
          near(inner.getBBox().x, 200, "PDF 2a inner left edge", 0.001);
          const texts = Array.from(el.querySelectorAll("text"));
          const edges = texts.map((text, row) => {
            check(text.textContent === values[row] && !text.hasAttribute("textLength"), "finger text remains independent and unsqueezed");
            const ctx = document.createElement("canvas").getContext("2d");
            ctx.font = `${text.getAttribute("font-size")}px KrokiSignNarrow`; ctx.fontKerning = "none";
            let cursor = Number(text.getAttribute("x")), left = Infinity, right = -Infinity;
            for (const char of Array.from(text.textContent)) {
              const glyph = ctx.measureText(char);
              if (glyph.actualBoundingBoxLeft + glyph.actualBoundingBoxRight > 0) { left = Math.min(left, cursor - glyph.actualBoundingBoxLeft); right = Math.max(right, cursor + glyph.actualBoundingBoxRight); }
              cursor += glyph.width + 100;
            }
            if (Number.isFinite(left)) near(left, 600, "finger 6a left text margin", 20);
            return right;
          });
          if (edges.some(Number.isFinite)) near(vertices[2] - Math.max(...edges), 700, "finger 4a + 3a right margin", 20);
          const bounds = a.getBounds(m.get(id)); widths.push(bounds.width);
          near(bounds.height, initial.height, "finger height fixed", 0.001);
          check(a.hitTest(m.get(id), { x: bounds.x + bounds.width - 1, y: m.get(id).geometry.cy }, 0), "finger tip selectable");
        }
        if (index === 0) check(widths[1] > widths[2] && widths[3] > widths[0], "finger real glyph widths");
        else { near(widths[0], widths[1], "finger longest row can be either", 0.001); near(widths[2], widths[3], "finger row swap", 0.001); }
        check(widths[5] < widths[0] && widths[6] > widths[0], "finger shrink and growth");
        setRows(index === 0 ? ["ANKARA"] : ["ŞANLIURFA", "GAZİANTEP"]);
        const before = a.getBounds(m.get(id));
        const copy = m.clone(id, { skipHistory: true }); near(a.getBounds(copy).width, before.width, "finger copy", 0.001); m.remove(copy.id, { skipHistory: true });
        m.updateGeometry(id, draft => { draft.geometry.rotation = 90; }, { skipHistory: true });
        near(a.getBounds(m.get(id)).height, before.width, "finger rotate", 0.001);
        m.updateGeometry(id, draft => { draft.geometry.rotation = 0; }, { skipHistory: true });
        const stableArt = m.getElement(id).firstElementChild;
        m.updateGeometry(id, draft => { draft.geometry.cx += 10; }, { skipHistory: true });
        check(m.getElement(id).firstElementChild === stableArt, "finger movement reuses art");
        results.push({ id, shape: "finger", rows: fields.length, width: before.width, textCases: cases.length });
      }
      const citySign = K.TrafficSignCatalog.find("3-bilgi-levhalari/sehir-merkezi-levhasi");
      const city = m.create("trafficSign", { sign: citySign, center: { x: 1430, y: 610 }, scale: 0.03 }, { skipHistory: true });
      check(a.editableTextFields(city).length === 0 && !citySign.layout, "city sign fixed");
      const symbol = m.getElement(city.id).querySelector('[data-sign-part="city-symbol"]').getAttribute("d");
      check((symbol.match(/A/g) || []).length === 6 && !/[CL]/.test(symbol), "city circles consist of six SVG arc segments");
      check(citySign.art.length < 1500, "compact fixed city artwork");
      const lettering = m.getElement(city.id).querySelector('[data-sign-part="city-lettering"]');
      const fixedTexts = Array.from(lettering.querySelectorAll("text"));
      check(!lettering.querySelector("path") && fixedTexts.length === 2, "city lettering uses text, never glyph paths");
      check(fixedTexts.map(text => text.textContent).join(" ") === "Şehir Merkezi", "fixed city text content");
      check(fixedTexts.every(text => text.dataset.editableText === "false"), "both city text nodes are locked");
      near(Number(fixedTexts[1].getAttribute("y")), 540, "city lower baseline follows printed dimensions", 0.001);
      near(a.getBounds(city).width / a.getBounds(city).height, 1980 / 684, "fixed city aspect ratio", 0.000001);
      const cityCopy = m.clone(city.id, { skipHistory: true });
      check(a.editableTextFields(cityCopy).length === 0, "city copy remains fixed"); m.remove(cityCopy.id, { skipHistory: true });
      results.push({ id: city.id, shape: "fixed-city", artBytes: citySign.art.length, width: a.getBounds(city).width });
      const touristSign = K.TrafficSignCatalog.all().find(sign => sign.code === "B-5b");
      const tourist = m.create("trafficSign", { sign: touristSign, center: { x: 2050, y: 250 }, scale: 0.03 }, { skipHistory: true });
      const touristFields = ["message1", "message2", "distance"];
      const touristHeight = a.getBounds(tourist).height, touristWidths = [];
      const triples = [["Belkıs", "(Aspendos)", "4"], ["İL", "KAHRAMANMARAŞ", "4"], ["KAHRAMANMARAŞ", "İL", "4"],
        ["İL", "KAHRAMANMARAŞ", "1234"], ["", "", ""], ["WWW", "III", "1,5"], ["III", "WWW", "1,5"], ["W".repeat(120), "Çığ Şü İö", "12345678"]];
      const setTourist = values => m.updateModel(tourist.id, draft => {
        touristFields.forEach((field, i) => a.updateEditableTextField(draft, field, values[i])); return draft;
      }, { skipHistory: true });
      for (const values of triples) {
        setTourist(values);
        const el = m.getElement(tourist.id), texts = Array.from(el.querySelectorAll("text"));
        check(texts.length === 3 && texts.every((text, i) => text.textContent === values[i] && text.getAttribute("fill") === "#fff" && !text.hasAttribute("textLength")), "tourist white independent text");
        check(el.querySelector('[data-sign-part="board"]').getAttribute("fill") === "#74352f", "PDF brown body");
        check(el.querySelector('[data-sign-part="outer-frame"]').getAttribute("fill") === "#fff", "white tourist frame");
        const edges = texts.map(text => {
          const ctx = document.createElement("canvas").getContext("2d");
          ctx.font = `${text.getAttribute("font-size")}px KrokiSignNarrow`; ctx.fontKerning = "none";
          let cursor = Number(text.getAttribute("x")), left = Infinity, right = -Infinity;
          for (const char of Array.from(text.textContent)) {
            const glyph = ctx.measureText(char);
            if (glyph.actualBoundingBoxLeft + glyph.actualBoundingBoxRight > 0) { left = Math.min(left, cursor - glyph.actualBoundingBoxLeft); right = Math.max(right, cursor + glyph.actualBoundingBoxRight); }
            cursor += glyph.width + 100;
          }
          return { left, right };
        });
        if (values.every(Boolean)) {
          near((edges[0].left + edges[0].right) / 2, (edges[1].left + edges[1].right) / 2, "tourist names centered together", 20);
          near(Math.min(edges[0].left, edges[1].left), 600, "tourist left margin", 20);
          near(edges[2].left - Math.max(edges[0].right, edges[1].right), 900, "tourist 9a distance gap", 20);
        }
        near(Number(texts[1].getAttribute("y")), Number(texts[2].getAttribute("y")), "distance on lower baseline", 0.001);
        const bounds = a.getBounds(m.get(tourist.id));
        near(bounds.height, touristHeight, "tourist fixed height", 0.001); touristWidths.push(bounds.width);
        check(a.hitTest(m.get(tourist.id), { x: bounds.x + bounds.width - 1, y: m.get(tourist.id).geometry.cy }, 0), "tourist expanded tip selectable");
      }
      near(touristWidths[1], touristWidths[2], "tourist longest name either row", 0.001);
      near(touristWidths[5], touristWidths[6], "tourist names swap without width change", 0.001);
      check(touristWidths[3] > touristWidths[1] && touristWidths[4] < touristWidths[0] && touristWidths[7] > touristWidths[3], "tourist width follows names and distance");
      setTourist(triples[0]);
      const touristBefore = a.getBounds(m.get(tourist.id));
      const touristCopy = m.clone(tourist.id, { skipHistory: true }); near(a.getBounds(touristCopy).width, touristBefore.width, "tourist copy", 0.001); m.remove(touristCopy.id, { skipHistory: true });
      m.updateGeometry(tourist.id, draft => { draft.geometry.rotation = 90; }, { skipHistory: true });
      near(a.getBounds(m.get(tourist.id)).height, touristBefore.width, "tourist rotated bounds", 0.001);
      m.updateGeometry(tourist.id, draft => { draft.geometry.rotation = 0; }, { skipHistory: true });
      const touristArt = m.getElement(tourist.id).firstElementChild;
      m.updateGeometry(tourist.id, draft => { draft.geometry.cx += 1; }, { skipHistory: true });
      check(m.getElement(tourist.id).firstElementChild === touristArt, "tourist drag reuses art");
      results.push({ id: tourist.id, shape: "tourist", textCases: triples.length, width: touristBefore.width });
      const metroSign = K.TrafficSignCatalog.all().find(sign => sign.code === "B-5c");
      const metro = m.create("trafficSign", { sign: metroSign, center: { x: 2050, y: 590 }, scale: 0.03 }, { skipHistory: true });
      check(a.editableTextFields(metro).length === 0 && !metroSign.layout, "Metro has fixed dimensions and labels");
      near(a.getBounds(metro).width / a.getBounds(metro).height, 1476 / 440, "Metro printed dimensions", 0.000001);
      const metroTexts = Array.from(m.getElement(metro.id).querySelectorAll("text"));
      check(metroTexts.map(text => text.textContent).join(" ") === "P + METRO" && metroTexts.every(text => text.dataset.editableText === "false"), "Metro uses three locked text elements");
      check(metroSign.art.length < 1500, "Metro compact art");
      results.push({ id: metro.id, shape: "fixed-metro", artBytes: metroSign.art.length, width: a.getBounds(metro).width });
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
      window.krokiEditorCamera.writeViewBox(m.canvas, { x: 0, y: 0, width: 2400, height: 800 });
      return results;
    });
    await page.locator("#editorCanvas").screenshot({ path: path.join(output, "eleven-signs.png") });
    await page.evaluate(() => window.krokiEditorCamera.writeViewBox(window.Kroki.EditorObjectManager.canvas, { x: 1180, y: 60, width: 550, height: 700 }));
    await page.locator("#editorCanvas").screenshot({ path: path.join(output, "pdf-139-signs.png") });
    await page.evaluate(() => window.krokiEditorCamera.writeViewBox(window.Kroki.EditorObjectManager.canvas, { x: 1730, y: 80, width: 650, height: 700 }));
    await page.locator("#editorCanvas").screenshot({ path: path.join(output, "pdf-140-signs.png") });
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
      if (models.length !== 11 || models.filter(m => m.metadata.signLayout).length !== 9) throw new Error("SVG import lost dynamic layout");
      const doubles = models.filter(m => m.metadata.signLayout?.family === "arrow-double-message-v1");
      if (doubles.length !== 3 || !doubles.every(m => m.metadata.signTextFields.message1 && m.metadata.signTextFields.message2)) throw new Error("SVG import lost second rows");
      const fingers = models.filter(m => m.metadata.signLayout?.family.startsWith("finger-"));
      if (fingers.length !== 2 || !fingers.some(m => m.metadata.signTextFields.message2 === "GAZİANTEP")) throw new Error("SVG import lost finger rows");
      const city = models.find(m => m.metadata.signKey.endsWith("sehir-merkezi-levhasi"));
      if (window.Kroki.ShapeRegistry.get("trafficSign").editableTextFields(city).length) throw new Error("City sign became editable");
      const cityTexts = window.Kroki.EditorObjectManager.getElement(city.id).querySelectorAll('text[data-editable-text="false"]');
      if (cityTexts.length !== 2 || Array.from(cityTexts).map(text => text.textContent).join(" ") !== "Şehir Merkezi") throw new Error("SVG import lost fixed city text nodes");
      const tourist = models.find(m => m.metadata.signCode === "B-5b");
      if (tourist.metadata.signTextFields.distance !== "4" || tourist.metadata.signTextFields.message2 !== "(Aspendos)") throw new Error("Tourist import lost independent fields");
      const metro = models.find(m => m.metadata.signCode === "B-5c");
      if (window.Kroki.ShapeRegistry.get("trafficSign").editableTextFields(metro).length || window.Kroki.EditorObjectManager.getElement(metro.id).querySelectorAll('text[data-editable-text="false"]').length !== 3) throw new Error("Metro import lost locked text");
    });
    // Touch layout keeps text fields usable on a tablet.
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.evaluate(() => window.Kroki.SelectionManager.edit(window.Kroki.EditorObjectManager.getAll().find(m => m.metadata.signCode === "B-5b").id));
    if (!(await firstMessage.isVisible())) await page.click("#btnLineText");
    await firstMessage.fill("ŞANLIURFA");
    await secondMessage.fill("GAZİANTEP");
    await secondMessage.press("Tab");
    await distanceInput.fill("12"); await distanceInput.press("Tab");
    await page.screenshot({ path: path.join(output, "tablet.png") });
    assert.deepEqual(errors, [], "page errors");
    console.log(JSON.stringify({ base, titles, results }, null, 2));
    console.log("PASS: nine dynamic signs + fixed city/Metro signs, tourist name/distance layout, SVG arcs, compact locked text, PDF geometry, insertion scale, independent fields, long/empty/Turkish text, hit tests, rotation, copy, drag reuse, undo/redo, JSON/SVG roundtrip, font export, tablet.");
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
