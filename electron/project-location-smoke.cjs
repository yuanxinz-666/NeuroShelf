const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog } = require('electron');
const { LibraryStore } = require('./store.cjs');
const { piFixture } = require('./pi-smoke-fixture.cjs');
async function runProjectLocationSmoke({ win, projects, directory, waitFor }) {
  const run = code => win.webContents.executeJavaScript(code), originalRoot = projects.root;
  const selectedRoot = path.join(directory, 'existing-research');
  await fs.cp(originalRoot, selectedRoot, { recursive: true });
  const saved = new LibraryStore(path.join(selectedRoot, 'SC-SNr/library')); await saved.init();
  const person = saved.get().people.profiles[0];
  await saved.updatePerson(person.id, { followed: true, note: 'Retained PI follow' });
  await saved.ingestDossiers([piFixture(person).packet]);
  await saved.ingestPeople([{ ...require('../data/sc-snr-people.json'), summary: 'Existing project test record', events: [], profiles: [{ ...person, name: 'Existing Project PI', website: 'https://example.org/existing-project-pi' }] }]);
  const original = JSON.stringify(projects.get().store.get());
  const preferences = await run('window.neuroshelf.preferences()');
  const nativeDialog = dialog.showOpenDialog;
  async function choose(root) {
    await waitFor(`Boolean([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Backup & transfer'))`);
    await run(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Backup & transfer').click()`);
    await waitFor(`Boolean(document.querySelector('dialog[open] .project-location button'))`);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
    await run(`document.querySelector('dialog[open] .project-location button').click()`);
    await waitFor(`!document.querySelector('dialog[open]') && Boolean(document.querySelector('input[aria-label="Search library"]')) && window.neuroshelf.projects().then(p => p.root === ${JSON.stringify(root)})`);
  }
  try {
    await choose(selectedRoot);
    await run(`document.querySelector('.nav-item[title="PIs & labs"]').click()`);
    await waitFor(`document.querySelector('.people-overview')?.innerText.includes('13')`);
    await run(`document.querySelector('.people-controls input[type="checkbox"]').click()`);
    assert.equal(await run(`document.querySelectorAll('.pi-name-button').length`), 1);
    assert.equal(await run(`document.querySelector('.pi-name-button').textContent`), person.name);
    await run(`document.querySelector('.pi-name-button').click()`);
    await waitFor(`document.body.innerText.includes('Test research profile')`);
    assert.equal((await run('window.neuroshelf.load()')).people.profiles.find(p => p.id === person.id).bibliography.works.length, 6);
    await win.reload();
    await waitFor(`Boolean(document.querySelector('input[aria-label="Search library"]'))`);
    assert.equal((await run('window.neuroshelf.projects()')).root, selectedRoot);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'projects-location.json'), 'utf8')).directory, selectedRoot);
    assert.deepEqual(await run('window.neuroshelf.preferences()'), preferences);
    await choose(originalRoot);
    assert.equal(JSON.stringify(await run('window.neuroshelf.load()')), original);
  } finally { dialog.showOpenDialog = nativeDialog; }
  console.log('PROJECT_LOCATION_OK: native folder choice remembers existing PIs, follows, rich profiles and bibliography; prior library and languages retained.');
  return { projectLocation: true };
}
module.exports = { runProjectLocationSmoke };
