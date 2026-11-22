/**
 * Lightweight deterministic scenery for the top-down canal. Visual only:
 * the collision geometry and hydrodynamic channel sections are owned by
 * course.js. Draw-order: fields -> aqueduct -> water -> towpath -> bridges.
 */

const fract=x=>x-Math.floor(x);
const hash=(a,b=0)=>fract(Math.sin(a*72.983+b*192.18)*43758.5453);
function polygon(ctx,points,color){
  if(points.length<3)return;
  ctx.fillStyle=color;
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fill();
}

export function drawFields(ctx,{low,high,project,centreAt,halfWidthAt,courseId}){
  // Pasture plots and hedged field boundaries behind the water.
  for(let y=Math.floor(low/38)*38;y<high;y+=38){
    for(const side of [-1,1]){
      const nearY=y,farY=y+38;
      const bankX=yy=>centreAt(yy)+side*(halfWidthAt(yy)+5);
      const farX=yy=>centreAt(yy)+side*(halfWidthAt(yy)+65);
      const seed=hash(y,side);
      const palette=courseId==='test'
        ? ['#bed5a5','#b1cb95','#d0d7a3','#abc38d']
        : ['#c9d8ad','#bed5a2','#d3d6a7','#b5cf9e'];
      const region=[
        project(bankX(nearY),nearY),project(farX(nearY),nearY),
        project(farX(farY),farY),project(bankX(farY),farY)
      ];
      polygon(ctx,region,palette[Math.floor(seed*palette.length)]);
      const hedge=project(bankX(nearY)+side*14,nearY);
      const hedgeEnd=project(bankX(farY)+side*14,farY);
      ctx.beginPath();ctx.moveTo(hedge.x,hedge.y);ctx.lineTo(hedgeEnd.x,hedgeEnd.y);
      ctx.strokeStyle='#78976b';ctx.lineWidth=2.3;ctx.stroke();
      // Subtle furrow lines / mown grass.
      for(let k=1;k<=2;k++){
        const x1=bankX(nearY)+side*(20+k*12);
        const x2=bankX(farY)+side*(20+k*12);
        const a=project(x1,nearY+3),b=project(x2,farY-3);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        ctx.strokeStyle=seed>.5?'#e6e9bd66':'#7b9f714d';
        ctx.lineWidth=1;ctx.stroke();
      }
    }
  }
}

