import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Plus, GitBranch, ImagePlus, Image as ImageIcon, Check, Circle, CircleDot, CircleAlert, Archive, RotateCcw, X, Minus, Maximize, Download, List, LoaderCircle, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { api, downloadText } from './bridge';
import { flushDrafts, registerDraftFlusher } from './persistence';
import './experiments.css';

export const experimentStates = { planned: ['待开始', Circle], active: ['进行中', CircleDot], done: ['已完成', Check], blocked: ['受阻', CircleAlert] };
function Status({ value }) { const [label, Icon] = experimentStates[value]; return <span className={`exp-status ${value}`}><Icon size={13} />{label}</span>; }
function branchIds(nodes, id) { const ids = new Set([id]); let change = true; while (change) { change = false; for (const n of nodes) if (ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); change = true; } } return ids; }
function layoutTree(nodes, collapsed) {
  const boxes = [], lines = []; let cursor = 28;
  const visit = (id, depth) => {
    const children = collapsed.has(id) ? [] : nodes.filter(n => n.parentId === id);
    const positions = children.map(n => visit(n.id, depth + 1));
    const y = positions.length ? (positions[0].y + positions.at(-1).y) / 2 : cursor;
    if (!positions.length) cursor += 150;
    const box = { id, x: 28 + depth * 296, y, width: 238, height: 112 }; boxes.push(box);
    positions.forEach(child => lines.push({ parent: box, child })); return box;
  };
  visit(null, 0);
  return { boxes, lines, width: Math.max(...boxes.map(b => b.x + b.width)) + 40, height: Math.max(...boxes.map(b => b.y + b.height)) + 38 };
}
function useDraft(id, initial, save) {
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
function SaveState({ draft }) { return <span className={`exp-save ${draft.state}`} role="status" data-save-state={draft.state}>{draft.state === 'error' ? <button onClick={() => draft.flush().catch(() => {})}>保存失败 · 点击重试</button> : <>{draft.state === 'saving' ? <LoaderCircle className="spin" size={12} /> : draft.state === 'saved' ? <Check size={12} /> : <Circle size={10} />}{({ saved: '已保存', pending: '待保存', saving: '保存中' })[draft.state]}</>}</span>; }
function EvidenceImage({ nodeId, item, change, preview, remove }) {
  const [url, setUrl] = useState(''), [error, setError] = useState('');
  const initial = useMemo(() => ({ caption: item.caption }), [item.caption]);
  const draft = useDraft('experiment-image:' + item.id, initial, patch => change({ action: 'caption', id: nodeId, evidenceId: item.id, caption: patch.caption }));
  useEffect(() => {
    let alive = true, resource;
    api.readEvidence(nodeId, item.id).then(bytes => { if (!alive) return; resource = URL.createObjectURL(new Blob([bytes], { type: item.storedName.endsWith('.jpg') ? 'image/jpeg' : item.storedName.endsWith('.webp') ? 'image/webp' : 'image/png' })); setUrl(resource); }).catch(e => setError(e.message));
    return () => { alive = false; if (resource) URL.revokeObjectURL(resource); };
  }, [nodeId, item.id, item.storedName]);
  return <figure className="exp-evidence" data-evidence-id={item.id}>
    <button className="exp-image-button" disabled={!url} onClick={() => preview({ url, item: { ...item, caption: draft.value.caption } })} aria-label={`放大图片：${item.fileName}`}>
      {url ? <img src={url} alt={item.caption || item.fileName} loading="lazy" /> : <span>{error || '正在读取图片…'}</span>}<Maximize size={15} />
    </button>
    <figcaption><span title={item.fileName}>{item.fileName}</span><button className="icon-button" aria-label={`移除图片：${item.fileName}`} onClick={() => remove(item)}><X size={14} /></button></figcaption>
    <textarea aria-label={`图片说明：${item.fileName}`} placeholder="这张图说明了什么？样本、条件、结论…" value={draft.value.caption} maxLength={5000} rows={2} onChange={e => draft.change('caption', e.target.value)} onBlur={() => draft.flush().catch(() => {})} />
    <SaveState draft={draft} />{draft.error && <p className="exp-error">{draft.error}</p>}
  </figure>;
}
function ExperimentDialog({ title, children, close, wide = false }) {
  const ref = useRef();
  useEffect(() => { ref.current.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className={`exp-dialog ${wide ? 'exp-image-dialog' : ''}`} onCancel={e => { e.preventDefault(); close(); }}><header><h2>{title}</h2><button className="icon-button" aria-label="关闭实验对话框" onClick={close}><X size={20} /></button></header>{children}</dialog>;
}
function ExperimentEditor({ node, nodes, project, change, importImage, action, busy, add, confirm, preview, notify }) {
  const draft = useDraft('experiment:' + project.id + ':' + node.id, node, patch => change({ action: 'update', id: node.id, patch }));
  const input = useRef(), excluded = useMemo(() => branchIds(nodes, node.id), [nodes, node.id]);
  const [dragging, setDragging] = useState(false);
  const upload = files => {
    // FileList and clipboard/drag data can be cleared as soon as the event ends.
    const images = [...files];
    return action(async () => {
    if (!images.length) return;
    let count = 0, duplicates = 0; const errors = [];
    for (const file of images) {
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB。');
        if (!/\.(png|jpe?g|webp)$/i.test(file.name) && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请使用 PNG、JPEG 或 WebP。');
        const result = await importImage({ nodeId: node.id, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
        result.duplicate ? duplicates++ : count++;
      } catch (e) { errors.push(file.name + '：' + e.message); }
    }
    notify([count ? `已保存 ${count} 张图片` : '', duplicates ? `${duplicates} 张重复图片已跳过` : '', ...errors].filter(Boolean).join('；'));
    });
  };
  return <aside className="exp-editor" aria-label="实验步骤详情" data-node-id={node.id} onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); upload(e.clipboardData.files); } }}>
    <div className="exp-editor-head"><span><FlaskConical size={16} />步骤记录</span><div className="exp-editor-head-actions"><button className="icon-button" title="添加图片证据" aria-label="为当前步骤添加图片" disabled={busy} onClick={() => input.current.click()}><ImagePlus size={17} /></button><SaveState draft={draft} /></div></div>
    <div className="exp-editor-body">
      {draft.error && <p className="exp-error">{draft.error}</p>}
      <label>步骤名称<input className="exp-title-input" aria-label="实验步骤名称" value={draft.value.title} maxLength={180} onChange={e => draft.change('title', e.target.value)} onBlur={() => draft.flush().catch(() => {})} /></label>
      <div className="exp-field-row"><label>当前状态<select aria-label="实验当前状态" value={draft.value.status} onChange={e => draft.change('status', e.target.value)}>{Object.entries(experimentStates).map(([key, [label]]) => <option value={key} key={key}>{label}</option>)}</select></label><label>计划 / 实验日期<input type="date" aria-label="实验日期" value={draft.value.date} onChange={e => draft.change('date', e.target.value)} /></label></div>
      <label>所属分支<select aria-label="实验所属分支" value={draft.value.parentId || ''} onChange={e => draft.change('parentId', e.target.value || null)}><option value="">{project.name} · 主分支</option>{nodes.filter(n => !excluded.has(n.id)).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
      <label>实验目的<textarea aria-label="实验目的" rows={2} value={draft.value.objective} maxLength={10000} placeholder="这一步要回答什么问题？" onChange={e => draft.change('objective', e.target.value)} onBlur={() => draft.flush().catch(() => {})} /></label>
      <label>过程与结果<textarea aria-label="实验过程与结果" rows={5} value={draft.value.record} maxLength={100000} placeholder="日期、样本 / 批次、实验条件、对照、观察和结论…" onChange={e => draft.change('record', e.target.value)} onBlur={() => draft.flush().catch(() => {})} /></label>
      <label>下一步 / 遇到的问题<textarea aria-label="实验下一步" rows={2} value={draft.value.nextStep} maxLength={10000} placeholder="接下来做什么？还有什么需要解决？" onChange={e => draft.change('nextStep', e.target.value)} onBlur={() => draft.flush().catch(() => {})} /></label>
      <div className="exp-evidence-heading"><h3><ImageIcon size={16} />图片证据 <span>{node.evidence.length}</span></h3><button className="text-button" disabled={busy} onClick={() => input.current.click()}><Plus size={14} />添加图片</button></div>
      <input hidden ref={input} type="file" aria-label="导入实验证据图片" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple onChange={e => { upload(e.target.files); e.target.value = ''; }} />
      <button className={`exp-drop ${dragging ? 'dragging' : ''}`} disabled={busy} onClick={() => input.current.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) upload(e.dataTransfer.files); }}><ImagePlus size={22} /><span>{busy ? '正在处理…' : '拖入图片，或点击上传'}</span><small>也可在此侧栏 Ctrl V 粘贴截图<br />PNG / JPEG / WebP · 每张 ≤ 20 MB</small></button>
      {node.evidence.map(item => <EvidenceImage key={item.id} nodeId={node.id} item={item} change={change} preview={preview} remove={item => confirm({ type: 'image', node, item })} />)}
      <div className="exp-editor-actions"><button className="button" disabled={busy} onClick={() => add(node.id)}><GitBranch size={14} />添加子步骤</button><button className="icon-button" title="归档此分支" aria-label="归档此实验分支" disabled={busy} onClick={() => confirm({ type: 'archive', node })}><Archive size={16} /></button><button className="icon-button" title="立即保存" aria-label="保存实验记录" onClick={() => draft.flush().catch(() => {})}><Save size={16} /></button></div>
      <p className="exp-storage-hint">记录与原始图片保存在当前项目中，完整备份会包含这些图片。</p>
    </div>
  </aside>;
}
function ExperimentMap({ project, nodes, selectedId, select, add, collapsed, setCollapsed, query, busy }) {
  const viewport = useRef(), drag = useRef(), [zoom, setZoom] = useState(1);
  const layout = useMemo(() => layoutTree(nodes, collapsed), [nodes, collapsed]);
  useEffect(() => {
    const box = layout.boxes.find(b => b.id === selectedId), el = viewport.current;
    if (!box || !el || !selectedId) return;
    const left = box.x * zoom, top = box.y * zoom;
    if (left < el.scrollLeft || left + box.width * zoom > el.scrollLeft + el.clientWidth || top < el.scrollTop || top + box.height * zoom > el.scrollTop + el.clientHeight) el.scrollTo({ left: Math.max(0, left - (el.clientWidth - box.width * zoom) / 2), top: Math.max(0, top - (el.clientHeight - box.height * zoom) / 2) });
  }, [selectedId, layout, zoom]);
  const map = new Map(nodes.map(n => [n.id, n]));
  const matches = n => !query || [n.title, n.objective, n.record, n.nextStep, ...n.evidence.map(e => e.caption)].join(' ').toLowerCase().includes(query.toLowerCase());
  const resize = next => {
    const el = viewport.current, scale = Math.max(.35, Math.min(1.5, next));
    const x = (el.scrollLeft + el.clientWidth / 2) / zoom, y = (el.scrollTop + el.clientHeight / 2) / zoom;
    setZoom(scale); requestAnimationFrame(() => { el.scrollLeft = x * scale - el.clientWidth / 2; el.scrollTop = y * scale - el.clientHeight / 2; });
  };
  return <div className="exp-map-shell"><div className="exp-map-viewport" ref={viewport} aria-label="实验思维导图" onPointerDown={e => { if (e.button || e.target.closest('button')) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop }; }} onPointerMove={e => { if (drag.current) { e.currentTarget.scrollLeft = drag.current.left - e.clientX + drag.current.x; e.currentTarget.scrollTop = drag.current.top - e.clientY + drag.current.y; } }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <div style={{ width: layout.width * zoom, height: layout.height * zoom, minWidth: '100%', minHeight: '100%', position: 'relative' }}><div className="exp-map-stage" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
        <svg className="exp-map-lines" width={layout.width} height={layout.height} aria-hidden="true">{layout.lines.map(({ parent: p, child: c }) => <path key={c.id} d={`M${p.x + p.width},${p.y + 56} C${p.x + p.width + 29},${p.y + 56} ${c.x - 29},${c.y + 56} ${c.x},${c.y + 56}`} />)}</svg>
        {layout.boxes.map(b => { const node = map.get(b.id), children = nodes.filter(n => n.parentId === b.id); return <div key={b.id || 'root'} className={`exp-map-node ${node ? node.status : 'root'} ${selectedId === b.id ? 'selected' : ''} ${node && !matches(node) ? 'dimmed' : ''}`} data-node-id={b.id || 'root'} style={{ left: b.x, top: b.y, width: b.width, height: b.height }}>
          {node ? <><button className="exp-node-main" onClick={() => select(node.id)} aria-label={`查看实验：${node.title}`} aria-pressed={selectedId === node.id}><Status value={node.status} /><strong title={node.title}>{node.title}</strong><span className="exp-node-meta">{node.date || '未设日期'}{node.evidence.length > 0 && <span><ImageIcon size={12} />{node.evidence.length}</span>}</span></button>{children.length > 0 && <button className="exp-fold" aria-label={`${collapsed.has(node.id) ? '展开' : '折叠'}实验：${node.title}`} onClick={() => setCollapsed(old => { const next = new Set(old); next.has(node.id) ? next.delete(node.id) : next.add(node.id); return next; })}>{collapsed.has(node.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}{children.length}</button>}</> : <div className="exp-root-content"><FlaskConical size={22} /><strong title={project.name}>{project.name}</strong><span>{nodes.length} 个实验步骤 · {nodes.filter(n => n.status === 'done').length} 已完成</span></div>}
        </div>; })}
      </div></div>
    </div><div className="exp-map-controls"><span>拖动空白处平移</span><button className="icon-button" aria-label="缩小实验导图" onClick={() => resize(zoom - .1)}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label="放大实验导图" onClick={() => resize(zoom + .1)}><Plus size={15} /></button><button className="icon-button" aria-label="适应实验导图" onClick={() => { const el = viewport.current; setZoom(Math.max(.35, Math.min(1, (el.clientWidth - 16) / layout.width, (el.clientHeight - 16) / layout.height))); el.scrollTo(0, 0); }}><Maximize size={15} /></button></div></div>;
}
function exportRecords(project, nodes) {
  const lines = [`# ${project.name} · 实验进程`, '', '导出时间：' + new Date().toLocaleString(), ''];
  const visit = (parent, depth) => nodes.filter(n => n.parentId === parent).forEach(n => {
    lines.push(`${'#'.repeat(Math.min(6, depth + 2))} ${n.title}`, '', `状态：${experimentStates[n.status][0]}  |  日期：${n.date || '未设置'}`, '', '实验目的：\n' + n.objective, '', '过程与结果：\n' + n.record, '', '下一步 / 问题：\n' + n.nextStep, '');
    n.evidence.forEach(e => lines.push(`- 图片：${e.fileName}；${e.caption || '暂无说明'}（完整备份内：evidence/${e.storedName}）`)); lines.push(''); visit(n.id, depth + 1);
  }); visit(null, 0);
  lines.push('此 Markdown 包含文字与图片索引。原始图片请使用软件的“完整备份”保存。');
  downloadText(project.name + '-实验记录.md', lines.join('\n'));
}
export default function Experiments({ project, data, change, importImage, query = '', notify }) {
  const all = data?.nodes || [], nodes = useMemo(() => all.filter(n => !n.archived), [data]);
  const [selectedId, setSelected] = useState(null), [mode, setMode] = useState('map'), [collapsed, setCollapsed] = useState(new Set()), [busy, setBusy] = useState(false), [confirmation, setConfirmation] = useState(null), [preview, setPreview] = useState(null), [archives, setArchives] = useState(false);
  const working = useRef(false), operation = useRef(null), operationKey = 'experiment-operations:' + project.id;
  useEffect(() => registerDraftFlusher(operationKey, () => operation.current || Promise.resolve()), [operationKey]);
  const action = async fn => {
    if (working.current) return;
    working.current = true; setBusy(true);
    const promise = (async () => { await flushDrafts(operationKey); return fn(); })(); operation.current = promise;
    try { return await promise; } catch (e) { notify(e.message); } finally { operation.current = null; working.current = false; setBusy(false); }
  };
  const select = id => action(() => { setSelected(id); });
  const add = parentId => action(async () => { const result = await change({ action: 'add', parentId }); setCollapsed(old => { const next = new Set(old); next.delete(parentId); return next; }); setSelected(result.selectedId); requestAnimationFrame(() => document.querySelector('.exp-title-input')?.select()); });
  const selected = nodes.find(n => n.id === selectedId);
  const counts = Object.fromEntries(Object.keys(experimentStates).map(key => [key, nodes.filter(n => n.status === key).length]));
  const archiveRoots = all.filter(n => n.archived && n.archiveRoot === n.id);
  const matches = nodes.filter(n => [n.title, n.objective, n.record, n.nextStep, ...n.evidence.map(e => e.caption)].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="experiments-page">
    <header className="exp-heading"><div><span className="page-eyebrow">EXPERIMENT JOURNEY</span><h1>实验进程</h1><p>把问题、实验与证据，连成自己的研究路线。</p></div><div className="exp-heading-actions"><button className="icon-button" title="导出实验记录 Markdown" aria-label="导出实验记录" disabled={!nodes.length || busy} onClick={() => action(async () => exportRecords(project, (await api.load()).experiments?.nodes.filter(n => !n.archived) || []))}><Download size={18} /></button><button className="button" disabled={busy} onClick={() => action(() => setArchives(true))}><Archive size={15} />归档{archiveRoots.length > 0 && ` (${archiveRoots.length})`}</button><button className="button primary" disabled={busy} onClick={() => add(null)}><Plus size={16} />新建实验</button></div></header>
    <div className="exp-summary"><div className="exp-summary-total"><strong>{counts.done}<span> / {nodes.length}</span></strong><span>已完成步骤</span><div className="exp-progress-track"><i style={{ width: `${nodes.length ? counts.done / nodes.length * 100 : 0}%` }} /></div></div>{Object.keys(experimentStates).map(key => <div className={`exp-summary-count ${key}`} key={key}><Status value={key} /><strong>{counts[key]}</strong></div>)}<p>完成比例按步骤数量统计</p></div>
    {!nodes.length ? <div className="exp-empty"><div className="exp-empty-symbol"><GitBranch size={40} strokeWidth={1.3} /><span><ImagePlus size={19} /></span></div><h2>从你正在做的第一步开始</h2><p>为项目添加实验，再拆成子步骤。<br />点击节点，记录状态、结果和图片证据。</p><button className="button primary" disabled={busy} onClick={() => add(null)}><Plus size={16} />添加第一个实验步骤</button><div className="exp-empty-flow"><span>研究问题</span><ChevronRight size={16} /><span>实验步骤</span><ChevronRight size={16} /><span>图片与结果</span><ChevronRight size={16} /><span>下一步</span></div></div> : <>
      <div className="exp-view-toolbar"><div className="exp-view-switch"><button aria-pressed={mode === 'map'} onClick={() => setMode('map')}><GitBranch size={15} />思维导图</button><button aria-pressed={mode === 'list'} onClick={() => setMode('list')}><List size={15} />步骤列表</button></div><span>{query ? `找到 ${matches.length} 个匹配步骤；在列表中查看` : '点击步骤查看记录 · 用“添加子步骤”延伸分支'}</span></div>
      <div className={`exp-workspace ${selected ? '' : 'without-editor'}`}><div className="exp-canvas-column">{mode === 'map' ? <ExperimentMap project={project} nodes={nodes} selectedId={selectedId} select={select} add={add} collapsed={collapsed} setCollapsed={setCollapsed} query={query.trim()} busy={busy} /> : <div className="exp-list">{matches.map(n => <button key={n.id} className={`exp-list-item ${selectedId === n.id ? 'selected' : ''}`} onClick={() => select(n.id)}><Status value={n.status} /><div><strong>{n.title}</strong><span>{nodes.find(parent => parent.id === n.parentId)?.title || project.name}{n.nextStep && ` · 下一步：${n.nextStep}`}</span></div><small>{n.date || '未设日期'}</small><span><ImageIcon size={14} />{n.evidence.length}</span><ChevronRight size={14} /></button>)}{!matches.length && <p className="exp-list-empty">没有匹配的实验记录。</p>}</div>}</div>
        {selected ? <ExperimentEditor key={selected.id} node={selected} nodes={nodes} project={project} change={change} importImage={importImage} action={action} busy={busy} add={add} confirm={setConfirmation} preview={setPreview} notify={notify} /> : <aside className="exp-selection-hint"><FlaskConical size={27} /><h3>选一步，继续记录</h3><p>点击导图或列表里的实验步骤，查看进展与证据。</p></aside>}
      </div></>}
    {confirmation && <ExperimentDialog title={confirmation.type === 'archive' ? '归档这个实验分支？' : '移除这张图片？'} close={() => !busy && setConfirmation(null)}><p>{confirmation.type === 'archive' ? `将归档“${confirmation.node.title}”及其未归档子步骤。所有记录和图片保留，可从“归档”中恢复。` : `将从这条记录中移除“${confirmation.item.fileName}”。本机原始图片文件仍保留。`}</p><footer><button className="button" disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button className="button primary" disabled={busy} onClick={() => action(async () => { await change(confirmation.type === 'archive' ? { action: 'archive', id: confirmation.node.id } : { action: 'detach', id: confirmation.node.id, evidenceId: confirmation.item.id }); setConfirmation(null); })}>{confirmation.type === 'archive' ? '归档分支' : '移除图片'}</button></footer></ExperimentDialog>}
    {archives && <ExperimentDialog title="已归档的实验分支" close={() => !busy && setArchives(false)}><p>归档保留原记录和图片，恢复后会重新出现在导图中。</p><div className="exp-archive-list">{archiveRoots.map(n => <article key={n.id}><div><strong>{n.title}</strong><small>{all.filter(v => v.archiveRoot === n.id).length} 个步骤</small></div><button className="button" disabled={busy} onClick={() => action(async () => { await change({ action: 'restore', id: n.id }); setSelected(n.id); setArchives(false); })}><RotateCcw size={14} />恢复</button></article>)}{!archiveRoots.length && <p>暂时没有归档的实验。</p>}</div></ExperimentDialog>}
    {preview && <ExperimentDialog title={preview.item.fileName} wide close={() => setPreview(null)}><div className="exp-full-image"><img src={preview.url} alt={preview.item.caption || preview.item.fileName} /></div><p>{preview.item.caption || '暂无图片说明'}</p><footer><a className="button" href={preview.url} download={preview.item.fileName}><Download size={15} />保存原图</a></footer></ExperimentDialog>}
  </section>;
}
