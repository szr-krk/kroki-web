// Run with Playwright available through NODE_PATH; optional TEST_BASE_URL tests Pages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".tmp", "path-traces");
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
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
 await page.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=path-traces`);
 await page.click('#btnYeniKroki');
 const ids=await page.evaluate(()=>{
 const K=window.Kroki,m=K.EditorObjectManager;
 const ids=[];
 for(const [i,choice] of K.PathTracePatterns.choices.filter(c=>c.id!=='none').entries()) {
 const type=['line','arc','bezier'][i%3], y=100+i*105;
 const model=m.create(type,{start:{x:100,y},end:{x:750,y},bezierType:'cubic',style:{strokeWidth:32,pathPattern:choice.id},label:{text:choice.title,size:16}},{skipHistory:true});
 if(type==='bezier')m.updateGeometry(model.id,d=>{d.geometry.c1={x:280,y:y-90};d.geometry.c2={x:530,y:y+90};return d;},{skipHistory:true});
 ids.push(model.id);
 }
 const cat=K.OtherSymbolCatalog.all(),index=cat.findIndex(x=>x.name==='ÇARPMA NOKTASI'),blood=cat[index+1];
 if(blood?.name!=='KAN İZİ')throw Error('Blood not next to impact');
 const symbol=m.create('otherSymbol',{geometry:{cx:900,cy:160,scale:1.6,rotation:20},metadata:K.OtherSymbolCatalog.metadataFor(blood)},{skipHistory:true});
 ids.push(symbol.id);K.SelectionManager.edit(ids[0]);return ids;
 });
 await page.click('#btnLineStyle');
 await page.click('#btnLinePanelFillPattern');
 assert.equal(await page.locator('[data-path-pattern-choice]:visible').count(),7);
 assert.equal(await page.locator('[data-fill-pattern]:visible').count(),0);
 await page.click('[data-path-pattern-choice="mud"]');
 assert.equal(await page.evaluate(id=>Kroki.EditorObjectManager.get(id).style.pathPattern,ids[0]),'mud');
 await page.click('#btnPathPatternReverse');
 assert.equal(await page.evaluate(id=>Kroki.EditorObjectManager.get(id).style.pathPatternReverse,ids[0]),true);
 await page.screenshot({path:path.join(output,'trace-panel.png')});
 await page.evaluate(()=>{Kroki.HistoryManager.undo()});
 assert.equal(await page.evaluate(id=>Kroki.EditorObjectManager.get(id).style.pathPatternReverse,ids[0]),false);
 await page.evaluate(()=>{Kroki.HistoryManager.redo()});
 await page.evaluate(ids=>{
 const K=Kroki,m=K.EditorObjectManager;
 for(const id of ids.slice(0,6)){
 const model=m.get(id),el=m.getElement(id),paint=el.getAttribute('stroke');
 if(!paint.startsWith('url(#editor-fill-pattern-trace-'))throw Error('Missing trace paint');
 const pattern=document.querySelector(paint.slice(4,-1));
 if(!pattern||!pattern.querySelector('path'))throw Error('Missing texture');
 if(pattern.children.length>8)throw Error('Unbounded DOM');
 const before=pattern.innerHTML;
 m.updateGeometry(id,d=>{K.ShapeRegistry.get(d.type).move(d,15,10);return d;},{skipHistory:true});
 if(pattern.innerHTML===before)throw Error('Texture did not move');
 const read=K.StyleManager.readStyleFromElement(el,model.type);
 if(read.pathPattern!==model.style.pathPattern)throw Error('DOM style lost');
 }
 const original=m.get(ids[2]);
 const copied=m.create(original.type,{...JSON.parse(JSON.stringify(original)),id:undefined},{skipHistory:true});
 if(m.getElement(copied.id).getAttribute('stroke')===m.getElement(original.id).getAttribute('stroke'))throw Error('Shared copy paint');
 m.remove(copied.id,{skipHistory:true});K.StyleManager.cleanupDefs(m.canvas);
 if(document.getElementById('editor-fill-pattern-trace-'+copied.id))throw Error('Stale paint');
 const saved=K.DocumentSerializer.toJson();K.DocumentSerializer.fromJson(saved);
 if(K.DocumentSerializer.exportDocument().objects.filter(o=>o.style.pathPattern!=='none').length!==6)throw Error('Roundtrip lost styles');
 for(const type of ['callout','barrier','rectangle','road'])if(K.StyleManager.normalizeStyle({pathPattern:'water'},type).pathPattern!=='none')throw Error('Unsupported pattern accepted');
 K.SelectionManager.clear();
 },ids);
 // Every trace on straight, arc, quadratic and cubic; zero-length remains finite.
 await page.evaluate(()=>{
 const K=Kroki,m=K.EditorObjectManager;
 for(const type of ['line','arc','quadratic','cubic'])for(const choice of K.PathTracePatterns.choices.slice(1)){
 const kind=['quadratic','cubic'].includes(type)?'bezier':type;
 const o=m.create(kind,{start:{x:20,y:20},end:{x:600,y:350},bezierType:type,style:{strokeWidth:40,pathPattern:choice.id}},{skipHistory:true});
 if(!m.getElement(o.id).getAttribute('stroke').startsWith('url('))throw Error('Missing paint '+type);
 const p=document.getElementById('editor-fill-pattern-trace-'+o.id);
 if(/NaN|Infinity/.test(p.innerHTML))throw Error('Invalid geometry');
 m.updateStyle(o.id,{pathPattern:'none'},{skipHistory:true});K.StyleManager.cleanupDefs(m.canvas);
 if(m.getElement(o.id).getAttribute('stroke').startsWith('url(')||p.isConnected)throw Error('None did not restore normal line');
 m.remove(o.id,{skipHistory:true});
 }
 for(const type of ['line','arc','bezier']){
 const o=m.create(type,{start:{x:0,y:0},end:{x:0,y:0},style:{strokeWidth:1,pathPattern:'water'}},{skipHistory:true});
 if(/NaN|Infinity/.test(document.getElementById('editor-fill-pattern-trace-'+o.id).innerHTML))throw Error('Degenerate geometry');m.remove(o.id,{skipHistory:true});
 }
 });
 const beforeGroup=await page.evaluate(()=>Kroki.DocumentSerializer.toJson());
 await page.evaluate(ids=>{
 const K=Kroki,m=K.EditorObjectManager,x=K.MultiSelectManager;
 x.selectIds([ids[0],ids[2],ids[6]],{mode:'edit'});x.createGroup();
 const old=m.get(ids[0]).style.strokeWidth;x.setGroupScalePercent(150);x.setGroupRotation(35);x.moveSelected(25,30);
 if(m.get(ids[0]).style.strokeWidth<=old)throw Error('Group width did not scale');
 const json=K.DocumentSerializer.toJson();K.DocumentSerializer.fromJson(json);
 if(K.GroupManager.getAll().length!==1)throw Error('Group roundtrip');
 },ids);
 await page.evaluate(json=>Kroki.DocumentSerializer.fromJson(json),beforeGroup);
 // Existing closed fill panel still works, then restore the demonstration.
 await page.evaluate(()=>{const m=Kroki.EditorObjectManager;window.testRect=m.create('rectangle',{geometry:{cx:1100,cy:350,rx:40,ry:25}},{skipHistory:true}).id;Kroki.SelectionManager.edit(window.testRect)});
 await page.click('#btnLineStyle');await page.click('#btnLinePanelFillPattern');
 assert.equal(await page.locator('[data-path-pattern-choice]:visible').count(),0);
 await page.click('[data-fill-pattern="grass"]');
 assert.equal(await page.evaluate(()=>Kroki.EditorObjectManager.get(window.testRect).style.fillPattern),'grass');
 await page.evaluate(()=>{Kroki.SelectionManager.clear();Kroki.EditorObjectManager.remove(window.testRect,{skipHistory:true});document.querySelector('#editorCanvas').setAttribute('viewBox','0 0 1100 800')});
 await page.evaluate(id=>Kroki.EditorObjectManager.updateStyle(id,{pathPattern:'water',pathPatternReverse:false}),ids[0]);
 await page.screenshot({path:path.join(output,'traces.png')});
 // A standalone SVG clone must retain its paint servers and render without app JS.
 const svg=await page.evaluate(()=>{const s=Kroki.EditorObjectManager.canvas.cloneNode(true);s.querySelector('#editorEditLayer')?.remove();s.setAttribute('xmlns','http://www.w3.org/2000/svg');s.setAttribute('width','1100');s.setAttribute('height','800');return new XMLSerializer().serializeToString(s)});
 fs.writeFileSync(path.join(output,'traces.svg'),svg);
 const exported=await browser.newPage({viewport:{width:1100,height:800}});await exported.setContent(svg);await exported.screenshot({path:path.join(output,'export.png')});await exported.close();
 // Exercise actual export, including the app's SVG cleanup pipeline.
 await page.click('#btnEditorMenu');const downloadWait=page.waitForEvent('download');
 await page.click('[data-menu-action="export-svg"]');const download=await downloadWait;
 await download.saveAs(path.join(output,'actual-export.svg'));
 const actual=fs.readFileSync(path.join(output,'actual-export.svg'),'utf8');
 assert.ok(actual.includes('editor-fill-pattern-trace-'));
 assert.ok(actual.includes('"pathPattern":"water"'));
 // Touch-sized layout and a real cubic control-point drag.
 await page.setViewportSize({width:1024,height:768});
 await page.evaluate(id=>Kroki.SelectionManager.edit(id),ids[2]);
 const cp=page.locator('.editor-object-cp[data-point="c1"]');
 if(await cp.count()){
 const old=await page.evaluate(id=>document.getElementById('editor-fill-pattern-trace-'+id).innerHTML,ids[2]);
 const b=await cp.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+30,b.y+b.height/2+25,{steps:5});
 const during=await page.evaluate(id=>document.getElementById('editor-fill-pattern-trace-'+id).innerHTML,ids[2]);
 await page.mouse.up();assert.notEqual(during,old,'Live control point texture update');
 }else throw Error('Missing cubic CP');
 await page.click('#btnLineStyle');await page.click('#btnLinePanelFillPattern');
 const box=await page.locator('#fillPatternPanel').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=1025&&box.y+box.height<=769,'Panel fits tablet');
 await page.screenshot({path:path.join(output,'tablet.png')});
 const touchContext=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
 const touch=await touchContext.newPage();touch.on('pageerror',e=>errors.push(e.message));
 const cdp=await touch.context().newCDPSession(touch);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await touch.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=path-traces-touch`);
 await touch.locator('#btnYeniKroki').tap();
 await touch.evaluate(()=>{const K=Kroki;window.touchId=K.EditorObjectManager.create('bezier',{start:{x:100,y:100},end:{x:700,y:300},bezierType:'cubic',style:{strokeWidth:40}}).id;K.SelectionManager.edit(window.touchId)});
 await touch.locator('#btnLineStyle').tap();await touch.locator('#btnLinePanelFillPattern').tap();await touch.locator('[data-path-pattern-choice="water"]').tap();
 await touch.locator('#btnPathPatternReverse').tap();
 const stats=await touch.evaluate(async()=>{
 const K=Kroki,m=K.EditorObjectManager,id=window.touchId;
 if(m.get(id).style.pathPattern!=='water'||!m.get(id).style.pathPatternReverse)throw Error('Touch selection');
 const pattern=document.getElementById('editor-fill-pattern-trace-'+id),child=pattern.querySelector('path'),times=[];
 for(let i=0;i<25;i++){const t=performance.now();m.updateGeometry(id,d=>{d.geometry.c1.y+=1;return d;},{skipHistory:true});times.push(performance.now()-t);}
 if(child!==pattern.querySelector('path'))throw Error('Recreated texture nodes during drag');
 let changes=0;const observer=new MutationObserver(records=>changes+=records.length);observer.observe(pattern,{subtree:true,attributes:true,childList:true});
 for(let i=0;i<10;i++){m.canvas.setAttribute('viewBox',`${i} ${i} ${900+i} 700`);m.canvas.dispatchEvent(new CustomEvent('kroki:viewboxchange'));}
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));observer.disconnect();
 if(changes)throw Error('Camera regenerated pattern');
 times.sort((a,b)=>a-b);return {medianUpdateMs:Math.round(times[12]*10)/10,traceSvgBytes:pattern.outerHTML.length,patternChildren:pattern.children.length};
 });
 console.log('4x CPU touch and camera checks:',JSON.stringify(stats));await touchContext.close();
 assert.deepEqual(errors,[]);console.log('PASS: 24 type/pattern combinations, zero-length, group scale/rotate/save, live CP, actual SVG export, tablet panel');
 console.log('PASS: trace UI, names, reverse, undo/redo, 6 styles, move, copy/delete cleanup, serialization, closed fill, symbol and SVG export');
 } finally { await browser.close();server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
