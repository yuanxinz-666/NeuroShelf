const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const { LibraryStore } = require('../electron/store.cjs');
const { userEdit } = require('../electron/history.cjs');
async function setup() { const dir = await fs.mkdtemp(path.resolve('.test-data/history-')); const store = new LibraryStore(dir,path.resolve('data/library.json')); await store.init(); return store; }
const edit = (store, group, action) => userEdit(store, group, action);
test('undo and redo only user fields, retaining concurrent AI answers and PDF reading position', async () => {
  const store = await setup(), before = store.find('p001').note;
  await edit(store,'note',()=>store.update('p001',{note:'A saved note'}));
  await store.update('p001',{page:3,messages:[{id:'background',role:'assistant',content:'New response'}]});
  assert.equal((await store.historyAction('undo')).changed,true);
  assert.equal(store.find('p001').note,before);assert.equal(store.find('p001').page,3);assert.equal(store.find('p001').messages[0].content,'New response');
  await store.historyAction('redo');assert.equal(store.find('p001').note,'A saved note');
  const reopened=new LibraryStore(store.directory);await reopened.init();assert.equal(reopened.find('p001').note,'A saved note');assert.equal((await reopened.historyAction('undo')).changed,false);
});
test('highlight add, comment and deletion can be undone and redone without affecting other annotations', async () => {
  const store=await setup(),value={source:'legacy',text:'Selected original text',color:'yellow',comment:'',page:1};
  await edit(store,'h1',()=>store.mutateHighlight('p001',{action:'add',highlightId:'h1',value}));
  await edit(store,'h1-comment',()=>store.mutateHighlight('p001',{action:'update',highlightId:'h1',value:{comment:'Personal comment'}}));
  await edit(store,'h1-remove',()=>store.mutateHighlight('p001',{action:'remove',highlightId:'h1'}));
  await store.historyAction('undo');assert.equal(store.find('p001').highlights.find(h=>h.id==='h1').comment,'Personal comment');
  await store.historyAction('undo');assert.equal(store.find('p001').highlights.find(h=>h.id==='h1').comment,'');
  await store.historyAction('undo');assert.ok(!store.find('p001').highlights.some(h=>h.id==='h1'));
  await store.historyAction('redo');await store.historyAction('redo');assert.equal(store.find('p001').highlights.find(h=>h.id==='h1').comment,'Personal comment');
});
test('experiment undo respects hierarchy, separate fields and project isolation', async () => {
  const store=await setup(),other=await setup();
  const parent=await edit(store,'add',()=>store.changeExperiment({action:'add',title:'Parent'}));
  const child=await edit(store,'add-child',()=>store.changeExperiment({action:'add',title:'Child',parentId:parent.selectedId}));
  await edit(store,'progress',()=>store.changeExperiment({action:'update',id:child.selectedId,patch:{progress:'3 / 5 complete'}}));
  await store.changeExperiment({action:'update',id:child.selectedId,patch:{record:'Separate detailed evidence'}});
  await store.historyAction('undo');assert.equal(store.get().experiments.nodes[1].progress,'');assert.equal(store.get().experiments.nodes[1].record,'Separate detailed evidence');
  await assert.rejects(store.historyAction('undo'),/已改变/);
  assert.equal((await other.historyAction('undo')).changed,false);
});
test('failed undo leaves data and history intact, and a new edit clears redo', async () => {
  const store=await setup();await edit(store,'favorite',()=>store.update('p001',{starred:true}));
  const original=store.commit;store.commit=async()=>{throw Error('disk failure');};
  await assert.rejects(store.historyAction('undo'),/disk failure/);assert.equal(store.find('p001').starred,true);
  store.commit=original;await store.historyAction('undo');
  await edit(store,'note',()=>store.update('p001',{note:'New edit'}));assert.equal((await store.historyAction('redo')).changed,false);
  await store.update('p001',{note:'An external update'});await assert.rejects(store.historyAction('undo'),/已改变/);assert.equal(store.find('p001').note,'An external update');
});

test('adjacent text edits coalesce only across continuous user input, preserving intervening updates', async () => {
  const store=await setup();
  await edit(store,'note',()=>store.update('p001',{note:'First word'}));
  await edit(store,'note',()=>store.update('p001',{note:'First word and more'}));
  await store.historyAction('undo');assert.equal(store.find('p001').note,'');
  await store.historyAction('redo');
  await store.update('p001',{note:'Independent change'});
  await edit(store,'note',()=>store.update('p001',{note:'Latest user edit'}));
  await store.historyAction('undo');assert.equal(store.find('p001').note,'Independent change');
  await assert.rejects(store.historyAction('undo'),/已改变/);
});

test('undo restores an archived hierarchy and changed paper metadata', async () => {
  const store=await setup(),original=store.find('p001');
  await edit(store,'metadata',()=>store.update('p001',{title:'Updated title',authors:'Updated author',journal:'Updated journal'}));
  await store.historyAction('undo');
  for(const field of ['title','authors','journal']) assert.equal(store.find('p001')[field],original[field]);
  const parent=await store.changeExperiment({action:'add',title:'Parent'});
  await store.changeExperiment({action:'add',title:'Child',parentId:parent.selectedId});
  await edit(store,'archive',()=>store.changeExperiment({action:'archive',id:parent.selectedId}));
  assert.ok(store.get().experiments.nodes.every(n=>n.archived));
  await store.historyAction('undo');assert.ok(store.get().experiments.nodes.every(n=>!n.archived));
  await store.historyAction('redo');assert.ok(store.get().experiments.nodes.every(n=>n.archived));
});
