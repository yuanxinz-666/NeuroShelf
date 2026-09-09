import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Circle, LoaderCircle } from 'lucide-react';
import { t } from './i18n';
import { registerDraftFlusher } from './persistence';

export function useDraft(id, initial, save) {
  const [value, setValue] = useState(initial), [state, setState] = useState('saved'), [error, setError] = useState('');
  const draft = useRef({}), timer = useRef(), saving = useRef(), saver = useRef(save); saver.current = save;
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current) { await saving.current; if (Object.keys(draft.current).length) return flush(); return; }
    if (!Object.keys(draft.current).length) return;
    const snapshot = draft.current; draft.current = {}; setState('saving'); setError('');
    const task = saver.current(snapshot).then(() => setState(Object.keys(draft.current).length ? 'pending' : 'saved'), e => {
      draft.current = { ...snapshot, ...draft.current }; setState('error'); setError(e.message); throw e;
    });
    saving.current = task;
    try { await task; } finally { saving.current = null; }
    if (Object.keys(draft.current).length) return flush();
  }, [id]);
  useEffect(() => { const off = registerDraftFlusher(id, flush); return () => { off(); clearTimeout(timer.current); flush().catch(() => {}); }; }, [id, flush]);
  useEffect(() => { if (!Object.keys(draft.current).length && !saving.current) setValue(initial); }, [initial]);
  const change = (key, next) => { setValue(v => ({ ...v, [key]: next })); draft.current = { ...draft.current, [key]: next }; setState('pending'); clearTimeout(timer.current); timer.current = setTimeout(() => flush().catch(() => {}), 500); };
  return { value, change, state, error, flush };
}
export function SaveState({ draft }) { return <span className={`exp-save ${draft.state}`} role="status" data-save-state={draft.state}>{draft.state === 'error' ? <button onClick={() => draft.flush().catch(() => {})}>{t("保存失败 · 点击重试")}</button> : <>{draft.state === 'saving' ? <LoaderCircle className="spin" size={12} /> : draft.state === 'saved' ? <Check size={12} /> : <Circle size={10} />}{({ saved: t("已保存"), pending: t("待保存"), saving: t("保存中") })[draft.state]}</>}</span>; }
