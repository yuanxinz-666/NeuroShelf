const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ProjectManager } = require('../electron/projects.cjs');
const { LibraryStore } = require('../electron/store.cjs');
const { validateBatch } = require('../electron/weekly.cjs');
const { validatePeopleBatch, publishPeople, syncPeople } = require('../electron/people.cjs');
const { fixturePdf } = require('./fixture.cjs');
const seed = path.resolve('data/library.json');
const baseline = require('../data/sc-snr-people.json');
async function setup() { const userData = await fs.mkdtemp(path.resolve('.test-data/projects-')); const manager = new ProjectManager({ userData, seedPath: seed }); await manager.init(); return { userData, manager }; }
test('migration copies PDF bytes, all paper fields and weekly decisions; legacy remains intact', async () => {
  const userData = await fs.mkdtemp(path.resolve('.test-data/migrate-'));
  const old = new LibraryStore(path.join(userData, 'library'), seed); await old.init();
  await old.importPdf({ id: 'p001', name: 'original.pdf', bytes: fixturePdf() });
  await old.update('p001', { note: '保留原始笔记', starred: true, page: 2 });
  const before = old.get(), manager = new ProjectManager({ userData, seedPath: seed }); await manager.init();
  const copied = manager.get().store;
  assert.deepEqual(copied.get().papers, before.papers); assert.deepEqual(await copied.readPdf('p001'), await old.readPdf('p001'));
  assert.deepEqual(JSON.parse(await fs.readFile(old.file, 'utf8')), before);
  await manager.init(); assert.equal(manager.list().projects.length, 1); assert.deepEqual(manager.get().store.get().papers, before.papers);
});
test('invalid PDF migration refuses to publish a new project index', async () => {
  const userData = await fs.mkdtemp(path.resolve('.test-data/bad-migrate-')), old = new LibraryStore(path.join(userData, 'library'), seed); await old.init();
  const { paper } = await old.importPdf({ id: 'p001', name: 'original.pdf', bytes: fixturePdf() });
  await fs.writeFile(path.join(old.directory, 'pdfs', paper.pdf.storedName), 'corrupted');
  await assert.rejects(new ProjectManager({ userData, seedPath: seed }).init(), /校验失败/);
  await assert.rejects(fs.stat(path.join(userData, 'projects/index.json')), { code: 'ENOENT' });
});
test('new projects are empty and remain isolated across switching, delayed writes and reopening', async () => {
  const { manager, userData } = await setup(), first = manager.get();
  const project = await manager.create({ name: '新课题<>../', question: 'Spatial memory?', keywords: 'hippocampus, memory', weeklyEnabled: true });
  const second = await manager.open(project.id); assert.equal(second.store.get().papers.length, 0); assert.equal(second.store.get().gaps, undefined);
  const lateWrite = first.store.enqueue(async () => { await new Promise(r => setTimeout(r, 15)); const data = first.store.get(); data.papers[0].note = '原项目晚到写入'; await first.store.commit(data); });
  await manager.activate(project.id); await lateWrite;
  await second.store.importPdf({ name: 'other.pdf', bytes: fixturePdf() });
  assert.equal(second.store.get().papers.length, 1); assert.equal(second.store.get().papers[0].note, '');
  assert.equal(first.store.get().papers[0].note, '原项目晚到写入');
  const reopened = new ProjectManager({ userData, seedPath: seed }); await reopened.init(); assert.equal(reopened.index.activeId, project.id); assert.equal(reopened.get().store.get().papers.length, 1);
});
test('project packets and backups cannot enter a different project', async () => {
  const { manager } = await setup(), first = manager.get();
  const created = await manager.create({ name: 'B', question: 'Question B' }), second = await manager.open(created.id);
  const packet = validateBatch({ format: 'neuroshelf-weekly', version: 1, projectId: 'sc-snr', weekOf: '2026-09-07', windowStart: '2026-09-01', windowEnd: '2026-09-07', screenedAt: '2026-09-07T15:00:00Z', status: 'complete', checkedCount: 0, searchedSources: ['PubMed'], summary: 'No new papers', candidates: [] });
  await assert.rejects(second.store.ingestWeekly([packet]), /另一个项目/);
  await assert.rejects(second.store.ingestPeople([baseline]), /另一个项目/);
  await assert.rejects(second.store.restore(first.store.file), /其他项目/);
  assert.deepEqual(second.store.get().papers, []);
});
test('PI packets round-trip and sync idempotently while preserving user follows and notes', async () => {
  const { manager } = await setup(), context = manager.get();
  const batch = validatePeopleBatch(baseline); assert.deepEqual(validatePeopleBatch(batch), batch);
  await publishPeople(path.join(context.directory, 'inbox/people'), batch);
  const first = await syncPeople(context.store, path.join(context.directory, 'inbox/people')); assert.equal(first.errors.length, 0); assert.equal(first.people.profiles.length, 12); assert.equal(first.people.events.length, 5);
  const id = first.people.profiles[0].id; await context.store.updatePerson(id, { followed: true, note: '需要持续关注' });
  await context.store.ingestPeople([{ ...baseline, checkedOn: '2026-09-08' }]);
  const person = context.store.get().people.profiles.find(p => p.id === id); assert.equal(person.followed, true); assert.equal(person.note, '需要持续关注'); assert.equal(context.store.get().people.events.length, 5);
});
