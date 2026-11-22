/**
 * Longitudinal resistance and propulsion for a displacement narrowboat.
 *
 * Textbook foundations:
 *  - ITTC-1957 friction line: Cf = 0.075 / (log10(Re)-2)^2
 *  - Froude length: Fn = |u|/sqrt(g*L)
 *  - Schijf critical blockage / depth Froude relation:
 *        beta = 1 + 0.5*Fh^2 - 1.5*Fh^(2/3)
 *  - Open-water propeller: T = rho*n^2*D^4*KT(J), J=Va/(n*D)
 *
 * These foundations do NOT provide a complete narrowboat prediction:
 * wetted area, wave residual, KT curve, and below-critical canal resistance
 * are separately identified *approximations*, pending tow and propulsion
 * trials. Schijf estimates a limiting speed, not resistance in newtons.
 */
const GRAVITY=9.81;
const WATER_VISCOSITY=1.004e-6; // fresh water at ~20 C, m^2/s
const max=(a,b)=>Math.max(a,b);
const min=(a,b)=>Math.min(a,b);
const clamp=(v,a,b)=>max(a,min(v,b));

export function wettedArea(c) {
  // Box-like narrowboat, bottom + 2 sides + approximate bow/stern ends.
  const L=c.length,B=c.beam,T=c.draft;
  return (L*(B+2*T)+1.2*B*T)*(c.wettedAreaFactor??1);
}
export function frictionCoefficient(speed,length,nu=WATER_VISCOSITY) {
  if(Math.abs(speed)<0.02)return 0;
  const Re=max(1e5,Math.abs(speed)*length/nu);
  return 0.075 / (Math.log10(Re)-2)**2;
}
export function lengthFroude(speed,length) {
  return Math.abs(speed)/Math.sqrt(GRAVITY*length);
}
export function canalBlockage(c,water={}) {
  const depth=max(c.draft+.12,water.depth??1.55);
  const width=max(c.beam+.5,water.width??14);
  return clamp((c.beam*c.draft*(c.midshipSectionFactor??.96))/(width*depth),0,.9);
}
export function schijfCriticalFroude(blockage) {
  const beta=clamp(blockage,0,.99);
  if(beta===0)return 1;
  // On subcritical branch, Schijf's beta(F) decreases monotonically
  // from 1 at F=0 to 0 at F=1. Solve this scalar relation by bisection.
  let low=0,high=1;
  for(let i=0;i<38;i++) {
    const mid=(low+high)/2;
    const predicted=1+.5*mid*mid-1.5*Math.pow(mid,2/3);
    if(predicted>beta)low=mid;
    else high=mid;
  }
  return (low+high)/2;
}
export function schijfLimitSpeed(c,water={}) {
  const depth=max(c.draft+.12,water.depth??1.55);
  return Math.sqrt(GRAVITY*depth)*schijfCriticalFroude(canalBlockage(c,water));
}
export function resistanceComponents(u,c,water={}) {
  const V=Math.abs(u),rho=c.waterDensity??1000;
  const zero={
    total:0,friction:0,form:0,wave:0,restricted:0,creep:0,
    wettedArea:wettedArea(c),lengthFroude:0,depthFroude:0,
    blockage:canalBlockage(c,water),limitSpeed:schijfLimitSpeed(c,water)
  };
  if(V<1e-8)return zero;
  const area=zero.wettedArea,dynamicPressure=.5*rho*V*V;
  const friction=dynamicPressure*area*frictionCoefficient(V,c.length);
  const form=friction*(c.hullFormFactor??.30);
  const fn=lengthFroude(V,c.length);
  // Empirical low-Froude residual proxy: a rising displacement wave curve,
  // whose explicit L dependence lets longer hulls defer wave resistance.
  // This is NOT a validated narrowboat wave-making correlation.
  const waveCoefficient=(c.waveCoefficient??.015)*Math.pow(fn/(c.waveReferenceFroude??.22),4);
  const wave=dynamicPressure*area*waveCoefficient;
  const creep=(c.lowSpeedDrag??80)*V;
  const unrestricted=friction+form+wave+creep;
  const limit=zero.limitSpeed;
  const q=V/max(.1,limit);
  // Deliberately empirical Schijf *proximity* penalty, not Schijf drag.
  // Rapidly rising under restricted flow; regularised for numerical safety.
  const ratio=zero.blockage/max(.1,1-zero.blockage);
  const restricted=unrestricted*(c.confinedResistanceGain??8)*ratio*
      Math.pow(q,4)/max(.08,1-q*q);
  return {
    total:unrestricted+restricted,friction,form,wave,restricted,creep,
    wettedArea:area,lengthFroude:fn,
    depthFroude:V/Math.sqrt(GRAVITY*max(c.draft+.12,water.depth??1.55)),
    blockage:zero.blockage,limitSpeed:limit
  };
}
export function propellerForce(u,throttle,c) {
  const command=clamp(throttle,-1,1);
  if(Math.abs(command)<1e-6)return 0;
  const n=(c.propellerMaxRps??8.8)*Math.sqrt(Math.abs(command));
  const D=c.propellerDiameter??.52;
  const wake=c.propellerWakeFraction??.15;
  const shaftSign=Math.sign(command);
  // Signed advance ratio. Reversing against forward flow increases load.
  const J=(1-wake)*u/(shaftSign*n*D);
  // Linear approximation to a measured propeller K_T(J) curve,
  // deliberately capped outside its plausible operating envelope.
  const KT=clamp((c.propellerKT0??.29)-(c.propellerKTSlope??.60)*J,0,.52);
  const thrust=(c.waterDensity??1000)*n*n*Math.pow(D,4)*KT;
  const reverse=shaftSign<0?(c.reverseFraction??.55):1;
  return shaftSign*thrust*reverse*(1-(c.thrustDeduction??.05));
}
export function propellerRudderJet(thrust,c) {
  if(thrust<=0)return 0;
  const D=c.propellerDiameter??.52;
  const disc=Math.PI*D*D/4;
  return (c.propellerRudderJetFactor??.62)*
         Math.sqrt(thrust/((c.waterDensity??1000)*disc));
}

/**
 * Forward throttle giving steady straight-line thrust = resistance.
 * Returns null when the specified speed cannot be sustained at full ahead.
 * Applies no arbitrary mph cap; the propeller and drag curves intersect.
 */
export function trimThrottle(speed,c,water={}) {
  if(speed<=0)return 0;
  const demand=resistanceComponents(speed,c,water).total;
  if(propellerForce(speed,1,c)<demand)return null;
  let low=0,high=1;
  for(let i=0;i<45;i++){
    const t=(low+high)/2;
    if(propellerForce(speed,t,c)<demand)low=t;
    else high=t;
  }
  return (low+high)/2;
}
