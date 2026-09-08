const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ProjectManager, atomicJson } = require('../electron/projects.cjs');
const { piFixture } = require('../electron/pi-smoke-fixture.cjs');
const seed = path.resolve('data/library.json'), baseline = require('../data/sc-snr-people.json');
async function setup() {
  const directory = await fs.mkdtemp(path.resolve('.test-data/project-location-'));
  const userData = path.join(directory, 'profile'), manager = new ProjectManager({ userData, seedPath: seed });
  await manager.init(); await manager.rememberRoot();
  return { directory, userData, manager };
}
test('app-owned project location retains followed PIs, profiles and bibliography across a fresh launch', async () => {
  const { directory, userData, manager } = await setup();
  const other = new ProjectManager({ userData, seedPath: seed, root: path.join(directory, 'existing-research') }); await other.init();
  const store = other.get().store; await store.ingestPeople([baseline]);
  const person = store.get().people.profiles[0]; await store.updatePerson(person.id, { followed: true, note: 'My retained PI note' });
  await store.ingestDossiers([piFixture(person).packet]);
  const original = manager.get().store.get();
  await fs.writeFile(path.join(userData, 'preferences.json'), JSON.stringify({ locale: 'zh-CN', answerLanguage: 'en' }));
  const selected = await manager.prepareExistingRoot(other.root); await selected.rememberRoot();
  const restarted = new ProjectManager({ userData, seedPath: seed }); await restarted.init();
  assert.equal(restarted.root, other.root);
  assert.deepEqual(restarted.get().store.get().people, store.get().people);
  assert.deepEqual(manager.get().store.get(), original);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(userData, 'preferences.json'), 'utf8')), { locale: 'zh-CN', answerLanguage: 'en' });
});
test('an unavailable remembered folder fails without creating a replacement sample library', async () => {
  const { directory, userData, manager } = await setup();
  const missing = path.join(directory, 'disconnected-drive');
  await atomicJson(path.join(userData, 'projects-location.json'), { directory: missing });
  const bytes = await fs.readFile(manager.get().store.file);
  await assert.rejects(new ProjectManager({ userData, seedPath: seed }).init(), /无法读取/);
  await assert.rejects(fs.stat(missing), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(manager.get().store.file), bytes);
  assert.equal(JSON.parse(await fs.readFile(path.join(userData, 'projects-location.json'), 'utf8')).directory, missing);
});
test('invalid or incomplete selected folders keep the previous remembered library intact', async () => {
  const { directory, userData, manager } = await setup();
  const pointer = await fs.readFile(path.join(userData, 'projects-location.json'));
  await assert.rejects(manager.prepareExistingRoot(path.join(directory, 'empty')), /index.json/);
  await assert.rejects(fs.stat(path.join(directory, 'empty')), { code: 'ENOENT' });
  const other = new ProjectManager({ userData, seedPath: seed, root: path.join(directory, 'incomplete') }); await other.init();
  const extra = await other.create({ name: 'Another project', question: 'Another question' });
  await fs.unlink(path.join(other.get(extra.id).directory, 'library/library.json'));
  await assert.rejects(manager.prepareExistingRoot(other.root));
  assert.deepEqual(await fs.readFile(path.join(userData, 'projects-location.json')), pointer);
  assert.equal(manager.get().store.get().papers.length, 107);
});
