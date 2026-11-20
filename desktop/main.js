/* ═══ TadilatBodrum Saha — Windows / macOS uygulaması ═══
 * Uygulama içeriği canlı siteden (kesif.tadilatbodrum.com) yüklenir: web'e yayınlanan her geliştirme
 * Windows uygulamasında da hemen geçerli olur, servis çalışanı sayesinde çevrimdışı da açılır.
 * Uygulamanın kendisi (bu kabuk) GitHub Releases üzerinden güncellenir: Windows'ta otomatik indirilip kurulur;
 * macOS'ta (Apple geliştirici imzası olmadığından otomatik kurulum yapılamaz) yeni sürüm bildirilir, indirme sayfası açılır.
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
const MAC = process.platform === 'darwin';
const RELEASES = 'https://github.com/aligokten/tadilatbodrum.com/releases/latest';
const K = k => (MAC ? 'Cmd+' : 'Ctrl+') + k;   // menü kısayolları

if (!MAC) app.setAppUserModelId('com.saggplus.tadilatbodrum.saha');
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true, additionalArguments: ['--tb-version=' + app.getVersion(), '--tb-platform=' + process.platform] },
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveState);
  win.on('closed', () => { win = null; });
  if (!MAC) win.webContents.session.setSpellCheckerLanguages(['tr-TR']);   // macOS sistem yazım denetimini kullanır

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
  const reloadAll = async () => { await session.defaultSession.clearCache(); win?.webContents.reloadIgnoringCache(); };
  const tpl = [
    // macOS: uygulama menüsü (Hakkında, güncelleme, gizle, çık)
    ...(MAC ? [{ label: app.name, submenu: [
      { label: 'TadilatBodrum Saha Hakkında', click: about },
      { label: 'Güncellemeleri denetle…', click: () => checkUpdates(true) },
      { type: 'separator' },
      { label: 'Servisler', role: 'services' },
      { type: 'separator' },
      { label: 'TadilatBodrum Saha’yı gizle', role: 'hide' },
      { label: 'Diğerlerini gizle', role: 'hideOthers' },
      { label: 'Tümünü göster', role: 'unhide' },
      { type: 'separator' },
      { label: 'TadilatBodrum Saha’dan çık', role: 'quit' },
    ] }] : []),
    { label: 'Dosya', submenu: [
      { label: 'Yenile', accelerator: MAC ? 'Cmd+R' : 'F5', click: () => win?.webContents.reload() },
      { label: 'Önbelleği temizle ve yenile', accelerator: MAC ? 'Cmd+Shift+R' : 'Ctrl+F5', click: reloadAll },
      { type: 'separator' },
      { label: 'Yazdır…', accelerator: K('P'), click: () => win?.webContents.print() },
      ...(MAC ? [{ type: 'separator' }, { label: 'Pencereyi kapat', role: 'close' }] : [{ type: 'separator' }, { label: 'Çıkış', role: 'quit' }]),
    ] },
    { label: 'Düzen', submenu: [
      // geri al / yinele sayfaya bırakılır: rölöve editörü Ctrl/Cmd+Z/Y ile kendi geri al işlemini yapar
      { label: 'Geri al', role: 'undo', accelerator: K('Z'), registerAccelerator: false },
      { label: 'Yinele', role: 'redo', accelerator: MAC ? 'Cmd+Shift+Z' : 'Ctrl+Y', registerAccelerator: false }, { type: 'separator' },
      // macOS'ta kes / kopyala / yapıştır menüde kayıtlı olmalı (yoksa metin alanlarında Cmd+C/V çalışmaz)
      { label: 'Kes', role: 'cut', accelerator: K('X'), registerAccelerator: MAC },
      { label: 'Kopyala', role: 'copy', accelerator: K('C'), registerAccelerator: MAC },
      { label: 'Yapıştır', role: 'paste', accelerator: K('V'), registerAccelerator: MAC },
      { label: 'Tümünü seç', role: 'selectAll', accelerator: K('A'), registerAccelerator: MAC },
    ] },
    { label: 'Görünüm', submenu: [
      { label: 'Yakınlaştır', role: 'zoomIn', accelerator: K('=') }, { label: 'Uzaklaştır', role: 'zoomOut' }, { label: 'Gerçek boyut', role: 'resetZoom' },
      { type: 'separator' }, { label: 'Tam ekran', role: 'togglefullscreen' },
      { type: 'separator' }, { label: 'Geliştirici araçları', role: 'toggleDevTools', accelerator: MAC ? 'Alt+Cmd+I' : 'Ctrl+Shift+I' },
    ] },
    ...(MAC ? [{ label: 'Pencere', role: 'windowMenu' }] : []),
    { label: 'Yardım', role: MAC ? 'help' : undefined, submenu: [
      ...(MAC ? [] : [{ label: 'Güncellemeleri denetle', click: () => checkUpdates(true) }, { type: 'separator' }]),
      { label: 'www.saggplus.com', click: () => shell.openExternal(LIC.web) },
      { label: 'E-posta: ' + LIC.email, click: () => shell.openExternal('mailto:' + LIC.email) },
      { label: 'Tüm sürümler (Windows / macOS)', click: () => shell.openExternal(RELEASES) },
      ...(MAC ? [] : [{ type: 'separator' }, { label: 'Hakkında', click: about }]),
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function about() {
  dialog.showMessageBox(win || undefined, {
    type: 'info', title: 'Hakkında', icon: path.join(__dirname, 'build', 'icon.png'),
    message: `TadilatBodrum Saha ${app.getVersion()}`,
    detail: `Program lisans sahibi:\n${LIC.owner}\n\nProgram geliştirici: ${LIC.developer}\n\n© ${new Date().getFullYear()} ${LIC.owner}\nTüm hakları saklıdır.\n\n${LIC.web.replace('https://', '')} - ${LIC.email}`,
    buttons: ['Tamam'],
  });
}

/* ── otomatik güncelleme (uygulama kabuğu) ── */
/* macOS: uygulama Apple geliştirici kimliğiyle imzalı değil → otomatik kurulum (Squirrel.Mac) çalışmaz;
   yeni sürüm yalnızca bildirilir ve indirme sayfası açılır */
