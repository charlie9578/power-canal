// Three selectable routes. Geometry is measured in metres, with travel from
// positive y toward negative y. The classic course is preserved by default.
// The physics receives the *local* width and depth in canalEnvironmentAt().
export const WIDTH=12.8;
export const START_Y=60;
export const LOCK={startY:-390,endY:-421,centreX:0,width:4.65};

const TEST_ZONES=Object.freeze([
  {top:80,bottom:-50,width:16.5,depth:2.25,bank:'natural',name:'OPEN MEADOW · DEEP & WIDE'},
  {top:-50,bottom:-160,width:8.6,depth:.98,bank:'natural',name:'SHALLOW NARROWS'},
  {top:-160,bottom:-244,width:18.5,depth:2.65,bank:'natural',name:'DEEP BASIN'},
  {top:-244,bottom:-332,width:7.4,depth:1.35,bank:'aqueduct',name:'STONE AQUEDUCT'},
  {top:-332,bottom:-443,width:10.5,depth:1.05,bank:'natural',name:'WINDING EARTH CUT'},
  {top:-443,bottom:-555,width:7.8,depth:1.55,bank:'brick',name:'BRICK CUTTING'},
  {top:-555,bottom:-610,width:14.8,depth:2.2,bank:'stone',name:'DEEP LOCK APPROACH'}
]);

// Smoothed, generously spaced S-bends remain challenging but navigable by
// the 14.6 m test boat at moderate speed; bridges are on open straight reaches.
// Flat knots keep the aqueduct trough straight.
const TEST_PATH=Object.freeze([
  {y:80,x:0},{y:60,x:0},{y:20,x:0},{y:-35,x:-6},
  {y:-85,x:7},{y:-137,x:-6},{y:-190,x:10},
  {y:-233,x:16},{y:-258,x:17,flat:true},{y:-325,x:17,flat:true},
  {y:-345,x:13},{y:-396,x:-7},{y:-445,x:10},
  {y:-495,x:-5},{y:-548,x:8},{y:-575,x:3},
  {y:-595,x:0},{y:-665,x:0}
]);

// Stage 03: an abrupt dogleg navigable through a broad winding hole.
// The narrow approach/exit make braking, tiller position and propwash matter.
// Geometry is deliberately identical to the bank and resistance calculation.
const TECH_PATH=Object.freeze([
  {y:80,x:0},{y:60,x:0},{y:-65,x:0},{y:-95,x:0},
  {y:-109,x:0},{y:-118,x:2},{y:-127,x:16},
  {y:-137,x:33},{y:-149,x:35},{y:-169,x:35},
  {y:-225,x:35},{y:-320,x:35},{y:-450,x:35}
]);
const TECH_ZONES=Object.freeze([
  {top:80,bottom:-70,width:14,depth:1.75,bank:'natural',name:'TOWPATH STRAIGHT'},
  {top:-70,bottom:-108,width:10,depth:1.25,bank:'stone',name:'BRAKE FOR TURN'},
  {top:-108,bottom:-194,width:27,depth:2.05,bank:'stone',name:'WINDING HOLE · SLOW'},
  {top:-194,bottom:-310,width:9.5,depth:1.5,bank:'brick',name:'NARROW EXIT'},
  {top:-310,bottom:-400,width:14,depth:1.85,bank:'natural',name:'LOCK APPROACH'}
]);
export const COURSES=Object.freeze([
  {id:'classic',number:'01',name:'Bridge to Lock',
   description:'Two gentle bends, bridges and a precision stop in the lock.',
   lock:{startY:-390,endY:-421,centreX:0,width:4.65},
   bridges:[{y:-130,opening:4.5},{y:-275,opening:4.5}],
   aqueduct:null},
  {id:'test',number:'02',name:'The Waterway Lab',
   description:'Navigable S-bends, alternating deep and shallow cuts, a stone aqueduct and a brick-lined channel. Compare speed and steering as the water changes.',
   lock:{startY:-610,endY:-645,centreX:0,width:4.65},
   bridges:[{y:-15,opening:6.8},{y:-214,opening:6.8}],
   aqueduct:{top:-244,bottom:-332},
   zones:TEST_ZONES},
  {id:'technical',number:'03',name:'The Winding Hole',
   description:'Brake for a near-right-angle dogleg, then use short bursts of ahead thrust and hard tiller to swing into the narrow exit.',
   lock:{startY:-390,endY:-421,centreX:35,width:4.65},
   bridges:[{y:-40,opening:6}],
   aqueduct:null,zones:TECH_ZONES,
   turningZone:{startY:-85,endY:-205,centreY:-130,centreX:17},
   // Stone loading quay projects from the outside/right bank into the hole.
   // This prevents taking the shortcut at cruising speed. The inner/west
   // approach has a full-hull-width route around it at slow speed.
   obstacles:[{id:'wharf',name:'STONE WHARF',left:36.6,right:54,
     top:-155,bottom:-183}]}
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
  return pathCentreAt(y,TEST_PATH);
}
function pathCentreAt(y,path){
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
  if(activeCourse.id==='technical')return pathCentreAt(y,TECH_PATH);
  // Original gentle route, tapering to a straight lock approach.
  const fade=clamp((-y-305)/65,0,1);
  return (1-fade)*(12*Math.sin((y-45)/93)+5*Math.sin((y-30)/39));
}

function testWaterway(y){return zonedWaterway(y,TEST_ZONES);}
function zonedWaterway(y,zones){
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
  if(activeCourse.id==='technical')return zonedWaterway(y,TECH_ZONES);
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
// Accept a stopped boat anywhere in the chamber, with no centre target.
// Full-sized hull corners are tested with 5 cm tolerance for the rounded bow.
export function checkObstacles(b,length,beam){
  let depth=0,normalX=0,name='';
  for(const obstacle of getActiveCourse().obstacles??[]){
    // The stone quay connects to the right bank. Only its west-facing
    // navigation edge is accessible; test the same distributed hull points
    // as bank collisions so the bow and stern cannot clip the quay.
    for(const p of hullSamples(b,length,beam)){
      if(p.x<=obstacle.left||p.x>=obstacle.right||
        p.y>=obstacle.top||p.y<=obstacle.bottom)continue;
      const overlap=p.x-obstacle.left;
      if(overlap>depth){depth=overlap;normalX=-1;name=obstacle.name;}
    }
  }
  return {depth,normalX,name};
}
export function insideLock(b,length,beam){
  const tolerance=.05;
  return [-.5,.5].every(fore=>
    [-.5,.5].every(side=>{
      const p=pointOnHull(b,side*beam,fore*length);
      return p.y<LOCK.startY+tolerance && p.y>LOCK.endY-tolerance &&
        Math.abs(p.x-LOCK.centreX)<LOCK.width/2+tolerance;
    })
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
