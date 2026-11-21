import { requestWithActivity } from '../../infrastructure/logging/http-activity';
import type { RepositoryLanguageResult } from '../../review/application/load-repository-languages';

export class GitLabRepositoryLanguagesSource {
  constructor(private readonly request: typeof fetch = (...args) => fetch(...args)) {}

  async read(address: string, project: string, token: string): Promise<RepositoryLanguageResult> {
    try {
      const endpoint = `${address}/api/v4/projects/${encodeURIComponent(project)}/languages`;
      const response = await requestWithActivity('GitLab', 'load-languages', () => this.request(endpoint, {
        headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      }));
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { ok: false, reason: [401, 403, 404].includes(response.status) ? 'forbidden' : 'unavailable' };
      }

      const data: unknown = await response.json();
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return { ok: false, reason: 'unavailable' };
      }
      const entries = Object.entries(data);
      if (!entries.every(([name, share]) => name.trim() && typeof share === 'number' && Number.isFinite(share))) {
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: true, languages: entries.map(([name]) => name) };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }
}
