/**
 * Local-only replay ghosts. A ghost is a sequence of world-space hull poses,
 * never an AI boat and never a second physics simulation. One recording is
 * retained for each stage when it is the fastest *recorded* completed run.
 * Old leaderboard times predate the replay feature and have no ghost.
 */
export const GHOST_FORMAT=1;
export const GHOST_INTERVAL=.25;
export const GHOST_MAX_FRAMES=6000;
export const ghostKey=courseId=>courseId==='technical'
  ?'power-canal-ghost-v2-technical'
  :'power-canal-ghost-v1-'+courseId;
const finite=Number.isFinite;
const round=x=>Math.round(x*1000)/1000;

export function appendGhostFrame(frames,time,boat,force=false){
  if(!Array.isArray(frames)||frames.length>=GHOST_MAX_FRAMES)return false;
  if(![time,boat.x,boat.y,boat.heading].every(finite)||time<0)return false;
  if(frames.length){
    const last=frames[frames.length-1];
    if(time<=last[0]+1e-8)return false;
    if(!force && time-last[0]<GHOST_INTERVAL-1e-8)return false;
  }
  frames.push([round(time),round(boat.x),round(boat.y),round(boat.heading)]);
  return true;
}

export function makeGhost(courseId,score,elapsed,frames){
  if(!['classic','test','technical'].includes(courseId)||!finite(score)||score<0||
      !finite(elapsed)||elapsed<0||!Array.isArray(frames))return null;
  const ghost={v:GHOST_FORMAT,courseId,score:round(score),
    elapsed:round(elapsed),frames:frames.map(f=>[...f])};
  return validGhost(ghost,courseId)?ghost:null;
}
export function validGhost(g,courseId){
  if(!g||g.v!==GHOST_FORMAT||g.courseId!==courseId||
    !finite(g.score)||g.score<0||!finite(g.elapsed)||g.elapsed<0||
    g.score+0.01<g.elapsed||!Array.isArray(g.frames)||
    g.frames.length<2||g.frames.length>GHOST_MAX_FRAMES)return false;
  let last=-1;
  for(const pose of g.frames){
    if(!Array.isArray(pose)||pose.length!==4||!pose.every(finite)||
       pose[0]<0||pose[0]<=last||Math.abs(pose[1])>1e5||
       Math.abs(pose[2])>1e5||Math.abs(pose[3])>1e5)return false;
    last=pose[0];
  }
  return Math.abs(last-g.elapsed)<1.0;
}
export function readGhost(storage,courseId){
  try{
    const serialized=storage.getItem(ghostKey(courseId));
    if(!serialized)return null;
    const parsed=JSON.parse(serialized);
    return validGhost(parsed,courseId)?parsed:null;
  }catch{return null;}
}
export function saveGhost(storage,ghost){
  if(!validGhost(ghost,ghost?.courseId))return false;
  try{
    storage.setItem(ghostKey(ghost.courseId),JSON.stringify(ghost));
    return true;
  }catch{return false;} // private browsing / localStorage quota
}
export function shouldReplaceGhost(previous,completedScore){
  return finite(completedScore)&&completedScore>=0&&
    (!previous||completedScore<previous.score-1e-4);
}
export function sampleGhost(ghost,atTime){
  if(!ghost?.frames?.length||!finite(atTime)||atTime<0)return null;
  const a=ghost.frames;
  if(atTime>a[a.length-1][0]+1e-6)return null;
  if(atTime<=a[0][0])return {x:a[0][1],y:a[0][2],heading:a[0][3]};
  let lo=0,hi=a.length-1;
  while(lo+1<hi){
    const mid=(lo+hi)>>1;
    if(a[mid][0]<=atTime)lo=mid;else hi=mid;
  }
  const p=a[lo],q=a[hi],f=(atTime-p[0])/(q[0]-p[0]);
  // Shortest-path wrap so a heading crossing +/-pi never spins the ghost.
  const delta=Math.atan2(Math.sin(q[3]-p[3]),Math.cos(q[3]-p[3]));
  return {x:p[1]+f*(q[1]-p[1]),y:p[2]+f*(q[2]-p[2]),
    heading:p[3]+f*delta};
}
