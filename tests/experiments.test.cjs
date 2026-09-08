const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LibraryStore, validateLibrary } = require('../electron/store.cjs');
const { validateExperiments, mergeExperiments, verifyImage } = require('../electron/experiments.cjs');
const { ProjectManager } = require('../electron/projects.cjs');
const root = path.resolve(__dirname, '../.test-data'), seed = path.resolve(__dirname, '../data/library.json');
const fixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64');
async function setup(t) {
  await fs.mkdir(root, { recursive: true }); const dir = await fs.mkdtemp(path.join(root, 'experiments-'));
  const store = new LibraryStore(path.join(dir, 'live'), seed); await store.init();
  return { store, dir };
}
const add = async (store, title, parentId = null) => (await store.changeExperiment({ action: 'add', title, parentId })).selectedId;

test('legacy experiment records accept progress summaries without changing detailed research or evidence', async t => {
  const { store, dir } = await setup(t), id = await add(store, '原有实验');
  await store.changeExperiment({ action: 'update', id, patch: { record: '原始过程与结果', nextStep: '补充对照条件' } });
  await store.importEvidence({ nodeId: id, name: 'evidence.png', bytes: fixture });
  const legacy = store.get(); delete legacy.experiments.nodes[0].progress;
  await store.commit(legacy);
  const reopened = new LibraryStore(store.directory, seed); await reopened.init();
  const summary = '已完成 3 / 5 个样本\n等待下一次记录';
  await reopened.changeExperiment({ action: 'update', id, patch: { progress: summary } });
  const backup = await reopened.backup(dir), restored = new LibraryStore(path.join(dir, 'progress-restore'), seed);
  await restored.init(); await restored.restore(path.join(backup, 'library.json'));
  const node = restored.get().experiments.nodes[0];
  assert.equal(node.progress, summary); assert.equal(node.record, '原始过程与结果'); assert.equal(node.nextStep, '补充对照条件');
  assert.deepEqual(await restored.readEvidence(id, node.evidence[0].id), fixture);
});

