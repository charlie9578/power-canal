import test from 'node:test';
import assert from 'node:assert/strict';
import { BOAT, createBoat, stepBoat, clamp } from '../src/physics.js';
import { updateLockStop } from '../src/lock-stop.js';
import {
  RIGHT_TURN,TECHNICAL_PATH,TECHNICAL_TURN_START,TECHNICAL_TURN_END,
  technicalNearest
} from '../src/technical-route.js';
import {
  LOCK,setActiveCourse,getActiveCourse,checkBanks,pointOnHull,
  canalEnvironmentAt,insideLock,technicalRouteProgress
} from '../src/course.js';

/**
 * Test-only pilot, not a driving assist. It follows metres along the actual
 * spatial canal, rather than pretending that a 90-degree horizontal section
 * can be represented as x=f(y). Runs real 3-DOF physics, bridge checks, full
 * hull bank contact and the production lock-stop criterion.
 */
function pilot(mode){
  const old=getActiveCourse().id;
  setActiveCourse('technical');
  try{
    const boat=createBoat(0,60,0),dt=1/60;
    const targetY=(LOCK.startY+LOCK.endY)/2;
    let bankHits=0,bridgeHits=0,maxBankPenetration=0;
    let totalAheadPulses=0,brakingSeconds=0,finishTime=null,hold=0;
    let reachedRightTurn=false,clearedRightTurn=false,peakHeading=0;
    let maxTurnSpeed=0;
    for(let i=0;i<1150/dt;i++){
      const time=i*dt;
      const pos=technicalRouteProgress(boat);
      const s=pos.s;
      const inTurn=s>=179&&s<=306;
      const look=mode==='fast'?10:14;
      const waypoint=TECHNICAL_PATH.find(p=>p.s>=s+look)??TECHNICAL_PATH.at(-1);
      const desired=Math.atan2(waypoint.x-boat.x,boat.y-waypoint.y);
      const error=Math.atan2(Math.sin(desired-boat.heading),
        Math.cos(desired-boat.heading));
      const tiller=clamp(-7*error+25*boat.yawRate,-1,1);

      let throttle;
      if(mode==='fast')throttle=1;
      else if(boat.y<LOCK.startY+27 && s>390){
        const desiredSpeed=Math.min(1,Math.max(0,(boat.y-targetY)*.06));
        throttle=clamp(1.9*(desiredSpeed-boat.forwardSpeed),-1,1);
      }else if(inTurn){
        // Use alternating short ahead bursts and neutral/astern so the
        // forward-speed rudder wash turns the boat at about 0.5 m/s.
        throttle=boat.forwardSpeed>.59?-.45:boat.forwardSpeed<.46?.78:0;
        if(throttle>.7&&Math.abs(tiller)>.35)totalAheadPulses++;
        if(throttle<0)brakingSeconds+=dt;
      }else{
        const v=s>167&&s<179?.52:1.24;
        throttle=clamp(2.5*(v-boat.forwardSpeed),-1,1);
        if(s>167&&s<200&&throttle<0)brakingSeconds+=dt;
      }
      stepBoat(boat,{throttle,tiller},dt,BOAT,
        canalEnvironmentAt(boat,BOAT.beam,BOAT.length));

      const bank=checkBanks(boat,BOAT.length,BOAT.beam);
      maxBankPenetration=Math.max(maxBankPenetration,bank.depth);
      if(bank.depth>.035)bankHits++;
      if(bank.depth>0){
        const correction=Math.min(bank.depth*.25,.5);
        boat.x+=bank.normalX*correction;
        boat.y+=(bank.normalY||0)*correction;
        const severity=clamp((bank.depth-.035)/.30,0,1);
        if(severity>0){
          boat.vx*=Math.exp(-dt*2.4*severity);
          boat.vy*=Math.exp(-dt*2.4*severity);
          boat.yawRate*=Math.exp(-dt*.8*severity);
        }
      }

      for(const bridge of getActiveCourse().bridges){
        if(Math.abs(boat.y-bridge.y)>=BOAT.length*.65+2.3)continue;
        let hit=false;
        for(const fore of [-.5,0,.5]){
          const pt=pointOnHull(boat,0,fore*BOAT.length);
          if(Math.abs(pt.y-bridge.y)<2.4 &&
             Math.abs(pt.x)>bridge.opening/2-BOAT.beam/2)hit=true;
        }
        if(hit){
          bridgeHits++;
          boat.vx*=Math.exp(-dt*3);
          boat.vy*=Math.exp(-dt*5);
        }
      }
      const now=technicalRouteProgress(boat);
      if(now.s>TECHNICAL_TURN_START)reachedRightTurn=true;
      if(now.s>TECHNICAL_TURN_END+12)clearedRightTurn=true;
      if(now.s>TECHNICAL_TURN_START-3&&now.s<TECHNICAL_TURN_END+55){
        maxTurnSpeed=Math.max(maxTurnSpeed,Math.hypot(boat.vx,boat.vy));
        peakHeading=Math.max(peakHeading,boat.heading);
      }
      if(mode==='fast'&&now.s>TECHNICAL_TURN_END+25)break;
      const nose=pointOnHull(boat,0,BOAT.length*.5);
      if(nose.y<LOCK.endY+.35){
        boat.y+=LOCK.endY+.35-nose.y;
        boat.vy=Math.max(0,boat.vy)*.25;
      }
      const stop=updateLockStop(boat,hold,dt,BOAT.length,BOAT.beam);
      hold=stop.hold;
      if(stop.complete){finishTime=time;break;}
    }
    return {bankHits,bridgeHits,maxBankPenetration,
      totalAheadPulses,brakingSeconds,finishTime,reachedRightTurn,
      clearedRightTurn,peakHeading,maxTurnSpeed,
      finishedInside:insideLock(boat,BOAT.length,BOAT.beam)};
  }finally{setActiveCourse(old);}
}

