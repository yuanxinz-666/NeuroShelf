import React, { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCheck, ExternalLink, Inbox, Plus, RefreshCw, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { api } from './bridge';
import './weekly.css';

const statusLabels = { pending: '待筛选', accepted: '已入库', dismissed: '暂不收录' };
const matchOrder = { '直接相关': 0, '方法参考': 1, '拓展线索': 2 };
const dateLabel = value => value ? value.slice(0, 10).replaceAll('-', '.') : '尚未筛选';
export default function WeeklyInbox({ project, weekly, syncState, sync, decide, papers, open, onImport, query, setQuery, notify }) {
  const [status, setStatus] = useState('pending'), [week, setWeek] = useState('all'), [match, setMatch] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const candidates = weekly?.candidates || [], batches = weekly?.batches || [];
  const latest = [...batches].sort((a, b) => b.screenedAt.localeCompare(a.screenedAt))[0];
  const weeks = [...new Set([...batches.map(b => b.weekOf), ...candidates.map(c => c.weekOf)])].sort().reverse();
  const filtered = useMemo(() => candidates.filter(c => c.status === status && (week === 'all' || c.weekOf === week) && (match === 'all' || c.match === match) && (!query.trim() || `${c.title} ${c.authors} ${c.journal} ${c.doi} ${c.summary} ${c.relevance} ${c.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf) || matchOrder[a.match] - matchOrder[b.match] || b.publishedDate.localeCompare(a.publishedDate)), [candidates, status, week, match, query]);
  async function act(candidate, action) {
    if (busyId) return;
    setBusyId(candidate.id);
    try {
      const result = await decide(candidate.id, action);
      notify(action === 'accept' ? (result.duplicate ? '这篇论文已在文献库，已关联现有记录。' : '已加入文献库，可在“已入库”中打开或导入 PDF。') : action === 'dismiss' ? '已移到“暂不收录”，随时可以恢复。' : '已放回待筛选。');
    } catch (e) { notify('操作失败：' + e.message); }
    finally { setBusyId(null); }
  }
  const openSource = url => api.openExternal(url).catch(e => notify(e.message));
  return <div className="library-scroll"><div className="weekly-page">
    <header className="weekly-heading"><div><div className="page-eyebrow">A WEEKLY RESEARCH INBOX</div><h1>每周新论文 <span>{candidates.filter(c => c.status === 'pending').length} 篇待筛选</span></h1><p>从新研究中，挑出值得放进你文献库的下一篇。</p></div><button className="button secondary" onClick={() => sync(true)} disabled={syncState.busy}><RefreshCw size={15} className={syncState.busy ? 'spin' : ''} />{syncState.busy ? '正在接收…' : '刷新收件箱'}</button></header>
    <section className="weekly-plan" aria-label="每周筛选计划"><div className="weekly-calendar"><CalendarDays size={27} /><span>MON</span></div><div><strong>{syncState.schedule?.label || '每周一 · 项目论文筛选'}</strong><p>{project?.question || '按项目研究问题筛选'}</p><small>{syncState.schedule ? '由 Codex 定时检索；运行时请保持电脑联网、Codex 打开。' : api.desktop ? '正在等待定时筛选配置或第一批结果。' : '在 Windows 桌面版接收每周筛选结果。'} 候选论文由你决定是否收录。</small></div><div className="weekly-latest"><span>最近一次筛选</span><strong>{dateLabel(latest?.screenedAt)}</strong>{latest && <small>{latest.status === 'partial' ? '部分来源未完成' : '筛选已完成'} · 新增 {latest.addedCount} 篇</small>}</div></section>
    {syncState.error && <div className="weekly-error" role="alert">{syncState.error}<button onClick={() => sync(true)}>重试接收</button></div>}
    {latest && <details className="weekly-run"><summary>查看最近一次检索范围与记录 <span>{dateLabel(latest.windowStart)} — {dateLabel(latest.windowEnd)}</span></summary><p>{latest.summary}</p><p>核查 {latest.checkedCount} 条 · 新增 {latest.addedCount} 篇 · 跳过重复 {latest.duplicateCount} 篇</p><p>来源：{latest.searchedSources.join('；')}</p></details>}
    <div className="weekly-toolbar"><div className="weekly-tabs" role="tablist" aria-label="候选论文状态">{Object.entries(statusLabels).map(([key, label]) => <button key={key} role="tab" aria-selected={status === key} onClick={() => setStatus(key)}>{label}<span>{candidates.filter(c => c.status === key).length}</span></button>)}</div><div className="weekly-filters"><select aria-label="筛选所属周" value={week} onChange={e => setWeek(e.target.value)}><option value="all">全部周次</option>{weeks.map(w => <option key={w} value={w}>{dateLabel(w)} 这一周</option>)}</select><select aria-label="筛选相关性" value={match} onChange={e => setMatch(e.target.value)}><option value="all">全部相关性</option>{Object.keys(matchOrder).map(m => <option key={m}>{m}</option>)}</select></div></div>
    <div className="weekly-result-count" aria-live="polite">{query ? `搜索“${query}” · ` : ''}{filtered.length} 篇{statusLabels[status]}{status === 'pending' && ' · 可以先浏览，稍后再做决定'}</div>
    <div className="weekly-candidates">{filtered.map(candidate => {
      const paper = papers.find(p => p.id === candidate.paperId);
      return <article className="weekly-candidate" key={candidate.id} data-candidate-id={candidate.id}>
        <div className="weekly-card-labels"><span className={`weekly-match match-${matchOrder[candidate.match]}`}><Sparkles size={12} />{candidate.match}</span><span className={candidate.publication === '预印本' ? 'weekly-preprint' : 'weekly-journal'}>{candidate.publication === '预印本' ? '预印本 · 未经同行评议' : '期刊论文'}</span><span>{candidate.kind === 'initial' ? '项目初筛 · 历史文献' : `${dateLabel(candidate.weekOf)} 周筛选`}</span>{candidate.status === 'accepted' && <span className="weekly-accepted"><CheckCheck size={13} />已入库</span>}</div>
        <h2>{candidate.title}</h2><div className="weekly-citation"><span>{candidate.authors}</span><span>{candidate.journal} · 发表于 {dateLabel(candidate.publishedDate)}</span></div>
        {candidate.dateNote && <p className="weekly-date-note">{candidate.dateNote}</p>}
        <div className="weekly-card-body"><div><h3>这篇研究做了什么</h3><p>{candidate.summary}</p></div><div className="weekly-relevance"><h3><Sparkles size={14} />为什么与你的项目有关</h3><p>{candidate.relevance}</p><div className="weekly-tags">{candidate.tags.map((tag, i) => <span key={i}>{tag}</span>)}</div></div></div>
        <details className="weekly-evidence"><summary>{candidate.verification} · 查看证据边界与标识</summary><p>{candidate.caveat}</p>{candidate.doi && <p>DOI：{candidate.doi}</p>}{candidate.pmid && <p>PMID：{candidate.pmid}</p>}<p>建议研究模块：{candidate.module}</p></details>
        <footer><div className="weekly-sources">{candidate.sources.map((source, i) => <button key={i} title={source.url} onClick={() => openSource(source.url)}><ExternalLink size={13} />{source.label}</button>)}</div><div className="weekly-actions">
          {candidate.status === 'pending' && <><button className="weekly-dismiss" disabled={!!busyId} onClick={() => act(candidate, 'dismiss')}><X size={14} />暂不收录</button><button className="button primary" disabled={!!busyId} onClick={() => act(candidate, 'accept')}><Plus size={16} />{busyId === candidate.id ? '正在保存…' : '加入文献库'}</button></>}
          {candidate.status === 'dismissed' && <button className="button secondary" disabled={!!busyId} onClick={() => act(candidate, 'restore')}><RotateCcw size={14} />放回待筛选</button>}
          {candidate.status === 'accepted' && paper && <>{!paper.pdf && <button className="button secondary" onClick={() => onImport(paper.id)}><Plus size={14} />导入 PDF</button>}<button className="button primary" onClick={() => open(paper)}>打开文献<ArrowRight size={15} /></button></>}
        </div></footer>
      </article>;
    })}</div>
    {!filtered.length && <div className="weekly-empty">{query || week !== 'all' || match !== 'all' ? <Search size={34} /> : status === 'pending' && candidates.length ? <Check size={34} /> : <Inbox size={34} />}<h2>{query || week !== 'all' || match !== 'all' ? '没有符合当前筛选条件的论文' : status === 'pending' ? latest ? latest.addedCount ? '这一批已经看完了' : '本次没有新的候选论文' : '等待第一批新论文' : status === 'accepted' ? '你选中的论文会留在这里' : '暂不收录的论文会留在这里'}</h2><p>{query || week !== 'all' || match !== 'all' ? '换一个关键词、周次或相关性，看看其他候选。' : status === 'pending' ? latest ? '下一次筛选完成后，新候选会自动进入这个栏目。也可以查看已入库或暂不收录的论文。' : '每周一筛选完成后自动接收。刷新收件箱会接收已完成的筛选结果。' : status === 'accepted' ? '在“待筛选”中点击“加入文献库”，即可继续导入 PDF、阅读和记笔记。' : '暂不感兴趣也没有关系，之后可以放回待筛选。'}</p>{(query || week !== 'all' || match !== 'all') && <button className="button secondary" onClick={() => { setQuery(''); setWeek('all'); setMatch('all'); }}>清除筛选</button>}</div>}
  </div></div>;
}
