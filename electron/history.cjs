const { AsyncLocalStorage } = require('node:async_hooks');
const { isDeepStrictEqual: equal } = require('node:util');
const scope = new AsyncLocalStorage();
const copy = value => structuredClone(value);
const paperFields = ['title', 'authors', 'journal', 'status', 'starred', 'note', 'personalReview', 'tags'];
const nodeFields = ['title', 'progress', 'objective', 'record', 'nextStep', 'date', 'status', 'parentId', 'archived', 'archiveRoot'];
function comparable(value) {
  if (!value || typeof value !== 'object') return value;
  const result = copy(value); delete result.updatedAt; return result;
}
function changesBetween(before, after) {
  const changes = [];
  const fields = (kind, id, a, b, keys, parentId) => {
    for (const field of keys) if (!equal(a[field], b[field])) changes.push({ kind, id, parentId, field, before: copy(a[field]), after: copy(b[field]) });
  };
  const entities = (kind, a = [], b = [], keys, parentId) => {
    const previous = new Map(a.map(item => [item.id, item])), current = new Map(b.map(item => [item.id, item]));
    for (const id of new Set([...previous.keys(), ...current.keys()])) {
      const old = previous.get(id), next = current.get(id);
      if (!old || !next) changes.push({ kind, id, parentId, before: copy(old), after: copy(next) });
      else fields(kind, id, old, next, keys, parentId);
    }
  };
  for (const a of before.papers) {
    const b = after.papers.find(p => p.id === a.id); if (!b) continue;
    fields('paper', a.id, a, b, paperFields);
    entities('highlight', a.highlights, b.highlights, ['color', 'comment'], a.id);
  }
  entities('experiment', before.experiments?.nodes, after.experiments?.nodes, nodeFields);
  for (const a of before.experiments?.nodes || []) {
    const b = after.experiments?.nodes.find(n => n.id === a.id); if (b) entities('evidence', a.evidence, b.evidence, ['caption'], a.id);
  }
  // Research can refresh the other profile fields independently of personal follows and notes.
  for (const a of before.people?.profiles || []) {
    const b = after.people?.profiles.find(p => p.id === a.id); if (b) fields('person', a.id, a, b, ['followed', 'note']);
  }
  return changes;
}
function collection(library, change) {
  if (change.kind === 'paper') return library.papers;
  if (change.kind === 'person') return library.people?.profiles;
  if (change.kind === 'experiment') { library.experiments ||= { version: 1, nodes: [] }; return library.experiments.nodes; }
  if (change.kind === 'highlight') { const parent = library.papers.find(p => p.id === change.parentId); if (parent) return parent.highlights ||= []; }
  if (change.kind === 'evidence') return library.experiments?.nodes.find(n => n.id === change.parentId)?.evidence;
}
function applyChanges(library, changes, direction) {
  const next = copy(library), expected = direction === 'undo' ? 'after' : 'before', desired = direction === 'undo' ? 'before' : 'after';
  const ordered = direction === 'undo' ? [...changes].reverse() : changes;
  for (const change of ordered) {
    const list = collection(next, change); if (!list) throw Error('相关记录已改变，无法安全撤销或重做。');
    const index = list.findIndex(item => item.id === change.id), current = list[index];
    const value = change.field ? current?.[change.field] : comparable(current);
    const expectation = change.field ? change[expected] : comparable(change[expected]);
    if (!equal(value, expectation) || change.field && !current) throw Error('相关记录已改变，无法安全撤销或重做。');
    if (change.field) {
      if (change[desired] === undefined) delete current[change.field]; else current[change.field] = copy(change[desired]);
      current.updatedAt = new Date().toISOString();
    } else if (change[desired] === undefined) list.splice(index, 1);
    else if (index < 0) list.push({ ...copy(change[desired]), updatedAt: new Date().toISOString() });
    else list[index] = { ...copy(change[desired]), updatedAt: new Date().toISOString() };
    const parent = change.kind === 'highlight' ? next.papers.find(p => p.id === change.parentId) : change.kind === 'evidence' ? next.experiments.nodes.find(n => n.id === change.parentId) : null;
    if (parent) parent.updatedAt = new Date().toISOString();
  }
  return next;
}
class EditHistory {
  constructor() { this.undoStack = []; this.redoStack = []; }
  record(before, after, group) {
    const changes = changesBetween(before, after); if (!changes.length) return;
    const now = Date.now(), previous = this.undoStack.at(-1);
    const textFields = ['title','authors','journal','note','personalReview','tags','comment','caption','progress','objective','record','nextStep'];
    const sameFields = previous && !this.redoStack.length && changes.every(c => textFields.includes(c.field)) && previous.changes.length === changes.length && changes.every((c,i) => equal(c.before,previous.changes[i].after) && ['kind','id','parentId','field'].every(k => c[k] === previous.changes[i][k]));
    if (sameFields && previous.group === group && now - previous.at < 1800) {
      previous.changes = changes.map((c,i) => ({ ...c, before: previous.changes[i].before })); previous.at = now;
    } else this.undoStack.push({ changes, group, at: now });
    this.redoStack = []; if (this.undoStack.length > 100) this.undoStack.shift();
  }
  state() { return { canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 }; }
}
function userEdit(store, group, action) { return scope.run({ store, group }, action); }
function recordEdit(store, before, after) {
  const context = scope.getStore(); if (context?.store !== store) return;
  store.editHistory ||= new EditHistory(); store.editHistory.record(before, after, context.group);
}
function installHistory(LibraryStore, validateLibrary) {
  LibraryStore.prototype.historyAction = function(direction) {
    if (!['undo', 'redo'].includes(direction)) return Promise.reject(Error('撤销操作无效。'));
    return this.enqueue(async () => {
      this.editHistory ||= new EditHistory();
      const from = direction === 'undo' ? this.editHistory.undoStack : this.editHistory.redoStack, to = direction === 'undo' ? this.editHistory.redoStack : this.editHistory.undoStack;
      const entry = from.at(-1); if (!entry) return { changed: false, ...this.editHistory.state(), library: this.get() };
      const next = validateLibrary(applyChanges(this.get(), entry.changes, direction));
      await this.commit(next); from.pop(); to.push(entry);
      for (const stack of [this.editHistory.undoStack,this.editHistory.redoStack]) if (stack.length) stack.at(-1).at = 0;
      return { changed: true, ...this.editHistory.state(), library: this.get() };
    });
  };
}
module.exports = { userEdit, recordEdit, installHistory, changesBetween, applyChanges };
