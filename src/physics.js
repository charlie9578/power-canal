import { resistanceComponents, propellerForce, propellerRudderJet } from './hydrodynamics.js';
/**
 * Power Canal: horizontal-plane manoeuvring dynamics (surge, sway, yaw).
 *
 * The equations use a diagonal added-mass approximation to the conventional
 * 3-DOF rigid-body + fluid-inertia marine craft model. Forces are in newtons,
 * moments in N m, distance in metres and angles in radians.
 *
 * Heading 0 points north (-world y); positive heading/yaw is clockwise.
 * Body u is ahead-positive; body v is starboard-positive.
 * The tiller is mechanically connected to the rudder; finite human movement
 * speed limits the tiller/rudder sweep, without an arbitrary actuator delay.
 *
 * These coefficients are engineering estimates, not tank-test-identified
 * derivatives for a particular narrowboat. Longitudinal forces follow
 * ITTC friction, a Froude-based wave proxy and Schijf canal-limiting-speed
 * proximity with a K_T(J) open-water propeller model. See PHYSICS.md.
 */
export const BOAT=Object.freeze({
  length:14.6,beam:2.08,draft:0.65,mass:14000,
  yawRadiusFactor:0.29,       // yaw radius of gyration / hull length
  surgeAddedMassRatio:0.08,   // added water inertia in surge / mass
  swayAddedMassRatio:0.72,    // added water inertia in sway / mass
  yawAddedInertiaRatio:0.80,  // added moment of inertia / dry yaw inertia
  // Propeller open-water thrust: rho*n²*D⁴*K_T(J), all estimated values.
  propellerDiameter:0.52,    // metres
  propellerMaxRps:7.2,       // full-ahead shaft rev/s (432 shaft rpm)
  propellerKT0:0.25,         // bollard coefficient
  propellerKTSlope:0.27,     // K_T(J) linearised approximation
  propellerWakeFraction:0.15,
  thrustDeduction:0.05,
  reverseFraction:0.55,       // astern thrust efficiency estimate
  propellerRudderJetFactor:0.62,
  // Resistance separated into skin friction, waves and canal confinement.
  hullFormFactor:0.30,       // 3-D viscous form correction
  wettedAreaFactor:1.0,      // box-shaped underwater hull approximation
  waveCoefficient:0.015,     // empirical residual coefficient at Fn_ref
  waveReferenceFroude:0.22,
  midshipSectionFactor:0.96,
  confinedResistanceGain:8.0,// calibrated multiplier near Schijf speed
  lowSpeedDrag:80,           // manoeuvring creep drag, N per (m/s)
  dragLinear:650,             // longitudinal viscous resistance N/(m/s)
  dragQuadratic:1660,         // includes wave-making resistance
  crossflowLinear:240,        // lateral drag per metre of hull
  crossflowQuadratic:330,     // lateral quadratic drag per metre of hull
  rudderArea:0.72,            // m^2 estimated underwater rudder area
  rudderLiftSlope:1.65,       // reduced from ideal foil in prop turbulence
  rudderLever:0.45,           // rudder x = -0.45 L
  propellerJet:1.25,          // speed of jet at full ahead in m/s
  rudderReverseFactor:0.12,   // rudder has little authority when astern
  lateralCentre:-0.65,        // m; centre of lateral resistance behind CG
  maxRudder:0.67,
  maxRudderRate:2.2, // rad/s, ~0.30 s from centre to full tiller lock             // ~38 degrees, fixed tiller -> rudder
  bankBowForce:220,           // N/(m/s)^2 near bank, bow pushed away
  bankSternForce:260,         // N/(m/s)^2 near bank, stern sucked toward
  waterDensity:1000
});
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const lerp=(a,b,t)=>a+(b-a)*t;
const defaultWater=Object.freeze({depth:1.55,width:14.0,bowBank:null,sternBank:null});
export function createBoat(x=0,y=0,heading=0){
  return {x,y,heading,vx:0,vy:0,yawRate:0,rudder:0,throttle:0,forwardSpeed:0,lateralSpeed:0};
}
export function bodyVelocity(b){
  const sn=Math.sin(b.heading),cs=Math.cos(b.heading);
  return {u:b.vx*sn-b.vy*cs,v:b.vx*cs+b.vy*sn};
}
// Diagnostic ratio retained for older analysis scripts; the force model uses
// the individual resistance components directly, not a drag multiplier.
export function resistanceFactor(c=BOAT,water=defaultWater){
  const speed=1.5;
  return resistanceComponents(speed,c,water).total/
         resistanceComponents(speed,c,{depth:50,width:500}).total;
}
// Returns (force, moment) from pressure imbalance beside a bank.
// bowBank and sternBank: {clearance, side}, where side = +1 starboard,
// -1 port. A bank near the bow tends to repel the bow, while the stern
// tends to be drawn toward the bank. It is weaker below steerage speed.
export function bankForces(u,c=BOAT,water=defaultWater){
  let Y=0,N=0;
  const speed2=Math.max(0,u)**2;
  const depth=Math.max(c.draft+0.12,water.depth??defaultWater.depth);
  const shallow=clamp(1+0.75*c.draft/depth,1,1.9);
  for(const [section,coefficient,sign,x] of [
    [water.bowBank,c.bankBowForce,-1,c.length*.35],
    [water.sternBank,c.bankSternForce,1,-c.length*.35]
  ]){
    if(!section)continue;
    const clearance=Math.max(0,section.clearance);
    const proximity=Math.pow(Math.max(0,1-clearance/2.6),2);
    const force=sign*section.side*coefficient*speed2*proximity*shallow;
    Y+=force;N+=x*force;
  }
  return {Y,N};
}
export function bodyAccelerations(u,v,r,rudder,throttle,c=BOAT,water=defaultWater){
  const L=c.length, m=c.mass;
  const mx=m*(1+c.surgeAddedMassRatio), my=m*(1+c.swayAddedMassRatio);
  const Iz=m*(L*c.yawRadiusFactor)**2;
  const I=Iz*(1+c.yawAddedInertiaRatio);

  const t=clamp(throttle,-1,1);
  const thrust=propellerForce(u,t,c);
  const drag=resistanceComponents(u,c,water);
  // Drag opposes velocity; thrust reverses with the propeller shaft.
  // Wave and canal forces share the same causal model as visual bow waves.
  const X=thrust-Math.sign(u)*drag.total;

  // Distributed hull cross-flow, integrated in strips along the length.
  // Local sideways speed varies with yaw rate: v(x) = v + r*x.
  let Y=0,N=0;
  const strips=9,dx=L/strips;
  for(let i=0;i<strips;i++){
    const x=-L/2+(i+.5)*dx;
    const sideways=v+r*x;
    const force=-dx*(c.crossflowLinear*sideways+
                     c.crossflowQuadratic*sideways*Math.abs(sideways));
    Y+=force;N+=x*force;
  }
  // Offset in the hull's centre of lateral resistance (a yaw/sway
  // coupling term). A sufficiently bow-biased centre can produce an RHP
  // yaw-sway pole; the default does NOT assume such instability.
  const Ydrift=-L*(c.crossflowLinear*v+
                    c.crossflowQuadratic*v*Math.abs(v));
  N+=c.lateralCentre*Ydrift;

  // Rudder force at stern. When travelling ahead, the propeller jet gives
  // steering even near zero speed. In reverse that assistance is absent.
  const xr=-L*c.rudderLever;
  const localCross=v+xr*r;
  const forwardJet=propellerRudderJet(thrust,c);
  const forwardFlow=Math.max(0,u)+forwardJet;
  const reverseFlow=Math.max(0,-u);
  let rudderSide=0;
  if(forwardFlow>0.02){
    const incident=Math.atan2(localCross,Math.max(0.25,forwardFlow));
    const attack=clamp(rudder-incident,-0.78,0.78);
    rudderSide=.5*c.waterDensity*c.rudderArea*c.rudderLiftSlope*
        forwardFlow*forwardFlow*Math.sin(2*attack)/2;
  }
  if(reverseFlow>0.1){
    // Weak and opposite effect for water flowing forwards past the rudder.
    rudderSide-=.5*c.waterDensity*c.rudderArea*c.rudderLiftSlope*
        reverseFlow*reverseFlow*c.rudderReverseFactor*Math.sin(2*rudder)/2;
  }
  Y+=rudderSide;N+=xr*rudderSide;

  const bank=bankForces(u,c,water);Y+=bank.Y;N+=bank.N;
  // M * nu_dot + C(nu)*nu + D(nu)*nu = tau.
  // Added-mass terms appear in the Coriolis coupling.
  const uDot=(X+(m+m*c.swayAddedMassRatio)*v*r)/mx;
  const vDot=(Y-(m+m*c.surgeAddedMassRatio)*u*r)/my;
  const rDot=(N+m*(c.surgeAddedMassRatio-c.swayAddedMassRatio)*u*v)/I;
  return {uDot,vDot,rDot,force:{X,Y,N},rudderSide,thrust,resistance:drag.total,drag};
}
export function stepBoat(b,input,dt,c=BOAT,water=defaultWater){
  if(!(dt>0))return b;
  const targetRudder=clamp(input.tiller,-1,1)*c.maxRudder;
  const throttle=clamp(input.throttle,-1,1);
  // Direct mechanical tiller/rudder connection; rate limit is human arm
  // movement, not latency between rudder and tiller.
  const maxTravel=c.maxRudderRate*dt;
  const rudder=b.rudder+clamp(targetRudder-b.rudder,-maxTravel,maxTravel);
  b.rudder=rudder;b.throttle=throttle;
  const {u:initialU,v:initialV}=bodyVelocity(b);
  const a=bodyAccelerations(initialU,initialV,b.yawRate,rudder,throttle,c,water);
  const u=initialU+a.uDot*dt;
  const v=initialV+a.vDot*dt;
  b.yawRate+=a.rDot*dt;
  b.heading+=b.yawRate*dt;
  const sn=Math.sin(b.heading),cs=Math.cos(b.heading);
  b.vx=u*sn+v*cs;b.vy=-u*cs+v*sn;
  b.x+=b.vx*dt;b.y+=b.vy*dt;
  b.forwardSpeed=u;b.lateralSpeed=v;
  return b;
}
// Local straight-ahead sway/yaw poles from a finite-difference Jacobian.
// Heading itself adds a neutral integrator pole at 0; neither this nor an
// RHP zero should be confused with a directionally unstable RHP pole.
export function directionalPoles(speed,c=BOAT,water=defaultWater){
  const eps=1e-4;
  const f=(v,r)=>bodyAccelerations(speed,v,r,0,0,c,water);
  const av=(f(eps,0).vDot-f(-eps,0).vDot)/(2*eps);
  const ar=(f(0,eps).vDot-f(0,-eps).vDot)/(2*eps);
  const bv=(f(eps,0).rDot-f(-eps,0).rDot)/(2*eps);
  const br=(f(0,eps).rDot-f(0,-eps).rDot)/(2*eps);
  const trace=av+br,det=av*br-ar*bv,disc=trace*trace-4*det;
  const real=trace/2;
  if(disc>=0){
    const root=Math.sqrt(disc)/2;
    return [{real:real+root,imag:0},{real:real-root,imag:0}];
  }
  const imag=Math.sqrt(-disc)/2;
  return [{real,imag},{real,imag:-imag}];
}
