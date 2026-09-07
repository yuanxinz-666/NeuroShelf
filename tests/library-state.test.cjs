const { test } = require('node:test');
const assert = require('node:assert/strict');
test('late snapshots and paper acknowledgements cannot hide newer saved AI messages or experiment edits', async () => {
  const { receivePaper, receiveLibrary, receiveExperiments } = await import('../src/library-state.mjs');
  const old = { id: 'p1', updatedAt: '2026-09-07T10:00:00.000Z', messages: [] };
  const latest = { ...old, updatedAt: '2026-09-07T10:00:01.000Z', messages: [{ content: '已保存的 AI 回答' }] };
  const node = { id: 'e1', updatedAt: latest.updatedAt, record: '刚输入的实验记录', archived: true };
  const library = { projectId: 'sc-snr', papers: [latest, { id: 'p2' }], experiments: { version: 1, nodes: [node] } };
  assert.deepEqual(receivePaper(library, old).papers.find(p => p.id === 'p1'), latest);
  const next = receiveLibrary(library, { projectId: 'sc-snr', papers: [old] });
  assert.deepEqual(next.papers.find(p => p.id === 'p1'), latest); assert.equal(next.papers.length, 2); assert.deepEqual(next.experiments.nodes[0], node);
  assert.deepEqual(receiveExperiments(library.experiments, { version: 1, nodes: [{ ...node, updatedAt: old.updatedAt, record: '', archived: false }] }).nodes[0], node);
  const newer = { ...node, updatedAt: '2026-09-07T10:00:02.000Z', archived: false };
  assert.deepEqual(receiveExperiments(library.experiments, { version: 1, nodes: [newer] }).nodes[0], newer);
  const other = { projectId: 'other', papers: [] }; assert.deepEqual(receiveLibrary(library, other), other);
});
