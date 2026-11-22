// Lightweight, deterministic planar narrowboat model. SI units throughout.
// This is a gameplay approximation, not a validated hydrodynamics solver.
export const BOAT = Object.freeze({
  length:14.6, beam:2.08, mass:14000, engineForce:9800,
  reverseFraction:0.65, dragLinear:680, dragQuadratic:2350,
  lateralDamping:1.45, yawDamping:0.95, rudderResponse:0.8,
  rudderGain:0.25, yawInertia:2.8, maxRudder:0.72
});
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const lerp=(a,b,t)=>a+(b-a)*t;
export function createBoat(x=0,y=0,heading=0){
  return {x,y,heading,vx:0,vy:0,yawRate:0,rudder:0,throttle:0,forwardSpeed:0,lateralSpeed:0};
}
export function stepBoat(b, input, dt, config=BOAT){
  const throttle=clamp(input.throttle,-1,1), tiller=clamp(input.tiller,-1,1);
  b.rudder+= (tiller*config.maxRudder-b.rudder)*(1-Math.exp(-dt/config.rudderResponse));
  b.throttle=throttle;
  const fx=Math.sin(b.heading), fy=-Math.cos(b.heading);
  const rx=Math.cos(b.heading), ry=Math.sin(b.heading);
  const forward=b.vx*fx+b.vy*fy;
  const lateral=b.vx*rx+b.vy*ry;
  // Power-limited forward acceleration with strong speed-dependent wave drag.
  const thrust=throttle<0?throttle*config.engineForce*config.reverseFraction:throttle*config.engineForce;
  const drag=config.dragLinear*forward+config.dragQuadratic*forward*Math.abs(forward);
  const longAcc=(thrust-drag)/config.mass;
  // Lateral movement is retained, but damps as the hull pushes against water.
  const lateralAcc=-lateral*config.lateralDamping - b.yawRate*forward*0.65;
  b.vx+=(fx*longAcc+rx*lateralAcc)*dt;
  b.vy+=(fy*longAcc+ry*lateralAcc)*dt;
  // A narrowboat turns through a delayed rudder force, with prop wash at low speed.
  // Positive tiller (right) makes the bow turn left: authentic tiller direction.
  const wash=0.34*Math.max(0,throttle);
  const flow=forward*Math.abs(forward);
  const yawDrive=-(flow + wash)*b.rudder*config.rudderGain/config.yawInertia;
  b.yawRate+=(yawDrive-b.yawRate*config.yawDamping)*dt;
  b.heading+=b.yawRate*dt;
  b.x+=b.vx*dt;b.y+=b.vy*dt;
  b.forwardSpeed=b.vx*Math.sin(b.heading)-b.vy*Math.cos(b.heading);
  b.lateralSpeed=b.vx*Math.cos(b.heading)+b.vy*Math.sin(b.heading);
  return b;
}
