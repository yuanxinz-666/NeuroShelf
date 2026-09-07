const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LibraryStore, normalizePatch, verifyPdf } = require('../electron/store.cjs');
const { fixturePdf } = require('./fixture.cjs');
const root = path.resolve(__dirname, '../.test-data');
const seed = path.resolve(__dirname, '../data/library.json');
async function setup(t) {
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'store-'));
  t.after(async () => { const resolved = path.resolve(dir); if (!resolved.startsWith(root + path.sep)) throw new Error('Unsafe cleanup path'); await fs.rm(resolved, { recursive: true, force: true }); });
  const store = new LibraryStore(path.join(dir, 'live'), seed); await store.init();
  return { store, dir };
}
test('migrates all 107 papers and 8 evidence gaps without losing source caveats', async t => {
  const { store } = await setup(t); const data = store.get();
  assert.equal(data.papers.length, 107); assert.equal(data.gaps.length, 8);
  assert.match(data.papers[0].title, /Kinetic features/);
  assert.ok(data.papers.every(p => p.summary && p.relevance && p.caveat && p.url));
});
test('concurrent note, page, and star updates survive reopening', async t => {
  const { store } = await setup(t);
  await Promise.all([store.update('p001', { note: '中文笔记\n原文的结论≠我的推断' }), store.update('p001', { personalReview: '重点重读图 2 的对照，适合比较运动选择。' }), store.update('p001', { page: 2, status: 'reading' }), store.update('p001', { starred: true })]);
  const reopened = new LibraryStore(store.directory, seed); await reopened.init(); const p = reopened.find('p001');
  assert.equal(p.page, 2); assert.equal(p.starred, true); assert.equal(p.note, '中文笔记\n原文的结论≠我的推断');
  assert.equal(p.personalReview, '重点重读图 2 的对照，适合比较运动选择。');
});
test('PDF import copies bytes, deduplicates, and persists real highlights', async t => {
  const { store } = await setup(t); const pdf = fixturePdf();
  const first = await store.importPdf({ id: 'p001', name: '原文.pdf', bytes: pdf });
  const duplicate = await store.importPdf({ name: 'renamed.pdf', bytes: pdf });
  assert.equal(first.paper.pdf.bytes, pdf.length); assert.equal(duplicate.duplicate, true);
  assert.equal(store.get().papers.length, 107); assert.deepEqual(await store.readPdf('p001'), pdf);
  await store.update('p001', { highlights: [{ id: 'h1', text: 'orienting', page: 1, source: 'pdf', rects: [{ x: .1, y: .1, w: .3, h: .02 }], color: 'yellow', pdfHash: first.paper.pdf.hash }] });
  const reopened = new LibraryStore(store.directory, seed); await reopened.init(); assert.equal(reopened.find('p001').highlights[0].text, 'orienting');
});
test('cannot silently replace a linked PDF; detach retains original bytes', async t => {
  const { store } = await setup(t); const pdf = fixturePdf();
  const { paper } = await store.importPdf({ id: 'p001', name: 'original.pdf', bytes: pdf });
  await assert.rejects(store.importPdf({ id: 'p001', bytes: Buffer.concat([pdf, Buffer.from('\n')]), name: 'new.pdf' }), /解除关联/);
  await store.detachPdf('p001'); assert.equal(store.find('p001').pdf, null);
  assert.deepEqual(await fs.readFile(path.join(store.directory, 'pdfs', paper.pdf.storedName)), pdf);
});
test('full backup restores PDF bytes, notes and chat in a fresh library', async t => {
  const { store, dir } = await setup(t);
  await store.importPdf({ id: 'p002', name: 'test.pdf', bytes: fixturePdf() });
  await store.update('p002', { personalReview: '个人评价与精读笔记都要备份。', note: '备份测试', messages: [{ id: 'm1', role: 'assistant', content: '回答', page: 2 }] });
  const backup = await store.backup(dir);
  const fresh = new LibraryStore(path.join(dir, 'restored'), seed); await fresh.init();
  await fresh.restore(path.join(backup, 'library.json'));
  assert.equal(fresh.find('p002').note, '备份测试'); assert.equal(fresh.find('p002').messages[0].content, '回答');
  assert.equal(fresh.find('p002').personalReview, '个人评价与精读笔记都要备份。');
  assert.deepEqual(await fresh.readPdf('p002'), fixturePdf());
  assert.equal((await fs.readdir(backup)).includes('settings.json'), false);
});
test('restore keeps newer local records and fails atomically on corrupted PDF', async t => {
  const { store, dir } = await setup(t); await store.importPdf({ id: 'p001', name: 'a.pdf', bytes: fixturePdf() });
  const backup = await store.backup(dir);
  await store.update('p001', { note: 'newer local note' });
  const backupPath = path.join(backup, 'library.json'); const data = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  data.papers[0].updatedAt = '2000-01-01T00:00:00Z'; await fs.writeFile(backupPath, JSON.stringify(data));
  await store.restore(backupPath); assert.equal(store.find('p001').note, 'newer local note');
  await fs.writeFile(path.join(backup, 'pdfs', data.papers[0].pdf.storedName), '%PDF-broken');
  await assert.rejects(store.restore(backupPath), /校验失败/); assert.equal(store.find('p001').note, 'newer local note');
});
test('invalid input and path traversal are rejected without touching the library', async t => {
  const { store, dir } = await setup(t);
  assert.throws(() => verifyPdf(Buffer.from('<html>fake</html>')), /有效的 PDF/);
  await assert.rejects(store.update('../secret', { note: 'no' }), /编号无效/);
});

