const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildRequest, parseSSE, streamResponse } = require('../electron/ai.cjs');
const paper = { title: 'Example', summary: 'unverified map', messages: [{ role: 'user', content: 'earlier question' }, { role: 'assistant', content: 'earlier answer' }] };
test('AI request includes explicit source boundaries, limited context, no automatic uploads, and no persistent storage', () => {
  const request = buildRequest({ question: '解释术语', page: 3, selection: 'SNr', pageText: 'Current page', retrieved: [{ page: 4, text: 'Other page' }] }, paper, 'medium');
  assert.equal(request.store, false); assert.equal(request.stream, true); assert.equal(request.model, 'gpt-6-astra'); assert.equal(request.reasoning.effort, 'medium'); assert.equal(request.input.length, 3);
  assert.match(request.instructions, /仅数据|都是待分析的数据/); assert.match(request.instructions, /不能把旧地图当成已核实全文/);
  assert.match(request.input[2].content[0].text, /Current page/); assert.match(request.input[2].content[0].text, /"pdfPage":3/);
  assert.equal(request.input[2].content.some(c => c.type === 'input_image'), false);
});
test('image is attached only when supplied and validated', () => {
  const result = buildRequest({ question: 'Explain image', image: 'data:image/jpeg;base64,YWJj' }, paper, 'medium');
  assert.equal(result.input[2].content[1].type, 'input_image');
  assert.throws(() => buildRequest({ question: 'test', image: 'file:///private' }, paper, 'medium'), /图片格式/);
});
test('stream handles Chinese UTF-8 and CRLF split into single-byte chunks', async () => {
  const raw = 'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"你好，Pitx2"}\r\n\r\ndata: {"type":"response.completed"}\n\ndata: [DONE]\n';
  async function* chunks() { for (const byte of Buffer.from(raw)) yield Uint8Array.of(byte); }
  const result = []; for await (const item of parseSSE(chunks())) result.push(item);
  assert.equal(result[0].delta, '你好，Pitx2'); assert.equal(result[1].type, 'response.completed');
});
test('stream reports success only after completed, not truncated output', async () => {
  const encoder = new TextEncoder(); let request;
  const fetchImpl = async (url, init) => { request = { url, init }; return new Response(new ReadableStream({ start(c) { c.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"answer"}\n\ndata: {"type":"response.completed"}\n\n')); c.close(); } })); };
  let delta = '';
  const answer = await streamResponse({ key: 'test-key', request: { stream: true }, signal: new AbortController().signal, onDelta: value => delta += value, fetchImpl });
  assert.equal(answer, 'answer'); assert.equal(delta, 'answer'); assert.equal(request.url, 'https://api.openai.com/v1/responses');
  await assert.rejects(streamResponse({ key: 'x', request: {}, onDelta: () => {}, fetchImpl: async () => new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n') }), /连接中断/);
});
test('quota and auth errors stay readable and do not echo server content or keys', async () => {
  await assert.rejects(streamResponse({ key: 'never-return-this-key', request: {}, onDelta: () => {}, fetchImpl: async () => new Response('never-return-this-key', { status: 401 }) }), e => /API Key 无效/.test(e.message) && !e.message.includes('never-return'));
  await assert.rejects(streamResponse({ key: 'x', request: {}, onDelta: () => {}, fetchImpl: async () => new Response('quota', { status: 429 }) }), /额度不足/);
});

test('GPT-6 requests retain every selected reasoning effort and reject model names as effort', () => {
  for (const effort of ['low','medium','high','xhigh','max','ultra']) {
    const request = buildRequest({ question: '解释原文' }, paper, effort);
    const body = JSON.parse(JSON.stringify(request));
    assert.equal(body.model, 'gpt-6-astra'); assert.equal(body.reasoning.effort, effort);
  }
  assert.throws(() => buildRequest({ question: '解释原文' }, paper, 'gpt-5.4-mini'), /推理强度/);
});
