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
 const page=await browser.newPage();
 const url=(process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`)+'/?verify=view-preferences';
 const state=()=>page.evaluate(()=>['btnEditorGrid','btnEditorRulers','btnEditorSnap'].map(id=>document.getElementById(id).getAttribute('aria-pressed')==='true'));
 try{
 await page.goto(url);await page.click('#btnYeniKroki');assert.deepEqual(await state(),[true,true,false]);
 await page.click('#btnEditorSnap');await page.reload();await page.click('#btnYeniKroki');assert.deepEqual(await state(),[true,true,true]);
 await page.click('#btnEditorGrid');await page.click('#btnEditorRulers');await page.reload();await page.click('#btnYeniKroki');assert.deepEqual(await state(),[false,false,false]);
 await page.click('#btnEditorSnap');assert.deepEqual(await state(),[true,false,true]);
 await page.evaluate(()=>localStorage.setItem('kroki.editor.viewPreferences.v1','invalid'));
 await page.reload();await page.click('#btnYeniKroki');assert.deepEqual(await state(),[true,true,false]);
 await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage unavailable')}})});
 await page.reload();await page.click('#btnYeniKroki');assert.deepEqual(await state(),[true,true,false]);
 await page.click('#btnEditorSnap');assert.deepEqual(await state(),[true,true,true]);
 console.log('PASS: initial defaults, remembered preferences, grid/snap consistency, malformed and unavailable storage');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
