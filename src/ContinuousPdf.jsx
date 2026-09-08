import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, MessageSquareText, FileWarning } from 'lucide-react';
import { t, tx, te } from './i18n';
import { pdfjs, pageText } from './pdf';
import { pageLayout, pageAtOffset, visiblePages } from './continuous-layout.mjs';

function RenderedPage({ doc, row, highlights, activeAnnotation, register, capture, annotate }) {
  const element = useRef(null), canvas = useRef(null), layer = useRef(null);
  const [state, setState] = useState({ loading: true, error: '', text: '' });
  useEffect(() => {
    let cancelled = false, renderTask, textLayer;
    const pageElement = element.current, pageCanvas = canvas.current, textContainer = layer.current;
    const info = { element: pageElement, canvas: pageCanvas, layer: textContainer, text: '', ready: false, width: row.width };
    register(row.number, info); setState({ loading: true, error: '', text: '' });
    textContainer.replaceChildren();
    (async () => {
      try {
        const pdfPage = await doc.getPage(row.number); if (cancelled) return;
        const scale = row.width / pdfPage.getViewport({ scale: 1 }).width, viewport = pdfPage.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8000000 / (viewport.width * viewport.height)));
        pageCanvas.width = Math.floor(viewport.width * dpr); pageCanvas.height = Math.floor(viewport.height * dpr);
        pageCanvas.style.width = viewport.width + 'px'; pageCanvas.style.height = viewport.height + 'px';
        pageElement.style.setProperty('--scale-factor', scale); pageElement.style.setProperty('--total-scale-factor', scale);
        renderTask = pdfPage.render({ canvasContext: pageCanvas.getContext('2d'), canvas: pageCanvas, viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
        await renderTask.promise; if (cancelled) return;
        const content = await pdfPage.getTextContent(); if (cancelled) return;
        textLayer = new pdfjs.TextLayer({ textContentSource: content, container: textContainer, viewport });
        await textLayer.render(); if (cancelled) return;
        info.text = pageText(content); info.ready = true; register(row.number, info);
        setState({ loading: false, error: '', text: info.text });
      } catch (error) {
        if (!cancelled && !['RenderingCancelledException','AbortException'].includes(error.name)) {
          info.error = error.message; register(row.number, info); setState({ loading: false, error: error.message, text: '' });
        }
      }
    })();
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); register(row.number, null); };
  }, [doc, row.number, row.width, register]);
  return <div ref={element} className="pdf-page continuous-page" data-pdf-page={row.number} data-ready={!state.loading && !state.error} style={{ width: row.width, height: row.height }} onMouseUp={event => capture(event, row.number)}>
    <canvas ref={canvas} aria-label={tx`论文 PDF 第 ${row.number} 页`} />
    <div className="highlight-layer">{highlights.flatMap(h => (h.rects || []).map((r, index) => <div key={h.id + index} className={`pdf-highlight ${h.color} ${activeAnnotation?.id === h.id ? 'active' : ''}`} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />))}</div>
    <div className="textLayer" ref={layer} />
    <div className="annotation-markers">{highlights.filter(h => h.rects?.length).map((h, index) => <button key={h.id} className={activeAnnotation?.id === h.id ? 'active' : ''} style={{ top: `${h.rects[0].y * 100}%` }} aria-label={tx`查看第 ${index + 1} 条原文旁注`} title={h.comment || t('为这段高亮写旁注')} onClick={() => annotate(h, true)}><MessageSquareText size={15} /></button>)}</div>
    {state.loading && <div className="continuous-page-notice"><LoaderCircle className="spin" size={19} />{tx`正在显示第 ${row.number} 页`}</div>}
    {state.error && <div className="continuous-page-notice"><FileWarning size={22} />{te(state.error)}</div>}
    {!state.loading && !state.error && !state.text.trim() && <div className="continuous-scan-hint">{t('此页没有文字层，可从右侧 AI 助手附上当前页图片提问。')}</div>}
  </div>;
}

