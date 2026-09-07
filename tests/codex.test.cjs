const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const path = require('node:path');
const { CodexReader, subscriptionEnvironment } = require('../electron/codex.cjs');
const { buildRequest } = require('../electron/ai.cjs');

function harness({ auth = 'chatgpt', stream = true, fail = false, efforts = ['medium'], research = false, hold, resolveExecutable = async () => 'codex.exe' } = {}) {
  const messages = []; let launch, child;
  const push = message => {
    const bytes = Buffer.from(JSON.stringify(message) + '\r\n');
    // Exercise Chinese JSON-RPC messages split at arbitrary UTF-8 boundaries.
    for (let i = 0; i < bytes.length; i += 3) child.stdout.write(bytes.subarray(i, i + 3));
  };
  const notify = (method, params) => push({ method, params });
  const spawnImpl = (executable, args, options) => {
    launch = { executable, args, options };
    child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.killed = false;
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('exit', 0)); };
    child.stdin = new Writable({ write(chunk, _encoding, callback) {
      const message = JSON.parse(chunk.toString()); messages.push(message); callback();
      if (message.id == null || !message.method || message.method === hold) return;
      queueMicrotask(() => {
        let result = {};
        if (message.method === 'account/read') result = { account: { type: auth, planType: 'pro' } };
        if (message.method === 'config/read') result = { config: { mcp_servers: { sample: { enabled: true } } } };
        if (message.method === 'model/list') result = { data: [{ model: 'gpt-6-astra', displayName: 'GPT-6 Astra', inputModalities: ['text', 'image'], supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort })) }] };
        if (message.method === 'thread/start') result = { thread: { id: 'paper-test' }, model: message.params.model };
        if (message.method === 'turn/start') result = { turn: { id: 'turn-test' } };
        push({ id: message.id, result });
        if (message.method === 'turn/start' && stream) {
          setImmediate(() => {
            if (fail) { notify('turn/completed', { threadId: 'paper-test', turn: { status: 'failed', error: { message: '会员额度已用完' } } }); return; }
            notify('item/agentMessage/delta', { threadId: 'unrelated', itemId: 'other', delta: 'must not appear' });
            notify('item/started', { threadId: 'paper-test', item: { id: 'answer', type: 'agentMessage', phase: 'final_answer' } });
            notify('item/agentMessage/delta', { threadId: 'paper-test', itemId: 'answer', delta: '中文解释。' });
            notify('item/completed', { threadId: 'paper-test', item: { id: 'answer', type: 'agentMessage', phase: 'final_answer', text: '中文解释。' } });
            notify('turn/completed', { threadId: 'paper-test', turn: { id: 'turn-test', status: 'completed' } });
          });
        }
      });
    } });
    return child;
  };
  const reader = new CodexReader({ directory: path.resolve('.test-data/mock-codex'), spawnImpl, resolveExecutable, research });
  return { reader, messages, notify, get launch() { return launch; }, get child() { return child; } };
}
const request = buildRequest({ source: 'pdf', page: 2, question: '解释原文', selection: 'Attention', pageText: 'Current PDF page', image: 'data:image/jpeg;base64,YWJj' }, { title: 'Fixture', messages: [] }, 'medium');

