const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LibraryStore, validateLibrary } = require('../electron/store.cjs');
const { validateBatch, publishBatch, syncInbox, samePaper } = require('../electron/weekly.cjs');
const { candidate, batch } = require('./weekly-fixture.cjs');
const { fixturePdf } = require('./fixture.cjs');
const root = path.resolve('.test-data'), seed = path.resolve('data/library.json');
async function setup(t) {
  await fs.mkdir(root, { recursive: true }); const dir = await fs.mkdtemp(path.join(root, 'weekly-'));
  t.after(async () => { if (!path.resolve(dir).startsWith(root + path.sep)) throw new Error('Unsafe cleanup'); await fs.rm(dir, { recursive: true, force: true }); });
  const store = new LibraryStore(path.join(dir, 'library'), seed); await store.init(); return { store, dir, inbox: path.join(dir, 'weekly-inbox') };
}
test('weekly packets are separate, content-verified, idempotent and do not change existing papers', async t => {
  const { store, inbox } = await setup(t); const before = store.get().papers;
  const packet = batch([candidate(), candidate({ title: 'Same DOI with changed title' }), candidate({ title: before[0].title, doi: '', url: before[0].url })]);
  const first = await publishBatch(inbox, packet); assert.equal(first.duplicate, false);
  assert.equal((await publishBatch(inbox, packet)).duplicate, true);
  const result = await syncInbox(store, inbox); assert.equal(result.added, 1); assert.equal(result.weekly.batches[0].duplicateCount, 2);
  assert.deepEqual(store.get().papers, before); assert.equal((await syncInbox(store, inbox)).added, 0);
  assert.equal(store.get().weekly.batches.length, 1);
});
test('invalid links, dates and malformed packets cannot partly update the inbox', async t => {
  const { store, inbox } = await setup(t);
  assert.throws(() => validateBatch(batch([candidate({ url: 'javascript:alert(1)' })])), /HTTPS/);
  assert.throws(() => validateBatch(batch([candidate({ sources: [] })])), /来源/);
  assert.throws(() => validateBatch(batch([candidate({ publishedDate: '2026-02-30' })])), /日期/);
  assert.throws(() => validateBatch(batch([candidate({ publishedDate: '2026-01-01' })])), /补漏/);
  assert.throws(() => validateBatch(batch([], { weekOf: '2026-09-08' })), /周一/);
  const valid = await publishBatch(inbox, batch());
  await fs.writeFile(path.join(inbox, 'week-2026-09-07-0000000000000000.json'), '{broken');
  await fs.writeFile(path.join(inbox, 'ignored.tmp'), JSON.stringify(batch()));
  const result = await syncInbox(store, inbox); assert.equal(result.errors.length, 1); assert.equal(result.added, 1);
  const tampered = JSON.parse(await fs.readFile(valid.file, 'utf8')); tampered.candidates[0].title = 'Changed contents';
  await fs.writeFile(path.join(inbox, 'week-2026-09-07-1111111111111111.json'), JSON.stringify(tampered));
  assert.equal((await syncInbox(store, inbox)).errors.length, 2); assert.equal(store.get().papers.length, 107);
});
test('accepting a candidate twice during concurrent note saves adds exactly one paper without losing notes', async t => {
  const { store } = await setup(t); await store.ingestWeekly([batch()]); const id = store.get().weekly.candidates[0].id;
  const results = await Promise.all([store.decideWeekly(id, 'accept'), store.update('p001', { note: 'Reading note saved concurrently' }), store.decideWeekly(id, 'accept')]);
  assert.equal(store.get().papers.length, 108); assert.equal(results[0].paper.id, results[2].paper.id); assert.equal(results[2].duplicate, true);
  assert.equal(store.find('p001').note, 'Reading note saved concurrently');
  const paper = results[0].paper; assert.equal(paper.status, 'unread'); assert.equal(paper.pdf, null); assert.equal(paper.discovery.type, 'weekly');
  assert.deepEqual(paper.sources, candidate().sources); assert.equal(paper.doi, candidate().doi);
  await store.importPdf({ id: paper.id, name: 'weekly.pdf', bytes: fixturePdf() }); assert.equal(store.get().papers.length, 108);
  const reopen = new LibraryStore(store.directory, seed); await reopen.init(); assert.equal(reopen.get().weekly.candidates[0].status, 'accepted');
  assert.deepEqual(await reopen.readPdf(paper.id), fixturePdf());
});
test('dismissed candidates stay dismissed across new batches and can be restored without changing the library', async t => {
  const { store } = await setup(t); await store.ingestWeekly([batch()]); const id = store.get().weekly.candidates[0].id;
  await store.decideWeekly(id, 'dismiss');
  await store.ingestWeekly([batch([candidate()], { weekOf: '2026-09-14', windowEnd: '2026-09-14', screenedAt: '2026-09-14T09:00:00Z' })]);
  assert.equal(store.get().weekly.candidates.length, 1); assert.equal(store.get().weekly.candidates[0].status, 'dismissed');
  await store.decideWeekly(id, 'restore'); assert.equal(store.get().weekly.candidates[0].status, 'pending'); assert.equal(store.get().papers.length, 107);
  await store.decideWeekly(id, 'accept'); await assert.rejects(store.decideWeekly(id, 'dismiss'), /已在文献库/);
});
test('accept detects a paper separately imported after screening and preserves its PDF and notes', async t => {
  const { store } = await setup(t); await store.ingestWeekly([batch()]); const id = store.get().weekly.candidates[0].id;
  const imported = await store.importPdf({ name: 'manual.pdf', title: candidate().title, bytes: fixturePdf() });
  await store.update(imported.paper.id, { note: 'My existing annotations', starred: true });
  const result = await store.decideWeekly(id, 'accept'); assert.equal(result.duplicate, true); assert.equal(result.paper.id, imported.paper.id);
  assert.equal(result.paper.note, 'My existing annotations'); assert.ok(result.paper.pdf); assert.equal(store.get().papers.length, 108);
  assert.ok(samePaper({ doi: 'https://doi.org/10.1234/ABC' }, { doi: '10.1234/abc' }));
  assert.ok(samePaper({ url: 'https://www.biorxiv.org/content/10.64898/2026.06.12.731955v2.full.pdf', title: 'Original title' }, { doi: '10.64898/2026.06.12.731955', title: 'Revised title' }));
  assert.ok(samePaper({ url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/', title: 'Original' }, { pmid: '12345678', title: 'Updated' }));
});
test('full backup includes candidate decisions and merges newer local decisions on restore', async t => {
  const { store, dir } = await setup(t); await store.ingestWeekly([batch([candidate(), candidate({ title: 'Second', doi: '10.99999/weekly-test-2' })])]);
  const [a, b] = store.get().weekly.candidates; const accepted = await store.decideWeekly(a.id, 'accept'); await store.decideWeekly(b.id, 'dismiss');
  await store.importPdf({ id: accepted.paper.id, name: 'accepted.pdf', bytes: fixturePdf() });
  const backup = await store.backup(dir), file = path.join(backup, 'library.json');
  const fresh = new LibraryStore(path.join(dir, 'restored'), seed); await fresh.init(); await fresh.restore(file);
  assert.equal(fresh.get().weekly.candidates[0].status, 'accepted'); assert.equal(fresh.get().weekly.candidates[1].status, 'dismissed');
  assert.deepEqual(await fresh.readPdf(accepted.paper.id), fixturePdf());
  await fresh.decideWeekly(b.id, 'restore'); await fresh.restore(file); assert.equal(fresh.get().weekly.candidates[1].status, 'pending');
  const invalid = fresh.get(); invalid.weekly.candidates[0].status = 'execute'; assert.throws(() => validateLibrary(invalid), /状态/);
});
test('empty completed screening is recorded honestly without fake candidates', async t => {
  const { store, inbox } = await setup(t); await publishBatch(inbox, batch([], { checkedCount: 27, summary: '检索完成，没有符合范围的新论文。' }));
  const result = await syncInbox(store, inbox); assert.equal(result.added, 0); assert.equal(result.weekly.batches.length, 1); assert.equal(result.weekly.candidates.length, 0);
  assert.equal(store.get().papers.length, 107);
});
