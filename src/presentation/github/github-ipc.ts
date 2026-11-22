import type { ConnectionResult } from '../../connections/application/account-connection';
import type { LinkedReviewScreenResult } from '../review/review-ipc';

export const GITHUB_CHANNELS = {
  status: 'github:status',
  connect: 'github:connect',
  useSession: 'github:use-session',
  disconnect: 'github:disconnect',
  discardPending: 'github:discard-pending',
  openPullRequest: 'github:open-pull-request',
} as const;

export interface GitHubBridge {
  status(): Promise<ConnectionResult>;
  connect(token: string): Promise<ConnectionResult>;
  useSession(): Promise<ConnectionResult>;
  disconnect(): Promise<ConnectionResult>;
  discardPending(): Promise<ConnectionResult>;
  openPullRequest(link: string): Promise<LinkedReviewScreenResult>;
}
