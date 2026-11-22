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
