import { contextBridge, ipcRenderer } from 'electron';
import type { GITLAB_CHANNELS, GitLabBridge } from './gitlab/gitlab-ipc';
import type { ConnectionResult } from '../gitlab/application/gitlab-connection';
import type { OPEN_EXAMPLE_CHANNEL, OpenExampleResult, ReviewBridge } from './review/review-ipc';

const exampleChannel: typeof OPEN_EXAMPLE_CHANNEL = 'review:open-example';
const review: ReviewBridge = {
  openExample: () => ipcRenderer.invoke(exampleChannel) as Promise<OpenExampleResult>,
};

const channels: typeof GITLAB_CHANNELS = {
  status: 'gitlab:status',
  connect: 'gitlab:connect',
  useSession: 'gitlab:use-session',
  disconnect: 'gitlab:disconnect',
  discardPending: 'gitlab:discard-pending',
};

const gitlab: GitLabBridge = {
  status: () => ipcRenderer.invoke(channels.status) as Promise<ConnectionResult>,
  connect: (address, token) => ipcRenderer.invoke(channels.connect, address, token) as Promise<ConnectionResult>,
  useSession: () => ipcRenderer.invoke(channels.useSession) as Promise<ConnectionResult>,
  disconnect: () => ipcRenderer.invoke(channels.disconnect) as Promise<ConnectionResult>,
  discardPending: () => ipcRenderer.invoke(channels.discardPending) as Promise<ConnectionResult>,
};
contextBridge.exposeInMainWorld('review', review);
contextBridge.exposeInMainWorld('gitlab', gitlab);
