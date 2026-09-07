// Disposable PDF fixture only. Uses the actual renderer, IPC and local persistence.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function runReaderSmoke({ win, store, waitFor, directory }) {
  const run = code => win.webContents.executeJavaScript(code);
  const select = text => run(`(() => {
    document.activeElement?.blur();
    const span = [...document.querySelectorAll('.textLayer span')].find(s => s.textContent.includes(${JSON.stringify(text)}));
    const range = document.createRange(); range.selectNodeContents(span);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  })()`);
  const paper = () => store.get().papers.find(p => p.title === 'reader-verification');
  await select('Attention and motor output');
  await waitFor(`Boolean([...document.querySelectorAll('.selection-toolbar button')].find(b => b.textContent.includes('写旁注')))`);
  await run(`[...document.querySelectorAll('.selection-toolbar button')].find(b => b.textContent.includes('写旁注')).click()`);
  await waitFor(`document.activeElement?.matches('.annotation-card textarea') && !document.querySelector('#annotation-panel').hidden`);
  const firstId = paper().highlights[0].id;
  assert.equal(paper().highlights[0].page, 2);
  assert.equal(paper().highlights[0].pdfHash, paper().pdf.hash);
  assert.ok(paper().highlights[0].rects.length);
  await win.webContents.insertText('第二页旁注：注意与运动输出应分别解释。');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  win.webContents.sendInputEvent({ type: 'char', keyCode: ' ' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await waitFor(`document.querySelector('.annotation-card textarea').value.endsWith(' ')`);
  assert.equal(await run(`document.querySelector('#annotation-panel').hidden`), false, 'Typing Space in a comment must not ask AI');
  await run(`document.querySelector('button[aria-label="上一页"]').click()`);
  await waitFor(`document.querySelector('.textLayer')?.textContent.includes('Nigral input') && !document.querySelector('.render-status')`);
  await select('Nigral input');
  await run(`document.querySelector('button[aria-label="绿色高亮"]').click()`);
  await waitFor(`document.querySelectorAll('.annotation-card').length === 2 && document.activeElement?.matches('.annotation-card textarea')`);
  await win.webContents.insertText('第一页旁注：补查抑制性细胞的证据。');
  await run(`document.querySelector('#ai-tab').click()`);
  await waitFor(`!document.querySelector('#ai-panel').hidden`);
  await run(`document.querySelector('#annotations-tab').click()`);
  await waitFor(`document.querySelectorAll('.annotation-card footer')[0]?.textContent.includes('已保存') && document.querySelectorAll('.annotation-card footer')[1]?.textContent.includes('已保存')`);
  assert.equal(paper().highlights.find(h => h.id === firstId).comment, '第二页旁注：注意与运动输出应分别解释。 ');
  assert.ok(paper().highlights.some(h => h.comment === '第一页旁注：补查抑制性细胞的证据。'));
  await run(`document.querySelector('[data-highlight-id="${firstId}"] .annotation-location').click()`);
  await waitFor(`document.querySelector('input[aria-label="PDF 页码"]').value === '2' && !document.querySelector('.render-status') && Boolean(document.querySelector('.pdf-highlight.active'))`);
  await new Promise(resolve => setTimeout(resolve, 250));
  const annotationsImage = await win.webContents.capturePage();
  await fs.writeFile(path.join(directory, 'desktop-annotations.png'), annotationsImage.toPNG());

  const beforeWidth = await run(`document.querySelector('.reading-sidebar').getBoundingClientRect().width`);
  const handle = await run(`(() => { const r = document.querySelector('.reader-resizer').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseDown', ...handle, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseMove', x: handle.x - 100, y: handle.y, button: 'left' });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: handle.x - 100, y: handle.y, button: 'left', clickCount: 1 });
  await waitFor(`document.querySelector('.reading-sidebar').getBoundingClientRect().width >= ${beforeWidth + 95}`);
  const wider = await run(`document.querySelector('.reading-sidebar').getBoundingClientRect().width`);
  assert.ok(await run(`document.querySelector('.document-panel').getBoundingClientRect().width >= 380`));
  await run(`document.querySelector('#ai-tab').click(); document.querySelector('button[aria-label="放大 AI 文字"]').click()`);
  await waitFor(`getComputedStyle(document.querySelector('.chat-message.assistant .markdown')).fontSize === '17px'`);
  await waitFor(`!document.querySelector('.render-status')`);
  await waitFor(`!document.querySelector('#ai-panel').hidden`);
  await new Promise(resolve => setTimeout(resolve, 250));
  const aiImage = await win.webContents.capturePage();
  await fs.writeFile(path.join(directory, 'desktop-reader-controls.png'), aiImage.toPNG());
  console.log('ANNOTATIONS_OK: range/page anchors, native typing, autosave through page/tab switches, and jump to the highlighted passage.');
  console.log('RESIZE_OK: native pointer drag expands sidebar and keeps the PDF readable.');

  // Reload the actual window to verify persisted comments, width and typography.
  await win.reload();
  await waitFor(`Boolean(document.querySelector('input[aria-label="搜索文献库"]'))`);
  await run(`(() => { const input = document.querySelector('input[aria-label="搜索文献库"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'reader-verification'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(`Boolean([...document.querySelectorAll('button.card-title')].find(b => b.textContent === 'reader-verification'))`);
  await run(`[...document.querySelectorAll('button.card-title')].find(b => b.textContent === 'reader-verification').click()`);
  await waitFor(`Boolean(document.querySelector('.textLayer')?.textContent.includes('Attention and motor output')) && !document.querySelector('.render-status')`);
  assert.equal(await run(`document.querySelector('.reading-sidebar').getBoundingClientRect().width`), wider);
  assert.equal(await run(`document.querySelector('select[aria-label="GPT-6 推理强度"]').value`), 'xhigh');
  assert.equal(await run(`getComputedStyle(document.querySelector('.chat-message.assistant .markdown')).fontSize`), '17px');
  await run(`document.querySelector('#annotations-tab').click()`);
  await waitFor(`document.querySelectorAll('.annotation-card').length === 2 && !document.querySelector('#annotation-panel').hidden`);
  assert.equal(await run(`document.querySelector('[data-highlight-id="${firstId}"] textarea').value`), '第二页旁注：注意与运动输出应分别解释。 ');
  console.log('READER_PERSISTENCE_OK: comments, sidebar width and font size survive a full renderer reload.');
  return { annotations: true, resizeSidebar: true, readerPersistence: true };
}
module.exports = { runReaderSmoke };
