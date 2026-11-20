/* Web uygulamasına yalnızca gereken küçük köprü: sürüm bilgisi ve güncelleme denetimi */
const { contextBridge, ipcRenderer } = require('electron');
const argOf = k => (process.argv.find(a => a.startsWith(`--tb-${k}=`)) || '').split('=')[1] || '';
contextBridge.exposeInMainWorld('tbDesktop', {
  version: argOf('version'),
  platform: argOf('platform'),   // 'win32' | 'darwin'
  openReleases: () => ipcRenderer.send('tb:releases'),
  checkUpdates: () => ipcRenderer.invoke('tb:check-updates'),
  status: () => ipcRenderer.invoke('tb:status'),
  onUpdateStatus: cb => ipcRenderer.on('tb:update-status', (_e, m) => cb(m)),
  retry: () => ipcRenderer.send('tb:retry'),
});
