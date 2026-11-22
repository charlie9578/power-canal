import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoat, BOAT } from '../src/physics.js';
import { LOCK, setActiveCourse, getActiveCourse, insideLock } from '../src/course.js';
import { LOCK_STOP, updateLockStop } from '../src/lock-stop.js';

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
  b.vy=-.081;
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

    b.y=(LOCK.startY+LOCK.endY)/2;b.x=LOCK.centreX+1.5;
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
test('a brief borderline speed spike only reduces accumulated progress',()=>inRoute('classic',()=>{
  const b=atLock();b.vy=-.06;
  const started=runHold(b,1.5);
  assert.ok(started.progress>.7);
  b.vy=-.09;
  const interrupted=runHold(b,.15,started.hold);
  assert.ok(interrupted.progress>.5);
  b.vy=-.05;
  assert.equal(runHold(b,1.5,interrupted.hold).complete,true);
  b.vy=-.9;
  assert.equal(updateLockStop(b,started.hold,1/60,BOAT.length,BOAT.beam).progress,0);
}));
