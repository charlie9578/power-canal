/**
 * Stage 03 spatial canal geometry. Unlike the first two y-parameterised
 * stages, this path turns exactly 90° to starboard after a bridge. A polyline
 * of two quarter circles and straights defines BOTH the water drawing and
 * the physical bank; the bank cannot be driven through as a shortcut.
 *
 * Coordinates: heading 0 moves toward decreasing y; east is +x.
 */
export const RIGHT_TURN=Object.freeze({
  bridgeY:-93,
  cornerY:-115,                   // 22 m after the bridge (1.51 x 14.6 m)
  radius:9,
  eastLength:44,
  returnRadius:19
});

const points=[];
function add(x,y){
  const last=points[points.length-1];
  points.push(Object.freeze({
    x,y,s:last?last.s+Math.hypot(x-last.x,y-last.y):0
  }));
}

// South-to-north approach (screen bottom to top).
for(let y=80;y>-115;y-=10)add(0,y);
add(0,-115);
// Right-hand quarter-circle: heading 0 -> +90 degrees.
for(let i=1;i<=32;i++){
  const angle=Math.PI+Math.PI*i/64;
  add(9+9*Math.cos(angle),-115+9*Math.sin(angle));
}
const firstEnd=points[points.length-1].s;
for(let x=11;x<53;x+=2)add(x,-124);
add(53,-124);
const secondStart=points[points.length-1].s;
// Much gentler LEFT curve (heading +90 -> 0) to rejoin a north-going cut.
for(let i=1;i<=32;i++){
  const angle=Math.PI/2-Math.PI*i/64;
  add(53+19*Math.cos(angle),-143+19*Math.sin(angle));
}
for(let y=-153;y>-465;y-=10)add(72,y);
export const TECHNICAL_PATH=Object.freeze(points);
export const TECHNICAL_TURN_START=195; // metres along path from (0,80)
export const TECHNICAL_TURN_END=firstEnd;
export const TECHNICAL_SECOND_TURN_START=secondStart;
const lastS=points[points.length-1].s;
const lerp=(a,b,t)=>a+(b-a)*Math.max(0,Math.min(1,t));
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const blend=(a,b,t)=>lerp(a,b,smooth(t));

export function technicalSectionAt(s){
  let width=12,depth=1.7,name='STONE BRIDGE STRAIGHT',bank='stone';
  if(s>175){
    width=blend(12,10.5,(s-175)/16);
    name='BRAKE · RIGHT TURN 22 M';
  }
  if(s>214){
    width=blend(10.5,10.5,(s-214)/17);
    name='RIGHT ANGLE CUT';
  }
  if(s>245){
    width=blend(10.5,19,(s-245)/23);
    name='WIDE RETURN BEND';
  }
  if(s>303){
    width=blend(19,12,(s-303)/28);
    name='NORTH CUT';
    bank='brick';
  }
  if(s>lastS-115){
    width=blend(12,14,(s-(lastS-115))/34);
    depth=1.85;
    name='LOCK APPROACH';
    bank='natural';
  }
  return {width,depth,bank,name};
}

export function technicalNearest(x,y){
  // Projection onto the 2D navigable centreline, not onto an imaginary
  // centreAt(y). Horizontal lengths therefore work like genuine waterways.
  let best=null,min=Infinity;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],vx=b.x-a.x,vy=b.y-a.y,L=vx*vx+vy*vy;
    const t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/L));
    const px=a.x+t*vx,py=a.y+t*vy;
    const d2=(x-px)**2+(y-py)**2;
    if(d2<min){
      min=d2;
      best={x:px,y:py,s:a.s+(b.s-a.s)*t,distance:Math.sqrt(d2),
        tangentX:vx/Math.sqrt(L),tangentY:vy/Math.sqrt(L)};
    }
  }
  return {...best,...technicalSectionAt(best.s)};
}

export function technicalBankContact(boat,length,beam){
  let depth=0,normalX=0,normalY=0;
  // Same distributed hull samples as classic bank collision. We do not
  // credit centreline-only clearance when the bow or stern is aground.
  const sn=Math.sin(boat.heading),cs=Math.cos(boat.heading);
  for(const f of [-.5,-.25,0,.25,.5]){
    for(const side of [-.5,0,.5]){
      const fore=f*length*.94,lateral=side*beam*.94;
      const x=boat.x+lateral*cs+fore*sn;
      const y=boat.y+lateral*sn-fore*cs;
      const p=technicalNearest(x,y);
      const excess=p.distance-p.width/2;
      if(excess>depth){
        depth=excess;
        normalX=(p.x-x)/Math.max(.001,p.distance);
        normalY=(p.y-y)/Math.max(.001,p.distance);
      }
    }
  }
  return {depth,normalX,normalY};
}

/**
 * This course's old y-only centreline is used for distant lock/bridge
 * signposts, never for bank physics. The 90-degree east reach has multiple
 * x values at the same y, so physical checking uses technicalNearest().
 */
export function technicalFallbackCentreAt(y){
  if(y>=-115)return 0;
  if(y>-124){
    const dy=y+115;
    return 9-Math.sqrt(Math.max(0,81-dy*dy));
  }
  if(y>-143){
    const dy=(y+143)/19;
    return 53+19*Math.sqrt(Math.max(0,1-dy*dy));
  }
  return 72;
}
