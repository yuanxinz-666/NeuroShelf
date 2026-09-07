// Isolated desktop verification only. Generated records and images never enter a user project.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
async function runExperimentsSmoke({ win, projects, waitFor, directory }) {
  const run = code => win.webContents.executeJavaScript(code), store = projects.get('sc-snr').store;
  const tick = () => run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const set = (selector, value) => `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw Error('Missing '+${JSON.stringify(selector)}); const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true})); })();`;
  const saved = () => waitFor(`document.querySelector('.exp-editor-head .exp-save')?.dataset.saveState === 'saved'`);
  const select = async id => { await run(`document.querySelector('.exp-map-node[data-node-id="${id}"] .exp-node-main').click()`); await waitFor(`document.querySelector('.exp-editor')?.dataset.nodeId === '${id}'`); };
  const add = async (title, status, child = false) => {
    const old = await run(`document.querySelector('.exp-editor')?.dataset.nodeId || ''`);
    await run(child ? `document.querySelector('.exp-editor-actions .button').click()` : `document.querySelector('.exp-heading .button.primary').click()`);
    await waitFor(`Boolean(document.querySelector('.exp-title-input')) && document.querySelector('.exp-editor').dataset.nodeId !== '${old}'`);
    await run(set('input[aria-label="实验步骤名称"]', title) + set('select[aria-label="实验当前状态"]', status)); await saved();
    return run(`document.querySelector('.exp-editor').dataset.nodeId`);
  };
  await run(`document.querySelector('.nav-item[title="实验进程"]').click()`); await waitFor(`Boolean(document.querySelector('.exp-empty'))`);
  assert.equal(store.get().experiments, undefined);
  const rootId = await add('视觉行为实验路线（测试）', 'active');
  await run(set('textarea[aria-label="实验目的"]', '示例：记录实验目的与对照条件') + set('textarea[aria-label="实验过程与结果"]', '实验记录：这是隔离测试，不是实际科研结果。') + set('textarea[aria-label="实验下一步"]', '整理样本编号，并记录下一次实验条件。') + set('input[aria-label="实验日期"]', '2026-09-07') + `document.querySelector('.nav-item[title="PI 与实验室"]').click()`);
  await waitFor(`Boolean(document.querySelector('.people-page'))`);
  assert.equal(store.get().experiments.nodes[0].record, '实验记录：这是隔离测试，不是实际科研结果。');
  await run(`document.querySelector('.nav-item[title="实验进程"]').click()`); await waitFor(`Boolean(document.querySelector('.exp-map-node'))`); await select(rootId);
  // A failed save must block navigation while retaining the editable draft.
  const original = store.changeExperiment; let fail = true;
  store.changeExperiment = function(change) { if (change.action === 'update' && change.patch?.record && fail) { fail = false; return Promise.reject(new Error('模拟实验记录写入失败')); } return original.call(this, change); };
  try {
    await run(set('textarea[aria-label="实验过程与结果"]', '保存重试后的实验记录。') + `document.querySelector('.nav-item[title="全部文献"]').click()`);
    await waitFor(`document.querySelector('.exp-editor-head .exp-save')?.dataset.saveState === 'error'`);
    assert.equal(await run(`document.querySelector('textarea[aria-label="实验过程与结果"]').value`), '保存重试后的实验记录。');
    await run(`document.querySelector('.exp-editor-head .exp-save button').click()`); await saved();
    assert.equal(store.get().experiments.nodes[0].record, '保存重试后的实验记录。');
  } finally { store.changeExperiment = original; }
  const doneId = await add('整理预实验记录（测试）', 'done', true);
  await run(set('textarea[aria-label="实验过程与结果"]', '仅用于验证软件：条件、样本及观察记录。') + set('textarea[aria-label="实验下一步"]', '核对原始数据与分析条件。')); await saved();
  await run(`(async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; const ctx = c.getContext('2d'); ctx.fillStyle = '#f3f7ed'; ctx.fillRect(0,0,640,360); ctx.fillStyle = '#2c6651'; ctx.font = '22px sans-serif'; ctx.fillText('TEST FIXTURE - evidence import',36,48); ctx.strokeStyle = '#94b295'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(40,292); ctx.lineTo(598,292); ctx.stroke(); ['#6c9b7d','#a7bea0','#e0bf82','#69a0b7'].forEach((color,i) => {ctx.fillStyle=color;ctx.fillRect(64+i*130,200-i*28,68,92+i*28);}); const blob = await new Promise(resolve => c.toBlob(resolve,'image/png')); const file = new File([blob],'隔离测试图片.png',{type:'image/png'}); const data = new DataTransfer(); data.items.add(file); const input = document.querySelector('input[aria-label="导入实验证据图片"]'); input.files = data.files; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(`document.querySelector('.exp-evidence img')?.naturalWidth === 640 && !document.querySelector('.exp-drop').disabled`);
  assert.equal(store.get().experiments.nodes.find(n => n.id === doneId).evidence.length, 1);
  await run(set('.exp-evidence textarea', '测试图片：用于验证原图保存、说明和备份，不代表实验结果。'));
  await waitFor(`document.querySelector('.exp-evidence .exp-save')?.dataset.saveState === 'saved'`);
  await run(`document.querySelector('.exp-image-button').click()`); await waitFor(`document.querySelector('.exp-dialog')?.matches(':modal') && document.querySelector('.exp-full-image img')?.naturalWidth === 640`); await tick();
  await fs.writeFile(path.join(directory, 'desktop-experiment-image.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.exp-dialog header button').click()`);
  await select(rootId); const plannedId = await add('补充实验条件（测试）', 'planned', true);
  const blockedId = await add('样本与分析准备（测试）', 'blocked');
  await run(set('textarea[aria-label="实验下一步"]', '等待补齐批次信息后再继续。')); await saved();
  // Fold and unfold, reparent safely, then restore the original branch.
  await run(`document.querySelector('.exp-fold').click()`); await waitFor(`!document.querySelector('.exp-map-node[data-node-id="${doneId}"]')`);
  await run(`document.querySelector('.exp-fold').click()`); await waitFor(`Boolean(document.querySelector('.exp-map-node[data-node-id="${doneId}"]'))`);
  await select(plannedId); await run(set('select[aria-label="实验所属分支"]', blockedId)); await saved();
  assert.equal(store.get().experiments.nodes.find(n => n.id === plannedId).parentId, blockedId);
  await run(set('select[aria-label="实验所属分支"]', rootId)); await saved();
  await run(`document.querySelector('button[aria-label="归档此实验分支"]').click()`); await waitFor(`Boolean(document.querySelector('.exp-dialog footer .primary'))`);
  await run(`document.querySelector('.exp-dialog footer .primary').click()`); await waitFor(`!document.querySelector('.exp-dialog') && !document.querySelector('.exp-map-node[data-node-id="${plannedId}"]')`);
  await run(`[...document.querySelectorAll('.exp-heading-actions button')].find(b=>b.textContent.includes('归档')).click()`); await waitFor(`Boolean(document.querySelector('.exp-archive-list .button'))`);
  await run(`document.querySelector('.exp-archive-list .button').click()`); await waitFor(`Boolean(document.querySelector('.exp-map-node[data-node-id="${plannedId}"]')) && !document.querySelector('.exp-dialog')`);
  await run(set('input[aria-label="搜索文献库"]', '测试图片') + `document.querySelectorAll('.exp-view-switch button')[1].click()`); await waitFor(`document.querySelectorAll('.exp-list-item').length === 1`);
  await run(set('input[aria-label="搜索文献库"]', '') + `document.querySelectorAll('.exp-view-switch button')[0].click()`); await waitFor(`Boolean(document.querySelector('.exp-map-node'))`);
  const other = projects.index.projects.find(p => p.id !== 'sc-snr');
  await select(rootId);
  await run(set('textarea[aria-label="实验过程与结果"]', '切换项目时保留实验草稿。') + `(() => { const s = document.querySelector('select[aria-label="切换研究项目"]'); s.value = '${other.id}'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(`document.querySelector('select[aria-label="切换研究项目"]')?.value === '${other.id}' && !document.querySelector('.project-switching')`);
  assert.equal(store.get().experiments.nodes.find(n => n.id === rootId).record, '切换项目时保留实验草稿。'); assert.equal(projects.get(other.id).store.get().experiments, undefined);
  await run(`document.querySelector('.nav-item[title="实验进程"]').click()`); await waitFor(`Boolean(document.querySelector('.exp-empty'))`);
  await run(`(() => { const s = document.querySelector('select[aria-label="切换研究项目"]'); s.value = 'sc-snr'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(`document.querySelector('select[aria-label="切换研究项目"]')?.value === 'sc-snr' && !document.querySelector('.project-switching')`);
  await run(`document.querySelector('.nav-item[title="实验进程"]').click()`); await waitFor(`Boolean(document.querySelector('.exp-map-node'))`); await select(doneId);
  await waitFor(`document.querySelector('.exp-evidence img')?.naturalWidth === 640`);
  // Pasting a duplicate image and navigating immediately waits for the import operation.
  const evidence = store.get().experiments.nodes.find(n => n.id === doneId).evidence[0];
  await run(`(async()=>{ const bytes = await window.neuroshelf.readEvidence('${doneId}','${evidence.id}'); const data = new DataTransfer(); data.items.add(new File([bytes], '粘贴的截图.png', {type:'image/png'})); document.querySelector('.exp-editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true})); document.querySelector('.nav-item[title="全部文献"]').click(); })()`);
  await waitFor(`Boolean(document.querySelector('.paper-card'))`); assert.equal(store.get().experiments.nodes.find(n => n.id === doneId).evidence.length, 1);
  await run(`document.querySelector('.nav-item[title="实验进程"]').click()`); await waitFor(`Boolean(document.querySelector('.exp-map-node'))`); await select(doneId);
  await waitFor(`document.querySelector('.exp-evidence img')?.naturalWidth === 640`);
  await run(`document.querySelector('button[aria-label="适应实验导图"]').click()`); await tick();
  await fs.writeFile(path.join(directory, 'desktop-experiments.png'), (await win.webContents.capturePage()).toPNG());
  await run(`(() => { const input = document.querySelector('select[aria-label="Interface language / 界面语言"]'); input.value = 'en'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.documentElement.lang === 'en' && !document.querySelector('select[aria-label="Interface language / 界面语言"]').disabled`);
  await fs.writeFile(path.join(directory, 'desktop-experiments-english.png'), (await win.webContents.capturePage()).toPNG());
  await run(`(() => { const input = document.querySelector('select[aria-label="Interface language / 界面语言"]'); input.value = 'zh-CN'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.documentElement.lang === 'zh-CN' && !document.querySelector('select[aria-label="Interface language / 界面语言"]').disabled`);
  await run(`document.querySelector('.exp-editor-body').scrollTop = document.querySelector('.exp-editor-body').scrollHeight`); await tick();
  await fs.writeFile(path.join(directory, 'desktop-experiments-evidence.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.exp-editor-body').scrollTop = 0`); await tick();
  const bounds = win.getBounds(); win.setSize(1180, 850); await tick();
  await run(`document.querySelector('button[aria-label="适应实验导图"]').click()`); await tick();
  assert.ok(await run(`document.querySelector('.exp-editor-body').clientWidth >= 285 && document.querySelector('.exp-map-viewport').clientWidth > 300 && document.documentElement.scrollWidth <= window.innerWidth`));
  await fs.writeFile(path.join(directory, 'desktop-experiments-1180.png'), (await win.webContents.capturePage()).toPNG());
  win.setBounds(bounds); await tick();
  await run(`document.querySelector('.nav-item[title="全部文献"]').click()`); await waitFor(`Boolean(document.querySelector('.paper-card'))`);
  console.log('EXPERIMENTS_OK: tree, drafts, failure retry, images, preview, archive, restore, project isolation and 1180px layout.');
  return { experiments: true, experimentCloseNodeId: rootId };
}
module.exports = { runExperimentsSmoke };
