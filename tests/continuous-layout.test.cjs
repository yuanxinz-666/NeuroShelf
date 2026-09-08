const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pageLayout,pageAtOffset,visiblePages}=require('../src/continuous-layout.mjs');
test('continuous PDF offsets support mixed page orientations, exact boundaries and zoom',()=>{
  const sizes=[{width:600,height:800},{width:800,height:400},{width:500,height:750}];
  const rows=pageLayout(sizes,1200);
  assert.deepEqual(rows.map(r=>[r.top,r.height]),[[0,1600],[1636,600],[2272,1800]]);
  assert.equal(pageAtOffset(rows,-10),1);assert.equal(pageAtOffset(rows,1635),1);assert.equal(pageAtOffset(rows,1636),2);assert.equal(pageAtOffset(rows,99999),3);
  assert.equal(pageLayout(sizes,600)[1].top,836);assert.equal(pageLayout(sizes,600)[1].height,300);
});
test('a long continuous PDF renders only the viewport and nearby pages, including distant jumps',()=>{
  const rows=pageLayout(Array.from({length:1000},()=>({width:612,height:792})),1200);
  const near=visiblePages(rows,rows[499].top,1000);
  assert.ok(near.includes(500));assert.ok(near.length<=4);assert.ok(!near.includes(1));
  assert.deepEqual(visiblePages([],0,1000),[]);assert.deepEqual(visiblePages(rows,0,100,0),[1]);
  const end=visiblePages(rows,rows[999].top,1000);assert.ok(end.includes(1000));assert.ok(!end.includes(1001));
});
