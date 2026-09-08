const assert = require('node:assert/strict');
async function dragSidebar({ win, waitFor, handle, target, delta }) {
  const run = code => win.webContents.executeJavaScript(code);
  const before = await run(`document.querySelector(${JSON.stringify(target)}).getBoundingClientRect().width`);
  const point = await run(`(() => { const r = document.querySelector(${JSON.stringify(handle)}).getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(Math.min(window.innerHeight-70,Math.max(r.y+40,r.y+r.height/2)))}; })()`);
  win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  await waitFor(`document.body.classList.contains('panel-resizing')`);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: point.x + delta, y: point.y, button: 'left' });
  await run('new Promise(resolve => requestAnimationFrame(resolve))');
  win.webContents.sendInputEvent({ type: 'mouseUp', x: point.x + delta, y: point.y, button: 'left', clickCount: 1 });
  await waitFor(`Math.abs(document.querySelector(${JSON.stringify(target)}).getBoundingClientRect().width - ${before}) >= ${Math.abs(delta) - 3}`);
  await waitFor(`!document.body.classList.contains('panel-resizing')`);
  return run(`document.querySelector(${JSON.stringify(target)}).getBoundingClientRect().width`);
}
async function runLayoutSmoke({ win, waitFor }) {
  const run = code => win.webContents.executeJavaScript(code);
  await run(`document.querySelector('.nav-item[title="全部文献"]').click()`);
  await waitFor(`Boolean(document.querySelector('.library-resizer'))`);
  const nav = await dragSidebar({ win, waitFor, handle: '.navigation-resizer', target: '.sidebar', delta: 48 });
  const library = await dragSidebar({ win, waitFor, handle: '.library-resizer', target: '.library-aside', delta: -48 });
  await win.reload();
  await waitFor(`Boolean(document.querySelector('.library-aside'))`);
  assert.equal(await run(`document.querySelector('.sidebar').getBoundingClientRect().width`), nav);
  assert.equal(await run(`document.querySelector('.library-aside').getBoundingClientRect().width`), library);
  await run(`document.querySelector('.navigation-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
  await waitFor(`document.querySelector('.sidebar').getBoundingClientRect().width === ${nav + 24}`);
  await run(`for (const selector of ['.navigation-resizer','.library-resizer']) document.querySelector(selector).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await waitFor(`document.querySelector('.sidebar').getBoundingClientRect().width === 222 && document.querySelector('.library-aside').getBoundingClientRect().width === 247`);
  assert.ok(await run(`document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('.paper-list-area').clientWidth >= 330`));
  console.log('LAYOUT_OK: native navigation and library sidebar dragging, keyboard adjustment, reset and independent widths across reload.');
  return { adjustableSidebars: true };
}
module.exports = { dragSidebar, runLayoutSmoke };
