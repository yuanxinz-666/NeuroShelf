const model = require('../data/ai-model.json');
const providers = ['codex', 'api', 'clipboard'];
const validEffort = effort => typeof effort === 'string' && Object.hasOwn(model.effortLabels, effort);

function migrateSettings(saved = {}) {
  const provider = providers.includes(saved.provider) ? saved.provider : 'codex';
  const effort = validEffort(saved.effort) && (provider !== 'api' || model.apiEfforts.includes(saved.effort)) ? saved.effort : model.defaultEffort;
  return { ...saved, provider, model: model.id, effort, encryptedKey: saved.encryptedKey || null };
}

function nextSettings(current, value, codex) {
  if (!value || !providers.includes(value.provider)) throw new Error('请选择 AI 连接方式。');
  if (value.model !== undefined && value.model !== model.id) throw new Error('阅读助手固定使用 GPT-6 Astra，只需选择推理强度。');
  if (!validEffort(value.effort)) throw new Error('请选择有效的 GPT-6 推理强度。');
  const supported = value.provider === 'api' ? model.apiEfforts : codex?.connected ? codex.models?.find(item => item.id === model.id)?.efforts || [] : null;
  if (value.provider !== 'clipboard' && supported && !supported.includes(value.effort)) throw new Error('当前连接不支持这个 GPT-6 推理档位，请选择列表中的可用档位。');
  return { ...current, provider: value.provider, model: model.id, effort: value.effort };
}

module.exports = { migrateSettings, nextSettings };
