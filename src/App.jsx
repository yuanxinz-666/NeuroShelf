import { t, tx, te, dateLocale } from './i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, BookMarked, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, FileText, FolderOpen, HardDrive, Highlighter, Library, LoaderCircle, Map, Network, NotebookPen, Plus, Search, Settings2, Sparkles, Star, Upload, X, ExternalLink, ShieldCheck, Link2Off, SlidersHorizontal, Pencil, Save, Quote, Download, Users, LayoutDashboard, FlaskConical } from 'lucide-react';
import { useLanguage } from './i18n';
import { LanguageSettings } from './LanguageSettings';
import Experiments from './Experiments';
import { receivePaper, receiveLibrary, receiveExperiments } from './library-state.mjs';
import { api, downloadText } from './bridge';
import PdfReader from './PdfReader';
import ChatPanel from './ChatPanel';
import ReaderWorkbench from './ReaderWorkbench';
import AnnotationPanel from './AnnotationPanel';
import PaperReview from './PaperReview';
import WeeklyInbox from './WeeklyInbox';
import { ProjectPicker, ProjectDialog, ProjectHub, PeopleView } from './Projects';
import { model as readingModel, supportedEfforts, effortLabel } from './ai-options';
import { version } from '../package.json';
import { loadPdf } from './pdf';
import { registerDraftFlusher, flushDrafts } from './persistence';

const statusNames = { get unread() { return t("未开始"); }, get queued() { return t("计划阅读"); }, get reading() { return t("阅读中"); }, get read() { return t("已读完"); } };
const moduleColors = ['#417d73', '#6885a4', '#9983a6', '#b88e53', '#a4756b', '#639899', '#81935a', '#7886a0', '#9a8470'];
const formatSize = bytes => bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
const rankLabel = paper => paper.id?.startsWith('u_') ? 'NEW' : '#' + String(paper.rank).padStart(3, '0');

