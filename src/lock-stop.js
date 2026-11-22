/**
 * Precision docking rules for the game. These are gameplay tolerances, not
 * extra hydrodynamic forces. The boat's 3-DOF motion is left untouched.
 */
import { insideLock, pointOnHull, LOCK } from './course.js';

export const LOCK_STOP=Object.freeze({
  maxSpeed:.08,         // m/s ground speed = 0.179 mph
  holdSeconds:2,        // two seconds below threshold anywhere in chamber
  graceSpeed:.105,      // minor speed spikes reduce hold rather than reset it
  holdDecay:1.5
});

export function updateLockStop(boat,hold,dt,length,beam,limits=LOCK_STOP){
  const inside=insideLock(boat,length,beam);
  const speed=Math.hypot(boat.vx,boat.vy);
  const yaw=Math.abs(boat.yawRate);
  const speedOk=speed<=limits.maxSpeed;
  // No centre-position, heading, or separate yaw condition. The full-size
  // hull corners must remain inside the chamber throughout the stop.
  const stable=speedOk;
  const previous=Number.isFinite(hold)?Math.max(0,hold):0;
  let nextHold=0;
  if(inside){
    if(stable)nextHold=Math.min(limits.holdSeconds,previous+Math.max(0,dt));
    else if(speed<=limits.graceSpeed){
      nextHold=Math.max(0,previous-Math.max(0,dt)*limits.holdDecay);
    }
  }
  const complete=inside&&nextHold>=limits.holdSeconds-1e-9;
  let status='approach';
  if(inside){
    if(complete)status='complete';
    else if(!speedOk)status='moving';
    else status='holding';
  }else{
    // Match the existing whole-hull finish geometry; the status can explain
    // which end of the long vessel is still outside the chamber.
    const points=[-.5,.5].flatMap(fore=>
      [-.5,.5].map(side=>pointOnHull(boat,side*beam,fore*length)));
    const tolerance=.05;
    if(points.some(p=>p.y<=LOCK.endY-tolerance))status='far-gate';
    else if(points.some(p=>p.y>=LOCK.startY+tolerance))status='entrance';
    else if(points.some(p=>Math.abs(p.x-LOCK.centreX)>=LOCK.width/2+tolerance))
      status='side-wall';
  }
  return {
    inside,speed,yawRate:yaw,speedOk,stable,
    hold:nextHold,progress:Math.min(1,nextHold/limits.holdSeconds),
    complete,status
  };
}
