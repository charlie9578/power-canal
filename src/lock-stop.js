/**
 * Lock docking finish rules. A genuine two-second stop at ~0.18 mph, using
 * the displayed speed and the same actual hull dimensions shown on screen.
 *
 * The old check used a 5 cm lock margin and full-precision speed. A boat
 * visibly within the chamber showing 0.18 mph could therefore fail the
 * hidden test. Sub-pixel rotation or drift could then wipe the entire hold.
 * Start with small visual margins; after recognition use slightly wider
 * exit hysteresis so the two-second timer does not flicker.
 */
import { insideLock, lockClearance } from './course.js';

export const LOCK_STOP=Object.freeze({
  maxSpeed:.08,          // nominal: 0.179 mph (shown as 0.18 mph)
  displayMph:.18,       // the value that the player actually sees
  holdSeconds:2,
  graceSpeed:.11,       // pause (don't erase) countdown during small drift
  enterTolerance:.25,   // metres of geometry/rendering tolerance
  exitTolerance:.45     // metres while previously holding
});
const MPH=2.2369362921;
export function lockSpeedMph(speed){
  return Math.round(Math.max(0,speed)*MPH*100)/100;
}
export function updateLockStop(boat,hold,dt,length,beam,limits=LOCK_STOP){
  const previous=Number.isFinite(hold)?Math.max(0,hold):0;
  const speed=Math.hypot(boat.vx,boat.vy);
  const speedShown=lockSpeedMph(speed);
  // If the screen rounds 0.184 mph to 0.18, that MUST count as stopped.
  // This changes only the last displayed decimal, not the desired speed.
  const speedOk=speed<=limits.maxSpeed || speedShown<=limits.displayMph;
  const clearance=lockClearance(boat,length,beam);
  const justInside=insideLock(boat,length,beam,limits.enterTolerance);
  const inside=justInside||
    (previous>0 && insideLock(boat,length,beam,limits.exitTolerance));
  let nextHold=0,status='approach';
  if(inside){
    if(speedOk){
      nextHold=Math.min(limits.holdSeconds,previous+Math.max(0,dt));
      status=nextHold>=limits.holdSeconds-1e-9?'complete':'holding';
    }else if(previous>0 && speed<=limits.graceSpeed){
      // Timer is PAUSED rather than restarted. All two seconds still have
      // to be spent under the visible 0.18 mph threshold.
      nextHold=previous;
      status='settling';
    }else status='moving';
  }else{
    const pad=limits.enterTolerance;
    if(clearance.farGate<=-pad)status='far-gate';
    else if(clearance.entrance<=-pad)status='entrance';
    else if(clearance.left<=-pad || clearance.right<=-pad)status='side-wall';
  }
  const complete=inside&&nextHold>=limits.holdSeconds-1e-9;
  return {
    inside,speed,speedShown,yawRate:Math.abs(boat.yawRate),
    speedOk,stable:speedOk,
    clearance,hold:nextHold,
    progress:Math.min(1,nextHold/limits.holdSeconds),
    remaining:Math.max(0,limits.holdSeconds-nextHold),
    complete,status
  };
}
