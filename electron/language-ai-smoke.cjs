// Exercise the real renderer -> IPC -> request builder using only the mock Codex provider.
const assert = require('node:assert/strict');
async function runLanguageAiSmoke({ run, waitFor, select, space, codex, store }) {
  const setLocale = async locale => {
    await run(`(() => { const select = document.querySelector('select[aria-label="Interface language / 界面语言"]'); select.value = ${JSON.stringify(locale)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(`document.documentElement.lang === ${JSON.stringify(locale)} && !document.querySelector('select[aria-label="Interface language / 界面语言"]').disabled`);
  };
  const setResponse = async value => {
    await run(`document.querySelector('button[aria-label="AI settings"]').click()`);
    await waitFor(`Boolean(document.querySelector('dialog[open] .language-settings'))`);
    await run(`(() => { const select = document.querySelector('select[aria-label="AI response language / AI 回答语言"]'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(`window.neuroshelf.preferences().then(p => p.answerLanguage === ${JSON.stringify(value)} && !document.querySelector('select[aria-label="AI response language / AI 回答语言"]').disabled)`);
    await run(`document.querySelector('button[aria-label="Close dialog"]').click()`);
    await waitFor(`!document.querySelector('dialog[open]')`);
  };
  const completed = async action => {
    const count = codex.calls.length;
    await action();
    await waitFor(`Boolean(document.querySelector('button[aria-label="Stop generating"]'))`);
    await waitFor(`!document.querySelector('button[aria-label="Stop generating"]')`);
    assert.equal(codex.calls.length, count + 1);
    return codex.calls.at(-1);
  };
  await setLocale('en');
  await select('Nigral input');
  const en = await completed(space);
  assert.match(en.instructions, /Response language: English/);
  assert.match(store.get().papers.find(p => p.title === 'reader-verification').messages.at(-2).content, /What does this passage mean/);
  await setResponse('zh-CN');
  await select('Nigral input');
  const zh = await completed(space);
  assert.match(zh.instructions, /回答语言：简体中文/);
  await run(`[...document.querySelectorAll('.document-tabs button')].find(b => b.textContent === 'Reading guide').click()`);
  await waitFor(`Boolean(document.querySelector('.guide-translation button'))`);
  const summary = store.get().papers.find(p => p.title === 'reader-verification').summary;
  const guide = await completed(() => run(`document.querySelector('.guide-translation button').click()`));
  assert.match(guide.instructions, /Response language: English/);
  assert.equal(store.get().papers.find(p => p.title === 'reader-verification').summary, summary);
  assert.equal((await run('window.neuroshelf.preferences()')).answerLanguage, 'zh-CN');
  await setResponse('auto');
  await setLocale('zh-CN');
  await run(`[...document.querySelectorAll('.document-tabs button')].find(b => b.textContent === '原文 PDF').click()`);
  await waitFor(`document.querySelector('.textLayer')?.textContent.includes('Nigral input') && !document.querySelector('.render-status')`);
  console.log('LANGUAGE_AI_OK: English Space prompt, independent Chinese response preference, one-off English guide translation through the real IPC route; original guide preserved.');
}
module.exports = { runLanguageAiSmoke };
