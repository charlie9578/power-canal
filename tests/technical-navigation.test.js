import test from 'node:test';
import assert from 'node:assert/strict';
import { BOAT, createBoat, stepBoat, clamp } from '../src/physics.js';
import { updateLockStop } from '../src/lock-stop.js';
import {
  LOCK,COURSES,setActiveCourse,getActiveCourse,centreAt,checkBanks,
  checkObstacles,pointOnHull,canalEnvironmentAt,insideLock
} from '../src/course.js';

// A test-only helmsman proves a practical 48-foot boat can complete Stage 03.
// It uses real 3-DOF forces, real bank/wharf collisions and the exact 2-second
// lock condition. This controller does NOT appear in the player game.
function pilot(mode){
  const previous=getActiveCourse().id;
  setActiveCourse('technical');
  try{
    const dt=1/60,b=createBoat(centreAt(60),60,0);
    const end=(LOCK.startY+LOCK.endY)/2;
    let hold=0,finishTime=null,bankHits=0,quayHits=0,bridgeHits=0;
    let maxQuayPenetration=0,peakTurningSpeed=0,peakTurnAngle=0;
    let aheadBursts=0,reverseBraking=0,enteredBasin=false,clearedQuay=false;
    let recordedLockStop=false;
    for(let i=0;i<960/dt;i++){
      const t=i*dt,y=b.y,turn=y<-90&&y>-175;
      const approach=y<LOCK.startY+27;
      const lookahead=turn?(mode==='pulse'?25:18):30;
      const desired=Math.atan2(centreAt(y-lookahead)-b.x,lookahead);
      const error=Math.atan2(Math.sin(desired-b.heading),
        Math.cos(desired-b.heading));
      const tiller=clamp(-(turn?7:6)*error+(turn?25:30)*b.yawRate,-1,1);

      let throttle;
      if(approach){
        const desiredSpeed=Math.min(1,Math.max(0,(y-end)*.06));
        throttle=clamp(1.9*(desiredSpeed-b.forwardSpeed),-1,1);
      }else if(mode==='fast')throttle=1;
      else if(turn){
        // Brake BEFORE the elbow, then alternate small ahead-power bursts
        // (for rudder propwash) with neutral and occasional astern to keep
        // way on the boat below roughly 0.7 m/s.
        throttle=b.forwardSpeed>.61?-.5:b.forwardSpeed<.47?.75:0;
        if(throttle>.6&&Math.abs(tiller)>.4)aheadBursts++;
        if(throttle<0)reverseBraking++;
      }else{
        const target=y<-70&&y>-105?.55:1.25;
        throttle=clamp(2.5*(target-b.forwardSpeed),-1,1);
        if(throttle<-.1&&y>-110&&y<-65)reverseBraking++;
      }
      stepBoat(b,{throttle,tiller},dt,BOAT,
        canalEnvironmentAt(b,BOAT.beam,BOAT.length));

      const bank=checkBanks(b,BOAT.length,BOAT.beam);
      if(bank.depth>.035)bankHits++;
      if(bank.depth>0){
        b.x+=bank.normalX*Math.min(bank.depth*.25,.5);
        const severity=clamp((bank.depth-.035)/.30,0,1);
        if(severity>0){
          b.vx*=Math.exp(-dt*2.4*severity);
          b.vy*=Math.exp(-dt*2.4*severity);
          b.yawRate*=Math.exp(-dt*.8*severity);
        }
      }
      const quay=checkObstacles(b,BOAT.length,BOAT.beam);
      maxQuayPenetration=Math.max(maxQuayPenetration,quay.depth);
      if(quay.depth>.035)quayHits++;
      if(quay.depth>0){
        b.x+=quay.normalX*Math.min(quay.depth*.25,.5);
        const severity=clamp((quay.depth-.035)/.30,0,1);
        if(severity>0){
          b.vx*=Math.exp(-dt*2.4*severity);
          b.vy*=Math.exp(-dt*2.4*severity);
          b.yawRate*=Math.exp(-dt*.8*severity);
        }
      }
      for(const bridge of getActiveCourse().bridges){
        if(Math.abs(b.y-bridge.y)>=BOAT.length*.65+2.3)continue;
        let hit=false;
        for(const f of [-.5,0,.5]){
          const point=pointOnHull(b,0,f*BOAT.length);
          if(Math.abs(point.y-bridge.y)<2.4&&
            Math.abs(point.x-centreAt(bridge.y))>bridge.opening/2-BOAT.beam/2)
            hit=true;
        }
        if(hit){
          bridgeHits++;
          b.vx*=Math.exp(-dt*3);b.vy*=Math.exp(-dt*5);
        }
      }
      const nose=pointOnHull(b,0,BOAT.length*.5);
      if(nose.y<LOCK.endY+.35){
        b.y+=LOCK.endY+.35-nose.y;
        b.vy=Math.max(0,b.vy)*.25;
      }
      if(turn){
        enteredBasin=true;
        peakTurningSpeed=Math.max(peakTurningSpeed,Math.hypot(b.vx,b.vy));
        peakTurnAngle=Math.max(peakTurnAngle,Math.abs(b.heading));
      }
      if(y<-200)clearedQuay=true;
      const docking=updateLockStop(b,hold,dt,BOAT.length,BOAT.beam);
      hold=docking.hold;
      if(docking.complete){
        recordedLockStop=insideLock(b,BOAT.length,BOAT.beam);
        finishTime=t;
        break;
      }
      // The high-speed baseline is only used to check its collision in the
      // turning area; no need to spend test time docking it.
      if(mode==='fast'&&y<-205)break;
    }
    return {
      finishTime,bankHits,quayHits,bridgeHits,maxQuayPenetration,
      peakTurningSpeed,peakTurnAngle,aheadBursts,reverseBraking,
      enteredBasin,clearedQuay,recordedLockStop
    };
  }finally{setActiveCourse(previous);}
}

