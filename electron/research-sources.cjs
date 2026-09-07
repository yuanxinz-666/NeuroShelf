const { retrieve } = require('./downloads.cjs');
const { titleOf, doiOf } = require('./weekly.cjs');
const PLAN_SCHEMA = { type: 'object', properties: { paperQueries: { type: 'array', items: { type: 'string' } }, piQueries: { type: 'array', items: { type: 'string' } } }, required: ['paperQueries', 'piQueries'], additionalProperties: false };
const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => { const code = Number(n); return code <= 0x10ffff ? String.fromCodePoint(code) : ''; }).replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, s => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' })[s]);
const plain = html => decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const field = (xml, name) => decode(xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>'))?.[1] || '');
function rssResults(xml) { return (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map(item => ({ title: plain(field(item, 'title')), url: field(item, 'link'), snippet: plain(field(item, 'description')) })).filter(r => r.url.startsWith('https://')); }
function planPrompt(project, kind) { return `把以下研究问题转成公开学术数据库和网页搜索查询词。只生成查询词，不声称已经搜索。project=${JSON.stringify(project)}。模式=${kind}。paperQueries 给 3 个互补的 Europe PMC 查询（英文术语，可用 AND/OR、括号、引号，不加日期），首个直接对应核心问题，其余扩大到方法和相关机制。piQueries 给 3 个查找相关 PI、大实验室和官方研究团队网站的英文查询。仅返回 JSON。`; }
async function collectSources({ project, library, kind, plan, signal, progress, get = retrieve }) {
  const papers = [], pages = [], searchResults = [], log = [], errors = [], searchedSources = [];
  const today = new Date().toISOString().slice(0, 10), since = new Date(); since.setUTCDate(since.getUTCDate() - 14);
  const capture = async (url, type) => { const result = await get(url, { signal }); log.push({ type, url: result.url, fetchedAt: new Date().toISOString(), bytes: result.bytes.length }); return result; };
  if (!Array.isArray(plan.paperQueries) || !Array.isArray(plan.piQueries) || [...plan.paperQueries, ...plan.piQueries].some(q => typeof q !== 'string' || q.length > 1500)) throw new Error('AI 返回的检索词格式无效。');
  if (kind !== 'people') {
    for (const query of plan.paperQueries.slice(0, 4)) {
      if (signal.aborted) throw new Error('已停止');
      progress('检索论文摘要：' + query);
      const dated = kind === 'weekly' ? `(${query}) AND (FIRST_PDATE:[${since.toISOString().slice(0, 10)} TO ${today}] OR FIRST_IDATE:[${since.toISOString().slice(0, 10)} TO ${today}])` : query;
      const url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=30&query=' + encodeURIComponent(dated);
      try {
        const result = JSON.parse((await capture(url, 'Europe PMC')).bytes.toString('utf8'));
        if (!Array.isArray(result.resultList?.result)) throw new Error('数据库未返回可识别的记录。');
        searchedSources.push('Europe PMC / PubMed：' + dated);
        for (const p of result.resultList.result) {
          if (!p.abstractText || !p.title || papers.some(old => (p.doi && old.doi === p.doi) || titleOf(old) === titleOf(p))) continue;
          const sourceUrl = p.source === 'MED' ? `https://pubmed.ncbi.nlm.nih.gov/${p.id}/` : `https://europepmc.org/article/${p.source}/${p.id}`;
          papers.push({ title: p.title, authors: p.authorString, journal: p.journalInfo?.journal?.title || p.bookOrReportDetails?.publisher || (p.source === 'PPR' ? '预印本' : ''), doi: p.doi || '', pmid: p.source === 'MED' ? p.id : '', publishedDate: p.firstPublicationDate || '', firstIndexDate: p.firstIndexDate || '', source: p.source, url: sourceUrl, abstract: plain(p.abstractText).slice(0, 14000), authorAffiliations: (p.authorList?.author || []).flatMap(a => (a.authorAffiliationDetailsList?.authorAffiliation || []).map(aff => ({ author: a.fullName, affiliation: aff.affiliation }))).slice(0, 12) });
        }
      } catch (e) { if (signal.aborted) throw e; errors.push('Europe PMC：' + e.message); }
    }
  }
  const followed = (library.people?.profiles || []).filter(p => p.followed);
  const queries = kind === 'weekly' ? followed.slice(0, 15).map(p => `"${p.name}" laboratory funding grant project publication recruitment ${today.slice(0, 4)}`) : plan.piQueries.slice(0, 4);
  const urls = new Set((kind === 'weekly' ? followed : library.people?.profiles || []).slice(0, 15).flatMap(p => [p.website, ...p.sources.map(s => s.url)]));
  for (const query of queries) {
    progress('查找实验室公开来源：' + query);
    try {
      const url = 'https://www.bing.com/search?format=rss&q=' + encodeURIComponent(query), result = await capture(url, '公开网页索引');
      const hits = rssResults(result.bytes.toString('utf8')); if (!hits.length) throw new Error('网页搜索没有可解析的结果，可能需要人工检索。');
      searchedSources.push('公开网页索引：' + query); searchResults.push(...hits);
      for (const hit of hits.slice(0, 5)) {
        const host = new URL(hit.url).hostname;
        if (!/(wikipedia|researchgate|linkedin|facebook|twitter|youtube|reddit|x\.com$)/i.test(host)) urls.add(hit.url);
      }
    } catch (e) { if (signal.aborted) throw e; errors.push('网页索引：' + e.message); }
  }
  // Academic affiliation data and search snippets are leads; only fetched official pages may support a PI profile.
  if (urls.size > 20) errors.push('本轮网页读取上限为 20 个，其余线索可在下一轮补查。');
  for (const url of [...urls].slice(0, 20)) {
    progress('读取实验室来源：' + new URL(url).hostname);
    try {
      const page = await capture(url, '公开机构页面'); if (!/html|text|json/i.test(page.type)) continue;
      const text = plain(page.bytes.toString('utf8'));
      if (text.length < 120 || /verify you are human|enable javascript and cookies to continue|checking your browser/i.test(text.slice(0, 3000))) throw new Error('页面受限，未作为核验来源。');
      pages.push({ url: page.url, text: text.slice(0, 18000) });
    } catch (e) { if (signal.aborted) throw e; errors.push(new URL(url).hostname + '：' + e.message); }
  }
  if (!papers.length && !pages.length) throw new Error('本轮没有取得可供核验的论文摘要或机构页面。请检查网络，或稍后重试。');
  return { papers, pages, searchResults, log, errors, searchedSources, fetchedAt: new Date().toISOString() };
}
function groundResult(raw, sources) {
  const urls = new Set(sources.pages.map(p => p.url.replace(/\/$/, ''))), skipped = [];
  raw.candidates = raw.candidates.filter(c => {
    const source = sources.papers.find(p => (doiOf(c) && doiOf(c) === doiOf(p)) || titleOf(c) === titleOf(p));
    if (!source || titleOf(source) !== titleOf(c)) { skipped.push(c.title); return false; }
    c.sources = [{ label: '已获取的论文摘要记录', url: source.url }]; c.url = source.url; c.verification = '已核对摘要';
    c.authors = source.authors; c.publishedDate = source.publishedDate; c.doi = source.doi; c.pmid = source.pmid;
    if (source.source === 'PPR') c.publication = '预印本';
    return true;
  });
  raw.profiles = raw.profiles.filter(p => { p.sources = p.sources.filter(s => urls.has(s.url.replace(/\/$/, ''))); return p.sources.length > 0; });
  const piUrls = new Set(raw.profiles.map(p => p.website.replace(/\/$/, '')));
  raw.events = raw.events.filter(e => { e.sources = e.sources.filter(s => urls.has(s.url.replace(/\/$/, ''))); return e.sources.length > 0 && piUrls.has(e.piWebsite.replace(/\/$/, '')); });
  raw.checkedCount = sources.papers.length; raw.searchedSources = sources.searchedSources.slice(0, 12);
  if (!raw.searchedSources.length) raw.searchedSources = ['已关注实验室官方页面'];
  raw.complete = raw.complete && !sources.errors.length && !skipped.length;
  raw.summary += `\n实际获取 ${sources.papers.length} 份摘要、${sources.pages.length} 个网页；检索不保证穷尽全网。` + (sources.errors.length ? '\n未完成来源：' + [...new Set(sources.errors)].slice(0, 8).join('；') : '') + (skipped.length ? '\n有 ' + skipped.length + ' 条无法与来源对应的论文，未放入候选区。' : '');
  return raw;
}
module.exports = { PLAN_SCHEMA, planPrompt, collectSources, groundResult, rssResults, plain };
