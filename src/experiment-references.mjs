export function experimentBranch(nodes, id) {
  const ids = new Set([id]); let changed = true;
  while (changed) { changed = false; for (const node of nodes) if (!node.archived && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); changed = true; } }
  return ids;
}
export function experimentPath(nodes, id) {
  const titles = [], seen = new Set(); let node = nodes.find(n => n.id === id);
  while (node && !seen.has(node.id)) { titles.unshift(node.title); seen.add(node.id); node = nodes.find(n => n.id === node.parentId); }
  return titles.join(' / ');
}
export function paperExperimentLinks(nodes, paperId) {
  return nodes.filter(n => !n.archived).flatMap(node => (node.references || []).filter(ref => ref.paperId === paperId).map(ref => ({ node, ref })));
}
export function indexExperimentReferences(nodes) {
  const active = new Map(nodes.filter(n => !n.archived).map(n => [n.id, n])), linksByPaper = new Map(), papersByExperiment = new Map(), ancestors = new Map();
  for (const node of active.values()) {
    const parents = new Set(); let current = node;
    while (current && !parents.has(current.id)) { parents.add(current.id); current = active.get(current.parentId); }
    ancestors.set(node.id, parents);
    for (const ref of node.references || []) {
      if (!linksByPaper.has(ref.paperId)) linksByPaper.set(ref.paperId, []);
      linksByPaper.get(ref.paperId).push({ node, ref });
      for (const id of parents) { if (!papersByExperiment.has(id)) papersByExperiment.set(id, new Set()); papersByExperiment.get(id).add(ref.paperId); }
    }
  }
  return { linksByPaper, papersByExperiment, ancestors };
}
export function matchesIndexedExperiment(index, paperId, experiment = '', role = '') {
  const links = index.linksByPaper.get(paperId) || [];
  if (experiment === 'unassigned') return !links.length;
  return !experiment && !role || links.some(({ node, ref }) => (!experiment || index.ancestors.get(node.id)?.has(experiment)) && (!role || ref.roles.includes(role)));
}
export const matchesExperiment = (nodes, paperId, experiment = '', role = '') => matchesIndexedExperiment(indexExperimentReferences(nodes), paperId, experiment, role);
