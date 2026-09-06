// Optional browser regression/performance check. Requires Playwright; CHROME_PATH
// may select an installed Chromium. --baseline <git-ref> compares the same gestures
// and pixels against an earlier revision without checking out or changing files.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const baselineIndex = process.argv.indexOf("--baseline");
const baseline = baselineIndex < 0 ? null : execFileSync("git", ["rev-parse", "--verify", process.argv[baselineIndex + 1]], { cwd: root, encoding: "utf8" }).trim();
const cases = [
  ["line", "start", { start: { x: 620, y: 480 }, end: { x: 980, y: 580 } }],
  ["arc", "control", { start: { x: 600, y: 480 }, end: { x: 980, y: 480 }, ratio: 0.5 }],
  ["bezier", "q", { bezierType: "quadratic", start: { x: 600, y: 480 }, end: { x: 980, y: 480 }, q: { x: 790, y: 580 } }],
  ["bezier", "c1", { bezierType: "cubic", start: { x: 600, y: 480 }, end: { x: 980, y: 480 }, c1: { x: 680, y: 600 }, c2: { x: 900, y: 400 } }],
  ["rectangle", "nw", { cx: 820, cy: 500, rx: 90, ry: 60, rotation: 0 }],
  ["rectangle", "rotate", { cx: 820, cy: 500, rx: 90, ry: 60, rotation: 0 }],
  ["ellipse", "nw", { cx: 820, cy: 500, rx: 90, ry: 60, rotation: 0 }],
  ["circle", "radius", { cx: 820, cy: 500, r: 65, rotation: 0 }],
  ["vehicle", "rotate", { cx: 820, cy: 500, scale: 1, rotation: 0 }],
  ["trafficSign", "rotate", { cx: 820, cy: 500, scale: 0.08, rotation: 0 }],
  ["otherSymbol", "rotate", { cx: 820, cy: 500, scale: 0.08, rotation: 0 }],
  ["bezier", "move", { bezierType: "cubic", start: { x: 600, y: 480 }, end: { x: 980, y: 480 }, c1: { x: 680, y: 600 }, c2: { x: 900, y: 400 } }]
];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, body) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }).end(body);
  });
});

