import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { BOAT, clamp, createBoat, stepBoat } from '../src/physics.js';
import { resistanceComponents } from '../src/hydrodynamics.js';
import { appendGhostFrame, makeGhost, readGhost, saveGhost, shouldReplaceGhost, sampleGhost } from '../src/ghost.js';
import { drawFields, drawTowpath, drawStoneBridge } from '../src/scenery.js';
import { createWakeMark, pruneWakeMarks, travelAngle, propWashSideOffset, WAKE_LIFETIME } from '../src/water.js';
import { clampNotch, throttleFromNotch, notchFromTrackPosition, positionForNotch, labelForNotch } from '../src/throttle.js';
import { START_Y, LOCK, getActiveCourse, setActiveCourse, centreAt, halfWidthAt,
         waterwayAt, checkBanks, insideLock, pointOnHull, canalEnvironmentAt } from '../src/course.js';

// Render smoke test for the browser entrypoint without external dependencies.
// Catch missing HUD references and exceptions during the first animation frame.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8')
  .replace(/^import\s+[^\n]*\n/gm,'');
const declaredIds=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const modules={
  BOAT,clamp,createBoat,stepBoat,resistanceComponents,
  appendGhostFrame,makeGhost,readGhost,saveGhost,shouldReplaceGhost,sampleGhost,
  drawFields,drawTowpath,drawStoneBridge,
  createWakeMark,pruneWakeMarks,travelAngle,propWashSideOffset,WAKE_LIFETIME,
  clampNotch,throttleFromNotch,notchFromTrackPosition,positionForNotch,labelForNotch,
  START_Y,LOCK,getActiveCourse,setActiveCourse,centreAt,halfWidthAt,waterwayAt,
  checkBanks,insideLock,pointOnHull,canalEnvironmentAt
};

function boot(course){
  const frames=[],nodes=new Map(),calls={paint:0},saved=new Map();
  let paintStarted=false;
  const ctx=new Proxy({},{
    get(_target,key){
      if(key==='fillRect'||key==='strokeRect'||key==='ellipse'||key==='lineTo')
        return (...args)=>{calls.paint++;paintStarted=true;};
      return ()=>{};
    },
    set(){return true;}
  });
  function node(id){
    if(!declaredIds.has(id))return null;
    if(!nodes.has(id)){
      const events={};
      const classes=new Set();
      const classList={
        add(name){classes.add(name);},remove(name){classes.delete(name);},
        toggle(name,force){if(force===undefined? !classes.has(name):force)classes.add(name);
          else classes.delete(name);return classes.has(name);},
        contains(name){return classes.has(name);}
      };
      const e={
        id,style:{},classList,dataset:{},textContent:'',
        addEventListener(name,fn){events[name]=fn;},
        setAttribute(){},
        setPointerCapture(){},
        getBoundingClientRect(){return {left:0,top:0,width:390,height:660};},
        __events:events
      };
      if(id==='gameCanvas')e.getContext=()=>ctx;
      nodes.set(id,e);
    }
    return nodes.get(id);
  }
  const buttons=['classic','test'].map(courseName=>{
    const btn={dataset:{course:courseName},classList:{toggle(){}},setAttribute(){},
      addEventListener(name,fn){btn[name]=fn;}};
    return btn;
  });
  const document={
    getElementById:node,
    querySelectorAll(selector){return selector==='[data-course]'?buttons:[];},
    addEventListener(){}
  };
  const window={location:{search:'?course='+course},devicePixelRatio:1,addEventListener(){}};
  const sandbox=vm.createContext({
    ...modules,document,window,URLSearchParams,
    localStorage:{
      getItem(key){return saved.get(key)??null;},
      setItem(key,value){saved.set(key,value);}
    },
    requestAnimationFrame(fn){frames.push(fn);}
  });
  vm.runInContext(source,sandbox,{timeout:2000,filename:'src/main.js'});
  assert.equal(node('gameShell').classList.contains('is-home'),true,'home initially hides game controls');
  assert.match(node('homeProgress').textContent,/0 \/ 2/);
  assert.match(node('homeSelectedBest').textContent,/--:--/);
  assert.equal(frames.length,1,'entrypoint should schedule animation');
  frames.shift()(16);
  assert.ok(calls.paint>100,'first frame should paint a canal and boat');
  assert.match(node('waterInfo').textContent,/DEPTH.*WIDTH/);
  assert.equal(node('stageName').textContent,course==='test'?'The Waterway Lab':'Bridge to Lock');
  const previous=calls.paint;
  node('startButton').__events.click();
  assert.equal(node('gameShell').classList.contains('is-home'),false,'controls appear only in gameplay');
  for(const tick of [32,48,64,80]){
    assert.ok(frames.length>0);
    frames.shift()(tick);
  }
  assert.ok(calls.paint>previous+100,'gameplay must continue drawing');
  assert.equal(paintStarted,true);
  // Exercise finish bookkeeping in the real entrypoint. The physics-based
  // end-to-end lock test is in navigation.test.js; here we call finish
  // directly to verify completion saves the best time and ghost replay.
  vm.runInContext('elapsed=1.5; finish();',sandbox);
  assert.ok(node('gameShell').classList.contains('is-finished'));
  assert.match(node('resultGhost').textContent,/New course ghost recorded/);
  assert.ok(saved.has('power-canal-ghost-v1-'+course));
  assert.ok(saved.has('power-canal-best-'+course));
  node('courseButton').__events.click();
  assert.equal(node('gameShell').classList.contains('is-home'),true,'course button returns to home');
  assert.match(node('homeProgress').textContent,/1 \/ 2/);
  assert.match(node('homeSelectedBest').textContent,/00:01/);
  assert.match(node('homeGhostStatus').textContent,/Replay ghost ready/);
  node('startButton').__events.click();
  assert.equal(node('ghostToggle').disabled,false);
  assert.equal(node('ghostChip').classList.contains('is-hidden'),false);
  node('ghostToggle').__events.click();
  assert.equal(node('ghostChip').classList.contains('is-hidden'),true);
  node('courseButton').__events.click();
  assert.ok(node('gameShell').classList.contains('is-home'));
}

for(const route of ['classic','test']){
  test(route+' starts and draws its canal without a blank canvas',()=>{
    const previous=getActiveCourse().id;
    try{boot(route);}finally{setActiveCourse(previous);}
  });
}
