// Run with Playwright available through NODE_PATH; optional TEST_BASE_URL tests Pages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", "road-center-guide");
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
 const page=await browser.newPage({hasTouch:true,viewport:{width:1200,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=camera-recovery`);
  await page.click('#btnYeniKroki');
  await page.evaluate(()=>{window.__touchIds=[];document.querySelector('#editorCanvas').addEventListener('pointerdown',e=>window.__touchIds.push(e.pointerId),true)});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const state=()=>page.evaluate(()=>window.krokiEditorCamera.getGestureDiagnostics());
  const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([id,x,y])=>({id,x,y,radiusX:4,radiusY:4,force:1}))});
  const checkIdle=async()=>{const d=await state();assert.equal(d.activePointers,0);assert.equal(d.pan,false);assert.equal(d.pinch,false)};
  for(const interruption of ['normal','blur','pagehide','capture','cancel','hidden','orientation']){
   const fixture=await page.evaluate(()=>{
    const K=window.Kroki,m=K.EditorObjectManager,c=window.krokiEditorCamera;
    K.SelectionManager.clear();m.clear({skipHistory:true});c.writeViewBox(m.canvas,{x:0,y:0,width:1200,height:800});
    const model=m.create('road',{start:{x:300,y:300},end:{x:900,y:300},metadata:{road:{laneCount:2,laneWidth:50}}},{skipHistory:true});K.SelectionManager.preselect(model.id);
    const point=m.canvas.createSVGPoint();point.x=600;point.y=300;const p=point.matrixTransform(m.canvas.getScreenCTM());
    return {x:p.x,y:p.y,id:model.id,before:JSON.stringify(model.geometry)};
   });
   const {x,y}=fixture;
   await touch('touchStart',[[1,x,y]]);
   await touch('touchStart',[[1,x,y],[2,x+100,y+100]]);
   await touch('touchMove',[[1,x-25,y-25],[2,x+125,y+125]]);
   assert.equal((await state()).pinch,true,'Preselected road enters pinch');
   if(interruption==='normal'){
    await touch('touchEnd',[[1,x-25,y-25]]);assert.equal((await state()).pan,true,'Pinch continues as one-finger pan');
   }else if(interruption==='cancel'){await touch('touchCancel',[]);}
   else await page.evaluate(kind=>{
    const canvas=document.querySelector('#editorCanvas');
    if(kind==='capture'){
     // Force a genuine browser lostpointercapture event for a captured pointer.
     const ids=window.__touchIds||[];for(const id of ids)if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    }else if(kind==='hidden'){
     Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;
    }else window.dispatchEvent(new Event(kind==='orientation'?'orientationchange':kind));
   },interruption);
   if(interruption==='capture')await touch('touchMove',[[1,x-26,y-26],[2,x+126,y+126]]);
   if(interruption!=='normal'){await page.waitForTimeout(50);try{await checkIdle()}catch(e){throw Error(interruption+': '+e.message)}}
   if(interruption!=='cancel')await touch('touchEnd',[]);await page.waitForTimeout(50);await checkIdle();
   const clean=await page.evaluate(({id,before})=>{
    const K=window.Kroki,m=K.EditorObjectManager;
    return {geometry:JSON.stringify(m.get(id).geometry)===before,visible:getComputedStyle(m.getElement(id)).visibility!=='hidden',suspended:K.RoadIntersectionEngine.isSuspended(),canvas:getComputedStyle(m.canvas).display};
   },fixture);
   assert.equal(clean.geometry,true);assert.equal(clean.visible,true);assert.equal(clean.suspended,false);assert.notEqual(clean.canvas,'none');
  }
  // A real road drag hides its source; backgrounding must restore it.
  const dragPoint=await page.evaluate(()=>{
   const K=window.Kroki,m=K.EditorObjectManager,model=m.getAll()[0];K.SelectionManager.edit(model.id);
   const c=m.canvas,r=c.getBoundingClientRect();return {x:r.left+r.width*.65,y:r.top+r.height*.78,id:model.id};
  });
  await touch('touchStart',[[1,dragPoint.x,dragPoint.y]]);
  await touch('touchMove',[[1,dragPoint.x+35,dragPoint.y+20]]);
  await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'))});
  await touch('touchEnd',[]);
  assert.equal(await page.evaluate(id=>getComputedStyle(window.Kroki.EditorObjectManager.getElement(id)).visibility,dragPoint.id),'visible');
  assert.equal(await page.evaluate(()=>window.Kroki.RoadIntersectionEngine.isSuspended()),false);
  // Missing release outside canvas must not poison the following gesture.
  await page.evaluate(()=>{
   const c=document.querySelector('#editorCanvas');c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:99,pointerType:'touch',clientX:100,clientY:700,bubbles:true}));
   document.body.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,pointerType:'touch',bubbles:true}));
  });await checkIdle();assert.deepEqual(errors,[]);
  console.log('PASS: preselection pinch/pan, interruption recovery, visible road preview restoration, 4x CPU throttle');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
