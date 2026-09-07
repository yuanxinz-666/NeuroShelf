const fs = require('node:fs/promises');
const path = require('node:path');
const dns = require('node:dns/promises');
const net = require('node:net');
const { doiOf, titleOf } = require('./weekly.cjs');
const { verifyPdf, MAX_PDF_BYTES } = require('./store.cjs');
const { atomicJson } = require('./projects.cjs');

function publicAddress(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127);
  }
  return net.isIP(ip) === 6 && !/^(?:fc|fd|fe[89ab]|ff|::)/i.test(ip);
}
async function safeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('全文链接不是有效的公开 HTTPS 地址。');
  const addresses = await dns.lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('不允许访问本地或私有网络全文链接。');
  return url;
}
async function retrieve(value, { signal, maxBytes = 4 * 1024 * 1024 } = {}) {
  let url = value;
  for (let redirects = 0; redirects < 7; redirects++) {
    const checked = await safeUrl(url), response = await fetch(checked, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(45000)]), redirect: 'manual', headers: { 'User-Agent': 'NeuroShelf/0.5 research-library', Accept: 'application/pdf,application/json,text/html,application/xml;q=0.8,*/*;q=0.5' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { await response.body?.cancel(); url = new URL(response.headers.get('location'), checked).href; continue; }
    if (!response.ok) { await response.body?.cancel(); throw new Error('来源返回 HTTP ' + response.status); }
    if (Number(response.headers.get('content-length') || 0) > maxBytes) { await response.body?.cancel(); throw new Error('文件超过大小限制。'); }
    const parts = []; let size = 0;
    try { for await (const part of response.body) { size += part.length; if (size > maxBytes) throw new Error('文件超过大小限制。'); parts.push(part); } }
    catch (e) { throw e; }
    return { bytes: Buffer.concat(parts), url: checked.href, type: response.headers.get('content-type') || '' };
  }
  throw new Error('全文地址跳转次数过多。');
}
async function candidates(paper, signal, retrieveImpl = retrieve) {
  const urls = [], doi = doiOf(paper);
  const query = doi ? 'DOI:"' + doi.replace(/"/g, '') + '"' : 'TITLE:"' + paper.title.replace(/"/g, '') + '"';
  const data = JSON.parse((await retrieveImpl('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=5&query=' + encodeURIComponent(query), { signal })).bytes.toString('utf8'));
  const record = (data.resultList?.result || []).find(r => (doi && r.doi?.toLowerCase() === doi) || titleOf(r) === titleOf(paper));
  for (const link of record?.fullTextUrlList?.fullTextUrl || []) if (link.documentStyle === 'pdf' && link.url.startsWith('https:')) urls.push(link.url);
  if (record?.pmcid) {
    try {
      const xml = (await retrieveImpl('https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi?id=' + record.pmcid, { signal })).bytes.toString('utf8');
      for (const match of xml.matchAll(/<link\s+[^>]*format="pdf"[^>]*href="([^"]+)"/g)) urls.push(match[1].replace(/^ftp:/, 'https:'));
    } catch (e) { if (signal.aborted) throw e; }
  }
  if (/^10\.(?:1101|64898)\//.test(doi)) urls.push('https://www.biorxiv.org/content/' + doi + '.full.pdf');
  return { urls: [...new Set(urls)], landing: doi ? 'https://doi.org/' + doi : paper.url };
}
function titleMatches(paper, extracted) {
  const actual = titleOf({ title: extracted }), target = titleOf(paper);
  if (target.length < 20) return false;
  if (actual.includes(target)) return true;
  // Accommodate line wraps, ligatures and minor subtitle punctuation, while requiring strong overlap.
  const words = paper.title.normalize('NFKC').toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const hay = extracted.normalize('NFKC').toLowerCase().replace(/-\s+/g, '');
  return words.length >= 6 && words.filter(w => hay.includes(w)).length / words.length >= 0.92;
}
async function verifyDownloaded(paper, bytes) {
  verifyPdf(bytes);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true, disableFontFace: true });
  let doc;
  try {
    doc = await task.promise; let text = '';
    for (let page = 1; page <= Math.min(2, doc.numPages); page++) text += (await (await doc.getPage(page)).getTextContent()).items.map(item => item.str || '').join(' ');
    if (!titleMatches(paper, text)) throw new Error('PDF 标题未能与文献对应，请人工核对后导入。');
    return doc.numPages;
  } finally { if (doc) await doc.destroy(); else await task.destroy(); }
}
function htmlPdfLink(html, base) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!/(?:name|property)\s*=\s*["']citation_pdf_url["']/i.test(tag)) continue;
    const value = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (value) return new URL(value.replace(/&amp;/g, '&'), base).href;
  }
  return null;
}
async function downloadMissing(context, signal, progress, deps = {}) {
  const get = deps.retrieve || retrieve, inspect = deps.verify || verifyDownloaded, results = [];
  const papers = context.store.get().papers.filter(p => !p.pdf);
  const reportFile = path.join(context.directory, 'downloads', 'pdf-downloads-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  for (let index = 0; index < papers.length; index++) {
    if (signal.aborted) break;
    const paper = papers[index], attempts = [];
    progress(`正在查找 PDF ${index + 1}/${papers.length}：${paper.title}`);
    let outcome;
    try {
      const found = await candidates(paper, signal, get);
      if (found.landing) {
        try { const page = await get(found.landing, { signal, maxBytes: MAX_PDF_BYTES }); if (page.bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) found.urls.push(page.url); else { const pdf = htmlPdfLink(page.bytes.toString('utf8'), page.url); if (pdf) found.urls.push(pdf); } }
        catch (e) { attempts.push(e.message); }
      }
      for (const url of [...new Set(found.urls)].slice(0, 6)) {
        if (signal.aborted) break;
        try {
          const fetched = await get(url, { signal, maxBytes: MAX_PDF_BYTES }), pages = await inspect(paper, fetched.bytes);
          await context.store.importPdf({ id: paper.id, name: paper.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 150) + '.pdf', bytes: fetched.bytes });
          outcome = { id: paper.id, title: paper.title, status: 'downloaded', url: fetched.url, pages }; break;
        } catch (e) { attempts.push(e.message); }
      }
    } catch (e) { attempts.push(e.message); }
    results.push(outcome || { id: paper.id, title: paper.title, status: signal.aborted ? 'interrupted' : 'manual', url: paper.url || '', reason: [...new Set(attempts)].join('；').slice(0, 2000) || '没有找到可直接下载并核验的 PDF。' });
    await atomicJson(reportFile, { projectId: context.project.id, checkedAt: new Date().toISOString(), results });
  }
  if (signal.aborted) throw new Error('下载已停止。');
  return results;
}
module.exports = { downloadMissing, verifyDownloaded, titleMatches, htmlPdfLink, retrieve, publicAddress, candidates };
