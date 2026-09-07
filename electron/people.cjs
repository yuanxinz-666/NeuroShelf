const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateDossier, validateBibliography, validateDossierBatch } = require('./pi-dossier.cjs');
const emptyPeople = () => ({ version: 1, profiles: [], events: [], batches: [] });
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
const text = (value, max = 5000, required = false) => { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('PI 资料字段无效。'); return value.trim(); };
function url(value) { const parsed = new URL(text(value, 4000, true)); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('PI 来源必须是 HTTPS 链接。'); return parsed.href; }
function sources(value) { if (!Array.isArray(value) || !value.length || value.length > 8) throw new Error('每条 PI 资料必须附有来源。'); return value.map(s => ({ label: text(s.label, 200, true), url: url(s.url) })); }
function date(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('PI 日期无效。'); return value; }
function profile(raw) {
  const name = text(raw.name, 300, true), website = url(raw.website);
  // Institutional profile URLs are the identity; names alone can refer to different people.
  return { id: 'pi_' + hash(website.replace(/\/$/, '').toLowerCase()), name, institution: text(raw.institution, 500, true),
    focus: text(raw.focus, 4000, true), relevance: text(raw.relevance, 4000, true), website,
    sources: sources(raw.sources), checkedOn: date(raw.checkedOn) };
}
function event(raw, profiles) {
  if (!['funding', 'project', 'team', 'hiring', 'publication'].includes(raw.type)) throw new Error('PI 动态类型无效。');
  const piUrl = url(raw.piWebsite || profiles.find(p => p.id === raw.piId)?.website), person = profiles.find(p => p.website.replace(/\/$/, '') === piUrl.replace(/\/$/, ''));
  if (!person) throw new Error('PI 动态缺少对应的实验室资料。');
  const refs = sources(raw.sources), title = text(raw.title, 1000, true);
  const eventDate = raw.eventDate ? date(raw.eventDate) : '';
  const detectedOn = date(raw.detectedOn);
  if (eventDate && eventDate > detectedOn) throw new Error('未来计划应在说明中记录，不能当成已发生的动态。');
  return { id: 'ev_' + hash(person.id + raw.type + title.toLowerCase() + refs[0].url), piId: person.id, type: raw.type,
    title, summary: text(raw.summary, 8000, true), relevance: text(raw.relevance, 4000, true), caveat: text(raw.caveat, 4000, true),
    eventDate, detectedOn, baseline: raw.baseline === true || !eventDate, sources: refs,
    journal: text(raw.journal || '', 300), doi: text(raw.doi || '', 500) };
}
function validatePeopleBatch(raw) {
  if (raw?.format !== 'neuroshelf-people' || raw.version !== 1 || !/^[a-z0-9-]{1,80}$/.test(raw.projectId || '') || !Array.isArray(raw.profiles) || raw.profiles.length > 60 || !Array.isArray(raw.events) || raw.events.length > 100) throw new Error('PI 资料批次无效。');
  const profiles = raw.profiles.map(profile);
  const batch = { format: raw.format, version: 1, projectId: raw.projectId, checkedOn: date(raw.checkedOn), summary: text(raw.summary, 8000, true), profiles, events: raw.events.map(e => event(e, profiles)) };
  return { ...batch, id: 'people-' + hash(JSON.stringify(batch)) };
}
function validatePeople(raw) {
  if (raw?.version !== 1 || !Array.isArray(raw.profiles) || !Array.isArray(raw.events) || !Array.isArray(raw.batches)) throw new Error('PI 资料格式无效。');
  for (const p of raw.profiles) { if (profile(p).id !== p.id || typeof p.followed !== 'boolean') throw new Error('PI 资料身份无效。'); text(p.note || '', 100000); if (p.dossier) validateDossier(p.dossier); if (p.bibliography) validateBibliography(p.bibliography); }
  for (const e of raw.events) { const person = raw.profiles.find(p => p.id === e.piId); if (!person || event({ ...e, piWebsite: person.website }, raw.profiles).id !== e.id) throw new Error('PI 动态关联无效。'); }
  if (raw.rankings) require('./journal-rankings.cjs').validateRankings(raw.rankings);
  return raw;
}
function addPeople(library, raw) {
  const batch = validatePeopleBatch(raw);
  if (library.projectId !== batch.projectId) throw new Error('这批 PI 资料属于另一个项目。');
  const people = library.people ||= emptyPeople();
  if (people.batches.some(b => b.id === batch.id)) return false;
  for (const p of batch.profiles) {
    const old = people.profiles.find(v => v.id === p.id);
    if (!old) people.profiles.push({ ...p, followed: false, note: '', updatedAt: new Date().toISOString() });
    else if (p.checkedOn >= old.checkedOn) Object.assign(old, p);
  }
  for (const e of batch.events) if (!people.events.some(v => v.id === e.id)) people.events.push(e);
  people.batches.push({ id: batch.id, checkedOn: batch.checkedOn, summary: batch.summary });
  return true;
}
async function publishPeople(directory, raw) {
  const batch = validatePeopleBatch(raw); await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, batch.id + '.json');
  try { const existing = validatePeopleBatch(JSON.parse(await fs.readFile(file, 'utf8'))); if (existing.id !== batch.id) throw new Error('已有 PI 批次校验失败。'); return { file, id: batch.id }; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify(batch, null, 2), 'utf8'); await fs.rename(temp, file);
  return { file, id: batch.id };
}
async function syncPeople(store, directory) {
  const errors = [], batches = [], dossiers = [];
  const seen = new Set(store.get().people?.batches.map(b => b.id) || []);
  const files = await fs.readdir(directory).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  for (const file of files.filter(f => /^(people|dossier)-[a-f0-9]{24}\.json$/.test(f))) {
    if (seen.has(file.slice(0, -5))) continue;
    try {
      if ((await fs.stat(path.join(directory, file))).size > 40 * 1024 * 1024) throw new Error('资料文件过大。');
      const batch = (file.startsWith('dossier-') ? validateDossierBatch : validatePeopleBatch)(JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')));
      if (batch.id + '.json' !== file) throw new Error('资料校验失败。');
      if (batch.projectId !== store.get().projectId) throw new Error('这批 PI 资料属于另一个项目。');
      (file.startsWith('dossier-') ? dossiers : batches).push(batch);
    } catch (e) { errors.push({ file, message: e.message }); }
  }
  if (batches.length) await store.ingestPeople(batches);
  for (const batch of dossiers) { try { await store.ingestDossiers([batch]); } catch (e) { errors.push({ file: batch.id + '.json', message: e.message }); } }
  return { people: store.get().people || emptyPeople(), errors };
}
module.exports = { emptyPeople, validatePeopleBatch, validatePeople, addPeople, publishPeople, syncPeople };
