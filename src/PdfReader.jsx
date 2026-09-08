import { t, tx, te, dateLocale } from './i18n';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Scan, Search, LoaderCircle, Upload, Highlighter, Sparkles, X, FileWarning, Image as ImageIcon, MessageSquarePlus, MessageSquareText } from 'lucide-react';
import { api } from './bridge';
import { pdfjs, loadPdf, pageText, relatedPages } from './pdf';
import './pdf-text-layer.css';
import { Maximize2, Minimize2, Save, Undo2, Redo2, Keyboard } from 'lucide-react';

const EXPLAIN_SELECTION = '这段原文是什么意思？请先直白解释，再说明关键术语及其在当前论文中的含义；结合提供的上下文，区分原文证据和推断。';

export default function PdfReader({ paper, update, onContext, onAsk, onImport, notify, jump, mutateHighlight, onAnnotation, activeAnnotation, focus = false, toggleFocus, onNewSelection, dismissPopup, onSave, onHistory, onHelp }) {
  const [doc, setDoc] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [page, setPage] = useState(paper.page || 1), [zoom, setZoom] = useState(1), [width, setWidth] = useState(700);
  const [text, setText] = useState(''), [selection, setSelection] = useState(null), [rendering, setRendering] = useState(false);
  const [search, setSearch] = useState(''), [hits, setHits] = useState([]), [hitIndex, setHitIndex] = useState(-1);
  const [indexed, setIndexed] = useState(0), [pageInput, setPageInput] = useState(String(page));
  const canvasRef = useRef(null), layerRef = useRef(null), pageRef = useRef(null), scrollRef = useRef(null), texts = useRef({});
  const addingHighlight = useRef(false), toolbarRef = useRef(null), chromeTimer = useRef(null);
  const [chrome, setChrome] = useState(false), [focusHint, setFocusHint] = useState(false), [toolPosition, setToolPosition] = useState({left:12,top:80});
  function wakeChrome() { setChrome(true); clearTimeout(chromeTimer.current); chromeTimer.current = setTimeout(() => setChrome(false), 1800); }
  useEffect(() => { if (focus) { setChrome(false); setFocusHint(true); const timer = setTimeout(() => setFocusHint(false), 3200); return () => clearTimeout(timer); } }, [focus]);
  useEffect(() => () => clearTimeout(chromeTimer.current), []);
  useLayoutEffect(() => {
    if (!focus || !selection?.anchor || !toolbarRef.current) return;
    const bounds = toolbarRef.current.getBoundingClientRect(), anchor = selection.anchor;
    const left = Math.max(12, Math.min(window.innerWidth - bounds.width - 12, anchor.x - bounds.width / 2));
    const top = anchor.bottom + bounds.height + 20 < window.innerHeight ? anchor.bottom + 10 : anchor.top - bounds.height - 10;
    setToolPosition({left,top:Math.max(12,Math.min(window.innerHeight-bounds.height-12,top))});
  }, [focus, selection]);
  const updateRef = useRef(update); updateRef.current = update;
  useEffect(() => {
    let alive = true, loadingTask, pdf;
    setLoading(true); setError(''); setDoc(null); texts.current = {}; setIndexed(0);
    (async () => {
      try {
        const bytes = await api.readPdf(paper.id);
        if (!alive) return;
        loadingTask = loadPdf(bytes);
        pdf = await loadingTask.promise;
        if (!alive) { await pdf.destroy(); return; }
        setDoc(pdf); setPage(Math.min(paper.page || 1, pdf.numPages)); setLoading(false);
        for (let n = 1; n <= Math.min(pdf.numPages, 800) && alive; n++) {
          try { texts.current[n] = pageText(await (await pdf.getPage(n)).getTextContent()); }
          catch { texts.current[n] = ''; }
          if (alive) setIndexed(n);
        }
      } catch (e) {
        if (!alive) return;
        setError(e.name === 'PasswordException' ? t("这份 PDF 有密码保护。请先用 PDF 软件解锁后重新导入。") : t("PDF 无法打开：") + e.message); setLoading(false);
      }
    })();
    return () => { alive = false; loadingTask?.destroy().catch(() => {}); };
  }, [paper.id, paper.pdf?.hash]);
  useEffect(() => {
    if (!scrollRef.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(320, entries[0].contentRect.width - 64)));
    observer.observe(scrollRef.current); return () => observer.disconnect();
  }, [loading]);
  useEffect(() => {
    if (!doc || !canvasRef.current || !layerRef.current) return;
    let cancelled = false, renderTask, textLayer;
    setRendering(true); setSelection(null); setPageInput(String(page)); setText('');
    const canvas = canvasRef.current, container = layerRef.current;
    container.replaceChildren();
    (async () => {
      try {
        const pdfPage = await doc.getPage(page); if (cancelled) return;
        const scale = (Math.min(width, focus ? 1200 : 980) / pdfPage.getViewport({ scale: 1 }).width) * zoom;
        const viewport = pdfPage.getViewport({ scale }); const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = viewport.width + 'px'; canvas.style.height = viewport.height + 'px';
        pageRef.current.style.width = viewport.width + 'px'; pageRef.current.style.height = viewport.height + 'px';
        pageRef.current.style.setProperty('--scale-factor', scale);
        pageRef.current.style.setProperty('--total-scale-factor', scale);
        renderTask = pdfPage.render({ canvasContext: canvas.getContext('2d'), canvas, viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
        await renderTask.promise; if (cancelled) return;
        const content = await pdfPage.getTextContent(); if (cancelled) return;
        const plain = pageText(content); texts.current[page] = plain; setText(plain);
        textLayer = new pdfjs.TextLayer({ textContentSource: content, container, viewport });
        await textLayer.render(); if (cancelled) return;
        setRendering(false);
      } catch (e) { if (!cancelled && e.name !== 'RenderingCancelledException' && e.name !== 'AbortException') { setError(t("此页渲染失败：") + e.message); setRendering(false); } }
    })();
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [doc, page, width, zoom, focus]);
  function readerContext(excerpt = selection?.text || '') {
    return { page, totalPages: doc?.numPages || 0, pageText: text, selection: excerpt, source: 'pdf', anchor: selection?.anchor,
      getRelated: query => relatedPages(texts.current, query, page),
      getImage: () => {
        const original = canvasRef.current;
        if (!original?.width || rendering) throw new Error(t("请等待当前页显示完成。"));
        const result = document.createElement('canvas'); const factor = Math.min(1, 1600 / original.width);
        result.width = Math.round(original.width * factor); result.height = Math.round(original.height * factor);
        result.getContext('2d').drawImage(original, 0, 0, result.width, result.height);
        return result.toDataURL('image/jpeg', 0.85);
      } };
  }
  useEffect(() => {
    onContext(readerContext());
  }, [page, doc, text, selection, rendering, onContext]);
  useEffect(() => {
    const explainOnSpace = event => {
      if (event.key !== ' ' && event.code !== 'Space') return;
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (document.querySelector('dialog[open]')) return;
      const target = event.target instanceof Element ? event.target : document.activeElement;
      if (target?.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      const selected = readSelection() || (focus && selection?.highlightId ? selection : null);
      if (!selected || rendering) return;
      event.preventDefault();
      if (event.repeat) return;
      setSelection(selected);
      onAsk(t(EXPLAIN_SELECTION), { submit: true, context: { ...readerContext(selected.text), anchor: selected.anchor } });
    };
    window.addEventListener('keydown', explainOnSpace);
    return () => window.removeEventListener('keydown', explainOnSpace);
  }, [onAsk, page, doc, text, selection, rendering, focus]);
  useEffect(() => { if (jump?.page && doc) go(jump.page); }, [jump, doc]);
  useEffect(() => { setHits([]); setHitIndex(-1); }, [search]);
  useEffect(() => {
    if (rendering || page !== jump?.page || !jump?.highlightId) return;
    const highlight = paper.highlights?.find(h => h.id === jump.highlightId);
    if (highlight?.rects?.[0] && pageRef.current && scrollRef.current) scrollRef.current.scrollTo({ top: pageRef.current.offsetTop + highlight.rects[0].y * pageRef.current.clientHeight - 70, behavior: 'smooth' });
  }, [jump, rendering, page]);
  useEffect(() => {
    const command = event => {
      if (event.detail === 'clear') { setSelection(null); window.getSelection()?.removeAllRanges(); }
      if (event.detail === 'next') go(page + 1);
      if (event.detail === 'previous') go(page - 1);
      if (event.detail === 'find') { wakeChrome(); requestAnimationFrame(() => { const input = document.querySelector('.pdf-search input'); input?.focus(); input?.select(); }); }
    };
    window.addEventListener('neuroshelf:pdf-command',command); return () => window.removeEventListener('neuroshelf:pdf-command',command);
  }, [doc,page]);
  function go(number) {
    if (!doc) return;
    const n = Math.max(1, Math.min(doc.numPages, Number(number) || 1));
    setPage(n); setError(''); setSelection(null); scrollRef.current?.scrollTo(0, 0);
    updateRef.current(paper.id, { page: n, ...(paper.status === 'unread' || paper.status === 'queued' ? { status: 'reading' } : {}) }).catch(() => {});
  }
  function readSelection() {
    const selected = window.getSelection();
    if (!selected?.rangeCount || !selected.toString().trim() || !layerRef.current?.contains(selected.anchorNode) || !layerRef.current?.contains(selected.focusNode)) return null;
    const range = selected.getRangeAt(0), bounds = pageRef.current.getBoundingClientRect();
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(r => ({
      x: Math.max(0, (r.left - bounds.left) / bounds.width), y: Math.max(0, (r.top - bounds.top) / bounds.height),
      w: Math.min(1, r.width / bounds.width), h: Math.min(1, r.height / bounds.height) }));
    const screen = range.getBoundingClientRect();
    return { text: selected.toString().trim().slice(0, 20000), rects, anchor: { x: screen.left + screen.width / 2, top: screen.top, bottom: screen.bottom } };
  }
  function captureSelection(event) {
    const selected = readSelection(); setSelection(selected); if (selected) onNewSelection?.();
    if (selected || rendering || !Number.isFinite(event.clientX)) return;
    const bounds = pageRef.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
    const hit = (paper.highlights || []).find(h => h.source === 'pdf' && h.page === page && (!h.pdfHash || h.pdfHash === paper.pdf.hash) && h.rects?.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h));
    if (hit) {
      if (focus) { const r = hit.rects[0]; setSelection({text:hit.text,rects:hit.rects,highlightId:hit.id,color:hit.color,anchor:{x:bounds.left+(r.x+r.w/2)*bounds.width,top:bounds.top+r.y*bounds.height,bottom:bounds.top+(r.y+r.h)*bounds.height}}); }
      onAnnotation(hit, true);
    }
  }
  async function highlight(color, comment = false) {
    if (!selection || addingHighlight.current || rendering) return;
    addingHighlight.current = true;
    const highlight = selection.highlightId ? paper.highlights.find(h => h.id === selection.highlightId) : { id: crypto.randomUUID(), source: 'pdf', pdfHash: paper.pdf.hash, page, text: selection.text, rects: selection.rects, color, comment: '' };
    try {
      if (selection.highlightId) await mutateHighlight(paper.id, { action: 'update', highlightId: highlight.id, value: { color: comment ? highlight.color : color } });
      else await mutateHighlight(paper.id, { action: 'add', highlightId: highlight.id, value: highlight });
      setSelection(null); window.getSelection()?.removeAllRanges(); if (!focus || comment) onAnnotation(highlight, true);
    } finally { addingHighlight.current = false; }
  }
  function findText() {
    const term = search.trim().toLowerCase(); if (!term) return;
    const result = Object.entries(texts.current).filter(([, value]) => value.toLowerCase().includes(term)).map(([key]) => Number(key));
    setHits(result);
    if (!result.length) { setHitIndex(-1); notify(t("已解析页面中没有找到该词")); return; }
    const next = search && hits.join() === result.join() ? (hitIndex + 1) % result.length : 0;
    setHitIndex(next); go(result[next]);
  }
  if (loading) return <div className="reader-loading"><LoaderCircle className="spin" size={28} /><p>{t("正在打开 PDF…")}</p></div>;
  if (!doc) return <div className="reader-loading"><FileWarning size={34} /><h3>{t("暂时无法阅读这份 PDF")}</h3><p>{te(error)}</p><button className="button" onClick={onImport}><Upload size={16} />{t("导入其他 PDF")}</button></div>;
  const pageHighlights = (paper.highlights || []).filter(h => h.source === 'pdf' && h.page === page && (!h.pdfHash || h.pdfHash === paper.pdf.hash));
  return <div className="pdf-reader" onMouseMove={e => { if (focus && e.clientY < 68) wakeChrome(); }}>
    {focus && <div className="focus-toolbar-hotspot" onPointerEnter={wakeChrome} />}
    {focus && focusHint && <div className="focus-hint">{t("选中文字后点击工具或按空格 · F11 / Esc 退出 · 鼠标移到顶部显示工具栏")}</div>}
    <div className={`pdf-toolbar ${chrome ? "awake" : ""}`} onMouseEnter={wakeChrome}>
      <div className="toolbar-group"><button className="icon-button" aria-label={t("上一页")} disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={17} /></button>
        <input aria-label={t("PDF 页码")} className="page-input" value={pageInput} onChange={e => setPageInput(e.target.value)} onBlur={() => go(pageInput)} onKeyDown={e => { if (e.key === 'Enter') go(pageInput); }} />
        <span className="muted">/ {doc.numPages}</span><button className="icon-button" aria-label={t("下一页")} disabled={page >= doc.numPages} onClick={() => go(page + 1)}><ChevronRight size={17} /></button></div>
      <div className="toolbar-group"><button className="icon-button" aria-label={t("缩小")} disabled={zoom <= .6} onClick={() => setZoom(v => Math.max(.6, v - .15))}><Minus size={16} /></button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label={t("放大")} disabled={zoom >= 2.2} onClick={() => setZoom(v => Math.min(2.2, v + .15))}><Plus size={16} /></button><button className="icon-button" title={t("适应宽度")} aria-label={t("适应宽度")} onClick={() => setZoom(1)}><Scan size={16} /></button></div>
      <form className="pdf-search" onSubmit={e => { e.preventDefault(); findText(); }}><Search size={15} /><input aria-label={t("搜索 PDF 全文")} value={search} onChange={e => setSearch(e.target.value)} placeholder={t("查找原文…")} /><button type="submit" title={t("查找下一页")}>{hits.length ? `${hitIndex + 1}/${hits.length}` : '↵'}</button></form>
      <div className="toolbar-group"><button className="icon-button" aria-label={t('立即保存当前记录')} title="Ctrl S" onClick={onSave}><Save size={16} /></button><button className="icon-button" aria-label={t('撤销上一步编辑')} title="Ctrl Z" onClick={() => onHistory('undo')}><Undo2 size={16} /></button><button className="icon-button" aria-label={t('重做上一步编辑')} title="Ctrl Y" onClick={() => onHistory('redo')}><Redo2 size={16} /></button><button className="icon-button" aria-label={t('键盘快捷键')} title="F1" onClick={onHelp}><Keyboard size={16} /></button><button className="pdf-focus-button" aria-label={t(focus ? '退出专注阅读' : '进入专注阅读')} title="F11" onClick={toggleFocus}>{focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{t(focus ? '退出专注' : '专注阅读')}</button></div>
    </div>
    {error && <div className="inline-error">{te(error)}</div>}
    <div className="pdf-scroll" ref={scrollRef} tabIndex={0} onMouseDown={e => { if (focus && e.target === e.currentTarget) { setSelection(null); dismissPopup?.(); } }} onScroll={() => { if (focus && selection) { const bounds=pageRef.current?.getBoundingClientRect(), r=selection.rects.at(-1); if (bounds && r) setSelection(old => ({...old,anchor:{x:bounds.left+(r.x+r.w/2)*bounds.width,top:bounds.top+r.y*bounds.height,bottom:bounds.top+(r.y+r.h)*bounds.height}})); } }}>
      <div className="pdf-page" ref={pageRef} onMouseUp={captureSelection} onTouchEnd={captureSelection}>
        <canvas ref={canvasRef} aria-label={tx`论文 PDF 第 ${page} 页`} />
        <div className="highlight-layer">{pageHighlights.flatMap(h => (h.rects || []).map((r, i) => <div key={h.id + i} className={`pdf-highlight ${h.color} ${activeAnnotation?.id === h.id ? 'active' : ''}`} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />))}</div>
        <div className="textLayer" ref={layerRef} />
        <div className="annotation-markers">{pageHighlights.filter(h => h.rects?.length).map((h, index) => <button key={h.id} className={activeAnnotation?.id === h.id ? 'active' : ''} style={{ top: `${h.rects[0].y * 100}%` }} aria-label={tx`查看第 ${index + 1} 条原文旁注`} title={h.comment || t("为这段高亮写旁注")} onClick={() => onAnnotation(h, true)}><MessageSquareText size={15} /></button>)}</div>
      </div>
      {rendering && <div className="render-status"><LoaderCircle size={14} className="spin" />{t("正在显示第 ")}{page}{t(" 页")}</div>}
      {!rendering && !text.trim() && <div className="scan-notice"><ImageIcon size={16} />{t("此页没有可选文字。可在右侧勾选「附上当前页图片」，让 AI 解释扫描页或图表。")}</div>}
    </div>
    {selection && <div ref={toolbarRef} className="selection-toolbar" style={focus ? toolPosition : undefined} onMouseDown={e => e.preventDefault()}><span>{t("已选 ")}{selection.text.length}{t(" 字")}</span><button title={t("直接让 AI 解释选区（空格）")} onClick={() => onAsk(t(EXPLAIN_SELECTION), { submit: true, context: readerContext(selection.text) })}><Sparkles size={14} />{t("解释这段")}<kbd>{t("空格")}</kbd></button><button onClick={() => highlight('yellow', true).catch(e => notify(e.message))}><MessageSquarePlus size={14} />{t("写旁注")}</button><span className="tool-divider" />{['yellow', 'green', 'blue', 'pink'].map(c => <button key={c} className={`color-dot ${c}`} aria-label={tx`${{ yellow: t("黄色"), green: t("绿色"), blue: t("蓝色"), pink: t("粉色") }[c]}高亮`} onClick={() => highlight(c).catch(e => notify(e.message))} />)}<button aria-label={t("取消选区")} onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges(); }}><X size={14} /></button></div>}
    <div className="pdf-status"><span><Highlighter size={12} />{t("选中原文 → 写旁注 · 空格问 AI")}</span><span>{indexed < Math.min(doc.numPages, 800) ? tx`解析全文 ${indexed}/${doc.numPages}` : doc.numPages > 800 ? t("已索引前 800 页") : t("全文已就绪")}{t(" · PDF 第 ")}{page}{t(" 页")}</span></div>
  </div>;
}
