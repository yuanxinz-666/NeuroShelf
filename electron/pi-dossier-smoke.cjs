const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog } = require('electron');
const { piFixture } = require('./pi-smoke-fixture.cjs');
async function runPiDossierSmoke({ win, context, waitFor }) {
  const run = code => win.webContents.executeJavaScript(code), person = context.store.get().people.profiles[0], fixture = piFixture(person);
  await context.store.ingestDossiers([fixture.packet]);
  // Real follow actions also refresh the PI state returned through the desktop bridge.
  await run(`document.querySelector('.pi-card-top > button').click()`);
  await waitFor(`!document.querySelector('.pi-card-top > button').textContent.includes('已关注')`);
  await run(`document.querySelector('.pi-card-top > button').click()`);
  await waitFor(`document.querySelector('.pi-card-top > button').textContent.includes('已关注')`);
  await run(`document.querySelector('.pi-name-button').click()`);
  await waitFor(`Boolean(document.querySelector('.pi-detail .career-timeline'))`);
  assert.equal(await run(`document.querySelector('.dossier-overview strong')?.textContent`), 'research profile');
  await run(`document.querySelectorAll('.dossier-tabs button')[1].click()`);
  await waitFor(`document.querySelectorAll('.year-bar').length === 10`);
  assert.equal(await run(`document.querySelector('.pi-stat-grid > div b').textContent`), '4篇');
  assert.equal(await run(`document.querySelectorAll('.pi-stat-grid > button')[0].querySelector('b').textContent`), '2篇');
  assert.match(await run(`document.querySelectorAll('.pi-stat-grid > button')[1].textContent`), /待匹配/);
  await run(`document.querySelector('.year-bar[aria-label^="2020 年"]').click()`);
  await waitFor(`document.querySelectorAll('.dossier-paper-list article').length === 1`);
  assert.equal(await run(`document.querySelector('.paper-title-link').textContent`), 'Test nature');
  await run(`document.querySelector('.year-bar[aria-label^="2020 年"]').click(); Array.from(document.querySelectorAll('.keyword-cloud button')).find(b=>b.textContent.startsWith('Superior colliculus')).click()`);
  await waitFor(`document.querySelectorAll('.dossier-paper-list article').length === 3`);
  await run(`document.querySelector('.dossier-paper-search input').focus();document.querySelector('.keyword-cloud button.selected').click()`);
  const file = path.join(context.directory, 'rank-fixture.csv');
  await fs.writeFile(file, 'system,year,issn,journal,category,quartile,scie,source\ncas,2025,0028-0836,Nature,综合,1,true,https://example.org/ranking\n');
  const originalDialog = dialog.showOpenDialog;
  try {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    await run(`document.querySelector('.ranking-settings summary').click();document.querySelector('.ranking-controls .button').click()`);
    await waitFor(`document.querySelectorAll('.pi-stat-grid > button')[1].querySelector('b').textContent === '1篇'`);
    assert.equal(context.store.get().people.rankings.length, 1);
  } finally { dialog.showOpenDialog = originalDialog; }
  await fs.writeFile(path.join(context.directory, 'pi-publications-smoke.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelectorAll('.dossier-tabs button')[2].click()`);
  await waitFor(`document.querySelectorAll('.graph-node').length === 2`);
  await run(`document.querySelector('.graph-node[aria-label*="Test Trainee"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  await waitFor(`document.querySelector('.relation-evidence')?.textContent.includes('Destination University')`);
  assert.equal(await run(`document.querySelectorAll('.alumni-table tbody tr').length`), 1);
  await run(`document.querySelectorAll('.graph-switch button')[1].click()`);
  await waitFor(`document.querySelectorAll('.graph-node').length === 1`);
  await run(`document.querySelector('.graph-node').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  await waitFor(`document.querySelectorAll('.paper-evidence-link').length === 4`);
  await run(`document.querySelectorAll('.dossier-tabs button')[3].click()`);
  await waitFor(`document.querySelector('.funding-card')?.textContent.includes('TEST-123')`);
  assert.match(await run(`document.querySelector('.funding-card-top b').textContent`), /已结束/);
  assert.equal(await run(`document.documentElement.scrollWidth <= innerWidth + 1`), true);
  await run(`document.querySelector('.back-to-people').click()`);
  await waitFor(`document.querySelectorAll('.pi-card').length === 12`);
  assert.equal(context.store.get().people.profiles[0].followed, true);
  console.log('PI_DOSSIERS_OK: click-through, rich overview, ten annual bars, CNS separation, year/keyword filters, real CSV import, evidence graph, alumni destinations, funding and follow persistence.');
}
module.exports = { runPiDossierSmoke };
