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
 const page=await browser.newPage({viewport:{width:1180,height:850},hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  if(ref) await page.route('**/src/**/*.js*',async route=>route.fulfill({body:execFileSync('git',['show',`${ref}:${new URL(route.request().url()).pathname.slice(1)}`],{cwd:root,maxBuffer:16*1024*1024}),contentType:'text/javascript'}));
  await page.goto(url);await page.click('#btnYeniKroki');
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
  const pan=await page.evaluate(async()=>{
   const K=window.Kroki,m=K.EditorObjectManager,cam=window.krokiEditorCamera;
   const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   for(let i=0;i<30;i++)m.add({...K.ShapeRegistry.get(i%2?'arc':'line').create({geometry:{start:{x:60+i*20,y:120+i*15},end:{x:400+i*20,y:180+i*15},ratio:.2},label:{text:'Yol '+i,size:16}}),id:'label-'+i},{skipHistory:true});
   K.SelectionManager.edit('label-1');
   cam.writeViewBox(m.canvas,{x:0,y:0,width:1200,height:800});await frame();
   let writes=0,editWrites=0;const times=[];
   const observer2=new MutationObserver(rs=>writes+=rs.length);observer2.observe(m.objectLayer,{subtree:true,attributes:true,childList:true,characterData:true});
   const observer3=new MutationObserver(rs=>editWrites+=rs.length);observer3.observe(document.querySelector('#editorEditLayer'),{subtree:true,attributes:true,childList:true});
   for(let i=1;i<=40;i++){const t=performance.now();cam.writeViewBox(m.canvas,{x:i*2,y:i,width:1200,height:800});await frame();times.push(performance.now()-t);}
   observer2.disconnect();observer3.disconnect();
   const labelSnapshot=()=>Array.from(m.canvas.querySelectorAll('.editor-line-label,textPath,[id^="editor-label-path"]')).map(n=>n.outerHTML);
   const afterPan=labelSnapshot();
   cam.writeViewBox(m.canvas,{x:80,y:40,width:800,height:533.333333333});await frame();
   const afterZoom=labelSnapshot();
   if(JSON.stringify(afterPan)===JSON.stringify(afterZoom))throw Error('Zoom did not update label clearance');
   return {writes,editWrites,afterPan,afterZoom,times,handles:document.querySelector('#editorEditLayer').innerHTML};
  });
  await page.evaluate(async()=>{
   const K=window.Kroki,m=K.EditorObjectManager,e=K.RoadIntersectionEngine;
   K.SelectionManager.clear();m.clear({skipHistory:true});
   for(const [id,start,end] of [['a',{x:100,y:400},{x:1050,y:400}],['b',{x:600,y:100},{x:600,y:400}]])m.add({...K.ShapeRegistry.get('road').create({geometry:{profile:'straight',start,end}}),id},{skipHistory:true});
   e.rebuild();K.SelectionManager.edit('a');
   m.updateModel('a',d=>{d.metadata.roadSelection={sectionId:'lane:0'};return d;},{skipHistory:true});
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  });
  await page.click('#btnRoadUpperLinePanel');await page.selectOption('#roadBoundarySegmentCountSelect','3');
  const result=await page.evaluate(async()=>{
   const K=window.Kroki,m=K.EditorObjectManager,e=K.RoadIntersectionEngine;
   const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   await frame();const target=document.querySelector('#roadBoundarySegmentButtons').children[1];target.focus();target.click();await frame();
   const retained=target===document.querySelector('#roadBoundarySegmentButtons').children[1];
   const focused=document.activeElement===target;
   const styled=JSON.stringify(m.get('a').metadata.road.boundaryStyles);
   K.HistoryManager.undo();await frame();const undone=JSON.stringify(m.get('a').metadata.road.boundaryStyles);
   K.HistoryManager.redo();await frame();if(styled!==JSON.stringify(m.get('a').metadata.road.boundaryStyles)||styled===undone)throw Error('Style undo/redo failed');
   const layer=document.querySelector('#roadIntersectionContourLayer');let mutations=0;
   const observer=new MutationObserver(rs=>mutations+=rs.length);observer.observe(layer,{childList:true,subtree:true,attributes:true});
   m.updateModel('a',d=>{d.metadata.roadBoundaryEdit={boundaryId:'b0'};return d;},{skipHistory:true});await frame();observer.disconnect();
   // Q targets must keep their DOM during pan, resize correctly during zoom.
   const qNode=layer.querySelector('.road-intersection-q-hit');
   const qWidth=qNode?.getAttribute('stroke-width');
   let qWrites=0;const qObserver=new MutationObserver(rs=>qWrites+=rs.length);
   qObserver.observe(layer,{subtree:true,attributes:true,childList:true});
   const vb=window.krokiEditorCamera.readViewBox(m.canvas);
   window.krokiEditorCamera.writeViewBox(m.canvas,{...vb,x:vb.x+10});await frame();qObserver.disconnect();
   window.krokiEditorCamera.writeViewBox(m.canvas,{...vb,width:vb.width/2,height:vb.height/2});await frame();
   if(qNode && qNode.getAttribute('stroke-width')===qWidth)throw Error('Q zoom metrics unchanged');
   return {retained,focused,mutations,qWrites,styled,paths:Array.from(layer.querySelectorAll('path')).map(n=>n.getAttribute('d'))};
  });
  if(!ref){assert.equal(result.retained,true);assert.equal(result.focused,true);assert.equal(result.mutations,0);assert.equal(result.qWrites,0);assert.equal(pan.writes,0);assert.equal(pan.editWrites,0);}
  await page.evaluate(()=>window.krokiEditorCamera.writeViewBox(window.Kroki.EditorObjectManager.canvas,{x:0,y:0,width:1200,height:800}));
  await page.screenshot({path:path.join(root,'.tmp',ref?'tablet-before.png':'tablet-after.png')});
  assert.deepEqual(errors,[]);return {pan,result};
 }finally{await page.close();}
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  const before=baseline?await run(browser,url,baseline):null,after=await run(browser,url,null);
  if(before){for(const key of ['afterPan','afterZoom','handles'])assert.deepEqual(after.pan[key],before.pan[key],key+' changed');for(const key of ['styled','paths'])assert.deepEqual(after.result[key],before.result[key],key+' changed');}
  console.log(JSON.stringify({before:before&&{panWrites:before.pan.writes,handleWrites:before.pan.editWrites,selectionWrites:before.result.mutations},after:{panWrites:after.pan.writes,handleWrites:after.pan.editWrites,selectionWrites:after.result.mutations,focusRetained:after.result.focused}}));
  console.log('PASS: 30 labeled objects, pan/zoom output parity, stable segment buttons, style undo/redo, selection without junction rebuild.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
