const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, safeStorage, protocol, net, session, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { LibraryStore } = require('./store.cjs');
const { buildRequest, streamResponse } = require('./ai.cjs');
const { CodexReader } = require('./codex.cjs');
const { migrateSettings, nextSettings } = require('./ai-settings.cjs');
const { Preferences, responseLanguage } = require('./preferences.cjs');
const { createTranslator } = require('../data/locales/core.mjs');
const translator = createTranslator(require('../data/locales/en.json'));
let uiPreferences;
const tr = (text, ...values) => translator.translate(uiPreferences?.get().locale || 'en', text, ...values);
const localError = text => translator.message(uiPreferences?.get().locale || 'en', text);
const READING_MODEL = require('../data/ai-model.json');
const { syncInbox } = require('./weekly.cjs');
const { ProjectManager } = require('./projects.cjs');
const { syncPeople } = require('./people.cjs');
const { AsyncLocalStorage } = require('node:async_hooks');
const { ResearchJobs } = require('./research.cjs');
const { downloadMissing } = require('./downloads.cjs');
const projectScope = new AsyncLocalStorage();
let projects, research, switching = false;
const getContext = () => projectScope.getStore() || projects.get();
const getStore = () => getContext().store;

protocol.registerSchemesAsPrivileged([{ scheme: 'neuroshelf', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.setName('NeuroShelf');
if (process.env.NEUROSHELF_DATA_DIR) app.setPath('userData', path.resolve(process.env.NEUROSHELF_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.exit(0);
let win, settingsFile, codex;
let closeApproved = false, closePending = false;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
let prefs = migrateSettings();
const activeRequests = new Map();
const activeTasks = new Set();
const publicSettings = () => ({ provider: prefs.provider, model: READING_MODEL.id, effort: prefs.effort, hasKey: Boolean(prefs.encryptedKey), codex: { ...(codex?.cached || { checked: false, connected: false }), models: (codex?.cached?.models || []).filter(item => item.id === READING_MODEL.id) }, desktop: true, dataPath: getStore().directory });
const safeError = e => String(e?.message || '操作失败，请重试。').replace(/sk-[a-zA-Z0-9_-]+/g, '[已隐藏]');
function register(channel, handler) {
  ipcMain.handle(channel, async (event, scopeId, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || !event.senderFrame.url.startsWith('neuroshelf://app/')) throw new Error(tr('无效的请求来源。'));
    if (switching || scopeId !== projects.index.activeId) throw new Error(tr('项目已切换，请在当前项目重试。'));
    try { return await projectScope.run(projects.get(scopeId), () => handler(...args)); }
    catch (error) { throw new Error(localError(safeError(error))); }
  });
}
function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('链接无效。');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('只允许打开 HTTPS 论文链接。');
  return url.href;
}
async function initialize() {
  if (process.argv.includes('--smoke-test') && !process.env.NEUROSHELF_DATA_DIR) throw new Error('桌面测试必须指定隔离资料目录。');
  uiPreferences = new Preferences(app.getPath('userData'));
  await uiPreferences.init();
  projects = new ProjectManager({ userData: app.getPath('userData'), seedPath: path.join(app.getAppPath(), 'data/library.json') });
  await projects.init();
  const seedPeople = require('../data/sc-snr-people.json');
  const sc = await projects.open('sc-snr');
  await require('./people.cjs').publishPeople(path.join(sc.directory, 'inbox', 'people'), seedPeople);
  await sc.store.ingestPeople([seedPeople]);
  research = new ResearchJobs({ workspace: path.join(app.getPath('userData'), 'research-workspace'), download: downloadMissing });
  ipcMain.on('project:identity', event => {
    if (win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url.startsWith('neuroshelf://app/')) event.returnValue = projects.index.activeId;
    else event.returnValue = null;
  });
  const syncWeekly = () => {
    const context = getContext();
    if (context.sync) return context.sync;
    context.sync = (async () => {
      const result = await syncInbox(context.store, path.join(context.directory, 'inbox', 'papers'));
      const people = await syncPeople(context.store, path.join(context.directory, 'inbox', 'people'));
      result.people = people.people; result.errors.push(...people.errors);
      let schedule = null;
      if (context.project.weeklyEnabled) {
        try { const raw = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'weekly-inbox', 'schedule.json'), 'utf8')); if (raw.status === 'ACTIVE') schedule = { label: raw.label, configuredAt: raw.configuredAt }; }
        catch (e) { if (e.code !== 'ENOENT') result.errors.push({ file: 'schedule.json', message: '筛选计划无法读取。' }); }
      }
      return { ...result, schedule };
    })().finally(() => { context.sync = null; });
    return context.sync;
  };
  register('projects:list', () => projects.list());
  register('projects:create', raw => projects.create(raw));
  register('projects:update', raw => projects.update(getContext().project.id, raw));
  register('projects:folder', () => shell.openPath(getContext().directory));
  register('people:update', (id, patch) => getStore().updatePerson(id, patch));
  register('people:research', (piId, mode = 'dossier') => { if (!['dossier', 'bibliography'].includes(mode)) throw new Error('档案更新类型无效。'); return research.start(getContext(), mode, prefs.effort, { piId }); });
  register('people:rankings', async () => {
    const result = await dialog.showOpenDialog(win, { title: tr("导入学校获取的期刊分区表"), filters: [{ name: tr("期刊分区数据"), extensions: ['json', 'csv'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    const file = result.filePaths[0]; if ((await fs.stat(file)).size > 16 * 1024 * 1024) throw new Error('分区表不能超过 16 MB。');
    const bytes = await fs.readFile(file), text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
    return getStore().importRankings(require('./journal-rankings.cjs').parseRankings(text, /\.csv$/i.test(file)));
  });
  register('research:status', () => research.state(getContext()));
  register('research:start', kind => research.start(getContext(), kind, prefs.effort));
  register('research:stop', () => research.stop(getContext().project.id));
  register('projects:activate', async id => {
    switching = true;
    try {
      for (const controller of activeRequests.values()) controller.abort();
      await Promise.allSettled([...activeTasks]);
      await getContext().sync; await getStore().queue;
      return await projects.activate(id);
    } finally { switching = false; }
  });
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    const saved = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
    prefs = migrateSettings(saved);
  }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('AI 设置文件无法读取，请检查 settings.json。'); }
  codex = process.argv.includes('--smoke-test') ? require('./shortcut-smoke.cjs').mockCodex() : new CodexReader({ directory: path.join(app.getPath('userData'), 'reader-workspace') });
  protocol.handle('neuroshelf', request => {
    const url = new URL(request.url);
    const root = path.resolve(app.getAppPath(), 'dist');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (url.host !== 'app' || !file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  register('library:load', () => getStore().get());
  register('library:update', (id, patch) => getStore().update(id, patch));
  register('library:highlight', (id, change) => getStore().mutateHighlight(id, change));
  register('experiments:change', change => getStore().changeExperiment(change?.action === "add" && !change.title ? { ...change, title: tr("新的实验步骤") } : change));
  register('experiments:image-import', payload => {
    const bytes = Buffer.from(payload.bytes);
    require('./experiments.cjs').verifyImage(bytes);
    const image = require('electron').nativeImage.createFromBuffer(bytes), size = image.getSize();
    if (image.isEmpty() || size.width * size.height > 40000000) throw new Error('图片无法解码或超过 4000 万像素，请导出较小的 PNG 后重试。');
    return getStore().importEvidence(payload);
  });
  register('experiments:image-read', (nodeId, evidenceId) => getStore().readEvidence(nodeId, evidenceId));
  register('weekly:sync', syncWeekly);
  register('weekly:decide', async (id, action) => { if (getContext().sync) await getContext().sync; return getStore().decideWeekly(id, action); });
  register('pdf:import', payload => getStore().importPdf(payload));
  register('pdf:read', id => getStore().readPdf(id));
  register('pdf:detach', id => getStore().detachPdf(id));
  register('backup:export', async () => {
    const result = await dialog.showOpenDialog(win, { title: tr("选择完整备份的保存位置"), properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled) return null;
    const destination = await getStore().backup(result.filePaths[0]);
    shell.showItemInFolder(path.join(destination, 'library.json'));
    return destination;
  });
  register('backup:restore', async () => {
    const result = await dialog.showOpenDialog(win, { title: tr("选择备份文件夹中的 library.json"), filters: [{ name: tr("NeuroShelf 备份"), extensions: ['json'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    return getStore().restore(result.filePaths[0]);
  });
  register('backup:legacy', raw => getStore().importLegacy(raw));
  register('settings:get', () => publicSettings());
  register('preferences:get', () => uiPreferences.get());
  register('preferences:save', async patch => { const result = await uiPreferences.update(patch); if (win) win.setTitle(result.locale === 'zh-CN' ? 'NeuroShelf · 神经文献' : 'NeuroShelf · Research workspace'); return result; });
  register('codex:status', async () => { await codex.status(); return publicSettings(); });
  register('codex:login', async () => { const result = await codex.login(); await shell.openExternal(result.url); return true; });
  register('settings:save', async value => {
    const next = nextSettings(prefs, value, codex?.cached);
    if (value.removeKey) next.encryptedKey = null;
    if (value.key) {
      if (typeof value.key !== 'string' || value.key.length > 1000 || /\s/.test(value.key)) throw new Error('API Key 格式无效。');
      if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全保存密钥，请检查 Windows 用户凭据环境。');
      next.encryptedKey = safeStorage.encryptString(value.key).toString('base64');
    }
    await fs.writeFile(settingsFile + '.tmp', JSON.stringify(next), 'utf8');
    await fs.rename(settingsFile + '.tmp', settingsFile);
    prefs = next;
    return publicSettings();
  });
  register('external:open', url => shell.openExternal(httpsUrl(url)));
  register('clipboard:write', value => {
    if (typeof value !== 'string' || value.length > 2000000) throw new Error('复制内容为空或过长。');
    clipboard.writeText(value);
    return true;
  });
  register('data:open', () => shell.openPath(getStore().directory));
  register('ai:cancel', id => { activeRequests.get(id)?.abort(); return true; });
  register('ai:ask', async payload => {
    if (!payload || typeof payload.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(payload.requestId)) throw new Error('请求编号无效。');
    if (activeRequests.size) throw new Error('请等待当前回答结束，或点击停止。');
    const provider = prefs.provider, model = READING_MODEL.id, effort = prefs.effort;
    if (!['codex', 'api'].includes(provider)) throw new Error('当前使用手动复制，请点击「复制问题与上下文」。');
    if (provider === 'api' && !prefs.encryptedKey) throw new Error('请先在设置中连接 OpenAI API。');
    const paper = getStore().find(payload.paperId);
    const answerLanguage = responseLanguage(uiPreferences.get(), payload.answerLanguage);
    const request = buildRequest(payload, paper, effort, answerLanguage);
    let key;
    try { if (provider === 'api') key = safeStorage.decryptString(Buffer.from(prefs.encryptedKey, 'base64')); }
    catch { throw new Error('无法解密密钥，请在本机重新填写 API Key。'); }
    const controller = new AbortController();
    activeRequests.set(payload.requestId, controller);
    const userMessage = { id: payload.requestId + '_u', role: 'user', content: payload.question, page: payload.page, selection: String(payload.selection || '').slice(0, 20000), createdAt: new Date().toISOString() };
    const send = event => { if (win && !win.isDestroyed()) win.webContents.send('ai:event', { requestId: payload.requestId, projectId: getContext().project.id, paperId: payload.paperId, ...event }); };
    let partial = '';
    const timeoutMs = ['max', 'ultra'].includes(effort) ? 600000 : ['high', 'xhigh'].includes(effort) ? 300000 : 180000;
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const task = (async () => {
      try {
        await getStore().update(paper.id, { messages: [...paper.messages || [], userMessage] });
        const options = { request, signal: controller.signal, onDelta: delta => { partial += delta; send({ type: 'delta', delta }); } };
        const content = provider === 'codex' ? await codex.explain(options) : await streamResponse({ ...options, key });
        const current = getStore().find(paper.id);
        const updated = await getStore().update(paper.id, { messages: [...current.messages, { id: payload.requestId + '_a', role: 'assistant', content, page: payload.page, model, effort, provider, createdAt: new Date().toISOString() }] });
        send({ type: 'done', paper: updated });
      } catch (e) {
        const message = localError(controller.signal.aborted ? (controller.signal.reason === 'timeout' ? '等待超时，请稍后重试。' : '已停止生成。') : safeError(e));
        try {
          const current = getStore().find(paper.id);
          const updated = await getStore().update(paper.id, { messages: [...current.messages, { id: payload.requestId + '_a', role: 'assistant', content: partial ? partial + '\n\n' + message : message, error: true, page: payload.page, model, effort, provider, createdAt: new Date().toISOString() }] });
          send({ type: 'error', error: message, paper: updated });
        } catch { send({ type: 'error', error: message + tr(' 本次对话保存失败，请复制保留。') }); }
      } finally { clearTimeout(timer); activeRequests.delete(payload.requestId); key = null; }
    })();
    activeTasks.add(task);
    task.finally(() => activeTasks.delete(task));
    return { started: true };
  });
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1500, height: 980, minWidth: 1060, minHeight: 720,
    title: uiPreferences.get().locale === 'zh-CN' ? 'NeuroShelf · 神经文献' : 'NeuroShelf · Research workspace', icon: path.join(app.getAppPath(), 'build/icon.ico'), backgroundColor: '#f7f8f6', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { shell.openExternal(httpsUrl(url)).catch(() => {}); } catch {}
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('neuroshelf://app/')) event.preventDefault(); });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  ipcMain.on('app:close-ready', async (event, ok) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
    if (!ok) { closePending = false; dialog.showErrorBox(tr('笔记尚未保存'), tr('保存失败，窗口保持打开。请先复制笔记或重试保存。')); return; }
    for (const controller of activeRequests.values()) controller.abort();
    await Promise.allSettled([...activeTasks]);
    await research.close();
    await getStore().queue;
    await uiPreferences.queue;
    closeApproved = true;
    win?.close();
  });
  win.on('close', event => {
    if (closeApproved) return;
    event.preventDefault();
    if (!closePending) { closePending = true; win.webContents.send('app:before-close'); }
  });
  win.once('ready-to-show', () => { if (!process.argv.includes('--smoke-test')) win.show(); });
  win.on('closed', () => { for (const controller of activeRequests.values()) controller.abort(); win = null; });
  await win.loadURL('neuroshelf://app/');
  if (process.argv.includes('--smoke-test')) {
    // The smoke test only inspects our own packaged renderer and bridge; no user browser state.
    await new Promise(resolve => setTimeout(resolve, 1800));
    const languageWaitFor = async condition => {
      for (let tries = 0; tries < 100; tries++) { if (await win.webContents.executeJavaScript(condition)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
      throw new Error('Language UI condition timed out: ' + condition);
    };
    const languageChecks = await require('./language-smoke.cjs').runLanguageSmoke({ win, directory: app.getPath('userData'), waitFor: languageWaitFor });
    const result = await win.webContents.executeJavaScript(`(async()=>({title:document.title, text:document.body.innerText, bridge:Boolean(window.neuroshelf), keyExposed:'key' in await window.neuroshelf.settings()}))()`);
    await win.webContents.executeJavaScript(`window.neuroshelf.copyText('NeuroShelf clipboard verification')`);
    if (clipboard.readText() !== 'NeuroShelf clipboard verification') throw new Error('Desktop clipboard test failed.');
    console.log('CLIPBOARD_OK');
    if (!result.bridge || result.keyExposed || !result.text.includes('107')) throw new Error('Packaged renderer smoke test failed: ' + JSON.stringify(result));
    console.log('SMOKE_OK', JSON.stringify({ title: result.title, bridge: result.bridge, papers: getStore().get().papers.length, keyExposed: result.keyExposed }));
    const image = await win.webContents.capturePage();
    await fs.writeFile(path.join(app.getPath('userData'), 'desktop-smoke.png'), image.toPNG());
    if (process.env.NEUROSHELF_SMOKE_PDF) {
      await require('./downloads.cjs').verifyDownloaded({ title: 'NeuroShelf reader verification' }, await fs.readFile(process.env.NEUROSHELF_SMOKE_PDF));
      console.log('PDF_DOWNLOAD_VERIFIER_OK: packaged PDF parser accepts the matching title.');
      await getStore().importPdf({ name: 'reader-verification.pdf', bytes: await fs.readFile(process.env.NEUROSHELF_SMOKE_PDF) });
      await win.reload();
      const waitFor = async condition => {
        for (let tries = 0; tries < 80; tries++) {
          if (await win.webContents.executeJavaScript(condition)) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('Desktop UI condition timed out: ' + condition);
      };
      await waitFor(`Boolean(document.querySelector('input[aria-label="搜索文献库"]'))`);
      const projectChecks = await require('./projects-smoke.cjs').runProjectsSmoke({ win, projects, research, waitFor });
      const weeklyChecks = await require('./weekly-smoke.cjs').runWeeklySmoke({ win, store: getStore(), waitFor, directory: app.getPath('userData') });
      const reviewChecks = await require('./paper-review-smoke.cjs').runPaperReviewSmoke({ win, projects, waitFor, directory: app.getPath('userData') });
      const experimentChecks = await require('./experiments-smoke.cjs').runExperimentsSmoke({ win, projects, waitFor, directory: app.getPath('userData') });
      await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('input[aria-label="搜索文献库"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'reader-verification');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await waitFor(`Boolean([...document.querySelectorAll('button.card-title')].find(b=>b.textContent==='reader-verification'))`);
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('button.card-title')].find(b=>b.textContent==='reader-verification').click()`);
      await waitFor(`Boolean(document.querySelector('.textLayer')?.textContent.includes('NeuroShelf reader verification')) && !document.querySelector('.render-status')`);
      const readerImage = await win.webContents.capturePage();
      await fs.writeFile(path.join(app.getPath('userData'), 'desktop-reader.png'), readerImage.toPNG());
      console.log('PDF_RENDER_OK: local PDF bytes, worker, canvas and selectable text work in the desktop app.');
      const shortcuts = await require('./shortcut-smoke.cjs').runShortcutSmoke({ win, store: getStore(), waitFor, register, codex, getEffort: () => prefs.effort });
      const readerChecks = await require('./reader-smoke.cjs').runReaderSmoke({ win, store: getStore(), waitFor, directory: app.getPath('userData') });
      await fs.writeFile(path.join(app.getPath('userData'), 'smoke-result.json'), JSON.stringify({ bridge: true, papers: 107, pdfRendered: true, clipboard: true, ...languageChecks, ...shortcuts, ...readerChecks, ...weeklyChecks, ...projectChecks, ...reviewChecks, ...experimentChecks }));
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('.document-tabs button')].find(b=>b.textContent.includes('我的笔记')).click()`);
      await waitFor(`Boolean(document.querySelector('textarea[aria-label="论文笔记"]'))`);
      await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea[aria-label="论文笔记"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Desktop close flush sentinel');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.annotation-card textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Annotation close flush sentinel');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.paper-review input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Personal review close flush sentinel');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await win.webContents.executeJavaScript(`document.querySelector('.nav-item[title="实验进程"]').click()`);
      await waitFor(`Boolean(document.querySelector('.exp-map-node[data-node-id="${experimentChecks.experimentCloseNodeId}"]'))`);
      await win.webContents.executeJavaScript(`document.querySelector('.exp-map-node[data-node-id="${experimentChecks.experimentCloseNodeId}"] .exp-node-main').click()`);
      await waitFor(`Boolean(document.querySelector('textarea[aria-label="实验过程与结果"]'))`);
      await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('textarea[aria-label="实验过程与结果"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Experiment close flush sentinel');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      win.close();
    } else { closeApproved = true; app.quit(); }
  }
}
app.whenReady().then(initialize).catch(async error => {
  console.error(safeError(error));
  if (process.argv.includes('--smoke-test') && win && !win.isDestroyed()) {
    try { await fs.writeFile(path.join(app.getPath('userData'), 'smoke-error.txt'), safeError(error), 'utf8'); } catch {}
    try { await fs.writeFile(path.join(app.getPath('userData'), 'desktop-error.png'), (await win.webContents.capturePage()).toPNG()); } catch {}
  }
  if (!process.argv.includes('--smoke-test')) dialog.showErrorBox(tr('NeuroShelf 启动失败'), localError(safeError(error)));
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { for (const controller of activeRequests.values()) controller.abort(); codex?.close(); });
