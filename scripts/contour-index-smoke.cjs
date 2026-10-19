const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const file = 'src/core/roadIntersectionEngine.js';
const old = execFileSync('git', ['show', '654ca08:'+file], {cwd:root, encoding:'utf8'});
const current = fs.readFileSync(path.join(root,file),'utf8');
function build(source) {
  let calls = 0;
  const dist = (a,b) => {calls++;return Math.hypot((b.x||0)-(a.x||0),(b.y||0)-(a.y||0));};
  const context = vm.createContext({SNAP_TOLERANCE:1.15,dist,
    addPointIfFar(points,p,t){if(!points.length||dist(points[points.length-1],p)>=t)points.push({x:p.x,y:p.y});},
    // Compare the full pre-simplification point sequence, a stronger contract.
    simplifyPolylineRdp(points){return points;}
  });
  vm.runInContext(source.slice(source.indexOf('  function assembleLinePieces('),source.indexOf('  function strokeAttrsForContour')),context);
  return {run:pieces=>JSON.parse(JSON.stringify(context.assembleLinePieces(pieces))),calls:()=>calls};
}
const before=build(old),after=build(current);
let seed=123456;
const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
for(let trial=0;trial<300;trial++){
 const pieces=Array.from({length:80},(_,i)=>{
  const x=trial%2?Math.round(random()*20)*2.875:(random()-.5)*100;
  const y=trial%2?Math.round(random()*20)*2.875:(random()-.5)*100;
  return {a:{x,y},b:{x:x+(random()-.5)*10,y:y+(random()-.5)*10},key:String(i%3),width:2,dashed:false};
 });
 if(trial%3===0)pieces.push(...pieces.slice(0,10)); // duplicate/equal-distance candidates
 assert.deepEqual(after.run(pieces),before.run(pieces),'assembly order/tie-break changed at '+trial);
}
const chain=Array.from({length:1000},(_,i)=>({a:{x:i*5,y:0},b:{x:(i+1)*5,y:0},key:'edge',width:2,dashed:false}));
const a=before.calls(),b=after.calls();
assert.deepEqual(after.run(chain),before.run(chain));
const previous=before.calls()-a,currentCalls=after.calls()-b;
assert.ok(currentCalls<previous/50);
console.log(`PASS: 300 seeded contour sets + 1000-piece chain, identical order/ties; distance calls ${previous} -> ${currentCalls}`);
