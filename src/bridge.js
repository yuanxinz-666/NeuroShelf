import { get, set } from 'idb-keyval';
import seed from '../data/library.json';

const clone = value => structuredClone(value);
const KEY = 'neuroshelf:preview:library:v1';
let cached, queue = Promise.resolve();
function serial(action) { const result = queue.then(action); queue = result.catch(() => {}); return result; }
async function loadPreview() { if (!cached) cached = await get(KEY) || clone(seed); return clone(cached); }
async function updatePreview(id, patch) {
  return serial(async () => {
    await loadPreview();
    const next = clone(cached), paper = next.papers.find(p => p.id === id);
    if (!paper) throw new Error('未找到论文。');
    Object.assign(paper, patch, { updatedAt: new Date().toISOString() });
    await set(KEY, next); cached = next;
    return clone(paper);
  });
}
export const api = window.neuroshelf || {
  desktop: false,
  projects: async () => ({ activeId: 'sc-snr', root: '', projects: [{ id: 'sc-snr', name: 'SC–SNr', question: 'SNr 如何调节上丘的感觉运动选择？', keywords: ['superior colliculus', 'SNr', 'Pitx2'], weeklyEnabled: false, directory: 'Windows 桌面版中查看' }] }),
  createProject: async () => { throw new Error('请在 Windows 桌面版创建项目。'); },
  updateProject: async () => { throw new Error('请在 Windows 桌面版编辑项目。'); },
  switchProject: async () => { throw new Error('请在 Windows 桌面版切换项目。'); },
  openProject: async () => { throw new Error('请在 Windows 桌面版打开项目文件夹。'); },
  startResearch: async () => { throw new Error('请在 Windows 桌面版连接 Codex 会员开始调研。'); },
  startPiResearch: async () => { throw new Error('请在 Windows 桌面版更新 PI 档案。'); },
  importJournalRankings: async () => { throw new Error('请在 Windows 桌面版导入期刊分区。'); },
  updatePerson: async () => { throw new Error('请在 Windows 桌面版关注 PI。'); },

  weeklySync: async () => ({ weekly: (await loadPreview()).weekly || { version: 1, candidates: [], batches: [] }, added: 0, errors: [], schedule: null }),
  weeklyDecide: async () => { throw new Error('请在 Windows 桌面版中筛选和收录每周论文。'); },
  load: loadPreview, update: updatePreview,
  changeExperiment: async () => { throw new Error('请在 Windows 桌面版记录实验进程。'); },
  importEvidence: async () => { throw new Error('请在 Windows 桌面版添加实验证据图片。'); },
  readEvidence: async () => { throw new Error('请在 Windows 桌面版查看实验证据图片。'); },
  mutateHighlight(id, { action, highlightId, value = {} }) {
    return serial(async () => {
      await loadPreview();
      const next = clone(cached), paper = next.papers.find(p => p.id === id);
      if (!paper) throw new Error('未找到论文。');
      const highlights = paper.highlights || [], index = highlights.findIndex(h => h.id === highlightId);
      if (action === 'add') {
        if (index >= 0) throw new Error('高亮已存在。');
        highlights.push({ ...value, id: highlightId, createdAt: new Date().toISOString() });
      } else if (index < 0) throw new Error('这条高亮已删除。');
      else if (action === 'remove') highlights.splice(index, 1);
      else if (action === 'update') highlights[index] = { ...highlights[index], ...value, updatedAt: new Date().toISOString() };
      paper.highlights = highlights; paper.updatedAt = new Date().toISOString();
      await set(KEY, next); cached = next; return clone(paper);
    });
  },
  async readPdf(id) {
    const paper = (await loadPreview()).papers.find(p => p.id === id);
    const bytes = await get('neuroshelf:pdf:' + paper?.pdf?.hash);
    if (!bytes) throw new Error('请重新导入 PDF。');
    return new Uint8Array(bytes);
  },
  importPdf(payload) { return serial(async () => {
    await loadPreview();
    const bytes = new Uint8Array(payload.bytes);
    if (!bytes.length || bytes.length > 104857600 || !new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-')) throw new Error('请选择有效 PDF，单个文件不超过 100 MB。');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
    const duplicate = cached.papers.find(p => p.pdf?.hash === hash);
    if (!payload.id && duplicate) return { paper: clone(duplicate), duplicate: true };
    const next = clone(cached); let paper = next.papers.find(p => p.id === payload.id);
    if (!paper) { paper = { id: 'u_' + crypto.randomUUID(), rank: next.papers.length + 1, title: payload.title || payload.name.replace(/\.pdf$/i, ''), authors: '', journal: '', module: '我的导入', publication: '个人导入', status: 'unread', page: 1, note: '', tags: '', highlights: [], messages: [] }; next.papers.push(paper); }
    if (paper.pdf && paper.pdf.hash !== hash) throw new Error('此论文已有 PDF，请先解除关联。');
    await set('neuroshelf:pdf:' + hash, bytes.buffer);
    paper.pdf = { hash, storedName: hash + '.pdf', fileName: payload.name, bytes: bytes.length, addedAt: new Date().toISOString() }; paper.updatedAt = new Date().toISOString();
    await set(KEY, next); cached = next;
    return { paper: clone(paper), duplicate: !!duplicate };
  }); },
  detachPdf: id => updatePreview(id, { pdf: null, page: 1 }),
  settings: async () => ({ provider: 'clipboard', model: 'gpt-6-astra', effort: 'medium', hasKey: false, desktop: false, codex: { checked: true, connected: false, models: [] } }),
  codexStatus: async () => { throw new Error('请在 Windows 桌面版中连接 Codex 会员。'); },
  codexLogin: async () => { throw new Error('请在 Windows 桌面版中登录。'); },
  saveSettings: async () => { throw new Error('请在 Windows 桌面版中设置 AI。'); },
  openExternal: async url => { if (url.startsWith('https://')) window.open(url, '_blank', 'noopener,noreferrer'); },
  copyText: text => navigator.clipboard.writeText(text),
  openData: async () => { throw new Error('浏览器预览的数据保存在此浏览器中，请在桌面版打开资料目录。'); },
  backup: async () => { throw new Error('完整备份（含 PDF）请使用 Windows 桌面版。'); },
  restore: async () => { throw new Error('完整备份恢复请使用 Windows 桌面版。'); },
  importLegacy: async () => { throw new Error('旧网页笔记迁移请使用 Windows 桌面版。'); },
  ask: async () => { throw new Error('请打开 Windows 桌面版并连接 OpenAI API，或复制上下文到 ChatGPT。'); },
  cancelAsk: async () => {}, onAiEvent: () => () => {},
};
export function downloadText(name, content, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
