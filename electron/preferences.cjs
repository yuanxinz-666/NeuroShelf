const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { renameWithRetry } = require('./files.cjs');
const locales = ['en', 'zh-CN'];
const answerLanguages = ['auto', ...locales];
const defaults = () => ({ locale: 'en', answerLanguage: 'auto' });
function normalize(value = {}) {
  return { locale: locales.includes(value?.locale) ? value.locale : 'en', answerLanguage: answerLanguages.includes(value?.answerLanguage) ? value.answerLanguage : 'auto' };
}
function responseLanguage(preferences, override) {
  if (override !== undefined && !locales.includes(override)) throw new Error('请选择有效的回答语言。');
  const value = normalize(preferences);
  return override || (value.answerLanguage === 'auto' ? value.locale : value.answerLanguage);
}
class Preferences {
  constructor(directory) { this.file = path.join(directory, 'preferences.json'); this.value = defaults(); this.queue = Promise.resolve(); }
  async init() {
    try { this.value = normalize(JSON.parse(await fs.readFile(this.file, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('语言设置无法读取，请检查 preferences.json。'); }
    return this.get();
  }
  get() { return { ...this.value }; }
  update(patch) {
    const work = this.queue.then(async () => {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['locale', 'answerLanguage'].includes(key)) || ('locale' in patch && !locales.includes(patch.locale)) || ('answerLanguage' in patch && !answerLanguages.includes(patch.answerLanguage))) throw new Error('请选择有效的界面与回答语言。');
      const next = { ...this.value, ...patch }, temporary = this.file + '.' + crypto.randomUUID() + '.tmp';
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      try { await fs.writeFile(temporary, JSON.stringify(next, null, 2), 'utf8'); await renameWithRetry(temporary, this.file); }
      catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
      this.value = next; return this.get();
    });
    this.queue = work.catch(() => {}); return work;
  }
}
module.exports = { Preferences, defaults, normalize, responseLanguage };
