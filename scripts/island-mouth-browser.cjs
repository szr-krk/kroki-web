// Run with Playwright available through NODE_PATH; optional TEST_BASE_URL tests Pages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", "island-mouth");
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
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const page=await browser.newPage({viewport:{width:1600,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=island-mouth`);
  await page.click('#btnYeniKroki');
  if(process.env.KROKI_FIXTURE){
   const svg=fs.readFileSync(process.env.KROKI_FIXTURE,'utf8');
   const metadata=JSON.parse(svg.match(/<metadata[^>]*id="krokiProDocument"[^>]*>([\s\S]*?)<\/metadata>/)[1]);
   await page.evaluate(doc=>{window.Kroki.DocumentSerializer.fromJson(JSON.stringify(doc));window.Kroki.RoadIntersectionEngine.rebuild();},metadata.document);
   await page.screenshot({path:path.join(output,'provided-example.png')});
   const result=await page.evaluate(()=>{
    const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get('road'),e=K.RoadIntersectionEngine;
    return m.getAll().filter(x=>x.geometry.profile!=='islandRing').map(model=>({
     markings:a.crossSection(model.metadata.road).boundaries.filter(b=>b.role==='marking').map(b=>e.visibleRangesForLine(model.id,b.offset,0,1,b)),
     dashes:m.getElement(model.id).querySelectorAll('[data-island-mouth-dash]').length
    }));
   });
   for(const road of result){assert.ok(road.dashes>0);for(const ranges of road.markings)assert.deepEqual(ranges,[{from:0,to:1}]);}
  }
  const results=await page.evaluate(()=>{
   const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get('road'),e=K.RoadIntersectionEngine;
   const check=(v,t)=>{if(!v)throw Error(t)};
   const contains=(rs,t)=>rs.some(r=>r.from<=t&&r.to>=t);
   const results=[];
   for(const profile of ['straight','arc','sCurve'])for(const divided of [false,true])for(const shoulder of [false,true]){
    K.SelectionManager.clear();m.clear({skipHistory:true});
    const road=m.create('road',{geometry:{profile,start:{x:0,y:0},end:{x:1000,y:0},ratio:.1,controls:[{x:300,y:-60},{x:700,y:60}]},metadata:{road:{laneCount:2,laneWidth:50,laneWidths:[50,50],divided,dividedLaneWidths:{left:[50,50],right:[50,50]},leftShoulder:{enabled:shoulder,width:20},rightShoulder:{enabled:shoulder,width:20}}}},{skipHistory:true});
    const center=a.pointAt(road,.5);
    const island=m.create('road',{geometry:{profile:'islandRing',center:{x:center.x,y:center.y+180},innerDiameter:100,outerDiameter:600}},{skipHistory:true});
    e.rebuild();
    const boundaries=a.crossSection(road.metadata.road).boundaries;
    for(const b of boundaries.filter(b=>b.role==='marking')){
     check(contains(e.visibleRangesForLine(road.id,b.offset,0,1,b),.5),'Lane markings survive '+profile);
     check(!e.islandMouthDashedRangesForLine(road.id,b.offset,0,1,b).length,'Never dash lane divider');
    }
    const dashes=m.getElement(road.id).querySelectorAll('[data-island-mouth-dash]');
    check(shoulder?dashes.length>0:dashes.length===0,'Shoulder role selection '+profile);
    for(const p of dashes)check(p.getAttribute('stroke-dasharray')==='18 14','Derived style is dashed');
    const initialDash=JSON.stringify([...dashes].map(p=>[p.dataset.visibleFrom,p.dataset.visibleTo]));
    const transaction=K.HistoryManager.begin('Resize island');
    m.updateGeometry(island.id,d=>{d.geometry.outerDiameter=800;return d;},{skipHistory:true});
    K.HistoryManager.commit(transaction);e.rebuild();
    const widerDash=JSON.stringify([...m.getElement(road.id).querySelectorAll('[data-island-mouth-dash]')].map(p=>[p.dataset.visibleFrom,p.dataset.visibleTo]));
    if(shoulder)check(initialDash!==widerDash,'Diameter updates dashed extent');
    K.HistoryManager.undo();e.rebuild();
    check(JSON.stringify([...m.getElement(road.id).querySelectorAll('[data-island-mouth-dash]')].map(p=>[p.dataset.visibleFrom,p.dataset.visibleTo]))===initialDash,'Undo restores dashed extent');
    K.HistoryManager.redo();e.rebuild();
    check(JSON.stringify([...m.getElement(road.id).querySelectorAll('[data-island-mouth-dash]')].map(p=>[p.dataset.visibleFrom,p.dataset.visibleTo]))===widerDash,'Redo restores dashed extent');
    const saved=JSON.stringify(road.metadata.road.boundaryStyles);
    const before=JSON.stringify(e.getLastOuterContours());
    e.rebuild();check(JSON.stringify(e.getLastOuterContours())===before,'Deterministic contours');
    const doc=K.DocumentSerializer.toJson();check(K.DocumentSerializer.fromJson(doc).ok,'Round trip');e.rebuild();
    check(JSON.stringify(m.get(road.id).metadata.road.boundaryStyles)===saved,'No generated segments persisted');
    m.updateGeometry(island.id,d=>{d.geometry.center.y+=2000;return d;},{skipHistory:true});e.rebuild();
    check(!m.getElement(road.id).querySelector('[data-island-mouth-dash]'),'Move away clears derived dashes');
    results.push([profile,divided,shoulder]);
   }
   // A physical island still masks otherwise protected lane markings.
   m.clear({skipHistory:true});
   const road=m.create('road',{start:{x:0,y:0},end:{x:1000,y:0},metadata:{road:{laneCount:2,laneWidth:50}}},{skipHistory:true});
   m.create('road',{geometry:{profile:'islandRing',center:{x:500,y:0},innerDiameter:160,outerDiameter:400}},{skipHistory:true});e.rebuild();
   const b=a.crossSection(road.metadata.road).boundaries.find(b=>b.role==='marking');
   check(!contains(e.visibleRangesForLine(road.id,b.offset,0,1,b),.5),'Physical island excludes marking');
   // A normal crossing next to an island must still clip normal road markings.
   m.clear({skipHistory:true});
   const host=m.create('road',{start:{x:0,y:0},end:{x:1000,y:0},metadata:{road:{laneCount:2,laneWidth:50,leftShoulder:{enabled:true,width:20}}}},{skipHistory:true});
   m.create('road',{start:{x:500,y:-400},end:{x:500,y:400},metadata:{road:{laneCount:2,laneWidth:50}}},{skipHistory:true});e.rebuild();
   const marking=a.crossSection(host.metadata.road).boundaries.find(b=>b.role==='marking');
   const ordinary=e.visibleRangesForLine(host.id,marking.offset,0,1,marking);
   m.create('road',{geometry:{profile:'islandRing',center:{x:600,y:180},innerDiameter:100,outerDiameter:600}},{skipHistory:true});e.rebuild();
   check(JSON.stringify(e.visibleRangesForLine(host.id,marking.offset,0,1,marking))===JSON.stringify(ordinary),'Mixed island/normal crossing retains normal clipping');
   const edge=a.crossSection(host.metadata.road).boundaries.find(b=>b.role==='edge'&&b.before&&b.after);
   m.updateModel(host.id,d=>{d.metadata.road.boundaryStyles[edge.id]={style:'solid',width:3,segments:[{from:0,to:.4,style:'solid',width:3},{from:.4,to:.6,style:'none',width:3},{from:.6,to:1,style:'doubleSolid',width:3}]};return d;},{skipHistory:true});e.rebuild();
   for(const p of m.getElement(host.id).querySelectorAll('[data-island-mouth-dash]')){
    check(Number(p.dataset.visibleTo)<=.40001||Number(p.dataset.visibleFrom)>=.59999,'Hidden segment stays hidden');
    check(p.getAttribute('stroke-width')==='3','Custom width retained');
   }
   return results;
  });
  assert.equal(results.length,12);assert.deepEqual(errors,[]);
  console.log('PASS: provided SVG, 12 road/shoulder/divided combinations, physical island clipping, move/rebuild, serialization, styles');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