test('invalid progress summaries leave saved experiment data intact and clearing a summary persists', async t => {
  const { store } = await setup(t), id = await add(store, '进展校验');
  await store.changeExperiment({ action: 'update', id, patch: { progress: '已有进展' } });
  const before = store.get();
  for (const progress of [null, 42, {}, 'x'.repeat(2001)]) await assert.rejects(store.changeExperiment({ action: 'update', id, patch: { progress } }));
  assert.deepEqual(store.get(), before);
  await store.changeExperiment({ action: 'update', id, patch: { progress: '' } });
  const reopened = new LibraryStore(store.directory, seed); await reopened.init();
  assert.equal(reopened.get().experiments.nodes[0].progress, '');
});
test('experiment drafts, hierarchy, states and notes survive concurrent writes and reopening', async t => {
  const { store } = await setup(t); const parent = await add(store, '实验路线'), child = await add(store, '记录步骤', parent);
  await Promise.all([store.changeExperiment({ action: 'update', id: child, patch: { record: '观察不等于结论\n记录原始条件', status: 'active', date: '2026-09-07' } }), store.update('p001', { personalReview: '原有论文笔记' }), store.changeExperiment({ action: 'update', id: parent, patch: { nextStep: '补充对照' } })]);
  const reopen = new LibraryStore(store.directory, seed); await reopen.init();
  assert.equal(reopen.get().experiments.nodes[1].record, '观察不等于结论\n记录原始条件'); assert.equal(reopen.get().experiments.nodes[1].parentId, parent);
  assert.equal(reopen.get().experiments.nodes[0].nextStep, '补充对照'); assert.equal(reopen.find('p001').personalReview, '原有论文笔记');
});
test('cyclic moves, missing parents, invalid fields and oversized steps fail without changing data', async t => {
  const { store } = await setup(t), a = await add(store, 'A'), b = await add(store, 'B', a); const before = store.get();
  for (const patch of [{ parentId: b }, { parentId: a }, { parentId: 'missing' }, { status: 'made-up' }, { title: '' }, { date: '2026-02-31' }, { record: 'x'.repeat(100001) }, { evidence: [] }]) await assert.rejects(store.changeExperiment({ action: 'update', id: a, patch }));
  assert.deepEqual(store.get(), before);
  let id = b; for (let i = 0; i < 10; i++) id = await add(store, '层 ' + i, id);
  await assert.rejects(add(store, '太深', id), /12 层/);
});
test('nested archives restore separately and original evidence bytes are retained after detach', async t => {
  const { store } = await setup(t), a = await add(store, 'A'), b = await add(store, 'B', a), c = await add(store, 'C', a);
  await store.importEvidence({ nodeId: c, name: '../实验.png', bytes: fixture });
  const image = store.get().experiments.nodes.find(n => n.id === c).evidence[0];
  await store.changeExperiment({ action: 'archive', id: b }); await store.changeExperiment({ action: 'archive', id: a });
  await store.changeExperiment({ action: 'restore', id: a });
  assert.equal(store.get().experiments.nodes.find(n => n.id === b).archived, true); assert.equal(store.get().experiments.nodes.find(n => n.id === c).archived, false);
  await store.changeExperiment({ action: 'restore', id: b });
  assert.deepEqual(await store.readEvidence(c, image.id), fixture);
  await store.changeExperiment({ action: 'detach', id: c, evidenceId: image.id });
  assert.deepEqual(await fs.readFile(path.join(store.directory, 'evidence', image.storedName)), fixture);
  await assert.rejects(store.readEvidence(c, image.id), /未找到/);
});
test('full backup restores evidence, captions and archives; newer local records survive restore', async t => {
  const { store, dir } = await setup(t), id = await add(store, '备份实验');
  await store.importEvidence({ nodeId: id, name: '图.png', bytes: fixture });
  const image = store.get().experiments.nodes[0].evidence[0];
  await store.changeExperiment({ action: 'caption', id, evidenceId: image.id, caption: '原始图片与实验条件' });
  assert.equal((await store.importEvidence({ nodeId: id, name: '重命名.png', bytes: fixture })).duplicate, true);
  const backup = await store.backup(dir), incoming = path.join(backup, 'library.json');
  const fresh = new LibraryStore(path.join(dir, 'restored'), seed); await fresh.init(); await fresh.restore(incoming);
  assert.deepEqual(await fresh.readEvidence(id, image.id), fixture); assert.equal(fresh.get().experiments.nodes[0].evidence[0].caption, '原始图片与实验条件');
  await fresh.changeExperiment({ action: 'update', id, patch: { record: '较新的本机实验结果' } }); await fresh.changeExperiment({ action: 'archive', id }); await fresh.restore(incoming);
  assert.equal(fresh.get().experiments.nodes[0].record, '较新的本机实验结果'); assert.equal(fresh.get().experiments.nodes[0].archived, true);
  const archivedBackup = await fresh.backup(dir); const other = new LibraryStore(path.join(dir, 'archived-restore'), seed); await other.init(); await other.restore(path.join(archivedBackup, 'library.json'));
  assert.equal(other.get().experiments.nodes[0].archived, true); assert.deepEqual(await other.readEvidence(id, image.id), fixture);
  const before = fresh.get(); const corrupt = Buffer.from(fixture); corrupt[corrupt.length - 1] ^= 1; await fs.writeFile(path.join(backup, 'evidence', image.storedName), corrupt);
  await assert.rejects(fresh.restore(incoming), /校验失败/); assert.deepEqual(fresh.get(), before);
});
test('experiment input rejects executable images, invalid paths, and conflicting restore cycles', async t => {
  const { store } = await setup(t), a = await add(store, 'A'), b = await add(store, 'B');
  assert.throws(() => verifyImage(Buffer.from('<svg onload="evil()"></svg>')), /PNG/);
  await store.importEvidence({ nodeId: a, name: 'fixture.png', bytes: fixture });
  const invalid = store.get(); invalid.experiments.nodes[0].evidence[0].storedName = '../../outside.png'; assert.throws(() => validateLibrary(invalid), /路径/);
  await assert.rejects(store.readEvidence(b, store.get().experiments.nodes[0].evidence[0].id), /未找到/);
  const local = store.get().experiments, incoming = structuredClone(local);
  local.nodes[0].parentId = b; local.nodes[0].updatedAt = '2030-01-01T00:00:00Z'; incoming.nodes[1].parentId = a; incoming.nodes[1].updatedAt = '2030-01-01T00:00:00Z';
  assert.throws(() => mergeExperiments(local, incoming), /子步骤/);
});
test('project-scoped stores keep experiment steps and evidence separate', async t => {
  const { dir } = await setup(t);
  const projects = new ProjectManager({ userData: path.join(dir, 'profile'), seedPath: seed }); await projects.init();
  const first = projects.get('sc-snr').store, id = await add(first, 'SC 项目实验');
  await first.importEvidence({ nodeId: id, name: '图.png', bytes: fixture });
  const second = await projects.create({ name: '独立实验项目', question: '新的研究问题', keywords: ['test'] });
  await projects.activate(second.id); const other = projects.get().store;
  assert.equal(other.get().experiments, undefined); await assert.rejects(other.changeExperiment({ action: 'update', id, patch: { title: '跨项目编辑' } }), /未找到/);
  const otherId = await add(other, '其他实验'); assert.notEqual(otherId, id); assert.equal(first.get().experiments.nodes.length, 1);
});
