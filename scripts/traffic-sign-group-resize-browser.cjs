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

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
  const page = await browser.newPage();
  try {
    await page.goto(`${process.env.TEST_BASE_URL || `http://127.0.0.1:${server.address().port}`}/?verify=group-sign-scale`);
    await page.click("#btnYeniKroki");
    const result = await page.evaluate(() => {
      const K=window.Kroki, m=K.EditorObjectManager, multi=K.MultiSelectManager, adapter=K.ShapeRegistry.get("trafficSign");
      const signs=K.TrafficSignCatalog.all();
      const check=(condition,message)=>{if(!condition)throw new Error(message)};
      const samples=[signs.find(s=>s.code==='B-13b'), signs.find(s=>s.code==='B-5a'), signs.find(s=>s.code==='B-12h'), signs.find(s=>!s.layout && s.code)];
      const models=samples.map((sign,i)=>m.create('trafficSign',{sign,center:{x:200+i*300,y:300},scale:i===3?.08:.02},{skipHistory:true}));
      multi.selectIds(models.map(x=>x.id),{mode:'edit'}); multi.createGroup();
      const groupId=multi.getSelectedGroupId(); check(groupId,'Group created'); multi.selectGroup(groupId);
      const initial=models.map(model=>({id:model.id,bounds:adapter.getBounds(m.get(model.id)),scale:m.get(model.id).geometry.scale}));
      for(const percent of [50,10,1,100,400,100]) {
        multi.setGroupScalePercent(percent);
        initial.forEach(({id,bounds,scale})=>{
          const current=adapter.getBounds(m.get(id)), ratio=percent/100;
          check(Math.abs(current.width-bounds.width*ratio)<.001,`${m.get(id).metadata.signCode} ${percent}% width: expected ${bounds.width*ratio}, actual ${current.width}`);
          check(Math.abs(current.height-bounds.height*ratio)<.001,'Height ratio');
          check(Math.abs(m.get(id).geometry.scale-scale*ratio)<1e-8,'Stored scale ratio');
          
          const frame=K.GroupManager.get(groupId).metadata.frame;
          check(current.x>=frame.cx-frame.width/2-.5*ratio && current.x+current.width<=frame.cx+frame.width/2+.5*ratio,'Inside group frame '+JSON.stringify({current,frame,percent}));
        });
      }
      multi.setGroupScalePercent(10);
      const json=K.DocumentSerializer.toJson();check(K.DocumentSerializer.fromJson(json).ok,'Reload');
      initial.forEach(({id,bounds})=>check(Math.abs(adapter.getBounds(m.get(id)).width-bounds.width*.1)<.001,'Small scale survives reload'));
      multi.selectGroup(groupId);multi.setGroupScalePercent(100);
      K.HistoryManager.undo();initial.forEach(({id,bounds})=>check(Math.abs(adapter.getBounds(m.get(id)).width-bounds.width*.1)<.001,'Undo'));
      K.HistoryManager.redo();initial.forEach(({id,bounds})=>check(Math.abs(adapter.getBounds(m.get(id)).width-bounds.width)<.001,'Redo'));
      // A second group crosses the former upper scale clamp as well.
      multi.clear();
      const large=[2,1].map((scale,i)=>m.create('trafficSign',{sign:samples[2],center:{x:500+i*200,y:600},scale},{skipHistory:true}));
      multi.selectIds(large.map(x=>x.id),{mode:'edit'});multi.createGroup();multi.selectGroup(multi.getSelectedGroupId());
      multi.setGroupScalePercent(400);
      check(m.get(large[0].id).geometry.scale===8,'Upper clamp must not break group ratio');
      const clone=m.clone(large[0].id);check(clone.geometry.scale===8,'Clone preserves group-derived scale');m.remove(clone.id);
      const saved=K.DocumentSerializer.toJson();check(K.DocumentSerializer.fromJson(saved).ok,'Large group reload');
      check(m.get(large[0].id).geometry.scale===8,'Large scale survives reload');
      return {samples:samples.map(s=>s.code),scales:[1,10,50,100,400]};
    });
    console.log('PASS group sign ratio resize',JSON.stringify(result));
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
