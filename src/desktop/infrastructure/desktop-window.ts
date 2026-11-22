import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { app, BrowserWindow, dialog, type WebContents } from 'electron';

export const WINDOW_OPTIONS = Symbol('WINDOW_OPTIONS');

export interface WindowOptions {
  readonly page: string;
  readonly preload: string;
}

@Injectable()
export class DesktopWindow implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DesktopWindow.name);
  private window?: BrowserWindow;

  constructor(@Inject(WINDOW_OPTIONS) private readonly options: WindowOptions) {}

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

  async chooseDirectory(): Promise<string | undefined> {
    if (!this.window) return;
    const result = await dialog.showOpenDialog(this.window, {
      title: 'Папка локального Git-репозитория',
      properties: ['openDirectory'],
    });
    return result.canceled ? undefined : result.filePaths[0];
  }

  private readonly onActivate = (): void => {
    void this.open().catch(() => {
      this.logger.error('window reopen failed');
    });
  };

  private readonly onWindowAllClosed = (): void => {
    if (process.platform !== 'darwin') app.quit();
  };

  private async open(): Promise<void> {
    if (this.window) return;

    this.logger.log('window opening');
    const window = new BrowserWindow({
      width: 1260,
      height: 820,
      minWidth: 740,
      minHeight: 520,
      backgroundColor: '#f4f5f8',
      webPreferences: {
        preload: this.options.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    this.window = window;

    window.on('closed', () => {
      this.window = undefined;
      this.logger.log('window closed');
    });
    window.webContents.on('will-navigate', (event) => {
      this.logger.warn('navigation blocked');
      event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => {
      this.logger.warn('new window blocked');
      return { action: 'deny' };
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      this.logger.error(`renderer exited reason=${details.reason} exitCode=${details.exitCode}`);
    });
    window.webContents.on('preload-error', () => {
      this.logger.error('preload failed');
    });

    try {
      await window.loadFile(this.options.page);
      this.logger.log('window ready');
    } catch (error) {
      this.logger.error('window load failed');
      if (!window.isDestroyed()) window.destroy();
      throw error;
    }
  }
}
