const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ProjectManager } = require('../electron/projects.cjs');
const { validateDossier, validateDossierBatch, publishDossier } = require('../electron/pi-dossier.cjs');
const { syncPeople } = require('../electron/people.cjs');
const { piFixture } = require('../electron/pi-smoke-fixture.cjs');
const { authorMatch, parseWork, fetchBibliography, identityFor } = require('../electron/pi-bibliography.cjs');
const { parseRankings, validateRankings } = require('../electron/journal-rankings.cjs');
const { ResearchJobs } = require('../electron/research.cjs');
const { researchDossier } = require('../electron/pi-research.cjs');
const { renameWithRetry } = require('../electron/files.cjs');
const ranks = [{ system: 'cas', year: 2025, issn: '0028-0836', journal: 'Nature', category: '综合性期刊', quartile: 1, scie: true, source: 'https://example.org/ranking' }];
async function setup() { await fs.mkdir(path.resolve('.test-data'), { recursive: true }); const userData = await fs.mkdtemp(path.resolve('.test-data/pi-dossier-')); const manager = new ProjectManager({ userData, seedPath: path.resolve('data/library.json') }); await manager.init(); const context = manager.get(); await context.store.ingestPeople([require('../data/sc-snr-people.json')]); const person = context.store.get().people.profiles[0]; return { context, manager, person, ...piFixture(person) }; }

test('dossier sync is idempotent, preserves user data and rejects wrong projects or unknown PIs atomically', async () => {
  const h = await setup(), before = h.context.store.get().papers;
  await h.context.store.updatePerson(h.person.id, { followed: true, note: 'My PI note' });
  const dir = path.join(h.context.directory, 'inbox/people');
  const published = await publishDossier(dir, h.packet); assert.deepEqual(await publishDossier(dir, h.packet), published);
  assert.equal((await syncPeople(h.context.store, dir)).errors.length, 0); await syncPeople(h.context.store, dir);
  const person = h.context.store.get().people.profiles[0]; assert.deepEqual(person.dossier, h.dossier); assert.deepEqual(person.bibliography, h.bibliography); assert.equal(person.followed, true); assert.equal(person.note, 'My PI note'); assert.deepEqual(h.context.store.get().papers, before);
  const snapshot = h.context.store.get();
  await assert.rejects(h.context.store.ingestDossiers([{ ...h.packet, projectId: 'other-project' }]), /另一个项目/);
  await assert.rejects(h.context.store.ingestDossiers([{ ...h.packet, entries: [{ website: h.person.website, dossier: { ...h.dossier, overview: 'Must not leak' } }, { website: 'https://example.org/unknown', dossier: h.dossier }] }]), /先添加/);
  assert.deepEqual(h.context.store.get(), snapshot);
  assert.throws(() => validateDossier({ ...h.dossier, funding: [{ ...h.dossier.funding[0], start: '2020' }] }), /日期/);
  assert.throws(() => validateDossier({ ...h.dossier, sources: [] }), /来源/);
  assert.throws(() => validateDossierBatch({ ...h.packet, entries: [{ website: 'https://user:pass@example.org', dossier: h.dossier }] }));
});

test('backup restores PI sections and rankings independently of older profile metadata', async () => {
  const h = await setup(); await h.context.store.ingestDossiers([h.packet]); await h.context.store.importRankings(ranks);
  const backup = await h.context.store.backup(path.join(h.context.directory, 'backups'));
  const newer = { ...h.dossier, checkedOn: '2026-09-08', overview: 'New checked information' };
  await h.context.store.ingestDossiers([{ ...h.packet, entries: [{ website: h.person.website, dossier: newer }] }]);
  await h.context.store.updatePerson(h.person.id, { followed: true, note: 'Keep after restore' });
  await h.context.store.restore(path.join(backup, 'library.json'));
  const p = h.context.store.get().people.profiles[0]; assert.equal(p.dossier.overview, newer.overview); assert.deepEqual(p.bibliography, h.bibliography); assert.equal(p.note, 'Keep after restore'); assert.equal(p.followed, true); assert.equal(h.context.store.get().people.rankings.length, 1);
});

