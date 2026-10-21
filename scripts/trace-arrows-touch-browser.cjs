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
 function validate(id) {
  const el=m.getElement(id),url=el.getAttribute('stroke'),pattern=document.querySelector(url.slice(4,-1));
  const center=pattern.children[3];
  const coords=center.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
  const n=coords.length/2-1,length=el.getTotalLength();
  for(let i=0;i<=n;i++){
   const p=el.getPointAtLength(length*i/n);
   if(Math.hypot(coords[i*2]-p.x,coords[i*2+1]-p.y)>.025)throw Error('Trace diverges from '+m.get(id).type+' at '+i);
  }
  if(pattern.children.length!==7||/NaN|Infinity/.test(pattern.innerHTML))throw Error('Invalid texture');
  const html=pattern.innerHTML;m.updateStyle(id,{}, {skipHistory:true});
  if(pattern.innerHTML!==html)throw Error('Unstable cached trace');
  cases++;
 }
 for(const type of ['line','arc','quadratic','cubic']){
  const model=m.create(type==='quadratic'||type==='cubic'?'bezier':type,{start:{x:100,y:200},end:{x:500,y:400},bezierType:type==='cubic'?'cubic':'quadratic',style:{strokeWidth:18,arrowEnd:'triangle'}},{skipHistory:true});
  if(model.type==='bezier')m.updateGeometry(model.id,d=>{d.geometry.q={x:120,y:500};d.geometry.c1={x:120,y:500};d.geometry.c2={x:450,y:70};return d;},{skipHistory:true});
  m.updateStyle(model.id,{pathPattern:'brake'},{skipHistory:true});validate(model.id);
  for(const arrows of [{arrowStart:'triangle',arrowEnd:'none'},{arrowStart:'circle',arrowEnd:'triangle2'},{arrowStart:'none',arrowEnd:'none'},{arrowStart:'none',arrowEnd:'triangle'}]){
   m.updateStyle(model.id,arrows,{skipHistory:true});
   // No-arrow curves use parameter sampling rather than arc-length sampling.
   if(arrows.arrowStart!=='none'||arrows.arrowEnd!=='none')validate(model.id);
  }
  m.updateGeometry(model.id,d=>{K.ShapeRegistry.get(d.type).move(d,27,-19);return d;},{skipHistory:true});validate(model.id);
  m.updateStyle(model.id,{brakeWidth:'wide',brakeScale:1.5},{skipHistory:true});validate(model.id);
 }
 const json=K.DocumentSerializer.toJson();K.DocumentSerializer.fromJson(json);
 for(const o of K.DocumentSerializer.exportDocument().objects)validate(o.id);
 const editor=document.querySelector('#editor'),input=document.createElement('textarea');editor.append(input);
 const menu=target=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});target.dispatchEvent(e);return e.defaultPrevented;};
 if(!menu(m.canvas)||!menu(document.querySelector('#btnLineStyle'))||menu(input))throw Error('Context menu scope');
 if(getComputedStyle(m.canvas).userSelect!=='none'||getComputedStyle(input).userSelect!=='text')throw Error('Selection scope');
 const touch=new Event('touchstart',{bubbles:true,cancelable:true});m.canvas.dispatchEvent(touch);
 if(!touch.defaultPrevented)throw Error('Native touch gesture was not cancelled');
 input.remove();return cases;
 });
 const cdp=await page.context().newCDPSession(page);
 const box=await page.locator('#editorCanvas').boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+100,y:box.y+100}]});
 await page.waitForTimeout(900);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.screenshot({path:path.join(output,'arrow-traces-touch.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS:',count,'arrow/trace geometry cases, live move, width, cache, save/load, native menu/selection protection and touch long hold');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
