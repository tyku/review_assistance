import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { app, BrowserWindow, type WebContents } from 'electron';
import { join } from 'node:path';

export const DESKTOP_ROOT = Symbol('DESKTOP_ROOT');

@Injectable()
export class DesktopWindow implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DesktopWindow.name);
  private window?: BrowserWindow;

  constructor(@Inject(DESKTOP_ROOT) private readonly root: string) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.open();
    app.on('activate', this.onActivate);
    app.on('window-all-closed', this.onWindowAllClosed);
  }

  onModuleDestroy(): void {
    app.removeListener('activate', this.onActivate);
    app.removeListener('window-all-closed', this.onWindowAllClosed);
  }

  owns(sender: WebContents): boolean {
    return this.window?.webContents === sender;
  }

  private readonly onActivate = (): void => {
    void this.open().catch((error: unknown) => {
      this.logger.error('Не удалось открыть окно Review Assistance.', error);
    });
  };

  private readonly onWindowAllClosed = (): void => {
    if (process.platform !== 'darwin') app.quit();
  };

  private async open(): Promise<void> {
    if (this.window) return;

    const window = new BrowserWindow({
      width: 1260,
      height: 820,
      minWidth: 740,
      minHeight: 520,
      backgroundColor: '#f4f5f8',
      webPreferences: {
        preload: join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    this.window = window;

    window.on('closed', () => { this.window = undefined; });
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    try {
      await window.loadFile(join(this.root, 'ui', 'index.html'));
    } catch (error) {
      if (!window.isDestroyed()) window.destroy();
      throw error;
    }
  }
}
