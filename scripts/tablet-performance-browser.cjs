// Optional browser regression. Requires Playwright; CHROME_PATH may select Chrome.
// --baseline <git-ref> compares unchanged geometry/style/Q output and CPU timings.
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
  const page = await browser.newPage({ viewport: { width: 1180, height: 850 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    if (ref) await page.route("**/src/**/*.js*", async route => {
      const body = execFileSync("git", ["show", `${ref}:${new URL(route.request().url()).pathname.slice(1)}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
      await route.fulfill({ body, contentType: "text/javascript" });
    });
    await page.goto(url);
    await page.click("#btnYeniKroki");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU_RATE) || 6 });
    const results = [];
    for (const fixture of ["standalone", "cross", "terminal", "curves", "styled", "overlap", "detached-junction", "straight", "t", "three", "divided"].filter(name => !process.env.CASES || process.env.CASES.split(",").includes(name))) {
      console.log(`${ref ? "baseline" : "current"}: ${fixture}`);
      const result = await page.evaluate(async ({ fixture, analytic }) => {
        const K = window.Kroki, m = K.EditorObjectManager, engine = K.RoadIntersectionEngine;
        const adapter = K.ShapeRegistry.get("road");
        const clone = value => JSON.parse(JSON.stringify(value));
        const check = (condition, message) => { if (!condition) throw new Error(`${fixture}: ${message}`); };
        const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        K.SelectionManager.clear();
        m.clear({ skipHistory: true });
        engine.resetQEndpointEdits();
        const island = { ...adapter.create({ geometry: { profile: "islandRing", center: { x: 600, y: 400 }, innerDiameter: 200, outerDiameter: 500 }, metadata: { road: { laneCount: 3 } } }), id: "island" };
        if (fixture === "styled") island.metadata.road.boundaryStyles = {
          b0: { style: "doubleDash", width: 3, segments: [
            { from: 0, to: 0.25, style: "doubleDash", width: 3 },
            { from: 0.25, to: 0.5, style: "none", width: 3 },
            { from: 0.5, to: 1, style: "leftSolidRightDash", width: 0 }
          ] },
          b1: { style: "doubleSolid", width: 4 },
          b2: { style: "rightSolidLeftDash", width: 2 },
          b3: { style: "dash", width: 2, segments: [
            { from: 0, to: 0.37, style: "dash", width: 2 },
            { from: 0.37, to: 0.9995, style: "doubleSolid", width: 4 },
            { from: 0.9995, to: 1, style: "none", width: 2 }
          ] }
        };
        const roadOnly = ["straight", "t", "three", "divided"].includes(fixture);
        if (!roadOnly) m.add(island, { skipHistory: true });
        const straight = (start, end) => ({ profile: "straight", start, end });
        const roads = [];
        if (roadOnly) roads.push(straight({x:50,y:400},{x:1150,y:400}));
        if (["t","three","divided"].includes(fixture)) roads.push(straight({x:600,y:40},{x:600,y:400}));
        if (fixture === "three") roads.push(straight({x:900,y:760},{x:700,y:400}));
        if (["cross", "styled", "overlap"].includes(fixture)) roads.push(straight({ x: 50, y: 400 }, { x: 1150, y: 400 }), straight({ x: 600, y: 40 }, { x: 600, y: 760 }));
        if (fixture === "terminal") roads.push(straight({ x: 50, y: 400 }, { x: 370, y: 400 }));
        if (fixture === "detached-junction") roads.push(straight({ x: -150, y: 100 }, { x: 300, y: 100 }), straight({ x: 100, y: -150 }, { x: 100, y: 300 }));
        if (fixture === "curves") roads.push({ profile: "arc", start: { x: 50, y: 250 }, end: { x: 1050, y: 650 }, ratio: 0.3 }, { profile: "sCurve", start: { x: 300, y: 40 }, end: { x: 900, y: 760 }, controls: [{ x: 720, y: 230 }, { x: 450, y: 560 }] });
        if (fixture === "overlap") roads.push({ profile: "islandRing", center: { x: 760, y: 400 }, innerDiameter: 120, outerDiameter: 340 });
        roads.forEach((geometry, index) => m.add({ ...adapter.create({ geometry, metadata: { road: { divided: fixture === "divided", laneCount: 2, laneWidth: 50, leftShoulder: { enabled: true, width: 20 }, rightShoulder: { enabled: true, width: 20 } } } }), id: `road-${index}` }, { skipHistory: true }));
        window.krokiEditorCamera.writeViewBox(m.canvas, { x: 0, y: 0, width: 1200, height: 800 });
        await frame();
        engine.rebuild();
        const snapshot = () => ({
          surfaces: clone(engine.getLastRoadSurfaces()), intersections: clone(engine.getLastIntersectionShapes()),
          contours: clone(engine.getLastOuterContours()), q: clone(engine.getLastQSegments()), state: clone(engine.exportState()),
          boundaries: Array.from((m.getElement("island") || m.getElement("road-0")).querySelectorAll("path[data-road-boundary-id]")).map(node => ({
            boundary: node.dataset.roadBoundaryId, from: node.dataset.visibleFrom, to: node.dataset.visibleTo,
            width: node.getAttribute("stroke-width"), dash: node.getAttribute("stroke-dasharray"), cap: node.getAttribute("stroke-linecap")
          })),
          otherRoads: roads.map((_, index) => m.getElement(`road-${index}`).querySelectorAll("path")).map(nodes => Array.from(nodes).map(node => ({ d: node.getAttribute("d"), width: node.getAttribute("stroke-width") })))
        });
        const original = snapshot();

        const hitKeys = Array.from(m.canvas.querySelectorAll(".road-intersection-q-hit")).map(node => node.dataset.qKey);
        original.hitKeys = hitKeys;
        const q = engine.getLastQSegments().find(item => hitKeys.includes(item.key));
        let edited = null;
        if (q) {
          const imported = { version: 1, qEndpointEdits: [{ key: q.key, controlDx: 13, controlDy: -9 }] };
          engine.importState(imported);
          engine.rebuild();
          edited = { q: clone(engine.getLastQSegments()), state: clone(engine.exportState()) };
          check(edited.q.find(item => item.key === q.key).control.x !== q.control.x, "Q edit must apply");
          check(m.canvas.querySelectorAll(".road-intersection-q-hit").length === hitKeys.length, "Q hit targets remain separate");
          engine.resetQEndpointEdits();
          engine.rebuild();
          check(JSON.stringify(engine.getLastQSegments()) === JSON.stringify(original.q), "Q reset restores geometry");
        }
        const styleStates = [], times = [], phases = [];
        for(let warmup=0;warmup<3;warmup++)engine.rebuild();
        const targetId = roadOnly ? "road-0" : "island";
        for (const style of ["dash","doubleSolid","none","leftSolidRightDash","solid"]) {
          m.updateModel(targetId, draft => {
            const config = draft.metadata.road;
            adapter.setBoundarySegmentCount(config, "b0", 3);
            adapter.setBoundarySegment(config, "b0", 1, {style, width:3});
            return draft;
          }, {skipHistory:true});
          engine.rebuild();
          times.push(engine.getDiagnostics().totalMs);
          phases.push(engine.getDiagnostics());
          styleStates.push(snapshot());
        }
        m.updateGeometry(targetId, draft => {
          adapter.move(draft, 21, 13);
        }, {skipHistory:true});
        engine.rebuild();
        const moved = snapshot();
        const json = K.DocumentSerializer.toJson();
        K.DocumentSerializer.fromJson(json); engine.rebuild();
        const restored = snapshot();
        check(JSON.stringify(moved) === JSON.stringify(restored), "round-trip changed output");
        const diagnostics = engine.getDiagnostics();
        return { fixture, original, edited, styleStates, moved, times, phases, diagnostics };
      }, { fixture, analytic: false });
      results.push(result);
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
    fs.mkdirSync(path.join(root, ".tmp"), { recursive: true });
    fs.writeFileSync(path.join(root, ".tmp", "tablet-performance-result.json"), JSON.stringify({
      cpuRate: Number(process.env.CPU_RATE)||6,
      cases:current.map((r,i)=>({fixture:r.fixture,before:previous?.[i].phases,after:r.phases}))
    },null,2));
    current.forEach((result, index) => {
      const before = previous?.[index];
      if (before) {
        assert.deepEqual(result.original, before.original, `${result.fixture}: computed geometry, clipping, styles or non-island paths changed`);
        assert.deepEqual(result.edited, before.edited, `${result.fixture}: Q edits changed`);
        assert.deepEqual(result.styleStates, before.styleStates, `${result.fixture}: segmented styles changed`);
        assert.deepEqual(result.moved, before.moved, `${result.fixture}: moved geometry changed`);
      }
      const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
      console.log(JSON.stringify({case:result.fixture, beforeMs:before && median(before.times), afterMs:median(result.times),
        attachmentComputations:result.diagnostics.terminalAttachmentComputations, attachmentCacheHits:result.diagnostics.terminalAttachmentCacheHits}));
    });
    console.log("PASS: baseline equality for contours, clipping, segment styles, Q edits, movement and serializer round-trip.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
