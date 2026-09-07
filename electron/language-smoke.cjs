const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
async function runLanguageSmoke({ win, directory, waitFor }) {
  const run = code => win.webContents.executeJavaScript(code);
  const setLocale = async locale => {
    await run(`(() => { const input = document.querySelector('select[aria-label="Interface language / 界面语言"]'); input.value = ${JSON.stringify(locale)}; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(`document.documentElement.lang === ${JSON.stringify(locale)} && !document.querySelector('select[aria-label="Interface language / 界面语言"]').disabled`);
  };
  await waitFor(`document.documentElement.lang === 'en' && Boolean(document.querySelector('input[aria-label="Search library"]'))`);
  assert.match(await run('document.body.innerText'), /Project overview/);
  await fs.writeFile(path.join(directory, 'desktop-english.png'), (await win.webContents.capturePage()).toPNG());
  // Switch with a dirty personal review and keep both the editor and its original text.
  await run(`document.querySelector('.paper-review input').focus()`);
  await run(`(() => { const input = document.querySelector('.paper-review input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '中文个人记录 / English private review'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await setLocale('zh-CN');
  assert.equal(await run(`document.querySelector('.paper-review input').value`), '中文个人记录 / English private review');
  await run(`document.querySelector('.user-avatar').click()`);
  await waitFor(`Boolean(document.querySelector('dialog[open] .language-settings'))`);
  await run(`(() => { const input = document.querySelector('select[aria-label="AI response language / AI 回答语言"]'); input.value = 'en'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`window.neuroshelf.preferences().then(value => value.answerLanguage === 'en' && !document.querySelector('select[aria-label="AI response language / AI 回答语言"]').disabled)`);
  assert.equal((await run('window.neuroshelf.preferences()')).answerLanguage, 'en');
  await run(`document.querySelector('button[aria-label="关闭对话框"]').click()`);
  await setLocale('en');
  await run(`document.querySelector('.nav-item[title="Experiments"]').click()`);
  await waitFor(`Boolean(document.querySelector('.experiments-page, .exp-page')) || document.body.innerText.includes('Start with the step you are working on')`);
  await fs.writeFile(path.join(directory, 'desktop-experiments-english.png'), (await win.webContents.capturePage()).toPNG());
  await setLocale('zh-CN');
  await run(`window.neuroshelf.savePreferences({ answerLanguage: 'auto' })`);
  await win.reload();
  await waitFor(`document.documentElement.lang === 'zh-CN' && Boolean(document.querySelector('input[aria-label="搜索文献库"]'))`);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'preferences.json'), 'utf8')), { locale: 'zh-CN', answerLanguage: 'auto' });
  assert.equal(await run(`document.querySelector('.paper-review input').value`), '中文个人记录 / English private review');
  // Remove the test draft through the normal editor before the existing workflow checks.
  await run(`(() => { const input = document.querySelector('.paper-review input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(`window.neuroshelf.load().then(library => !library.papers[0].personalReview && document.querySelector('.paper-review input').value === '')`);
  console.log('LANGUAGES_OK: English first launch, live switching without losing drafts, saved choice after reload, independent AI language.');
  return { languages: true };
}
module.exports = { runLanguageSmoke };
