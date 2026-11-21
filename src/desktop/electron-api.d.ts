// The preinstalled Electron runtime does not include the npm type declarations.
declare module 'electron' {
  interface QuitEvent {
    preventDefault(): void;
  }

  interface WebFrameMain {}

  interface WebContents {
    readonly mainFrame: WebFrameMain;
    on(event: 'will-navigate', listener: (event: QuitEvent) => void): void;
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  }

  interface IpcMainInvokeEvent {
    readonly sender: WebContents;
    readonly senderFrame: WebFrameMain | null;
  }

  export const app: {
    getAppPath(): string;
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
