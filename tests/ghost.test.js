import test from 'node:test';
import assert from 'node:assert/strict';
import {appendGhostFrame,makeGhost,validGhost,readGhost,saveGhost,
        shouldReplaceGhost,sampleGhost,GHOST_MAX_FRAMES} from '../src/ghost.js';

const boat=(x,y,heading=0)=>({x,y,heading});
function memory(){
  const data=new Map();
  return {data,getItem(key){return data.get(key)??null;},
    setItem(key,val){data.set(key,val);}};
}

test('records time-indexed world poses at a bounded interval',()=>{
  const frames=[];
  assert.equal(appendGhostFrame(frames,0,boat(0,60),true),true);
  assert.equal(appendGhostFrame(frames,.1,boat(1,59)),false);
  assert.equal(appendGhostFrame(frames,.25,boat(2,58)),true);
  assert.equal(appendGhostFrame(frames,.25,boat(3,57),true),false);
  assert.equal(appendGhostFrame(frames,.50,boat(4,56)),true);
  assert.deepEqual(frames,[[0,0,60,0],[.25,2,58,0],[.5,4,56,0]]);
  assert.equal(GHOST_MAX_FRAMES>=3000,true);
});

test('ghosts are validated per stage and persistent storage ignores bad input',()=>{
  const frames=[[0,0,60,0],[.5,1,59,.1],[1,3,56,.2]];
  const completed=makeGhost('classic',6.2,1,frames);
  assert.ok(completed&&validGhost(completed,'classic'));
  assert.equal(validGhost(completed,'test'),false);
  const store=memory();
  assert.equal(saveGhost(store,completed),true);
  assert.deepEqual(readGhost(store,'classic'),completed);
  assert.equal(readGhost(store,'test'),null);
  const wrong=JSON.parse(JSON.stringify(completed));
  wrong.frames[2][0]=.3;
  assert.equal(validGhost(wrong,'classic'),false);
  assert.equal(makeGhost('random',2,1,frames),null);
  store.data.set('power-canal-ghost-v1-test','{bad json');
  assert.equal(readGhost(store,'test'),null);
});

test('interpolates pose smoothly with shortest-angle unwrap and stops at finish',()=>{
  const g=makeGhost('test',2,2,[[0,0,0,3.1],[2,10,20,-3.1]]);
  assert.ok(g);
  const half=sampleGhost(g,1);
  assert.equal(half.x,5);assert.equal(half.y,10);
  assert.ok(Math.abs(half.heading-Math.PI)<.08);
  assert.equal(sampleGhost(g,3),null);
  assert.equal(sampleGhost(g,-.1),null);
});

test('completed runs compete by total score, not elapsed time alone',()=>{
  const before=makeGhost('classic',65,60,[[0,0,60,0],[60,0,-400,0]]);
  assert.ok(before);
  assert.equal(shouldReplaceGhost(before,65),false);
  assert.equal(shouldReplaceGhost(before,64.9),true);
  assert.equal(shouldReplaceGhost(before,68),false);
  assert.equal(shouldReplaceGhost(null,90),true,
    'first new completed run can establish the first replay, even with legacy PB');
});

test('storage quota and private-mode failures do not erase recorded times',()=>{
  const g=makeGhost('classic',2,2,[[0,0,60,0],[2,0,50,0]]);
  const throwing={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  assert.equal(saveGhost(throwing,g),false);
  assert.equal(readGhost(throwing,'classic'),null);
});
