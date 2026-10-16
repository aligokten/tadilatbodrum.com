/* Web uygulamasına yalnızca gereken küçük köprü: sürüm bilgisi ve güncelleme denetimi */
const { contextBridge, ipcRenderer } = require('electron');
const arg = process.argv.find(a => a.startsWith('--tb-version='));
contextBridge.exposeInMainWorld('tbDesktop', {
  version: arg ? arg.split('=')[1] : '',
  checkUpdates: () => ipcRenderer.invoke('tb:check-updates'),
  status: () => ipcRenderer.invoke('tb:status'),
  onUpdateStatus: cb => ipcRenderer.on('tb:update-status', (_e, m) => cb(m)),
  retry: () => ipcRenderer.send('tb:retry'),
});
