const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CodexReader } = require('../electron/codex.cjs');
const { groundResult, rssResults, collectSources, plain } = require('../electron/research-sources.cjs');
const { candidate } = require('./weekly-fixture.cjs');
test('research analysis never enables model-side web, code, shell, apps or MCP tools', () => {
  const reader = new CodexReader({ research: true });
  assert.equal(reader.readerConfig.web_search, 'disabled');
  for (const feature of ['code_mode', 'code_mode_host', 'shell_tool', 'unified_exec', 'apps', 'plugins', 'hooks', 'browser_use', 'computer_use', 'multi_agent']) assert.equal(reader.readerConfig['features.' + feature], false);
});
test('authorized native research enables the web runtime while retaining local tool restrictions', () => {
  const reader = new CodexReader({ research: true, webResearch: true });
  assert.equal(reader.readerConfig.web_search, 'live'); assert.equal(reader.readerConfig['features.code_mode_host'], true);
  for (const feature of ['shell_tool', 'unified_exec', 'apps', 'plugins', 'hooks', 'browser_use', 'computer_use', 'multi_agent']) assert.equal(reader.readerConfig['features.' + feature], false);
  assert.equal(reader.readerConfig.sandbox_mode, 'read-only'); assert.equal(reader.readerConfig.forced_login_method, 'chatgpt');
});
test('grounding refuses invented papers and unfetched PI sources and records actual coverage', () => {
  const good = candidate(), raw = { candidates: [good, candidate({ title: 'Invented paper', doi: '10.99999/imaginary' })], profiles: [{ website: 'https://example.org/pi', sources: [{ url: 'https://example.org/unfetched' }] }], events: [], checkedCount: 9999, searchedSources: ['Imagined full web'], complete: true, summary: '本轮初筛' };
  const result = groundResult(raw, { papers: [{ ...good, abstract: 'Actual abstract', source: 'PPR' }], pages: [], searchedSources: ['Europe PMC query'], errors: [] });
  assert.equal(result.candidates.length, 1); assert.equal(result.profiles.length, 0); assert.equal(result.checkedCount, 1); assert.equal(result.complete, false); assert.equal(result.candidates[0].verification, '已核对摘要');
});
test('public search parses RSS as data and strips scripts from source pages', () => {
  assert.deepEqual(rssResults('<rss><item><title>A &amp; B</title><link>https://example.org/lab</link><description>Lab details</description></item></rss>'), [{ title: 'A & B', url: 'https://example.org/lab', snippet: 'Lab details' }]);
  assert.equal(plain('<script>secret()</script><p>Research &amp; science</p>'), 'Research & science');
});
test('source collection uses an encoded fixed search endpoint, never treats missing abstracts as evidence', async () => {
  const urls = [], paper = candidate();
  const result = await collectSources({ project: { keywords: [] }, library: { papers: [] }, kind: 'weekly', plan: { paperQueries: ['superior colliculus'], piQueries: [] }, signal: new AbortController().signal, progress() {}, get: async url => { urls.push(url); return { url, type: 'application/json', bytes: Buffer.from(JSON.stringify({ resultList: { result: [{ title: 'No abstract' }, { title: paper.title, abstractText: '<p>Real abstract</p>', doi: paper.doi, authorString: paper.authors, firstPublicationDate: paper.publishedDate, source: 'MED', id: '12345', journalInfo: { journal: { title: 'Test' } } }] } })) }; } });
  assert.equal(result.papers.length, 1); assert.match(urls[0], /^https:\/\/www\.ebi\.ac\.uk\//); assert.match(decodeURIComponent(urls[0]), /FIRST_PDATE/); assert.equal(result.log.length, 1);
});