autoUpdater.autoDownload = !MAC;
autoUpdater.autoInstallOnAppQuit = !MAC;
let macNotified = '';
autoUpdater.on('update-available', async i => {
  if (!MAC) return send(`Yeni sürüm ${i.version} indiriliyor…`);
  send(`Yeni sürüm ${i.version} var — indirme sayfasından kurun.`);
  if (!manualCheck && macNotified === i.version) return;   // otomatik denetimde aynı sürüm bir kez sorulur
  macNotified = i.version; manualCheck = false;
  const r = await dialog.showMessageBox(win || undefined, {
    type: 'info', title: 'Yeni sürüm', buttons: ['İndirme sayfasını aç', 'Sonra'], defaultId: 0, cancelId: 1,
    message: `TadilatBodrum Saha ${i.version} yayımlandı.`,
    detail: `Kurulu sürüm: ${app.getVersion()}\n\nİndirme sayfasından "TadilatBodrum-Saha-${i.version}.dmg" dosyasını indirip açın ve uygulamayı Uygulamalar klasörüne sürükleyin (eskisinin yerine).`,
  });
  if (r.response === 0) shell.openExternal(RELEASES);
});
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
    .then(r => r?.updateInfo && r.updateInfo.version !== app.getVersion() ? (MAC ? `Yeni sürüm ${r.updateInfo.version} var — indirme sayfasından kurun.` : `Yeni sürüm ${r.updateInfo.version} indiriliyor…`) : 'Uygulama güncel.')
    .catch(e => { throw new Error(String(e?.message || e).slice(0, 200)); });
}

ipcMain.handle('tb:check-updates', () => checkUpdates(false));
ipcMain.handle('tb:status', () => lastStatus);
ipcMain.on('tb:retry', () => { siteIdx = 0; win?.loadURL(SITES[0]); });
ipcMain.on('tb:releases', () => shell.openExternal(RELEASES));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  setTimeout(() => checkUpdates(false).catch(() => {}), 8000);
  setInterval(() => checkUpdates(false).catch(() => {}), UPDATE_EVERY);
});
// macOS: pencere kapanınca uygulama Dock'ta açık kalır, Dock simgesine tıklayınca pencere yeniden açılır
app.on('window-all-closed', () => { if (!MAC) app.quit(); });
app.on('activate', () => { if (!win) createWindow(); else win.show(); });
