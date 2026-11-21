import { existsSync, realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const localElectron = join(root, '.local', 'electron');

function findElectron(): string {
  if (existsSync(localElectron)) return realpathSync(localElectron);

  const installed: unknown = require('electron');
  if (typeof installed !== 'string') throw new Error('Invalid Electron executable');
  return installed;
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

  const child = spawn(executable, [root, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
  child.on('error', () => {
    console.error('Не удалось запустить Electron.');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
  process.once('SIGINT', () => child.kill('SIGINT'));
  process.once('SIGTERM', () => child.kill('SIGTERM'));
}

launch();
