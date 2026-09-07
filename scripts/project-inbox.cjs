// Read project research context and publish immutable packets. Never write a live library here.
const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveRoot } = require('../electron/projects.cjs');
const { validateBatch, publishBatch, samePaper } = require('../electron/weekly.cjs');
const { validatePeopleBatch, publishPeople } = require('../electron/people.cjs');
const { validateDossierBatch, publishDossier, addDossiers } = require('../electron/pi-dossier.cjs');
const userData = process.env.NEUROSHELF_DATA_DIR || path.join(process.env.APPDATA, 'NeuroShelf');
async function list() {
  const root = await resolveRoot(userData), index = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8'));
  if (index.format !== 'neuroshelf-projects' || !Array.isArray(index.projects)) throw new Error('Invalid project index');
  const projects = [];
  for (const entry of index.projects) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(entry.folder)) throw new Error('Invalid project folder');
    const directory = path.join(root, entry.folder), project = JSON.parse(await fs.readFile(path.join(directory, 'project.json'), 'utf8'));
    if (entry.id !== project.id) throw new Error('Project identity mismatch');
    projects.push({ ...project, directory });
  }
  return { root, activeId: index.activeId, projects };
}
async function context(project) {
  const library = JSON.parse(await fs.readFile(path.join(project.directory, 'library/library.json'), 'utf8'));
  if (library.projectId !== project.id) throw new Error('Library belongs to a different project');
  const candidates = [...library.weekly?.candidates || []], batches = [...library.weekly?.batches || []], people = structuredClone(library.people || { profiles: [], events: [], batches: [] });
  const inbox = path.join(project.directory, 'inbox/papers'), peopleInbox = path.join(project.directory, 'inbox/people');
  for (const file of (await fs.readdir(inbox)).filter(f => /^week-.*\.json$/.test(f))) {
    const b = validateBatch(JSON.parse(await fs.readFile(path.join(inbox, file), 'utf8')));
    if (b.projectId !== project.id && !(project.id === 'sc-snr' && !b.projectId)) throw new Error('Wrong-project packet: ' + file);
    if (!batches.some(old => old.id === b.id)) batches.push(b);
    for (const c of b.candidates) if (!candidates.some(old => samePaper(old, c))) candidates.push(c);
  }
  for (const file of (await fs.readdir(peopleInbox)).filter(f => /^people-.*\.json$/.test(f))) {
    const b = validatePeopleBatch(JSON.parse(await fs.readFile(path.join(peopleInbox, file), 'utf8')));
    if (b.projectId !== project.id) throw new Error('Wrong-project PI packet: ' + file);
    if (!people.batches.some(old => old.id === b.id)) people.batches.push({ id: b.id, checkedOn: b.checkedOn, summary: b.summary });
    for (const p of b.profiles) if (!people.profiles.some(old => old.id === p.id)) people.profiles.push({ ...p, followed: false });
    for (const e of b.events) if (!people.events.some(old => old.id === e.id)) people.events.push(e);
  }
  const identity = p => ({ title: p.title, doi: p.doi || '', pmid: p.pmid || '', url: p.url || '', status: p.status });
  for (const file of (await fs.readdir(peopleInbox)).filter(f => /^dossier-[a-f0-9]{24}\.json$/.test(f))) {
    const b = validateDossierBatch(JSON.parse(await fs.readFile(path.join(peopleInbox, file), 'utf8')));
    if (b.id + '.json' !== file) throw new Error('Invalid PI dossier packet: ' + file);
    addDossiers({ projectId: project.id, people }, b);
  }
  return { project, libraryCount: library.papers.length, pdfCount: library.papers.filter(p => p.pdf).length,
    modules: [...new Set(library.papers.map(p => p.module))], papers: library.papers.map(identity), candidates: candidates.map(identity),
    batches: batches.map(b => ({ id: b.id, weekOf: b.weekOf, kind: b.kind || 'weekly', screenedAt: b.screenedAt, status: b.status })),
    people: { profiles: people.profiles.map(({ note, dossier, bibliography, ...p }) => ({ ...p, ...(dossier ? { dossier: { checkedOn: dossier.checkedOn, scope: dossier.scope, funding: dossier.funding, relationships: dossier.relationships } } : {}), ...(bibliography ? { bibliography: { checkedOn: bibliography.checkedOn, fromYear: bibliography.fromYear, toDate: bibliography.toDate, recordCount: bibliography.works.length, complete: bibliography.complete } } : {}) })), events: people.events, batches: people.batches }, inbox, peopleInbox };
}
async function main(args = process.argv.slice(2)) {
  const [command, id, file] = args;
  const registry = await list();
  if (command === 'list') { console.log(JSON.stringify(registry, null, 2)); return; }
  const project = registry.projects.find(p => p.id === id); if (!project) throw new Error('Choose a project ID from: node scripts/project-inbox.cjs list');
  if (command === 'context') { console.log(JSON.stringify(await context(project), null, 2)); return; }
  if (!['validate-papers', 'publish-papers', 'validate-people', 'publish-people', 'validate-dossiers', 'publish-dossiers'].includes(command) || !file) throw new Error('Usage: project-inbox.cjs list | context <id> | validate-papers/publish-papers/validate-people/publish-people/validate-dossiers/publish-dossiers <id> <file.json>');
  const raw = JSON.parse((await fs.readFile(path.resolve(file), 'utf8')).replace(/^\uFEFF/, ''));
  if (raw.projectId !== id) throw new Error('Packet projectId must exactly match the destination project');
  const isPeople = command.endsWith('people'), isDossier = command.endsWith('dossiers'), batch = isDossier ? validateDossierBatch(raw) : isPeople ? validatePeopleBatch(raw) : validateBatch(raw);
  if (command.startsWith('validate')) { console.log(JSON.stringify({ valid: true, id: batch.id, projectId: id })); return; }
  const result = isDossier ? await publishDossier(path.join(project.directory, 'inbox/people'), batch) : isPeople ? await publishPeople(path.join(project.directory, 'inbox/people'), batch) : await publishBatch(path.join(project.directory, 'inbox/papers'), batch);
  console.log(JSON.stringify({ published: true, projectId: id, ...result }, null, 2));
}
module.exports = { list, context, main };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
