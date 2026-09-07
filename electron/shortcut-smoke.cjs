// Runs only from --smoke-test, against a disposable fixture library. No network requests.
const assert = require('node:assert/strict');
const { ipcMain } = require('electron');
const { buildRequest } = require('./ai.cjs');

async function runShortcutSmoke({ win, store, waitFor, register, codex, getEffort }) {
  const run = code => win.webContents.executeJavaScript(code);
  const calls = [];
  const mockRequests = () => {
    ipcMain.removeHandler('ai:ask');
    register('ai:ask', payload => {
      calls.push({ payload, request: buildRequest(payload, store.find(payload.paperId), getEffort()) });
      return { started: true };
    });
  };
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  const space = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: ' ' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
    await pause();
  };
  const select = async text => run(`(() => {
    document.activeElement?.blur();
    const span = [...document.querySelectorAll('.textLayer span')].find(s => s.textContent.includes(${JSON.stringify(text)}));
    if (!span) throw new Error('Fixture text missing');
    const range = document.createRange(); range.selectNodeContents(span);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return selection.toString().trim();
  })()`);
  const finish = async () => {
    const { payload } = calls.at(-1);
    const paper = store.find(payload.paperId);
    const updated = await store.update(paper.id, { messages: [...paper.messages || [],
      { id: payload.requestId + '_u', role: 'user', content: payload.question, selection: payload.selection, page: payload.page },
      { id: payload.requestId + '_a', role: 'assistant', content: '快捷键测试回复（模拟，未调用真实模型）', page: payload.page, model: 'gpt-6-astra', effort: getEffort() },
    ] });
    win.webContents.send('ai:event', { type: 'done', requestId: payload.requestId, paperId: paper.id, paper: updated });
    await waitFor(`!document.querySelector('button[aria-label="停止生成"]')`);
  };

  // No selection must keep the ordinary Space behavior.
  await run(`document.activeElement?.blur(); window.getSelection()?.removeAllRanges()`);
  await space();
  assert.equal(await run(`Boolean(document.querySelector('dialog[open]'))`), false);
  assert.equal(calls.length, 0);

  const firstText = await select('Nigral input');
  await waitFor(`document.querySelector('.connection-status')?.textContent.includes('使用现有会员额度')`);
  await space();
  await waitFor(`document.querySelector('.chat-messages')?.textContent.includes('会员通道测试回复')`);
  // A streamed delta can render before the final answer has been saved.
  await waitFor(`!document.querySelector('button[aria-label="停止生成"]')`);
  assert.equal(codex.calls.length, 1, 'Default mode must use Codex without an API key');
  assert.equal(await run(`window.neuroshelf.settings().then(s => s.hasKey)`), false);
  assert.equal(store.get().papers.find(p => p.title === 'reader-verification').messages.at(-1).provider, 'codex');
  assert.equal(codex.calls[0].model, 'gpt-6-astra');
  console.log('MEMBERSHIP_ROUTE_OK: default uses subscription, with no API key.');

  const switchEffort = async effort => {
    await run(`(() => { const select = document.querySelector('select[aria-label="GPT-6 推理强度"]'); select.value = ${JSON.stringify(effort)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(`document.querySelector('select[aria-label="GPT-6 推理强度"]').value === ${JSON.stringify(effort)} && !document.querySelector('select[aria-label="GPT-6 推理强度"]').disabled`);
  };
  assert.equal(codex.calls[0].reasoning.effort, 'medium');
  assert.equal(await run(`Boolean(document.querySelector('select[aria-label="AI 模型"]'))`), false);
  assert.deepEqual(await run(`[...document.querySelector('select[aria-label="GPT-6 推理强度"]').options].map(o => o.value)`), ['low','medium','high','xhigh','max','ultra']);
  assert.deepEqual(await run(`window.neuroshelf.settings().then(s => s.codex.models.map(m => m.id))`), ['gpt-6-astra']);
  await switchEffort('low');
  assert.equal(getEffort(), 'low');
  await select('Nigral input'); await space();
  await waitFor(`Boolean(document.querySelector('button[aria-label="停止生成"]'))`);
  await switchEffort('ultra');
  await waitFor(`!document.querySelector('button[aria-label="停止生成"]')`);
  assert.equal(codex.calls.at(-1).model, 'gpt-6-astra');
  assert.equal(codex.calls.at(-1).reasoning.effort, 'low', 'A running answer must retain its original effort');
  assert.equal(store.get().papers.find(p => p.title === 'reader-verification').messages.at(-1).effort, 'low');
  await select('Nigral input'); await space();
  await waitFor(`!document.querySelector('button[aria-label="停止生成"]')`);
  assert.equal(codex.calls.at(-1).reasoning.effort, 'ultra', 'The next request must use the new effort');
  assert.equal(store.get().papers.find(p => p.title === 'reader-verification').messages.at(-1).effort, 'ultra');
  await switchEffort('high');
  console.log('REASONING_EFFORT_OK: GPT-6 stays fixed; selected effort reaches requests and saved messages, including in-flight switching.');

  await require('./language-ai-smoke.cjs').runLanguageAiSmoke({ run, waitFor, select, space, codex, store });

  await run(`document.querySelector('button[aria-label="AI 设置"]').click()`);
  await waitFor(`Boolean(document.querySelector('dialog[open] .provider-choices'))`);
  await run(`[...document.querySelectorAll('.provider-choices button')].find(b => b.textContent.includes('API')).click()`);
  await waitFor(`Boolean(document.querySelector('dialog input[type="password"]'))`);
  await run(`[...document.querySelectorAll('dialog button')].find(b => b.textContent.includes('保存设置')).click()`);
  await waitFor(`!document.querySelector('dialog[open]')`);
  mockRequests();
  await select('Nigral input');
  await space();
  await waitFor(`Boolean(document.querySelector('dialog[open] input[type="password"]'))`);
  assert.match(await run(`document.querySelector('textarea[aria-label="向 AI 提问"]').value`), /这段原文是什么意思/);
  assert.equal(calls.length, 0, 'Missing API key must never submit');

  // Select GPT-6 through the actual settings UI, using a dummy key in the isolated library.
  await run(`(() => {
    const effort = document.querySelector('select[aria-label="设置中的 GPT-6 推理强度"]'); effort.value = 'xhigh'; effort.dispatchEvent(new Event('change', { bubbles: true }));
    const input = document.querySelector('dialog input[type="password"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'smoke-test-placeholder');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(`document.querySelector('select[aria-label="设置中的 GPT-6 推理强度"]').value === 'xhigh'`);
  await run(`[...document.querySelectorAll('dialog button')].find(b => b.textContent.includes('保存设置')).click()`);
  await waitFor(`!document.querySelector('dialog[open]') && document.querySelector('.chat-heading').textContent.includes('GPT-6')`);

  await select('Nigral input');
  await space();
  await waitFor(`Boolean(document.querySelector('button[aria-label="停止生成"]'))`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.selection, firstText);
  assert.equal(calls[0].payload.page, 1);
  assert.equal(calls[0].payload.source, 'pdf');
  assert.ok(calls[0].payload.pageText.includes(firstText));
  assert.match(calls[0].payload.question, /这段原文是什么意思/);
  assert.equal(calls[0].request.model, 'gpt-6-astra');
  assert.equal(calls[0].request.reasoning.effort, 'xhigh');

  await run(`for (let n = 0; n < 5; n++) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true, bubbles: true, cancelable: true }))`);
  await space();
  assert.equal(calls.length, 1, 'Long press and an in-flight answer must not send duplicates');
  await finish();

  // IME and modified keys must remain available even when PDF text is selected.
  await select('Nigral input');
  const prevented = await run(`[ { repeat: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true } ].map(extra => {
    const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true, ...extra });
    document.body.dispatchEvent(event); return event.defaultPrevented;
  })`);
  assert.deepEqual(prevented, [true, false, false, false, false, false, false]);
  await pause(); assert.equal(calls.length, 1);

  await run(`(() => { const input = document.querySelector('textarea[aria-label="向 AI 提问"]'); input.focus(); })()`);
  const before = await run(`document.querySelector('textarea[aria-label="向 AI 提问"]').value`);
  await space();
  assert.equal(await run(`document.querySelector('textarea[aria-label="向 AI 提问"]').value`), before + ' ');
  assert.equal(calls.length, 1, 'Space in the composer must only type a space');

  // A page change must never resubmit the old selection.
  await run(`document.querySelector('button[aria-label="下一页"]').click()`);
  await waitFor(`Boolean(document.querySelector('.textLayer')?.textContent.includes('Attention and motor output')) && !document.querySelector('.render-status')`);
  await run(`document.activeElement?.blur()`);
  await space(); assert.equal(calls.length, 1);
  const secondText = await select('Attention and motor output');
  await space();
  await waitFor(`Boolean(document.querySelector('button[aria-label="停止生成"]'))`);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].payload.selection, secondText);
  assert.equal(calls[1].payload.page, 2);
  await finish();
  console.log('SHORTCUT_OK: native Space sends selected PDF text and page, guards typing/IME/repeats, and selects GPT-6 (mock API only).');
  await run(`document.querySelector('button[aria-label="AI 设置"]').click()`);
  await waitFor(`Boolean(document.querySelector('dialog[open] .provider-choices'))`);
  await run(`[...document.querySelectorAll('.provider-choices button')].find(b => b.textContent.includes('使用现有会员')).click()`);
  await run(`[...document.querySelectorAll('dialog button')].find(b => b.textContent.includes('保存设置')).click()`);
  await waitFor(`!document.querySelector('dialog[open]') && document.querySelector('.connection-status')?.textContent.includes('使用现有会员额度')`);
  return { shortcut: true, modelSelection: 'gpt-6-astra', membership: true, reasoningEffort: true, effortSelection: 'xhigh' };
}

function mockCodex() {
  return {
    cached: { checked: true, connected: true, plan: 'pro', models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra', efforts: ['low','medium','high','xhigh','max','ultra'], images: true }, { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark', efforts: ['medium'], images: false }] },
    calls: [],
    async status() { return this.cached; },
    async login() { throw new Error('测试不进行真实登录。'); },
    async explain({ request, signal, onDelta }) {
      this.calls.push(request);
      await new Promise(resolve => setTimeout(resolve, 750));
      if (signal.aborted) throw new Error('已停止生成。');
      const answer = '会员通道测试回复（模拟，未调用真实模型）';
      onDelta(answer); return answer;
    },
    close() {},
  };
}
module.exports = { runShortcutSmoke, mockCodex };
