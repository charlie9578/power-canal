import test from 'node:test';
import assert from 'node:assert/strict';
import { BOAT, bodyAccelerations } from '../src/physics.js';
import { trimThrottle, resistanceComponents, propellerForce } from '../src/hydrodynamics.js';
import { nomotoAtSpeed } from '../src/steering-analysis.js';
const WATER={depth:1.55,width:14};

test('cruise trim balances modelled propeller and resistance forces',()=>{
  const speed=1.25;
  const t=trimThrottle(speed,BOAT,WATER);
  assert.ok(t>0 && t<1);
  const thrust=propellerForce(speed,t,BOAT);
  const drag=resistanceComponents(speed,BOAT,WATER).total;
  assert.ok(Math.abs(thrust-drag)<1e-7);
  assert.ok(Math.abs(bodyAccelerations(speed,0,0,0,t,BOAT,WATER).uDot)<1e-10);
});

test('cannot trim a speed beyond full-ahead power',()=>{
  assert.equal(trimThrottle(8,BOAT,WATER),null);
  assert.equal(trimThrottle(0,BOAT,WATER),0);
});

test('linearised Nomoto plant agrees with 3-DOF sway yaw matrix',()=>{
  const n=nomotoAtSpeed(1.25,BOAT,WATER);
  assert.ok(n!==null&&n.stable);
  assert.equal(n.poles.length,2);
  assert.ok(n.poles.every(p=>p.real<0));
  const trace=n.A[0][0]+n.A[1][1];
  const det=n.A[0][0]*n.A[1][1]-n.A[0][1]*n.A[1][0];
  assert.ok(Math.abs(n.T1T2*det-1)<1e-10);
  assert.ok(Math.abs(n.T1plusT2*det+trace)<1e-10);
  assert.ok(n.K<0,'starboard rudder turns the bow toward port');
  assert.ok(n.zero!==null && Number.isFinite(n.zero));
});

test('Nomoto poles do not assume RHP instability',()=>{
  const n=nomotoAtSpeed(1.25,BOAT,WATER);
  assert.ok(n.stable);
  const unstable=nomotoAtSpeed(1.25,{...BOAT,lateralCentre:10},WATER);
  assert.ok(unstable.poles.some(p=>p.real>0));
});

test('Nomoto uses valid straight-line trim; returns null beyond attainable speed',()=>{
  assert.equal(nomotoAtSpeed(-1,BOAT,WATER),null);
  assert.equal(nomotoAtSpeed(8,BOAT,WATER),null);
});
