const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(value);
const imageName = value => typeof value === 'string' && /^[a-f0-9]{64}\.(png|jpg|webp)$/.test(value);
const statuses = new Set(['planned', 'active', 'done', 'blocked']);
const emptyExperiments = () => ({ version: 1, nodes: [] });
const textLimits = { title: 180, objective: 10000, record: 100000, nextStep: 10000 };
function validateExperiments(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.nodes) || data.nodes.length > 600) throw new Error('实验记录格式无效，最多支持 600 个步骤。');
  const byId = new Map();
  for (const node of data.nodes) {
    if (!validId(node.id) || byId.has(node.id)) throw new Error('实验步骤编号无效或重复。');
    byId.set(node.id, node);
    if (!statuses.has(node.status) || typeof node.archived !== 'boolean') throw new Error('实验状态无效。');
    for (const [key, limit] of Object.entries(textLimits)) if (typeof node[key] !== 'string' || node[key].length > limit) throw new Error('实验文字格式无效或过长。');
    if (!node.title.trim()) throw new Error('请给实验步骤填写名称。');
    if (typeof node.date !== 'string' || node.date && (!/^\d{4}-\d{2}-\d{2}$/.test(node.date) || !Number.isFinite(Date.parse(node.date)) || new Date(node.date).toISOString().slice(0, 10) !== node.date)) throw new Error('实验日期无效。');
    if (!Number.isFinite(Date.parse(node.createdAt)) || !Number.isFinite(Date.parse(node.updatedAt))) throw new Error('实验记录时间无效。');
    if (node.archived && !validId(node.archiveRoot)) throw new Error('实验归档记录无效。');
    if (!Array.isArray(node.evidence) || node.evidence.length > 60) throw new Error('每个步骤最多添加 60 张图片。');
    const ids = new Set();
    for (const item of node.evidence) {
      if (!validId(item.id) || ids.has(item.id) || !imageName(item.storedName)) throw new Error('实验图片路径或编号无效。');
      ids.add(item.id);
      if (typeof item.fileName !== 'string' || item.fileName.length > 250 || typeof item.caption !== 'string' || item.caption.length > 5000 || !Number.isInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_IMAGE_BYTES) throw new Error('实验图片记录无效。');
    }
  }
  for (const node of data.nodes) {
    if (node.archived && (!byId.get(node.archiveRoot)?.archived || byId.get(node.archiveRoot)?.archiveRoot !== node.archiveRoot)) throw new Error('实验归档分支不存在。');
    const seen = new Set([node.id]); let current = node;
    while (current.parentId !== null) {
      const parent = byId.get(current.parentId);
      if (!parent) throw new Error('实验步骤的上级不存在。');
      if (seen.has(parent.id)) throw new Error('不能将实验移动到自己或自己的子步骤下。');
      seen.add(parent.id);
      if (seen.size > 12) throw new Error('实验分支最多支持 12 层。');
      if (!node.archived && parent.archived) throw new Error('请先恢复上级实验步骤。');
      current = parent;
    }
  }
  return data;
}
function verifyImage(bytes) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('图片不能为空，单张不能超过 20 MB。');
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') return 'png';
  if (bytes.length > 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.length > 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new Error('请选择 PNG、JPEG 或 WebP 图片；其他格式请先导出为 PNG。');
}
function find(data, id) {
  const node = data.nodes.find(n => n.id === id);
  if (!node) throw new Error('未找到这条实验记录。');
  return node;
}
function descendants(data, id) {
  const ids = new Set([id]); let changed = true;
  while (changed) { changed = false; for (const n of data.nodes) if (ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); changed = true; } }
  return ids;
}
function mutate(data, change) {
  if (!change || typeof change !== 'object') throw new Error('实验操作无效。');
  const now = new Date().toISOString(); let selectedId = change.id;
  if (change.action === 'add') {
    selectedId = 'exp_' + crypto.randomUUID();
    data.nodes.push({ id: selectedId, parentId: change.parentId ?? null, title: change.title || '新的实验步骤', status: 'planned', objective: '', record: '', nextStep: '', date: '', evidence: [], archived: false, createdAt: now, updatedAt: now });
  } else {
    const node = find(data, change.id);
    if (change.action === 'update') {
      if (node.archived) throw new Error('请先恢复这条实验记录。');
      const patch = change.patch;
      if (!patch || typeof patch !== 'object' || Object.keys(patch).some(k => ![...Object.keys(textLimits), 'status', 'date', 'parentId'].includes(k))) throw new Error('实验编辑内容无效。');
      Object.assign(node, patch);
    } else if (change.action === 'archive') {
      if (node.archived) throw new Error('这条实验分支已经归档。');
      const branch = descendants(data, node.id);
      for (const n of data.nodes) if (branch.has(n.id) && !n.archived) Object.assign(n, { archived: true, archiveRoot: node.id, updatedAt: now });
    } else if (change.action === 'restore') {
      for (const n of data.nodes) if (n.archiveRoot === node.id) { n.archived = false; delete n.archiveRoot; n.updatedAt = now; }
      if (node.parentId && find(data, node.parentId).archived) node.parentId = null;
    } else if (change.action === 'caption') {
      if (node.archived) throw new Error('请先恢复这条实验记录。');
      const item = node.evidence.find(e => e.id === change.evidenceId);
      if (!item || typeof change.caption !== 'string') throw new Error('未找到这张证据图片。');
      item.caption = change.caption;
    } else if (change.action === 'detach') {
      if (node.archived) throw new Error('请先恢复这条实验记录。');
      if (!node.evidence.some(e => e.id === change.evidenceId)) throw new Error('未找到这张证据图片。');
      node.evidence = node.evidence.filter(e => e.id !== change.evidenceId);
    } else throw new Error('实验操作无效。');
    node.updatedAt = now;
  }
  validateExperiments(data);
  return selectedId;
}
function mergeExperiments(local, incoming) {
  const data = structuredClone(local || emptyExperiments());
  for (const node of incoming?.nodes || []) {
    const index = data.nodes.findIndex(n => n.id === node.id);
    if (index < 0) data.nodes.push(structuredClone(node));
    else if (Date.parse(node.updatedAt) > Date.parse(data.nodes[index].updatedAt)) data.nodes[index] = structuredClone(node);
  }
  // A conflicting pair of moves must not silently create a cycle or discard records.
  return validateExperiments(data);
}
const evidenceFiles = data => [...new Set((data?.nodes || []).flatMap(n => n.evidence.map(e => e.storedName)))];
function installExperimentMethods(LibraryStore) {
  LibraryStore.prototype.changeExperiment = function(change) {
    return this.enqueue(async () => {
      const next = this.get(); next.experiments ||= emptyExperiments();
      const selectedId = mutate(next.experiments, change);
      await this.commit(next); return { experiments: structuredClone(next.experiments), selectedId };
    });
  };
  LibraryStore.prototype.importEvidence = function({ nodeId, name, bytes }) {
    const buffer = Buffer.from(bytes), extension = verifyImage(buffer);
    return this.enqueue(async () => {
      const next = this.get(), node = find(next.experiments || emptyExperiments(), nodeId);
      if (node.archived) throw new Error('请先恢复这条实验记录。');
      const storedName = crypto.createHash('sha256').update(buffer).digest('hex') + '.' + extension;
      const existing = node.evidence.find(e => e.storedName === storedName);
      if (existing) return { experiments: next.experiments, selectedId: nodeId, duplicate: true };
      node.evidence.push({ id: 'img_' + crypto.randomUUID(), storedName, fileName: path.basename(String(name || '截图.' + extension)).slice(0, 250), caption: '', bytes: buffer.length, createdAt: new Date().toISOString() });
      node.updatedAt = new Date().toISOString(); validateExperiments(next.experiments);
      await fs.mkdir(path.join(this.directory, 'evidence'), { recursive: true });
      await fs.writeFile(path.join(this.directory, 'evidence', storedName), buffer, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
      await this.commit(next); return { experiments: structuredClone(next.experiments), selectedId: nodeId };
    });
  };
  LibraryStore.prototype.readEvidence = async function(nodeId, evidenceId) {
    const node = find(this.library.experiments || emptyExperiments(), nodeId);
    const item = node.evidence.find(e => e.id === evidenceId);
    if (!item || !imageName(item.storedName)) throw new Error('未找到这张证据图片。');
    try { return await fs.readFile(path.join(this.directory, 'evidence', item.storedName)); }
    catch { throw new Error('证据图片无法读取，请从完整备份恢复。'); }
  };
}
module.exports = { emptyExperiments, validateExperiments, mergeExperiments, verifyImage, evidenceFiles, installExperimentMethods, MAX_IMAGE_BYTES };
