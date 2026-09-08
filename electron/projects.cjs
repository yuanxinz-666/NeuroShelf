const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { renameWithRetry } = require('./files.cjs');
const { LibraryStore, validateLibrary } = require('./store.cjs');

const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
const DEFAULT_PROJECT = {
  id: 'sc-snr', name: 'SC–SNr', question: 'SNr 如何调节上丘 SC 的 Pitx2 细胞、空间优先级和感觉运动选择？',
  keywords: ['superior colliculus', 'substantia nigra pars reticulata', 'Pitx2', 'visual competition', 'spatial priority', 'sensorimotor selection'],
  species: '小鼠为主；灵长类相关环路作比较', exclusions: '排除与环路机制无关的纯临床、行政和目录记录', weeklyEnabled: true,
};
function metadata(raw, base = {}) {
  const next = { ...base };
  for (const [key, max] of [['name', 100], ['question', 5000], ['species', 500], ['exclusions', 2000]]) {
    const value = raw[key] ?? base[key] ?? '';
    if (typeof value !== 'string' || value.length > max || (['name', 'question'].includes(key) && !value.trim())) throw new Error('请填写项目名称和研究问题，内容不能过长。');
    next[key] = value.trim();
  }
  const words = raw.keywords ?? base.keywords ?? [];
  next.keywords = Array.isArray(words) ? words : String(words).split(/[,，;；\n]/);
  if (next.keywords.length > 60 || next.keywords.some(k => typeof k !== 'string' || k.length > 300)) throw new Error('关键词格式无效。');
  next.keywords = [...new Set(next.keywords.map(k => k.trim()).filter(Boolean))];
  next.weeklyEnabled = (raw.weeklyEnabled ?? base.weeklyEnabled) === true;
  next.updatedAt = new Date().toISOString();
  return next;
}
async function atomicJson(file, data) {
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await renameWithRetry(temp, file);
}
async function resolveRoot(userData) {
  let config;
  try {
    config = JSON.parse(await fs.readFile(path.join(userData, 'projects-location.json'), 'utf8'));
  } catch (e) { if (e.code !== 'ENOENT') throw e; return path.join(userData, 'projects'); }
  if (!path.isAbsolute(config.directory || '')) throw new Error('项目资料目录必须为绝对路径。');
  const directory = path.resolve(config.directory);
  // A remembered folder must never turn into a fresh sample library when unavailable.
  try { await fs.access(path.join(directory, 'index.json')); }
  catch { throw new Error('已保存的项目资料夹无法读取。请检查磁盘或同步状态；现有资料未被覆盖。'); }
  return directory;
}
class ProjectManager {
  constructor({ userData, seedPath, root, existingOnly = false }) { Object.assign(this, { userData, seedPath, root, existingOnly }); this.contexts = new Map(); this.queue = Promise.resolve(); }
  enqueue(action) { const work = this.queue.then(action); this.queue = work.catch(() => {}); return work; }
  async init() {
    this.root ||= await resolveRoot(this.userData);
    if (this.existingOnly) {
      try { await fs.access(path.join(this.root, 'index.json')); }
      catch { throw new Error('请选择已有 NeuroShelf 项目资料夹，其中应包含 index.json。'); }
    }
    await fs.mkdir(this.root, { recursive: true });
    try { this.index = JSON.parse(await fs.readFile(path.join(this.root, 'index.json'), 'utf8')); }
    catch (e) {
      if (e.code !== 'ENOENT' || this.existingOnly) throw e;
      // Commit the index last. An interrupted first migration can resume from its completed folder.
      const project = await this.initializeDefault();
      this.index = { format: 'neuroshelf-projects', version: 1, activeId: project.id, projects: [{ id: project.id, folder: 'SC-SNr' }] };
      await atomicJson(path.join(this.root, 'index.json'), this.index);
    }
    if (this.index.format !== 'neuroshelf-projects' || !Array.isArray(this.index.projects) || !this.index.projects.length) throw new Error('项目索引无法读取，未覆盖数据。');
    const ids = new Set();
    for (const entry of this.index.projects) {
      if (!validId(entry.id) || ids.has(entry.id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(entry.folder)) throw new Error('项目目录或编号无效。');
      ids.add(entry.id);
      const directory = path.join(this.root, entry.folder), project = JSON.parse(await fs.readFile(path.join(directory, 'project.json'), 'utf8'));
      if (project.id !== entry.id) throw new Error('项目身份与索引不一致。');
      metadata(project);
      this.contexts.set(entry.id, { project, directory, store: null, sync: null });
    }
    if (!ids.has(this.index.activeId)) throw new Error('当前项目不存在。');
    await this.open(this.index.activeId);
    return this.list();
  }
  async initializeDefault() {
    const destination = path.join(this.root, 'SC-SNr');
    try { const existing = JSON.parse(await fs.readFile(path.join(destination, 'project.json'), 'utf8')); if (existing.id !== 'sc-snr') throw new Error('SC-SNr 目录已被其他项目占用。'); return existing; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const staging = path.join(this.root, '.migration-' + crypto.randomUUID());
    await fs.mkdir(path.join(staging, 'library', 'pdfs'), { recursive: true });
    let original;
    const legacy = path.join(this.userData, 'library');
    try { original = validateLibrary(JSON.parse(await fs.readFile(path.join(legacy, 'library.json'), 'utf8'))); }
    catch (e) { if (e.code !== 'ENOENT') throw e; original = validateLibrary(JSON.parse(await fs.readFile(this.seedPath, 'utf8'))); }
    // Copy, verify, then publish; the legacy library remains a rollback copy.
    for (const paper of original.papers.filter(p => p.pdf)) {
      const bytes = await fs.readFile(path.join(legacy, 'pdfs', paper.pdf.storedName));
      if (crypto.createHash('sha256').update(bytes).digest('hex') + '.pdf' !== paper.pdf.storedName) throw new Error('迁移 PDF 校验失败：' + paper.title);
      await fs.writeFile(path.join(staging, 'library', 'pdfs', paper.pdf.storedName), bytes);
    }
    await this.makeFolders(staging);
    await atomicJson(path.join(staging, 'library', 'library.json'), { ...original, projectId: 'sc-snr' });
    const project = metadata(DEFAULT_PROJECT, { id: 'sc-snr', createdAt: new Date().toISOString() });
    await atomicJson(path.join(staging, 'project.json'), project);
    let oldInbox = path.join(this.userData, 'weekly-inbox');
    try { const source = JSON.parse(await fs.readFile(path.join(oldInbox, 'source.json'), 'utf8')); if (path.isAbsolute(source.directory || '')) oldInbox = source.directory; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const name of await fs.readdir(oldInbox).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
      if (/^week-\d{4}-\d{2}-\d{2}-[a-f0-9]{16}\.json$/.test(name)) await fs.copyFile(path.join(oldInbox, name), path.join(staging, 'inbox', 'papers', name));
    }
    await renameWithRetry(staging, destination);
    return project;
  }
  async makeFolders(directory) { for (const sub of ['library/pdfs', 'inbox/papers', 'inbox/people', 'reports', 'downloads', 'resources']) await fs.mkdir(path.join(directory, sub), { recursive: true }); }
  async rememberRoot() {
    // The running desktop app owns this write: external development tools may have
    // a different Windows packaged-app view of AppData.
    await fs.mkdir(this.userData, { recursive: true });
    await atomicJson(path.join(this.userData, 'projects-location.json'), { directory: this.root, configuredAt: new Date().toISOString() });
  }
  async prepareExistingRoot(directory) {
    if (!path.isAbsolute(directory || '')) throw new Error('项目资料目录必须为绝对路径。');
    const next = new ProjectManager({ userData: this.userData, seedPath: this.seedPath, root: path.resolve(directory), existingOnly: true });
    await next.init();
    for (const entry of next.index.projects) await next.open(entry.id);
    return next;
  }
  list() { return { activeId: this.index.activeId, root: this.root, projects: [...this.contexts.values()].map(c => ({ ...structuredClone(c.project), directory: c.directory })) }; }
  get(id = this.index.activeId) { const context = this.contexts.get(id); if (!context) throw new Error('项目不存在。'); return context; }
  async open(id) {
    const context = this.get(id);
    if (!context.store) { context.store = new LibraryStore(path.join(context.directory, 'library'), null); await context.store.init(); if (context.store.get().projectId !== id) throw new Error('文献库不属于这个项目。'); }
    return context;
  }
  async activate(id) { await this.open(id); await this.enqueue(async () => { const next = { ...this.index, activeId: id }; await atomicJson(path.join(this.root, 'index.json'), next); this.index = next; }); return this.list(); }
  create(raw) {
    return this.enqueue(async () => {
      const id = 'project-' + crypto.randomUUID(), project = metadata(raw, { id, createdAt: new Date().toISOString(), weeklyEnabled: true });
      const folder = (project.name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 45) || 'Project') + '-' + id.slice(-8), directory = path.join(this.root, folder);
      await this.makeFolders(directory);
      await atomicJson(path.join(directory, 'project.json'), project);
      await atomicJson(path.join(directory, 'library', 'library.json'), { format: 'neuroshelf-library', version: 1, projectId: id, project: project.name, papers: [] });
      const next = { ...this.index, projects: [...this.index.projects, { id, folder }] };
      await atomicJson(path.join(this.root, 'index.json'), next); this.index = next;
      this.contexts.set(id, { project, directory, store: null, sync: null });
      return project;
    });
  }
  update(id, raw) { return this.enqueue(async () => { const context = this.get(id), next = metadata(raw, context.project); await atomicJson(path.join(context.directory, 'project.json'), next); context.project = next; return this.list(); }); }
}
module.exports = { ProjectManager, DEFAULT_PROJECT, resolveRoot, atomicJson, validId };
