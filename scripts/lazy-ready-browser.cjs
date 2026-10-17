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
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=0;page.on('request',r=>{if(r.url().includes('/ready-drawings.js'))requests++});
 const url=`${process.env.TEST_BASE_URL||`http://127.0.0.1:${server.address().port}`}/?verify=lazy-ready`;
 try{
  await page.goto(url);assert.equal(requests,0,'No ready pack in initial load');
  const initial=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((a,r)=>({encoded:a.encoded+r.encodedBodySize,decoded:a.decoded+r.decodedBodySize,transfer:a.transfer+r.transferSize}),{encoded:0,decoded:0,transfer:0}));
  await page.click('#btnHazirKavsaklar');await page.locator('[data-ready-drawing-id]').first().waitFor();
  assert.equal(requests,1);const count=await page.locator('[data-ready-drawing-id]').count();assert.ok(count>0);
  await page.click('#btnSonKrokiler');await page.click('#btnHazirKavsaklar');assert.equal(requests,1,'Same session reuses loaded pack');
  await page.locator('[data-ready-drawing-id]').first().click();
  assert.ok(await page.evaluate(()=>window.Kroki.ReadyDrawings.length>0));
  await page.goto(url);assert.equal(requests,1,'Reload does not eagerly request pack');
  await page.route('**/ready-drawings.js*',route=>route.abort());
  await page.click('#btnHazirKavsaklar');await page.getByRole('button',{name:'Tekrar dene',exact:true}).waitFor();
  await page.unroute('**/ready-drawings.js*');await page.getByRole('button',{name:'Tekrar dene',exact:true}).click();
  await page.locator('[data-ready-drawing-id]').first().waitFor();assert.equal(await page.locator('[data-ready-drawing-id]').count(),count);
  assert.deepEqual(errors,[]);console.log('PASS: lazy load, reuse, preview, network failure/retry; initial resource bytes',initial);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
