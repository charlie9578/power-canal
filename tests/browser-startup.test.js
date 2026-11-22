import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { BOAT, clamp, createBoat, stepBoat } from '../src/physics.js';
import { resistanceComponents } from '../src/hydrodynamics.js';
import { appendGhostFrame, makeGhost, readGhost, saveGhost, shouldReplaceGhost, sampleGhost, ghostKey } from '../src/ghost.js';
import { drawFields, drawTowpath, drawStoneBridge } from '../src/scenery.js';
import { updateLockStop, LOCK_STOP } from '../src/lock-stop.js';
import { TECHNICAL_PATH,technicalNearest,technicalBankContact,technicalSectionAt } from '../src/technical-route.js';
import { createWakeMark, pruneWakeMarks, travelAngle, propWashSideOffset, WAKE_LIFETIME } from '../src/water.js';
import { clampNotch, throttleFromNotch, notchFromTrackPosition, positionForNotch, labelForNotch } from '../src/throttle.js';
import { START_Y, LOCK, COURSES, getActiveCourse, setActiveCourse, centreAt, halfWidthAt,
         waterwayAt, waterwayAtPosition, checkBanks, checkObstacles, insideLock, pointOnHull, canalEnvironmentAt, technicalPath, technicalRouteProgress } from '../src/course.js';

// Render smoke test for the browser entrypoint without external dependencies.
// Catch missing HUD references and exceptions during the first animation frame.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8')
  .replace(/^import\s+[^\n]*\n/gm,'');
const declaredIds=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
// The removed floating caption must not be reintroduced over HUD content.
assert.equal(declaredIds.has('courseMessage'),false,
  'normal route prompts belong in the control deck, not over the canal');
const modules={
  BOAT,clamp,createBoat,stepBoat,resistanceComponents,
  appendGhostFrame,makeGhost,readGhost,saveGhost,shouldReplaceGhost,sampleGhost,
  drawFields,drawTowpath,drawStoneBridge,updateLockStop,LOCK_STOP,
  TECHNICAL_PATH,technicalNearest,technicalBankContact,technicalSectionAt,
  createWakeMark,pruneWakeMarks,travelAngle,propWashSideOffset,WAKE_LIFETIME,
  clampNotch,throttleFromNotch,notchFromTrackPosition,positionForNotch,labelForNotch,
  START_Y,LOCK,COURSES,getActiveCourse,setActiveCourse,centreAt,halfWidthAt,waterwayAt,waterwayAtPosition,
  checkBanks,checkObstacles,insideLock,pointOnHull,canalEnvironmentAt,technicalPath,technicalRouteProgress
};

