import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoat, stepBoat, BOAT } from '../src/physics.js';
import { centreAt, insideLock, LOCK, checkBanks } from '../src/course.js';

test('stationary boat does not move with neutral throttle',()=>{
  const boat=createBoat(centreAt(60),60);
  for(let i=0;i<60;i++)stepBoat(boat,{throttle:0,tiller:0},1/60);
  assert.ok(Math.abs(boat.y-60)<1e-8);
});

test('forward throttle moves boat north; reverse brakes it',()=>{
  const boat=createBoat(0,0);
  for(let i=0;i<240;i++)stepBoat(boat,{throttle:1,tiller:0},1/60);
  assert.ok(boat.y<0);
  const before=boat.forwardSpeed;
  for(let i=0;i<100;i++)stepBoat(boat,{throttle:-1,tiller:0},1/60);
  assert.ok(boat.forwardSpeed<before);
});

test('tiller changes heading gradually rather than instantly',()=>{
  const boat=createBoat(0,0);
  for(let i=0;i<200;i++)stepBoat(boat,{throttle:1,tiller:0},1/60);
  const previous=boat.heading;
  stepBoat(boat,{throttle:1,tiller:1},1/60);
  assert.ok(Math.abs(boat.heading-previous)<.01);
  for(let i=0;i<120;i++)stepBoat(boat,{throttle:1,tiller:1},1/60);
  assert.ok(boat.heading<previous,'starboard tiller turns bow to port');
});

test('full hull must be within the lock',()=>{
  const boat=createBoat(0,(LOCK.startY+LOCK.endY)/2,0);
  assert.equal(insideLock(boat,BOAT.length,BOAT.beam),true);
  boat.y=LOCK.startY-1;
  assert.equal(insideLock(boat,BOAT.length,BOAT.beam),false);
});

test('bank collision accounts for bow and stern length',()=>{
  const boat=createBoat(centreAt(60),60,Math.PI/2);
  assert.ok(checkBanks(boat,BOAT.length,BOAT.beam).depth>0);
});

test('wake travel heading follows actual velocity',async()=>{
  const { travelAngle, createWakeMark, pruneWakeMarks } = await import('../src/water.js');
  const movingSideways=createBoat(0,0,0);
  movingSideways.vx=1.2;
  movingSideways.forwardSpeed=0;
  assert.ok(Math.abs(travelAngle(movingSideways.vx, movingSideways.vy)-Math.PI/2)<1e-8);
  const mark=createWakeMark(movingSideways,3);
  assert.ok(mark&&Math.abs(mark.angle-Math.PI/2)<1e-8);
  const marks=[mark];
  pruneWakeMarks(marks,20);
  assert.equal(marks.length,0);
});

test('stepped throttle has eleven positions, snaps and labels correctly',async()=>{
  const { clampNotch, throttleFromNotch, notchFromTrackPosition, positionForNotch, labelForNotch } = await import('../src/throttle.js');
  assert.equal(clampNotch(100),5);
  assert.equal(clampNotch(-100),-5);
  assert.equal(throttleFromNotch(3),0.6);
  assert.equal(throttleFromNotch(-5),-1);
  assert.equal(notchFromTrackPosition(8,0,100),5);
  assert.equal(notchFromTrackPosition(50,0,100),0);
  assert.equal(notchFromTrackPosition(92,0,100),-5);
  assert.equal(positionForNotch(5),8);
  assert.equal(positionForNotch(-5),92);
  assert.equal(labelForNotch(-3),'REV 3');
  assert.equal(labelForNotch(0),'NEUTRAL');
});
