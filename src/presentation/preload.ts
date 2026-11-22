import { contextBridge, ipcRenderer } from 'electron';
import type { GITHUB_CHANNELS, GitHubBridge } from './github/github-ipc';
import type { ProgressResult } from '../review/application/review-progress';
import type { GITLAB_CHANNELS, GitLabBridge } from './gitlab/gitlab-ipc';
import type { ConnectionResult } from '../connections/application/account-connection';
import type { LinkedReviewScreenResult, OPEN_EXAMPLE_CHANNEL, UPDATE_PROGRESS_CHANNEL, OpenExampleResult, ReviewBridge } from './review/review-ipc';

const exampleChannel: typeof OPEN_EXAMPLE_CHANNEL = 'review:open-example';
const progressChannel: typeof UPDATE_PROGRESS_CHANNEL = 'review:update-progress';
const review: ReviewBridge = {
  openExample: () => ipcRenderer.invoke(exampleChannel) as Promise<OpenExampleResult>,
  updateProgress: (key, path, fingerprint, viewed) =>
    ipcRenderer.invoke(progressChannel, key, path, fingerprint, viewed) as Promise<ProgressResult>,
};

const channels: typeof GITLAB_CHANNELS = {
  status: 'gitlab:status',
  connect: 'gitlab:connect',
  useSession: 'gitlab:use-session',
  disconnect: 'gitlab:disconnect',
  discardPending: 'gitlab:discard-pending',
  openMergeRequest: 'gitlab:open-merge-request',
};

const gitlab: GitLabBridge = {
  status: () => ipcRenderer.invoke(channels.status) as Promise<ConnectionResult>,
  connect: (address, token) => ipcRenderer.invoke(channels.connect, address, token) as Promise<ConnectionResult>,
  useSession: () => ipcRenderer.invoke(channels.useSession) as Promise<ConnectionResult>,
  disconnect: () => ipcRenderer.invoke(channels.disconnect) as Promise<ConnectionResult>,
  discardPending: () => ipcRenderer.invoke(channels.discardPending) as Promise<ConnectionResult>,
  openMergeRequest: (link) => ipcRenderer.invoke(channels.openMergeRequest, link) as Promise<LinkedReviewScreenResult>,
};
contextBridge.exposeInMainWorld('review', review);
contextBridge.exposeInMainWorld('gitlab', gitlab);

const githubChannels: typeof GITHUB_CHANNELS = {
  status: 'github:status',
  connect: 'github:connect',
  useSession: 'github:use-session',
  disconnect: 'github:disconnect',
  discardPending: 'github:discard-pending',
  openPullRequest: 'github:open-pull-request',
};

const github: GitHubBridge = {
  status: () => ipcRenderer.invoke(githubChannels.status) as Promise<ConnectionResult>,
  connect: (token) => ipcRenderer.invoke(githubChannels.connect, token) as Promise<ConnectionResult>,
  useSession: () => ipcRenderer.invoke(githubChannels.useSession) as Promise<ConnectionResult>,
  disconnect: () => ipcRenderer.invoke(githubChannels.disconnect) as Promise<ConnectionResult>,
  discardPending: () => ipcRenderer.invoke(githubChannels.discardPending) as Promise<ConnectionResult>,
  openPullRequest: (link) => ipcRenderer.invoke(githubChannels.openPullRequest, link) as Promise<LinkedReviewScreenResult>,
};
contextBridge.exposeInMainWorld('github', github);
