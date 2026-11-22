import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoat, BOAT } from '../src/physics.js';
import { LOCK, setActiveCourse, getActiveCourse, insideLock, lockClearance, checkBanks } from '../src/course.js';
import { LOCK_STOP, updateLockStop, lockSpeedMph } from '../src/lock-stop.js';

function inRoute(route,fn){
  const previous=getActiveCourse().id;
  setActiveCourse(route);
  try{return fn();}finally{setActiveCourse(previous);}
}
function atLock(x=LOCK.centreX,y=(LOCK.startY+LOCK.endY)/2,heading=0){
  return createBoat(x,y,heading);
}
function runHold(b,seconds,initial=0){
  let result=updateLockStop(b,initial,0,BOAT.length,BOAT.beam);
  for(let i=0;i<Math.round(seconds*60);i++){
    result=updateLockStop(b,result.hold,1/60,BOAT.length,BOAT.beam);
  }
  return result;
}

test('stopping at 0.18 mph needs two full seconds',()=>{
  assert.equal(LOCK_STOP.maxSpeed,.08);
  assert.equal(LOCK_STOP.holdSeconds,2);
  const b=atLock();b.vy=-.079;
  assert.equal(runHold(b,1.99).complete,false);
  const r=runHold(b,2.01);
  assert.equal(r.complete,true);
  assert.equal(r.progress,1);
  b.vy=-.085;
  assert.equal(runHold(b,4).complete,false);
});

for(const course of ['classic','test']){
  test(course+': boat need not be centred side-to-side or lengthwise',()=>inRoute(course,()=>{
    // Exact full-hull corners, without a requirement to target lock centre.
    for(const x of [LOCK.centreX-1.20,LOCK.centreX,LOCK.centreX+1.20]){
      for(const y of [LOCK.startY-7.55,(LOCK.startY+LOCK.endY)/2,LOCK.endY+7.55]){
        const b=atLock(x,y);
        b.vx=.05;b.yawRate=.033; // even mild rotation is allowed
        assert.equal(insideLock(b,BOAT.length,BOAT.beam),true,
          'valid off-centre hull must fit for '+course);
        const result=runHold(b,2.05);
        assert.equal(result.complete,true);
      }
    }
  }));

  test(course+': at least the whole boat must fit within the walls and gate',()=>inRoute(course,()=>{
    const b=atLock(LOCK.centreX,LOCK.startY+2);
    const result=runHold(b,4);
    assert.equal(result.complete,false);
    assert.equal(result.status,'entrance');
    assert.equal(result.progress,0);

    b.y=LOCK.endY+2;
    const beyond=runHold(b,3);
    assert.equal(beyond.status,'far-gate');
    assert.equal(beyond.complete,false);

    b.y=(LOCK.startY+LOCK.endY)/2;b.x=LOCK.centreX+1.7;
    assert.equal(insideLock(b,BOAT.length,BOAT.beam),false);
    const outside=runHold(b,4);
    assert.equal(outside.status,'side-wall');
    assert.equal(outside.complete,false);
  }));
}
test('ground-speed including lateral drift is enforced, independent of heading',()=>inRoute('classic',()=>{
  const b=atLock();
  b.forwardSpeed=0;b.vx=.09;b.vy=0;b.yawRate=0;
  assert.equal(runHold(b,3).status,'moving');
  assert.equal(runHold(b,3).complete,false);
  b.vx=.03;b.yawRate=.05;
  assert.equal(runHold(b,2.1).complete,true,
    'yaw alone is not a reason to reject a hull that fits in the chamber');
}));
test('a brief borderline speed spike PAUSES progress rather than erasing it',()=>inRoute('classic',()=>{
  const b=atLock();b.vy=-.06;
  const started=runHold(b,1.5);
  assert.ok(started.progress>.7);
  b.vy=-.09;
  const interrupted=runHold(b,.15,started.hold);
  assert.equal(interrupted.status,'settling');
  assert.equal(interrupted.hold,started.hold);
  b.vy=-.05;
  assert.equal(runHold(b,1.5,interrupted.hold).complete,true);
  b.vy=-.9;
  assert.equal(updateLockStop(b,started.hold,1/60,BOAT.length,BOAT.beam).progress,0);
}));

