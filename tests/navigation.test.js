import test from 'node:test';
import assert from 'node:assert/strict';
import {BOAT, createBoat, stepBoat, clamp} from '../src/physics.js';
import { updateLockStop } from '../src/lock-stop.js';
import {
  LOCK,setActiveCourse,getActiveCourse,centreAt,checkBanks,
  pointOnHull,insideLock,canalEnvironmentAt,waterwayAt
} from '../src/course.js';

// Deterministic end-to-end navigability check. This is a test-only
// look-ahead helmsman, NOT steering assistance in the game. It uses the
// unchanged 3-DOF boat physics, controls, collision boundaries, bridge
// clearances and lock finish conditions. It demonstrates that a plausible
// sequence of steering and throttle inputs can finish the stage.
function driveRoute(courseId){
  const prior=getActiveCourse().id;
  setActiveCourse(courseId);
  try{
    const dt=1/60, endTarget=(LOCK.startY+LOCK.endY)/2;
    const b=createBoat(centreAt(60),60,0);
    let bankContacts=0,bridgeStrikes=0,lockHold=0;
    let time=0,finishTime=null,shallowSeen=false,deepSeen=false;
    for(let i=0;i<730/dt;i++){
      time=i*dt;
      const lookahead=30;
      const desired=Math.atan2(centreAt(b.y-lookahead)-b.x,lookahead);
      let error=desired-b.heading;
      while(error>Math.PI)error-=Math.PI*2;
      while(error<-Math.PI)error+=Math.PI*2;
      const tiller=clamp(-6*error+30*b.yawRate,-1,1);
      const remaining=b.y-endTarget;
      const inApproach=b.y<LOCK.startY+27;
      const desiredSpeed=Math.min(1,Math.max(0,remaining*.06));
      const throttle=inApproach?clamp(1.9*(desiredSpeed-b.forwardSpeed),-1,1):.8;
      const water=canalEnvironmentAt(b,BOAT.beam,BOAT.length);
      if(courseId==='test'){
        const section=waterwayAt(b.y);
        if(section.name==='SHALLOW NARROWS')shallowSeen=true;
        if(section.name==='DEEP BASIN')deepSeen=true;
      }
      stepBoat(b,{throttle,tiller},dt,BOAT,water);

      const bank=checkBanks(b,BOAT.length,BOAT.beam);
      if(bank.depth>0){
        if(bank.depth>.035)bankContacts++;
        b.x+=bank.normalX*Math.min(bank.depth*.25,.5);
        const severity=clamp((bank.depth-.035)/.30,0,1);
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
          const p=pointOnHull(b,0,f*BOAT.length);
          if(Math.abs(p.y-bridge.y)<2.4 &&
             Math.abs(p.x-centreAt(bridge.y))>bridge.opening/2-BOAT.beam/2)hit=true;
        }
        if(hit){
          bridgeStrikes++;
          b.vx*=Math.exp(-dt*3);
          b.vy*=Math.exp(-dt*5);
        }
      }
      const nose=pointOnHull(b,0,BOAT.length*.5);
      if(nose.y<LOCK.endY+.35){
        b.y+=LOCK.endY+.35-nose.y;
        b.vy=Math.max(0,b.vy)*.25;
      }
      const docking=updateLockStop(b,lockHold,dt,BOAT.length,BOAT.beam);
      lockHold=docking.hold;
      if(docking.complete){finishTime=time;break;}
    }
    return {finishTime,bankContacts,bridgeStrikes,shallowSeen,deepSeen,boat:b};
  }finally{setActiveCourse(prior);}
}

for(const courseId of ['classic','test']){
  test(courseId+' allows the 48-foot boat to reach and stop in its lock',()=>{
    const run=driveRoute(courseId);
    assert.notEqual(run.finishTime,null,
      courseId+' did not reach a whole-hull stationary lock finish');
    assert.ok(run.finishTime<(courseId==='classic'?420:610),
      courseId+' run took unexpectedly long');
    assert.equal(run.bankContacts,0,courseId+' hit a bank under controlled steering');
    assert.equal(run.bridgeStrikes,0,courseId+' bridge aperture blocks a navigable path');
    if(courseId==='test'){
      assert.equal(run.shallowSeen,true,'shallow narrows must be traversed');
      assert.equal(run.deepSeen,true,'deep basin must be traversed');
    }
  });
}

test('bridge openings are clear for a full hull aligned with the local route',()=>{
  for(const route of ['classic','test','technical']){
    const previous=getActiveCourse().id;
    setActiveCourse(route);
    try{
      for(const bridge of getActiveCourse().bridges){
        for(let offset=-11;offset<=11;offset+=.25){
          const y=bridge.y+offset;
          const slope=(centreAt(y+.02)-centreAt(y-.02))/.04;
          const boat=createBoat(centreAt(y),y,-Math.atan(slope));
          for(const fore of [-.5,0,.5]){
            const p=pointOnHull(boat,0,fore*BOAT.length);
            if(Math.abs(p.y-bridge.y)>=2.4)continue;
            const clearance=bridge.opening/2-BOAT.beam/2-
              Math.abs(p.x-centreAt(bridge.y));
            assert.ok(clearance>.15,
              route+' bridge at y='+bridge.y+' clips the hull, clearance '+clearance);
          }
        }
      }
    }finally{setActiveCourse(previous);}
  }
});