export function drawTowpath(ctx,{low,high,project,centreAt,waterwayAt,scale}){
  // One continuous historic towpath, kept just outside the west bank. On
  // masonry reaches it becomes stone paving; elsewhere compacted gravel.
  for(let y=Math.floor(low/3)*3;y<high;y+=3){
    const end=Math.min(y+3,high),a=waterwayAt(y),b=waterwayAt(end);
    const px=yy=>centreAt(yy)-waterwayAt(yy).width/2-2.0;
    const p=project(px(y),y),q=project(px(end),end);
    const paved=a.bank!=='natural';
    ctx.lineCap='butt';
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
    ctx.strokeStyle=paved?'#6b796e':'#78986e';ctx.lineWidth=3.8*scale;ctx.stroke();
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
    ctx.strokeStyle=paved?'#c6b6a0':'#dbc99a';ctx.lineWidth=2.5*scale;ctx.stroke();
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
    ctx.strokeStyle=paved?'#e5d6ba':'#eadab3';ctx.lineWidth=.45*scale;ctx.stroke();
    // Individual stone paving joints along the path, but no fake banks.
    if(paved&&Math.floor(y/2)!==Math.floor(end/2)){
      const cross=project(px(y),y);
      ctx.beginPath();ctx.moveTo(cross.x-1.3*scale,cross.y);
      ctx.lineTo(cross.x+1.3*scale,cross.y);
      ctx.lineWidth=1;ctx.strokeStyle='#80776577';ctx.stroke();
    }
  }
  // Towpath-side wooden posts, mooring bollards and hedgerow trees.
  for(let y=Math.floor(low/13)*13;y<high;y+=13){
    const section=waterwayAt(y);
    const centre=centreAt(y),half=section.width/2;
    const left=project(centre-half-4.3,y);
    const right=project(centre+half+5.2,y);
    if(section.bank==='aqueduct'){
      // Stone coping along the elevated path.
      ctx.fillStyle='#a29b8b';ctx.fillRect(left.x-2,left.y-4,4,8);
      continue;
    }
    if(section.bank==='natural'){
      ctx.fillStyle='#817b5d';ctx.fillRect(left.x-2,left.y-4,3,7);
      ctx.strokeStyle='#a5b990';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(left.x+3,left.y-4);ctx.stroke();
      const n=hash(y,3);
      if(n>.23){
        // Clusters grow away from the collision boundary.
        ctx.fillStyle='#58784e';ctx.beginPath();
        ctx.ellipse(right.x,right.y,6+n*5,7+n*6,.3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#88aa72';ctx.beginPath();
        ctx.ellipse(right.x-2,right.y-2,4+n*3,4+n*3,0,0,Math.PI*2);ctx.fill();
      }
    }else if(y%26===0){
      ctx.fillStyle='#777268';ctx.beginPath();ctx.arc(left.x,left.y,2.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d0bc98';ctx.beginPath();ctx.arc(left.x-1,left.y-1,1.1,0,Math.PI*2);ctx.fill();
    }
  }
}

export function drawStoneBridge(ctx,{bridge,project,centreAt,scale,width,height}){
  const location=project(centreAt(bridge.y),bridge.y);
  if(location.y< -85||location.y>height+85)return;
  const h=5.6*scale,opening=bridge.opening*scale;
  ctx.save();ctx.translate(location.x,location.y);
  const left=-opening/2,right=opening/2;
  ctx.fillStyle='#86796a';
  ctx.fillRect(-width,-h/2,width+left,h);
  ctx.fillRect(right,-h/2,width-right,h);
  // Pale stone courses and parapets make this a bridge rather than a road.
  ctx.fillStyle='#c8bba5';
  for(const x of [left-11*scale,right]){
    ctx.fillRect(x,-h/2,11*scale,h);
  }
  ctx.strokeStyle='#675f53';ctx.lineWidth=1;
  for(let yy=-h/2+8;yy<h/2;yy+=9){
    for(const span of [[-width,left],[right,width]]){
      ctx.beginPath();ctx.moveTo(span[0],yy);ctx.lineTo(span[1],yy);ctx.stroke();
      for(let x=span[0]+(Math.floor(yy/9)%2)*14;x<span[1];x+=28){
        ctx.beginPath();ctx.moveTo(x,yy-9);ctx.lineTo(x,yy);ctx.stroke();
      }
    }
  }
  // Open arch: blue water remains visible through the bridge's navigation
  // aperture. The pale arch rim shows the exact in-game opening.
  ctx.fillStyle='#74aeb5';ctx.fillRect(left,-h/2,opening,h);
  ctx.strokeStyle='#ead9b9';ctx.lineWidth=3;
  ctx.strokeRect(left,-h/2,opening,h);
  ctx.strokeStyle='#e9d9b6';ctx.lineWidth=4;
  for(const yy of [-h/2,h/2]){
    ctx.beginPath();ctx.moveTo(-width,yy);ctx.lineTo(width,yy);ctx.stroke();
  }
  // Intrados / arch stones either side of the waterway.
  for(const side of [-1,1]){
    const edge=side*opening/2;
    ctx.strokeStyle='#5d655d';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(edge,-h/2);ctx.lineTo(edge,h/2);ctx.stroke();
    ctx.fillStyle='#d9c7a6';
    ctx.fillRect(edge+(side>0?0:-4),-h/2,4,h);
  }
  ctx.restore();
}
