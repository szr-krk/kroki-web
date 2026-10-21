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
 const page=await browser.newPage({hasTouch:true,viewport:{width:1200,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
 await page.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=trace-arrows-touch`);
 await page.click('#btnYeniKroki');
 const count=await page.evaluate(()=>{
 const K=Kroki,m=K.EditorObjectManager;let cases=0;
 const buttons=()=>[document.querySelector('#btnLinePanelStartArrow'),document.querySelector('#btnLinePanelEndArrow')];
 function validate(id, patterned) {
  const model=m.get(id),el=m.getElement(id);
  K.SelectionManager.edit(id);K.StyleManager.syncControls();
  if(patterned && (model.style.arrowStart!=='none'||model.style.arrowEnd!=='none'||el.hasAttribute('marker-start')||el.hasAttribute('marker-end')))throw Error('Pattern retained arrows');
  for(const button of buttons()){
   if(button.disabled!==patterned||button.getAttribute('aria-disabled')!==String(patterned))throw Error('Incorrect arrow control state');
   if(patterned)button.click();
  }
  if(patterned && (model.style.arrowStart!=='none'||model.style.arrowEnd!=='none'))throw Error('Disabled control added arrow');
  cases++;
 }
 for(const type of ['line','arc','quadratic','cubic']){
  const model=m.create(type==='quadratic'||type==='cubic'?'bezier':type,{start:{x:100,y:200},end:{x:500,y:400},bezierType:type==='cubic'?'cubic':'quadratic',style:{arrowStart:'triangle',arrowEnd:'triangle'}},{skipHistory:true});
  for(const choice of K.PathTracePatterns.choices.filter(c=>c.id!=='none')){
   m.updateStyle(model.id,{pathPattern:'none',arrowStart:'triangle',arrowEnd:'circle'},{skipHistory:true});validate(model.id,false);
   m.updateStyle(model.id,{pathPattern:choice.id},{skipHistory:true});validate(model.id,true);
   m.updateStyle(model.id,{arrowStart:'triangle',arrowEnd:'triangle'},{skipHistory:true});validate(model.id,true);
   m.updateStyle(model.id,{pathPattern:'none'},{skipHistory:true});validate(model.id,false);
   if(m.get(model.id).style.arrowStart!=='none'||m.get(model.id).style.arrowEnd!=='none')throw Error('Old arrows restored');
   buttons()[1].click();
   if(m.get(model.id).style.arrowEnd==='none')throw Error('Re-enabled arrow does not work');
  }
  m.updateStyle(model.id,{pathPattern:'brake'},{skipHistory:true});
 }
 const saved=K.DocumentSerializer.exportDocument();
 for(const o of saved.objects){o.style.arrowStart='triangle';o.style.arrowEnd='circle';}
 K.DocumentSerializer.fromJson(JSON.stringify(saved));
 for(const o of saved.objects)validate(o.id,true);
 const editor=document.querySelector('#editor'),input=document.createElement('textarea');editor.append(input);
 const menu=target=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});target.dispatchEvent(e);return e.defaultPrevented;};
 if(!menu(m.canvas)||!menu(document.querySelector('#btnLineStyle'))||menu(input))throw Error('Context menu scope');
 if(getComputedStyle(m.canvas).userSelect!=='none'||getComputedStyle(input).userSelect!=='text')throw Error('Selection scope');
 const touch=new Event('touchstart',{bubbles:true,cancelable:true});m.canvas.dispatchEvent(touch);
 if(!touch.defaultPrevented)throw Error('Native touch gesture was not cancelled');
 input.remove();return cases;
 });
 // Exercise the actual pattern picker and history transaction as well.
 await page.click('#btnLineStyle');
 await page.click('#btnLinePanelFillPattern');
 await page.click('[data-path-pattern-choice="none"]');
 await page.click('#btnLineStyle');
 await page.click('#btnLinePanelEndArrow');
 await page.click('#btnLinePanelFillPattern');
 await page.click('[data-path-pattern-choice="brake"]');
 assert.ok(await page.locator('#btnLinePanelEndArrow').isDisabled());
 await page.evaluate(()=>Kroki.HistoryManager.undo());
 assert.ok(await page.locator('#btnLinePanelEndArrow').isEnabled());
 assert.ok(await page.evaluate(()=>Array.from(document.querySelectorAll('#editorObjects [data-kroki-object=\"true\"]')).some(el=>el.hasAttribute('marker-end'))));
 await page.evaluate(()=>Kroki.HistoryManager.redo());
 assert.ok(await page.locator('#btnLinePanelEndArrow').isDisabled());
 const cdp=await page.context().newCDPSession(page);
 const box=await page.locator('#editorCanvas').boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+100,y:box.y+100}]});
 await page.waitForTimeout(900);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.screenshot({path:path.join(output,'arrow-traces-touch.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS:',count,'pattern/arrow exclusion cases, disabled controls, import, picker, undo/redo and touch long hold');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