test('a stone bridge is one and a half boat lengths before an exact 90-degree right turn',()=>{
  assert.ok(Math.abs(RIGHT_TURN.cornerY-RIGHT_TURN.bridgeY+1.5*BOAT.length)<.15,
    'bridge must be about 1.5 boat lengths before the right bend');
  assert.equal(RIGHT_TURN.radius,9);
  const start=technicalNearest(0,-114.95);
  const end=technicalNearest(9,-124);
  assert.ok(Math.abs(start.tangentX)<.1 && start.tangentY<-.9,
    'boat approaches bridge heading due north');
  assert.ok(end.tangentX>.99 && Math.abs(end.tangentY)<.1,
    'corner exit points exactly east — 90-degree right turn');
});

test('the 48-foot narrowboat can slow, pulse ahead, round the corner and stop in the lock',()=>{
  const result=pilot('pulse');
  assert.equal(result.bridgeHits,0,'bridge must be passable');
  assert.equal(result.reachedRightTurn,true);
  assert.equal(result.clearedRightTurn,true);
  assert.ok(result.totalAheadPulses>25,'tiller and ahead thrust need to work together');
  assert.ok(result.peakHeading>1.2,'boat must rotate toward east by 70+ degrees');
  assert.ok(result.maxTurnSpeed<.95,'pilot slows down for the bend');
  assert.equal(result.bankHits,0,'no damaging scrape during controlled manoeuvre');
  assert.ok(result.maxBankPenetration<.036);
  assert.ok(result.finishTime!==null&&result.finishTime<1140,
    'completed manoeuvre must reach and stop in final lock');
  assert.equal(result.finishedInside,true);
});

test('running full-ahead into the right-angle elbow produces a masonry scrape',()=>{
  const result=pilot('fast');
  assert.equal(result.reachedRightTurn,true);
  assert.ok(result.maxBankPenetration>.035,
    'a flat-out late-line run must scrape the stone wall');
});

test('spatial bank checker rejects cutting across dry land inside right angle',()=>{
  const old=getActiveCourse().id;
  setActiveCourse('technical');
  try{
    const boat=createBoat(25,-104,Math.PI/2);
    const contact=checkBanks(boat,BOAT.length,BOAT.beam);
    assert.ok(contact.depth>5,
      'eastbound shortcut north of horizontal canal must run aground');
    assert.ok(Number.isFinite(contact.normalX)&&Number.isFinite(contact.normalY));
  }finally{setActiveCourse(old);}
});
