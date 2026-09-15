// Browser regression for circular arcs with endpoint markers. Requires Playwright.
// --baseline <git-ref> serves that revision's JS without changing either checkout.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const baselineIndex = process.argv.indexOf("--baseline");
const baseline = baselineIndex < 0 ? null : execFileSync("git", ["rev-parse", "--verify", process.argv[baselineIndex + 1]], { cwd: root, encoding: "utf8" }).trim();
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, body) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }).end(body);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    if (baseline) await page.route("**/src/**/*.js*", async route => {
      const relative = new URL(route.request().url()).pathname.slice(1);
      await route.fulfill({ body: execFileSync("git", ["show", `${baseline}:${relative}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 }), contentType: "text/javascript" });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.click("#btnYeniKroki");
    const result = await page.evaluate(async () => {
      const K = window.Kroki, manager = K.EditorObjectManager, adapter = K.ShapeRegistry.get("arc");
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const near = (a, b, tolerance, message) => check(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
      const pointNear = (a, b, tolerance, message) => near(Math.hypot(a.x - b.x, a.y - b.y), 0, tolerance, message);
      const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const markerSnapX = { triangle: 10, triangle2: 10, trianglewithbar: 6.5, circle: 5, bar: 5 };
      const geometryFor = (ratio, short = false) => ({ start: { x: 500, y: 400 }, end: short ? { x: 506, y: 403 } : { x: 860, y: 490 }, ratio });
      // Independent chord/sagitta construction; no renderer helper is used here.
      function sourceCircle(geometry) {
        const { start, end, ratio } = geometry, dx = end.x - start.x, dy = end.y - start.y;
        const chord = Math.hypot(dx, dy), half = chord / 2, sagitta = half * ratio;
        const control = { x: (start.x + end.x) / 2 - dy * ratio / 2, y: (start.y + end.y) / 2 + dx * ratio / 2 };
        if (!sagitta) return { control, radius: null };
        const centerOffset = (sagitta * sagitta - half * half) / (2 * sagitta);
        return { control, cx: (start.x + end.x) / 2 - dy / chord * centerOffset,
          cy: (start.y + end.y) / 2 + dx / chord * centerOffset,
          radius: Math.abs((sagitta * sagitta + half * half) / (2 * sagitta)), direction: -Math.sign(ratio) };
      }
      function radialError(element, circle) {
        if (!circle.radius) return 0;
        const length = element.getTotalLength();
        let error = 0;
        for (let i = 0; i <= 96; i++) {
          const point = element.getPointAtLength(length * i / 96);
          error = Math.max(error, Math.abs(Math.hypot(point.x - circle.cx, point.y - circle.cy) - circle.radius));
        }
        return error;
      }
      function validate(id, referenceError = 0) {
        const model = manager.get(id), element = manager.getElement(id), circle = sourceCircle(model.geometry);
        const d = element.getAttribute("d"), length = element.getTotalLength();
        check(Number.isFinite(length) && length > 0, `${id}: invalid or vanished stroke`);
        check(!/[CQ]/i.test(d), `${id}: a circular arc must not become a deformed Bezier when arrows are enabled`);
        check(circle.radius ? /A/.test(d) : /L/.test(d), `${id}: wrong path primitive`);
        // Chromium's path measurement can approximate A commands internally. Allow
        // its own no-arrow sampling error plus 0.02 world units, not shape drift.
        near(radialError(element, circle), 0, Math.max(0.02, referenceError + 0.02), `${id}: stroke left original circle`);
        pointNear({ x: +element.dataset.arcControlX, y: +element.dataset.arcControlY }, circle.control, 1e-8, `${id}: persisted middle CP moved`);
        const cp = adapter.getControlPoints(model, { endpointOffset: 0 }).find(point => point.id === "control");
        pointNear(cp, circle.control, 1e-8, `${id}: middle CP moved`);
        for (const end of ["start", "end"]) {
          const type = model.style[end === "start" ? "arrowStart" : "arrowEnd"];
          const url = element.getAttribute(`marker-${end}`);
          if (type === "none") { check(!url, `${id}: removed arrow is still attached`); continue; }
          const markerId = url?.match(/#([^)'"\s]+)/)?.[1], marker = document.getElementById(markerId);
          check(marker, `${id}: missing ${end} marker definition`);
          const bodyEnd = element.getPointAtLength(end === "start" ? 0 : length);
          let tangent;
          if (circle.radius) tangent = { x: -circle.direction * (bodyEnd.y - circle.cy), y: circle.direction * (bodyEnd.x - circle.cx) };
          else tangent = { x: model.geometry.end.x - model.geometry.start.x, y: model.geometry.end.y - model.geometry.start.y };
          const orient = marker.getAttribute("orient");
          check(orient === "auto-start-reverse" || (end === "end" && orient === "auto"), `${id}: unexpected marker orientation`);
          const angle = Math.atan2(tangent.y, tangent.x) + (end === "start" ? Math.PI : 0);
          const glyph = marker.firstElementChild;
          let glyphTip = new DOMPoint(markerSnapX[type], +marker.getAttribute("refY"));
          const transform = glyph.transform?.baseVal.consolidate();
          if (transform) glyphTip = glyphTip.matrixTransform(transform.matrix);
          const view = marker.viewBox.baseVal;
          const units = marker.getAttribute("markerUnits") === "userSpaceOnUse" ? 1 : model.style.strokeWidth;
          const scale = Math.min(marker.markerWidth.baseVal.value / view.width, marker.markerHeight.baseVal.value / view.height) * units;
          const x = (glyphTip.x - marker.refX.baseVal.value) * scale, y = (glyphTip.y - marker.refY.baseVal.value) * scale;
          const tip = { x: bodyEnd.x + x * Math.cos(angle) - y * Math.sin(angle), y: bodyEnd.y + x * Math.sin(angle) + y * Math.cos(angle) };
          pointNear(tip, model.geometry[end], 0.025, `${id}: ${end} ${type} tip missed source endpoint/grid anchor`);
        }
        return { d, radialError: radialError(element, circle) };
      }
      window.__arcArrowValidate = validate;
      window.__arcArrowPaint = paint;
      const cases = [
        { ratio: 0.2, width: 3, scale: 1 }, { ratio: -0.5, width: 9, scale: 1 },
        { ratio: 2, width: 6, scale: 1 }, { ratio: -2, width: 6, scale: 2.5 },
        { ratio: 0, width: 6, scale: 1 }, { ratio: 0.5, width: 28, scale: 2, short: true },
        { ratio: -2, width: 32, scale: 0.4, short: true }
      ];
      let checked = 0, maximumRadialError = 0;
      for (const fixture of cases) {
        const geometry = geometryFor(fixture.ratio, fixture.short);
        for (const type of ["none", "triangle", "triangle2", "trianglewithbar", "circle", "bar"]) {
          for (const placement of ["start", "end", "both"]) {
            const id = `arc-${checked}`, style = { strokeWidth: fixture.width, markerScale: fixture.scale, arrowStart: "none", arrowEnd: "none" };
            manager.add({ ...adapter.create({ ...geometry, style }), id }, { skipHistory: true });
            const original = JSON.stringify(manager.get(id).geometry), noArrow = manager.getElement(id).getAttribute("d");
            const referenceError = radialError(manager.getElement(id), sourceCircle(geometry));
            manager.updateModel(id, model => ({ ...model, style: { ...model.style,
              arrowStart: placement !== "end" ? type : "none", arrowEnd: placement !== "start" ? type : "none" } }), { skipHistory: true });
            const metrics = validate(id, referenceError);
            maximumRadialError = Math.max(maximumRadialError, metrics.radialError);
            check(JSON.stringify(manager.get(id).geometry) === original, `${id}: arrow toggle mutated source geometry`);
            manager.updateModel(id, model => ({ ...model, style: { ...model.style, arrowStart: "none", arrowEnd: "none" } }), { skipHistory: true });
            check(manager.getElement(id).getAttribute("d") === noArrow, `${id}: removing arrow failed to restore original arc`);
            check(JSON.stringify(manager.get(id).geometry) === original, `${id}: removing arrow changed geometry`);
            manager.remove(id, { skipHistory: true });
            checked++;
          }
        }
      }
      manager.add({ ...adapter.create({ ...geometryFor(0.65), style: { strokeWidth: 8, arrowStart: "triangle", arrowEnd: "triangle2" } }), id: "arc-live" }, { skipHistory: true });
      window.krokiEditorCamera.writeViewBox(manager.canvas, { x: 0, y: 0, width: 1200, height: 800 });
      K.SelectionManager.select("arc-live", "edit");
      K.HistoryManager.clear();
      await paint();
      validate("arc-live", 0.08);
      return { cases: checked, maximumRadialError };
    });

    // Use the real CP pointer pipeline, including renderGeometry during dragging.
    for (const cpId of ["control", "end"]) {
      await page.evaluate(async cpId => {
        const K = window.Kroki, manager = K.EditorObjectManager, canvas = manager.canvas;
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const target = canvas.querySelector(`.editor-object-cp[data-point="${cpId}"]`);
        check(target, `Missing ${cpId} handle`);
        const box = target.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        const send = (kind, node, px, py) => node.dispatchEvent(new PointerEvent(kind, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: kind === "pointerup" ? 0 : 1, clientX: px, clientY: py }));
        const before = JSON.stringify(manager.get("arc-live").geometry);
        const path = manager.getElement("arc-live");
        const markers = ["start", "end"].map(end => {
          const url = path.getAttribute(`marker-${end}`), id = url.match(/#([^)'"\s]+)/)[1];
          return { end, url, id, node: document.getElementById(id) };
        });
        const definitionCount = canvas.querySelectorAll("#editorLineDefs marker").length;
        send("pointerdown", target, x, y);
        for (let i = 1; i <= 4; i++) {
          send("pointermove", canvas, x + i * 7, y + i * 13);
          await window.__arcArrowPaint();
          window.__arcArrowValidate("arc-live", 0.08);
          markers.forEach(marker => {
            check(path.getAttribute(`marker-${marker.end}`) === marker.url, `${cpId}: marker reference changed during drag`);
            check(document.getElementById(marker.id) === marker.node, `${cpId}: marker definition was rebuilt during drag`);
          });
          check(canvas.querySelectorAll("#editorLineDefs marker").length === definitionCount, `${cpId}: marker definitions accumulated during drag`);
        }
        send("pointerup", canvas, x + 28, y + 52);
        await window.__arcArrowPaint();
        const after = JSON.stringify(manager.get("arc-live").geometry);
        check(after !== before, `${cpId}: real pointer gesture did not edit geometry`);
        if (cpId === "end") {
          const point = manager.get("arc-live").geometry.end, step = K.EditorGrid.placementSnapStep();
          check(step > 0, "Grid snap disabled in test");
          check(Math.abs(point.x / step - Math.round(point.x / step)) < 1e-6 && Math.abs(point.y / step - Math.round(point.y / step)) < 1e-6, "Arrow endpoint no longer snaps to grid");
        }
        K.HistoryManager.undo();
        check(JSON.stringify(manager.get("arc-live").geometry) === before, `${cpId}: undo lost geometry`);
        window.__arcArrowValidate("arc-live", 0.08);
        K.HistoryManager.redo();
        check(JSON.stringify(manager.get("arc-live").geometry) === after, `${cpId}: redo lost geometry`);
        window.__arcArrowValidate("arc-live", 0.08);
      }, cpId);
    }
    await page.evaluate(async () => {
      const K = window.Kroki, manager = K.EditorObjectManager;
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const source = JSON.stringify(manager.get("arc-live"));
      const documentData = K.DocumentSerializer.exportDocument({ stableTimestamps: true });
      K.DocumentSerializer.importDocument(documentData, { skipHistory: true });
      check(JSON.stringify(manager.get("arc-live")) === source, "Document roundtrip changed arc geometry/style");
      window.__arcArrowValidate("arc-live", 0.08);
      const copy = manager.clone("arc-live", { skipHistory: true });
      window.__arcArrowValidate(copy.id, 0.08);
      manager.remove("arc-live", { skipHistory: true });
      window.__arcArrowValidate(copy.id, 0.08);
      K.SelectionManager.select(copy.id, "edit");
      await window.__arcArrowPaint();
      window.__arcArrowCopyId = copy.id;
    });
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "arc-arrow-geometry.png") });
    }
    await page.evaluate(() => {
      const K = window.Kroki;
      K.EditorObjectManager.remove(window.__arcArrowCopyId, { skipHistory: true });
      K.StyleManager.cleanupDefs(K.EditorObjectManager.canvas);
      if (K.EditorObjectManager.canvas.querySelector("#editorLineDefs marker")) throw new Error("Deleting arcs leaked marker definitions");
    });
    if (process.env.SCREENSHOT_DIR) {
      await page.evaluate(async () => {
        const K = window.Kroki, manager = K.EditorObjectManager, adapter = K.ShapeRegistry.get("arc");
        const svg = (tag, attributes, text) => {
          const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
          Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
          if (text) node.textContent = text;
          manager.objectLayer.append(node);
        };
        const examples = [
          { ratio: 0.2, arrowStart: "none", arrowEnd: "triangle", title: "Shallow / end" },
          { ratio: 0.2, arrowStart: "triangle", arrowEnd: "triangle", title: "Shallow / both" },
          { ratio: 0.8, arrowStart: "triangle2", arrowEnd: "trianglewithbar", title: "Mixed markers" },
          { ratio: -0.5, arrowStart: "triangle", arrowEnd: "triangle", title: "Negative curve" }
        ];
        examples.forEach((example, i) => {
          const x = 190 + i % 2 * 250, y = 170 + Math.floor(i / 2) * 170;
          const geometry = { start: { x, y }, end: { x: x + 100, y }, ratio: example.ratio };
          manager.add({ ...adapter.create({ ...geometry, style: { stroke: "#a8a29e", strokeWidth: 1.5, dash: "dash" } }), id: `reference-${i}` }, { skipHistory: true });
          manager.add({ ...adapter.create({ ...geometry, style: { stroke: "#2563eb", strokeWidth: 8, markerScale: 1.5, arrowStart: example.arrowStart, arrowEnd: example.arrowEnd } }), id: `visual-${i}` }, { skipHistory: true });
          const middle = adapter.pointAt(manager.get(`visual-${i}`), 0.5);
          [geometry.start, middle, geometry.end].forEach(point => svg("circle", { cx: point.x, cy: point.y, r: 2, fill: "#dc2626", stroke: "white", "stroke-width": 0.7 }));
          svg("text", { x: x - 10, y: y - 70, "font-size": 12, fill: "#334155" }, example.title);
          window.__arcArrowValidate(`visual-${i}`, 0.08);
        });
        svg("text", { x: 150, y: 60, "font-size": 12, fill: "#334155" }, "Gray: original arc. Red: original endpoints and midpoint. Blue: arrows enabled.");
        K.SelectionManager.select("visual-0", "edit");
        window.krokiEditorCamera.writeViewBox(manager.canvas, { x: 70, y: 15, width: 660, height: 480 });
        await window.__arcArrowPaint();
      });
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "arc-arrow-shallow-comparison.png") });
    }
    assert.deepEqual(errors, [], "Browser errors");
    console.log(JSON.stringify(result));
    console.log("PASS: circular body/CP and marker-tip alignment across 126 variants; live curve/end dragging, grid snap, undo/redo, document roundtrip, clone/delete.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
