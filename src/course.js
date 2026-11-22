// Generated curving centreline, sampled at one-metre intervals.
// World coordinates are metres; travel is from positive y towards negative y.
export const WIDTH=12.8;
export const START_Y=60;
export const LOCK={startY:-390,endY:-421,centreX:0,width:4.65};
export function centreAt(y){
  // A flowing fictional canal featuring two bends and a longer lock approach.
  // Fade curves out near the lock to create a straight precision finish.
  const fade=Math.max(0,Math.min(1,(-y-305)/65));
  return (1-fade)*(12*Math.sin((y-45)/93)+5*Math.sin((y-30)/39)) + fade*0;
}
export function halfWidthAt(y){
  if(y<LOCK.startY+10 && y>LOCK.endY-6) return LOCK.width/2;
  return WIDTH/2 + 0.55*Math.sin(y/73);
}
export function pointOnHull(b,localSide,localFore){
  const s=Math.sin(b.heading),c=Math.cos(b.heading);
  return {x:b.x+localSide*c+localFore*s,y:b.y+localSide*s-localFore*c};
}
export function hullSamples(b,length,beam){
  const result=[];
  for(const f of [-0.5,-0.25,0,0.25,0.5]){
    for(const side of [-0.5,0,0.5]){
      result.push(pointOnHull(b,side*beam*0.94,f*length*0.94));
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
  const margin=0.15;
  return hullSamples(b,length,beam).every(p=>
    p.y<LOCK.startY-margin && p.y>LOCK.endY+margin &&
    Math.abs(p.x-LOCK.centreX)<LOCK.width/2-margin
  );
}

// Local channel conditions fed to the planar force model. The water depth
// and bank force coefficients are intentionally approximate: canal cross
// sections vary in reality and need a survey for quantitative calibration.
export function canalEnvironmentAt(boat,beam=2.08,length=14.6){
  const onLock=boat.y<LOCK.startY && boat.y>LOCK.endY;
  const centre=centreAt(boat.y);
  const half=onLock?LOCK.width/2:halfWidthAt(boat.y);
  const proximity=Math.min(1,Math.abs(boat.x-centre)/Math.max(half,1));
  const depth=onLock?1.8:1.5-0.33*Math.pow(proximity,4);
  const bankSection=fore=>{
    const p=pointOnHull(boat,0,fore*length*.35);
    const delta=p.x-centreAt(p.y);
    // Right world bank is starboard at heading 0, with the projection
    // corrected as the hull turns away from the channel centreline.
    return {
      clearance:halfWidthAt(p.y)-beam*.5-Math.abs(delta),
      side:(delta>=0?1:-1)*Math.cos(boat.heading)
    };
  };
  return {
    depth,
    width:2*half,
    bowBank:bankSection(1),
    sternBank:bankSection(-1)
  };
}
