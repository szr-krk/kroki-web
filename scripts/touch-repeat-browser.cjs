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
 const page=await browser.newPage({hasTouch:true,viewport:{width:1024,height:768}});
 try{
  await page.goto(`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=touch-repeat`);
  const result=await page.evaluate(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   async function run(type,duration,stop='pointerup'){
    const button=document.createElement('button');document.body.append(button);let n=0;
    const dispose=window.krokiObjectEditCore.bindHoldAction(button,()=>n++);
    button.dispatchEvent(new PointerEvent('pointerdown',{pointerType:type,button:0}));
    await wait(duration);
    if(stop==='disabled')button.disabled=true;
    else if(stop==='blur')window.dispatchEvent(new Event('blur'));
    else button.dispatchEvent(new PointerEvent(stop,{pointerType:type}));
    const count=n;await wait(100);
    if(n!==count)throw Error('Repeats continued after '+stop);
    if(stop==='pointerup'){button.click();if(n!==count)throw Error('Duplicate release click');}
    dispose();button.remove();return count;
   }
   const mouse=await run('mouse',900),touch=await run('touch',900),pen=await run('pen',900);
   if(touch<mouse*1.5||pen<mouse*1.5)throw Error('Touch should be substantially faster '+JSON.stringify({mouse,touch,pen}));
   if(await run('touch',70)!==1)throw Error('Tap must be one step');
   for(const stop of ['pointercancel','pointerleave','lostpointercapture','blur','disabled'])await run('touch',300,stop);
   return {mouse,touch,pen};
  });console.log('PASS: touch/pen acceleration, single tap, no duplicate click, cancellation and disabled guards',result);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