test('subscription process strips API credentials and provider overrides while preserving official login location', () => {
  const env = subscriptionEnvironment({ PATH: 'bin', CODEX_HOME: 'official-login', OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', OPENAI_BASE_URL: 'https://other.example', CODEX_ACCESS_TOKEN: 'secret', ELECTRON_RUN_AS_NODE: '1' });
  assert.deepEqual(env, { PATH: 'bin', CODEX_HOME: 'official-login' });
});
test('API-key authentication is rejected by membership mode before any model request', async () => {
  const h = harness({ auth: 'apiKey' });
  try {
    await assert.rejects(h.reader.explain({ request, signal: new AbortController().signal, onDelta() {} }), /会员模式不使用 API Key/);
    assert.equal(h.messages.some(m => m.method === 'thread/start' || m.method === 'turn/start'), false);
  } finally { h.reader.close(); }
});
test('subscription sends only supplied context and streams one answer using the selected model with tools restricted', async () => {
  const h = harness(); let streamed = '';
  try {
    const result = await h.reader.explain({ request, signal: new AbortController().signal, onDelta: delta => streamed += delta });
    assert.equal(result, '中文解释。'); assert.equal(streamed, result);
    const thread = h.messages.find(m => m.method === 'thread/start').params;
    assert.equal(thread.ephemeral, true); assert.equal(thread.model, 'gpt-6-astra');
    assert.equal(thread.allowProviderModelFallback, false); assert.equal(thread.config.forced_login_method, 'chatgpt');
    assert.equal(thread.config['features.shell_tool'], false); assert.equal(thread.config['mcp_servers.sample.enabled'], false);
    assert.deepEqual(thread.environments, []); assert.deepEqual(thread.selectedCapabilityRoots, []);
    assert.equal(h.launch.options.shell, false); assert.equal(h.launch.options.windowsHide, true);
    const turn = h.messages.find(m => m.method === 'turn/start').params;
    assert.equal(turn.serviceTierForTurn, 'default'); assert.match(turn.input[0].text, /Current PDF page/);
    assert.match(turn.input[0].text, /"pdfPage":2/); assert.equal(turn.input[1].type, 'image');
  } finally { h.reader.close(); }
});
test('unavailable models never silently change to another model', async () => {
  const h = harness();
  try {
    await assert.rejects(h.reader.explain({ request: { ...request, model: 'missing-model' }, signal: new AbortController().signal, onDelta() {} }), /固定使用 GPT-6/);
    assert.equal(h.messages.some(m => m.method === 'turn/start'), false);
  } finally { h.reader.close(); }
});
test('stopping a membership answer ends its local process and does not retry through API', async () => {
  const h = harness({ stream: false }), controller = new AbortController();
  try {
    const reply = h.reader.explain({ request, signal: controller.signal, onDelta() {} });
    const stopped = assert.rejects(reply, /停止|中断/);
    for (let i = 0; i < 50 && !h.messages.some(m => m.method === 'turn/start'); i++) await new Promise(resolve => setTimeout(resolve, 5));
    controller.abort(); await stopped;
    assert.equal(h.child.killed, true);
    assert.equal(h.messages.filter(m => m.method === 'turn/start').length, 1);
    assert.equal(h.messages.filter(m => m.method === 'turn/interrupt').length, 1);
  } finally { h.reader.close(); }
});
test('quota failures are returned without restarting the turn or switching provider', async () => {
  const h = harness({ fail: true });
  try {
    await assert.rejects(h.reader.explain({ request, signal: new AbortController().signal, onDelta() {} }), /会员额度已用完/);
    assert.equal(h.messages.filter(m => m.method === 'turn/start').length, 1);
  } finally { h.reader.close(); }
});

test('every advertised GPT-6 effort reaches the actual Codex turn/start unchanged', async () => {
  const efforts = ['low','medium','high','xhigh','max','ultra'];
  for (const effort of efforts) {
    const h = harness({ efforts });
    try {
      await h.reader.explain({ request: { ...request, reasoning: { effort } }, signal: new AbortController().signal, onDelta() {} });
      const turn = h.messages.find(m => m.method === 'turn/start').params;
      assert.equal(turn.model, 'gpt-6-astra'); assert.equal(turn.effort, effort);
      assert.equal(turn.serviceTierForTurn, 'default');
    } finally { h.reader.close(); }
  }
});
test('unsupported or missing effort is rejected before a thread starts, without silent downgrading', async () => {
  const h = harness({ efforts: ['low', 'medium'] });
  try {
    for (const effort of ['ultra', undefined]) await assert.rejects(h.reader.explain({ request: { ...request, reasoning: { effort } }, signal: new AbortController().signal, onDelta() {} }), /不支持所选/);
    assert.equal(h.messages.some(m => m.method === 'thread/start' || m.method === 'turn/start'), false);
  } finally { h.reader.close(); }
});

async function waitMethod(h, method) {
  for (let i = 0; i < 100; i++) {
    if (h.messages.some(m => m.method === method)) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Expected RPC ' + method);
}

test('cancelled executable discovery settles immediately and cannot spawn a late process', { timeout: 2000 }, async () => {
  let release;
  const h = harness({ resolveExecutable: () => new Promise(resolve => { release = resolve; }) }), controller = new AbortController();
  const result = h.reader.explain({ request, signal: controller.signal });
  const stopped = assert.rejects(result, /已停止/);
  controller.abort(); await stopped;
  assert.equal(h.child, undefined);
  // A new request can start even while the cancelled resolver has not returned.
  h.reader.resolveExecutable = async () => 'codex.exe';
  const next = h.reader.explain({ request, signal: new AbortController().signal });
  release('old-codex.exe');
  assert.equal(await next, '中文解释。');
  assert.equal(h.launch.executable, 'codex.exe');
  assert.equal(h.messages.filter(m => m.method === 'initialize').length, 1);
  h.reader.close();
});

for (const method of ['initialize', 'config/read', 'account/read', 'model/list', 'thread/start', 'turn/start']) {
  test('stop is immediate during a stalled ' + method, { timeout: 2000 }, async () => {
    const h = harness({ hold: method }), controller = new AbortController();
    try {
      const result = h.reader.explain({ request, signal: controller.signal });
      const stopped = assert.rejects(result, /已停止|中断/);
      await waitMethod(h, method); controller.abort(); await stopped;
      assert.equal(h.child.killed, true); assert.equal(h.reader.pending.size, 0);
      assert.equal(h.reader.listenerCount('notification'), 0);
    } finally { h.reader.close(); }
  });
}

test('research emits progress before final output, counts web completions once, and excludes reasoning content', { timeout: 2000 }, async () => {
  const h = harness({ stream: false, research: true }), updates = [], searches = [];
  try {
    const result = h.reader.explain({ request, signal: new AbortController().signal, onProgress: event => updates.push(event), onSearch: event => searches.push(event) });
    await waitMethod(h, 'turn/start');
    assert.deepEqual(updates.map(e => e.phase), ['connecting', 'preparing', 'waiting']);
    const emit = (method, rest) => h.notify(method, { threadId: 'paper-test', ...rest });
    emit('item/started', { item: { id: 'r1', type: 'reasoning', content: ['PRIVATE_REASONING'] } });
    emit('item/reasoning/textDelta', { itemId: 'r1', delta: 'PRIVATE_REASONING' });
    const web = { id: 'web1', type: 'webSearch', query: '', action: { type: 'openPage', url: 'https://example.org/lab' } };
    emit('item/started', { item: web });
    assert.equal(updates.at(-1).phase, 'reading'); assert.equal(searches.length, 0);
    emit('item/completed', { item: web }); emit('item/completed', { item: web });
    assert.equal(searches.length, 1);
    emit('item/started', { item: { id: 'comment', type: 'agentMessage', phase: 'commentary' } });
    emit('item/agentMessage/delta', { itemId: 'comment', delta: 'COMMENTARY_NOT_RESULT' });
    emit('item/started', { item: { id: 'answer', type: 'agentMessage', phase: 'final_answer' } });
    emit('item/agentMessage/delta', { itemId: 'answer', delta: '核对完成' });
    emit('turn/completed', { turn: { id: 'turn-test', status: 'completed' } });
    assert.equal(await result, '核对完成');
    assert.equal(updates.at(-1).phase, 'writing');
    assert.doesNotMatch(JSON.stringify(updates), /PRIVATE_REASONING|COMMENTARY_NOT_RESULT/);
  } finally { h.reader.close(); }
});
