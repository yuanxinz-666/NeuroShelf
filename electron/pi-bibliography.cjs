const { retrieve } = require('./downloads.cjs');
const { validateBibliography } = require('./pi-dossier.cjs');
const identities = require('../data/pi-identities.json');
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function identityFor(person) {
  const known = identities[person.name];
  return { names: known?.names || [person.name], affiliations: known?.affiliations || [person.institution.split(/[;；·]/)[0].trim()], orcid: known?.orcid || '' };
}
function authorMatch(author, identity) {
  if (identity.orcid && author.authorId?.value === identity.orcid) return 'orcid';
  const family = normalize(author.lastName), given = normalize(author.firstName).split(' ')[0];
  let name = false, initials = false;
  for (const alias of identity.names) {
    const parts = normalize(alias).split(' '), first = parts[0], last = parts.slice(-family.split(' ').length).join(' ');
    if (!family || family !== last) continue;
    name ||= given === first;
    initials ||= given === first[0] || (!given && normalize(author.initials).startsWith(first[0]));
  }
  if (!name && !initials) return null;
  const affiliation = normalize((author.authorAffiliationDetailsList?.authorAffiliation || []).map(a => a.affiliation).join(' '));
  const institution = identity.affiliations.some(s => normalize(s).length >= 4 && affiliation.includes(normalize(s)));
  if (name && institution) return 'affiliation';
  return name ? 'name' : 'initials';
}
function parseWork(raw, identity) {
  const authors = raw.authorList?.author || [];
  const index = authors.findIndex(a => authorMatch(a, identity)); if (index < 0 || !raw.title || !/^\d{4}-\d{2}-\d{2}$/.test(raw.firstPublicationDate || '')) return null;
  const a = authors[index], types = raw.pubTypeList?.pubType || [], journal = raw.journalInfo?.journal || {};
  const kind = types.some(t => /preprint/i.test(t)) || raw.source === 'PPR' ? 'preprint' : types.some(t => /correction|erratum|editorial|comment|retraction|letter/i.test(t)) ? 'other' : types.some(t => /review/i.test(t)) ? 'review' : types.includes('Journal Article') ? 'article' : 'other';
  const readableName = a => [a.firstName, a.lastName].filter(Boolean).join(' ') || a.fullName || a.collectiveName || '';
  return { id: `${raw.source}:${raw.id}`, title: raw.title.replace(/<[^>]+>/g, ''), doi: (raw.doi || '').toLowerCase(), url: raw.source === 'MED' ? `https://pubmed.ncbi.nlm.nih.gov/${raw.id}/` : `https://europepmc.org/article/${raw.source}/${raw.id}`, publishedDate: raw.firstPublicationDate, journal: journal.title || (kind === 'preprint' ? '预印本' : ''), issns: [journal.issn, journal.essn].filter(Boolean), kind, match: authorMatch(a, identity),
    authorPosition: authors.length === 1 ? 'sole' : index === 0 ? 'first' : index === authors.length - 1 ? 'last' : 'middle', piAuthor: readableName(a), affiliation: (a.authorAffiliationDetailsList?.authorAffiliation || []).map(a => a.affiliation).join('; ').slice(0, 4000), citations: raw.citedByCount || 0,
    keywords: [...new Set([...(raw.keywordList?.keyword || []), ...(raw.meshHeadingList?.meshHeading || []).map(m => m.descriptorName)].filter(Boolean))].slice(0, 100),
    authors: authors.slice(0, 300).map(a => ({ name: readableName(a), orcid: a.authorId?.type === 'ORCID' ? a.authorId.value : '' })) };
}
async function fetchBibliography(person, { signal, progress = () => {}, get = retrieve, now = new Date(), maxPages = 20 } = {}) {
  const identity = identityFor(person), toDate = now.toISOString().slice(0, 10), fromYear = now.getUTCFullYear() - 9;
  const query = '(' + identity.names.map(name => 'AUTH:"' + name.replace(/["\\]/g, '') + '"').join(' OR ') + (identity.orcid ? ' OR AUTHORID:' + identity.orcid : '') + `) AND FIRST_PDATE:[${fromYear}-01-01 TO ${toDate}]`;
  const base = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=100&query=' + encodeURIComponent(query);
  const works = [], seen = new Set(); let cursor = '*', hitCount = 0, processed = 0, excluded = 0, complete = false;
  for (let page = 0; page < maxPages; page++) {
    signal?.throwIfAborted(); progress({ phase: 'searching', message: `正在读取 ${person.name} 的论文记录，第 ${page + 1} 页…`, detail: 'Europe PMC / PubMed' });
    const result = JSON.parse((await get(base + '&cursorMark=' + encodeURIComponent(cursor), { signal, maxBytes: 12 * 1024 * 1024 })).bytes.toString('utf8'));
    if (!Array.isArray(result.resultList?.result) || !Number.isInteger(result.hitCount)) throw new Error('论文数据库返回的数据无法识别。');
    hitCount = result.hitCount;
    for (const raw of result.resultList.result) {
      processed++; const w = parseWork(raw, identity);
      if (!w || w.publishedDate < `${fromYear}-01-01` || w.publishedDate > toDate) { excluded++; continue; }
      const key = w.doi || normalize(w.title);
      if (seen.has(key)) continue; seen.add(key); works.push(w);
    }
    if (processed >= hitCount || !result.resultList.result.length) { complete = true; break; }
    if (!result.nextCursorMark || result.nextCursorMark === cursor) break; cursor = result.nextCursorMark;
  }
  works.sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
  return validateBibliography({ version: 1, checkedOn: toDate, fromYear, toDate, identity, query, sourceUrl: 'https://europepmc.org/search?query=' + encodeURIComponent(query), hitCount, excluded, complete, works });
}
module.exports = { identityFor, authorMatch, parseWork, fetchBibliography, normalize };
