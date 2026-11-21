import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { app, BrowserWindow, type WebContents } from 'electron';

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
        preload: this.options.preload,
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
      await window.loadFile(this.options.page);
    } catch (error) {
      if (!window.isDestroyed()) window.destroy();
      throw error;
    }
  }
}
