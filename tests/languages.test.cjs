const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Preferences, responseLanguage } = require('../electron/preferences.cjs');
const { buildRequest } = require('../electron/ai.cjs');
const { createTranslator } = require('../data/locales/core.mjs');
const english = require('../data/locales/en.json');

test('first launch defaults to English; chosen languages survive a new preferences instance and preserve AI settings', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neuroshelf-language-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const settings = JSON.stringify({ provider: 'codex', encryptedKey: 'encrypted-placeholder' }); await fs.writeFile(path.join(directory, 'settings.json'), settings);
  const first = new Preferences(directory); assert.deepEqual(await first.init(), { locale: 'en', answerLanguage: 'auto' });
  await Promise.all([first.update({ locale: 'zh-CN' }), first.update({ answerLanguage: 'en' })]);
  const restarted = new Preferences(directory); assert.deepEqual(await restarted.init(), { locale: 'zh-CN', answerLanguage: 'en' });
  assert.equal(await fs.readFile(path.join(directory, 'settings.json'), 'utf8'), settings);
  await restarted.update({ locale: 'en' }); assert.deepEqual(await new Preferences(directory).init(), { locale: 'en', answerLanguage: 'en' });
  await assert.rejects(restarted.update({ locale: 'fr', answerLanguage: 'auto' })); assert.equal(restarted.get().answerLanguage, 'en');
  await assert.rejects(restarted.update({ encryptedKey: 'never-accepted' }));
});

test('a failed preference write retains the last successful choice and can be retried', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neuroshelf-language-failure-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const settings = new Preferences(directory); await settings.init(); await settings.update({ locale: 'zh-CN' });
  const correct = settings.file; settings.file = path.join(directory, 'occupied'); await fs.mkdir(settings.file);
  await assert.rejects(settings.update({ locale: 'en' })); assert.equal(settings.get().locale, 'zh-CN');
  settings.file = correct; await settings.update({ locale: 'en' }); assert.equal((await new Preferences(directory).init()).locale, 'en');
});

test('AI response language follows preferences or an explicit translation request, while context is unchanged', () => {
  assert.equal(responseLanguage({ locale: 'en' }), 'en');
  assert.equal(responseLanguage({ locale: 'zh-CN' }), 'zh-CN');
  assert.equal(responseLanguage({ locale: 'en', answerLanguage: 'zh-CN' }), 'zh-CN');
  assert.equal(responseLanguage({ locale: 'zh-CN', answerLanguage: 'zh-CN' }, 'en'), 'en');
  assert.throws(() => responseLanguage({}, 'fr'));
  const paper = { title: '原文标题保持原样', summary: '我的中文导读', messages: [] }, payload = { question: 'Explain this passage', source: 'map', selection: '原文摘录' };
  const en = buildRequest(payload, paper, 'medium', 'en'), zh = buildRequest(payload, paper, 'medium', 'zh-CN');
  assert.match(en.instructions, /Response language: English/); assert.match(zh.instructions, /回答语言：简体中文/);
  assert.deepEqual(en.input, zh.input); assert.equal(paper.summary, '我的中文导读');
});

test('UI translation preserves placeholder data and supports switching generated status messages back', () => {
  const { translate, message } = createTranslator(english);
  assert.equal(translate('en', '实验进程'), 'Experiments');
  assert.equal(translate('zh-CN', '实验进程'), '实验进程');
  assert.equal(translate('en', '查看实验：{0}', '中文实验名 {1}'), 'View experiment: 中文实验名 {1}');
  assert.equal(message('en', "Error invoking remote method 'x': Error: 未找到这篇文献。"), 'Paper not found.');
  assert.equal(message('en', '已保存 3 张图片'), 'Saved 3 images');
  assert.equal(message('zh-CN', 'Saved 3 images'), '已保存 3 张图片');
  for (const [key, value] of Object.entries(english)) assert.deepEqual((key.match(/\{\d+\}/g) || []).sort(), (value.match(/\{\d+\}/g) || []).sort(), 'Translation placeholders: ' + key);
});
