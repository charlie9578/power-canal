/**
 * Local second-order Nomoto *diagnostic* obtained from the 3-DOF model.
 * It is not a second steering simulation: the game runs surge/sway/yaw.
 *
 * At a fixed straight-line speed, x=[v,r], x_dot=A*x+B*delta,
 * output yaw rate r. Then
 *
 *   r(s)/delta(s)=(b_r*s + (a21*b_v-a11*b_r)) /
 *                 (s^2-tr(A)*s+det(A))
 *
 * This can be written as K*(1+T3*s)/(T1*T2*s²+(T1+T2)*s+1).
 * Hull directional poles are eigenvalues of A, while heading adds a zero
 * integrator pole. Human tiller rate limiting is external to this plant.
 */
import { BOAT, bodyAccelerations } from './physics.js';
import { trimThrottle } from './hydrodynamics.js';

export function nomotoAtSpeed(speed,c=BOAT,water={depth:1.55,width:14}){
  if(!(speed>0))return null;
  const throttle=trimThrottle(speed,c,water);
  if(throttle===null)return null;
  const e=1e-4;
  const f=(v,r,delta)=>bodyAccelerations(speed,v,r,delta,throttle,c,water);
  const dvPlus=f(e,0,0),dvMinus=f(-e,0,0);
  const drPlus=f(0,e,0),drMinus=f(0,-e,0);
  const rudderPlus=f(0,0,e),rudderMinus=f(0,0,-e);
  const a11=(dvPlus.vDot-dvMinus.vDot)/(2*e);
  const a12=(drPlus.vDot-drMinus.vDot)/(2*e);
  const a21=(dvPlus.rDot-dvMinus.rDot)/(2*e);
  const a22=(drPlus.rDot-drMinus.rDot)/(2*e);
  const bv=(rudderPlus.vDot-rudderMinus.vDot)/(2*e);
  const br=(rudderPlus.rDot-rudderMinus.rDot)/(2*e);
  const trace=a11+a22,det=a11*a22-a12*a21;
  const disc=trace*trace-4*det;
  const poles=disc>=0
    ? [{real:(trace+Math.sqrt(disc))/2,imag:0},
       {real:(trace-Math.sqrt(disc))/2,imag:0}]
    : [{real:trace/2,imag:Math.sqrt(-disc)/2},
       {real:trace/2,imag:-Math.sqrt(-disc)/2}];
  const numeratorConstant=a21*bv-a11*br;
  const zero=Math.abs(br)>1e-12 ? -numeratorConstant/br : null;
  return {
    speed,throttle,A:[[a11,a12],[a21,a22]],B:[bv,br],
    poles,zero,
    stable:poles.every(p=>p.real<0),
    K:Math.abs(det)>1e-12 ? numeratorConstant/det : null,
    T1T2:Math.abs(det)>1e-12 ? 1/det : null,
    T1plusT2:Math.abs(det)>1e-12 ? -trace/det : null,
    T3:Math.abs(numeratorConstant)>1e-12 ? br/numeratorConstant : null
  };
}
