// Two selectable routes. Geometry is measured in metres, with travel from
// positive y toward negative y. The classic course is preserved by default.
// The physics receives the *local* width and depth in canalEnvironmentAt().
export const WIDTH=12.8;
export const START_Y=60;
export const LOCK={startY:-390,endY:-421,centreX:0,width:4.65};

const TEST_ZONES=Object.freeze([
  {top:80,bottom:-50,width:16.5,depth:2.25,bank:'natural',name:'OPEN MEADOW · DEEP & WIDE'},
  {top:-50,bottom:-160,width:7.1,depth:.98,bank:'natural',name:'SHALLOW NARROWS'},
  {top:-160,bottom:-244,width:18.5,depth:2.65,bank:'natural',name:'DEEP BASIN'},
  {top:-244,bottom:-332,width:7.4,depth:1.35,bank:'aqueduct',name:'STONE AQUEDUCT'},
  {top:-332,bottom:-443,width:10.5,depth:1.05,bank:'natural',name:'WINDING EARTH CUT'},
  {top:-443,bottom:-555,width:7.8,depth:1.55,bank:'brick',name:'BRICK CUTTING'},
  {top:-555,bottom:-610,width:14.8,depth:2.2,bank:'stone',name:'DEEP LOCK APPROACH'}
]);

// Smooth centreline knots make several linked S bends. An extended flat
// pair of knots keeps the aqueduct trough effectively straight.
const TEST_PATH=Object.freeze([
  {y:80,x:0},{y:60,x:0},{y:20,x:0},{y:-35,x:-9},
  {y:-85,x:13},{y:-137,x:-11},{y:-190,x:12},
  {y:-233,x:16},{y:-258,x:17,flat:true},{y:-325,x:17,flat:true},
  {y:-345,x:13},{y:-396,x:-10},{y:-445,x:15},
  {y:-495,x:-9},{y:-548,x:11},{y:-575,x:3},
  {y:-595,x:0},{y:-665,x:0}
]);

export const COURSES=Object.freeze([
  {id:'classic',number:'01',name:'Bridge to Lock',
   description:'Two gentle bends, bridges and a precision stop in the lock.',
   lock:{startY:-390,endY:-421,centreX:0,width:4.65},
   bridges:[{y:-130,opening:4.5},{y:-275,opening:4.5}],
   aqueduct:null},
  {id:'test',number:'02',name:'The Waterway Lab',
   description:'Tighter S-bends, alternating deep and shallow cuts, a stone aqueduct and a brick-lined channel. Compare speed and steering as the water changes.',
   lock:{startY:-610,endY:-645,centreX:0,width:4.65},
   bridges:[{y:-107,opening:4.8},{y:-490,opening:4.8}],
   aqueduct:{top:-244,bottom:-332},
   zones:TEST_ZONES}
]);

let activeCourse=COURSES[0];
export function getActiveCourse(){return activeCourse;}
export function setActiveCourse(id){
  const selected=COURSES.find(c=>c.id===id);
  if(!selected)throw new RangeError('Unknown course: '+id);
  activeCourse=selected;
  Object.assign(LOCK,selected.lock);
  return activeCourse;
}
const clamp=(x,a,b)=>Math.max(a,Math.min(x,b));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

function testCentreAt(y){
  const path=TEST_PATH;
  if(y>=path[0].y)return path[0].x;
  if(y<=path[path.length-1].y)return path[path.length-1].x;
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1];
    if(y>a.y||y<b.y)continue;
    const prev=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+2)];
    const slopeA=a.flat?0:(b.x-prev.x)/(b.y-prev.y);
    const slopeB=b.flat?0:(next.x-a.x)/(next.y-a.y);
    const dy=b.y-a.y,t=(y-a.y)/dy,t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*a.x+(t3-2*t2+t)*dy*slopeA+
           (-2*t3+3*t2)*b.x+(t3-t2)*dy*slopeB;
  }
  return 0;
}
export function centreAt(y){
  if(activeCourse.id==='test')return testCentreAt(y);
  // Original gentle route, tapering to a straight lock approach.
  const fade=clamp((-y-305)/65,0,1);
  return (1-fade)*(12*Math.sin((y-45)/93)+5*Math.sin((y-30)/39));
}

