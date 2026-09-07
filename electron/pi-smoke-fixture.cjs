// Isolated verification data, never installed into a user's library.
function piFixture(person = { name: 'Test Researcher', website: 'https://example.org/pi' }) {
  const sources = [{ label: 'Test source', url: 'https://example.org/evidence' }];
  const work = (id, patch = {}) => ({ id, title: 'Test ' + id, doi: '10.0000/' + id, url: 'https://example.org/paper/' + id, publishedDate: '2024-04-01', journal: 'Neuron', issns: ['0896-6273'], kind: 'article', match: 'affiliation', authorPosition: 'last', piAuthor: person.name, affiliation: 'Test University', citations: 3, keywords: ['Superior colliculus', 'Animals'], authors: [{ name: 'Test Collaborator', orcid: '' }, { name: person.name, orcid: '' }], ...patch });
  const bibliography = { version: 1, checkedOn: '2026-09-07', fromYear: 2017, toDate: '2026-09-07', query: 'fixture', sourceUrl: 'https://example.org/search', complete: true, hitCount: 6, excluded: 0, identity: { names: [person.name], affiliations: ['Test University'], orcid: '' }, works: [
    work('nature', { journal: 'Nature', issns: ['0028-0836'], publishedDate: '2020-05-01' }),
    work('neuron'), work('cell', { journal: 'Cell', issns: ['0092-8674'], kind: 'review', keywords: ['Learning'] }),
    work('subjournal', { journal: 'Nature Neuroscience', issns: ['1097-6256'] }),
    work('preprint', { kind: 'preprint' }), work('uncertain', { match: 'name' })
  ] };
  const dossier = { version: 1, checkedOn: '2026-09-07', overview: 'Test **research profile** with a [verified source](https://example.org/evidence).', scope: 'Isolated test fixture.', sources,
    career: [{ period: '2010–2015', role: 'PhD', institution: 'Test University', detail: 'Documented training.', sources }],
    directions: [{ title: 'Action selection', detail: 'Test circuit research.', sources }], methods: ['Electrophysiology'],
    relationships: [{ name: 'Test Mentor', type: 'mentor', stage: 'PhD', period: '2010–2015', detail: 'Explicit adviser record.', destination: '', destinationAsOf: '', sources }, { name: 'Test Trainee', type: 'trainee', stage: '博士后', period: '2016–2020', detail: 'Explicit postdoctoral training.', destination: 'Destination University', destinationAsOf: '2026-09-07', sources }],
    funding: [{ funder: 'Test Foundation', title: 'Circuit project', grantId: 'TEST-123', role: 'PI', amount: '未披露', start: '2020-01-01', end: '2023-12-31', status: 'completed', detail: 'Historical project.', caveat: 'Current funding not inferred.', sources }], resources: sources, questions: ['Which circuit mechanism is supported?'] };
  return { dossier, bibliography, work, packet: { format: 'neuroshelf-dossiers', version: 1, projectId: 'sc-snr', entries: [{ website: person.website, dossier, bibliography }] } };
}
module.exports = { piFixture };
