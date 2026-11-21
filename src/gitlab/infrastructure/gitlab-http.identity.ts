import type { GitLabIdentity } from '../application/gitlab-connection';

export class GitLabHttpIdentity implements GitLabIdentity {
  constructor(private readonly request: typeof fetch = (...args) => fetch(...args)) {}

  async verify(address: string, token: string): ReturnType<GitLabIdentity['verify']> {
    let response: Response;
    try {
      response = await this.request(address + '/api/v4/user', {
        headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { error: 'unreachable' };
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      if (response.status === 401) return { error: 'unauthorized' };
      if (response.status === 403) return { error: 'forbidden' };
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
