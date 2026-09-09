import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Search, X, ArrowRight, FlaskConical } from 'lucide-react';
import { t, tx, te } from './i18n';
import { useDraft, SaveState } from './ExperimentDraft';
import roles from '../data/experiment-reference-roles.json';
import { experimentPath, paperExperimentLinks } from './experiment-references.mjs';
import './experiment-references.css';

function ReferenceDialog({ title, close, busy, children }) {
  const ref = useRef();
  useEffect(() => { ref.current.showModal(); return () => ref.current?.close(); }, []);
  return <dialog className="reference-dialog" ref={ref} onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <header><h2><BookOpen size={21} />{title}</h2><button className="icon-button" disabled={busy} aria-label={t('关闭文献关联窗口')} onClick={close}><X size={20} /></button></header>{children}
  </dialog>;
}
export function ReferenceRoles({ value, change, disabled = false }) {
  return <fieldset className="reference-roles" disabled={disabled}><legend>{t('文献用途（可多选）')}</legend>{Object.entries(roles).map(([key, label]) => <label key={key} className={value.includes(key) ? 'selected' : ''}><input type="checkbox" checked={value.includes(key)} onChange={e => { const next = e.target.checked ? [...value, key] : value.filter(r => r !== key); if (next.length) change(next); }} />{t(label)}</label>)}</fieldset>;
}
function ReferenceEntry({ node, reference, paper, projectId, change, action, busy, open }) {
  const initial = useMemo(() => ({ roles: reference.roles, note: reference.note }), [reference.roles, reference.note]);
  const draft = useDraft('experiment-reference:' + projectId + ':' + reference.id, initial, patch => change({ action: 'update-reference', id: node.id, paperId: reference.paperId, patch }));
  return <article className="experiment-reference" data-paper-id={reference.paperId}>
    <div className="reference-title-row"><button className="reference-paper-title" disabled={!paper || busy} onClick={() => action(() => open(paper))}>{paper?.title || t('论文暂不可用')}</button><button className="icon-button" disabled={busy} aria-label={tx`移除实验参考文献：${paper?.title || reference.paperId}`} title={t('解除关联，保留文库中的论文')} onClick={() => action(() => change({ action: 'unlink-paper', id: node.id, paperId: reference.paperId }))}><X size={15} /></button></div>
    <p className="reference-meta">{[paper?.authors, paper?.year, paper?.journal].filter(Boolean).join(' · ')}</p>
    <ReferenceRoles value={draft.value.roles} change={value => draft.change('roles', value)} disabled={busy} />
    <label className="reference-note-label">{t('对这步实验的具体帮助')}<textarea aria-label={tx`文献用途说明：${paper?.title || reference.paperId}`} value={draft.value.note} maxLength={5000} rows={3} placeholder={t('例如：参考 Figure 3 的行为任务设计；借鉴对照组和分析指标。')} onChange={e => draft.change('note', e.target.value)} onBlur={() => draft.flush().catch(() => {})} /></label>
    <footer><SaveState draft={draft} /><button className="text-button" disabled={!paper || busy} onClick={() => action(() => open(paper))}>{paper?.pdf ? t('阅读 PDF') : t('打开文献导读')}<ArrowRight size={13} /></button></footer>
    {draft.error && <p className="exp-error">{te(draft.error)}</p>}
  </article>;
}
function ReferencePicker({ node, papers, add, close, busy }) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState([]), [purpose, setPurpose] = useState(['idea']), [note, setNote] = useState(''), [error, setError] = useState(''), [limit, setLimit] = useState(30);
  const linked = new Set((node.references || []).map(ref => ref.paperId));
  const term = query.trim().toLowerCase(), matches = papers.filter(p => [p.title, p.authors, p.summary, p.module, p.tags, p.personalReview, p.note].join(' ').toLowerCase().includes(term));
  async function save() {
    setError('');
    try { const result = await add({ action: 'link-papers', id: node.id, paperIds: selected.filter(id => !linked.has(id)), roles: purpose, note }); if (result) close(); else setError(t('未能保存关联，请重试。')); }
    catch (e) { setError(e.message); }
  }
  return <ReferenceDialog title={tx`为 ${node.title} 添加参考文献`} close={close} busy={busy}>
    <div className="reference-picker-intro"><p>{t('从当前项目文库选择论文。相同用途可批量添加，之后可逐篇修改说明。')}</p><ReferenceRoles value={purpose} change={setPurpose} disabled={busy} /><textarea aria-label={t('本次关联的用途说明')} rows={2} maxLength={5000} value={note} disabled={busy} onChange={e => setNote(e.target.value)} placeholder={t('这些论文对实验有什么帮助？（可稍后逐篇填写）')} /></div>
    <label className="reference-search"><Search size={17} /><input aria-label={t('搜索可关联论文')} placeholder={t('搜索标题、作者、关键词或个人评价')} value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }} /></label>
    <div className="reference-picker-results">{matches.slice(0, limit).map(p => <label key={p.id} className={`reference-choice ${linked.has(p.id) ? 'linked' : ''}`} data-paper-id={p.id}><input type="checkbox" disabled={busy || linked.has(p.id)} checked={linked.has(p.id) || selected.includes(p.id)} onChange={e => setSelected(old => e.target.checked ? [...old, p.id] : old.filter(id => id !== p.id))} /><span><strong>{p.title}</strong><small>{[p.authors, p.year, p.journal].filter(Boolean).join(' · ')}</small>{p.personalReview && <p>{p.personalReview}</p>}{linked.has(p.id) && <em>{t('已关联此实验')}</em>}</span></label>)}{!matches.length && <p className="reference-empty">{t('没有找到论文，请更换关键词，或先将论文加入当前项目文库。')}</p>}{matches.length > limit && <button className="text-button" onClick={() => setLimit(n => n + 30)}>{t('显示更多论文')}</button>}</div>
    {error && <p className="reference-form-error" role="alert">{te(error)}</p>}
    <footer><span>{tx`已选 ${selected.length} 篇`}</span><button className="button primary" data-shortcut-save disabled={busy || !selected.length} onClick={save}>{busy ? t('正在保存…') : t('添加到实验')}</button></footer>
  </ReferenceDialog>;
}
export function ExperimentReferences({ node, papers, projectId, change, action, busy, open }) {
  const [picker, setPicker] = useState(false), [role, setRole] = useState('');
  const references = node.references || [], filtered = references.filter(ref => !role || ref.roles.includes(role));
  return <section className="experiment-references" aria-label={t('实验参考文献')}>
    <div className="reference-section-heading"><h3><BookOpen size={17} />{t('实验参考文献')}<span>{references.length}</span></h3><button className="text-button" disabled={busy} onClick={() => action(() => setPicker(true))}><Plus size={14} />{t('关联论文')}</button></div>
    <p className="reference-section-hint">{t('把提供思路、方法和分析依据的论文放在这一步旁边。')}</p>
    {references.length > 0 && <select className="reference-role-filter" aria-label={t('筛选本实验的文献用途')} value={role} onChange={e => setRole(e.target.value)}><option value="">{t('全部文献用途')}</option>{Object.entries(roles).map(([key, label]) => <option value={key} key={key}>{t(label)} ({references.filter(ref => ref.roles.includes(key)).length})</option>)}</select>}
    {filtered.map(ref => <ReferenceEntry key={ref.id} node={node} reference={ref} paper={papers.find(p => p.id === ref.paperId)} projectId={projectId} change={change} action={action} busy={busy} open={open} />)}
    {!filtered.length && <p className="reference-empty">{references.length ? t('这个用途中还没有论文。') : t('还没有关联论文。点击“关联论文”，为这步实验整理参考依据。')}</p>}
    {picker && <ReferencePicker node={node} papers={papers} busy={busy} add={payload => action(() => change(payload))} close={() => setPicker(false)} />}
  </section>;
}
export function PaperExperimentDialog({ paper, nodes, change, close, openExperiment }) {
  const [nodeId, setNodeId] = useState(''), [purpose, setPurpose] = useState(['idea']), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const working = useRef(false), active = nodes.filter(n => !n.archived), links = paperExperimentLinks(nodes, paper.id);
  const alreadyLinked = links.some(({ node }) => node.id === nodeId);
  async function save() {
    if (working.current) return; working.current = true; setBusy(true); setError('');
    try { await change({ action: 'link-papers', id: nodeId, paperIds: [paper.id], roles: purpose, note }); close(); }
    catch (e) { setError(e.message); } finally { working.current = false; setBusy(false); }
  }
  return <ReferenceDialog title={t('将论文用于实验')} close={close} busy={busy}><div className="paper-experiment-form">
    <h3>{paper.title}</h3><p>{t('一篇论文可用于多个实验；每个实验分别保存用途与说明。')}</p>
    {links.length > 0 && <div className="paper-existing-links">{links.map(({ node, ref }) => <button key={node.id} disabled={busy} onClick={() => { close(); openExperiment(node.id); }}><FlaskConical size={15} /><span>{experimentPath(nodes, node.id)}<small>{ref.roles.map(role => t(roles[role])).join(' · ')}</small></span><ArrowRight size={14} /></button>)}</div>}
    {active.length ? <><label>{t('选择实验步骤')}<select aria-label={t('论文关联到的实验步骤')} disabled={busy} value={nodeId} onChange={e => setNodeId(e.target.value)}><option value="">{t('请选择实验步骤')}</option>{active.map(node => <option key={node.id} value={node.id}>{experimentPath(nodes, node.id)}</option>)}</select></label><ReferenceRoles value={purpose} change={setPurpose} disabled={busy} /><label>{t('对这步实验的具体帮助')}<textarea aria-label={t('本次关联的用途说明')} value={note} disabled={busy} rows={3} maxLength={5000} onChange={e => setNote(e.target.value)} placeholder={t('例如：参考 Figure 3 的行为任务设计；借鉴对照组和分析指标。')} /></label>{alreadyLinked && <p>{t('已关联此实验，可点击上方实验名称修改用途与说明。')}</p>}</> : <div className="reference-empty"><p>{t('当前项目还没有实验步骤，请先在实验进程中创建。')}</p><button className="button" onClick={() => { close(); openExperiment(null); }}>{t('前往实验进程')}</button></div>}
    {error && <p className="reference-form-error" role="alert">{te(error)}</p>}
  </div><footer><span>{t('关联保存在当前项目中')}</span><button className="button primary" data-shortcut-save disabled={busy || !nodeId || alreadyLinked} onClick={save}>{busy ? t('正在保存…') : t('添加到实验')}</button></footer></ReferenceDialog>;
}
