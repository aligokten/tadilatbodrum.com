/* ═══ TadilatBodrum Saha — Windows uygulaması ═══
 * Uygulama içeriği canlı siteden (kesif.tadilatbodrum.com) yüklenir: web'e yayınlanan her geliştirme
 * Windows uygulamasında da hemen geçerli olur, servis çalışanı sayesinde çevrimdışı da açılır.
 * Uygulamanın kendisi (bu kabuk) GitHub Releases üzerinden otomatik güncellenir.
 *
 * Program lisans sahibi: Sinem Ali Gökten Grup İnşaat Mimarlık Akustik Müh. San. Tic. Ltd. Şti.
 * Program geliştirici: SAGG+ App — www.saggplus.com — info@saggplus.com
 * Tüm hakları saklıdır.
 */
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const LIC = require('./license.json');

const SITES = ['https://kesif.tadilatbodrum.com/', 'https://tadilatbodrum-kesif.web.app/'];
const ORIGINS = SITES.map(u => new URL(u).origin);
const UPDATE_EVERY = 4 * 60 * 60 * 1000;   // 4 saatte bir kabuk güncellemesi denetle

app.setAppUserModelId('com.saggplus.tadilatbodrum.saha');
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, siteIdx = 0, manualCheck = false, updateReady = null;

/* ── pencere konumu/boyutu hatırlansın ── */
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return { width: 1400, height: 900 }; } }
function saveState() {
  if (!win || win.isDestroyed()) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() })); } catch { /* yok say */ }
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1400, height: st.height || 900, minWidth: 380, minHeight: 560,
    title: 'TadilatBodrum Saha', icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#F5F6F7', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true, additionalArguments: ['--tb-version=' + app.getVersion()] },
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveState);
  win.webContents.session.setSpellCheckerLanguages(['tr-TR']);

  // site dışı bağlantılar varsayılan tarayıcıda açılsın
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return { action: 'allow' };
    if (/^(https?|mailto|tel):/.test(url) && !ORIGINS.includes(safeOrigin(url))) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') || ORIGINS.includes(safeOrigin(url))) return;
    e.preventDefault(); shell.openExternal(url);
  });
  // bağlantı yoksa ve önbellekte de yoksa: yedek adresi dene, olmazsa çevrimdışı sayfası
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return;   // -3: iptal (yönlendirme)
    if (url.startsWith('file:')) return;
    if (siteIdx < SITES.length - 1) { siteIdx++; win.loadURL(SITES[siteIdx]); return; }
    win.loadFile(path.join(__dirname, 'offline.html'));
  });
  win.loadURL(SITES[siteIdx]);
}
const safeOrigin = u => { try { return new URL(u).origin; } catch { return ''; } };

