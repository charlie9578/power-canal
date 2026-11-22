import { BOAT, clamp, createBoat, stepBoat } from './physics.js?v=20261122-4';
import { createWakeMark, pruneWakeMarks, travelAngle, propWashSideOffset, WAKE_LIFETIME } from './water.js?v=20261122-4';
import { clampNotch, throttleFromNotch, notchFromTrackPosition, positionForNotch, labelForNotch } from './throttle.js?v=20261122-4';
import { WIDTH, START_Y, LOCK, centreAt, halfWidthAt, checkBanks, insideLock, pointOnHull, canalEnvironmentAt } from './course.js?v=20261122-4';

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'), ctx=canvas.getContext('2d');
const ui={
  start:$('startModal'), finish:$('finishModal'), time:$('timeDisplay'), penalty:$('penaltyDisplay'),
  speed:$('speedDisplay'), state:$('stateDisplay'), feedback:$('feedback'), course:$('courseMessage'),
  throttleTrack:$('throttleTrack'), throttleThumb:$('throttleThumb'),
  tillerPad:$('tillerPad'), tillerStick:$('tillerStick'), tillerReadout:$('tillerReadout'), hint:$('hintDisplay')
};
let boat, controls, elapsed, penalties, running=false, finished=false, paused=false;
let messageTime=0, message='', lockHold=0, collisionCooldown=0, contactTotal=0, last=0, accumulator=0;
let camera={x:0,y:0}, width=0,height=0,scale=5.4, clock=0;
let wakeMarks=[],lastWakeAt=0;
const STEP=1/60, MAX_DT=.05;
const bridgeYs=[-130,-275];
let best=null;
try{best=Number(localStorage.getItem('power-canal-best'))||null;}catch{}
function formatTime(s){const m=Math.floor(s/60), secs=s-m*60;return String(m).padStart(2,'0')+':'+secs.toFixed(2).padStart(5,'0');}
function reset(showStart=false){
  boat=createBoat(centreAt(START_Y),START_Y,0);
  controls={throttle:0,tiller:0};wakeMarks=[];lastWakeAt=0;clock=0;elapsed=0;penalties=0;lockHold=0;
  contactTotal=0;collisionCooldown=0;running=!showStart;finished=false;paused=false;
  camera={x:boat.x,y:boat.y}; accumulator=0;message='';messageTime=0;
  ui.finish.classList.add('is-hidden');ui.start.classList.toggle('is-hidden',!showStart);
  $('pauseButton').textContent='Ⅱ';renderControls();updateUI();
}
function announce(text,seconds=1.8){message=text;messageTime=seconds;}
function addPenalty(seconds,label){
  penalties+=seconds;collisionCooldown=1.15;announce(label+'  +'+seconds+'s',2.2);
}
function finish(){
  running=false;finished=true;controls.throttle=0;renderControls();
  const total=elapsed+penalties;
  let newBest=false;
  if(best===null || total<best){best=total;newBest=true;try{localStorage.setItem('power-canal-best',String(best));}catch{}}
  $('resultTime').textContent=formatTime(elapsed);
  $('resultPenalty').textContent='+'+penalties+'s';
  $('resultTotal').textContent=formatTime(total);
  $('resultBest').textContent=formatTime(best);
  $('resultMessage').textContent=(penalties===0?'Clean run! ':'')+(newBest?'New personal best!':'Beat your best by anticipating the bends.');
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
    boat.x+=bank.normalX*Math.min(bank.depth*0.25,0.5);
    boat.vx*=Math.exp(-dt*(1.4+bank.depth*3.2));
    boat.vy*=Math.exp(-dt*(0.8+bank.depth*2.4));
    boat.yawRate*=Math.exp(-dt*1.8);
    contactTotal+=dt;
    if(bank.depth>0.35&&collisionCooldown<=0 && Math.hypot(prev.vx,prev.vy)>0.45){
      addPenalty(bank.depth>1.05?5:2,bank.depth>1.05?'Bank impact':'Bank scrape');
    }
  }else{contactTotal=0;}
  // Bridges are narrow passages: test the entire hull while crossing.
  for(const by of bridgeYs){
    const passing=Math.abs(boat.y-by)<BOAT.length*.65+2.3;
    if(!passing)continue;
    let hit=false;
    for(const f of [-.5,0,.5]){
      const p=pointOnHull(boat,0,f*BOAT.length);
      if(Math.abs(p.y-by)<2.4 && Math.abs(p.x-centreAt(by))>2.1-BOAT.beam/2)hit=true;
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
  // Finish is positional and physical, not just reaching a checkpoint.
  if(insideLock(boat,BOAT.length,BOAT.beam) && Math.hypot(boat.vx,boat.vy)<.08 && Math.abs(boat.yawRate)<.025){
    lockHold+=dt;if(lockHold>1.4)finish();
  }else lockHold=0;
}
function updateUI(){
  ui.time.textContent=formatTime(elapsed);ui.penalty.textContent='+'+String(penalties).padStart(2,'0')+'s penalty';
  ui.speed.textContent=(Math.abs(boat.forwardSpeed)*2.23694).toFixed(1);
  ui.state.textContent=paused?'PAUSED':boat.throttle<-.05?'ASTERN · '+Math.round(-boat.throttle*100)+'%':boat.throttle>.05?'AHEAD · '+Math.round(boat.throttle*100)+'%':'NEUTRAL · COASTING';
  const distance=boat.y-LOCK.startY;
  if(boat.y<LOCK.startY+22){
    ui.course.textContent=insideLock(boat,BOAT.length,BOAT.beam)?'HOLD STILL IN THE LOCK '+Math.round(lockHold/1.4*100)+'%':'ENTER LOCK · STOP INSIDE';
    ui.hint.textContent='USE REVERSE TO BRAKE';
  }else if(distance<95){ui.course.textContent='LOCK AHEAD · PREPARE TO STOP';ui.hint.textContent='SLOW EARLY';}
  else{ui.course.textContent='FOLLOW THE CANAL · WATCH YOUR STERN';ui.hint.textContent='STOP INSIDE THE LOCK';}
  ui.feedback.textContent=messageTime>0?message:paused?'PAUSED':'';
}
function setThrottleNotch(notch){
  controls.throttle=throttleFromNotch(notch);
  renderControls();
}
function renderControls(){
  const notch=clampNotch(controls.throttle*5),r=controls.tiller;
  ui.throttleThumb.style.top=positionForNotch(notch)+'%';
  ui.throttleTrack.setAttribute('aria-valuenow',String(notch));
  ui.throttleTrack.setAttribute('aria-valuetext',labelForNotch(notch));
  ui.tillerStick.style.transform='translateX(-50%) rotate('+r*52+'deg)';
  ui.tillerPad.setAttribute('aria-valuenow',String(Math.round(r*100)));
  ui.tillerReadout.textContent=Math.abs(r)<.04?'CENTRE':(r<0?'PORT ':'STBD ')+Math.round(Math.abs(r)*100)+'%';
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
$('startButton').addEventListener('click',()=>reset(false));
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
function drawCanal(){
  ctx.fillStyle='#c5d4ae';ctx.fillRect(0,0,width,height);
  const ya=camera.y-(height/scale),yb=camera.y+(height/scale);
  const low=Math.floor(ya/2)*2,high=Math.ceil(yb/2)*2;
  const left=canalStrip(low,high,-1),right=canalStrip(low,high,1).reverse();
  polygon([...left,...right],'#75aebb','#a2c0a4',8);
  // Water ripple patterns follow the course; small curves make the water feel alive.
  ctx.strokeStyle='#c3e5db66';ctx.lineWidth=1;
  for(let y=low;y<high;y+=8){
    const centre=centreAt(y),half=halfWidthAt(y);
    for(const side of [-.58,.42]){
      const p=project(centre+half*side,y);
      const sway=Math.sin(y*.33+clock*1.5)*3;
      ctx.beginPath();ctx.moveTo(p.x-7,p.y+sway);ctx.quadraticCurveTo(p.x,p.y-3+sway,p.x+8,p.y+sway);ctx.stroke();
    }
  }
  // Scattered repeatable towpath detailing.
  for(let y=Math.floor(low/17)*17;y<high;y+=17){
    for(const side of [-1,1]){
      const p=project(centreAt(y)+side*(halfWidthAt(y)+3.3),y);
      const seed=Math.sin(y*14.163+side*67)*43758.5;
      const v=seed-Math.floor(seed);
      if(v>.23){
        ctx.fillStyle=v>.8?'#6a986a':'#90b785';ctx.beginPath();ctx.ellipse(p.x,p.y,6+v*5,8+v*6,.4,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#b3c99b';ctx.beginPath();ctx.arc(p.x-2,p.y-2,2+v*2,0,Math.PI*2);ctx.fill();
      }
    }
  }
  // Bridges are drawn under the boat for readability.
  for(const y of bridgeYs){
    const p=project(centreAt(y),y);
    if(p.y< -50||p.y>height+50)continue;
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='#8b7d67';ctx.fillRect(-width,-2.8*scale,width*2,5.6*scale);
    ctx.fillStyle='#c9bca3';ctx.fillRect(-width,-2.8*scale,width*2,7);
    ctx.fillRect(-width,2.8*scale-7,width*2,7);
    ctx.fillStyle='#76a8ac';ctx.fillRect(-2.25*scale,-2.8*scale,4.5*scale,5.6*scale);
    ctx.strokeStyle='#e3d7b9';ctx.lineWidth=3;ctx.strokeRect(-2.25*scale,-2.8*scale,4.5*scale,5.6*scale);
    ctx.restore();
  }
  drawLock();
}
function drawLock(){
  const top=LOCK.startY,bot=LOCK.endY;
  const l=LOCK.centreX-LOCK.width/2,r=LOCK.centreX+LOCK.width/2;
  const a=project(l,top),b=project(r,bot);
  if(a.y>height+80||b.y< -80)return;
  const length=(top-bot)*scale;
  ctx.fillStyle='#5b939f';ctx.fillRect(a.x,a.y,(r-l)*scale,length);
  ctx.fillStyle='#b4a890';ctx.fillRect(a.x-8,a.y-8,8,length+18);ctx.fillRect(b.x,a.y-8,8,length+18);
  ctx.fillStyle='#5b5043';ctx.fillRect(a.x-10,a.y-8,(r-l)*scale+20,9);
  ctx.fillStyle='#856b50';ctx.fillRect(a.x-8,b.y-1,(r-l)*scale+16,10);
  ctx.strokeStyle='#dcd1ad';ctx.lineWidth=2;ctx.strokeRect(a.x,a.y,(r-l)*scale,length);
  ctx.fillStyle='#f5ebc8';ctx.font='bold 11px DM Sans';ctx.textAlign='center';
  ctx.fillText('LOCK · STOP', (a.x+b.x)/2, a.y+Math.min(45,length*.35));
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
    const strength=clamp(ahead/1.7,0,1);
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
  drawCanal();drawWake();drawBoat();
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
