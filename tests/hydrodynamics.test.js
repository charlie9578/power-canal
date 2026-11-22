import test from 'node:test';
import assert from 'node:assert/strict';
import { BOAT, createBoat, stepBoat, bodyAccelerations, directionalPoles } from '../src/physics.js';
import {
  wettedArea, frictionCoefficient, lengthFroude, canalBlockage,
  schijfCriticalFroude, schijfLimitSpeed,
  resistanceComponents, propellerForce, propellerRudderJet
} from '../src/hydrodynamics.js';

const BROAD={depth:1.55,width:14};
const RESTRICTED={depth:1.20,width:5.4};
const VERY_WIDE={depth:2.0,width:20};
const near=(a,b,epsilon=1e-8)=>Math.abs(a-b)<=epsilon;

test('ITTC-1957 friction coefficient is evaluated with log base ten',()=>{
  const V=1e7*1.004e-6/BOAT.length; // Re = 10 million
  assert.ok(near(frictionCoefficient(V,BOAT.length),.075/25,1e-12));
  assert.equal(frictionCoefficient(0,BOAT.length),0);
  assert.ok(wettedArea(BOAT)>40 && wettedArea(BOAT)<60);
});

test('Schijf subcritical critical-speed equation honours blockage',()=>{
  assert.equal(schijfCriticalFroude(0),1);
  for(const beta of [.02,.10,.25,.5]){
    const f=schijfCriticalFroude(beta);
    assert.ok(f>0 && f<1);
    assert.ok(near(1+.5*f*f-1.5*f**(2/3),beta,1e-9));
  }
  assert.ok(canalBlockage(BOAT,RESTRICTED)>canalBlockage(BOAT,BROAD));
  assert.ok(schijfLimitSpeed(BOAT,RESTRICTED)<schijfLimitSpeed(BOAT,BROAD));
});

test('drag components add to total and oppose actual movement',()=>{
  const r=resistanceComponents(1.4,BOAT,BROAD);
  assert.ok(r.friction>0&&r.wave>0&&r.restricted>0&&r.form>0);
  const sum=r.friction+r.form+r.wave+r.restricted+r.creep;
  assert.ok(near(r.total,sum,1e-8));
  assert.equal(resistanceComponents(0,BOAT,BROAD).total,0);
  assert.ok(near(resistanceComponents(-1.4,BOAT,BROAD).total,r.total));
  const forward=bodyAccelerations(1.4,0,0,0,0,BOAT,BROAD);
  const reverse=bodyAccelerations(-1.4,0,0,0,0,BOAT,BROAD);
  assert.ok(forward.uDot<0 && reverse.uDot>0,'drag opposes the vessel in both directions');
});

test('longer hull lowers the length-Froude wave resistance for equal speed',()=>{
  const short={...BOAT,length:10},long={...BOAT,length:20};
  assert.ok(lengthFroude(1.7,long.length)<lengthFroude(1.7,short.length));
  assert.ok(resistanceComponents(1.7,long,BROAD).wave<resistanceComponents(1.7,short,BROAD).wave);
});

test('restricted canal has more resistance and finite regularised critical flow',()=>{
  assert.ok(resistanceComponents(1.2,BOAT,RESTRICTED).restricted>
            resistanceComponents(1.2,BOAT,BROAD).restricted);
  const limit=schijfLimitSpeed(BOAT,RESTRICTED);
  const at=resistanceComponents(limit,BOAT,RESTRICTED);
  const beyond=resistanceComponents(1.3*limit,BOAT,RESTRICTED);
  assert.ok(Number.isFinite(at.total) && Number.isFinite(beyond.total));
  assert.ok(beyond.total>at.total);
});

test('propeller thrust depends on speed, shaft rotation and direction',()=>{
  assert.equal(propellerForce(0,0,BOAT),0);
  const bollard=propellerForce(0,1,BOAT);
  assert.ok(bollard>0);
  assert.ok(propellerForce(1.5,1,BOAT)<bollard);
  assert.ok(propellerForce(0,-1,BOAT)<0);
  assert.ok(Math.abs(propellerForce(0,-1,BOAT))<bollard);
  assert.ok(propellerForce(0,.2,BOAT)<bollard);
  assert.ok(propellerRudderJet(bollard,BOAT)>0);
  assert.equal(propellerRudderJet(-100,BOAT),0);
});

test('equilibrium speed is realistic but not a hard-coded mph speed limit',()=>{
  function topSpeed(water) {
    let low=0,high=4;
    for(let i=0;i<56;i++) {
      const v=(low+high)/2;
      if(propellerForce(v,1,BOAT)>resistanceComponents(v,BOAT,water).total)low=v;
      else high=v;
    }
    return (low+high)/2;
  }
  const wide=topSpeed(VERY_WIDE),standard=topSpeed(BROAD),narrow=topSpeed(RESTRICTED);
  assert.ok(narrow<standard && standard<wide);
  assert.ok(standard>1.3 && standard<1.9,'48-foot narrowboat cruises at a few mph');
  assert.ok(standard<schijfLimitSpeed(BOAT,BROAD));
});

test('propeller-driven rudder still steers at rest while human tiller moves gradually',()=>{
  const b=createBoat(),dt=1/60;
  stepBoat(b,{throttle:1,tiller:1},dt,BOAT,BROAD);
  assert.ok(b.rudder>0&&b.rudder<BOAT.maxRudder);
  assert.ok(b.yawRate<0,'starboard tiller drives bow port');
  const before=b.yawRate;
  for(let i=0;i<120;i++)stepBoat(b,{throttle:1,tiller:1},dt,BOAT,BROAD);
  assert.ok(b.yawRate<before);
});

test('directional sway-yaw analysis remains stable at nominal speed',()=>{
  const poles=directionalPoles(1.5,BOAT,BROAD);
  assert.equal(poles.length,2);
  assert.ok(poles.every(p=>Number.isFinite(p.real) && p.real<0));
});
