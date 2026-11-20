/* macOS paketinden sonra ad-hoc imza (Apple geliştirici sertifikası yok).
 * Apple Silicon Mac'ler imzasız / imzası bozulmuş uygulamayı çalıştırmaz; electron-builder Info.plist'i
 * değiştirdiği için Electron'un hazır imzası geçersizleşir. Bu adım bütün paketi yeniden (ad-hoc) imzalar.
 * Universal derlemede yalnızca birleşik paket imzalanır (x64 / arm64 ara paketleri birleştirmeden önce dokunulmaz). */
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const universal = 4;   // builder-util Arch.universal
  if (ctx.arch !== universal && /universal-(x64|arm64)-temp/.test(ctx.appOutDir)) return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc imza  ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
};
