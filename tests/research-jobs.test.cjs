const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ResearchJobs } = require('../electron/research.cjs');

const output = JSON.stringify({ summary: '已完成本轮核验，没有新条目。', complete: true, checkedCount: 0, searchedSources: ['大学官网'], candidates: [], profiles: [], events: [] });
async function fixture(options = {}) {
  const directory = await fs.mkdtemp(path.resolve('.test-data/research-job-'));
  for (const folder of ['reports', 'inbox/papers', 'inbox/people']) await fs.mkdir(path.join(directory, folder), { recursive: true });
  const writes = [], context = { directory, project: { id: 'sc-snr', keywords: [] }, store: { get: () => ({ papers: [] }), ingestPeople: async batches => writes.push(['people', batches]), ingestWeekly: async batches => writes.push(['papers', batches]) } };
  let call, resolve, reject, closed = 0;
  const jobs = new ResearchJobs({ checkpointIntervalMs: 10, ...options, readerFactory: () => ({ webResearch: true, explain(args) { call = args; return new Promise((yes, no) => { resolve = yes; reject = no; args.signal.addEventListener('abort', () => { if (!options.ignoreAbort) no(new Error('stopped')); }, { once: true }); }); }, close() { closed++; } }) });
  return { jobs, context, writes, get call() { return call; }, get closed() { return closed; }, resolve: text => resolve(text), reject: error => reject(error), saved: async () => JSON.parse(await fs.readFile(path.join(directory, 'reports/latest-run.json'), 'utf8')) };
}
async function until(check) { for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('Condition did not become true'); }

test('running progress is visible and checkpointed before the answer, then completion replaces it', { timeout: 3000 }, async () => {
  const h = await fixture();
  try {
    const initial = h.jobs.start(h.context, 'people', 'high');
    assert.equal(initial.phase, 'connecting'); assert.equal(initial.effort, 'high');
    await until(() => h.call);
    h.call.onProgress({ phase: 'thinking', message: '正在分析研究问题…' });
    assert.equal((await h.jobs.state(h.context)).phase, 'thinking');
    await until(async () => (await h.saved()).phase === 'thinking');
    h.call.onSearch({ id: 'web1', type: 'webSearch', action: { url: 'https://example.org' } });
    h.call.onProgress({ phase: 'writing', message: '正在整理结果…' });
    assert.equal((await h.jobs.state(h.context)).searches, 1);
    h.resolve(output); await h.jobs.jobs.get('sc-snr').promise;
    const final = await h.saved();
    assert.equal(final.status, 'completed'); assert.equal(final.phase, 'completed'); assert.ok(final.finishedAt);
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0][0], 'people'); assert.equal(h.closed, 1);
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal((await h.saved()).status, 'completed');
  } finally { await h.jobs.close(); }
});

test('stop clears the running state, ignores late progress and permits another task', { timeout: 3000 }, async () => {
  const h = await fixture();
  try {
    h.jobs.start(h.context, 'people', 'medium'); await until(() => h.call);
    assert.throws(() => h.jobs.start(h.context, 'people', 'medium'), /已有任务/);
    const oldCall = h.call;
    assert.equal(h.jobs.stop('sc-snr').status, 'stopping');
    oldCall.onProgress({ phase: 'thinking', message: 'late' });
    await h.jobs.jobs.get('sc-snr').promise;
    assert.equal((await h.saved()).status, 'interrupted'); assert.equal(h.writes.length, 0);
    const next = h.jobs.start(h.context, 'people', 'medium');
    assert.equal(next.status, 'running');
    await until(() => h.call !== oldCall); await h.jobs.close();
    assert.equal((await h.saved()).status, 'interrupted');
  } finally { await h.jobs.close(); }
});

test('a response arriving after stop cannot publish results', { timeout: 3000 }, async () => {
  const h = await fixture({ ignoreAbort: true });
  h.jobs.start(h.context, 'people', 'medium'); await until(() => h.call);
  h.call.onSearch({ id: 'web1', type: 'webSearch' });
  h.jobs.stop('sc-snr'); h.resolve(output); await h.jobs.jobs.get('sc-snr').promise;
  assert.equal((await h.saved()).status, 'interrupted'); assert.deepEqual(h.writes, []);
});

test('timeout interrupts work and failure releases the task without automatic retries', { timeout: 3000 }, async () => {
  const h = await fixture({ timeoutMs: 60 });
  try {
    h.jobs.start(h.context, 'people', 'medium'); await h.jobs.jobs.get('sc-snr').promise;
    assert.equal((await h.saved()).status, 'interrupted'); assert.match((await h.saved()).message, /超时/);
    const oldCall = h.call;
    h.jobs.start(h.context, 'people', 'medium'); await until(() => h.call !== oldCall);
    h.reject(new Error('连接失败')); await h.jobs.jobs.get('sc-snr').promise;
    assert.equal((await h.saved()).status, 'failed'); assert.deepEqual(h.writes, []);
  } finally { await h.jobs.close(); }
});
