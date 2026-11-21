import { contextBridge, ipcRenderer } from 'electron';
import type { OPEN_EXAMPLE_CHANNEL, OpenExampleResult, ReviewBridge } from './review-ipc';

const channel: typeof OPEN_EXAMPLE_CHANNEL = 'review:open-example';
const bridge: ReviewBridge = {
  openExample: () => ipcRenderer.invoke(channel) as Promise<OpenExampleResult>,
};
contextBridge.exposeInMainWorld('review', bridge);
