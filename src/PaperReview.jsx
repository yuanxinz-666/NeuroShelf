import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { registerDraftFlusher } from './persistence';
import './paper-review.css';

export default function PaperReview({ paper, update }) {
  const [value, setValue] = useState(paper.personalReview || '');
  const [state, setState] = useState('idle');
  const draft = useRef(null), timer = useRef(null), saving = useRef(null), updateRef = useRef(update);
  updateRef.current = update;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const snapshot = draft.current;
    if (!snapshot) return Promise.resolve();
    if (saving.current?.snapshot === snapshot) return saving.current.promise;
    setState('saving');
    const promise = updateRef.current(paper.id, snapshot).then(() => {
      if (draft.current === snapshot) { draft.current = null; setState('saved'); }
    }, error => {
      if (draft.current === snapshot) setState('error');
      throw error;
    }).finally(() => { if (saving.current?.snapshot === snapshot) saving.current = null; });
    saving.current = { snapshot, promise };
    return promise;
  }, [paper.id]);

  useEffect(() => {
    if (!draft.current) setValue(paper.personalReview || '');
  }, [paper.personalReview]);
  useEffect(() => {
    const unregister = registerDraftFlusher(`personal-review:${paper.id}`, flush);
    return () => { unregister(); flush().catch(() => {}); };
  }, [paper.id, flush]);

  function change(next) {
    setValue(next); draft.current = { personalReview: next }; setState('pending');
    clearTimeout(timer.current); timer.current = setTimeout(() => flush().catch(() => {}), 450);
  }
  const label = { idle: '', pending: '待保存', saving: '保存中', saved: '已保存', error: '保存失败，点击重试' }[state];
  return <div className={`paper-review ${state === 'error' ? 'review-error' : ''}`} data-paper-id={paper.id} data-save-state={state}>
    <label htmlFor={`personal-review-${paper.id}`}>我的评价</label>
    <input id={`personal-review-${paper.id}`} aria-label={`我的评价：${paper.title}`} maxLength={500}
      placeholder="写一句，方便下次找回…" value={value} title={value || '直接填写，自动保存；也可以按评价搜索论文'}
      onChange={event => change(event.target.value)} onBlur={() => flush().catch(() => {})}
      onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.blur(); } }} />
    {state === 'error' ? <button className="review-retry" title={label} onClick={() => flush().catch(() => {})}>重试</button>
      : <span className="review-save" role="status" aria-label={label} title={label}>{state === 'saving' ? <LoaderCircle size={12} className="spin" /> : state === 'saved' ? <Check size={12} /> : null}</span>}
  </div>;
}