test('author identity rejects same-initial names and another author affiliation cannot verify the PI', () => {
  const identity = { names: ['Massimo Scanziani'], affiliations: ['University of California'], orcid: '' };
  const a = { firstName: 'Massimo', lastName: 'Scanziani', authorAffiliationDetailsList: { authorAffiliation: [{ affiliation: 'University of California, San Francisco' }] } };
  assert.equal(authorMatch(a, identity), 'affiliation'); assert.equal(authorMatch({ ...a, firstName: 'Margherita' }, identity), null);
  assert.equal(authorMatch({ ...a, firstName: 'M' }, identity), 'initials'); assert.equal(authorMatch({ ...a, authorAffiliationDetailsList: {} }, identity), 'name');
  const raw = { id: '1', source: 'MED', title: 'Study', firstPublicationDate: '2025-01-01', authorList: { author: [{ firstName: 'Other', lastName: 'Author', ...{ authorAffiliationDetailsList: a.authorAffiliationDetailsList } }, { ...a, authorAffiliationDetailsList: {} }] }, pubTypeList: { pubType: ['Journal Article'] } };
  assert.equal(parseWork(raw, identity).match, 'name'); assert.equal(parseWork(raw, identity).authorPosition, 'last');
});

test('database pagination, ten-year bounds and preprints are explicit', async () => {
  let calls = 0; const person = { name: 'Test Researcher', institution: 'Test University' };
  const raw = id => ({ id, source: 'MED', title: 'Record ' + id, doi: '10.0000/' + id, firstPublicationDate: '2024-01-01', authorList: { author: [{ firstName: 'Test', lastName: 'Researcher', authorAffiliationDetailsList: { authorAffiliation: [{ affiliation: 'Test University' }] } }] }, pubTypeList: { pubType: ['Journal Article'] } });
  const pages = [{ hitCount: 3, nextCursorMark: 'next', resultList: { result: [raw('1'), { ...raw('2'), source: 'PPR' }] } }, { hitCount: 3, resultList: { result: [{ ...raw('3'), firstPublicationDate: '2016-12-31' }] } }];
  const options = { now: new Date('2026-09-07'), get: async url => { assert.match(decodeURIComponent(url), /2017-01-01 TO 2026-09-07/); return { bytes: Buffer.from(JSON.stringify(pages[calls++])) }; } };
  const b = await fetchBibliography(person, options); assert.equal(b.complete, true); assert.equal(b.works.length, 2); assert.equal(b.excluded, 1); assert.equal(b.works.filter(w => w.kind === 'preprint').length, 1);
  calls = 0; assert.equal((await fetchBibliography(person, { ...options, maxPages: 1 })).complete, false);
});

test('domestic PI identities distinguish same-name authors even within the same university or institute', () => {
  const examples = [
    ['Peng Cao', 'National Institute of Biological Sciences, Beijing, China.', 'National Laboratory of Biomacromolecules, Institute of Biophysics, Chinese Academy of Sciences.'],
    ['Yu Gu', 'State Key Laboratory of Medical Neurobiology, Institutes of Brain Science, Fudan University.', 'Department of Radiation Oncology, Shanghai Cancer Center, Fudan University.'],
    ['Feng Wang', 'Brain Cognition and Brain Disease Institute, Shenzhen Institutes of Advanced Technology.', 'Institute of Technology for Carbon Neutrality, Shenzhen Institute of Advanced Technology.'],
    ['Liping Wang', 'Shenzhen Key Laboratory of Neuropsychiatric Modulation, Shenzhen Institutes of Advanced Technology.', 'Institute of Neuroscience, Chinese Academy of Sciences, Shanghai.'],
  ];
  for (const [name, own, other] of examples) {
    const [firstName, lastName] = name.split(' '), identity = identityFor({ name, institution: 'Fallback must not be used' });
    const author = affiliation => ({ firstName, lastName, authorAffiliationDetailsList: { authorAffiliation: [{ affiliation }] } });
    assert.equal(authorMatch(author(own), identity), 'affiliation', name);
    assert.equal(authorMatch(author(other), identity), 'name', name + ' same-name record must stay outside default statistics');
  }
  const cao = identityFor({ name: 'Peng Cao', institution: 'NIBS' });
  assert.equal(authorMatch({ firstName: 'Peng', lastName: 'Cao', authorId: { type: 'ORCID', value: '0000-0001-7739-6857' } }, cao), 'orcid');
});

