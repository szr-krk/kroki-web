// Optional browser regression. Requires Playwright; CHROME_PATH may select Chrome.
// --baseline <git-ref> compares computation and interaction with an older adapter.
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
    if (ref) await page.route("**/src/adapters/roadAdapter.js*", async route => {
      const body = execFileSync("git", ["show", `${ref}:src/adapters/roadAdapter.js`], { cwd: root });
      await route.fulfill({ body, contentType: "text/javascript" });
    });
    await page.goto(url);
    await page.click("#btnYeniKroki");
    const results = [];
    for (const fixture of ["standalone", "cross", "terminal", "curves", "styled", "overlap", "detached-junction"]) {
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
        m.add(island, { skipHistory: true });
        const straight = (start, end) => ({ profile: "straight", start, end });
        const roads = [];
        if (["cross", "styled", "overlap"].includes(fixture)) roads.push(straight({ x: 50, y: 400 }, { x: 1150, y: 400 }), straight({ x: 600, y: 40 }, { x: 600, y: 760 }));
        if (fixture === "terminal") roads.push(straight({ x: 50, y: 400 }, { x: 370, y: 400 }));
        if (fixture === "detached-junction") roads.push(straight({ x: -150, y: 100 }, { x: 300, y: 100 }), straight({ x: 100, y: -150 }, { x: 100, y: 300 }));
        if (fixture === "curves") roads.push({ profile: "arc", start: { x: 50, y: 250 }, end: { x: 1050, y: 650 }, ratio: 0.3 }, { profile: "sCurve", start: { x: 300, y: 40 }, end: { x: 900, y: 760 }, controls: [{ x: 720, y: 230 }, { x: 450, y: 560 }] });
        if (fixture === "overlap") roads.push({ profile: "islandRing", center: { x: 760, y: 400 }, innerDiameter: 120, outerDiameter: 340 });
        roads.forEach((geometry, index) => m.add({ ...adapter.create({ geometry, metadata: { road: { laneCount: 2, laneWidth: 50, leftShoulder: { enabled: true, width: 20 }, rightShoulder: { enabled: true, width: 20 } } } }), id: `road-${index}` }, { skipHistory: true }));
        window.krokiEditorCamera.writeViewBox(m.canvas, { x: 0, y: 0, width: 1200, height: 800 });
        await frame();
        engine.rebuild();
        const snapshot = () => ({
          surfaces: clone(engine.getLastRoadSurfaces()), intersections: clone(engine.getLastIntersectionShapes()),
          contours: clone(engine.getLastOuterContours()), q: clone(engine.getLastQSegments()), state: clone(engine.exportState()),
          boundaries: Array.from(m.getElement("island").querySelectorAll("path[data-road-boundary-id]")).map(node => ({
            boundary: node.dataset.roadBoundaryId, from: node.dataset.visibleFrom, to: node.dataset.visibleTo,
            width: node.getAttribute("stroke-width"), dash: node.getAttribute("stroke-dasharray"), cap: node.getAttribute("stroke-linecap")
          })),
          otherRoads: roads.map((_, index) => m.getElement(`road-${index}`).querySelectorAll("path")).map(nodes => Array.from(nodes).map(node => ({ d: node.getAttribute("d"), width: node.getAttribute("stroke-width") })))
        });
        const original = snapshot();
        if (fixture === "overlap") original.otherRoads.pop(); // The second island also receives the render optimization.
        const boundaryPaths = Array.from(m.getElement("island").querySelectorAll("path[data-road-boundary-id]"));
        const commands = boundaryPaths.reduce((sum, node) => sum + (node.getAttribute("d").match(/[MLAZ]/g) || []).length, 0);
        const bytes = boundaryPaths.reduce((sum, node) => sum + node.getAttribute("d").length, 0);
        if (analytic) boundaryPaths.forEach(node => {
          const d = node.getAttribute("d"), from = Number(node.dataset.visibleFrom), to = Number(node.dataset.visibleTo);
          check(!/L/.test(d) && /A/.test(d), "island boundary must be circular arcs");
          check((d.match(/A/g) || []).length === (to - from === 1 ? 2 : 1), "only full circle needs two arcs");
          check(d.endsWith("Z") === (to - from === 1), "partial arcs must stay open");
          check(Number.isFinite(node.getTotalLength()) && node.getTotalLength() > 0, "SVG arc is valid");
        });
        const geometryBefore = clone(m.get("island").geometry);
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
        const selection = adapter.createSelectionElement();
        adapter.renderSelection(selection, m.get("island"), {}, "edit");
        m.canvas.append(selection);
        check(!selection.isPointInFill(new DOMPoint(600, 400)), "selection must retain island hole");
        check(selection.isPointInFill(new DOMPoint(775, 400)), "selection must retain road band");
        selection.remove();
        check(adapter.hitTest(m.get("island"), { x: 775, y: 400 }, 0), "road ring hit test");
        check(!adapter.hitTest(m.get("island"), { x: 600, y: 400 }, 0), "center hole hit test");
        check(JSON.stringify(m.get("island").geometry) === JSON.stringify(geometryBefore), "render must not mutate model");
        // Public path helper: direction, large arcs, tiny clipped ranges and full rings.
        const helper = [];
        for (const [from, to] of [[0, 1], [0.1, 0.3], [0.1, 0.9], [0, 0.9995], [0.52, 0.52001]]) {
          for (const reverse of [false, true]) {
            const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
            node.setAttribute("d", adapter.offsetPathDataRange(island, 12, from, to, reverse));
            const a = node.getPointAtLength(0), b = node.getPointAtLength(node.getTotalLength());
            const pointAt = t => ({ x: 600 + Math.cos(-2 * Math.PI * t) * 187, y: 400 + Math.sin(-2 * Math.PI * t) * 187 });
            const expected = [pointAt(reverse ? to : from), pointAt(reverse ? from : to)];
            if (analytic) [a, b].forEach((point, i) => check(Math.hypot(point.x - expected[i].x, point.y - expected[i].y) < 0.02, "clipped/reversed endpoint is wrong"));
            if (analytic) for (const fraction of [0.25, 0.5, 0.75]) {
              const actual = node.getPointAtLength(node.getTotalLength() * fraction);
              const expectedPoint = pointAt(reverse ? to - (to - from) * fraction : from + (to - from) * fraction);
              check(Math.hypot(actual.x - expectedPoint.x, actual.y - expectedPoint.y) < 0.08, "arc sweep/direction is wrong");
            }
            helper.push(node.getAttribute("d"));
          }
        }
        return { fixture, original, edited, pathCount: boundaryPaths.length, commands, bytes };
      }, { fixture, analytic: !ref });
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
    current.forEach((result, index) => {
      const before = previous?.[index];
      if (before) {
        assert.deepEqual(result.original, before.original, `${result.fixture}: computed geometry, clipping, styles or non-island paths changed`);
        assert.deepEqual(result.edited, before.edited, `${result.fixture}: Q edits changed`);
        assert.equal(result.pathCount, before.pathCount, "one path per visible/style interval is preserved");
        assert.ok(result.commands < before.commands / 4, "arc command reduction regressed");
      }
      console.log(JSON.stringify({ case: result.fixture, paths: result.pathCount, commands: result.commands, bytes: result.bytes,
        ...(before ? { beforeCommands: before.commands, beforeBytes: before.bytes, unchangedGeometryAndQ: true } : {}) }));
    });
    console.log("PASS: circular island rendering, clipping, styles, Q state, ring selection and hit tests.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
