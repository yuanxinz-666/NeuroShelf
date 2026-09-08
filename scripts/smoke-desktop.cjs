const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { fixturePdf } = require('../tests/fixture.cjs');
const binary = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('node_modules/electron/dist/electron.exe');
const args = process.argv[2] ? ['--smoke-test'] : ['.', '--smoke-test'];
const dataDir = path.resolve('.test-data', (process.argv[2] ? 'packaged-smoke-' : 'electron-smoke-') + Date.now());
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ provider: 'codex', model: 'gpt-5.3-codex-spark', encryptedKey: null }));
const fixturePath = path.join(dataDir, 'reader-verification.pdf');
fs.writeFileSync(fixturePath, fixturePdf());
const env = { ...process.env, NEUROSHELF_DATA_DIR: dataDir, NEUROSHELF_SMOKE_PDF: fixturePath };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(binary, args, { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', errors = '';
child.stdout.on('data', value => { output += value; });
child.stderr.on('data', value => { errors += value; });
console.log('Testing executable: ' + binary + '\nIsolated data: ' + dataDir);
const timer = setTimeout(() => { child.kill(); console.error('Desktop smoke test timed out'); process.exitCode = 1; }, 120000);
child.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
child.on('exit', code => {
  clearTimeout(timer); console.log(output.trim());
  if (code !== 0 || !fs.existsSync(path.join(dataDir, 'smoke-result.json'))) { console.error(errors.slice(-8000)); const failure = path.join(dataDir, 'smoke-error.txt'); if (fs.existsSync(failure)) console.error(fs.readFileSync(failure, 'utf8')); process.exitCode = 1; return; }
  const report = JSON.parse(fs.readFileSync(path.join(dataDir, 'smoke-result.json'), 'utf8'));
  if (!report.continuousReading || !report.hoverAi) { console.error('Continuous reading or right-edge AI hover failed'); process.exitCode = 1; return; }
  if (!report.focusReading || !report.workspaceShortcuts) { console.error('Focus reading or workspace shortcuts failed'); process.exitCode = 1; return; }
  if (!report.adjustableSidebars || !report.experimentProgress) { console.error('Resizable sidebars or inline experiment progress failed'); process.exitCode = 1; return; }
  if (!report.projectLocation) { console.error('Existing project folder, PI follows or detailed profiles did not survive the switch'); process.exitCode = 1; return; }
  if (!report.languages) { console.error('Language defaults, switching or persistence failed'); process.exitCode = 1; return; }
  if (!report.experiments) { console.error('Experiment workflows failed'); process.exitCode = 1; return; }
  if (!report.personalReviews) { console.error('Personal review workflows failed'); process.exitCode = 1; return; }
  if (!report.piDossiers) { console.error('PI dossier workflows failed'); process.exitCode = 1; return; }
  if (!report.researchProgress) { console.error('Research progress and cancellation validation failed'); process.exitCode = 1; return; }
  if (!report.projects || !report.people) { console.error('Project and PI workflows failed'); process.exitCode = 1; return; }
  if (!report.weeklyInbox) { console.error('Weekly candidate workflow validation failed'); process.exitCode = 1; return; }
  if (!report.bridge || report.papers !== 107 || !report.pdfRendered || !report.clipboard || !report.shortcut || !report.membership || !report.reasoningEffort || report.effortSelection !== 'xhigh' || !report.annotations || !report.resizeSidebar || !report.readerPersistence || report.modelSelection !== 'gpt-6-astra') { console.error('Packaged rendering, clipboard, shortcut or membership validation failed'); process.exitCode = 1; return; }
  console.log('PACKAGED_ARTIFACTS_OK: bridge, 107 papers, PDF rendering, clipboard, Space shortcut, membership, fixed GPT-6 and reasoning effort.');
  const library = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects/SC-SNr/library/library.json'), 'utf8'));
  if (!library.experiments?.nodes.some(n => n.progress === 'Progress close flush sentinel')) { console.error('Close flush did not persist the latest inline experiment progress'); process.exitCode = 1; return; }
  if (!library.experiments?.nodes.some(n => n.record === 'Experiment close flush sentinel')) { console.error('Close flush did not persist the latest experiment record'); process.exitCode = 1; return; }
  if (!library.papers.some(p => p.title === 'reader-verification' && p.note === 'Desktop close flush sentinel')) { console.error('Close flush did not persist the latest note'); process.exitCode = 1; return; }
  if (!library.papers.some(p => p.title === 'reader-verification' && p.highlights.some(h => h.comment === 'Annotation close flush sentinel'))) { console.error('Close flush did not persist the latest annotation'); process.exitCode = 1; return; }
  if (!library.papers.some(p => p.title === 'reader-verification' && p.personalReview === 'Personal review close flush sentinel')) { console.error('Close flush did not persist the latest personal review'); process.exitCode = 1; return; }
  console.log('CLOSE_FLUSH_OK: personal review, paper note and annotation retain their last keystroke on immediate close.');
  console.log('Desktop screenshot: ' + path.join(dataDir, 'desktop-smoke.png'));
  console.log('Reader screenshot: ' + path.join(dataDir, 'desktop-reader.png'));
  console.log('Personal review screenshot: ' + path.join(dataDir, 'desktop-paper-reviews.png'));
});
