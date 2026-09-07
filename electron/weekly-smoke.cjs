const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { publishBatch } = require('./weekly.cjs');

async function runWeeklySmoke({ win, store, waitFor, directory }) {
  const run = code => win.webContents.executeJavaScript(code);
  const before = store.get().papers;
  const candidate = { title: 'Weekly smoke fixture: visual selection in the superior colliculus', authors: 'Test A; Test B',
    journal: 'Synthetic test record', publishedDate: '2026-09-03', publication: '预印本', doi: '10.99999/desktop-weekly-1',
    url: 'https://example.org/weekly-test', summary: '这是一条隔离的软件测试记录，用来验证候选论文的显示、收录和持久化。',
    relevance: '用测试摘要与推荐理由验证中文排版，区分候选论文和主文献库。', caveat: '合成测试记录，不是真实研究。',
    module: '注意与决策', match: '直接相关', verification: '已核对摘要', tags: ['SC', '软件测试'],
    sources: [{ label: '测试来源', url: 'https://example.org/weekly-test' }] };
  const batch = { format: 'neuroshelf-weekly', version: 1, weekOf: '2026-09-07', windowStart: '2026-08-24', windowEnd: '2026-09-07',
    screenedAt: '2026-09-07T12:00:00Z', status: 'complete', checkedCount: 3, searchedSources: ['隔离测试来源'], summary: '验证收到新批次、去重和用户收录的完整流程。',
    candidates: [candidate, { ...candidate, title: 'Another weekly smoke fixture: cortical visual inputs', doi: '10.99999/desktop-weekly-2', match: '方法参考' },
      { ...candidate, title: before[0].title, doi: '' }] };
  await run(`document.querySelector('.nav-item[title="每周新论文"]').click()`);
  await waitFor(`Boolean(document.querySelector('.weekly-empty'))`);
  await publishBatch(path.join(path.dirname(store.directory), 'inbox', 'papers'), batch);
  await waitFor(`!document.querySelector('.weekly-heading button').disabled`);
  await run(`document.querySelector('.weekly-heading button').click()`);
  await waitFor(`document.querySelectorAll('.weekly-candidate').length === 2 && !document.querySelector('.weekly-heading button').disabled`);
  assert.deepEqual(store.get().papers, before, 'Receiving papers must not add them to the library or change notes');
  assert.equal(store.get().weekly.batches[0].duplicateCount, 1);
  const [first, second] = store.get().weekly.candidates;
  const button = (id, label) => `[...document.querySelectorAll('[data-candidate-id="${id}"] button')].find(b => b.textContent.includes(${JSON.stringify(label)}))`;
  await new Promise(resolve => setTimeout(resolve, 300));
  await fs.writeFile(path.join(directory, 'desktop-weekly.png'), (await win.webContents.capturePage()).toPNG());
  await run(`${button(first.id, '加入文献库')}.click()`);
  await waitFor(`document.querySelectorAll('.weekly-candidate').length === 1 && !document.querySelector('.weekly-actions button').disabled`);
  assert.equal(store.get().papers.length, before.length + 1);
  await run(`${button(second.id, '暂不收录')}.click()`);
  await waitFor(`Boolean(document.querySelector('.weekly-empty'))`);
  const tab = label => `[...document.querySelectorAll('.weekly-tabs button')].find(b => b.textContent.startsWith(${JSON.stringify(label)}))`;
  await run(`${tab('暂不收录')}.click()`);
  await waitFor(`Boolean(document.querySelector('.weekly-candidate')) && !document.querySelector('.weekly-actions button').disabled`);
  await run(`${button(second.id, '放回待筛选')}.click()`);
  await waitFor(`Boolean(document.querySelector('.weekly-empty'))`);
  await run(`${tab('已入库')}.click()`);
  await waitFor(`Boolean(document.querySelector('[data-candidate-id="${first.id}"]'))`);
  await run(`${button(first.id, '打开文献')}.click()`);
  await waitFor(`Boolean(document.querySelector('.guide-origin')?.textContent.includes('这一周的论文筛选'))`);
  assert.equal(store.get().papers.find(p => p.discovery?.candidateId === first.id).title, candidate.title);
  await win.reload();
  await waitFor(`Boolean(document.querySelector('.nav-item[title="每周新论文"]'))`);
  await run(`document.querySelector('.nav-item[title="每周新论文"]').click()`);
  await waitFor(`document.querySelectorAll('.weekly-candidate').length === 1 && !document.querySelector('.weekly-heading button').disabled`);
  assert.equal(store.get().weekly.candidates.find(c => c.id === first.id).status, 'accepted');
  assert.equal(store.get().weekly.candidates.find(c => c.id === second.id).status, 'pending');
  await run(`document.querySelector('.weekly-heading button').click()`);
  await waitFor(`!document.querySelector('.weekly-heading button').disabled`);
  assert.equal(store.get().papers.length, before.length + 1, 'Refresh after reload must not duplicate an accepted paper');
  await run(`document.querySelector('.nav-item[title="全部文献"]').click()`);
  await waitFor(`Boolean(document.querySelector('.library-title'))`);
  console.log('WEEKLY_INBOX_OK: live packet reception, duplicate filtering, explicit acceptance, dismiss/restore, opening paper and persisted decisions.');
  return { weeklyInbox: true };
}
module.exports = { runWeeklySmoke };