test('metrics exclude subjournals, uncertainty, preprints, duplicates and out-of-window records; unknown rankings stay unknown', async () => {
  const { eligibleWorks, summarize, cnsJournal, keywords, coauthors, fundingLabel } = await import('../src/pi-metrics.mjs');
  const h = piFixture(); h.bibliography.works.push(h.work('duplicate', { doi: '10.0000/nature' }), h.work('old', { publishedDate: '2016-01-01' }));
  const works = eligibleWorks(h.bibliography), data = summarize(works, h.bibliography);
  assert.equal(data.total, 4); assert.equal(data.cnsTotal, 2); assert.equal(data.q1, null); assert.equal(data.years.length, 10);
  assert.equal(cnsJournal({ journal: 'Science Advances', issns: [] }), ''); assert.equal(cnsJournal({ journal: 'Science (New York, N.Y.)', issns: [] }), 'Science');
  assert.equal(eligibleWorks(h.bibliography, { uncertain: true }).length, 5); assert.equal(eligibleWorks(h.bibliography, { kind: 'review' }).length, 1);
  const classified = summarize(works, h.bibliography, validateRankings(ranks), 'cas', 2025); assert.equal(classified.q1, 1); assert.equal(classified.unknown, 3);
  assert.equal(summarize(works, h.bibliography, validateRankings([{ ...ranks[0], scie: false }]), 'cas', 2025).q1, 0);
  assert.equal(keywords(works).find(t => t.term === 'Superior colliculus').count, 3); assert.ok(!keywords(works).some(t => t.term === 'Animals'));
  assert.equal(coauthors(works)[0].papers.length, 4); assert.equal(coauthors(works).some(p => p.name === 'Test Researcher'), false);
  assert.match(fundingLabel({ ...h.dossier.funding[0], status: 'active' }, '2026-09-07'), /已结束/);
});

test('ranking imports require version, SCIE evidence and conflict-free journal categories', () => {
  const csv = '\uFEFFsystem,year,issn,journal,category,quartile,scie,source\ncas,2025,0028-0836,"Nature, journal",综合,Q1,true,https://example.org/rank\n';
  assert.equal(parseRankings(csv, true)[0].journal, 'Nature, journal');
  assert.throws(() => validateRankings([{ ...ranks[0], scie: '' }]), /scie/);
  assert.throws(() => validateRankings([ranks[0], { ...ranks[0], quartile: 2 }]), /冲突/);
  assert.throws(() => parseRankings('{"rows":[]}', false), /格式/);
});

test('failed dossier research keeps saved bibliography, previous dossier and raw source report', async () => {
  const h = await setup(); await h.context.store.ingestDossiers([h.packet]);
  const jobs = new ResearchJobs({ bibliographyFetcher: async () => ({ ...h.bibliography, checkedOn: '2026-09-08' }), readerFactory: () => ({ close() {}, async explain(args) { args.onSearch({ type: 'webSearch' }); return JSON.stringify({ ...h.dossier, methods: ['x'.repeat(151)] }); } }) });
  jobs.start(h.context, 'dossier', 'medium', { piId: h.person.id }); await jobs.jobs.get('sc-snr').promise;
  const status = await jobs.state(h.context); assert.equal(status.status, 'failed'); assert.match(status.message, /论文数据已保存/);
  assert.equal(h.context.store.get().people.profiles[0].bibliography.checkedOn, '2026-09-08'); assert.deepEqual(h.context.store.get().people.profiles[0].dossier, h.dossier);
  const saved = JSON.parse(await fs.readFile(path.join(h.context.directory, 'reports', 'dossier-raw-' + status.id + '.json'), 'utf8')); assert.equal(saved.searchLog.length, 1);
  await jobs.close();
});

test('dossier research refuses unsourced answers and successful refresh publishes both sections', async () => {
  const h = await setup();
  await assert.rejects(researchDossier({ reader: { explain: async () => JSON.stringify(h.dossier) }, person: h.person, project: h.context.project, effort: 'medium', signal: new AbortController().signal, onSearch() {} }), /联网记录/);
  const jobs = new ResearchJobs({ bibliographyFetcher: async () => h.bibliography, readerFactory: () => ({ close() {}, async explain(args) { args.onSearch({ type: 'webSearch' }); return JSON.stringify(h.dossier); } }) });
  jobs.start(h.context, 'dossier', 'medium', { piId: h.person.id }); await jobs.jobs.get('sc-snr').promise;
  assert.equal((await jobs.state(h.context)).status, 'completed'); assert.deepEqual(h.context.store.get().people.profiles[0].dossier, h.dossier); await jobs.close();
});

test('Windows transient rename locks retry without deleting the target; persistent and other errors propagate', async () => {
  let count = 0; await renameWithRetry('a', 'b', { platform: 'win32', delays: [0, 0], rename: async () => { if (++count < 3) throw Object.assign(new Error('locked'), { code: 'EPERM' }); } }); assert.equal(count, 3);
  count = 0; await assert.rejects(renameWithRetry('a', 'b', { platform: 'win32', delays: [0], rename: async () => { count++; throw Object.assign(new Error('denied'), { code: 'EPERM' }); } }), /denied/); assert.equal(count, 2);
  count = 0; await assert.rejects(renameWithRetry('a', 'b', { platform: 'win32', delays: [0], rename: async () => { count++; throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } }), /missing/); assert.equal(count, 1);
});
