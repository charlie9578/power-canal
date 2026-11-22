import test from 'node:test';
import assert from 'node:assert/strict';
import { BOAT, createBoat } from '../src/physics.js';
import { resistanceComponents } from '../src/hydrodynamics.js';
import {
  COURSES,LOCK,setActiveCourse,getActiveCourse,centreAt,waterwayAt,
  checkBanks,insideLock,canalEnvironmentAt
} from '../src/course.js';

function inLab(fn){
  const original=getActiveCourse().id;
  setActiveCourse('test');
  try{return fn();}finally{setActiveCourse(original);}
}

test('the original stage remains the default, with an independent second route',()=>{
  assert.deepEqual(COURSES.map(c=>c.id),['classic','test']);
  const old=getActiveCourse().id;
  try{
    setActiveCourse('classic');
    assert.equal(LOCK.startY,-390);
    assert.ok(Math.abs(waterwayAt(0).depth-1.5)<1e-12);
    setActiveCourse('test');
    assert.equal(LOCK.startY,-610);
    assert.equal(LOCK.endY,-645);
    assert.equal(getActiveCourse().bridges.length,2);
    assert.throws(()=>setActiveCourse('missing'),RangeError);
    assert.equal(getActiveCourse().id,'test');
  }finally{setActiveCourse(old);}
});

test('variable water sections include deep/wide, shallow/narrow and masonry',()=>inLab(()=>{
  const meadow=waterwayAt(30),shallow=waterwayAt(-95),
        deep=waterwayAt(-185),aqueduct=waterwayAt(-280),
        brick=waterwayAt(-480),stone=waterwayAt(-580);
  assert.ok(meadow.width>shallow.width);
  assert.ok(meadow.depth>shallow.depth);
  assert.ok(deep.width>17&&deep.depth>2.5);
  assert.ok(shallow.width<9&&shallow.width>BOAT.beam*3&&shallow.depth<1.1);
  assert.equal(aqueduct.bank,'aqueduct');
  assert.equal(brick.bank,'brick');
  assert.equal(stone.bank,'stone');
  assert.ok(aqueduct.width<8);
}));

test('the same narrowboat experiences more resistance in the shallow narrows',()=>inLab(()=>{
  const shallow=canalEnvironmentAt(createBoat(centreAt(-95),-95),BOAT.beam,BOAT.length);
  const deep=canalEnvironmentAt(createBoat(centreAt(-185),-185),BOAT.beam,BOAT.length);
  const resistShallow=resistanceComponents(1.3,BOAT,shallow);
  const resistDeep=resistanceComponents(1.3,BOAT,deep);
  assert.ok(resistShallow.total>resistDeep.total);
  assert.ok(resistShallow.restricted>resistDeep.restricted);
  assert.ok(resistShallow.limitSpeed<resistDeep.limitSpeed);
}));

test('the aqueduct is straight and hull-sized, with realistic 3-DOF water inputs',()=>inLab(()=>{
  for(const y of [-270,-285,-300,-315]){
    assert.ok(Math.abs(centreAt(y)-17)<.01);
    const b=createBoat(centreAt(y),y);
    const bank=checkBanks(b,BOAT.length,BOAT.beam);
    assert.equal(bank.depth,0,'the 48-foot narrowboat must fit the aqueduct');
    const water=canalEnvironmentAt(b,BOAT.beam,BOAT.length);
    assert.ok(water.depth>BOAT.draft+.3);
    assert.ok(water.width>=7);
  }
}));

test('curved centreline has geometric clearance for a 48-foot boat',()=>inLab(()=>{
  for(let y=51;y>=-588;y-=2){
    const slope=(centreAt(y+.1)-centreAt(y-.1))/.2;
    const boat=createBoat(centreAt(y),y,Math.atan(-slope));
    const contact=checkBanks(boat,BOAT.length,BOAT.beam);
    assert.ok(contact.depth<.08,'centreline grounding near y='+y+', depth '+contact.depth);
  }
}));

test('new lock accommodates complete hull, independently from classic lock',()=>inLab(()=>{
  const midway=(LOCK.startY+LOCK.endY)/2;
  const b=createBoat(LOCK.centreX,midway,0);
  assert.ok(insideLock(b,BOAT.length,BOAT.beam));
  b.y=LOCK.startY+2;
  assert.equal(insideLock(b,BOAT.length,BOAT.beam),false);
}));

test('depth and width blend smoothly at zone boundaries',()=>inLab(()=>{
  for(const boundary of [-50,-160,-244,-332,-443,-555]){
    const upper=waterwayAt(boundary+.01),lower=waterwayAt(boundary-.01);
    assert.ok(Math.abs(upper.width-lower.width)<.1);
    assert.ok(Math.abs(upper.depth-lower.depth)<.1);
  }
}));
