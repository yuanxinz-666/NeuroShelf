const time = record => Date.parse(record?.updatedAt) || 0;

// IPC responses and background snapshots may arrive after a newer saved record.
// These collections retain records (experiments are archived rather than deleted).
export function mergeSavedRecords(incoming = [], current = []) {
  const records = new Map(incoming.map(record => [record.id, record]));
  for (const record of current) {
    const candidate = records.get(record.id);
    if (!candidate || time(record) > time(candidate)) records.set(record.id, record);
  }
  return [...records.values()];
}
export function receivePaper(library, paper) {
  if (!library) return library;
  const incoming = library.papers.some(p => p.id === paper.id) ? library.papers.map(p => p.id === paper.id ? paper : p) : [...library.papers, paper];
  return { ...library, papers: mergeSavedRecords(incoming, library.papers) };
}
export function receiveExperiments(current, incoming) {
  if (!incoming) return current;
  return { ...incoming, nodes: mergeSavedRecords(incoming.nodes, current?.nodes) };
}
export function receiveLibrary(current, incoming) {
  if (!current || current.projectId !== incoming.projectId) return incoming;
  return { ...incoming, papers: mergeSavedRecords(incoming.papers, current.papers), experiments: receiveExperiments(current.experiments, incoming.experiments) };
}
