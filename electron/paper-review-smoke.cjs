// Runs only with --smoke-test in an isolated project library. No user data or AI calls.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function runPaperReviewSmoke({ win, projects, waitFor, directory }) {
  const run = code => win.webContents.executeJavaScript(code), store = projects.get('sc-snr').store;
  const field = '.paper-review[data-paper-id="p001"] input';
  const status = '.paper-review[data-paper-id="p001"]';
  const change = (selector, value) => `(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles: true})); })();`;
  const search = text => run(change('input[aria-label="搜索文献库"]', text));
  const originalNote = store.find('p001').note;
  await run(`document.querySelector('.nav-item[title="全部文献"]').click()`);
  await search('');
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(field)}))`);
  await run(`document.querySelector(${JSON.stringify(field)}).focus()`);
  await win.webContents.insertText('复读定位：重点比较图 2 的对照。');
  await waitFor(`document.querySelector(${JSON.stringify(status)})?.dataset.saveState === 'saved'`);
  assert.equal(store.find('p001').personalReview, '复读定位：重点比较图 2 的对照。');
  assert.equal(store.find('p001').note, originalNote);

  // Navigating away inside the debounce window must flush the actual latest value.
  await run(change(field, '复读定位：先看图 2，再比较两种运动。') + `document.querySelector('.nav-item[title="PI 与实验室"]').click();`);
  await waitFor(`Boolean(document.querySelector('.people-page'))`);
  await run(`document.querySelector('.nav-item[title="全部文献"]').click()`);
  await search('复读定位');
  await waitFor(`document.querySelectorAll('.paper-card').length === 1 && document.querySelector(${JSON.stringify(field)})?.value === '复读定位：先看图 2，再比较两种运动。'`);
  await run(`document.querySelector('.nav-item[title="我的笔记"]').click()`);
  await waitFor(`document.querySelectorAll('.paper-card').length === 1 && Boolean(document.querySelector(${JSON.stringify(field)}))`);

  // A failed disk write must leave the draft visible and permit an actual retry.
  const originalUpdate = store.update;
  let failOnce = true;
  store.update = function(id, patch) { if (id === 'p001' && Object.hasOwn(patch, 'personalReview') && failOnce) { failOnce = false; return Promise.reject(new Error('模拟评价保存失败')); } return originalUpdate.call(this, id, patch); };
  try {
    await run(change(field, '复读定位：失败重试后保留这个版本。'));
    await waitFor(`document.querySelector(${JSON.stringify(status)})?.dataset.saveState === 'error'`);
    assert.equal(await run(`document.querySelector(${JSON.stringify(field)}).value`), '复读定位：失败重试后保留这个版本。');
    await run(`document.querySelector(${JSON.stringify(status + ' .review-retry')}).click()`);
    await waitFor(`document.querySelector(${JSON.stringify(status)})?.dataset.saveState === 'saved'`);
    assert.equal(store.find('p001').personalReview, '复读定位：失败重试后保留这个版本。');
  } finally { store.update = originalUpdate; }

  // Project switching uses the same flush protocol as the reader.
  const other = projects.index.projects.find(p => p.id !== 'sc-snr'); assert.ok(other);
  await run(change(field, '复读定位：切换项目也要保存。') + `(() => { const select = document.querySelector('select[aria-label="切换研究项目"]'); select.value = ${JSON.stringify(other.id)}; select.dispatchEvent(new Event('change', {bubbles: true})); })();`);
  await waitFor(`document.querySelector('select[aria-label="切换研究项目"]')?.value === ${JSON.stringify(other.id)} && Boolean(document.querySelector('.project-heading h1')) && !document.querySelector('.project-switching')`);
  assert.equal(store.find('p001').personalReview, '复读定位：切换项目也要保存。');
  assert.equal(projects.get(other.id).store.get().papers.length, 0);
  await run(`(() => { const select = document.querySelector('select[aria-label="切换研究项目"]'); select.value = 'sc-snr'; select.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await waitFor(`document.querySelector('select[aria-label="切换研究项目"]')?.value === 'sc-snr' && Boolean(document.querySelector(${JSON.stringify(field)})) && !document.querySelector('.project-switching')`);
  assert.equal(await run(`document.querySelector(${JSON.stringify(field)}).value`), '复读定位：切换项目也要保存。');

  await run(change(field, ''));
  await waitFor(`document.querySelector(${JSON.stringify(status)})?.dataset.saveState === 'saved'`);
  assert.equal(store.find('p001').personalReview, ''); assert.equal(store.find('p001').note, originalNote);
  await search('复读定位'); await waitFor(`document.querySelectorAll('.paper-card').length === 0`);
  await search(''); await waitFor(`Boolean(document.querySelector(${JSON.stringify(field)}))`);
  await run(change(field, '图 2 值得重读，重点比较运动速度的控制。'));
  await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await waitFor(`document.querySelector(${JSON.stringify(status)})?.dataset.saveState === 'saved' && document.querySelector(${JSON.stringify(field)})?.value === '图 2 值得重读，重点比较运动速度的控制。'`);
  assert.equal(store.find('p001').personalReview, '图 2 值得重读，重点比较运动速度的控制。');
  await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await fs.writeFile(path.join(directory, 'desktop-paper-reviews.png'), (await win.webContents.capturePage()).toPNG());
  console.log('PERSONAL_REVIEW_OK: card editing, autosave, search, notes filter, retry, project isolation, reload and clearing.');
  return { personalReviews: true };
}
module.exports = { runPaperReviewSmoke };