test('personal reviews support clearing, reject invalid data, and leave detailed notes untouched', async t => {
  const { store, dir } = await setup(t);
  await store.update('p001', { note: '保留整篇精读笔记', personalReview: '短评' });
  const before = store.get();
  assert.throws(() => store.update('p001', { personalReview: { unsafe: true } }), /评价/);
  assert.throws(() => store.update('p001', { personalReview: '字'.repeat(501) }), /500/);
  const bad = store.get(); bad.papers[0].personalReview = ['invalid'];
  const file = path.join(dir, 'bad-review.json'); await fs.writeFile(file, JSON.stringify(bad));
  await assert.rejects(store.restore(file), /评价/); assert.deepEqual(store.get(), before);
  await store.update('p001', { personalReview: '' });
  const reopened = new LibraryStore(store.directory, seed); await reopened.init();
  assert.equal(reopened.find('p001').personalReview, '');
  assert.equal(reopened.find('p001').note, '保留整篇精读笔记');
});
test('backup path fields are constrained to content hashes', async t => {
  const { store, dir } = await setup(t); const bad = store.get();
  bad.papers[0].pdf = { storedName: '../../secret' };
  const file = path.join(dir, 'bad.json'); await fs.writeFile(file, JSON.stringify(bad));
  await assert.rejects(store.restore(file), /路径无效/); assert.equal(store.find('p001').pdf, null);
  assert.throws(() => normalizePatch({ page: -1 }), /页码/);
  assert.throws(() => normalizePatch({ status: 'unknown' }), /状态/);
  assert.throws(() => normalizePatch({ highlights: [{ id: 'h', text: 'x', rects: [{ x: 4, y: 0, w: 1, h: 1 }] }] }), /位置/);
});
test('malformed on-disk database is not silently replaced by seed', async t => {
  const { store } = await setup(t); await fs.writeFile(store.file, '{broken');
  const reopen = new LibraryStore(store.directory, seed); await assert.rejects(reopen.init(), /未覆盖/);
  assert.equal(await fs.readFile(store.file, 'utf8'), '{broken');
});
test('old webpage JSON imports notes, status, stars, and map highlights', async t => {
  const { store } = await setup(t);
  const result = await store.importLegacy({ format: 'snr-sc-pitx2-reading-notes', schemaVersion: 2, datasetId: 'snr-sc-pitx2-literature-2026-09-05', records: { any: { paperId: 'p003', note: '旧笔记', tags: 'Pitx2', readStatus: 'read', starred: true, updatedAt: new Date().toISOString(), highlights: [{ id: 'legacy1', text: '触觉', color: 'yellow' }] } } });
  assert.equal(result.count, 1); assert.equal(store.find('p003').note, '旧笔记'); assert.equal(store.find('p003').status, 'read');
  assert.equal(store.find('p003').highlights[0].source, 'map');
});

test('annotation edits merge by id with new highlights and survive backup and reopening', async t => {
  const { store, dir } = await setup(t);
  const { paper } = await store.importPdf({ id: 'p001', name: 'annotated.pdf', bytes: fixturePdf() });
  const value = { source: 'pdf', pdfHash: paper.pdf.hash, page: 2, text: 'Attention and motor output', rects: [{ x: .1, y: .2, w: .5, h: .03 }], color: 'yellow', comment: '' };
  await store.mutateHighlight('p001', { action: 'add', highlightId: 'first', value });
  await Promise.all([
    store.mutateHighlight('p001', { action: 'update', highlightId: 'first', value: { comment: '中文旁注：注意和动作不能混为一谈。' } }),
    store.mutateHighlight('p001', { action: 'add', highlightId: 'second', value: { ...value, page: 1, text: 'Nigral input' } }),
    store.update('p001', { page: 1, note: '整篇论文笔记' }),
  ]);
  const backup = await store.backup(dir), reopened = new LibraryStore(path.join(dir, 'restored'), seed);
  await reopened.init(); await reopened.restore(path.join(backup, 'library.json'));
  const restored = reopened.find('p001');
  assert.equal(restored.highlights.length, 2);
  assert.equal(restored.highlights[0].comment, '中文旁注：注意和动作不能混为一谈。');
  assert.equal(restored.highlights[0].page, 2);
  assert.equal(restored.highlights[0].pdfHash, paper.pdf.hash);
  assert.deepEqual(restored.highlights[0].rects, value.rects);
  assert.equal(restored.note, '整篇论文笔记');
});
test('deleted annotations cannot be resurrected by a late autosave and invalid comments are rejected', async t => {
  const { store } = await setup(t);
  await store.mutateHighlight('p001', { action: 'add', highlightId: 'h1', value: { text: 'A sentence', page: 1, color: 'yellow' } });
  await assert.rejects(store.mutateHighlight('p001', { action: 'update', highlightId: 'h1', value: { comment: { bad: true } } }), /旁注格式/);
  await assert.rejects(store.mutateHighlight('p001', { action: 'update', highlightId: 'h1', value: { text: 'changed quotation' } }), /旁注内容/);
  assert.equal(store.find('p001').highlights[0].text, 'A sentence');
  const remove = store.mutateHighlight('p001', { action: 'remove', highlightId: 'h1' });
  const lateSave = store.mutateHighlight('p001', { action: 'update', highlightId: 'h1', value: { comment: 'late write' } });
  await remove; await assert.rejects(lateSave, /已删除/);
  assert.equal(store.find('p001').highlights.length, 0);
});
