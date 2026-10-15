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

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(`${process.env.TEST_BASE_URL || `http://127.0.0.1:${server.address().port}`}/?verify=road-center-guide`);
    await page.click("#btnYeniKroki");
    const initial = await page.evaluate(() => {
      const K=window.Kroki, m=K.EditorObjectManager, guide=K.EditorCenterGuide, camera=window.krokiEditorCamera;
      const check=(v,t)=>{if(!v)throw Error(t)};
      const cross=document.querySelector('.editor-center-guide-cross');
      for(const box of [{x:0,y:0,width:1200,height:800},{x:1500.25,y:-885.3,width:3000,height:500},{x:-427,y:628,width:400,height:1600}]) {
        camera.writeViewBox(m.canvas,box);
        const r=m.canvas.getBoundingClientRect(), b=cross.getBoundingClientRect(), o=guide.origin();
        const pt=m.canvas.createSVGPoint();pt.x=o.x;pt.y=o.y;const screen=pt.matrixTransform(m.canvas.getScreenCTM());
        check(Math.abs(screen.x-(r.left+r.width/2))<.01&&Math.abs(screen.y-(r.top+r.height/2))<.01,'Reference world point matches physical canvas center, including letterbox');
        check(Math.abs(b.x+b.width/2-screen.x)<.01&&Math.abs(b.y+b.height/2-screen.y)<.01,'Cross fixed at center');
        check(b.width===20&&b.height===20,'Cross size independent of zoom');
      }
      const r=m.canvas.getBoundingClientRect();camera.writeViewBox(m.canvas,{x:13.7,y:-28.4,width:r.width,height:r.height});
      let reads=0;const adapter={getBounds(){reads++;return {x:100,y:200,width:300,height:100}}};
      const start={x:30,y:40},state=guide.begin({type:'road'},adapter,start,'mouse'),o=guide.origin();
      const nearby=guide.begin({type:'road'},{getBounds:()=>({x:o.x-5,y:o.y-5,width:20,height:20})},start,'mouse');
      const click=guide.snap(nearby,start,start);check(click===start,'A click alone does not center-snap');
      const raw={x:start.x+o.x-state.anchor.x+5,y:start.y+o.y-state.anchor.y+6};
      for(let i=0;i<50;i++){
        const snapped=guide.snap(state,raw,{x:raw.x+80,y:raw.y-50});
        check(Math.abs(state.anchor.x+snapped.x-start.x-o.x)<1e-9,'Center overrides conflicting grid/endpoint x');
        check(Math.abs(state.anchor.y+snapped.y-start.y-o.y)<1e-9,'Center overrides conflicting grid/endpoint y');
      }
      check(reads===1,'Bounds cached once, not measured during moves');
      const free={x:raw.x+200,y:raw.y+200};check(guide.snap(state,free,free).x===free.x,'Release outside tolerance');
      check(!document.querySelector('#editorCenterGuide').classList.contains('is-snapped-x'),'Guide clears outside tolerance');
      check(guide.begin({type:'vehicle'},adapter,start,'mouse')===null,'Vehicles excluded');
      check(guide.begin({type:'line'},adapter,start,'mouse')===null,'Open lines excluded');
      check(guide.begin({type:'closedShape',geometry:{closed:false,points:[{},{},{}]}},adapter,start,'mouse')===null,'Open polygons excluded');
      check(guide.begin({type:'road'},adapter,start,'touch').tolerance===18,'Touch threshold in screen pixels');guide.end();
      check(!K.DocumentSerializer.toJson().includes('editorCenterGuide'),'No guide in serialized document');
      return true;
    });
    assert.equal(initial,true);
    await page.evaluate(() => {
      const K=window.Kroki,m=K.EditorObjectManager,camera=window.krokiEditorCamera;
      const check=(v,t)=>{if(!v)throw Error(t)};
      for(const width of [500,2500]) {
        camera.writeViewBox(m.canvas,{x:13.7,y:-28.4,width,height:800});
        const unit=1/camera.getViewportMetrics(m.canvas).scale;
        for(const type of ['line','arc','bezier','road'])for(const side of ['start','end']) {
          const model=m.create(type,{start:{x:123.25,y:87.75},end:{x:400,y:220},geometry:{profile:'arc',start:{x:123.25,y:87.75},end:{x:400,y:220},ratio:.35}},{skipHistory:true});
          const a=m.getAdapter(model),opposite=model.geometry[side==='start'?'end':'start'];
          const target={x:opposite.x+250*unit,y:opposite.y+4*unit};
          const point={...model.geometry[side]};
          const metrics={endpointOffset:0,minGap:0,unit};
          K.EditorGrid.beginGesture([model.id]);
          const startState=a.beginControlPointMove?.(model,side,point,metrics);
          a.moveControlPoint(model,side,target,{startState,metrics});
          check(model.geometry[side].y===opposite.y,type+' '+side+' horizontal capture at zoom '+width);
          K.EditorGrid.endGesture();
        }
      }
      K.SelectionManager.clear();m.clear({skipHistory:true});
    });
    // Real pointer gestures cover the production preview, commit and history path.
    for(const [profile,width,axes] of [['arc',1300,'both'],['straight',2100,'x'],['sCurve',950,'y'],['islandRing',1800,'both'],['circle',1300,'both'],['ellipse',2100,'x'],['rectangle',950,'both'],['closedShape',1800,'both']]){
      const fixture=await page.evaluate(({profile,width,axes})=>{
        const type=['circle','ellipse','rectangle','closedShape'].includes(profile)?profile:'road';
        const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get(type),camera=window.krokiEditorCamera;
        K.SelectionManager.clear();m.clear({skipHistory:true});
        const r=m.canvas.getBoundingClientRect();camera.writeViewBox(m.canvas,{x:157.25,y:-253.75,width,height:width*r.height/r.width});
        const o=K.EditorCenterGuide.origin(),unit=1/camera.getViewportMetrics(m.canvas).scale;
        const geometry=profile==='islandRing'?{profile,center:{x:o.x,y:o.y},innerDiameter:160,outerDiameter:360}
          :{profile,start:{x:o.x-180*unit,y:o.y},end:{x:o.x+180*unit,y:o.y},ratio:.35,controls:[{x:o.x-70*unit,y:o.y-75*unit},{x:o.x+70*unit,y:o.y+75*unit}]};
        const shapeGeometry=type==='circle'?{cx:o.x,cy:o.y,r:60}:type==='closedShape'?{points:[{x:o.x-80,y:o.y-60},{x:o.x+80,y:o.y-60},{x:o.x+30,y:o.y+60}],closed:true}:{cx:o.x,cy:o.y,rx:90,ry:55,rotation:27};
        const model=m.create(type,{geometry:type==='road'?geometry:shapeGeometry,metadata:{road:{laneCount:2,laneWidth:50,laneWidths:[50,50],divided:false}}},{skipHistory:true});
        const b=a.getBounds(model);m.updateGeometry(model.id,draft=>{a.move(draft,o.x-130*unit-b.x-b.width/2,o.y-90*unit-b.y-b.height/2);return draft;},{skipHistory:true});
        K.SelectionManager.edit(model.id);
        const before=JSON.parse(JSON.stringify(m.get(model.id).geometry));
        const start={x:r.left+r.width*.65,y:r.top+r.height*.76};
        const end={x:start.x+(axes==='y'?45:135),y:start.y+(axes==='x'?35:95)};
        return {id:model.id,type,start,end,before,origin:o,axes};
      },{profile,width,axes});
      await page.mouse.move(fixture.start.x,fixture.start.y);await page.mouse.down();
      await page.mouse.move(fixture.end.x,fixture.end.y,{steps:4});await page.waitForTimeout(70);
      const active=await page.locator('#editorCenterGuide').getAttribute('class');
      assert.equal(active.includes('is-snapped-x'),axes!=='y',`${profile} x guide`);
      assert.equal(active.includes('is-snapped-y'),axes!=='x',`${profile} y guide`);
      const color=await page.locator('.editor-center-guide-axis.is-vertical').evaluate(el=>getComputedStyle(el).borderLeftColor);
      assert.equal(color,axes==='both'?'rgb(37, 99, 235)':'rgb(220, 38, 38)','Both axes blue; single axis red');
      if(profile==='arc')await page.screenshot({path:path.join(output,'snapped-road.png')});
      await page.mouse.up();
      await page.evaluate(({id,type,origin,axes,before})=>{
        const K=window.Kroki,m=K.EditorObjectManager,a=K.ShapeRegistry.get(type),b=a.getBounds(m.get(id));
        const check=(v,t)=>{if(!v)throw Error(t)};
        if(axes!=='y')check(Math.abs(b.x+b.width/2-origin.x)<.001,'Committed center x');
        if(axes!=='x')check(Math.abs(b.y+b.height/2-origin.y)<.001,'Committed center y');
        check(!document.querySelector('#editorCenterGuide').classList.contains('is-snapped-x'),'Guide hidden after pointerup');
        const after=JSON.stringify(m.get(id).geometry);
        K.HistoryManager.undo();check(JSON.stringify(m.get(id).geometry)===JSON.stringify(before),'Single gesture undo');
        K.HistoryManager.redo();check(JSON.stringify(m.get(id).geometry)===after,'Redo center snap');
        const json=K.DocumentSerializer.toJson();check(K.DocumentSerializer.fromJson(json).ok,'Reload');
        check(JSON.stringify(m.get(id).geometry)===after,'Saved geometry only');
      },fixture);
    }
    // Builder: profile/orientation/shoulders fit safely and bbox center sits on Y axis.
    for(const viewport of [{width:1440,height:1000},{width:600,height:1000}]) {
      await page.setViewportSize(viewport);
      for(const profile of ['straight','arc','sCurve','islandRing'])for(const orientation of ['horizontal','vertical']){
        const insertion=await page.evaluate(async({profile,orientation})=>{
          const K=window.Kroki,m=K.EditorObjectManager;K.SelectionManager.clear();m.clear({skipHistory:true});
          window.krokiEditorCamera.writeViewBox(m.canvas,{x:157.25,y:-253.75,width:1300,height:900});
          document.querySelectorAll('[data-road-profile]').forEach(el=>el.classList.toggle('is-active',el.dataset.roadProfile===profile));
          document.querySelectorAll('[data-road-orientation]').forEach(el=>el.classList.toggle('is-active',el.dataset.roadOrientation===orientation));
          K.RoadBuilder.addRoad();await new Promise(r=>setTimeout(r,100));
          const model=m.getAll().find(x=>x.type==='road'),a=m.getAdapter(model),b=a.getBounds(model),o=K.EditorCenterGuide.origin();
          return {error:b.x+b.width/2-o.x,profile,orientation,count:m.getAll().length};
        },{profile,orientation});
        assert.equal(insertion.count,1);assert.ok(Math.abs(insertion.error)<.01,JSON.stringify(insertion));
      }
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(() => window.Kroki.SelectionManager.clear());
    await page.click('#btnEditorMenu');const pending=page.waitForEvent('download');await page.click('[data-menu-action="export-svg"]');
    const download=await pending,target=path.join(output,'road.svg');await download.saveAs(target);
    assert.ok(!fs.readFileSync(target,'utf8').includes('id="editorCenterGuide"'),'Overlay excluded from SVG');
    assert.deepEqual(errors,[]);console.log('PASS: fixed cross, screen-space snap thresholds, grid precedence, real road/island drags, axis guides, undo/redo, save/export, insertion on Y axis, portrait/landscape.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
