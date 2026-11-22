import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoat, BOAT } from '../src/physics.js';
import { LOCK, setActiveCourse, getActiveCourse } from '../src/course.js';
import { LOCK_STOP, updateLockStop } from '../src/lock-stop.js';

function inRoute(route,fn){
  const previous=getActiveCourse().id;
  setActiveCourse(route);
  try{return fn();}finally{setActiveCourse(previous);}
}
function atMiddle(){
  return createBoat(LOCK.centreX,(LOCK.startY+LOCK.endY)/2,0);
}
function runHold(boat,seconds,initial=0){
  let result=updateLockStop(boat,initial,0,BOAT.length,BOAT.beam);
  for(let n=0;n<Math.round(seconds*60);n++){
    result=updateLockStop(boat,result.hold,1/60,BOAT.length,BOAT.beam);
  }
  return result;
}

for(const course of ['classic','test']){
  test(course+': visually stopped boat completes even when coasting above former strict threshold',()=>inRoute(course,()=>{
    const b=atMiddle();
    b.vy=-.12; b.forwardSpeed=.12;
    const result=runHold(b,1.3);
    assert.equal(result.inside,true);
    assert.equal(result.stable,true);
    assert.equal(result.complete,true);
    assert.equal(result.status,'complete');
    assert.equal(result.progress,1);
  }));
  test(course+': entire boat must be within lock geometry',()=>inRoute(course,()=>{
    const b=createBoat(LOCK.centreX,LOCK.startY+3,0);
    const result=runHold(b,4);
    assert.equal(result.inside,false);
    assert.equal(result.complete,false);
    assert.equal(result.progress,0);
    assert.equal(result.status,'entrance');
    b.y=(LOCK.startY+LOCK.endY)/2;
    const holding=runHold(b,.6);
    assert.equal(holding.inside,true);
    assert.ok(holding.progress>.4);
    assert.equal(holding.complete,false);
    b.y=LOCK.endY+3;
    const beyond=updateLockStop(b,holding.hold,1/60,BOAT.length,BOAT.beam);
    assert.equal(beyond.inside,false);
    assert.equal(beyond.status,'far-gate');
    assert.equal(beyond.progress,0);
  }));
}

test('the full ground-speed vector matters, not just longitudinal speed',()=>inRoute('classic',()=>{
  const b=atMiddle();
  b.forwardSpeed=0;b.vx=.2;b.vy=0;
  const result=runHold(b,2);
  assert.equal(result.inside,true);
  assert.equal(result.speedOk,false);
  assert.equal(result.status,'moving');
  assert.equal(result.complete,false);
  b.vx=0;b.yawRate=.052;
  const turning=runHold(b,2);
  assert.equal(turning.status,'turning');
  assert.equal(turning.complete,false);
}));

test('minor residual oscillation decays, instead of resetting an almost completed hold',()=>inRoute('classic',()=>{
  const b=atMiddle();b.vy=-.12;
  const started=runHold(b,.9);
  assert.ok(started.progress>.65);
  b.vy=-.18;
  const interrupted=runHold(b,.12,started.hold);
  assert.ok(interrupted.progress>.5,'temporary overspeed should preserve some progress');
  b.vy=-.10;
  assert.equal(runHold(b,1.0,interrupted.hold).complete,true);
  b.vy=-.8;
  const moving=updateLockStop(b,started.hold,1/60,BOAT.length,BOAT.beam);
  assert.equal(moving.progress,0,'significant motion resets progress');
}));

test('docking limits remain slower than normal cruising, with heading control',()=>{
  assert.ok(LOCK_STOP.maxSpeed<.2);
  assert.ok(LOCK_STOP.maxYawRate<.05);
  assert.ok(LOCK_STOP.holdSeconds>=1);
});
