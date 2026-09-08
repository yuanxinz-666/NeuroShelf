// Uses only an isolated synthetic PDF and the mock membership connection.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
async function runFocusSmoke({ win, store, codex, waitFor, directory }) {
  const run = code => win.webContents.executeJavaScript(code);
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode === 'Space') win.webContents.sendInputEvent({ type: 'char', keyCode: ' ' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await run('new Promise(resolve => requestAnimationFrame(resolve))');
  };
  const paper = () => store.get().papers.find(p => p.title === 'reader-verification');
  const visible = selector => `Boolean(document.querySelector(${JSON.stringify(selector)})?.checkVisibility({opacityProperty:true,visibilityProperty:true}))`;
  const select = async (text, pageNumber = 1) => {
    await run(`document.activeElement?.blur(); document.querySelector('.continuous-page-slot[data-page-number="${pageNumber}"]')?.scrollIntoView({block:'start'})`);
    await waitFor(`document.querySelector('.continuous-page[data-pdf-page="${pageNumber}"]')?.dataset.ready === 'true' && document.querySelector('.continuous-page[data-pdf-page="${pageNumber}"] .textLayer')?.textContent.includes(${JSON.stringify(text)})`);
    const rect = await run(`(() => { const span = [...document.querySelectorAll('.textLayer span')].find(s => s.textContent.includes(${JSON.stringify(text)})); const r = span.getBoundingClientRect(); return {x:Math.round(r.left+2),y:Math.round(r.top+r.height/2),right:Math.round(r.right-2)}; })()`);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 6; i++) win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(rect.x+(rect.right-rect.x)*i/6), y: rect.y, button: 'left' });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.right, y: rect.y, button: 'left', clickCount: 1 });
    await waitFor(visible('.selection-toolbar'));
    assert.match(await run('window.getSelection().toString()'), new RegExp(text));
    const inside = await run(`(() => { const r=document.querySelector('.selection-toolbar').getBoundingClientRect(); return r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight; })()`);
    assert.equal(inside, true, 'The floating tools must stay inside the viewport');
  };
  await run('document.activeElement?.blur()');
  await key('F11');
  await waitFor(`Boolean(document.querySelector('.focus-mode')) && !document.querySelector('.render-status')`);
  assert.equal(win.isFullScreen(), true, 'F11 must enter native fullscreen');
  for (const selector of ['.navigation-panel','.topbar','.paper-topbar','.document-tabs','.reading-sidebar','.reader-resizer']) assert.equal(await run(visible(selector)),false,selector);
  assert.equal(await run(`getComputedStyle(document.querySelector('.pdf-scroll')).backgroundColor`),'rgb(0, 0, 0)');
  await waitFor(`!document.querySelector('.focus-hint')`);
  assert.equal(await run(visible('.pdf-toolbar')),false,'Toolbar hides until requested');
  await fs.writeFile(path.join(directory,'desktop-focus.png'),(await win.webContents.capturePage()).toPNG());
  await select('Nigral input');
  assert.equal(codex.calls.length,0,'Selecting text must not submit an AI request');
  await run(`document.querySelector('button[aria-label="绿色高亮"]').click()`);
  await waitFor(`window.neuroshelf.load().then(l => l.papers.find(p => p.title==='reader-verification').highlights.length===1)`);
  assert.equal(paper().highlights[0].color,'green');
  assert.equal(await run(visible('.reading-sidebar')),false,'Color alone keeps the page clear');
  await run('document.activeElement?.blur()');
  await key('Z',['control']);
  await waitFor(`!document.querySelector('.pdf-highlight')`);
  assert.equal(paper().highlights.length,0);
  await key('Z',['control','shift']);
  await waitFor(`Boolean(document.querySelector('.pdf-highlight.green'))`);
  assert.equal(paper().highlights.length,1);

  // Reopen an existing mark, type naturally, and save the final keystroke immediately.
  await run(`document.querySelector('.annotation-markers button').click()`);
  await waitFor(`document.activeElement?.matches('.annotation-card textarea') && ${visible('.reading-sidebar')}`);
  const annotationId=paper().highlights[0].id;
  await win.webContents.insertText('Focus comment saved with Ctrl S');
  await key('Z',['control']);
  await waitFor(`document.querySelector('.annotation-card textarea').value === ''`);
  assert.equal(paper().highlights.length,1,'Text undo must not undo the highlight itself');
  await key('Z',['control','shift']);
  await waitFor(`document.querySelector('.annotation-card textarea').value === 'Focus comment saved with Ctrl S'`);
  await key('S',['control']);
  await waitFor(`window.neuroshelf.load().then(l => l.papers.find(p => p.title==='reader-verification').highlights[0].comment==='Focus comment saved with Ctrl S')`);
  const disk=JSON.parse(await fs.readFile(path.join(store.directory,'library.json'),'utf8'));
  assert.equal(disk.papers.find(p=>p.id===paper().id).highlights[0].comment,'Focus comment saved with Ctrl S');
  await key('Escape');
  await waitFor(`!${visible('.reading-sidebar')}`);
  assert.equal(win.isFullScreen(),true,'First Escape only dismisses the assistant');
  await key('Z',['control']);
  await waitFor(`window.neuroshelf.load().then(l => l.papers.find(p=>p.title==='reader-verification').highlights[0].comment==='')`);
  await key('Y',['control']);
  await waitFor(`window.neuroshelf.load().then(l => l.papers.find(p=>p.title==='reader-verification').highlights[0].comment==='Focus comment saved with Ctrl S')`);

  await select('Nigral input');
  const pageWidth=await run(`document.querySelector('.pdf-page').getBoundingClientRect().width`);
  await key('Space');
  await waitFor(`${visible('.reading-sidebar')} && !document.querySelector('#ai-panel').hidden && document.querySelector('.chat-messages')?.textContent.includes('会员通道测试回复') && !document.querySelector('button[aria-label="停止生成"]')`);
  assert.equal(codex.calls.length,1);
  assert.equal(await run(`document.querySelector('.pdf-page').getBoundingClientRect().width`),pageWidth,'Floating AI must not resize the selected paper');
  await fs.writeFile(path.join(directory,'desktop-focus-ai.png'),(await win.webContents.capturePage()).toPNG());
  await key('Escape');
  await waitFor(`!${visible('.reading-sidebar')}`);
  await select('Nigral input');
  await run(`[...document.querySelectorAll('.selection-toolbar button')].find(b=>b.textContent.includes('解释这段')).click()`);
  await waitFor(`window.neuroshelf.load().then(l => l.papers.find(p=>p.title==='reader-verification').messages.filter(m=>m.role==='assistant').length===2)`);
  await waitFor(`!document.querySelector('button[aria-label="停止生成"]')`);
  assert.equal(codex.calls.length,2,'Left click on Explain uses the same membership route');
  await key('Escape');
  await waitFor(`!${visible('.reading-sidebar')}`);

  // Wheel across the page boundary, then verify selection and AI source page.
  assert.equal(await run(visible('.focus-pagination')),true);
  assert.equal(await run(`document.querySelectorAll('.continuous-page-slot').length`),2);
  const wheel=await run(`(() => {const r=document.querySelector('.continuous-page-slot[data-page-number="2"]').getBoundingClientRect();return {x:Math.round(innerWidth/2),y:Math.round(innerHeight/2),deltaY:-Math.ceil(r.top-24)};})()`);
  win.webContents.sendInputEvent({type:'mouseWheel',...wheel});
  await waitFor(`document.querySelector('input[aria-label="PDF 页码"]').value==='2' && document.querySelector('.continuous-page[data-pdf-page="2"]')?.dataset.ready==='true' && !document.querySelector('.render-status')`);
  assert.equal(win.isFullScreen(),true);
  const edge=await run(`({x:innerWidth-22,y:Math.round(innerHeight/2)})`);
  win.webContents.sendInputEvent({type:'mouseMove',...edge});
  await waitFor(visible('.reading-sidebar'));
  assert.equal(await run(`document.querySelector('.reader-workbench').classList.contains('focus-panel-left')`),false);
  assert.equal(codex.calls.length,2,'Hover opens AI without submitting a question');
  console.log('HOVER_AI_OK: moving to the right edge opens the existing assistant without sending a request.');
  await run(`document.querySelector('textarea[aria-label="向 AI 提问"]').focus()`);
  await win.webContents.insertText('Keep this draft when the sidebar closes');
  await key('Escape');await waitFor(`!${visible('.reading-sidebar')}`);
  win.webContents.sendInputEvent({type:'mouseMove',x:edge.x-100,y:edge.y});
  await run('new Promise(resolve => requestAnimationFrame(resolve))');
  win.webContents.sendInputEvent({type:'mouseMove',...edge});
  await waitFor(visible('.reading-sidebar'));
  assert.equal(await run(`document.querySelector('textarea[aria-label="向 AI 提问"]').value`),'Keep this draft when the sidebar closes');
  await key('Escape');await waitFor(`!${visible('.reading-sidebar')}`);
  await select('Attention and motor output',2);
  await run(`document.querySelector('button[aria-label="蓝色高亮"]').click()`);
  await waitFor(`Boolean(document.querySelector('.continuous-page[data-pdf-page="2"] .pdf-highlight.blue'))`);
  assert.equal(paper().highlights.find(h=>h.color==='blue').page,2);
  await run('document.activeElement?.blur()');await key('Z',['control']);
  await waitFor(`!document.querySelector('.pdf-highlight.blue')`);
  await select('Attention and motor output',2);await key('Space');
  await waitFor(`window.neuroshelf.load().then(l=>l.papers.find(p=>p.title==='reader-verification').messages.filter(m=>m.role==='assistant').length===3)`);
  await waitFor(`!document.querySelector('button[aria-label="停止生成"]')`);
  assert.equal(paper().messages.at(-1).page,2);
  assert.ok(JSON.stringify(codex.calls.at(-1)).includes('Attention and motor output'));
  await fs.writeFile(path.join(directory,'desktop-continuous-ai.png'),(await win.webContents.capturePage()).toPNG());
  await key('Escape');await waitFor(`!${visible('.reading-sidebar')}`);
  await key('F11');
  await waitFor(`!document.querySelector('.focus-mode') && document.querySelector('input[aria-label="PDF 页码"]').value==='2' && !document.querySelector('.render-status')`);
  await key('F11');
  await waitFor(`Boolean(document.querySelector('.focus-mode')) && document.querySelector('input[aria-label="PDF 页码"]').value==='2' && document.querySelector('.continuous-page[data-pdf-page="2"]')?.dataset.ready==='true' && !document.querySelector('.render-status')`);
  await run(`document.querySelector('button[aria-label="专注模式上一页"]').click()`);
  await waitFor(`document.querySelector('input[aria-label="PDF 页码"]').value==='1' && !document.querySelector('.render-status')`);
  // Direct page entry stays in fullscreen and normalizes non-integer input.
  for (const [value, expected] of [['1.5','1'], ['2','2']]) {
    await run(`document.querySelector('input[aria-label="专注模式页码"]').focus()`);
    await key('A',['control']); await win.webContents.insertText(value); await key('Enter');
    await waitFor(`document.querySelector('input[aria-label="专注模式页码"]').value===${JSON.stringify(expected)} && document.querySelector('.continuous-page[data-pdf-page="${expected}"]')?.dataset.ready==='true' && !document.querySelector('.render-status')`);
    assert.equal(win.isFullScreen(),true);
  }
  assert.equal(await run(`document.querySelector('button[aria-label="专注模式下一页"]').disabled`),true);
  await run(`document.querySelector('button[aria-label="专注模式上一页"]').click()`);
  await waitFor(`document.querySelector('input[aria-label="PDF 页码"]').value==='1' && !document.querySelector('.render-status')`);
  console.log('CONTINUOUS_FOCUS_OK: native wheel across pages, right-edge hover, preserved AI draft, page-2 highlights/context and focus re-entry at the reading position.');

  await key('F',['control']);
  try { await waitFor(`document.activeElement?.matches('.pdf-search input') && ${visible('.pdf-toolbar')}`); }
  catch(error) { console.log('FIND_STATE',await run(`({active:document.activeElement?.outerHTML,toolbar:document.querySelector('.pdf-toolbar')?.className,dialogs:document.querySelectorAll('dialog[open]').length})`));throw error; }
  await run('document.activeElement.blur()');
  await key('PageDown');
  await waitFor(`document.querySelector('input[aria-label="PDF 页码"]').value==='2' && !document.querySelector('.render-status')`);
  await key('PageUp');
  await waitFor(`document.querySelector('input[aria-label="PDF 页码"]').value==='1' && !document.querySelector('.render-status')`);
  await key('F1');
  await waitFor(`Boolean(document.querySelector('dialog[open].shortcut-help'))`);
  await key('Escape');
  await waitFor(`!document.querySelector('dialog[open]')`);
  assert.equal(win.isFullScreen(),true,'Closing shortcut help must retain focus mode');
  await key('Escape');
  await waitFor(`!document.querySelector('.focus-mode') && !document.querySelector('.render-status')`);
  assert.equal(win.isFullScreen(),false);

  // English focus controls use the same persisted interface preference.
  await run(`(() => { const s=document.querySelector('select[aria-label="Interface language / 界面语言"]');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(`document.documentElement.lang==='en' && Boolean(document.querySelector('button[aria-label="Enter focus reading"]'))`);
  await key('F11');
  await waitFor(`Boolean(document.querySelector('.focus-mode')) && !document.querySelector('.render-status')`);
  await select('Nigral input');
  await fs.writeFile(path.join(directory,'desktop-focus-tools-en.png'),(await win.webContents.capturePage()).toPNG());
  // An external native fullscreen exit also restores the app navigation.
  win.setFullScreen(false);
  await waitFor(`!document.querySelector('.focus-mode') && ${visible('.navigation-panel')} && !document.querySelector('.render-status')`);
  await key('K',['control']);
  await waitFor(`document.activeElement?.matches('input[aria-label="Search library"]')`);
  await key('O',['control']);
  await waitFor(`Boolean(document.querySelector('dialog[open] .import-dropzone, dialog[open] input[type="file"]'))`);
  await key('Escape');
  await waitFor(`!document.querySelector('dialog[open]')`);
  await run(`(() => { const s=document.querySelector('select[aria-label="Interface language / 界面语言"]');s.value='zh-CN';s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(`document.documentElement.lang==='zh-CN'`);
  await run(`window.neuroshelf.mutateHighlight(${JSON.stringify(paper().id)},{action:'remove',highlightId:${JSON.stringify(annotationId)}})`);
  // Reload to return a clean selection/editor state to the established reader checks.
  codex.calls.length=0;
  await win.reload();
  await waitFor(`Boolean(document.querySelector('input[aria-label="搜索文献库"]'))`);
  await run(`(() => {const i=document.querySelector('input[aria-label="搜索文献库"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'reader-verification');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor(`Boolean([...document.querySelectorAll('.card-title')].find(b=>b.textContent==='reader-verification'))`);
  await run(`[...document.querySelectorAll('.card-title')].find(b=>b.textContent==='reader-verification').click()`);
  await waitFor(`document.querySelector('.textLayer')?.textContent.includes('Nigral input') && !document.querySelector('.render-status')`);
  console.log('FOCUS_OK: native fullscreen, black surround, native text selection, contextual colors and AI, comments, popup dismissal and bilingual controls.');
  console.log('WORKSPACE_SHORTCUTS_OK: Ctrl S flushes the last keystroke to disk; native text undo, application undo/redo, find, search, import, pages and help.');
  return { focusReading:true, workspaceShortcuts:true, continuousReading:true, hoverAi:true };
}
module.exports={runFocusSmoke};
