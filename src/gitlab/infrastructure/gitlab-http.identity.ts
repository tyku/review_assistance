import { requestWithActivity } from '../../infrastructure/logging/http-activity';
import type { AccountIdentity } from '../../connections/application/account-connection';

import { classifyGitLabAccessDenial } from './gitlab-access-denial';

export class GitLabHttpIdentity implements AccountIdentity {
  constructor(private readonly request: typeof fetch = (...args) => fetch(...args)) {}

  async verify(address: string, token: string): ReturnType<AccountIdentity['verify']> {
    let response: Response;
    try {
      response = await requestWithActivity('GitLab', 'check-account', () => this.request(address + '/api/v4/user', {
        headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      }));
    } catch {
      return { error: 'unreachable' };
    }

    if (!response.ok) {
      if (response.status === 403) {
        const denial = await classifyGitLabAccessDenial(response);
        if (denial === 'html-denial') return { error: 'profile-html-denial' };
        if (denial === 'denied') return { error: 'profile-read-denied' };
        return { error: 'profile-scope-missing' };
      }
      void response.body?.cancel().catch(() => {});
      if (response.status === 401) return { error: 'unauthorized' };
      if (response.status >= 300 && response.status < 400) return { error: 'redirect' };
      return { error: 'invalid-server' };
    }

    try {
      const data: { username?: unknown } | null = await response.json();
      const username = data?.username;
      if (typeof username === 'string' && /^[a-zA-Z0-9_.-]{1,256}$/.test(username) && !username.includes(token)) {
        return { username };
      }
    } catch {
      // The endpoint did not return a usable GitLab account.
    }
    return { error: 'invalid-server' };
  }
}
