import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export { pdfjs };
export function loadPdf(bytes) {
  return pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false,
    cMapUrl: new URL('pdf-assets/cmaps/', document.baseURI).href, cMapPacked: true,
    standardFontDataUrl: new URL('pdf-assets/standard_fonts/', document.baseURI).href,
    wasmUrl: new URL('pdf-assets/wasm/', document.baseURI).href });
}
export function pageText(content) {
  return content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim();
}
export function relatedPages(pages, query, currentPage) {
  const stopWords = new Set(['the','and','for','from','with','that','this','these','those','are','was','were','has','have','can','not','into','through','its','their','our','which','what','how']);
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || []).filter(word => !stopWords.has(word)))];
  return Object.entries(pages).filter(([p]) => Number(p) !== currentPage).map(([page, text]) => {
    const lower = text.toLowerCase();
    return { page: Number(page), text, score: terms.reduce((sum, t) => sum + Math.min(lower.split(t).length - 1, 10), 0) };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}
