const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {LibraryStore,validateLibrary}=require('../electron/store.cjs');
const {ProjectManager}=require('../electron/projects.cjs');
const {userEdit}=require('../electron/history.cjs');
const {matchesExperiment,paperExperimentLinks}=require('../src/experiment-references.mjs');
const seed=path.resolve('data/library.json');
async function setup(){await fs.mkdir('.test-data',{recursive:true});const dir=await fs.mkdtemp(path.resolve('.test-data/reference-'));const store=new LibraryStore(path.join(dir,'live'),seed);await store.init();const id=(await store.changeExperiment({action:'add',title:'behaviour'})).selectedId;return {store,id,dir};}
const link=(store,id,paperIds,extra={})=>store.changeExperiment({action:'link-papers',id,paperIds,...extra});
test('experimental references support multiple purposes and experiments, preserve legacy records and concurrent notes',async()=>{
  const {store,id}=await setup(),old=store.get();assert.equal(old.experiments.nodes[0].references,undefined);
  const other=(await store.changeExperiment({action:'add',title:'patch clamp'})).selectedId;
  await Promise.all([link(store,id,['p001','p002','p001'],{roles:['idea','analysis'],note:'Figure 3: compare task design'}),link(store,other,['p001'],{roles:['protocol'],note:'Different purpose'}),store.changeExperiment({action:'update',id,patch:{record:'Original evidence'}}),store.update('p001',{personalReview:'Personal reading note'})]);
  await link(store,id,['p001'],{roles:['background'],note:'Must not replace an existing note'});
  const reopened=new LibraryStore(store.directory,seed);await reopened.init();const data=reopened.get();
  const refs=data.experiments.nodes.find(n=>n.id===id).references;assert.equal(refs.length,2);assert.deepEqual(refs[0].roles,['idea','analysis']);assert.equal(refs[0].note,'Figure 3: compare task design');
  assert.equal(data.experiments.nodes[0].record,'Original evidence');assert.equal(data.papers[0].personalReview,'Personal reading note');assert.equal(data.papers[0].module,old.papers[0].module);assert.equal(data.experiments.nodes[1].references[0].note,'Different purpose');
});
test('invalid reference batches and stale edits fail atomically without changing the paper library',async()=>{
  const {store,id}=await setup();await link(store,id,['p001']);const before=store.get();
  for(const payload of [{paperIds:['p002','not_in_this_project']},{paperIds:['p002'],roles:[]},{paperIds:['p002'],roles:['invented']},{paperIds:['p002'],roles:['idea','idea']},{paperIds:['p002'],note:'x'.repeat(5001)}])await assert.rejects(link(store,id,payload.paperIds,payload));
  await assert.rejects(store.changeExperiment({action:'update-reference',id,paperId:'p001',patch:{paperId:'p002'}}));assert.deepEqual(store.get(),before);
  const invalid=structuredClone(before);invalid.experiments.nodes[0].references.push({...invalid.experiments.nodes[0].references[0],id:'duplicate'});assert.throws(()=>validateLibrary(invalid),/重复/);
  await store.changeExperiment({action:'unlink-paper',id,paperId:'p001'});
  await assert.rejects(store.changeExperiment({action:'update-reference',id,paperId:'p001',patch:{note:'late autosave'}}),/移除/);assert.equal(store.get().experiments.nodes[0].references.length,0);assert.deepEqual(store.get().papers,before.papers);
});
test('reference backup, archive and restore retain purpose notes and reject archived edits',async()=>{
  const {store,id,dir}=await setup();await link(store,id,['p001'],{roles:['control'],note:'Control group rationale'});await store.changeExperiment({action:'archive',id});
  await assert.rejects(link(store,id,['p002']),/恢复/);
  const backup=await store.backup(dir),restored=new LibraryStore(path.join(dir,'restore'),seed);await restored.init();await restored.restore(path.join(backup,'library.json'));
  assert.deepEqual(restored.get().experiments,store.get().experiments);
  await restored.changeExperiment({action:'restore',id});assert.equal(restored.get().experiments.nodes[0].references[0].note,'Control group rationale');
  const corrupt=JSON.parse(await fs.readFile(path.join(backup,'library.json'),'utf8'));corrupt.experiments.nodes[0].references[0].paperId='missing';assert.throws(()=>validateLibrary(corrupt),/当前项目/);
});
test('reference undo and redo retain independent experiment progress and other paper links',async()=>{
  const {store,id}=await setup();await userEdit(store,'references',()=>link(store,id,['p001','p002']));await link(store,id,['p003']);await store.changeExperiment({action:'update',id,patch:{progress:'Continue collecting'}});
  await store.historyAction('undo');assert.deepEqual(store.get().experiments.nodes[0].references.map(r=>r.paperId),['p003']);assert.equal(store.get().experiments.nodes[0].progress,'Continue collecting');
  await store.historyAction('redo');assert.equal(store.get().experiments.nodes[0].references.length,3);
  await userEdit(store,'reference-note',()=>store.changeExperiment({action:'update-reference',id,paperId:'p001',patch:{roles:['analysis'],note:'Metrics to compare'}}));
  await store.historyAction('undo');assert.deepEqual(store.get().experiments.nodes[0].references.find(r=>r.paperId==='p001').roles,['idea']);await store.historyAction('redo');
  await userEdit(store,'unlink',()=>store.changeExperiment({action:'unlink-paper',id,paperId:'p001'}));await store.historyAction('undo');assert.equal(store.get().experiments.nodes[0].references.find(r=>r.paperId==='p001').note,'Metrics to compare');
});
test('paper references cannot cross project boundaries',async()=>{
  const {dir}=await setup(),manager=new ProjectManager({userData:path.join(dir,'profile'),seedPath:seed});await manager.init();const first=manager.get().store,id=(await first.changeExperiment({action:'add',title:'First project'})).selectedId;await link(first,id,['p001']);
  const other=await manager.create({name:'Other project',question:'Independent work',keywords:['test']});await manager.activate(other.id);const second=manager.get().store,otherId=(await second.changeExperiment({action:'add',title:'Other experiment'})).selectedId;
  await assert.rejects(link(second,otherId,['p001']),/当前项目/);await assert.rejects(link(second,id,['p001']),/未找到/);assert.equal(first.get().experiments.nodes[0].references.length,1);
});
test('experiment filtering includes substeps, keeps purposes on their own links and ignores archived branches',()=>{
  const nodes=[{id:'a',title:'behaviour',parentId:null,references:[{paperId:'p1',roles:['idea']}]},{id:'b',title:'analysis',parentId:'a',references:[{paperId:'p2',roles:['analysis']}]},{id:'c',title:'patch',parentId:null,references:[{paperId:'p1',roles:['protocol']}]},{id:'d',title:'archive',parentId:null,archived:true,references:[{paperId:'p3',roles:['idea']}]}];
  assert.ok(matchesExperiment(nodes,'p2','a','analysis'));assert.equal(matchesExperiment(nodes,'p1','a','protocol'),false);assert.ok(matchesExperiment(nodes,'p1','','protocol'));assert.ok(matchesExperiment(nodes,'p3','unassigned'));assert.equal(paperExperimentLinks(nodes,'p1').length,2);
});
