const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateSettings, nextSettings } = require('../electron/ai-settings.cjs');

test('upgrading an old model choice pins GPT-6, defaults to medium and preserves the connection', () => {
  const old = { provider: 'codex', model: 'gpt-5.3-codex-spark', encryptedKey: 'existing-encrypted-value' };
  assert.deepEqual(migrateSettings(old), { ...old, model: 'gpt-6-astra', effort: 'medium' });
  assert.equal(migrateSettings({ provider: 'codex', effort: 'ultra' }).effort, 'ultra');
});
test('effort saves retain GPT-6 and credentials, rejecting unavailable tiers and other models', () => {
  const current = migrateSettings({ encryptedKey: 'encrypted-placeholder' });
  const codex = { connected: true, models: [{ id: 'gpt-6-astra', efforts: ['low', 'medium', 'high'] }] };
  const updated = nextSettings(current, { provider: 'codex', effort: 'low' }, codex);
  assert.equal(updated.model, 'gpt-6-astra'); assert.equal(updated.effort, 'low');
  assert.equal(updated.encryptedKey, current.encryptedKey);
  assert.throws(() => nextSettings(current, { provider: 'codex', effort: 'ultra' }, codex), /不支持/);
  assert.throws(() => nextSettings(current, { provider: 'codex', effort: 'high', model: 'gpt-5.5' }, codex), /固定使用/);
});
test('API mode accepts only its documented GPT-6 effort list, without changing provider implicitly', () => {
  const current = migrateSettings();
  assert.equal(nextSettings(current, { provider: 'api', effort: 'max' }).effort, 'max');
  assert.throws(() => nextSettings(current, { provider: 'api', effort: 'ultra' }), /不支持/);
  assert.equal(current.provider, 'codex');
});
