/**
 * Precision docking rules for the game. These are gameplay tolerances, not
 * extra hydrodynamic forces. The boat's 3-DOF motion is left untouched.
 */
import { insideLock } from './course.js';

export const LOCK_STOP=Object.freeze({
  maxSpeed:.16,        // m/s ground speed (0.36 mph)
  maxYawRate:.040,     // rad/s (2.3 deg/s)
  holdSeconds:1.2,
  graceSpeed:.23,      // minor spikes should not erase a nearly complete hold
  graceYawRate:.060,
  holdDecay:1.5
});

export function updateLockStop(boat,hold,dt,length,beam,limits=LOCK_STOP){
  const inside=insideLock(boat,length,beam);
  const speed=Math.hypot(boat.vx,boat.vy);
  const yaw=Math.abs(boat.yawRate);
  const speedOk=speed<=limits.maxSpeed;
  const yawOk=yaw<=limits.maxYawRate;
  const stable=speedOk&&yawOk;
  const previous=Number.isFinite(hold)?Math.max(0,hold):0;
  let nextHold=0;
  if(inside){
    if(stable)nextHold=Math.min(limits.holdSeconds,previous+Math.max(0,dt));
    else if(speed<=limits.graceSpeed&&yaw<=limits.graceYawRate){
      nextHold=Math.max(0,previous-Math.max(0,dt)*limits.holdDecay);
    }
  }
  const complete=inside&&nextHold>=limits.holdSeconds-1e-9;
  let status='approach';
  if(inside){
    if(complete)status='complete';
    else if(!speedOk)status='moving';
    else if(!yawOk)status='turning';
    else status='holding';
  }
  return {
    inside,speed,yawRate:yaw,speedOk,yawOk,stable,
    hold:nextHold,progress:Math.min(1,nextHold/limits.holdSeconds),
    complete,status
  };
}
