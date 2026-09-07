const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BATCH_BYTES = 2 * 1024 * 1024;
const emptyWeekly = () => ({ version: 1, candidates: [], batches: [] });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function text(value, name, max = 5000, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`每周论文的${name}无效。`);
  return value.trim();
}
function date(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`每周论文的${name}无效。`);
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('每周论文的时间无效。');
  return new Date(value).toISOString();
}
function https(value) {
  const raw = text(value, '来源链接', 4000, true);
  let url; try { url = new URL(raw); } catch { throw new Error('每周论文的来源链接无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('论文来源必须为 HTTPS 链接。');
  return url.href;
}
function doiOf(p) {
  let raw = p.doi || (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(p.url || '') ? p.url : '');
  if (!raw && /^https?:\/\/(?:www\.)?(?:biorxiv|medrxiv)\.org\/content\//i.test(p.url || '')) {
    raw = (p.url.match(/10\.\d{4,9}\/[^?#]+/i)?.[0] || '').replace(/(?:v\d+)?(?:\.full(?:\.pdf)?|\.abstract|\.short)?\/?$/i, '');
  }
  try { raw = decodeURIComponent(raw); } catch { /* Keep the original if escaping is malformed. */ }
  return raw.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '').toLowerCase();
}
const titleOf = p => String(p.title || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const pmidOf = p => String(p.pmid || (p.url || '').match(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)?.[1] || '');
function samePaper(a, b) {
  const ad = doiOf(a), bd = doiOf(b);
  return Boolean((ad && bd && ad === bd) || (pmidOf(a) && pmidOf(a) === pmidOf(b)) || (titleOf(a) && titleOf(a) === titleOf(b)));
}
function normalizeCandidate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('候选论文格式无效。');
  const publishedDate = date(raw.publishedDate, '发表日期');
  const doi = doiOf({ doi: text(raw.doi, 'DOI', 500), url: raw.url });
  if (doi && !/^10\.\d{4,9}\/\S+$/i.test(doi)) throw new Error('候选论文 DOI 无效。');
  const pmid = text(raw.pmid, 'PMID', 15);
  if (pmid && !/^\d+$/.test(pmid)) throw new Error('候选论文 PMID 无效。');
  if (!['期刊论文', '预印本'].includes(raw.publication)) throw new Error('请明确标注期刊论文或预印本。');
  if (!['直接相关', '方法参考', '拓展线索'].includes(raw.match)) throw new Error('候选论文相关性分类无效。');
  if (!['已核对摘要', '已核对全文'].includes(raw.verification)) throw new Error('请标注实际核对到的证据范围。');
  if (!Array.isArray(raw.sources) || !raw.sources.length || raw.sources.length > 8) throw new Error('候选论文必须有可核验的来源。');
  const tags = raw.tags || [];
  if (!Array.isArray(tags) || tags.length > 12) throw new Error('候选论文标签无效。');
  return {
    title: text(raw.title, '标题', 5000, true), authors: text(raw.authors, '作者', 5000, true),
    journal: text(raw.journal, '期刊', 500, true), publishedDate, year: Number(publishedDate.slice(0, 4)),
    publication: raw.publication, doi, pmid, url: https(raw.url),
    summary: text(raw.summary, '研究摘要', 12000, true), relevance: text(raw.relevance, '推荐理由', 8000, true),
    caveat: text(raw.caveat, '证据边界', 8000, true), module: text(raw.module, '研究模块', 300, true),
    match: raw.match, verification: raw.verification, dateNote: text(raw.dateNote, '日期说明', 1000),
    tags: tags.map(t => text(t, '标签', 100, true)),
    sources: raw.sources.map(s => ({ label: text(s.label, '来源名称', 200, true), url: https(s.url) })),
  };
}
function validateBatch(raw) {
  if (!raw || raw.format !== 'neuroshelf-weekly' || raw.version !== 1 || !Array.isArray(raw.candidates) || raw.candidates.length > 50) throw new Error('请选择 NeuroShelf 每周论文文件，每批最多 50 篇。');
  const weekOf = date(raw.weekOf, '所属周');
  if (new Date(weekOf).getUTCDay() !== 1) throw new Error('所属周应填写该周的周一日期。');
  const windowStart = date(raw.windowStart, '检索起始日期'), windowEnd = date(raw.windowEnd, '检索截止日期');
  const screenedAt = timestamp(raw.screenedAt);
  if (windowStart > windowEnd || windowEnd > screenedAt.slice(0, 10)) throw new Error('检索日期范围无效。');
  if (!['complete', 'partial'].includes(raw.status)) throw new Error('请标注检索是否完成。');
  if (!Number.isInteger(raw.checkedCount) || raw.checkedCount < raw.candidates.length || raw.checkedCount > 100000) throw new Error('检索记录数量无效。');
  if (!Array.isArray(raw.searchedSources) || !raw.searchedSources.length || raw.searchedSources.length > 12) throw new Error('请记录本次检索来源。');
  const candidates = raw.candidates.map(normalizeCandidate);
  for (const c of candidates) {
    if (c.publishedDate > windowEnd || (c.publishedDate < windowStart && !c.dateNote)) throw new Error('较早发表的补漏论文必须说明日期，不能混作本周新发表。');
  }
  const batch = { format: 'neuroshelf-weekly', version: 1, weekOf, windowStart, windowEnd, screenedAt,
    status: raw.status, checkedCount: raw.checkedCount, summary: text(raw.summary, '检索说明', 8000, true),
    searchedSources: raw.searchedSources.map(s => text(s, '检索来源', 1000, true)), candidates };
  if (raw.projectId !== undefined) { if (!/^[a-z0-9-]{1,80}$/.test(raw.projectId)) throw new Error('候选论文项目编号无效。'); batch.projectId = raw.projectId; }
  if (raw.kind !== undefined) { if (!['initial', 'weekly'].includes(raw.kind)) throw new Error('筛选类型无效。'); batch.kind = raw.kind; }
  return { ...batch, id: 'week-' + weekOf + '-' + hash(JSON.stringify(batch)).slice(0, 16) };
}
function validateWeekly(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.candidates) || !Array.isArray(raw.batches) || raw.candidates.length > 20000 || raw.batches.length > 10000) throw new Error('每周论文记录无效。');
  const ids = new Set();
  for (const c of raw.candidates) {
    normalizeCandidate(c);
    if (!/^w_[a-f0-9]{24}$/.test(c.id) || ids.has(c.id) || !['pending', 'accepted', 'dismissed'].includes(c.status)) throw new Error('候选论文状态或编号无效。');
    ids.add(c.id); date(c.weekOf, '所属周'); timestamp(c.updatedAt); timestamp(c.firstSeen);
    if (c.paperId && !/^[a-zA-Z0-9_-]{1,90}$/.test(c.paperId)) throw new Error('候选论文关联编号无效。');
    if (c.status === 'accepted' && !c.paperId) throw new Error('已入库论文缺少关联记录。');
  }
  const batches = new Set();
  for (const b of raw.batches) {
    if (!/^week-\d{4}-\d{2}-\d{2}-[a-f0-9]{16}$/.test(b.id) || batches.has(b.id)) throw new Error('每周筛选记录编号无效。');
    batches.add(b.id); date(b.weekOf, '所属周'); date(b.windowStart, '检索起始日期'); date(b.windowEnd, '检索截止日期'); timestamp(b.screenedAt);
    text(b.summary, '检索说明', 8000, true);
    if (!['complete', 'partial'].includes(b.status) || !Array.isArray(b.searchedSources) || b.searchedSources.length > 12) throw new Error('检索记录无效。');
    b.searchedSources.forEach(s => text(s, '检索来源', 1000, true));
    for (const key of ['checkedCount', 'addedCount', 'duplicateCount']) if (!Number.isInteger(b[key]) || b[key] < 0) throw new Error('检索记录数量无效。');
  }
  return raw;
}
function addBatch(library, batch) {
  if (library.projectId && batch.projectId !== library.projectId && !(library.projectId === 'sc-snr' && !batch.projectId)) throw new Error('这批候选论文属于另一个项目。');
  const weekly = library.weekly ||= emptyWeekly();
  if (weekly.batches.some(b => b.id === batch.id)) return { changed: false, added: 0 };
  let added = 0, duplicates = 0;
  for (const candidate of batch.candidates) {
    if (library.papers.some(p => samePaper(p, candidate)) || weekly.candidates.some(c => samePaper(c, candidate))) { duplicates++; continue; }
    const id = 'w_' + hash(doiOf(candidate) || candidate.pmid || titleOf(candidate)).slice(0, 24);
    weekly.candidates.push({ ...candidate, id, kind: batch.kind || 'weekly', weekOf: batch.weekOf, firstSeen: batch.screenedAt, updatedAt: batch.screenedAt, status: 'pending' }); added++;
  }
  const { candidates, format, version, ...metadata } = batch;
  weekly.batches.push({ ...metadata, addedCount: added, duplicateCount: duplicates });
  validateWeekly(weekly);
  return { changed: true, added };
}
function decideCandidate(library, id, action, now = new Date().toISOString()) {
  if (!['accept', 'dismiss', 'restore'].includes(action)) throw new Error('候选论文操作无效。');
  const candidate = library.weekly?.candidates.find(c => c.id === id);
  if (!candidate) throw new Error('未找到候选论文，请刷新后重试。');
  const existing = library.papers.find(p => p.id === candidate.paperId || samePaper(p, candidate));
  if (action === 'accept') {
    let paper = existing;
    if (!paper) {
      if (library.papers.length >= 10000) throw new Error('文献库已达到 10000 篇上限，请先备份整理。');
      paper = { id: 'u_' + crypto.randomUUID(), rank: Math.max(0, ...library.papers.map(p => p.rank || 0)) + 1,
        ...normalizeCandidate(candidate), tags: candidate.tags.join('，'), note: '', status: 'unread', starred: false,
        page: 1, pdf: null, highlights: [], messages: [], createdAt: now, updatedAt: now,
        discovery: { type: 'weekly', candidateId: candidate.id, weekOf: candidate.weekOf, screenedAt: candidate.firstSeen } };
      library.papers.push(paper);
    }
    Object.assign(candidate, { status: 'accepted', paperId: paper.id, updatedAt: now });
    return { paper, duplicate: !!existing };
  }
  if (candidate.status === 'accepted') throw new Error('这篇论文已在文献库中，请到文献库继续阅读。');
  candidate.status = action === 'dismiss' ? 'dismissed' : 'pending'; candidate.updatedAt = now;
  return { paper: null, duplicate: false };
}
function mergeWeekly(local, incoming, papers) {
  const merged = structuredClone(local || emptyWeekly());
  if (incoming) {
    for (const c of incoming.candidates) {
      const index = merged.candidates.findIndex(old => old.id === c.id || samePaper(old, c));
      if (index < 0) merged.candidates.push(structuredClone(c));
      else if (Date.parse(c.updatedAt) > Date.parse(merged.candidates[index].updatedAt)) merged.candidates[index] = structuredClone(c);
    }
    for (const b of incoming.batches) if (!merged.batches.some(old => old.id === b.id)) merged.batches.push(structuredClone(b));
  }
  for (const c of merged.candidates) {
    const paper = papers.find(p => p.id === c.paperId || samePaper(p, c));
    if (paper) { c.paperId = paper.id; c.status = 'accepted'; }
    else if (c.status === 'accepted') { c.status = 'pending'; delete c.paperId; }
  }
  return validateWeekly(merged);
}

// The scheduler publishes immutable packets. Only the running app writes library.json.
async function publishBatch(directory, raw) {
  const batch = validateBatch(raw);
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, batch.id + '.json');
  try { const old = validateBatch(JSON.parse(await fs.readFile(destination, 'utf8'))); if (old.id === batch.id) return { file: destination, batch, duplicate: true }; throw new Error('每周论文文件冲突。'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = destination + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify(batch, null, 2), { encoding: 'utf8', flag: 'wx' });
  await fs.rename(temp, destination);
  return { file: destination, batch, duplicate: false };
}
async function syncInbox(store, directory) {
  let files;
  try { files = await fs.readdir(directory, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return { weekly: store.get().weekly || emptyWeekly(), added: 0, errors: [] }; throw e; }
  const errors = [], packets = [], seen = new Set((store.get().weekly?.batches || []).map(b => b.id));
  for (const f of files.filter(f => f.isFile() && /^week-\d{4}-\d{2}-\d{2}-[a-f0-9]{16}\.json$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    if (seen.has(f.name.slice(0, -5))) continue;
    try {
      const file = path.join(directory, f.name);
      if ((await fs.stat(file)).size > MAX_BATCH_BYTES) throw new Error('文件超过 2 MB。');
      const batch = validateBatch(JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')));
      if (batch.id + '.json' !== f.name) throw new Error('文件内容校验失败。');
      packets.push(batch);
    } catch (e) { errors.push({ file: f.name, message: e.message }); }
  }
  const result = await store.ingestWeekly(packets);
  return { ...result, errors };
}
module.exports = { emptyWeekly, validateBatch, validateWeekly, addBatch, decideCandidate, mergeWeekly, samePaper, doiOf, titleOf, publishBatch, syncInbox, MAX_BATCH_BYTES };