/* ── menü ── */
function buildMenu() {
  const tpl = [
    { label: 'Dosya', submenu: [
      { label: 'Yenile', accelerator: 'F5', click: () => win?.webContents.reload() },
      { label: 'Önbelleği temizle ve yenile', accelerator: 'Ctrl+F5', click: async () => {
        await session.defaultSession.clearCache(); win?.webContents.reloadIgnoringCache();
      } },
      { type: 'separator' },
      { label: 'Yazdır…', accelerator: 'Ctrl+P', click: () => win?.webContents.print() },
      { type: 'separator' },
      { label: 'Çıkış', role: 'quit' },
    ] },
    { label: 'Düzen', submenu: [
      // kısayollar sayfaya bırakılır: rölöve editörü Ctrl+Z/Y/X/C/V/A ile kendi geri al / kopyala / yapıştır işlemlerini yapar
      { label: 'Geri al', role: 'undo', accelerator: 'Ctrl+Z', registerAccelerator: false },
      { label: 'Yinele', role: 'redo', accelerator: 'Ctrl+Y', registerAccelerator: false }, { type: 'separator' },
      { label: 'Kes', role: 'cut', accelerator: 'Ctrl+X', registerAccelerator: false },
      { label: 'Kopyala', role: 'copy', accelerator: 'Ctrl+C', registerAccelerator: false },
      { label: 'Yapıştır', role: 'paste', accelerator: 'Ctrl+V', registerAccelerator: false },
      { label: 'Tümünü seç', role: 'selectAll', accelerator: 'Ctrl+A', registerAccelerator: false },
    ] },
    { label: 'Görünüm', submenu: [
      { label: 'Yakınlaştır', role: 'zoomIn', accelerator: 'Ctrl+=' }, { label: 'Uzaklaştır', role: 'zoomOut' }, { label: 'Gerçek boyut', role: 'resetZoom' },
      { type: 'separator' }, { label: 'Tam ekran', role: 'togglefullscreen' },
      { type: 'separator' }, { label: 'Geliştirici araçları', role: 'toggleDevTools', accelerator: 'Ctrl+Shift+I' },
    ] },
    { label: 'Yardım', submenu: [
      { label: 'Güncellemeleri denetle', click: () => checkUpdates(true) },
      { type: 'separator' },
      { label: 'www.saggplus.com', click: () => shell.openExternal(LIC.web) },
      { label: 'E-posta: ' + LIC.email, click: () => shell.openExternal('mailto:' + LIC.email) },
      { type: 'separator' },
      { label: 'Hakkında', click: about },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function about() {
  dialog.showMessageBox(win, {
    type: 'info', title: 'Hakkında', icon: path.join(__dirname, 'build', 'icon.png'),
    message: `TadilatBodrum Saha ${app.getVersion()}`,
    detail: `Program lisans sahibi:\n${LIC.owner}\n\nProgram geliştirici: ${LIC.developer}\n\n© ${new Date().getFullYear()} ${LIC.owner}\nTüm hakları saklıdır.\n\n${LIC.web.replace('https://', '')} - ${LIC.email}`,
    buttons: ['Tamam'],
  });
}

/* ── otomatik güncelleme (uygulama kabuğu) ── */
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-available', i => send(`Yeni sürüm ${i.version} indiriliyor…`));
autoUpdater.on('update-not-available', () => {
  send('Uygulama güncel.');
  if (manualCheck) dialog.showMessageBox(win, { type: 'info', title: 'Güncelleme', message: 'TadilatBodrum Saha güncel.', detail: `Kurulu sürüm: ${app.getVersion()}` });
  manualCheck = false;
});
autoUpdater.on('download-progress', p => { send(`Yeni sürüm indiriliyor… %${Math.round(p.percent)}`); win?.setProgressBar(p.percent / 100); });
autoUpdater.on('update-downloaded', async i => {
  win?.setProgressBar(-1);
  updateReady = i.version;
  send(`Sürüm ${i.version} hazır — yeniden başlatınca kurulacak.`);
  const r = await dialog.showMessageBox(win, {
    type: 'info', title: 'Güncelleme hazır', buttons: ['Şimdi yeniden başlat', 'Sonra'], defaultId: 0, cancelId: 1,
    message: `TadilatBodrum Saha ${i.version} indirildi.`,
    detail: 'Uygulama yeniden başlatılıp yeni sürüm kurulsun mu? "Sonra" derseniz uygulamayı kapattığınızda kurulur.',
  });
  if (r.response === 0) { saveState(); autoUpdater.quitAndInstall(false, true); }
});
autoUpdater.on('error', e => {
  win?.setProgressBar(-1);
  send('Güncelleme denetlenemedi.');
  if (manualCheck) dialog.showMessageBox(win, { type: 'warning', title: 'Güncelleme', message: 'Güncelleme denetlenemedi.', detail: String(e?.message || e).slice(0, 400) });
  manualCheck = false;
});
const send = msg => { lastStatus = msg; win?.webContents.send('tb:update-status', msg); };
let lastStatus = '';

function checkUpdates(manual = false) {
  if (!app.isPackaged) { if (manual) dialog.showMessageBox(win, { message: 'Geliştirme modunda güncelleme denetlenmez.' }); return Promise.resolve('Geliştirme modu'); }
  if (updateReady) {
    if (manual) autoUpdater.emit('update-downloaded', { version: updateReady });
    return Promise.resolve(`Sürüm ${updateReady} hazır — yeniden başlatınca kurulacak.`);
  }
  manualCheck = manual;
  return autoUpdater.checkForUpdates()
    .then(r => r?.updateInfo && r.updateInfo.version !== app.getVersion() ? `Yeni sürüm ${r.updateInfo.version} indiriliyor…` : 'Uygulama güncel.')
    .catch(e => { throw new Error(String(e?.message || e).slice(0, 200)); });
}

ipcMain.handle('tb:check-updates', () => checkUpdates(false));
ipcMain.handle('tb:status', () => lastStatus);
ipcMain.on('tb:retry', () => { siteIdx = 0; win?.loadURL(SITES[0]); });

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  setTimeout(() => checkUpdates(false).catch(() => {}), 8000);
  setInterval(() => checkUpdates(false).catch(() => {}), UPDATE_EVERY);
});
app.on('window-all-closed', () => app.quit());
