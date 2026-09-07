const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { renameWithRetry } = require('./files.cjs');
const text = (v, max = 6000) => { if (typeof v !== 'string' || v.length > max) throw new Error('PI 档案文本无效。'); return v.trim(); };
const date = v => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw new Error('PI 档案日期无效。'); return v; };
const url = v => { const u = new URL(text(v, 4000)); if (u.protocol !== 'https:' || u.username || u.password) throw new Error('档案来源必须是公开 HTTPS 地址。'); return u.href; };
const list = (v, max, fn) => { if (!Array.isArray(v) || v.length > max) throw new Error('PI 档案列表无效或过大。'); return v.map(fn); };
const sources = v => { const r = list(v, 12, s => ({ label: text(s.label, 250), url: url(s.url) })); if (!r.length) throw new Error('PI 档案事实需要来源。'); return r; };
const enumValue = (v, allowed) => { if (!allowed.includes(v)) throw new Error('PI 档案类型无效。'); return v; };
function validateDossier(raw) {
  if (raw?.version !== 1) throw new Error('PI 详细档案版本无效。');
  return { version: 1, checkedOn: date(raw.checkedOn), overview: text(raw.overview, 14000), scope: text(raw.scope), sources: sources(raw.sources),
    career: list(raw.career, 20, x => ({ period: text(x.period, 200), role: text(x.role, 300), institution: text(x.institution, 500), detail: text(x.detail), sources: sources(x.sources) })),
    directions: list(raw.directions, 12, x => ({ title: text(x.title, 300), detail: text(x.detail), sources: sources(x.sources) })),
    methods: list(raw.methods, 30, x => text(x, 150)),
    relationships: list(raw.relationships, 60, x => ({ name: text(x.name, 300), type: enumValue(x.type, ['mentor', 'trainee', 'collaborator']), stage: text(x.stage, 300), period: text(x.period, 200), detail: text(x.detail), destination: text(x.destination, 800), destinationAsOf: x.destinationAsOf ? date(x.destinationAsOf) : '', sources: sources(x.sources) })),
    funding: list(raw.funding, 30, x => ({ funder: text(x.funder, 500), title: text(x.title, 1200), grantId: text(x.grantId, 300), role: text(x.role, 400), amount: text(x.amount, 250), start: x.start ? date(x.start) : '', end: x.end ? date(x.end) : '', status: enumValue(x.status, ['active', 'awarded', 'completed', 'unknown']), detail: text(x.detail), caveat: text(x.caveat), sources: sources(x.sources) })),
    resources: list(raw.resources, 30, x => ({ label: text(x.label, 300), url: url(x.url) })),
    questions: list(raw.questions, 20, x => text(x, 2000)) };
}
function validateBibliography(raw) {
  if (raw?.version !== 1 || !Number.isInteger(raw.fromYear) || raw.fromYear < 1900 || raw.fromYear > 2200 || !Number.isInteger(raw.hitCount) || raw.hitCount < 0) throw new Error('PI 论文统计格式无效。');
  return { version: 1, checkedOn: date(raw.checkedOn), fromYear: raw.fromYear, toDate: date(raw.toDate), query: text(raw.query, 5000), sourceUrl: url(raw.sourceUrl), complete: raw.complete === true, hitCount: raw.hitCount, excluded: Number(raw.excluded) || 0,
    identity: { names: list(raw.identity.names, 8, x => text(x, 300)), affiliations: list(raw.identity.affiliations, 30, x => text(x, 500)), orcid: text(raw.identity.orcid || '', 100) },
    works: list(raw.works, 3000, w => ({ id: text(w.id, 100), title: text(w.title, 5000), doi: text(w.doi, 500), url: url(w.url), publishedDate: date(w.publishedDate), journal: text(w.journal, 500), issns: list(w.issns, 5, x => text(x, 20)),
      kind: enumValue(w.kind, ['article', 'review', 'preprint', 'other']), match: enumValue(w.match, ['orcid', 'affiliation', 'name', 'initials']), authorPosition: enumValue(w.authorPosition, ['first', 'last', 'middle', 'sole']), piAuthor: text(w.piAuthor, 300), affiliation: text(w.affiliation, 4000),
      citations: Number.isInteger(w.citations) && w.citations >= 0 ? w.citations : 0, keywords: list(w.keywords, 100, x => text(x, 500)),
      authors: list(w.authors, 300, x => ({ name: text(x.name, 300), orcid: text(x.orcid || '', 100) })) })) };
}
function validateDossierBatch(raw) {
  if (raw?.format !== 'neuroshelf-dossiers' || raw.version !== 1 || !/^[a-z0-9-]{1,80}$/.test(raw.projectId || '')) throw new Error('PI 档案批次无效。');
  const batch = { format: raw.format, version: 1, projectId: raw.projectId, entries: list(raw.entries, 60, entry => {
    if (!entry.dossier && !entry.bibliography) throw new Error('档案批次内容为空。');
    return { website: url(entry.website), ...(entry.dossier ? { dossier: validateDossier(entry.dossier) } : {}), ...(entry.bibliography ? { bibliography: validateBibliography(entry.bibliography) } : {}) };
  }) };
  return { ...batch, id: 'dossier-' + crypto.createHash('sha256').update(JSON.stringify(batch)).digest('hex').slice(0, 24) };
}
function addDossiers(library, raw) {
  const batch = validateDossierBatch(raw);
  if (batch.projectId !== library.projectId) throw new Error('PI 档案属于另一个项目。');
  if (library.people?.batches.some(b => b.id === batch.id)) return false;
  for (const entry of batch.entries) {
    const p = library.people?.profiles.find(p => p.website.replace(/\/$/, '') === entry.website.replace(/\/$/, ''));
    if (!p) throw new Error('请先添加这位 PI 的基本资料：' + entry.website);
    for (const key of ['dossier', 'bibliography']) if (entry[key] && (!p[key] || entry[key].checkedOn >= p[key].checkedOn)) p[key] = entry[key];
  }
  library.people.batches.push({ id: batch.id, checkedOn: new Date().toISOString().slice(0, 10), summary: 'PI 详细档案与论文数据更新' });
  return true;
}
async function publishDossier(directory, raw) {
  const batch = validateDossierBatch(raw); await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, batch.id + '.json');
  try { const old = validateDossierBatch(JSON.parse(await fs.readFile(file, 'utf8'))); if (old.id !== batch.id) throw new Error('档案批次校验失败。'); return { file, id: batch.id }; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = file + '.' + crypto.randomUUID() + '.tmp'; await fs.writeFile(temp, JSON.stringify(batch, null, 2)); await renameWithRetry(temp, file); return { file, id: batch.id };
}
module.exports = { validateDossier, validateBibliography, validateDossierBatch, addDossiers, publishDossier };
