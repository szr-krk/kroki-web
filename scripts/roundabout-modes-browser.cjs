// Run with Playwright available through NODE_PATH; optional TEST_BASE_URL tests Pages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", "roundabout-modes");
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

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const page=await browser.newPage({viewport:{width:1600,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=roundabout-modes`);await page.click('#btnYeniKroki');
 const svg=fs.readFileSync(process.env.KROKI_FIXTURE,'utf8');const doc=JSON.parse(svg.match(/<metadata[^>]*id="krokiProDocument"[^>]*>([\s\S]*?)<\/metadata>/)[1]).document;
 const fixture=await page.evaluate(doc=>{
 const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get('road'),e=K.RoadIntersectionEngine;
 K.DocumentSerializer.fromJson(JSON.stringify(doc));e.rebuild();
 const island=m.getAll().find(x=>x.geometry.profile==='islandRing');
 if(a.roadConfig(island).islandMode!=='classic')throw Error('Legacy defaults classic');
 m.updateGeometry(island.id,d=>{a.setIslandOuterDiameter(d,1200);return d;},{skipHistory:true});e.rebuild();
 K.SelectionManager.edit(island.id);return {id:island.id,geometry:JSON.stringify(m.get(island.id).geometry)};
 },doc);
 const checkClassic=async()=>page.evaluate(()=>{
 const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get('road'),e=K.RoadIntersectionEngine;
 const roads=m.getAll().filter(x=>x.geometry.profile!=='islandRing');
 for(const road of roads){
 const bs=a.crossSection(a.roadConfig(road)).boundaries;
 for(const b of bs.filter(b=>b.role==='marking'))if(JSON.stringify(e.visibleRangesForLine(road.id,b.offset,0,1,b))!==JSON.stringify([{from:0,to:1}]))throw Error('Classic marking erased');
 const dashed=[...m.getElement(road.id).querySelectorAll('[data-island-mouth-dash]')];
 if(!dashed.length)throw Error('Missing entry dashes');
 const p=a.pointAt(road,.5),t=a.tangentAt(road,.5),ic=m.getAll().find(x=>x.geometry.profile==='islandRing').geometry.center;
 const center=Math.sign((ic.x-p.x)*-t.y+(ic.y-p.y)*t.x);
 for(const p of dashed){const b=bs.find(b=>b.id===p.dataset.roadBoundaryId);if(Math.sign(b.offset)!==center)throw Error('Opposite shoulder dashed');}
 }
 const layer=document.querySelector('#roadIntersectionContourLayer');const box=layer.getBBox();
 if(box.y<130||box.y+box.height>670)throw Error('Classic circle protrudes: '+JSON.stringify({y:box.y,h:box.height}));
 const island=m.getAll().find(x=>x.geometry.profile==='islandRing');
 const ib=m.getElement(island.id).getBBox();if(ib.y<130||ib.y+ib.height>670)throw Error('Island own contour protrudes');
 });
 await checkClassic();await page.screenshot({path:path.join(output,'classic.png')});
 await page.click('#btnRoadProfileIp');await page.waitForTimeout(120);
 await page.evaluate(({id,geometry})=>{
 const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get('road'),e=K.RoadIntersectionEngine; e.rebuild();
 if(m.get(id).metadata.road.islandMode!=='modern')throw Error('Toggle failed');if(JSON.stringify(m.get(id).geometry)!==geometry)throw Error('Geometry changed');
 if(document.querySelector('[data-island-mouth-dash]'))throw Error('Modern generated entry dashes');
 const road=m.getAll().find(x=>x.id!==id),b=a.crossSection(a.roadConfig(road)).boundaries.find(b=>b.role==='marking');
 if(e.visibleRangesForLine(road.id,b.offset,0,1,b).some(r=>r.from<.5&&r.to>.5))throw Error('Modern did not clear markings');
 K.HistoryManager.undo();e.rebuild();
 },fixture);await checkClassic();
 await page.evaluate(()=>{window.Kroki.HistoryManager.redo();window.Kroki.RoadIntersectionEngine.rebuild()});
 await page.screenshot({path:path.join(output,'modern.png')});
 await page.evaluate(({id})=>{
 const K=window.Kroki,m=K.EditorObjectManager,e=K.RoadIntersectionEngine;const json=K.DocumentSerializer.toJson();K.DocumentSerializer.fromJson(json);e.rebuild();
 if(m.get(id).metadata.road.islandMode!=='modern')throw Error('Mode not saved');
 const fresh=m.create('road',{geometry:{profile:'islandRing',center:{x:0,y:0},innerDiameter:100,outerDiameter:300}},{skipHistory:true});if(fresh.metadata.road.islandMode!=='modern')throw Error('New default not modern');
 },fixture);
 assert.deepEqual(errors,[]);console.log('PASS: oversized classic envelope, entry-only dashes, modern clipping, UI toggle, geometry preservation, undo/redo, save and new default');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
