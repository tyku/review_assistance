// The preinstalled Electron runtime does not include the npm type declarations.
declare module 'electron' {
  interface QuitEvent {
    preventDefault(): void;
  }

  interface WebFrameMain {}

  interface WebContents {
    readonly mainFrame: WebFrameMain;
    on(event: 'will-navigate', listener: (event: QuitEvent) => void): void;
    on(event: 'render-process-gone', listener: (
      event: unknown,
      details: { reason: string; exitCode: number },
    ) => void): void;
    on(event: 'preload-error', listener: () => void): void;
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  }

  interface IpcMainInvokeEvent {
    readonly sender: WebContents;
    readonly senderFrame: WebFrameMain | null;
  }

  export const app: {
    getAppPath(): string;
    getPath(name: 'userData'): string;
    requestSingleInstanceLock(): boolean;
    whenReady(): Promise<void>;
    on(event: 'activate' | 'window-all-closed', listener: () => void): void;
    on(event: 'before-quit', listener: (event: QuitEvent) => void): void;
    removeListener(event: 'activate' | 'window-all-closed', listener: () => void): void;
    removeListener(event: 'before-quit', listener: (event: QuitEvent) => void): void;
    quit(): void;
    exit(code: number): void;
  };

  export class BrowserWindow {
    constructor(options: {
      width: number;
      height: number;
      minWidth: number;
      minHeight: number;
      backgroundColor: string;
      webPreferences: {
        preload: string;
        contextIsolation: boolean;
        sandbox: boolean;
        nodeIntegration: boolean;
      };
    });
    readonly webContents: WebContents;
    on(event: 'closed', listener: () => void): void;
    loadFile(filename: string): Promise<void>;
    destroy(): void;
    isDestroyed(): boolean;
  }

  export const dialog: {
    showOpenDialog(window: BrowserWindow, options: { title: string; properties: ['openDirectory'] }):
      Promise<{ canceled: boolean; filePaths: string[] }>;
  };

  export const ipcMain: {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>): void;
    removeHandler(channel: string): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };

  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };
}