function Modal({ title, subtitle, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label={t("关闭对话框")} onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
function Brand({ compact = false }) {
  return <div className="brand"><div className="brand-symbol"><Network size={23} strokeWidth={1.5} /></div>{!compact && <div><strong>NeuroShelf</strong><span>{t("神经文献")}</span></div>}</div>;
}
function Sidebar({ project, projectList, switchProject, newProject, view, setView, reading, exitReader, papers, weeklyCount, filterModule, setFilterModule, onImport, onSettings, onBackup }) {
  const modules = [...new Set(papers.map(p => p.module))];
  const items = [ ['project', LayoutDashboard, t("项目总览"), null], ['experiments', FlaskConical, t("实验进程"), null], ['people', Users, t("PI 与实验室"), null], ['library', Library, t("全部文献"), papers.length], ['weekly', Sparkles, t("每周新论文"), weeklyCount], ['starred', Star, t("我的收藏"), papers.filter(p => p.starred).length], ['reading', BookOpen, t("阅读中"), papers.filter(p => p.status === 'reading').length], ['read', CheckCheck, t("已读完"), papers.filter(p => p.status === 'read').length], ['notes', NotebookPen, t("我的笔记"), papers.filter(p => p.personalReview || p.note || p.highlights?.length).length], ['map', Map, t("研究地图"), null] ];
  function navigate(id) { exitReader(); setView(id); setFilterModule(''); }
  return <aside className={`sidebar ${reading ? 'compact' : ''}`}><Brand compact={reading} />{!reading && <ProjectPicker active={project} projects={projectList} onSwitch={switchProject} onNew={newProject} />}
    {!reading && <div className="nav-label">{t("工作空间")}</div>}<nav>{items.map(([id, Icon, label, count]) => <button title={label} key={id} className={`nav-item ${view === id && !filterModule ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={18} />{!reading && <><span>{label}</span>{count !== null && <small>{count}</small>}</>}</button>)}</nav>
    {!reading && <><div className="nav-label modules-label">{t("研究模块 ")}<span>{modules.length}</span></div><div className="module-nav">{modules.map((name, i) => <button key={name} className={filterModule === name ? 'selected' : ''} onClick={() => { navigate('library'); setFilterModule(name); }}><i style={{ background: moduleColors[i % moduleColors.length] }} /><span>{t(name)}</span><small>{papers.filter(p => p.module === name).length}</small></button>)}</div></>}
    <div className="sidebar-bottom">{!reading && <div className="local-card"><HardDrive size={16} /><div><strong>{t("为你的研究，留在本地")}</strong><span>{t("PDF · 笔记 · 阅读进度")}</span></div><span className="status-dot" /></div>}<button title={t("导入 PDF")} className="nav-item" onClick={onImport}><Upload size={17} />{!reading && <span>{t("导入 PDF")}</span>}</button><button title={t("备份与迁移")} className="nav-item" onClick={onBackup}><ArrowDownToLine size={17} />{!reading && <span>{t("备份与迁移")}</span>}</button><button title={t("设置")} className="nav-item" onClick={onSettings}><Settings2 size={17} />{!reading && <span>{t("设置与 AI 连接")}</span>}</button>{!reading && <div className="sidebar-version">{t("个人阅读工作台 ")}<span>v{version}</span></div>}</div></aside>;
}
function CircuitArt() {
  return <svg className="circuit-art" viewBox="0 0 310 152" aria-hidden="true"><defs><pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#58897e" opacity=".24" /></pattern></defs><rect width="310" height="152" fill="url(#dots)" /><path d="M56 75 C96 75 98 33 147 33 M56 75 C96 75 103 118 155 118 M158 34 C223 33 199 82 255 82 M158 116 C221 116 210 82 255 82" fill="none" stroke="#7ba89c" strokeWidth="1.4" /><path d="M147 43 Q126 76 151 108" fill="none" stroke="#abc5ba" strokeDasharray="4 5" /><circle cx="54" cy="75" r="24" fill="#f8fbf7" stroke="#b1c8bb" /><circle cx="152" cy="32" r="23" fill="#e2eee4" stroke="#a2beb0" /><circle cx="156" cy="119" r="23" fill="#eef2e5" stroke="#b8c2a1" /><circle cx="260" cy="82" r="25" fill="#f8fbf7" stroke="#b1c8bb" /><g fill="#3c645b" fontSize="10" fontFamily="sans-serif" textAnchor="middle"><text x="54" y="79">SNr</text><text x="152" y="36">SC</text><text x="156" y="123">Pitx2</text><text x="260" y="86">{t("选择")}</text></g><g fill="#417d73"><circle cx="101" cy="53" r="3" /><circle cx="209" cy="48" r="3" /><circle cx="110" cy="105" r="3" /><circle cx="219" cy="106" r="3" /></g></svg>;
}
function PaperCard({ paper, open, update, onImport }) {
  return <article className="paper-card"><div className="card-meta"><span className="paper-rank">{rankLabel(paper)}</span><span>{paper.year || t("新导入")}</span><span className="card-journal">{paper.journal || t("本地文献")}</span><button className={`icon-button star-button ${paper.starred ? 'starred' : ''}`} aria-label={`${paper.starred ? t("取消收藏") : t("收藏")} ${paper.title}`} onClick={() => update(paper.id, { starred: !paper.starred }).catch(() => {})}><Star size={16} fill={paper.starred ? 'currentColor' : 'none'} /></button></div>
    <button className="card-title" onClick={() => open(paper)}>{paper.title}</button><div className="card-authors">{paper.authors || t("导入 PDF 后，可在文献导读中编辑信息")}</div><p className="card-summary">{paper.summary || t("你的新论文已加入资料库。打开 PDF，开始阅读、提问和记录。")}</p>
    <div className="card-tags"><span>{t(paper.module)}</span>{paper.publication?.includes('预印本') && <span className="preprint">{t("预印本")}</span>}{paper.rank <= 30 && <span className="core-tag">{t("核心必读")}</span>}</div><PaperReview paper={paper} update={update} /><div className="card-bottom"><span className={`reading-state ${paper.status}`}><i />{statusNames[paper.status] || t("未开始")}</span>{paper.pdf ? <button className="pdf-linked" onClick={() => open(paper)}><FileText size={13} />{t("阅读 PDF")}<ArrowRight size={14} /></button> : <button className="add-pdf" onClick={() => onImport(paper.id)}><Plus size={13} />{t("添加 PDF")}</button>}</div></article>;
}
function LibraryView({ project, library, view, module, query, setQuery, papers, open, update, onImport }) {
  const [tab, setTab] = useState('all'), [sort, setSort] = useState('rank'), [publication, setPublication] = useState('');
  const [visible, setVisible] = useState(20);
  useEffect(() => setVisible(20), [query, tab, sort, module, view, publication]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return papers.filter(p => (!module || p.module === module) && (view !== 'starred' || p.starred) && (view !== 'reading' || p.status === 'reading') && (view !== 'read' || p.status === 'read') && (view !== 'notes' || p.personalReview || p.note || p.highlights?.length)
      && (tab !== 'core' || p.rank <= 30) && (tab !== 'pdf' || p.pdf) && (!publication || p.publication === publication)
      && (!term || [p.title, p.authors, p.journal, p.summary, p.relevance, p.caveat, p.personalReview, p.note, p.tags, ...(p.highlights || []).flatMap(h => [h.text, h.comment || ''])].join(' ').toLowerCase().includes(term)))
      .sort((a, b) => sort === 'year' ? (b.year || 0) - (a.year || 0) : sort === 'recent' ? (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) : a.rank - b.rank);
  }, [papers, module, view, tab, sort, query, publication]);
  const title = module || { library: t("我的文献库"), starred: t("值得反复阅读"), reading: t("接着上次，继续读"), read: t("已经读过的线索"), notes: t("把理解留在这里") }[view];
  const recent = papers.filter(p => p.status === 'reading' || p.updatedAt).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)).slice(0, 3);
  const readCount = papers.filter(p => p.status === 'read').length;
  return <div className="library-scroll"><div className="library-page"><div className="page-eyebrow">YOUR RESEARCH, CONNECTED</div><div className="library-title"><div><h1>{t(title)}</h1><p>{t("从一篇论文，到一个更清晰的研究问题。")}</p></div><button className="button primary" onClick={() => onImport()}><Plus size={16} />{t("导入论文 PDF")}</button></div>
    <div className="research-banner"><div><span className="banner-label"><Activity size={13} />{project.name}{t(" 文献工作台")}</span><h2>{project.id === 'sc-snr' ? t("读懂环路，连接你的下一个发现。") : t("从证据出发，推进你的研究。")}</h2><p>{project.keywords.slice(0, 3).join(' · ')}</p><div className="banner-stats"><span><b>{papers.length}</b>{t(" 篇文献")}</span><i /><span><b>{papers.filter(p => p.pdf).length}</b>{t(" 份 PDF")}</span><i /><span><b>{papers.filter(p => p.personalReview || p.note || p.highlights?.length).length}</b>{t(" 篇有笔记")}</span></div></div>{project.id === 'sc-snr' && <CircuitArt />}</div>
    <div className="library-content"><div className="paper-list-area"><div className="library-tabs">{[['all', t("全部文献")], ['core', t("核心必读")], ['pdf', t("已有 PDF")]].map(([id, label]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{label}{id === 'all' && <span>{papers.length}</span>}</button>)}<select aria-label={t("文献排序")} value={sort} onChange={e => setSort(e.target.value)}><option value="rank">{t("项目相关性")}</option><option value="year">{t("发表年份 ↓")}</option><option value="recent">{t("最近记录")}</option></select></div>
      <div className="list-filter"><span>{filtered.length}{t(" 篇")}{module ? ' · ' + module : ''}{query && t(" · 搜索结果")}</span><select aria-label={t("发表状态筛选")} value={publication} onChange={e => setPublication(e.target.value)}><option value="">{t("全部发表状态")}</option>{[...new Set(papers.map(p => p.publication))].map(state => <option key={state} value={state}>{t(state)}</option>)}</select></div>
      <div className="paper-grid">{filtered.slice(0, visible).map(p => <PaperCard key={p.id} paper={p} open={open} update={update} onImport={onImport} />)}</div>
      {!filtered.length && <div className="empty-state"><Search size={30} /><h3>{t("这里还没有文献")}</h3><p>{t("试试其他关键词，或导入一篇新的 PDF。")}</p><button className="button" onClick={() => { setQuery(''); setTab('all'); setPublication(''); }}>{t("清除搜索和筛选")}</button></div>}
      {filtered.length > visible && <button className="load-more" onClick={() => setVisible(v => v + 20)}>{t("再显示 20 篇 ")}<ChevronDown size={15} /></button>}
      <p className="source-footnote">{library.sourceName ? tx`原始文献地图 · ${library.sourceDate} · 原始概述沿用提供的 HTML；新增论文另附核对来源。` : t("本项目文献与来源保存在项目文件夹中。")}</p>
    </div><aside className="library-aside"><div className="aside-section"><div className="aside-title"><BookOpen size={16} /><h3>{t("继续阅读")}</h3></div>{recent.length ? recent.map(p => <button className="recent-paper" onClick={() => open(p)} key={p.id}><span>{rankLabel(p)} <small>{p.pdf ? tx`PDF 第 ${p.page || 1} 页` : t("文献导读")}</small></span><strong>{p.title}</strong><ArrowRight size={14} /></button>) : <div className="continue-empty"><div className="book-illustration"><BookOpen size={32} strokeWidth={1.2} /></div><strong>{t("今天，从一篇开始")}</strong><p>{t("打开论文后，阅读位置")}<br />{t("会为你留在这里。")}</p>{papers.length > 0 && <button onClick={() => open(papers[0])}>{t("从第一篇开始 ")}<ArrowRight size={13} /></button>}</div>}</div>
      <div className="reading-progress-card"><div className="aside-title"><h3>{t("我的阅读旅程")}</h3><span>{Math.round(readCount / Math.max(1, papers.length) * 100)}%</span></div><div className="progress-track"><i style={{ width: `${readCount / Math.max(1, papers.length) * 100}%` }} /></div><p><b>{readCount}</b> / {papers.length}{t(" 篇已读完")}</p></div>
      <div className="tip-card"><Sparkles size={19} /><h3>{t("不懂的地方，就地问清楚")}</h3><p>{t("导入 PDF 后选中原文，AI 会带着当前页上下文，和你一起理解。")}</p><div><span>{t("选中文本")}</span><ChevronRight size={11} /><span>{t("问 AI")}</span><ChevronRight size={11} /><span>{t("存笔记")}</span></div></div>
      <div className="scope-card"><ShieldCheck size={15} /><p>{t("PDF 与笔记保存在本机。提问时发送相关阅读内容；调研时发送项目问题、关键词和文献目录。")}</p></div>
    </aside></div></div></div>;
}
function Guide({ paper, update, onImport, onRead, onAsk, onContext, notify }) {
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(paper.title), [authors, setAuthors] = useState(paper.authors || ''), [journal, setJournal] = useState(paper.journal || '');
  useEffect(() => { onContext({ source: 'map', page: 1, pageText: '', selection: '' }); }, [paper.id, onContext]);
  async function saveMetadata() { await update(paper.id, { title, authors, journal }); setEditing(false); notify(t("文献信息已更新")); }
  return <div className="guide-scroll" onMouseUp={e => {
    const selection = window.getSelection();
    if (selection?.toString().trim() && e.currentTarget.contains(selection.anchorNode) && !e.target.closest('input, textarea')) onContext({ source: 'map', page: 1, pageText: '', selection: selection.toString().slice(0, 20000) });
  }}><div className="guide-page"><div className="guide-kicker"><span>{rankLabel(paper)} · {t(paper.module)}</span><button onClick={() => setEditing(v => !v)}><Pencil size={13} />{t("编辑信息")}</button></div>
    {editing ? <div className="metadata-editor"><label>{t("论文标题")}<input value={title} onChange={e => setTitle(e.target.value)} /></label><label>{t("作者")}<input value={authors} onChange={e => setAuthors(e.target.value)} /></label><label>{t("期刊")}<input value={journal} onChange={e => setJournal(e.target.value)} /></label><button className="button primary" onClick={() => saveMetadata().catch(e => notify(e.message))}><Check size={14} />{t("保存信息")}</button></div> : <><h1 className="guide-title">{paper.title}</h1><p className="guide-byline">{paper.authors || t("作者待填写")}<br /><b>{paper.journal || t("本地文献")}</b> {paper.year && ' · ' + paper.year}</p></>}
    <div className="guide-badges"><span>{t(paper.publication)}</span>{paper.rank <= 30 && <span className="core-tag">{t("核心必读")}</span>}{paper.url && <button onClick={() => api.openExternal(paper.url)}><ExternalLink size={12} />{t("查看原文来源")}</button>}</div>
    <div className={`pdf-import-callout ${paper.pdf ? 'attached' : ''}`}><div className="pdf-file-icon"><FileText size={25} /></div><div><strong>{paper.pdf ? t("PDF 已在你的资料库") : t("把原文放到手边")}</strong><p>{paper.pdf ? `${paper.pdf.fileName} · ${formatSize(paper.pdf.bytes)}` : t("导入下载好的 PDF，开始划词提问、标注和精读。")}</p></div><button className="button primary" onClick={paper.pdf ? onRead : onImport}>{paper.pdf ? <BookOpen size={15} /> : <Plus size={15} />}{paper.pdf ? t("阅读") : t("添加 PDF")}</button></div>
    <div className="guide-origin">{paper.discovery?.type === 'weekly' ? tx`来自 ${paper.discovery.weekOf} 这一周的论文筛选 · ${paper.verification}；项目相关性是筛选建议，请对照原文核实。` : t("以下内容来自你的原文献地图；导入 PDF 后，可对照原文逐条核实。")}</div>
    <div className="guide-translation"><button className="button" onClick={() => onAsk("Translate the supplied literature-map summary, project relevance and evidence limits into English. Preserve their uncertainty and do not claim to have checked the full paper. Do not change any saved research content.", { submit: true, answerLanguage: "en" })}>{t("翻译导读为英文")}</button><small>{t("译文显示在 AI 侧栏，保留原始导读。")}</small></div><section className="guide-section"><div className="section-number">01</div><div><h2>{t("这篇论文研究了什么？")}</h2><p>{paper.summary || t("这是一篇新导入的论文，暂时没有整理摘要。打开 PDF 后，可以请 AI 基于原文帮助你理解。")}</p></div></section>
    <section className="guide-section relevance-section"><div className="section-number">02</div><div><h2>{t("它为什么与你的项目有关？")}</h2><p>{paper.relevance || t("阅读后，在笔记里写下这篇论文与你的研究问题的联系。")}</p><button className="text-button" onClick={() => onAsk(t("请结合已有材料，分析这篇论文与我的 SNr–SC / Pitx2 视觉竞争项目的关系，区分证据和推断。"))}>{t("与 AI 一起讨论 ")}<ArrowRight size={14} /></button></div></section>
    <section className="evidence-boundary"><ShieldCheck size={18} /><div><h3>{t("理解证据，也看见边界")}</h3><p>{paper.caveat || t("尚未核验论文结论。请以原文和实验条件为准。")}</p></div></section>
    {paper.verification && <p className="verification-label">{t("原地图核验范围：")}{paper.verification}</p>}
  </div></div>;
}
function Notes({ paper, update, mutateHighlight, notify, onJump, onAnnotation }) {
  const [note, setNote] = useState(paper.note || ''), [tags, setTags] = useState(paper.tags || ''), [state, setState] = useState('已保存');
  const timer = useRef(null), draft = useRef(null), updateRef = useRef(update); updateRef.current = update;
  const save = useCallback(async payload => { if (!payload) return; try { setState('保存中…'); await updateRef.current(paper.id, payload); if (draft.current === payload) { draft.current = null; setState('已保存'); } else if (draft.current) setState('待保存'); else setState('已保存'); } catch { setState('保存失败，请重试'); } }, [paper.id]);
  useEffect(() => { if (!draft.current) { setNote(paper.note || ''); setTags(paper.tags || ''); } }, [paper.note, paper.tags]);
  useEffect(() => () => { clearTimeout(timer.current); if (draft.current) updateRef.current(paper.id, draft.current).catch(() => {}); }, [paper.id]);
  useEffect(() => registerDraftFlusher(paper.id, async () => { clearTimeout(timer.current); if (draft.current) { const snapshot = draft.current; await updateRef.current(paper.id, snapshot); if (draft.current === snapshot) draft.current = null; } }), [paper.id]);
  function change(nextNote, nextTags) { setNote(nextNote); setTags(nextTags); draft.current = { note: nextNote, tags: nextTags }; setState('待保存'); clearTimeout(timer.current); timer.current = setTimeout(() => save(draft.current), 450); }
  return <div className="notes-scroll"><div className="notes-page"><div className="notes-title"><div><span className="page-eyebrow">THINK ON PAPER</span><h2>{t("我的阅读笔记")}</h2></div><span className={`save-status ${state.includes('失败') ? 'failed' : ''}`}><Check size={12} />{te(state)}</span></div><div className="notes-toolbar"><span>{t("支持 Markdown，自动保存在本机")}</span><button onClick={() => change(note + (note ? '\n\n' : '') + t("## 核心问题与结论\n\n## 关键图 / 原文页码\n\n## 实验设计与对照\n\n## 对 SNr–SC / Pitx2 项目的启发\n\n## 证据边界与待解疑问\n"), tags)}><Plus size={12} />{t("插入精读模板")}</button></div><PaperReview paper={paper} update={update} /><textarea className="note-editor" aria-label={t("论文笔记")} placeholder={t("读到了什么？想通了什么？还有什么不确定？\\n\\n把你的理解，留在这里。")} value={note} onChange={e => change(e.target.value, tags)} onBlur={() => { clearTimeout(timer.current); if (draft.current) save(draft.current); }} /><div className="note-bottom"><label>{t("标签")}<input value={tags} onChange={e => change(note, e.target.value)} placeholder={t("例如：Figure 1，待验证，SNr 终末")} /></label><button className="icon-button" aria-label={t("保存笔记")} onClick={() => { clearTimeout(timer.current); save({ note, tags }); }}><Save size={16} /></button></div>
    <div className="highlights-title"><h3><Highlighter size={16} />{t("原文高亮")}</h3><span>{paper.highlights?.length || 0}{t(" 条")}</span></div>{!(paper.highlights || []).length && <div className="highlights-empty">{t("阅读 PDF 时选中文字，用颜色留下一条线索。")}</div>}{(paper.highlights || []).map(h => <div className={`highlight-note ${h.color}`} key={h.id}><div><button onClick={() => onJump(h.page || 0)}>{h.source === 'pdf' ? tx`PDF 第 ${h.page} 页` : t("原网页高亮")}<ArrowRight size={11} /></button><button aria-label={t("删除高亮")} onClick={() => mutateHighlight(paper.id, { action: 'remove', highlightId: h.id }).catch(() => {})}><X size={13} /></button></div><blockquote>{h.text}</blockquote>{h.comment && <p className="saved-annotation">{h.comment}</p>}<button className="edit-annotation" onClick={() => onAnnotation(h, true)}><Pencil size={12} />{h.comment ? t("编辑旁注") : t("添加旁注")}</button></div>)}</div></div>;
}
function ResearchMap({ library, open }) {
  if (!library.gaps?.length) return <div className="project-scroll"><div className="project-page"><h1>{t("研究地图")}</h1><p className="project-muted">{t("先在项目总览开始文献初筛。论文的项目关联与证据边界会保存在候选区和文献导读中。")}</p></div></div>;
  return <div className="library-scroll"><div className="map-page"><div className="page-eyebrow">FROM EVIDENCE TO EXPERIMENT</div><h1>{t("研究地图")}</h1><p className="page-description">{t("把 ")}{library.papers.length}{t(" 篇文献连到你的研究问题：哪些已有证据，哪些仍待验证。")}</p><div className="map-banner"><CircuitArt /><div><h2>{t("SNr → SC / Pitx2 → 视觉竞争")}</h2><p>{t("原地图中的工作假设与证据缺口，不代表已建立完整交叉闭环。")}</p></div></div><div className="gap-grid">{library.gaps.map((gap, i) => <article className="gap-card" key={gap.title}><div className="gap-index">{String(i + 1).padStart(2, '0')}</div><h2>{gap.title.replace(/^\d+\.\s*/, '')}</h2>{gap.paragraphs.map((p, j) => <p key={j} className={j === 2 ? 'gap-suggestion' : ''}>{p}</p>)}<div className="gap-links">{[...gap.paragraphs.join(' ').matchAll(/#(\d{3})/g)].map((m, j) => <button key={j} onClick={() => { const paper = library.papers.find(p => p.rank === Number(m[1])); if (paper) open(paper); }}>#{m[1]}<ArrowRight size={11} /></button>)}</div></article>)}</div><details className="scope-details"><summary>{t("查看原文献地图的检索范围与边界")}</summary>{library.scope.map((p, i) => <p key={i}>{p}</p>)}</details></div></div>;
}
function ImportModal({ papers, target, onClose, onImported, notify }) {
  const [files, setFiles] = useState([]), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState('');
  const available = papers.filter(p => !p.pdf);
  function addFiles(list) { const items = [...list].filter(f => /\.pdf$/i.test(f.name)); if (items.length !== list.length) setError(t("只接收 PDF 文件，其他文件已忽略。")); else setError(''); setFiles(old => [...old, ...items.map((file, i) => ({ file, target: target && !old.length && i === 0 ? target : '', status: '' }))]); }
  async function start() {
    setBusy(true); setError(''); let success = 0;
    const pending = files.map((item, index) => ({ item, index })).filter(({ item }) => !item.status);
    for (const { item, index } of pending) {
      try {
        setProgress(tx`正在导入 ${index + 1} / ${files.length}：${item.file.name}`);
        if (item.file.size > 104857600) throw new Error(t("单个 PDF 不得超过 100 MB。"));
        const bytes = new Uint8Array(await item.file.arrayBuffer());
        const task = loadPdf(bytes.slice()); let pdf, title = '';
        try { pdf = await task.promise; const metadata = await pdf.getMetadata().catch(() => null); title = metadata?.info?.Title || ''; if (title.length < 8 || /^(untitled|microsoft|adobe|word|document)/i.test(title)) title = ''; }
        finally { await task.destroy(); }
        const result = await api.importPdf({ id: item.target || null, name: item.file.name, bytes, title });
        onImported(result.paper); success++;
        setFiles(current => current.map((f, n) => n === index ? { ...f, status: result.duplicate ? t("已存在，已跳过重复文件") : t("已导入") } : f));
      } catch (e) { setError(item.file.name + '：' + (e.name === 'PasswordException' ? t("PDF 有密码，请先解锁。") : e.message)); }
    }
    setProgress(''); setBusy(false); if (success) notify(tx`已处理 ${success} 份 PDF`);
  }
  const finished = files.length && files.every(f => f.status);
  return <Modal title={t("把论文放进你的资料库")} subtitle={t("支持批量导入 PDF。文件会复制到本地资料库，不依赖下载文件夹。")} onClose={() => !busy && onClose()} wide><div className="modal-body"><label className="import-dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) addFiles(e.dataTransfer.files); }}><div><Upload size={28} /></div><strong>{t("拖入 PDF，或点击选择文件")}</strong><span>{t("每个文件最大 100 MB · 可一次导入多篇")}</span><input disabled={busy} type="file" accept=".pdf,application/pdf" multiple aria-label={t("选择 PDF 文件")} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} /></label>{!!files.length && <div className="import-files">{files.map((item, i) => <div className="import-file" key={i}><FileText size={20} /><div><strong>{item.file.name}</strong><span>{formatSize(item.file.size)}{item.status && ' · ' + item.status}</span>{!item.status && <select aria-label={tx`关联论文 ${item.file.name}`} value={item.target} disabled={busy} onChange={e => setFiles(old => old.map((f, n) => n === i ? { ...f, target: e.target.value } : f))}><option value="">{t("作为新论文加入资料库")}</option>{available.map(p => <option key={p.id} value={p.id}>{rankLabel(p)} · {p.title}</option>)}</select>}</div>{item.status ? <Check size={18} className="text-green" /> : <button className="icon-button" disabled={busy} aria-label={tx`移除 ${item.file.name}`} onClick={() => setFiles(old => old.filter((_, n) => n !== i))}><X size={16} /></button>}</div>)}</div>}{error && <div className="inline-error">{te(error)}</div>}<div className="modal-tip"><CircleHelp size={16} /><p>{t("给原地图里的论文添加 PDF：在文件下方选择对应的文献编号。请核对标题，避免关联到另一篇论文。")}</p></div></div><div className="modal-footer"><span>{busy ? progress : finished ? t("导入完成，文件已保存到资料库") : files.length ? tx`${files.length} 个待处理文件` : t("PDF 保存在本机，导入时不会上传")}</span><button className="button primary" disabled={busy || !files.length} onClick={finished ? onClose : start}>{busy ? <LoaderCircle className="spin" size={15} /> : finished ? <Check size={15} /> : <ArrowDownToLine size={15} />}{busy ? t("导入中") : finished ? t("完成") : t("开始导入")}</button></div></Modal>;
}
function SettingsModal({ settings, onSettings, onClose, notify }) {
  const [provider, setProvider] = useState(settings.provider || 'codex');
  const [effort, setEffort] = useState(settings.effort || readingModel.defaultEffort), [key, setKey] = useState(''), [removeKey, setRemoveKey] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const member = settings.codex || {};
  const efforts = supportedEfforts(settings, provider);
  async function save() {
    try {
      setBusy(true); setError('');
      const next = await api.saveSettings({ provider, model: readingModel.id, effort, key: provider === 'api' ? key.trim() : '', removeKey });
      onSettings(next); setKey(''); notify(t("AI 连接设置已保存")); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function check() {
    try { setBusy(true); setError(''); const next = await api.codexStatus(); onSettings(next); if (!next.codex.connected) setError(next.codex.error); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function login() {
    try { setBusy(true); setError(''); await api.codexLogin(); notify(t("请在浏览器中完成 ChatGPT 登录，再点击「检查连接」。")); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Modal title={t("连接你的阅读助手")} subtitle={t("使用已有 ChatGPT／Codex 会员，即可在论文旁边提问。")} onClose={onClose}>
    <div className="modal-body">
      <LanguageSettings /><div className="provider-choices" role="group" aria-label={t("AI 连接方式")}>{[['codex', t("使用现有会员")], ['api', t("API · 另行计费")], ['clipboard', t("手动复制")]].map(([id, label]) => <button key={id} type="button" aria-pressed={provider === id} onClick={() => { setProvider(id); setError(''); if (id === 'api' && !readingModel.apiEfforts.includes(effort)) setEffort(readingModel.defaultEffort); }}>{label}</button>)}</div>
      {!api.desktop && <div className="inline-notice">{t("当前是浏览器预览。请在 Windows 桌面版中连接 AI。")}</div>}
      {provider === 'codex' && <div className="member-connection">
        <div className="settings-provider"><div className="ai-icon"><Sparkles size={23} /></div><div><strong>{t("ChatGPT／Codex 会员")}</strong><span>{member.connected ? tx`已连接${member.plan ? ' · ' + member.plan.toUpperCase() : ''}` : t("使用本机 Codex 的官方登录")}</span></div><span className={`provider-badge ${member.connected ? 'ready' : ''}`}>{member.connected ? t("无需 API Key") : t("待连接")}</span></div>
        <p>{t("提问使用你现有的会员额度，不另收 API 费用。使用会受会员限额约束；软件不自动购买额度或切换到 API。")}</p>
        <div className="member-actions"><button className="button" onClick={check} disabled={!api.desktop || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{t("检查连接")}</button>{!member.connected && <button className="button primary" onClick={login} disabled={!api.desktop || busy}>{t("用 ChatGPT 登录")}</button>}</div>
        {!member.connected && <small>{t("需要在这台电脑上安装 Codex。已登录时通常可以直接使用；登录后点「检查连接」。")}</small>}
      </div>}
      {provider === 'api' && <><div className="inline-notice">{t("此方式按 OpenAI API 用量另行计费，不使用 ChatGPT 会员额度。若不希望增加 API 费用，请选择「使用现有会员」。")}</div><label className="form-field">OpenAI API Key<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} disabled={!api.desktop} placeholder={settings.hasKey ? t("已安全保存，留空保留现有密钥") : 'sk-…'} /><small>{t("密钥由 Windows 加密保存在本机，不进入 PDF 备份。")}</small></label>{settings.hasKey && <label className="checkbox-label"><input type="checkbox" checked={removeKey} onChange={e => setRemoveKey(e.target.checked)} />{t("移除本机保存的 API Key")}</label>}</>}
      {provider !== 'clipboard' && <><div className="fixed-model-summary"><Sparkles size={18} /><div><strong>GPT-6 Astra</strong><span>{t("固定模型，按问题调整推理强度")}</span></div></div><label className="form-field">{t("GPT-6 推理强度")}<select aria-label={t("设置中的 GPT-6 推理强度")} value={effort} onChange={event => setEffort(event.target.value)} disabled={!api.desktop || busy || !efforts.length}>{!efforts.includes(effort) && <option value={effort} disabled>{effortLabel(effort)}{t(" · 等待可用档位")}</option>}{efforts.map(value => <option key={value} value={value}>{effortLabel(value)}</option>)}</select><small>{provider === 'codex' ? t("只显示当前会员连接提供的 GPT-6 档位，可点击「检查连接」刷新。") : t("显示 GPT-6 API 支持的推理档位。")}</small></label><p className="effort-description">{t(readingModel.effortHints[effort])}</p></>}
      {provider === 'clipboard' && <div className="settings-explainer"><h3>{t("继续使用已有的 ChatGPT／Codex")}</h3><p>{t("点击阅读侧栏的「复制问题与上下文」，把原文与问题粘贴到已有的对话里。此方式需要手动粘贴，回答不会自动回到软件。")}</p></div>}
      <div className="modal-tip"><ShieldCheck size={17} /><p>{t("提问时发送当前页文字、选区和近期对话。附图与相关页可自行勾选。")}{provider === 'codex' && t("会员登录交给官方 Codex 处理，无需复制密钥或登录凭证。")}</p></div>
      {error && <div className="inline-error">{te(error)}</div>}
    </div><div className="modal-footer"><button className="text-button" onClick={() => api.openExternal(provider === 'api' ? 'https://platform.openai.com/api-keys' : 'https://learn.chatgpt.com/docs/auth')}>{provider === 'api' ? t("API 密钥页面") : t("官方登录说明")}<ExternalLink size={12} /></button><button className="button primary" disabled={!api.desktop || busy} onClick={save}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{t("保存设置")}</button></div>
  </Modal>;
}
function BackupModal({ library, onClose, onLibrary, notify }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function action(fn) { setBusy(true); setError(''); try { await flushDrafts(); await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function markdownExport() {
    const snapshot = await api.load();
    const text = t("# SNr–SC / Pitx2 · 我的阅读笔记\n\n导出时间：") + new Date().toLocaleString(dateLocale()) + '\n\n' + snapshot.papers.filter(p => p.personalReview || p.note || p.highlights?.length || p.messages?.length).map(p => tx`## ${rankLabel(p)} ${p.title}\n\n${p.authors || ''} · ${p.year || ''} · ${p.journal || ''}\n\n${p.url || ''}\n\n阅读状态：${statusNames[p.status]}\n标签：${p.tags || t("无")}\n\n${p.personalReview ? t("**我的评价**\n\n") + p.personalReview + '\n\n' : ''}${p.note || ''}\n\n### 高亮摘录\n\n${(p.highlights || []).map(h => `> ${h.text.replace(/\n/g, '\n> ')}\n\n${h.source === 'pdf' ? tx`PDF 第 ${h.page} 页` : t("原网页高亮")}${h.comment ? t("\n\n**我的旁注**\n\n") + h.comment : ''}`).join('\n\n')}\n\n### 阅读对话\n\n${(p.messages || []).map(m => `**${m.role === 'user' ? t("我") : 'AI'}**\n\n${m.content}`).join('\n\n')}`).join('\n\n---\n\n');
    downloadText(t("NeuroShelf-阅读笔记.md"), text); notify(t("阅读笔记已导出"));
  }
  return <Modal title={t("让每一次理解，都有备份")} subtitle={t("完整备份包含论文 PDF、阅读笔记、实验记录与证据图片，保存为一个文件夹。")} onClose={() => !busy && onClose()}><div className="modal-body backup-options"><button disabled={busy} onClick={() => action(async () => { const result = await api.backup(); if (result) notify(t("完整备份已保存：") + result); })}><div><HardDrive size={22} /></div><span><strong>{t("导出完整资料库")}</strong><small>{t("选择位置，生成含 PDF、实验记录和图片的独立备份文件夹")}</small></span><ChevronRight size={17} /></button><button disabled={busy} onClick={() => action(async () => { const result = await api.restore(); if (result) { onLibrary(result); notify(t("备份已合并，保留较新的阅读记录")); } })}><div><FolderOpen size={22} /></div><span><strong>{t("从完整备份恢复")}</strong><small>{t("选择备份中的 library.json；按编号合并，保留较新记录")}</small></span><ChevronRight size={17} /></button><button disabled={busy} onClick={() => action(markdownExport)}><div><NotebookPen size={22} /></div><span><strong>{t("导出阅读笔记 Markdown")}</strong><small>{t("包含个人评价、笔记、高亮和 AI 对话")}</small></span><ChevronRight size={17} /></button><label className="legacy-import"><div><Upload size={22} /></div><span><strong>{t("导入原网页笔记")}</strong><small>{t("选择原 HTML 阅读工具导出的 JSON 备份")}</small></span><ChevronRight size={17} /><input disabled={busy} type="file" accept=".json" aria-label={t("导入原网页 JSON 笔记")} onChange={e => { const file = e.target.files[0]; if (file) action(async () => { if (file.size > 50 * 1024 * 1024) throw new Error(t("笔记备份过大")); const result = await api.importLegacy(JSON.parse(await file.text())); onLibrary(result.library); notify(tx`已迁移 ${result.count} 篇论文的阅读记录`); }); }} /></label><button disabled={busy} onClick={() => action(async () => { await api.openData(); })}><div><FolderOpen size={22} /></div><span><strong>{t("打开本机资料目录")}</strong><small>{t("查看 PDF 原文件和 library.json 数据库")}</small></span><ExternalLink size={16} /></button>{busy && <div className="inline-notice"><LoaderCircle size={14} className="spin" />{t("正在处理，请勿关闭…")}</div>}{error && <div className="inline-error">{te(error)}</div>}<div className="modal-tip"><ShieldCheck size={17} /><p>{t("API Key 不包含在备份中。移动备份时请保留整个文件夹；只有 library.json 无法恢复 PDF 和证据图片。")}</p></div></div></Modal>;
}

export default function App() {
  useLanguage();
  const [library, setLibrary] = useState(null), [loadError, setLoadError] = useState(''), [settings, setSettings] = useState({ provider: 'codex', model: readingModel.id, effort: readingModel.defaultEffort, hasKey: false });
  const [view, setView] = useState('library'), [filterModule, setFilterModule] = useState(''), [query, setQuery] = useState('');
  const [openedId, setOpenedId] = useState(null), [readerTab, setReaderTab] = useState('guide'), [modal, setModal] = useState(null), [importTarget, setImportTarget] = useState(null);
  const [context, setContext] = useState(null), [askDraft, setAskDraft] = useState(null), [jump, setJump] = useState(null), [toast, setToast] = useState('');
  const [detachConfirm, setDetachConfirm] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('ai'), [activeAnnotation, setActiveAnnotation] = useState(null);
  const [weeklySyncState, setWeeklySyncState] = useState({ busy: false, error: '', schedule: null });
  const [projectState, setProjectState] = useState(null), [job, setJob] = useState(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const project = projectState?.projects.find(p => p.id === projectState.activeId);
  const weeklyRequest = useRef(null);
  const searchRef = useRef(null), toastTimer = useRef(null), pendingSaves = useRef(new Set());
  const notify = useCallback(message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 6500); }, []);
  const onPaper = useCallback(paper => setLibrary(old => receivePaper(old, paper)), []);
  const syncWeekly = useCallback((manual = false) => {
    if (weeklyRequest.current) return weeklyRequest.current;
    setWeeklySyncState(old => ({ ...old, busy: true }));
    const promise = api.weeklySync().then(result => {
      setLibrary(old => old ? { ...old, weekly: result.weekly, people: result.people || old.people } : old);
      const error = result.errors.map(e => `${e.file}：${e.message}`).join('\n');
      setWeeklySyncState({ busy: false, error, schedule: result.schedule });
      if (manual) notify(error ? t("有筛选文件未能接收，请查看错误说明。") : result.added ? tx`收到 ${result.added} 篇新的候选论文。` : t("收件箱已更新，目前没有新的筛选结果。"));
      return result;
    }).catch(e => { setWeeklySyncState(old => ({ ...old, busy: false, error: t("接收失败：") + e.message })); })
      .finally(() => { weeklyRequest.current = null; });
    weeklyRequest.current = promise; return promise;
  }, [notify]);
  const decideWeekly = useCallback((id, action) => {
    const promise = api.weeklyDecide(id, action).then(result => {
      if (result.paper) onPaper(result.paper);
      setLibrary(old => ({ ...old, weekly: result.weekly })); return result;
    });
    pendingSaves.current.add(promise); promise.then(() => pendingSaves.current.delete(promise), () => pendingSaves.current.delete(promise));
    return promise;
  }, [onPaper]);
  const update = useCallback((id, patch) => { const promise = api.update(id, patch).then(paper => { onPaper(paper); return paper; }).catch(e => { notify(t("保存失败：") + e.message); throw e; }); pendingSaves.current.add(promise); promise.then(() => pendingSaves.current.delete(promise), () => pendingSaves.current.delete(promise)); return promise; }, [onPaper, notify]);
  const saveExperiment = useCallback((method, payload) => {
    const promise = api[method](payload).then(result => { setLibrary(old => ({ ...old, experiments: receiveExperiments(old.experiments, result.experiments) })); return result; });
    pendingSaves.current.add(promise); promise.then(() => pendingSaves.current.delete(promise), () => pendingSaves.current.delete(promise)); return promise;
  }, []);
  const mutateHighlight = useCallback((id, change) => { const promise = api.mutateHighlight(id, change).then(paper => { onPaper(paper); return paper; }).catch(e => { notify(t("旁注保存失败：") + e.message); throw e; }); pendingSaves.current.add(promise); promise.then(() => pendingSaves.current.delete(promise), () => pendingSaves.current.delete(promise)); return promise; }, [onPaper, notify]);
  useEffect(() => api.onBeforeClose?.(async () => { await flushDrafts(); while (pendingSaves.current.size) await Promise.all([...pendingSaves.current]); }), []);
  useEffect(() => { Promise.all([api.load(), api.settings(), api.projects()]).then(([data, prefs, projects]) => { setLibrary(data); setSettings(prefs); setProjectState(projects); if (!data.papers.length) setView('project'); }).catch(e => setLoadError(e.message)); }, []);
  const reloadLibrary = useCallback(async () => { const incoming = await api.load(); setLibrary(current => receiveLibrary(current, incoming)); }, []);
  useEffect(() => {
    if (!api.desktop) return;
    let alive = true, polling = false, previous = null;
    const poll = async () => { if (polling) return; polling = true; try { const next = await api.researchStatus(); if (!alive) return; setJob(next); if (next && !['running', 'stopping'].includes(next.status) && previous !== `${next.id}:${next.status}`) { await reloadLibrary(); syncWeekly(); } previous = next ? `${next.id}:${next.status}` : null; } catch (e) { if (alive) notify(e.message); } finally { polling = false; } };
    poll(); const timer = setInterval(poll, 1000); return () => { alive = false; clearInterval(timer); };
  }, [reloadLibrary, syncWeekly, notify]);
  async function startResearch(kind) { try { setJob(await api.startResearch(kind)); setView('project'); setQuery(''); } catch (e) { notify(e.message); } }
  async function startPiResearch(piId, mode) { try { setJob(await api.startPiResearch(piId, mode)); } catch (e) { notify(e.message); } }
  async function stopResearch() { try { setJob(await api.stopResearch()); } catch (e) { notify(e.message); } }
  async function switchProject(id) {
    if (projectBusy || id === project?.id) return;
    setProjectBusy(true);
    try { await flushDrafts(); while (pendingSaves.current.size) await Promise.all([...pendingSaves.current]); if (weeklyRequest.current) await weeklyRequest.current; await api.switchProject(id); window.location.reload(); }
    catch (e) { setProjectBusy(false); notify(e.message); throw e; }
  }
  async function saveProject(form) {
    if (modal === 'edit-project') { setProjectState(await api.updateProject(form)); setModal(null); syncWeekly(); notify(t("项目设置已保存")); }
    else { const created = await api.createProject(form); await switchProject(created.id); }
  }
  async function updatePerson(id, patch) { const work = api.updatePerson(id, patch).then(people => setLibrary(old => ({ ...old, people }))); pendingSaves.current.add(work); try { await work; } finally { pendingSaves.current.delete(work); } }
  const libraryReady = Boolean(library);
  useEffect(() => {
    if (!libraryReady) return;
    const refresh = () => { syncWeekly(); };
    refresh(); window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 60000);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [libraryReady, syncWeekly]);
  useEffect(() => {
    if (!api.desktop || settings.provider !== 'codex') return;
    let alive = true;
    api.codexStatus().then(next => { if (alive) setSettings(next); }).catch(e => { if (alive) setSettings(old => ({ ...old, codex: { checked: true, connected: false, models: [], error: e.message } })); });
    return () => { alive = false; };
  }, [settings.provider]);
  useEffect(() => { const handler = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); } if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setToast(''); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
  const paper = library?.papers.find(p => p.id === openedId);
  function open(p) { if (!p) return; setOpenedId(p.id); setReaderTab(p.pdf ? 'pdf' : 'guide'); setContext(null); setAskDraft(null); setJump(null); setActiveAnnotation(null); if (p.status === 'unread' || p.status === 'queued') update(p.id, { status: 'reading' }).catch(() => {}); }
  function onImport(id = null) { setImportTarget(id); setModal('import'); }
  function ask(text, options = {}) {
    setSidebarTab('ai');
    if (options.context) setContext(options.context);
    setAskDraft({ text, id: crypto.randomUUID(), paperId: paper?.id, ...options });
  }
  function jumpTo(page, highlightId) { if (!paper?.pdf || !page) { setReaderTab('guide'); return; } setReaderTab('pdf'); setJump({ page, highlightId, at: Date.now() }); }
  function annotate(highlight, focus = false) {
    if (highlight.source === 'pdf' && highlight.pdfHash && highlight.pdfHash !== paper?.pdf?.hash) { notify(t("这条高亮来自另一版本 PDF，请关联对应原文后查看。")); return; }
    setSidebarTab('annotations'); setActiveAnnotation({ id: highlight.id, focus, at: Date.now() });
  }
  function locateAnnotation(highlight) { annotate(highlight); jumpTo(highlight.page || 0, highlight.id); }
  if (loadError) return <div className="app-load"><FileText size={36} /><h2>{t("文献库暂时无法打开")}</h2><p>{te(loadError)}</p><button className="button" onClick={() => window.location.reload()}>{t("重新尝试")}</button></div>;
  if (!library || !project) return <div className="app-load"><Brand /><LoaderCircle className="spin" size={25} /><p>{t("正在整理你的文献工作台…")}</p></div>;
  return <div className={`app-shell ${paper ? 'reading-mode' : ''}`}><Sidebar project={project} projectList={projectState.projects} switchProject={id => switchProject(id).catch(() => {})} newProject={() => setModal('new-project')} papers={library.papers} weeklyCount={(library.weekly?.candidates || []).filter(c => c.status === 'pending').length} view={view} setView={next => { const go = () => { setView(next); if (next === 'weekly' || next === 'experiments' || view === 'experiments') setQuery(''); }; if (view === 'experiments') flushDrafts().then(go).catch(e => notify(e.message)); else go(); }} reading={!!paper} exitReader={() => { setOpenedId(null); setContext(null); }} filterModule={filterModule} setFilterModule={setFilterModule} onImport={() => onImport()} onSettings={() => setModal('settings')} onBackup={() => setModal('backup')} /><main className="main-workspace"><header className="topbar"><div className="breadcrumbs">{paper ? <button onClick={() => { setOpenedId(null); setContext(null); }}><ArrowLeft size={15} />{view === 'weekly' ? t("返回每周新论文") : t("返回文献库")}</button> : <><span>{project.name}</span><ChevronRight size={13} /><b>{view === 'project' ? t("项目总览") : view === 'experiments' ? t("实验进程") : view === 'people' ? t("PI 与实验室") : view === 'weekly' ? t("每周新论文") : view === 'map' ? t("研究地图") : t("文献库")}</b></>}</div><div className="global-search"><Search size={16} /><input ref={searchRef} aria-label={t("搜索文献库")} placeholder={view === 'experiments' && !paper ? t("搜索实验步骤、结果、图片说明…") : view === 'people' && !paper ? t("搜索 PI、机构与研究方向…") : view === 'weekly' && !paper ? t("搜索候选论文、推荐理由…") : t("搜索论文、作者、评价、笔记…")} value={query} onChange={e => { setQuery(e.target.value); if (paper || view === 'map' || view === 'project') { setOpenedId(null); setView('library'); } }} /><kbd>Ctrl K</kbd>{query && <button className="icon-button" aria-label={t("清除搜索")} onClick={() => setQuery('')}><X size={13} /></button>}</div><div className="topbar-right"><LanguageSettings compact /><span className="local-indicator"><span className="status-dot" />{api.desktop ? t("本地资料库") : t("浏览器预览")}</span><button className="user-avatar" title={t("设置")} onClick={() => setModal('settings')}>YZ</button></div></header>
      {paper ? <><div className="paper-topbar"><div><div className="paper-top-meta"><span>{rankLabel(paper)}</span><span>{paper.journal || t("本地文献")}{paper.year && ' · ' + paper.year}</span></div><h1 title={paper.title}>{paper.title}</h1></div><div className="paper-top-actions"><button className={`icon-button ${paper.starred ? 'starred' : ''}`} aria-label={t("收藏当前论文")} onClick={() => update(paper.id, { starred: !paper.starred }).catch(() => {})}><Star size={18} fill={paper.starred ? 'currentColor' : 'none'} /></button><select aria-label={t("当前论文阅读状态")} value={paper.status || 'unread'} onChange={e => update(paper.id, { status: e.target.value }).catch(() => {})}>{Object.entries(statusNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div></div><ReaderWorkbench sidebar={<aside className="reading-sidebar"><div className="reading-sidebar-tabs" role="tablist" aria-label={t("阅读边栏")}><button id="ai-tab" role="tab" aria-selected={sidebarTab === 'ai'} aria-controls="ai-panel" onClick={() => setSidebarTab('ai')}><Sparkles size={15} />{t("AI 助手")}</button><button id="annotations-tab" role="tab" aria-selected={sidebarTab === 'annotations'} aria-controls="annotation-panel" onClick={() => setSidebarTab('annotations')}><NotebookPen size={15} />{t("原文旁注")}<span>{paper.highlights?.length || 0}</span></button></div><ChatPanel paper={paper} context={context} settings={settings} onConfig={setSettings} onSettings={() => setModal('settings')} onPaper={onPaper} update={update} notify={notify} askDraft={askDraft} onJump={jumpTo} imageEnabled={readerTab === 'pdf' && Boolean(paper.pdf)} visible={sidebarTab === 'ai'} /><AnnotationPanel key={paper.id} paper={paper} active={activeAnnotation} mutate={mutateHighlight} onLocate={locateAnnotation} notify={notify} visible={sidebarTab === 'annotations'} /></aside>}><section className="document-panel"><div className="document-tabs">{[['pdf', FileText, t("原文 PDF")], ['guide', BookMarked, t("文献导读")], ['notes', NotebookPen, t("我的笔记")]].map(([id, Icon, label]) => <button key={id} className={readerTab === id ? 'active' : ''} onClick={() => setReaderTab(id)}><Icon size={15} />{label}{id === 'notes' && !!paper.highlights?.length && <span>{paper.highlights.length}</span>}</button>)}{paper.pdf && <button className="detach-pdf" title={t("解除 PDF 关联")} aria-label={t("解除 PDF 关联")} onClick={() => setDetachConfirm(true)}><Link2Off size={14} /></button>}</div>
        {readerTab === 'pdf' && (paper.pdf ? <PdfReader key={paper.id + paper.pdf.hash} paper={paper} update={update} onContext={setContext} onAsk={ask} onImport={() => onImport(paper.id)} notify={notify} jump={jump} mutateHighlight={mutateHighlight} onAnnotation={annotate} activeAnnotation={sidebarTab === 'annotations' ? activeAnnotation : null} /> : <div className="pdf-empty"><div className="pdf-empty-art"><FileText size={46} strokeWidth={1.2} /><span><Plus size={19} /></span></div><h2>{t("让原文和理解，在同一个地方")}</h2><p>{t("为这篇论文添加 PDF，开始阅读、划词提问和标注。")}<br />{t("你可以导入自己在网上下载的论文文件。")}</p><button className="button primary" onClick={() => onImport(paper.id)}><Upload size={16} />{t("添加这篇论文的 PDF")}</button>{paper.url && <button className="text-button" onClick={() => api.openExternal(paper.url)}>{t("前往原文页面 ")}<ExternalLink size={13} /></button>}<div className="pdf-empty-steps"><span><FileText size={17} />{t("阅读 PDF")}</span><ChevronRight size={13} /><span><Highlighter size={17} />{t("选中原文")}</span><ChevronRight size={13} /><span><Sparkles size={17} />{t("即时提问")}</span></div></div>)}
        {readerTab === 'guide' && <Guide key={paper.id} paper={paper} update={update} onImport={() => onImport(paper.id)} onRead={() => setReaderTab('pdf')} onAsk={ask} onContext={setContext} notify={notify} />}
        {readerTab === 'notes' && <Notes key={paper.id} paper={paper} update={update} mutateHighlight={mutateHighlight} notify={notify} onJump={jumpTo} onAnnotation={(h, focus) => { annotate(h, focus); jumpTo(h.page || 0, h.id); }} />}
      </section></ReaderWorkbench></> : view === 'project' ? <ProjectHub project={project} library={library} job={job} start={startResearch} stop={stopResearch} navigate={next => { setView(next); setQuery(''); }} edit={() => setModal('edit-project')} schedule={weeklySyncState.schedule} notify={notify} /> : view === 'experiments' ? <Experiments key={project.id} project={project} data={library.experiments} change={payload => saveExperiment('changeExperiment', payload)} importImage={payload => saveExperiment('importEvidence', payload)} query={query} notify={notify} /> : view === 'people' ? <PeopleView project={project} startPi={startPiResearch} job={job} stop={stopResearch} refresh={reloadLibrary} people={library.people} update={updatePerson} start={startResearch} busy={['running', 'stopping'].includes(job?.status)} query={query} notify={notify} /> : view === 'weekly' ? <WeeklyInbox project={project} weekly={library.weekly} syncState={weeklySyncState} sync={syncWeekly} decide={decideWeekly} papers={library.papers} open={open} onImport={onImport} query={query} setQuery={setQuery} notify={notify} /> : view === 'map' ? <ResearchMap library={library} open={open} /> : <LibraryView project={project} library={library} view={view} module={filterModule} query={query} setQuery={setQuery} papers={library.papers} open={open} update={update} onImport={onImport} />}
    </main>{['new-project', 'edit-project'].includes(modal) && <ProjectDialog project={modal === 'edit-project' ? project : null} onClose={() => setModal(null)} onSave={saveProject} />}{projectBusy && <div className="project-switching" role="status"><LoaderCircle className="spin" />{t("正在保存并切换项目…")}</div>}{modal === 'import' && <ImportModal papers={library.papers} target={importTarget} onClose={() => setModal(null)} onImported={onPaper} notify={notify} />}{modal === 'settings' && <SettingsModal settings={settings} onSettings={setSettings} onClose={() => setModal(null)} notify={notify} />}{modal === 'backup' && <BackupModal library={library} onClose={() => setModal(null)} onLibrary={setLibrary} notify={notify} />}
    {detachConfirm && <Modal title={t("解除这篇论文的 PDF 关联？")} subtitle={t("原文件和笔记仍保留在本机。重新关联其他版本时，旧版的高亮不会显示在新 PDF 上。")} onClose={() => setDetachConfirm(false)}><div className="modal-footer"><button className="button" onClick={() => setDetachConfirm(false)}>{t("取消")}</button><button className="button" onClick={async () => { try { onPaper(await api.detachPdf(paper.id)); setReaderTab('guide'); setContext(null); setDetachConfirm(false); notify(t("已解除关联，可导入其他 PDF")); } catch (e) { notify(e.message); } }}>{t("解除关联")}</button></div></Modal>}
    {toast && <div className="toast" role="status"><Check size={16} /><span>{te(toast)}</span><button aria-label={t("关闭提示")} onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}