function boot(course){
  const frames=[],nodes=new Map(),calls={paint:0},saved=new Map();
  let paintStarted=false;
  const ctx=new Proxy({},{
    get(_target,key){
      if(['fillRect','strokeRect','ellipse','lineTo','stroke','fill','arc'].includes(key))
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
  const buttons=['classic','test','technical'].map(courseName=>{
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
  assert.match(node('homeProgress').textContent,/0 \/ 3/);
  assert.match(node('homeSelectedBest').textContent,/--:--/);
  assert.equal(frames.length,1,'entrypoint should schedule animation');
  frames.shift()(16);
  assert.ok(calls.paint>(course==='technical'?55:100),'first frame should paint a canal and boat');
  assert.match(node('waterInfo').textContent,/DEPTH.*WIDTH/);
  assert.equal(node('stageName').textContent,course==='technical'?'The Bridge & Bend':course==='test'?'The Waterway Lab':'Bridge to Lock');
  assert.equal(node('hintDisplay').textContent,
    course==='technical'?'STONE BRIDGE AHEAD':course==='test'?'WATCH DEPTH & WIDTH':'WATCH YOUR STERN',
    'cruising hints should use unobstructed deck footer');
  assert.equal(node('lockIndicator').classList.contains('is-hidden'),true,
    'dock guidance only appears at the lock');
  const previous=calls.paint;
  node('startButton').__events.click();
  assert.equal(node('gameShell').classList.contains('is-home'),false,'controls appear only in gameplay');
  for(const tick of [32,48,64,80]){
    assert.ok(frames.length>0);
    frames.shift()(tick);
  }
  assert.ok(calls.paint>previous+100,'gameplay must continue drawing');
  assert.equal(paintStarted,true);
  // Exercise lock, stone bridge, aqueduct and brick-cutting draw paths, not
  // merely the first frame beside the start. This would have caught an
  // exception that occurred only near the finish.
  const locations=course==='technical'?[-85,-130,-169,-215,-405]:course==='test'?[-95,-280,-490,-625]:[-130,-405];
  let tick=96;
  for(const y of locations){
    vm.runInContext('boat.y='+y+';boat.x=centreAt('+y+');camera.y=boat.y;camera.x=boat.x;',sandbox);
    const beforeSection=calls.paint;
    assert.ok(frames.length>0);
    frames.shift()(tick);
    tick+=16;
    assert.ok(calls.paint>beforeSection+(course==='technical'?25:40),'section '+y+' must render');
  }
  // The approaching-lock prompt is drawn only in the dedicated panel,
  // not across the middle of the playfield or over water-depth information.
  vm.runInContext(`
    boat.y=LOCK.startY+84;boat.x=centreAt(boat.y);
    lockState=updateLockStop(boat,0,0,BOAT.length,BOAT.beam);
    updateUI();
  `,sandbox);
  assert.equal(node('lockIndicator').classList.contains('is-hidden'),false);
  assert.match(node('lockIndicatorText').textContent,/LOCK AHEAD/);
  // Check actual UI feedback for the two previously invisible blockers:
  // whether the stern is still outside and whether lateral drift is present.
  vm.runInContext(`
    boat.x=LOCK.centreX;boat.y=LOCK.startY+3;
    boat.vx=0;boat.vy=0;boat.yawRate=0;
    lockState=updateLockStop(boat,0,0,BOAT.length,BOAT.beam);
    updateUI();
  `,sandbox);
  assert.equal(node('lockIndicator').classList.contains('is-hidden'),false);
  assert.match(node('lockIndicatorText').textContent,/STERN STILL OUTSIDE/);
  vm.runInContext(`
    boat.y=(LOCK.startY+LOCK.endY)/2;
    boat.vx=.2;boat.vy=0;boat.forwardSpeed=0;
    lockState=updateLockStop(boat,0,0,BOAT.length,BOAT.beam);
    updateUI();
  `,sandbox);
  assert.equal(node('speedDisplay').textContent,'0.45',
    'speedometer should display sideways drift, not zero');
  assert.match(node('lockIndicatorText').textContent,/SLOW BELOW 0.18 MPH/);
  vm.runInContext(`
    boat.vx=0;boat.vy=-.06;boat.yawRate=0;
    lockState=updateLockStop(boat,.6,0,BOAT.length,BOAT.beam);
    updateUI();
  `,sandbox);
  assert.match(node('lockIndicatorText').textContent,/STOP FOR 2 SECONDS · 30%/);
  assert.equal(node('lockProgress').style.width,'30%');
  // Exercise finish bookkeeping in the real entrypoint. The physics-based
  // end-to-end lock test is in navigation.test.js; here we call finish
  // directly to verify completion saves the best time and ghost replay.
  vm.runInContext('elapsed=1.5; finish();',sandbox);
  assert.ok(node('gameShell').classList.contains('is-finished'));
  assert.match(node('resultGhost').textContent,/New course ghost recorded/);
  assert.ok(saved.has(ghostKey(course)));
  assert.ok(saved.has('power-canal-best-'+course+(course==='technical'?'-rightangle-v2':'')));
  node('courseButton').__events.click();
  assert.equal(node('gameShell').classList.contains('is-home'),true,'course button returns to home');
  assert.match(node('homeProgress').textContent,/1 \/ 3/);
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

for(const route of ['classic','test','technical']){
  test(route+' starts and draws its canal without a blank canvas',()=>{
    const previous=getActiveCourse().id;
    try{boot(route);}finally{setActiveCourse(previous);}
  });
}