async function run(browser, url, ref) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 850 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    if (ref) await page.route("**/src/**/*.js*", async route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      const body = execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
      await route.fulfill({ body, contentType: "text/javascript" });
    });
    await page.goto(url);
    await page.click("#btnYeniKroki");
    await page.evaluate(async () => {
      await document.fonts.ready;
      const K = window.Kroki, m = K.EditorObjectManager;
      const roads = [
        { profile: "straight", start: { x: 50, y: 240 }, end: { x: 1120, y: 240 } },
        { profile: "straight", start: { x: 380, y: 60 }, end: { x: 380, y: 710 } },
        { profile: "islandRing", center: { x: 380, y: 240 }, innerDiameter: 160, outerDiameter: 260 }
      ];
      roads.forEach((geometry, i) => m.add({ ...K.ShapeRegistry.get("road").create({ geometry }), id: `perf-road-${i}` }, { skipHistory: true }));
      window.krokiEditorCamera.writeViewBox(m.canvas, { x: 0, y: 0, width: 1200, height: 750 });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!m.canvas.querySelector("#roadIntersectionContourMask")) throw new Error("Island mask missing from test scene");
      if (K.RoadIntersectionEngine.getDiagnostics().intersectionShapeCount < 3) throw new Error("Island junction missing");
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU_RATE) || 6 });
    const results = [];
    for (const [type, cpId, geometry] of cases) {
      await page.evaluate(({ type, geometry }) => {
        const K = window.Kroki, m = K.EditorObjectManager;
        K.SelectionManager.clear();
        if (m.get("perf-object")) m.remove("perf-object", { skipHistory: true });
        const model = K.ShapeRegistry.get(type).create({ geometry, ...geometry });
        m.add({ ...model, geometry, id: "perf-object", style: { ...model.style, arrowEnd: "triangle" } }, { skipHistory: true });
        K.SelectionManager.select("perf-object", "edit");
        K.HistoryManager.clear();
      }, { type, geometry });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await page.evaluate(async ({ cpId }) => {
        const K = window.Kroki, m = K.EditorObjectManager, canvas = m.canvas;
        const target = cpId === "move" ? m.getElement("perf-object") : canvas.querySelector(`.editor-object-cp[data-point="${cpId}"]`);
        if (!target) throw new Error(`Missing ${cpId} CP`);
        const box = target.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        const send = (kind, node, px, py) => node.dispatchEvent(new PointerEvent(kind, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, buttons: kind === "pointerup" ? 0 : 1, clientX: px, clientY: py }));
        const before = JSON.stringify(m.get("perf-object").geometry);
        const roadMarkup = Array.from(canvas.querySelectorAll(".editor-road,#roadIntersectionContourLayer")).map(node => node.outerHTML);
        let mutations = 0, roadMutations = 0;
        const observer = new MutationObserver(records => {
          mutations += records.length;
          roadMutations += records.filter(record => record.target.closest?.(".editor-road,#roadIntersectionContourLayer")).length;
        });
        observer.observe(document.querySelector("#editor"), { subtree: true, childList: true, attributes: true });
        send("pointerdown", target, x, y);
        const frames = [];
        let last = performance.now();
        for (let i = 0; i < 60; i++) {
          await new Promise(requestAnimationFrame);
          const now = performance.now(); frames.push(now - last); last = now;
          send("pointermove", canvas, x + Math.sin(i / 8) * 65, y + Math.cos(i / 11) * 45);
        }
        await new Promise(requestAnimationFrame);
        send("pointerup", canvas, x + 31, y + 43);
        await new Promise(requestAnimationFrame);
        observer.disconnect();
        const final = JSON.stringify(m.get("perf-object").geometry);
        if (final === before) throw new Error("Gesture did not change geometry");
        if (JSON.stringify(roadMarkup) !== JSON.stringify(Array.from(canvas.querySelectorAll(".editor-road,#roadIntersectionContourLayer")).map(node => node.outerHTML))) throw new Error("Unrelated road artwork changed");
        if (roadMutations) throw new Error("Unrelated road was rewritten");
        K.HistoryManager.undo();
        if (JSON.stringify(m.get("perf-object").geometry) !== before) throw new Error("Undo differs");
        K.HistoryManager.redo();
        if (JSON.stringify(m.get("perf-object").geometry) !== final) throw new Error("Redo differs");
        const values = Array.from(document.querySelectorAll("#editorSideIp input")).map(node => [node.id, node.value]);
        if (!values.length) throw new Error("Inspector input coverage missing");
        frames.sort((a, b) => a - b);
        return { geometry: JSON.parse(final), values, mutations, meanMs: frames.reduce((a, b) => a + b) / frames.length, p95Ms: frames[Math.floor(frames.length * 0.95)] };
      }, { cpId });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const pixels = await page.locator("#editorCanvas").screenshot();
      results.push({ key: `${type}:${cpId}`, ...result, pixels });
    }
    assert.deepEqual(errors, [], "Browser errors");
    return results;
  } finally { await page.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const previous = baseline ? await run(browser, url, baseline) : null;
    const current = await run(browser, url, null);
    current.forEach((result, i) => {
      const before = previous?.[i];
      if (before) {
        assert.deepEqual(result.geometry, before.geometry, `${result.key}: geometry changed`);
        assert.deepEqual(result.values, before.values, `${result.key}: inspector values changed`);
        assert.ok(result.pixels.equals(before.pixels), `${result.key}: canvas pixels changed`);
      }
      console.log(JSON.stringify({ case: result.key, mutations: result.mutations, p95Ms: +result.p95Ms.toFixed(1), ...(before ? { beforeMutations: before.mutations, beforeP95Ms: +before.p95Ms.toFixed(1), identicalPixels: true } : {}) }));
    });
    console.log(`PASS: ${current.length} island-junction edit cases; undo/redo, stable roads${baseline ? ", baseline geometry, inspector values and pixels" : ""}. Timing is diagnostic, not a physical-tablet FPS guarantee.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