test('stage 03 has a genuinely sharp winding-hole bend and a solid obstacle',()=>{
  const c=COURSES.find(c=>c.id==='technical');
  assert.ok(c);
  assert.equal(c.lock.centreX,35);
  assert.ok(c.obstacles?.some(o=>o.name==='STONE WHARF'));
  const previous=getActiveCourse().id;
  setActiveCourse('technical');
  try{
    const derivative=y=>(centreAt(y+.05)-centreAt(y-.05))/.1;
    assert.ok(Math.abs(Math.atan(derivative(-127)))>.9,
      'the narrowboat must swing more than 50 degrees through the bend');
    const b=createBoat(37.5,-169,0);
    assert.ok(checkObstacles(b,BOAT.length,BOAT.beam).depth>.1,
      'projecting stone wharf must have matching collision geometry');
  }finally{setActiveCourse(previous);}
});

test('controlled low-speed tiller and thrust pulses clear the quay and complete the lock',()=>{
  const result=pilot('pulse');
  assert.equal(result.enteredBasin,true);
  assert.equal(result.clearedQuay,true);
  assert.ok(result.aheadBursts>40,'rudder needs ahead propwash pulses');
  assert.ok(result.reverseBraking>0,'the helmsman must brake before turning');
  assert.ok(result.peakTurnAngle>.65,'turn must require substantial rotation');
  assert.ok(result.peakTurningSpeed<.85,'slow corner is tackled below cruising speed');
  assert.equal(result.bankHits,0,'slow line should not touch the banks');
  assert.equal(result.quayHits,0,'slow line should not touch the stone wharf');
  assert.equal(result.bridgeHits,0,'bridge is traversable');
  assert.ok(result.finishTime>0&&result.finishTime<950,
    'controlled run should stop inside final lock');
  assert.equal(result.recordedLockStop,true);
});

test('attempting the corner at full ahead on a late-turn line clips stone wharf',()=>{
  const fast=pilot('fast');
  assert.equal(fast.enteredBasin,true);
  assert.ok(fast.maxQuayPenetration>.10,
    'flat-out late-turn line should collide with the projecting wharf');
});
