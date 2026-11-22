import { resistanceComponents } from './hydrodynamics.js?v=20261122-15';
import { appendGhostFrame, makeGhost, readGhost, saveGhost, shouldReplaceGhost, sampleGhost } from './ghost.js?v=20261122-15';
import { drawFields, drawTowpath, drawStoneBridge } from './scenery.js?v=20261122-15';
import { updateLockStop, LOCK_STOP } from './lock-stop.js?v=20261122-15';
import { BOAT, clamp, createBoat, stepBoat } from './physics.js?v=20261122-15';
import { createWakeMark, pruneWakeMarks, travelAngle, propWashSideOffset, WAKE_LIFETIME } from './water.js?v=20261122-15';
import { clampNotch, throttleFromNotch, notchFromTrackPosition, positionForNotch, labelForNotch } from './throttle.js?v=20261122-15';
import { START_Y, LOCK, COURSES, getActiveCourse, setActiveCourse, centreAt, halfWidthAt, waterwayAt, checkBanks, checkObstacles, insideLock, pointOnHull, canalEnvironmentAt, waterwayAtPosition, technicalPath, technicalRouteProgress } from './course.js?v=20261122-15';

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'), ctx=canvas.getContext('2d');
const ui={
  start:$('startModal'), finish:$('finishModal'), time:$('timeDisplay'), penalty:$('penaltyDisplay'),
  speed:$('speedDisplay'), state:$('stateDisplay'), feedback:$('feedback'),
  throttleTrack:$('throttleTrack'), throttleThumb:$('throttleThumb'),
  tillerPad:$('tillerPad'), tillerStick:$('tillerStick'), tillerReadout:$('tillerReadout'), hint:$('hintDisplay'),
  waterLabel:$('waterLabel'), waterInfo:$('waterInfo'), ghostChip:$('ghostChip'),
  lockIndicator:$('lockIndicator'), lockIndicatorText:$('lockIndicatorText'), lockProgress:$('lockProgress')
};
let boat, controls, elapsed, penalties, running=false, finished=false, paused=false;
let messageTime=0, message='', lockHold=0, lockState=null, collisionCooldown=0, contactTotal=0, last=0, accumulator=0;
let camera={x:0,y:0}, width=0,height=0,scale=5.4, clock=0;
let wakeMarks=[],lastWakeAt=0;
let recordedFrames=[],currentGhost=null,ghostEnabled=true;
const STEP=1/60, MAX_DT=.05;
const requestedCourse=new URLSearchParams(window.location.search).get('course');
let selectedCourse=COURSES.some(c=>c.id===requestedCourse)?requestedCourse:'classic';
setActiveCourse(selectedCourse);
function bestKey(courseId=selectedCourse){return 'power-canal-best-'+courseId;}
function readBestFor(courseId){
  try{
    const stored=localStorage.getItem(bestKey(courseId)) ??
      (courseId==='classic'?localStorage.getItem('power-canal-best'):null);
    const value=Number(stored);
    return stored!==null&&Number.isFinite(value)&&value>0?value:null;
  }catch{return null;}
}
function readBest(){return readBestFor(selectedCourse);}
let best=readBest();
function renderCoursePicker(){
  const course=getActiveCourse();
  $('stageNumber').textContent='POWER CANAL v0.5.1 / STAGE '+course.number;
  $('stageName').textContent=course.name;
  $('startDescription').textContent=course.description;
  $('homeProgress').textContent=COURSES.filter(c=>readBestFor(c.id)!==null).length+' / '+COURSES.length;
  $('homeSelectedBest').textContent=best===null?'--:--.--':formatTime(best);
  for(const [id,labelId] of [['classic','stageBestClassic'],['test','stageBestTest'],['technical','stageBestTechnical']]){
    const time=readBestFor(id);
    $(labelId).textContent=time===null?'NOT COMPLETED':'BEST '+formatTime(time);
  }
  const replay=currentGhost;
  $('homeGhostStatus').textContent=replay
    ? '◇ Replay ghost ready · '+formatTime(replay.score)+' (best captured run)'
    : '◇ A finished run will create a replay ghost for this stage.';
  for(const button of document.querySelectorAll('[data-course]')){
    const selected=button.dataset.course===selectedCourse;
    button.classList.toggle('is-selected',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
}
function formatTime(s){const m=Math.floor(s/60), secs=s-m*60;return String(m).padStart(2,'0')+':'+secs.toFixed(2).padStart(5,'0');}
function reset(showStart=false){
  setActiveCourse(selectedCourse);best=readBest();
  boat=createBoat(centreAt(START_Y),START_Y,0);
  currentGhost=readGhost(localStorage,selectedCourse);
  recordedFrames=[];
  appendGhostFrame(recordedFrames,0,boat,true);
  controls={throttle:0,tiller:0};wakeMarks=[];lastWakeAt=0;clock=0;elapsed=0;penalties=0;lockHold=0;
  contactTotal=0;collisionCooldown=0;running=!showStart;finished=false;paused=false;
  lockState=updateLockStop(boat,0,0,BOAT.length,BOAT.beam);
  camera={x:boat.x,y:boat.y}; accumulator=0;message='';messageTime=0;
  ui.finish.classList.add('is-hidden');ui.start.classList.toggle('is-hidden',!showStart);
  $('gameShell').classList.toggle('is-home',showStart);
  $('gameShell').classList.remove('is-finished');
  // Home/finish use the full screen; the driving deck changes playfield
  // dimensions. Recalculate canvas backing size whenever the layout flips.
  resize();
  $('pauseButton').textContent='Ⅱ';renderCoursePicker();renderControls();updateUI();
}
function announce(text,seconds=1.8){message=text;messageTime=seconds;}
function addPenalty(seconds,label){
  penalties+=seconds;collisionCooldown=1.15;announce(label+'  +'+seconds+'s',2.2);
}
function finish(){
  running=false;finished=true;controls.throttle=0;
  const total=elapsed+penalties;
  let newBest=false;
  if(best===null || total<best){
    best=total;newBest=true;
    try{localStorage.setItem(bestKey(),String(best));}catch{}
  }
  // The score includes collision penalties; replay poses follow elapsed
  // *racing* time. The ghost is saved only for a completed lock finish.
  appendGhostFrame(recordedFrames,elapsed,boat,true);
  const candidate=makeGhost(selectedCourse,total,elapsed,recordedFrames);
  let savedReplay=false;
  if(candidate&&shouldReplaceGhost(currentGhost,total)){
    savedReplay=saveGhost(localStorage,candidate);
    if(savedReplay)currentGhost=candidate;
  }
  $('resultTime').textContent=formatTime(elapsed);
  $('resultPenalty').textContent='+'+penalties+'s';
  $('resultTotal').textContent=formatTime(total);
  $('resultBest').textContent=formatTime(best);
  $('resultMessage').textContent=(penalties===0?'Clean run! ':'')+
    (newBest?'New personal best!':'Beat your best by anticipating the bends.');
  $('resultGhost').textContent=savedReplay
    ? '◇ New course ghost recorded — race against this run next time.'
    : currentGhost?'◇ Replay your saved ghost on the next attempt.'
    : '◇ Replay recording unavailable. Your time has still been recorded.';
  renderControls();
  $('gameShell').classList.add('is-finished');
  resize();
  ui.finish.classList.remove('is-hidden');
}
function simulate(dt){
  if(!running||paused)return;
  elapsed+=dt;clock+=dt;
  collisionCooldown=Math.max(0,collisionCooldown-dt);
  messageTime=Math.max(0,messageTime-dt);
  const prev={...boat};
  stepBoat(boat,controls,dt,BOAT,canalEnvironmentAt(boat,BOAT.beam,BOAT.length));
  // Record disturbances in world coordinates so they remain in place as the
  // boat changes heading. Waves gradually disappear after the boat has passed.
  if(clock-lastWakeAt>0.48){
    const mark=createWakeMark(boat,clock);
    if(mark)wakeMarks.push(mark);
    lastWakeAt=clock;
    pruneWakeMarks(wakeMarks,clock);
  }
  // Progressive bank resistance: slowing down against the bank is much better
  // than a bounce off an invisible rectangle.
  const bank=checkBanks(boat,BOAT.length,BOAT.beam);
  if(bank.depth>0){
    // A few centimetres of collision-hull penetration are sampling noise,
    // especially at bends: nudge the hull clear without cancelling its speed.
    // Larger impacts still progressively dissipate motion and incur penalties.
    const push=Math.min(bank.depth*.25,.5);
    boat.x+=bank.normalX*push;
    boat.y+=(bank.normalY||0)*push;
    const severity=clamp((bank.depth-.035)/.30,0,1);
    if(severity>0){
      const contactDrag=2.4*severity;
      boat.vx*=Math.exp(-dt*contactDrag);
      boat.vy*=Math.exp(-dt*contactDrag);
      boat.yawRate*=Math.exp(-dt*.8*severity);
      contactTotal+=dt;
    }
    // Stage 03's stone elbow has hard masonry faces: a fast strike that
    // overlaps by several centimetres counts, whereas minor slow-speed
    // sampling/contact is still tolerated. The original levels are unchanged.
    const impactThreshold=getActiveCourse().id==='technical'?.075:.35;
    if(bank.depth>impactThreshold && collisionCooldown<=0 &&
       Math.hypot(prev.vx,prev.vy)>(getActiveCourse().id==='technical'?.65:.45)){
      addPenalty(bank.depth>1.05?5:2,
        bank.depth>1.05?'Bank impact':getActiveCourse().id==='technical'?'Stone wall scrape':'Bank scrape');
    }
  }else{contactTotal=0;}
  // The visible stone wharf projects into the winding hole: colliding
  // with it gives real resistance/penalties, just like any solid bank.
  const obstruction=checkObstacles(boat,BOAT.length,BOAT.beam);
  if(obstruction.depth>0){
    boat.x+=obstruction.normalX*Math.min(obstruction.depth*.25,.5);
    const severity=clamp((obstruction.depth-.035)/.3,0,1);
    if(severity>0){
      boat.vx*=Math.exp(-dt*2.4*severity);
      boat.vy*=Math.exp(-dt*2.4*severity);
      boat.yawRate*=Math.exp(-dt*.8*severity);
    }
    // A stone wharf is unforgiving even to a shallow glancing impact.
    if(obstruction.depth>.10&&collisionCooldown<=0&&Math.hypot(prev.vx,prev.vy)>.65)
      addPenalty(obstruction.depth>.80?5:2,obstruction.name+' impact');
  }
  // Bridges are narrow passages: test the entire hull while crossing.
  for(const bridge of getActiveCourse().bridges){
    const by=bridge.y;
    const passing=Math.abs(boat.y-by)<BOAT.length*.65+2.3;
    if(!passing)continue;
    let hit=false;
    for(const f of [-.5,0,.5]){
      const p=pointOnHull(boat,0,f*BOAT.length);
      if(Math.abs(p.y-by)<2.4 && Math.abs(p.x-centreAt(by))>bridge.opening/2-BOAT.beam/2)hit=true;
    }
    if(hit){
      boat.vx*=Math.exp(-dt*3);boat.vy*=Math.exp(-dt*5);
      if(collisionCooldown<=0 && Math.hypot(prev.vx,prev.vy)>.35) addPenalty(5,'Bridge strike');
    }
  }
  // Hard gate boundaries at the far end of the lock.
  const nose=pointOnHull(boat,0,BOAT.length*.5);
  if(nose.y<LOCK.endY+0.35){
    boat.y+=LOCK.endY+0.35-nose.y;
    boat.vy=Math.max(0,boat.vy)*0.25;
    if(collisionCooldown<=0)addPenalty(10,'Lock gate impact');
  }
  appendGhostFrame(recordedFrames,elapsed,boat);
  // A true full-hull lock finish still requires low ground speed and low
  // yaw. Tiny residual drift now counts as settled, and brief borderline
  // oscillations reduce progress rather than reset it every frame.
  lockState=updateLockStop(boat,lockHold,dt,BOAT.length,BOAT.beam);
  lockHold=lockState.hold;
  if(lockState.complete)finish();
}
function updateUI(){
  ui.time.textContent=formatTime(elapsed);
  ui.penalty.textContent='+'+String(penalties).padStart(2,'0')+'s penalty';
  // Report total speed over ground, including sideways drift. Previously
  // the speedometer omitted lateral velocity while the finish test did not.
  const speed=Math.hypot(boat.vx,boat.vy);
  // Two decimals near the lock expose the precise 0.18 mph threshold;
  // the usual one-decimal display remains less busy while cruising.
  ui.speed.textContent=(speed*2.23694).toFixed(boat.y<LOCK.startY+95?2:1);
  ui.state.textContent=paused?'PAUSED':boat.throttle<-.05?'ASTERN · '+Math.round(-boat.throttle*100)+'%':boat.throttle>.05?'AHEAD · '+Math.round(boat.throttle*100)+'%':'NEUTRAL · COASTING';
  const section=waterwayAtPosition(boat);
  ui.waterLabel.textContent=section.name;
  ui.waterInfo.textContent='DEPTH '+section.depth.toFixed(2)+'m · WIDTH '+section.width.toFixed(1)+'m';
  const docking=lockState??updateLockStop(boat,0,0,BOAT.length,BOAT.beam);
  // Docking guidance has one dedicated location and starts early enough
  // to warn the player before braking, without a floating text banner.
  const nearLock=boat.y<LOCK.startY+95;
  ui.lockIndicator.classList.toggle('is-hidden',!nearLock||finished);
  $('playfield').classList.toggle('is-lock-near',nearLock&&!finished);
  const percent=Math.min(100,Math.round(docking.progress*100));
  ui.lockProgress.style.width=percent+'%';
  $('lockProgressTrack').setAttribute('aria-valuenow',String(percent));
  let label='LOCK AHEAD · SLOW DOWN';
  // At approach distance, warn about braking rather than incorrectly
  // saying the stern is outside the lock before the bow even arrives.
  if(nearLock && boat.y<LOCK.startY+BOAT.length*.65+4){
    switch(docking.status){
      case 'entrance':
        label='MOVE FORWARD · STERN STILL OUTSIDE';break;
      case 'far-gate':
        label='TOO FAR FORWARD · REVERSE';break;
      case 'side-wall':
        label='KEEP ENTIRE BOAT INSIDE LOCK WALLS';break;
      case 'moving':
        label='SLOW BELOW 0.18 MPH · NOW '+(docking.speed*2.23694).toFixed(2);break;
      case 'holding':
        label='STOP FOR 2 SECONDS · '+percent+'%';break;
      case 'complete':
        label='LOCK SECURED';break;
    }
  }
  ui.lockIndicatorText.textContent=label;
  if(nearLock){
    ui.hint.textContent=docking.inside
      ? (docking.stable?'HOLD POSITION':'STEADY THE BOAT')
      : 'SLOW FOR LOCK';
  }else{
    // Routine navigation guidance belongs in the control-deck footer,
    // not in a banner over the water and hydraulic information.
    if(selectedCourse==='technical'){
      const pos=technicalRouteProgress(boat);
      if(pos.s<164)ui.hint.textContent='STONE BRIDGE AHEAD';
      else if(pos.s<195)ui.hint.textContent='BRAKE · 90° RIGHT SOON';
      else if(pos.s<240)ui.hint.textContent='HARD RIGHT · PULSE AHEAD';
      else if(pos.s<303)ui.hint.textContent='FOLLOW EAST CUT';
      else ui.hint.textContent='WATCH THE TOWPATH';
    }else ui.hint.textContent=selectedCourse==='test'?'WATCH DEPTH & WIDTH':'WATCH YOUR STERN';
  }
  ui.feedback.textContent=messageTime>0?message:paused?'PAUSED':'';
  const visible=Boolean(currentGhost&&ghostEnabled&&running&&sampleGhost(currentGhost,elapsed));
  ui.ghostChip.classList.toggle('is-hidden',!visible);
  if(visible)$('ghostRunTime').textContent=formatTime(currentGhost.score);
  renderTiller();
}
function setThrottleNotch(notch){
  controls.throttle=throttleFromNotch(notch);
  renderControls();
}
function renderTiller(){
  // Show actual mechanical tiller/rudder position, not the target input.
  const actual=clamp(boat.rudder/BOAT.maxRudder,-1,1);
  ui.tillerStick.style.transform='translateX(-50%) rotate('+actual*52+'deg)';
  ui.tillerPad.setAttribute('aria-valuenow',String(Math.round(actual*100)));
  ui.tillerPad.setAttribute('aria-valuetext',Math.abs(actual)<.04?'Centre':(actual<0?'Port ':'Starboard ')+Math.round(Math.abs(actual)*100)+' percent');
  ui.tillerReadout.textContent=Math.abs(actual)<.04?'CENTRE':(actual<0?'PORT ':'STBD ')+Math.round(Math.abs(actual)*100)+'%';
}
function renderControls(){
  const notch=clampNotch(controls.throttle*5);
  ui.throttleThumb.style.top=positionForNotch(notch)+'%';
  ui.throttleTrack.setAttribute('aria-valuenow',String(notch));
  ui.throttleTrack.setAttribute('aria-valuetext',labelForNotch(notch));
  const toggle=$('ghostToggle');
  toggle.setAttribute('aria-pressed',String(ghostEnabled));
  toggle.disabled=!currentGhost;
  toggle.title=currentGhost?'Toggle best captured ghost':'No recorded ghost for this stage yet';
  renderTiller();
}
function trackPointer(element,compute,setter){
  let pointer=null;
  element.addEventListener('pointerdown',e=>{
    if(!running||paused)return;pointer=e.pointerId;element.setPointerCapture(pointer);
    setter(compute(e));e.preventDefault();
  });
  element.addEventListener('pointermove',e=>{
    if(pointer!==e.pointerId)return;
    setter(compute(e));e.preventDefault();
  });
  const release=e=>{if(pointer===e.pointerId)pointer=null;};
  element.addEventListener('pointerup',release);
  element.addEventListener('pointercancel',release);
}
trackPointer(ui.throttleTrack,e=>{
  const rect=ui.throttleTrack.getBoundingClientRect();
  return notchFromTrackPosition(e.clientY,rect.top,rect.height);
},setThrottleNotch);
trackPointer(ui.tillerPad,e=>{
  const rect=ui.tillerPad.getBoundingClientRect();
  return clamp((e.clientX-(rect.left+rect.width/2))/(rect.width*.43),-1,1);
},v=>{controls.tiller=Math.abs(v)<.04?0:v;renderControls();});
function keyInput(e){
  if(!running||paused)return;
  const d=e.key==='ArrowLeft'?['tiller',-.12]:e.key==='ArrowRight'?['tiller',.12]:null;
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){
    e.preventDefault();setThrottleNotch(controls.throttle*5+(e.key==='ArrowUp'?1:-1));
  }
  if(d){e.preventDefault();controls[d[0]]=clamp(controls[d[0]]+d[1],-1,1);renderControls();}
  if(e.code==='Space'){e.preventDefault();controls.throttle=0;renderControls();}
  if(e.key.toLowerCase()==='c'){controls.tiller=0;renderControls();}
  if(e.key.toLowerCase()==='g'&&currentGhost){ghostEnabled=!ghostEnabled;renderControls();}
}
document.addEventListener('keydown',keyInput);
function arrowStep(e,control,step){if(['ArrowUp','ArrowRight'].includes(e.key)){e.preventDefault();controls[control]=clamp(controls[control]+step,-1,1);renderControls();}if(['ArrowDown','ArrowLeft'].includes(e.key)){e.preventDefault();controls[control]=clamp(controls[control]-step,-1,1);renderControls();}}
ui.throttleTrack.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End'].includes(e.key)){
    e.preventDefault();
    setThrottleNotch(e.key==='Home'?-5:e.key==='End'?5:controls.throttle*5+(['ArrowUp','ArrowRight'].includes(e.key)?1:-1));
  }
});
ui.tillerPad.addEventListener('keydown',e=>{e.stopPropagation();arrowStep(e,'tiller',.08);});
for(const button of document.querySelectorAll('[data-course]')){
  button.addEventListener('click',()=>{
    selectedCourse=button.dataset.course;
    reset(true);
  });
}
$('startButton').addEventListener('click',()=>reset(false));
$('chooseRouteButton').addEventListener('click',()=>reset(true));
$('courseButton').addEventListener('click',()=>reset(true));
$('ghostToggle').addEventListener('click',()=>{
  if(!currentGhost)return;
  ghostEnabled=!ghostEnabled;renderControls();updateUI();
});
$('againButton').addEventListener('click',()=>reset(false));
$('resetButton').addEventListener('click',()=>reset(false));
$('pauseButton').addEventListener('click',()=>{
  if(!running)return;
  paused=!paused;$('pauseButton').textContent=paused?'▶':'Ⅱ';
});
function resize(){
  const box=canvas.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1);
  width=box.width;height=box.height;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  scale=clamp(width/42,4,11);
}
window.addEventListener('resize',resize);
function project(x,y){return {x:width/2+(x-camera.x)*scale,y:height*.63+(y-camera.y)*scale};}
function polygon(points,fill,stroke,lineWidth=1){
  if(!points.length)return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=lineWidth;ctx.strokeStyle=stroke;ctx.stroke();}
}
function canalStrip(start,end,offset){
  const points=[];for(let y=start;y<=end;y+=2)points.push(project(centreAt(y)+offset*halfWidthAt(y),y));
  points.push(project(centreAt(end)+offset*halfWidthAt(end),end));
  return points;
}
function drawAqueductDeck(low,high){
  const aqueduct=getActiveCourse().aqueduct;
  if(!aqueduct)return;
  const begin=Math.max(low,aqueduct.bottom),end=Math.min(high,aqueduct.top);
  if(begin>=end)return;
  // The ravine and crossing stream are below the raised stone trough.
  const top=project(0,aqueduct.top),bottom=project(0,aqueduct.bottom);
  ctx.fillStyle='#738c83';ctx.fillRect(0,Math.min(top.y,bottom.y),width,Math.abs(top.y-bottom.y));
  const streamCentre=(aqueduct.top+aqueduct.bottom)/2;
  const stream=project(0,streamCentre);
  ctx.fillStyle='#4b8396';ctx.fillRect(0,stream.y-9*scale,width,18*scale);
  ctx.strokeStyle='#a1c2bb';ctx.lineWidth=2;
  for(const t of [-5,0,5]){
    ctx.beginPath();ctx.moveTo(0,stream.y+t*scale);
    ctx.lineTo(width,stream.y+(t+1)*scale);ctx.stroke();
  }
  const left=[],right=[];
  for(let y=begin;y<=end;y+=2){
    left.push(project(centreAt(y)-halfWidthAt(y)-3.3,y));
    right.push(project(centreAt(y)+halfWidthAt(y)+3.3,y));
  }
  left.push(project(centreAt(end)-halfWidthAt(end)-3.3,end));
  right.push(project(centreAt(end)+halfWidthAt(end)+3.3,end));
  polygon([...left,...right.reverse()],'#b9ae9b','#71695d',4);
  // Repeated projecting shadows/pier tops make the trough legible from above.
  for(let y=-328;y<=-248;y+=15){
    if(y<begin||y>end)continue;
    const l=project(centreAt(y)-halfWidthAt(y)-3.1,y);
    const r=project(centreAt(y)+halfWidthAt(y)+3.1,y);
    ctx.strokeStyle='#81766b';ctx.lineWidth=3;
    for(const side of [l,r]){
      ctx.beginPath();ctx.moveTo(side.x-4,side.y-8);ctx.lineTo(side.x+4,side.y+8);ctx.stroke();
    }
  }
}
function drawTurningFeatures(low,high){
  if(getActiveCourse().id!=='technical')return;
  // The world-space warning sits alongside the actual bridge and turn,
  // unlike text over the HUD. It follows the 2D geometry in both directions.
  for(const sign of [
    {x:-9,y:-71,label:'BRIDGE AHEAD'},
    {x:-9,y:-98,label:'90° RIGHT · 22 M'},
    {x:-8,y:-117,label:'SLOW · TILLER'},
    {x:29,y:-139,label:'USE AHEAD THRUST'}
  ]){
    if(sign.y<low-25||sign.y>high+25)continue;
    const p=project(sign.x,sign.y);
    ctx.fillStyle='#5f523e';ctx.fillRect(p.x-2,p.y,4,26);
    ctx.fillStyle='#f1d2a2';ctx.fillRect(p.x-62,p.y-18,124,26);
    ctx.strokeStyle='#806949';ctx.lineWidth=2;
    ctx.strokeRect(p.x-62,p.y-18,124,26);
    ctx.fillStyle='#4d3829';ctx.font='bold 10px DM Sans';ctx.textAlign='center';
    ctx.fillText(sign.label,p.x,p.y);
  }
}
function drawTechnicalCanal(){
  ctx.fillStyle='#b9cca3';ctx.fillRect(0,0,width,height);
  const path=technicalPath();
  // Thick variable-width strokes make a genuine right-angle canal.
  // Drawing and hull collision are both based on these identical path
  // vertices and technicalSectionAt(s) widths. No y-slice shortcut.
  for(const pass of ['bank','water']){
    for(let i=0;i<path.length-1;i++){
      const a=path[i],b=path[i+1];
      const mid=technicalRouteProgress({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
      const size=mid.width+(pass==='bank'?2.6:0);
      const A=project(a.x,a.y),B=project(b.x,b.y);
      if(Math.max(A.x,B.x)<-80||Math.min(A.x,B.x)>width+80||
         Math.max(A.y,B.y)<-80||Math.min(A.y,B.y)>height+80)continue;
      ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);
      ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=size*scale;
      ctx.strokeStyle=pass==='bank'
        ? mid.bank==='brick'?'#978574':'#c9bca5'
        : mid.depth>1.8?'#689dab':'#7caeba';
      ctx.stroke();
    }
  }
  // Narrow gravel towpath follows the west/outer side of the real waterway.
  for(let i=0;i<path.length-1;i+=2){
    const a=path[i],b=path[Math.min(path.length-1,i+2)];
    const mid=technicalRouteProgress({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    const dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy);
    if(n<.01)continue;
    const offset=mid.width/2+2.2;
    const nx=dy/n,ny=-dx/n;
    const A=project(a.x+nx*offset,a.y+ny*offset);
    const B=project(b.x+nx*offset,b.y+ny*offset);
    if(Math.max(A.x,B.x)<-30||Math.min(A.x,B.x)>width+30||
       Math.max(A.y,B.y)<-30||Math.min(A.y,B.y)>height+30)continue;
    ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);
    ctx.strokeStyle='#dac9a5';ctx.lineWidth=2.1*scale;ctx.lineCap='round';ctx.stroke();
  }
  drawTurningFeatures(camera.y-height/scale,camera.y+height/scale);
  for(const bridge of getActiveCourse().bridges)
    drawStoneBridge(ctx,{bridge,project,centreAt,scale,width,height});
  drawLockApproach();
  drawLock();
}
function drawCanal(){
  if(getActiveCourse().id==='technical'){drawTechnicalCanal();return;}
  ctx.fillStyle=getActiveCourse().id==='test'?'#b6c9a4':getActiveCourse().id==='technical'?'#b4c49e':'#c5d4ae';
  ctx.fillRect(0,0,width,height);
  const ya=camera.y-(height/scale),yb=camera.y+(height/scale);
  const low=Math.floor(ya/2)*2,high=Math.ceil(yb/2)*2;
  drawFields(ctx,{low,high,project,centreAt,halfWidthAt,
    courseId:getActiveCourse().id});
  drawAqueductDeck(low,high);
  const left=canalStrip(low,high,-1),right=canalStrip(low,high,1).reverse();
  polygon([...left,...right],'#75aebb',null);
  // Individual sections show deep-water blue versus pale/shallow turquoise.
  // The same measured width/depth is passed to the actual resistance model.
  for(let y=low;y<high;y+=2){
    const next=Math.min(y+2,high),a=waterwayAt(y),b=waterwayAt(next);
    const depth=(a.depth+b.depth)/2;
    const deep=clamp((depth-.85)/1.9,0,1);
    const r=Math.round(128-50*deep),g=Math.round(180-29*deep),blue=Math.round(171+2*deep);
    const color=a.bank==='aqueduct'?'#69a7b4':'rgb('+r+','+g+','+blue+')';
    polygon([
      project(centreAt(y)-a.width/2,y),project(centreAt(y)+a.width/2,y),
      project(centreAt(next)+b.width/2,next),project(centreAt(next)-b.width/2,next)
    ],color,null);
    for(const side of [-1,1]){
      const p=project(centreAt(y)+side*a.width/2,y);
      const q=project(centreAt(next)+side*b.width/2,next);
      const masonry=a.bank!=='natural';
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
      ctx.lineCap='butt';ctx.lineWidth=masonry?7:8;
      ctx.strokeStyle=a.bank==='brick'?'#a17c63':
        a.bank==='stone'||a.bank==='aqueduct'?'#c5b79e':'#a5c5a1';
      ctx.stroke();
      if(masonry){
        ctx.lineWidth=2;ctx.strokeStyle=a.bank==='brick'?'#624e44':'#807867';
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
        if(Math.floor(y/7)!==Math.floor(next/7)){
          const n=side*3.5;
          ctx.lineWidth=1;ctx.strokeStyle=a.bank==='brick'?'#dec5a1':'#eee0c4';
          ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+n,p.y-3);ctx.stroke();
        }
      }
    }
  }
  drawTowpath(ctx,{low,high,project,centreAt,waterwayAt,scale});
  drawTurningFeatures(low,high);
  // Surface wave marks distinguish water motion without disguising width.
  ctx.strokeStyle='#e2f5e366';ctx.lineWidth=1;
  for(let y=low;y<high;y+=8){
    const centre=centreAt(y),half=halfWidthAt(y);
    for(const side of [-.58,.42]){
      const p=project(centre+half*side,y);
      const sway=Math.sin(y*.33+clock*1.5)*3;
      ctx.beginPath();ctx.moveTo(p.x-7,p.y+sway);
      ctx.quadraticCurveTo(p.x,p.y-3+sway,p.x+8,p.y+sway);ctx.stroke();
    }
  }
  // Subtle in-world transition markers reinforce the changes in the HUD.
  if(getActiveCourse().zones){
    for(const zone of getActiveCourse().zones){
      const y=(zone.top+zone.bottom)/2;
      if(y<low||y>high)continue;
      const bankX=centreAt(y)+halfWidthAt(y)+3.8;
      const mark=project(bankX,y);
      ctx.save();ctx.translate(mark.x,mark.y);
      ctx.fillStyle='#173c3bc9';ctx.fillRect(-5,-11,116,24);
      ctx.fillStyle='#e6ebd6';ctx.font='bold 9px DM Sans';ctx.textAlign='left';
      ctx.fillText(zone.bank==='aqueduct'?'AQUEDUCT':zone.name.replace(' · DEEP & WIDE',''),1,4);
      ctx.restore();
    }
  }
  for(const bridge of getActiveCourse().bridges){
    drawStoneBridge(ctx,{bridge,project,centreAt,scale,width,height});
  }
  drawLockApproach();
  drawLock();
}
// Signposted braking zone preceding the open lock throat. These markers
// indicate the real lock coordinates without altering the collision model.
function drawLockApproach(){
  for(const distance of [52,35,19]){
    const y=LOCK.startY+distance;
    const left=project(centreAt(y)-halfWidthAt(y)-2.4,y);
    const right=project(centreAt(y)+halfWidthAt(y)+2.4,y);
    if(left.y< -30||left.y>height+30)continue;
    for(const marker of [left,right]){
      ctx.fillStyle='#f5d38d';ctx.fillRect(marker.x-3,marker.y-9,6,18);
      ctx.fillStyle='#ac5e45';ctx.fillRect(marker.x-3,marker.y-9,6,5);
      ctx.fillRect(marker.x-3,marker.y+3,6,5);
    }
    // Directional chevrons stay outside the usable channel.
    for(const side of [-1,1]){
      const x=centreAt(y)+side*(halfWidthAt(y)+5);
      const p=project(x,y);
      ctx.beginPath();ctx.moveTo(p.x-side*6,p.y-5);
      ctx.lineTo(p.x,p.y);ctx.lineTo(p.x-side*6,p.y+5);
      ctx.strokeStyle='#f9cf86';ctx.lineWidth=2.5;ctx.stroke();
    }
  }
  const signY=LOCK.startY+47;
  const sign=project(centreAt(signY),signY);
  if(sign.y> -30 && sign.y<height+30){
    ctx.fillStyle='#143f40d9';ctx.fillRect(sign.x-61,sign.y-14,122,23);
    ctx.strokeStyle='#e5c28a';ctx.lineWidth=1.5;ctx.strokeRect(sign.x-61,sign.y-14,122,23);
    ctx.textAlign='center';ctx.font='bold 11px DM Sans';
    ctx.fillStyle='#ffdf9e';ctx.fillText('LOCK AHEAD · SLOW',sign.x,sign.y+1);
  }
}
function drawLock(){
  const left=LOCK.centreX-LOCK.width/2,right=LOCK.centreX+LOCK.width/2;
  const entrance=project(left,LOCK.startY),far=project(right,LOCK.endY);
  const upper=Math.min(entrance.y,far.y);
  const lower=Math.max(entrance.y,far.y);
  if(upper>height+80||lower< -80)return;
  const chamberWidth=(right-left)*scale,length=lower-upper;
  const onTarget=insideLock(boat,BOAT.length,BOAT.beam);
  // Distinct, darker chamber with broad cut-stone sides.
  ctx.fillStyle=onTarget?'#427f83':'#488491';
  ctx.fillRect(entrance.x,upper,chamberWidth,length);
  ctx.fillStyle='#9e9989';ctx.fillRect(entrance.x-13,upper-8,13,length+20);
  ctx.fillRect(far.x,upper-8,13,length+20);
  ctx.fillStyle='#d3c4a6';ctx.fillRect(entrance.x-8,upper-8,5,length+20);
  ctx.fillRect(far.x+3,upper-8,5,length+20);
  for(let y=upper+10;y<lower;y+=15){
    ctx.strokeStyle='#746c60';ctx.lineWidth=1;
    for(const x of [entrance.x-13,far.x]){
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+13,y);ctx.stroke();
    }
  }
  // The entire chamber is a valid stopping zone; no middle target
  // or centreline should suggest that precise centring is required.
  ctx.fillStyle='#b8e4c51a';
  ctx.fillRect(entrance.x+4,upper+18,chamberWidth-8,Math.max(0,length-36));
  // Far end only: genuinely closed lock gates. Entrance is OPEN!
  ctx.fillStyle='#44382c';ctx.fillRect(entrance.x-2,upper-7,chamberWidth+4,14);
  ctx.fillStyle='#c99b60';
  ctx.fillRect(entrance.x,upper-5,chamberWidth/2-2,9);
  ctx.fillRect(entrance.x+chamberWidth/2+2,upper-5,chamberWidth/2-2,9);
  ctx.strokeStyle='#322920';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(entrance.x,upper-4);
  ctx.lineTo(entrance.x+chamberWidth/2,upper+4);
  ctx.lineTo(far.x,upper-4);ctx.stroke();
  // Two entrance gate leaves are swung open along the walls, not across water.
  ctx.strokeStyle='#d5a96b';ctx.lineWidth=5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(entrance.x,lower+3);
  ctx.lineTo(entrance.x-7,lower+21);
  ctx.moveTo(far.x,lower+3);ctx.lineTo(far.x+7,lower+21);ctx.stroke();
  // Bright threshold marker, not a barrier.
  ctx.strokeStyle='#f2d388';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(entrance.x,lower);
  ctx.lineTo(entrance.x+chamberWidth,lower);ctx.stroke();
  ctx.textAlign='center';
  ctx.fillStyle='#fff0c2';ctx.font='bold 11px DM Sans';
  ctx.fillText('STOP IN LOCK',(entrance.x+far.x)/2,upper+Math.min(length*.55,87));
  const entryLabel=project(LOCK.centreX,LOCK.startY+11);
  if(entryLabel.y>0&&entryLabel.y<height){
    ctx.fillStyle='#153c3bc9';ctx.fillRect(entryLabel.x-46,entryLabel.y-14,92,22);
    ctx.fillStyle='#ffe0a4';ctx.font='bold 10px DM Sans';
    ctx.fillText('OPEN ENTRANCE',entryLabel.x,entryLabel.y+1);
  }
}
function waveStroke(points,opacity=1,lineWidth=1.5){
  if(points.length<2)return;
  ctx.beginPath();
  const first=project(points[0].x,points[0].y);
  ctx.moveTo(first.x,first.y);
  for(let i=1;i<points.length;i++){
    const p=project(points[i].x,points[i].y);ctx.lineTo(p.x,p.y);
  }
  ctx.strokeStyle='rgba(231,252,245,'+clamp(opacity,0,1)+')';
  ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.stroke();
}
// Local wake coordinates: forward is (sin(angle), -cos(angle)), sideways
// is (cos(angle),sin(angle)). The V opens opposite the travel direction.
function wavePoint(origin,angle,aft,side){
  const backX=-Math.sin(angle),backY=Math.cos(angle);
  return {x:origin.x+backX*aft+Math.cos(angle)*side,
          y:origin.y+backY*aft+Math.sin(angle)*side};
}
function drawWake(){
  // The established trail is rendered using old boat positions and directions.
  // It does not rotate with the current heading, avoiding the old orientation bug.
  for(const mark of wakeMarks){
    const age=clock-mark.time;
    const fade=Math.pow(Math.max(0,1-age/WAKE_LIFETIME),1.5);
    const extent=(1.0+mark.strength*2.5);
    for(const side of [-1,1]){
      const points=[];
      for(let i=0;i<=6;i++){
        const t=i/6;
        points.push(wavePoint(mark,mark.angle,extent*t,side*(.35+extent*t*.5)));
      }
      waveStroke(points,fade*mark.strength*.17,1.05);
    }
  }

  const velocity=Math.hypot(boat.vx,boat.vy);
  const ahead=Math.max(0,boat.forwardSpeed);
  if(ahead>0.2&&velocity>0.2){
    // Continuous bow shoulder waves, increasing with vessel speed.
    const bow=pointOnHull(boat,0,BOAT.length*.53);
    const angle=travelAngle(boat.vx,boat.vy,boat.heading);
    // Use the same wave and restricted-water load that resists the boat.
    // Visual height is a stylised mapping, not a computed free-surface field.
    const channel=canalEnvironmentAt(boat,BOAT.beam,BOAT.length);
    const hydrodynamics=resistanceComponents(ahead,BOAT,channel);
    const waveLoad=hydrodynamics.wave+0.4*hydrodynamics.restricted;
    const strength=clamp(Math.sqrt(waveLoad/230),0,1);
    for(const side of [-1,1]){
      const points=[];
      for(let i=0;i<=14;i++){
        const t=i/14;
        const aft=BOAT.length*(.15+.75*t);
        const spread=BOAT.beam*(.28+1.25*t)*(.4+.6*strength);
        const ripple=Math.sin(clock*3.1-t*11)*.09*strength;
        points.push(wavePoint(bow,angle,aft,side*(spread+ripple)));
      }
      waveStroke(points,strength*.64,1.4+strength*1.3);
    }
  }

  // Propeller wash is caused by engine thrust even while stationary.
  // The outflow changes sides when the combined throttle is put astern.
  const power=Math.abs(boat.throttle);
  if(power>.01){
    const direction=boat.throttle>0?1:-1;
    const source=pointOnHull(boat,0,direction>0?-BOAT.length*.55:BOAT.length*.55);
    const angle=boat.heading;
    const foam=clamp(power,0,1);
    for(let i=0;i<5;i++){
      const phase=(clock*(1.3+power*2.3)+i/5)%1;
      const axial=direction*(.4+phase*(2+foam*4));
      const width=(.18+phase*(.45+foam*.9));
      // The blade deflects the forward propeller jet; astern has a weaker effect.
      // Boat.rudder lags the tiller, so this plume naturally takes time to turn.
      const deflection=propWashSideOffset(boat.rudder,boat.throttle,Math.abs(axial));
      const centre=wavePoint(source,angle,axial,deflection+Math.sin(clock*7+i*2.1)*.18);
      const p=project(centre.x,centre.y);
      ctx.beginPath();
      const washRotation=angle + (boat.throttle>0?-boat.rudder*.5:boat.rudder*.1);
      ctx.ellipse(p.x,p.y,scale*width,scale*(.15+foam*.24),washRotation,0,Math.PI*2);
      ctx.strokeStyle='rgba(242,255,243,'+(foam*(1-phase)*.63)+')';
      ctx.lineWidth=1.15+foam;ctx.stroke();
    }
  }
}
function drawGhost(){
  if(!running||!ghostEnabled||!currentGhost)return;
  const pose=sampleGhost(currentGhost,elapsed);
  if(!pose)return;
  const position=project(pose.x,pose.y);
  const L=BOAT.length*scale,B=BOAT.beam*scale;
  ctx.save();
  ctx.translate(position.x,position.y);
  ctx.rotate(pose.heading);
  ctx.globalAlpha=.51;
  // Distinct outline and bright cabin, clearly not a solid competing boat.
  ctx.beginPath();ctx.moveTo(0,-L*.53);
  ctx.quadraticCurveTo(B*.51,-L*.46,B*.51,-L*.3);
  ctx.lineTo(B*.51,L*.47);ctx.quadraticCurveTo(0,L*.55,-B*.51,L*.47);
  ctx.lineTo(-B*.51,-L*.3);ctx.quadraticCurveTo(-B*.51,-L*.46,0,-L*.53);
  ctx.closePath();
  ctx.fillStyle='#54e1d6';ctx.fill();
  ctx.lineWidth=2.2;ctx.strokeStyle='#e2fff5';ctx.stroke();
  ctx.fillStyle='#e5ffeb';ctx.fillRect(-B*.34,-L*.27,B*.68,L*.45);
  ctx.strokeStyle='#10676e';ctx.lineWidth=1;
  ctx.strokeRect(-B*.34,-L*.27,B*.68,L*.45);
  ctx.restore();
}
function drawBoat(){
  const p=project(boat.x,boat.y);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(boat.heading);
  const L=BOAT.length*scale,B=BOAT.beam*scale;
  ctx.fillStyle='#17363d4d';ctx.beginPath();ctx.ellipse(4,5,B*.95,L*.58,0,0,Math.PI*2);ctx.fill();
  // Bow tip is towards screen top (negative y).
  ctx.beginPath();ctx.moveTo(0,-L*.53);ctx.quadraticCurveTo(B*.5,-L*.46,B*.51,-L*.3);
  ctx.lineTo(B*.51,L*.47);ctx.quadraticCurveTo(0,L*.56,-B*.51,L*.47);
  ctx.lineTo(-B*.51,-L*.3);ctx.quadraticCurveTo(-B*.5,-L*.46,0,-L*.53);
  ctx.closePath();ctx.fillStyle='#1c5050';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#eddbac';ctx.stroke();
  ctx.fillStyle='#e5c89c';ctx.fillRect(-B*.37,-L*.29,B*.74,L*.46);
  ctx.fillStyle='#ba855a';ctx.fillRect(-B*.31,-L*.26,B*.62,L*.12);
  ctx.fillStyle='#183f3e';ctx.fillRect(-B*.38,L*.22,B*.76,L*.2);
  ctx.fillStyle='#eed5a3';ctx.fillRect(-B*.30,L*.28,B*.6,L*.045);
  // Rudder / tiller handle follows the actual smoothed rudder, not instant input.
  ctx.strokeStyle='#f2b774';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,L*.45);ctx.lineTo(Math.sin(boat.rudder)*B*.75,L*.26);ctx.stroke();
  ctx.restore();
}
function render(){
  if(!width||!height)return;
  const targetX=boat.x,targetY=boat.y;
  camera.x+=(targetX-camera.x)*.075;camera.y+=(targetY-camera.y)*.075;
  ctx.clearRect(0,0,width,height);
  drawCanal();drawWake();drawGhost();drawBoat();
}
function frame(now){
  if(!last)last=now;
  const dt=Math.min(MAX_DT,(now-last)/1000);last=now;
  accumulator+=dt;
  while(accumulator>=STEP){simulate(STEP);accumulator-=STEP;}
  render();updateUI();
  requestAnimationFrame(frame);
}
reset(true);resize();requestAnimationFrame(frame);
