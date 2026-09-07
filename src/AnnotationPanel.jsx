import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Highlighter, MessageSquareText, Trash2 } from 'lucide-react';
import { registerDraftFlusher } from './persistence';

function AnnotationCard({ paperId, highlight, active, mutate, onLocate, notify }) {
  const [comment, setComment] = useState(highlight.comment || ''), [status, setStatus] = useState('已保存'), [confirmDelete, setConfirmDelete] = useState(false);
  const draft = useRef(null), sent = useRef(null), timer = useRef(null), queue = useRef(Promise.resolve()), input = useRef(null), card = useRef(null), mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const persist = useCallback(() => {
    clearTimeout(timer.current);
    const snapshot = draft.current;
    if (!snapshot || sent.current === snapshot) return queue.current;
    sent.current = snapshot; setStatus('保存中…');
    const task = queue.current.catch(() => {}).then(() => mutateRef.current(paperId, { action: 'update', highlightId: highlight.id, value: { comment: snapshot.comment } })).then(() => {
      if (draft.current === snapshot) { draft.current = null; setStatus('已保存'); }
    }).catch(error => { if (sent.current === snapshot) sent.current = null; setStatus('保存失败'); throw error; });
    queue.current = task; return task;
  }, [paperId, highlight.id]);
  useEffect(() => { if (!draft.current) setComment(highlight.comment || ''); }, [highlight.comment]);
  useEffect(() => registerDraftFlusher(`annotation:${paperId}:${highlight.id}`, persist), [persist, paperId, highlight.id]);
  useEffect(() => () => { clearTimeout(timer.current); persist().catch(() => {}); }, [persist]);
  useEffect(() => {
    if (active?.id !== highlight.id) return;
    card.current?.scrollIntoView({ block: 'nearest' });
    if (active.focus) input.current?.focus({ preventScroll: true });
  }, [active, highlight.id]);
  const save = () => persist().catch(error => notify('旁注保存失败：' + error.message));
  return <article ref={card} className={`annotation-card ${highlight.color || 'yellow'} ${active?.id === highlight.id ? 'active' : ''}`} data-highlight-id={highlight.id}>
    <header><button className="annotation-location" onClick={() => onLocate(highlight)}><Highlighter size={13} />{highlight.source === 'pdf' ? `PDF 第 ${highlight.page} 页` : '原网页摘录'}<ArrowUpRight size={13} /></button><button className="icon-button" aria-label="删除这条旁注和高亮" title="删除这条旁注和高亮" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></button></header>
    <button className="annotation-quote" title="定位这段原文" onClick={() => onLocate(highlight)}>{highlight.text}</button>
    <textarea ref={input} aria-label={`第 ${highlight.page || 0} 页旁注`} placeholder="写下你的理解、疑问或修改意见…" value={comment} maxLength={100000} onChange={event => {
      setComment(event.target.value); draft.current = { comment: event.target.value }; setStatus('待保存');
      clearTimeout(timer.current); timer.current = setTimeout(save, 450);
    }} onBlur={save} />
    <footer><span className={status === '保存失败' ? 'failed' : ''} role="status"><Check size={12} />{status}</span>{status === '保存失败' && <button onClick={save}>重试保存</button>}</footer>
    {confirmDelete && <div className="annotation-delete"><span>删除这条旁注和高亮？</span><button onClick={() => setConfirmDelete(false)}>取消</button><button onClick={async () => {
      try { await persist(); await mutate(paperId, { action: 'remove', highlightId: highlight.id }); }
      catch (error) { notify(error.message); }
    }}>删除</button></div>}
  </article>;
}

export default function AnnotationPanel({ paper, active, mutate, onLocate, notify, visible }) {
  const highlights = (paper.highlights || []).filter(h => h.source !== 'pdf' || !h.pdfHash || h.pdfHash === paper.pdf?.hash).slice().sort((a, b) => (a.page || 0) - (b.page || 0) || (a.rects?.[0]?.y || 0) - (b.rects?.[0]?.y || 0));
  return <section id="annotation-panel" className="annotation-panel" role="tabpanel" aria-labelledby="annotations-tab" hidden={!visible}>
    <div className="annotation-heading"><h2>把想法留在原文旁</h2><p>每条旁注对应一段高亮，自动保存在本机。</p></div>
    <div className="annotation-list">
      {!highlights.length && <div className="annotation-empty"><MessageSquareText size={30} /><h3>从一段原文开始</h3><p>用鼠标选中 PDF 文字，点击「写旁注」，就能在这里记录想法。</p></div>}
      {highlights.map(highlight => <AnnotationCard key={highlight.id} paperId={paper.id} highlight={highlight} active={visible ? active : null} mutate={mutate} onLocate={onLocate} notify={notify} />)}
    </div>
  </section>;
}
