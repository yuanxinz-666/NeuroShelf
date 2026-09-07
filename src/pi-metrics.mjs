export const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const issn = s => String(s).toUpperCase().replace(/[^0-9X]/g, '');
export function cnsJournal(work) {
  const ids = (work.issns || []).map(issn);
  if (ids.some(id => ['00928674', '10974172'].includes(id))) return 'Cell';
  if (ids.some(id => ['00280836', '14764687'].includes(id))) return 'Nature';
  if (ids.some(id => ['00368075', '10959203'].includes(id))) return 'Science';
  return ({ cell: 'Cell', nature: 'Nature', science: 'Science', 'science new york ny': 'Science', 'science new york n y': 'Science' })[norm(work.journal)] || '';
}
export const confirmed = work => ['affiliation', 'orcid'].includes(work.match);
export function eligibleWorks(bibliography, { uncertain = false, position = 'all', kind = 'all' } = {}) {
  const seen = new Set();
  return (bibliography?.works || []).filter(w => {
    if (!(uncertain || confirmed(w)) || !['article', 'review'].includes(w.kind) || (kind !== 'all' && w.kind !== kind) || (position !== 'all' && w.authorPosition !== position && w.authorPosition !== 'sole') || w.publishedDate < `${bibliography.fromYear}-01-01` || w.publishedDate > bibliography.toDate) return false;
    const key = w.doi?.toLowerCase() || norm(w.title); if (seen.has(key)) return false; seen.add(key); return true;
  });
}
export function classification(work, rows, system, year) {
  const ids = work.issns.map(issn);
  const matches = rows.filter(r => r.system === system && r.year === Number(year) && ids.includes(issn(r.issn)));
  if (!matches.length) return { known: false, q1: false, sources: [] };
  return { known: true, q1: matches.some(r => r.quartile === 1 && r.scie), sources: matches };
}
export function summarize(works, bibliography, rows = [], system = 'cas', year = '') {
  const from = bibliography?.fromYear || new Date().getFullYear() - 9, to = Number(bibliography?.toDate.slice(0, 4)) || new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, to - from + 1) }, (_, index) => ({ year: from + index, total: 0, cns: 0, q1: 0 }));
  const cns = { Cell: 0, Nature: 0, Science: 0 }; let known = 0, q1 = 0;
  for (const w of works) {
    const target = years.find(y => y.year === Number(w.publishedDate.slice(0, 4))); if (!target) continue;
    target.total++; const journal = cnsJournal(w); if (journal) { cns[journal]++; target.cns++; }
    const rank = classification(w, rows, system, year); if (rank.known) known++; if (rank.q1) { q1++; target.q1++; }
  }
  return { years, cns, cnsTotal: Object.values(cns).reduce((a, b) => a + b, 0), total: works.length, known, q1: known ? q1 : null, unknown: works.length - known };
}
const generic = new Set(['animals', 'humans', 'mice', 'male', 'female', 'adult', 'mice inbred c57bl', 'rats', 'methods', 'neurons', 'brain', 'young adult', 'aged']);
export function keywords(works) {
  const counts = new Map();
  for (const w of works) for (const term of new Set(w.keywords.map(norm).filter(t => t.length > 2 && !generic.has(t)))) {
    const old = counts.get(term) || { term: w.keywords.find(k => norm(k) === term), count: 0, early: 0, late: 0, papers: [] };
    old.count++; old.papers.push(w.id); counts.set(term, old);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, 18);
}
export function coauthors(works) {
  const people = new Map();
  for (const w of works) {
    const seen = new Set();
    for (const author of w.authors) {
      if (!author.name || norm(author.name) === norm(w.piAuthor)) continue;
      const key = author.orcid || norm(author.name); if (seen.has(key)) continue; seen.add(key);
      const p = people.get(key) || { key, name: author.name, orcid: author.orcid, papers: [] };
      p.papers.push(w); people.set(key, p);
    }
  }
  return [...people.values()].sort((a, b) => b.papers.length - a.papers.length || a.name.localeCompare(b.name));
}
export function fundingLabel(grant, today = new Date().toISOString().slice(0, 10)) {
  if (grant.end && grant.end < today) return '已结束（按公开项目期）';
  if (grant.start && grant.start > today) return '尚未到开始日期';
  if (grant.status === 'active') return '来源注明在研';
  return ({ awarded: '已宣布获资助', completed: '已结束', unknown: '当前状态待核实' })[grant.status];
}
