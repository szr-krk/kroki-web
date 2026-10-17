// Run with Playwright available through NODE_PATH; optional TEST_BASE_URL tests Pages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", "divided-island");
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
 await page.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=divided-island`);await page.click('#btnYeniKroki');
 await page.evaluate(()=>{window.runDividedCase=(profile,vertical,inner,mode='classic',offset=0)=>{
 const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get('road'),e=K.RoadIntersectionEngine;
 K.SelectionManager.clear();m.clear({skipHistory:true});
 const road=m.create('road',{geometry:{profile,start:vertical?{x:800,y:-200}:{x:200,y:400},end:vertical?{x:800,y:1000}:{x:1400,y:400},ratio:.12,controls:vertical?[{x:720,y:200},{x:880,y:600}]:[{x:600,y:320},{x:1000,y:480}]},metadata:{road:{laneCount:2,laneWidth:50,divided:true,dividedLaneWidths:{left:[50,50],right:[50,50]},leftShoulder:{enabled:true,width:20},rightShoulder:{enabled:true,width:20},innerShoulder:{enabled:inner,width:20},waterChannel:{enabled:true,width:350}}}},{skipHistory:true});
 const center=a.pointAt(road,.5),tangent=a.tangentAt(road,.5),len=Math.hypot(tangent.x,tangent.y);
 const island=m.create('road',{geometry:{profile:'islandRing',center:{x:center.x-offset*tangent.y/len,y:center.y+offset*tangent.x/len},innerDiameter:160,outerDiameter:650},metadata:{road:{islandMode:mode}}},{skipHistory:true});e.rebuild();
 const bs=a.crossSection(a.roadConfig(road)).boundaries;
 const dashes=[...m.getElement(road.id).querySelectorAll('[data-island-mouth-dash]')].map(p=>({id:p.dataset.roadBoundaryId,from:+p.dataset.visibleFrom,to:+p.dataset.visibleTo}));
 return {road:road.id,island:island.id,bs:bs.map(b=>({id:b.id,role:b.role,roles:[b.before?.role,b.after?.role],ranges:e.visibleRangesForLine(road.id,b.offset,0,1,b)})),dashes,contours:e.getLastOuterContours(),islandPaths:m.getElement(island.id).innerHTML};
 }});
 for(const profile of ['straight','arc','sCurve'])for(const vertical of [false,true])for(const inner of [false,true]){
 const r=await page.evaluate(({profile,vertical,inner})=>window.runDividedCase(profile,vertical,inner),{profile,vertical,inner});
 assert.ok(r.dashes.length>=2,'Both carriageways have entry dashes');
 for(const d of r.dashes){const b=r.bs.find(b=>b.id===d.id);assert.ok(b.roles.includes('lane'));assert.ok(b.roles.includes(inner?'innerShoulder':'waterChannel'));assert.ok(!b.roles.includes('shoulder'),'Never outside shoulder');}
 for(const b of r.bs.filter(b=>b.role==='marking'||(b.roles.includes('shoulder')&&b.roles.includes('lane'))))assert.deepEqual(b.ranges,[{from:0,to:1}],'Outside shoulders and lane markings preserved');
 if(inner)for(const b of r.bs.filter(b=>b.role==='channel'))assert.ok(!b.ranges.some(r=>r.from<=.5&&r.to>=.5),'Channel opens at island');
 if(profile==='straight'&&!vertical&&inner){
 await page.screenshot({path:path.join(output,'divided-classic.png')});
 await page.evaluate(({island})=>{const K=window.Kroki,m=K.EditorObjectManager;const transaction=K.HistoryManager.begin('Move island');m.updateGeometry(island,d=>{d.geometry.center.x+=2000;return d;},{skipHistory:true});K.HistoryManager.commit(transaction);K.RoadIntersectionEngine.rebuild();if(document.querySelector('[data-island-mouth-dash]'))throw Error('Stale dashes');K.HistoryManager.undo();K.RoadIntersectionEngine.rebuild();},r);
 assert.ok(await page.locator('[data-island-mouth-dash]').count()>0);
 await page.evaluate(()=>{const K=window.Kroki;K.DocumentSerializer.fromJson(K.DocumentSerializer.toJson());K.RoadIntersectionEngine.rebuild()});assert.ok(await page.locator('[data-island-mouth-dash]').count()>0);
 }
 }
 // Optional real SVG regression: visible exterior must follow the concave road edge.
 if(process.env.CURVED_ISLAND_FIXTURE){
 const svg=fs.readFileSync(process.env.CURVED_ISLAND_FIXTURE,'utf8');
 const doc=JSON.parse(svg.match(/<metadata[^>]*id="krokiProDocument"[^>]*>([\s\S]*?)<\/metadata>/)[1]).document;
 await page.evaluate(doc=>{
 const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get('road');
 K.DocumentSerializer.fromJson(JSON.stringify(doc));K.RoadIntersectionEngine.rebuild();
 const road=m.getAll().find(x=>x.geometry.profile==='arc'),island=m.getAll().find(x=>x.geometry.profile==='islandRing');
 const bs=a.crossSection(a.roadConfig(road)).boundaries,lo=Math.min(...bs.map(b=>b.offset)),hi=Math.max(...bs.map(b=>b.offset));
 const samples=Array.from({length:2001},(_,i)=>a.pointAt(road,i/2000));
 const paths=[...document.querySelectorAll('#roadIntersectionContourLayer path'),...m.getElement(island.id).querySelectorAll('path')];
 let checked=0;
 for(const path of paths){
 if(path.closest('defs'))continue;
 const length=path.getTotalLength();
 for(let d=0;d<=length;d+=2){
 const p=path.getPointAtLength(d),c=island.geometry.center;
 if(Math.hypot(p.x-c.x,p.y-c.y)<=island.geometry.innerDiameter/2+2)continue;
 let nearest=Infinity,offset=0;
 for(let i=1;i<samples.length;i++){
 const a=samples[i-1],b=samples[i],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);
 const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(L*L)));
 const x=p.x-a.x-dx*t,y=p.y-a.y-dy*t,dist=Math.hypot(x,y);
 if(dist<nearest){nearest=dist;offset=(-dy*x+dx*y)/L;}
 }
 if(offset<lo-2||offset>hi+2)throw Error('Visible arc protrudes beyond curved road: '+JSON.stringify({x:p.x,y:p.y,offset,lo,hi}));
 checked++;
 }
 }
 if(!checked)throw Error('No exterior samples checked');
 },doc);
 await page.screenshot({path:path.join(output,'curved-fixture.png')});
 }
 // Compare unaffected cases to the committed engine in a separate page.
 if(!process.env.TEST_BASE_URL){
 const original=require('node:child_process').execFileSync('git',['show','HEAD:src/core/roadIntersectionEngine.js'],{cwd:root,encoding:'utf8'});
 const baseline=await browser.newPage();await baseline.route('**/src/core/roadIntersectionEngine.js*',route=>route.fulfill({contentType:'application/javascript',body:original}));
 await baseline.goto(`http://127.0.0.1:${server.address().port}/`);await baseline.click('#btnYeniKroki');
 await baseline.evaluate(await page.evaluate(()=>window.runDividedCase.toString()).then(fn=>'window.runDividedCase='+fn));
 for(const [mode,offset] of [['modern',0],['classic',450]]){
 const get=async p=>p.evaluate(({mode,offset})=>window.runDividedCase('straight',false,true,mode,offset),{mode,offset});
 const before=await get(baseline),after=await get(page);
 assert.deepEqual(after.bs,before.bs,'Unaffected visible ranges');assert.deepEqual(after.dashes,before.dashes,'Unaffected dash ranges');
 assert.deepEqual(after.contours.map(c=>c.d),before.contours.map(c=>c.d),'Unaffected exterior contours');
 }await baseline.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: 12 divided road cases, inward entry dashes, channel openings, undo/import, modern and off-channel baseline comparison');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
