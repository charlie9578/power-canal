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

test('prop wash bends with actual rudder angle, with less reverse effect',async()=>{
  const { propWashSideOffset } = await import('../src/water.js');
  assert.equal(propWashSideOffset(0,1,4),0,'straight rudder gives straight plume');
  assert.equal(propWashSideOffset(.5,0,4),0,'neutral gives no plume');
  const rightTillerAhead=propWashSideOffset(.5,1,4);
  const leftTillerAhead=propWashSideOffset(-.5,1,4);
  assert.ok(rightTillerAhead < 0,'starboard tiller deflects jet to port');
  assert.ok(leftTillerAhead > 0,'port tiller deflects jet to starboard');
  assert.ok(Math.abs(propWashSideOffset(.5,-1,4))<Math.abs(rightTillerAhead),
    'rudder has much less effect on the reverse jet');
  assert.ok(Math.abs(propWashSideOffset(.5,1,5))>Math.abs(rightTillerAhead),
    'plume curves farther downstream');
});

test('propeller wash follows the rudder response lag',async()=>{
  const { propWashSideOffset }=await import('../src/water.js');
  const b=createBoat(0,0);
  stepBoat(b,{throttle:1,tiller:1},1/60);
  const initial=Math.abs(propWashSideOffset(b.rudder,b.throttle,4));
  for(let i=0;i<60;i++)stepBoat(b,{throttle:1,tiller:1},1/60);
  assert.ok(Math.abs(propWashSideOffset(b.rudder,b.throttle,4))>initial);
});

test('tiller moves the rudder immediately while yaw changes only through inertia',()=>{
  const b=createBoat(0,0);
  stepBoat(b,{throttle:1,tiller:1},1/60);
  assert.equal(b.rudder,BOAT.maxRudder);
  assert.ok(Math.abs(b.heading)<0.001,'hull cannot instantly rotate');
});

test('zero engine power gives no prop-wash steering while stationary',async()=>{
  const {bodyAccelerations}=await import('../src/physics.js');
  const noPower=bodyAccelerations(0,0,0,.5,0);
  const ahead=bodyAccelerations(0,0,0,.5,1);
  assert.ok(Math.abs(noPower.rDot)<1e-12);
  assert.ok(ahead.rDot<0,'starboard tiller turns bow to port under ahead thrust');
});

test('added mass and low speed yaw damping preserve passive energy decay',()=>{
  const b=createBoat(0,0);
  b.yawRate=.1;
  b.vx=.4;
  const initial=Math.abs(b.yawRate);
  for(let i=0;i<600;i++)stepBoat(b,{throttle:0,tiller:0},1/60);
  assert.ok(Math.abs(b.yawRate)<initial);
  assert.ok(Math.hypot(b.vx,b.vy)<.4);
});

test('water confinement raises resistance and engine mass changes acceleration',async()=>{
  const {resistanceFactor,bodyAccelerations}=await import('../src/physics.js');
  const deep=resistanceFactor(BOAT,{depth:4,width:25});
  const shallow=resistanceFactor(BOAT,{depth:1.0,width:4.7});
  assert.ok(shallow>deep,'restricted water must be more resistive');
  const light=bodyAccelerations(0,0,0,0,1,BOAT).uDot;
  const heavy=bodyAccelerations(0,0,0,0,1,{...BOAT,mass:2*BOAT.mass}).uDot;
  assert.ok(heavy<light,'heavier boat accelerates more slowly');
});

test('directional stability is calculated, not hard-coded',async()=>{
  const {directionalPoles}=await import('../src/physics.js');
  const stable=directionalPoles(1.5,BOAT);
  assert.equal(stable.length,2);
  assert.ok(stable.every(p=>p.real<0),'baseline hull is directionally stable');
  const unstable=directionalPoles(1.5,{...BOAT,lateralCentre:10});
  assert.ok(unstable.some(p=>p.real>0),'a bow-biased hull may have an RHP mode');
});

test('canal section feeds width and bank forces to the simulator',async()=>{
  const {canalEnvironmentAt}=await import('../src/course.js');
  const {bankForces}=await import('../src/physics.js');
  const boat=createBoat(centreAt(60)+4.2,60,0);
  const water=canalEnvironmentAt(boat,BOAT.beam,BOAT.length);
  assert.ok(water.depth>BOAT.draft);
  assert.ok(water.width>BOAT.beam);
  assert.ok(Number.isFinite(bankForces(1.5,BOAT,water).N));
});
