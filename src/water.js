// Render-only helpers: motion-aligned wake marks persist in world space.
// This is stylised wake geometry, not a fluid solver.
import { BOAT, clamp } from './physics.js';
import { pointOnHull } from './course.js';

export const WAKE_LIFETIME = 6;

export function travelAngle(vx, vy, fallback=0) {
  // A heading of zero points up (negative world y).
  return Math.hypot(vx, vy) > 0.08 ? Math.atan2(vx, -vy) : fallback;
}

export function createWakeMark(boat, time) {
  const speed=Math.hypot(boat.vx,boat.vy);
  if(speed<0.22) return null;
  // Emit from the trailing end of the vessel relative to its motion.
  const end=boat.forwardSpeed>=0 ? -1 : 1;
  const p=pointOnHull(boat,0,end*BOAT.length*.53);
  return {
    x:p.x, y:p.y, time,
    angle:travelAngle(boat.vx,boat.vy,boat.heading),
    strength:clamp(speed/1.7,0,1)
  };
}

export function pruneWakeMarks(marks,time) {
  while(marks.length && time-marks[0].time>WAKE_LIFETIME) marks.shift();
  return marks;
}

// The propeller jet hits the rudder when moving ahead, diverting the stream.
// Positive rudder/tiller means the wash turns toward port (negative local side).
// Astern, the jet flows mainly forward under the hull and the rudder has much
// less authority. Use the delayed *actual rudder* angle, not touch input.
// Returns lateral offset in metres at a distance from the propeller.
export function propWashSideOffset(rudder, throttle, distance) {
  if(Math.abs(throttle)<0.01 || distance<=0 || Math.abs(rudder)<1e-10) return 0;
  const effectiveness=throttle>0 ? -0.52 : 0.10;
  return Math.tan(clamp(rudder,-0.72,0.72))*distance*effectiveness;
}