export default forwardRef(function ContinuousPdf({ doc, width, initialPage, page, paper, scrollRef, onPage, onReady, capture, annotate, activeAnnotation }, ref) {
  const [sizes, setSizes] = useState([]), [near, setNear] = useState([]);
  const root = useRef(null), rendered = useRef(new Map()), previousLayout = useRef([]), request = useRef({ number: initialPage, fraction: 0 }), frame = useRef(null);
  const latest = useRef(); latest.current = { onPage, onReady, page };
  const rows = useMemo(() => pageLayout(sizes, width), [sizes, width]);
  const layout = useRef(rows); layout.current = rows;
  useEffect(() => {
    let alive = true; setSizes([]);
    (async () => {
      const dimensions = [];
      for (let start = 1; start <= doc.numPages && alive; start += 12) {
        const batch = await Promise.all(Array.from({ length: Math.min(12, doc.numPages - start + 1) }, async (_, i) => {
          try { const viewport = (await doc.getPage(start + i)).getViewport({ scale: 1 }); return { width: viewport.width, height: viewport.height }; }
          catch { return { width: 612, height: 792 }; }
        }));
        dimensions.push(...batch);
      }
      if (alive) setSizes(dimensions);
    })();
    return () => { alive = false; };
  }, [doc]);
  const scan = useCallback(() => {
    const scroll = scrollRef.current, rows = layout.current; if (!scroll || !rows.length || !root.current) return;
    const top = Math.max(0, scroll.scrollTop - root.current.offsetTop);
    const wanted = visiblePages(rows, top, scroll.clientHeight);
    setNear(old => old.join() === wanted.join() ? old : wanted);
    const atEnd = scroll.scrollTop > 0 && scroll.scrollHeight > scroll.clientHeight + 2 && scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 2;
    const number = atEnd ? rows.length : pageAtOffset(rows, top + Math.min(160, scroll.clientHeight * .18));
    latest.current.onPage(number, rendered.current.get(number));
  }, [scrollRef]);
  const register = useCallback((number, info) => {
    if (info) rendered.current.set(number, info); else rendered.current.delete(number);
    latest.current.onReady(number, info);
  }, []);
  useImperativeHandle(ref, () => ({
    getPage: number => rendered.current.get(number),
    go(number, fraction = 0) {
      request.current = { number, fraction };
      const row = layout.current[number - 1], scroll = scrollRef.current;
      if (row && root.current && scroll) { scroll.scrollTop = root.current.offsetTop + row.top + row.height * fraction; request.current = null; scan(); }
    },
  }), [scan, scrollRef]);
  useLayoutEffect(() => {
    if (!rows.length || !root.current || !scrollRef.current) return;
    const scroll = scrollRef.current, previous = previousLayout.current;
    const top = scroll.scrollTop - root.current.offsetTop;
    const old = previous[pageAtOffset(previous, top) - 1];
    const anchor = request.current || (old ? { number: old.number, fraction: Math.max(0, (top - old.top) / old.height) } : { number: latest.current.page, fraction: 0 });
    const row = rows[Math.max(0, Math.min(rows.length - 1, anchor.number - 1))];
    scroll.scrollTop = root.current.offsetTop + row.top + row.height * anchor.fraction;
    previousLayout.current = rows; request.current = null; scan();
  }, [rows, scan, scrollRef]);
  useEffect(() => {
    const scroll = scrollRef.current; if (!scroll) return;
    const changed = () => { if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; scan(); }); };
    scroll.addEventListener('scroll', changed, { passive: true }); window.addEventListener('resize', changed);
    return () => { scroll.removeEventListener('scroll', changed); window.removeEventListener('resize', changed); cancelAnimationFrame(frame.current); };
  }, [scan, scrollRef]);
  const highlights = useMemo(() => {
    const grouped = new Map();
    for (const h of paper.highlights || []) if (h.source === 'pdf' && (!h.pdfHash || h.pdfHash === paper.pdf.hash)) { if (!grouped.has(h.page)) grouped.set(h.page, []); grouped.get(h.page).push(h); }
    return grouped;
  }, [paper.highlights, paper.pdf.hash]);
  return <div className="continuous-document" ref={root} style={{ minWidth: width }}>
    {!rows.length && <div className="continuous-preparing"><LoaderCircle size={22} className="spin" />{t('正在准备整篇 PDF…')}</div>}
    {rows.map(row => <div className="continuous-page-slot" data-page-number={row.number} key={row.number} style={{ height: row.height + 36, width: row.width }}>
      {near.includes(row.number) ? <RenderedPage doc={doc} row={row} highlights={highlights.get(row.number) || []} activeAnnotation={activeAnnotation} register={register} capture={capture} annotate={annotate} /> : <div className="continuous-placeholder" style={{ height: row.height }} />}
      <div className="continuous-page-label">PDF {row.number} / {doc.numPages}</div>
    </div>)}
  </div>;
});
