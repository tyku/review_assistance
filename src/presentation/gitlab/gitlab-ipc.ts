import type { ConnectionResult } from '../../connections/application/account-connection';

export const GITLAB_CHANNELS = {
  status: 'gitlab:status',
  connect: 'gitlab:connect',
  useSession: 'gitlab:use-session',
  disconnect: 'gitlab:disconnect',
  discardPending: 'gitlab:discard-pending',
} as const;

export interface GitLabBridge {
  status(): Promise<ConnectionResult>;
  connect(address: string, token: string): Promise<ConnectionResult>;
  useSession(): Promise<ConnectionResult>;
  disconnect(): Promise<ConnectionResult>;
  discardPending(): Promise<ConnectionResult>;
}
