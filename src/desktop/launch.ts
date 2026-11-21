import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const localElectron = join(root, '.local', 'electron');

function findElectron(): string {
  if (existsSync(localElectron)) return realpathSync(localElectron);

  const installed: unknown = require('electron');
  if (typeof installed !== 'string') throw new Error('Invalid Electron executable');
  return installed;
}

function prepareKeychainHelper(): void {
  if (process.platform !== 'darwin') return;

  const directory = join(root, '.local', 'bin');
  const helper = join(directory, 'gitlab-keychain');
  const source = join(root, 'native', 'gitlab-keychain.c');
  const temporary = helper + '.' + process.pid;
  try {
    if (existsSync(helper) && statSync(helper).mtimeMs >= statSync(source).mtimeMs) return;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const result = spawnSync('/usr/bin/clang', [
      source, '-framework', 'Security', '-framework', 'CoreFoundation', '-o', temporary,
    ], { timeout: 30_000 });
    if (result.status === 0) {
      renameSync(temporary, helper);
      console.info('[Launcher] Keychain helper built.');
    } else {
      console.warn('[Launcher] Keychain helper build failed.');
    }
  } catch {
    console.warn('[Launcher] Keychain helper unavailable.');
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function launch() {
  let executable: string;
  try {
    executable = findElectron();
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'MODULE_NOT_FOUND';
    console.error(missing
      ? 'Electron не установлен. Выполните npm install --no-save electron@40.10.3, затем npm run start:dev.'
      : 'Не удалось найти исполняемый файл Electron.');
    process.exitCode = 1;
    return;
  }

  prepareKeychainHelper();
  const child = spawn(executable, [root, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
  child.on('error', () => {
    console.error('Не удалось запустить Electron.');
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') console.info(`[Launcher] Electron stopped signal=${signal}`);
    else if (code !== 0) console.warn(`[Launcher] Electron exited code=${code ?? 'none'} signal=${signal ?? 'none'}`);
    process.exitCode = code ?? 1;
  });
  process.once('SIGINT', () => child.kill('SIGINT'));
  process.once('SIGTERM', () => child.kill('SIGTERM'));
}

launch();
