const { contextBridge, ipcRenderer } = require('electron');
const projectId = ipcRenderer.sendSync('project:identity');
const call = channel => (...args) => ipcRenderer.invoke(channel, projectId, ...args);
contextBridge.exposeInMainWorld('neuroshelf', {
  desktop: true,
  weeklySync: call('weekly:sync'),
  weeklyDecide: call('weekly:decide'),
  projects: call('projects:list'), createProject: call('projects:create'), updateProject: call('projects:update'), switchProject: call('projects:activate'), openProject: call('projects:folder'), updatePerson: call('people:update'),
  researchStatus: call('research:status'), startResearch: call('research:start'), stopResearch: call('research:stop'),
  startPiResearch: call('people:research'),
  importJournalRankings: call('people:rankings'),
  load: call('library:load'), update: call('library:update'),
  mutateHighlight: call('library:highlight'),
  changeExperiment: call('experiments:change'), importEvidence: call('experiments:image-import'), readEvidence: call('experiments:image-read'),
  importPdf: call('pdf:import'), readPdf: call('pdf:read'), detachPdf: call('pdf:detach'),
  backup: call('backup:export'), restore: call('backup:restore'), importLegacy: call('backup:legacy'),
  settings: call('settings:get'), saveSettings: call('settings:save'),
  codexStatus: call('codex:status'), codexLogin: call('codex:login'),
  openExternal: call('external:open'), openData: call('data:open'), copyText: call('clipboard:write'),
  ask: call('ai:ask'), cancelAsk: call('ai:cancel'),
  onBeforeClose(callback) {
    const listener = async () => { try { await callback(); ipcRenderer.send('app:close-ready', true); } catch { ipcRenderer.send('app:close-ready', false); } };
    ipcRenderer.on('app:before-close', listener);
    return () => ipcRenderer.removeListener('app:before-close', listener);
  },
  onAiEvent(callback) {
    const listener = (_event, message) => { if (!message.projectId || message.projectId === projectId) callback(message); };
    ipcRenderer.on('ai:event', listener);
    return () => ipcRenderer.removeListener('ai:event', listener);
  },
});