test('the displayed 0.18 mph always qualifies for a lock countdown',()=>inRoute('classic',()=>{
  const b=atLock();
  // 0.082m/s displays 0.18 mph although it previously failed the internal
  // 0.08m/s check. The acceptance and the gauge must agree.
  b.vy=-.082;
  assert.equal(lockSpeedMph(.082),.18);
  const tick=updateLockStop(b,0,1/60,BOAT.length,BOAT.beam);
  assert.equal(tick.inside,true);
  assert.equal(tick.speedShown,.18);
  assert.equal(tick.status,'holding');
  assert.ok(tick.hold>0,'countdown must begin on first qualifying frame');
  assert.ok(runHold(b,2.05).complete);
  b.vy=-.085;
  assert.equal(lockSpeedMph(.085),.19);
  assert.equal(runHold(b,2.05).complete,false);
}));

test('near-wall or end-gate micro-clearances do not block docking',()=>inRoute('technical',()=>{
  const b=atLock(LOCK.centreX+1.40,LOCK.startY-7.16);
  const clearance=lockClearance(b,BOAT.length,BOAT.beam);
  assert.ok(clearance.right<0&&clearance.right>-.25,
    'hull just crosses illustrated side-wall by a few centimetres');
  assert.ok(clearance.entrance<0&&clearance.entrance>-.25,
    'stern just crosses illustrated entrance by a few centimetres');
  assert.equal(insideLock(b,BOAT.length,BOAT.beam),false,
    'exact strict geometry detects the tiny overlap');
  b.vy=0;
  const stop=runHold(b,2.1);
  assert.equal(stop.inside,true);
  assert.equal(stop.complete,true);
}));

test('a started countdown survives centimetre-scale hull movement',()=>inRoute('test',()=>{
  const b=atLock(LOCK.centreX+1.40);
  b.vx=.04;
  const started=runHold(b,1);
  assert.ok(started.hold>.9);
  b.x=LOCK.centreX+1.67; // past entry margin, within exit margin
  assert.equal(insideLock(b,BOAT.length,BOAT.beam,LOCK_STOP.enterTolerance),false);
  assert.equal(insideLock(b,BOAT.length,BOAT.beam,LOCK_STOP.exitTolerance),true);
  assert.equal(runHold(b,1.1,started.hold).complete,true);
  b.x=LOCK.centreX+2.3;
  const lost=updateLockStop(b,started.hold,1/60,BOAT.length,BOAT.beam);
  assert.equal(lost.hold,0,'large movement out of the lock cancels hold');
}));

test('at speeds above the display threshold a countdown never starts',()=>inRoute('classic',()=>{
  const b=atLock();b.vy=-.09;
  const stop=runHold(b,4);
  assert.equal(stop.status,'moving');
  assert.equal(stop.hold,0);
  assert.equal(stop.speedShown,.20);
}));

test('lock walls physically guide a stationary boat into the finish zone on all stages',()=>{
  for(const route of ['classic','test','technical']){
    inRoute(route,()=>{
      const b=atLock(LOCK.centreX+1.45,(LOCK.startY+LOCK.endY)/2,.08);
      b.vx=0;b.vy=-.05;
      // This is an awkward stop near the wall: without the physical lock
      // collision, stage 03's wide approach permits it but the clock rejects
      // the overhanging bow. The other two stages must behave consistently.
      assert.equal(updateLockStop(b,0,0,BOAT.length,BOAT.beam).inside,false);
      const wall=checkBanks(b,BOAT.length,BOAT.beam);
      assert.ok(wall.depth>.25,route+' lock walls must be collidable');
      assert.ok(wall.normalX<0,'right lock wall must push boat to left');
      for(let i=0;i<60;i++){
        const hit=checkBanks(b,BOAT.length,BOAT.beam);
        if(hit.depth<=0)break;
        b.x+=hit.normalX*Math.min(hit.depth*.25,.5);
        b.y+=(hit.normalY??0)*Math.min(hit.depth*.25,.5);
      }
      const docking=updateLockStop(b,0,1/60,BOAT.length,BOAT.beam);
      assert.equal(docking.inside,true,route+' should now recognise the stopped boat');
      assert.ok(docking.hold>0,route+' countdown should start once wall contact resolves');
    });
  }
});