function testWaterway(y){
  const zones=TEST_ZONES;
  let index=zones.findIndex(z=>y<=z.top && y>z.bottom);
  if(index<0)index=y>zones[0].top?0:zones.length-1;
  const zone=zones[index];
  let width=zone.width,depth=zone.depth;
  // Blend each boundary over 24 m to avoid unrealistic instantaneous
  // steps in water-section area and a discontinuity in engine resistance.
  for(let i=0;i<zones.length-1;i++){
    const boundary=zones[i].bottom;
    if(Math.abs(y-boundary)>12)continue;
    const upper=zones[i],lower=zones[i+1];
    const t=smooth((boundary+12-y)/24);
    width=upper.width+(lower.width-upper.width)*t;
    depth=upper.depth+(lower.depth-upper.depth)*t;
    break;
  }
  return {width,depth,bank:zone.bank,name:zone.name};
}
export function waterwayAt(y){
  if(y<LOCK.startY+8 && y>LOCK.endY-6)
    return {width:LOCK.width,depth:1.8,bank:'stone',name:'LOCK CHAMBER'};
  if(activeCourse.id==='test')return testWaterway(y);
  return {
    width:WIDTH+1.1*Math.sin(y/73),depth:1.5,
    bank:'natural',name:'CLASSIC CANAL'
  };
}
export function halfWidthAt(y){return waterwayAt(y).width/2;}
export function pointOnHull(b,localSide,localFore){
  const s=Math.sin(b.heading),c=Math.cos(b.heading);
  return {x:b.x+localSide*c+localFore*s,y:b.y+localSide*s-localFore*c};
}
export function hullSamples(b,length,beam){
  const result=[];
  for(const f of [-0.5,-0.25,0,0.25,0.5]){
    for(const side of [-0.5,0,0.5]){
      result.push(pointOnHull(b,side*beam*.94,f*length*.94));
    }
  }
  return result;
}
export function checkBanks(b,length,beam){
  let depth=0,normalX=0;
  for(const p of hullSamples(b,length,beam)){
    const half=halfWidthAt(p.y);
    const excess=Math.abs(p.x-centreAt(p.y))-half;
    if(excess>depth){depth=excess;normalX=Math.sign(centreAt(p.y)-p.x);}
  }
  return {depth,normalX};
}
export function insideLock(b,length,beam){
  const margin=.15;
  return hullSamples(b,length,beam).every(p=>
    p.y<LOCK.startY-margin && p.y>LOCK.endY+margin &&
    Math.abs(p.x-LOCK.centreX)<LOCK.width/2-margin
  );
}
// Water conditions are fed directly to ITTC/Froude/Schijf resistance,
// propeller loading, and the sway/yaw bank-effect model.
export function canalEnvironmentAt(boat,beam=2.08,length=14.6){
  const section=waterwayAt(boat.y);
  const nearCentre=centreAt(boat.y);
  const half=section.width/2;
  const proximity=clamp(Math.abs(boat.x-nearCentre)/Math.max(half,1),0,1);
  // Account for near-bank shoaling within each nominal cross section.
  // The minimum retains a positive under-keel margin for the test boat.
  const edgeShallow=activeCourse.id==='test'?.14:.33;
  const depth=Math.max(.79,section.depth-edgeShallow*Math.pow(proximity,4));
  const bankSection=fore=>{
    const p=pointOnHull(boat,0,fore*length*.35);
    const delta=p.x-centreAt(p.y);
    return {
      clearance:halfWidthAt(p.y)-beam*.5-Math.abs(delta),
      side:(delta>=0?1:-1)*Math.cos(boat.heading)
    };
  };
  return {depth,width:section.width,
    bowBank:bankSection(1),sternBank:bankSection(-1)};
}
