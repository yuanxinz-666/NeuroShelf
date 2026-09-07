const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { emptyWeekly, validateBatch, validateWeekly, addBatch, decideCandidate, mergeWeekly } = require('./weekly.cjs');
const { emptyPeople, validatePeople, addPeople } = require('./people.cjs');
const { addDossiers } = require('./pi-dossier.cjs');
const { renameWithRetry } = require('./files.cjs');
const { validateExperiments, mergeExperiments, verifyImage, evidenceFiles, installExperimentMethods } = require('./experiments.cjs');

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const statuses = new Set(['unread', 'queued', 'reading', 'read']);
const clone = value => structuredClone(value);
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(value);
const pdfName = value => typeof value === 'string' && /^[a-f0-9]{64}\.pdf$/.test(value);
function verifyPdf(bytes) {
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new Error('PDF 不能为空，且单个文件不能超过 100 MB。');
  if (!bytes.subarray(0, 1024).toString('latin1').includes('%PDF-')) throw new Error('这不是有效的 PDF 文件。');
}
function validateLibrary(raw) {
  if (!raw || raw.format !== 'neuroshelf-library' || raw.version !== 1 || !Array.isArray(raw.papers) || raw.papers.length > 10000) throw new Error('无法识别这份文献库。');
  const ids = new Set();
  for (const p of raw.papers) {
    if (!validId(p.id) || ids.has(p.id) || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 5000) throw new Error('文献记录无效或编号重复。');
    ids.add(p.id);
    if (p.pdf && !pdfName(p.pdf.storedName)) throw new Error('备份中的 PDF 路径无效。');
    if (p.highlights && !Array.isArray(p.highlights)) throw new Error('高亮格式无效。');
    if (p.messages && !Array.isArray(p.messages)) throw new Error('对话格式无效。');
    if (p.personalReview !== undefined && (typeof p.personalReview !== 'string' || p.personalReview.length > 500)) throw new Error('个人评价格式无效，最多支持 500 字。');
  }
  if (raw.weekly) validateWeekly(raw.weekly);
  if (raw.people) validatePeople(raw.people);
  if (raw.experiments) validateExperiments(raw.experiments);
  if (raw.projectId && !/^[a-z0-9-]{1,80}$/.test(raw.projectId)) throw new Error('项目编号无效。');
  return raw;
}
function normalizePatch(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('记录格式错误。');
  const output = {};
  if (Object.hasOwn(patch, 'personalReview')) {
    if (typeof patch.personalReview !== 'string' || patch.personalReview.length > 500) throw new Error('个人评价格式无效，最多支持 500 字。');
    output.personalReview = patch.personalReview;
  }
  for (const key of ['title', 'authors', 'journal', 'module', 'note', 'tags', 'color']) {
    if (Object.hasOwn(patch, key)) {
      if (typeof patch[key] !== 'string' || patch[key].length > (key === 'note' ? 500000 : 5000)) throw new Error('文本内容过长或格式错误。');
      if (key === 'title' && !patch[key].trim()) throw new Error('论文标题不能为空。');
      output[key] = patch[key];
    }
  }
  if ('starred' in patch) output.starred = patch.starred === true;
  if ('status' in patch) {
    if (!statuses.has(patch.status)) throw new Error('阅读状态无效。');
    output.status = patch.status;
  }
  if ('page' in patch) {
    if (!Number.isInteger(patch.page) || patch.page < 1 || patch.page > 100000) throw new Error('页码无效。');
    output.page = patch.page;
  }
  if ('highlights' in patch) {
    if (!Array.isArray(patch.highlights) || patch.highlights.length > 10000 || JSON.stringify(patch.highlights).length > 5000000) throw new Error('高亮记录过多。');
    for (const h of patch.highlights) {
      if (!validId(h.id) || typeof h.text !== 'string' || h.text.length > 50000) throw new Error('高亮格式错误。');
      if (h.comment !== undefined && (typeof h.comment !== 'string' || h.comment.length > 100000)) throw new Error('旁注格式错误，最多支持 10 万字。');
      if (h.rects && (!Array.isArray(h.rects) || h.rects.length > 2000 || h.rects.some(r => !['x','y','w','h'].every(k => Number.isFinite(r[k]) && r[k] >= 0 && r[k] <= 1.01)))) throw new Error('高亮位置无效。');
    }
    output.highlights = clone(patch.highlights);
  }
  if ('messages' in patch) {
    if (!Array.isArray(patch.messages) || patch.messages.length > 2000 || JSON.stringify(patch.messages).length > 10000000) throw new Error('对话记录过大，请先导出笔记。');
    for (const m of patch.messages) if (!['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') throw new Error('对话记录格式错误。');
    output.messages = clone(patch.messages);
  }
  return output;
}
class LibraryStore {
  constructor(directory, seedPath) { this.directory = directory; this.seedPath = seedPath; this.queue = Promise.resolve(); }
  async init() {
    await fs.mkdir(path.join(this.directory, 'pdfs'), { recursive: true });
    this.file = path.join(this.directory, 'library.json');
    try { this.library = validateLibrary(JSON.parse(await fs.readFile(this.file, 'utf8'))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('文献库无法读取，未覆盖任何数据。请检查 library.json 或从 library.json.bak 恢复。');
      this.library = validateLibrary(JSON.parse(await fs.readFile(this.seedPath, 'utf8')));
      await this.commit(this.library);
    }
    return this.get();
  }
  get() { return clone(this.library); }
  ingestPeople(batches) { return this.enqueue(async () => { const next = this.get(); let changed = false; for (const batch of batches) changed = addPeople(next, batch) || changed; if (changed) await this.commit(next); return clone(next.people || emptyPeople()); }); }
  ingestDossiers(batches) { return this.enqueue(async () => { const next = this.get(); let changed = false; for (const batch of batches) changed = addDossiers(next, batch) || changed; if (changed) await this.commit(next); return clone(next.people); }); }
  importRankings(rows) { return this.enqueue(async () => { const { validateRankings, keyOf } = require('./journal-rankings.cjs'); const incoming = validateRankings(rows), next = this.get(); next.people ||= emptyPeople(); const merged = new Map((next.people.rankings || []).map(r => [keyOf(r), r])); for (const row of incoming) merged.set(keyOf(row), row); next.people.rankings = validateRankings([...merged.values()]); await this.commit(next); return { people: clone(next.people), imported: incoming.length }; }); }
  updatePerson(id, patch) {
    return this.enqueue(async () => {
      const next = this.get(), person = next.people?.profiles.find(p => p.id === id);
      if (!person) throw new Error('未找到这位 PI。');
      if ('followed' in patch) person.followed = patch.followed === true;
      if ('note' in patch) { if (typeof patch.note !== 'string' || patch.note.length > 100000) throw new Error('PI 笔记过长。'); person.note = patch.note; }
      person.updatedAt = new Date().toISOString(); await this.commit(next); return clone(next.people);
    });
  }
  ingestWeekly(rawBatches) {
    const batches = rawBatches.map(validateBatch);
    return this.enqueue(async () => {
      const next = this.get(); let changed = false, added = 0;
      for (const batch of batches) { const result = addBatch(next, batch); changed ||= result.changed; added += result.added; }
      if (changed) await this.commit(next);
      return { weekly: clone(next.weekly || emptyWeekly()), added };
    });
  }
  decideWeekly(id, action) {
    return this.enqueue(async () => {
      const next = this.get(), result = decideCandidate(next, id, action);
      await this.commit(next);
      return { ...clone(result), weekly: clone(next.weekly) };
    });
  }
  enqueue(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  async commit(next) {
    const temp = this.file + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(temp, JSON.stringify(next, null, 2), 'utf8');
    try { await fs.copyFile(this.file, this.file + '.bak'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await renameWithRetry(temp, this.file);
    this.library = next;
  }
  find(id) {
    if (!validId(id)) throw new Error('文献编号无效。');
    const paper = this.library.papers.find(p => p.id === id);
    if (!paper) throw new Error('未找到这篇文献。');
    return paper;
  }
  update(id, rawPatch) {
    const patch = normalizePatch(rawPatch);
    return this.enqueue(async () => {
      this.find(id);
      const next = this.get(), paper = next.papers.find(p => p.id === id);
      Object.assign(paper, patch, { updatedAt: new Date().toISOString() });
      await this.commit(next);
      return clone(paper);
    });
  }
  mutateHighlight(id, { action, highlightId, value = {} } = {}) {
    if (!validId(highlightId) || !['add', 'update', 'remove'].includes(action)) throw new Error('旁注操作无效。');
    return this.enqueue(async () => {
      this.find(id);
      const next = this.get(), paper = next.papers.find(p => p.id === id);
      const highlights = paper.highlights || [], index = highlights.findIndex(h => h.id === highlightId);
      if (action === 'add') {
        if (index >= 0) throw new Error('这条高亮已经存在。');
        highlights.push({ ...value, id: highlightId, createdAt: new Date().toISOString() });
      } else {
        if (index < 0) throw new Error('这条高亮已删除，请重新选择原文。');
        if (action === 'remove') highlights.splice(index, 1);
        else {
          if (!value || Object.keys(value).some(k => !['comment', 'color'].includes(k))) throw new Error('旁注内容无效。');
          highlights[index] = { ...highlights[index], ...value, updatedAt: new Date().toISOString() };
        }
      }
      Object.assign(paper, normalizePatch({ highlights }), { updatedAt: new Date().toISOString() });
      await this.commit(next);
      return clone(paper);
    });
  }
  importPdf({ id, name, bytes, title }) {
    const buffer = Buffer.from(bytes);
    verifyPdf(buffer);
    const safeName = path.basename(String(name || 'paper.pdf')).slice(0, 250);
    return this.enqueue(async () => {
      if (id) this.find(id);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const existing = this.library.papers.find(p => p.pdf?.hash === hash);
      if (!id && existing) return { paper: clone(existing), duplicate: true };
      const next = this.get();
      let paper = next.papers.find(p => p.id === id);
      if (!paper) {
        paper = { id: 'u_' + crypto.randomUUID(), rank: next.papers.length + 1,
          title: String(title || safeName.replace(/\.pdf$/i, '')).slice(0, 5000),
          authors: '', journal: '', year: null, module: '我的导入', publication: '个人导入',
          summary: '', relevance: '', caveat: '', verification: '', url: '',
          note: '', tags: '', status: 'unread', starred: false, page: 1, highlights: [], messages: [] };
        next.papers.push(paper);
      }
      if (paper.pdf && paper.pdf.hash !== hash) throw new Error('这篇论文已关联 PDF。请先在阅读器中解除关联，再导入新版本。');
      const storedName = hash + '.pdf';
      await fs.writeFile(path.join(this.directory, 'pdfs', storedName), buffer, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
      paper.pdf = { fileName: safeName, storedName, hash, bytes: buffer.length, addedAt: new Date().toISOString() };
      paper.updatedAt = new Date().toISOString();
      await this.commit(next);
      return { paper: clone(paper), duplicate: Boolean(existing && existing.id === paper.id) };
    });
  }
  async readPdf(id) {
    const paper = this.find(id);
    if (!paper.pdf || !pdfName(paper.pdf.storedName)) throw new Error('请先导入这篇论文的 PDF。');
    try { return await fs.readFile(path.join(this.directory, 'pdfs', paper.pdf.storedName)); }
    catch { throw new Error('PDF 文件已移走或无法读取，请从备份恢复。'); }
  }
  detachPdf(id) {
    return this.enqueue(async () => {
      this.find(id);
      const next = this.get(), paper = next.papers.find(p => p.id === id);
      // Retain original PDF bytes and saved highlights; hide highlights for a different PDF hash.
      paper.pdf = null; paper.page = 1;
      await this.commit(next);
      return clone(paper);
    });
  }
  backup(destination) {
    return this.enqueue(async () => {
      const dir = path.join(destination, 'NeuroShelf-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex'));
      await fs.mkdir(path.join(dir, 'pdfs'), { recursive: true });
      const snapshot = this.get();
      const images = evidenceFiles(snapshot.experiments);
      if (images.length) await fs.mkdir(path.join(dir, 'evidence'), { recursive: true });
      for (const file of images) {
        const bytes = await fs.readFile(path.join(this.directory, 'evidence', file));
        const extension = verifyImage(bytes);
        if (crypto.createHash('sha256').update(bytes).digest('hex') + '.' + extension !== file) throw new Error('实验图片校验失败，未生成完整备份。');
        await fs.writeFile(path.join(dir, 'evidence', file), bytes);
      }
      for (const file of new Set(snapshot.papers.filter(p => p.pdf).map(p => p.pdf.storedName))) {
        if (!pdfName(file)) throw new Error('PDF 路径无效。');
        await fs.copyFile(path.join(this.directory, 'pdfs', file), path.join(dir, 'pdfs', file));
      }
      await fs.writeFile(path.join(dir, 'library.json'), JSON.stringify(snapshot, null, 2), 'utf8');
      return dir;
    });
  }
  restore(file) {
    return this.enqueue(async () => {
      const stat = await fs.stat(file);
      if (stat.size > 50 * 1024 * 1024) throw new Error('备份记录过大。');
      const incoming = validateLibrary(JSON.parse(await fs.readFile(file, 'utf8')));
      if (this.library.projectId && incoming.projectId !== this.library.projectId && !(this.library.projectId === 'sc-snr' && !incoming.projectId)) throw new Error('这份备份属于其他项目，请先切换到对应项目。');
      // Validate every PDF before touching the active library; merge by id, preserving newer notes.
      for (const p of incoming.papers.filter(p => p.pdf)) {
        const pdf = await fs.readFile(path.join(path.dirname(file), 'pdfs', p.pdf.storedName));
        verifyPdf(pdf);
        if (crypto.createHash('sha256').update(pdf).digest('hex') + '.pdf' !== p.pdf.storedName) throw new Error('备份中的 PDF 校验失败。');
      }
      const next = this.get();
      if (incoming.experiments) next.experiments = mergeExperiments(next.experiments, incoming.experiments);
      const images = evidenceFiles(incoming.experiments);
      for (const image of images) {
        const bytes = await fs.readFile(path.join(path.dirname(file), 'evidence', image));
        const extension = verifyImage(bytes);
        if (crypto.createHash('sha256').update(bytes).digest('hex') + '.' + extension !== image) throw new Error('备份中的实验图片校验失败。');
      }
      if (images.length) await fs.mkdir(path.join(this.directory, 'evidence'), { recursive: true });
      for (const image of images) await fs.copyFile(path.join(path.dirname(file), 'evidence', image), path.join(this.directory, 'evidence', image));
      for (const p of incoming.papers) {
        if (p.pdf) await fs.copyFile(path.join(path.dirname(file), 'pdfs', p.pdf.storedName), path.join(this.directory, 'pdfs', p.pdf.storedName));
        const index = next.papers.findIndex(v => v.id === p.id);
        if (index < 0) next.papers.push(p);
        else if ((Date.parse(p.updatedAt) || 0) >= (Date.parse(next.papers[index].updatedAt) || 0)) next.papers[index] = p;
        else if (!next.papers[index].pdf && p.pdf) next.papers[index].pdf = p.pdf;
      }
      if (next.weekly || incoming.weekly) next.weekly = mergeWeekly(next.weekly, incoming.weekly, next.papers);
      if (incoming.people) {
        next.people ||= emptyPeople();
        for (const person of incoming.people.profiles) {
          const index = next.people.profiles.findIndex(p => p.id === person.id);
          if (index < 0) next.people.profiles.push(person);
          else {
            const local = next.people.profiles[index], merged = Date.parse(person.updatedAt) > Date.parse(local.updatedAt) ? clone(person) : clone(local);
            for (const field of ['dossier', 'bibliography']) { const a = local[field], b = person[field]; if (a || b) merged[field] = !a || (b && b.checkedOn > a.checkedOn) ? b : a; }
            next.people.profiles[index] = merged;
          }
        }
        for (const key of ['events', 'batches']) for (const item of incoming.people[key]) if (!next.people[key].some(p => p.id === item.id)) next.people[key].push(item);
        if (incoming.people.rankings) { const { keyOf } = require('./journal-rankings.cjs'); const ranks = new Map(incoming.people.rankings.map(r => [keyOf(r), r])); for (const row of next.people.rankings || []) ranks.set(keyOf(row), row); next.people.rankings = [...ranks.values()]; }
      }
      await this.commit(next);
      return this.get();
    });
  }
  importLegacy(raw) {
    return this.enqueue(async () => {
      if (this.library.projectId && this.library.projectId !== 'sc-snr') throw new Error('原始网页笔记只属于 SC–SNr 项目。');
      if (raw?.format !== 'snr-sc-pitx2-reading-notes' || raw.schemaVersion !== 2 || raw.datasetId !== 'snr-sc-pitx2-literature-2026-09-05' || !raw.records || typeof raw.records !== 'object') throw new Error('请选择原网页导出的 JSON 笔记备份。');
      const next = this.get(); let count = 0;
      for (const [key, record] of Object.entries(raw.records)) {
        const paper = next.papers.find(p => p.id === record.paperId || p.url?.toLowerCase() === key.toLowerCase());
        if (!paper || (Date.parse(paper.updatedAt) || 0) > (Date.parse(record.updatedAt) || 0)) continue;
        Object.assign(paper, normalizePatch({ note: record.note || '', tags: record.tags || '', starred: record.starred === true,
          status: record.readStatus || 'unread', color: record.color || '',
          highlights: (record.highlights || []).map(h => ({ ...h, source: 'map', page: 0 })) }));
        paper.updatedAt = record.updatedAt || new Date().toISOString(); count++;
      }
      await this.commit(next);
      return { library: this.get(), count };
    });
  }
}
installExperimentMethods(LibraryStore);
module.exports = { LibraryStore, verifyPdf, validateLibrary, normalizePatch, MAX_PDF_BYTES, pdfName };
