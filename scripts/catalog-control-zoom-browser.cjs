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

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 const page=await browser.newPage({viewport:{width:1400,height:1000}});
 try{
 await page.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=catalog-zoom`);await page.click('#btnYeniKroki');
 const result=await page.evaluate(async()=>{
 const K=window.Kroki,m=K.EditorObjectManager,cp=K.ControlPointManager,sel=K.SelectionManager,svg=m.canvas;
 const check=(v,t)=>{if(!v)throw Error(t)};
 const signs=K.TrafficSignCatalog.all();
 const models=[...['TT-1','TT-2','B-13b'].map(code=>m.create('trafficSign',{sign:signs.find(s=>s.code===code),center:{x:500,y:400}},{skipHistory:true})),m.create('otherSymbol',{symbol:K.OtherSymbolCatalog.all()[0],center:{x:500,y:400}},{skipHistory:true}),m.create('vehicle',{center:{x:500,y:400}},{skipHistory:true})];
 const measurements=[];
 for(const model of models){
  sel.preselect(model.id);
  const a=m.getAdapter(model);
  // Independent selection-outline edge, with the local rotation initially zero.
  const outline=svg.querySelector('[data-selection-type]'); const b=outline.getBBox();
  const d=outline.getAttribute('d')||'';
  const triangle=outline.tagName==='path'&&!d.includes('A')&&(d.match(/L/g)||[]).length===2;
  const edge=(b.x+b.width/2-model.geometry.cx)+(triangle?b.width/4:b.width/2);
  for(const width of [4000,1600,400,100]){
   window.krokiEditorCamera.writeViewBox(svg,{x:500-width/2,y:400-width*.35,width,height:width*.7});
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const metrics=cp.metrics(),point=a.getControlPoints(m.get(model.id),metrics)[0];
   const gap=(Math.hypot(point.x-model.geometry.cx,point.y-model.geometry.cy)-edge)/metrics.unit;
   check(Math.abs(gap-48)<.05,`${model.type} gap ${gap} at ${width}`);
   const handle=svg.querySelector('.editor-object-cp[data-point="rotate"]');
   const hit=handle.querySelector('.editor-object-cp-hit').getBoundingClientRect();
   check(Math.abs(hit.width-72)<.1,'Constant touch target');
   const icon=handle.querySelector('path'),size=icon.getBoundingClientRect();
   check(Math.abs(size.height-31.5)<.1,'Constant larger rotation icon');
   check(getComputedStyle(icon).fillOpacity==='0.85','Catalog icon opacity');
   measurements.push({type:model.type,width,gap});
  }
  m.updateGeometry(model.id,draft=>{draft.geometry.rotation=67;return draft;},{skipHistory:true});
  const metrics=cp.metrics(),point=a.getControlPoints(m.get(model.id),metrics)[0];
  check(Math.abs((Math.hypot(point.x-model.geometry.cx,point.y-model.geometry.cy)-edge)/metrics.unit-48)<.05,'Rotated spacing');
  sel.edit(model.id);check(svg.querySelector('.is-catalog-control'),'Edit control scope');
 }
 const line=m.create('line',{start:{x:200,y:200},end:{x:400,y:400}},{skipHistory:true});sel.preselect(line.id);
 check(!svg.querySelector('.is-catalog-control'),'Drawing tools unchanged');
 return measurements;
 });console.log('PASS catalog controls zoom',JSON.stringify(result));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
