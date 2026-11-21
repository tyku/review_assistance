import type { AccountIdentity } from '../../connections/application/account-connection';
import type { PullRequestError, PullRequestSource } from '../application/open-pull-request';
import type { PullRequestRef } from '../domain/pull-request';
import { createReview, type FileDiff } from '../../review/domain/review';
import { parseUnifiedDiff } from '../../review/infrastructure/unified-diff';

const API = 'https://api.github.com';
const PAGE_SIZE = 100;
const FILE_LIMIT = 3000;

class GitHubApiError extends Error {
  constructor(readonly code: PullRequestError) {
    super(code);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GitHubApiError('invalid-server');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new GitHubApiError('invalid-server');
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new GitHubApiError('invalid-server');
  }
  return value;
}

function parseFile(value: unknown): FileDiff {
  const file = object(value);
  const path = string(file.filename);
  const added = count(file.additions);
  const removed = count(file.deletions);
  if (typeof file.patch === 'string') {
    try {
      const hunks = parseUnifiedDiff(file.patch.replace(/\r?\n$/, ''));
      const lines = hunks.flatMap((hunk) => hunk.lines);
      if (lines.filter((line) => line.marker === '+').length === added &&
          lines.filter((line) => line.marker === '-').length === removed && added + removed > 0) {
        return { path, hunks };
      }
    } catch {
      // GitHub can omit a patch or return an incomplete patch.
    }
  }
  return { path, hunks: [], unavailable: { added, removed } };
}

export class GitHubApi implements AccountIdentity, PullRequestSource {
  constructor(private readonly request: typeof fetch = (...args) => fetch(...args)) {}

  async verify(_address: string, token: string): ReturnType<AccountIdentity['verify']> {
    try {
      const data = object(await this.get('/user', token, AbortSignal.timeout(8000)));
      const username = string(data.login);
      if (!/^[\w.-]{1,256}$/.test(username) || username.includes(token)) return { error: 'invalid-server' };
      return { username };
    } catch (error) {
      if (error instanceof GitHubApiError &&
          (error.code === 'unauthorized' || error.code === 'forbidden' || error.code === 'unreachable' || error.code === 'redirect')) {
        return { error: error.code };
      }
      return { error: 'invalid-server' };
    }
  }

  async read(reference: PullRequestRef, token: string): ReturnType<PullRequestSource['read']> {
    const { owner, repository, number } = reference;
    const path = `/repos/${owner}/${repository}/pulls/${number}`;
    const signal = AbortSignal.timeout(15000);

    try {
      const pull = object(await this.get(path, token, signal));
      const expected = count(pull.changed_files);
      if (expected === 0) return { error: 'empty' };

      const files: FileDiff[] = [];
      const limit = Math.min(expected, FILE_LIMIT);
      for (let page = 1; files.length < limit; page++) {
        const values = await this.get(`${path}/files?per_page=${PAGE_SIZE}&page=${page}`, token, signal);
        if (!Array.isArray(values) || values.length > PAGE_SIZE) return { error: 'invalid-server' };
        files.push(...values.map(parseFile));
        if (values.length < PAGE_SIZE) break;
      }
      if (!files.length) return { error: 'invalid-server' };

      const review = createReview({
        project: `${owner}/${repository}`,
        reference: `PR #${number}`,
        title: string(pull.title),
        sourceBranch: string(object(pull.head).ref),
        targetBranch: string(object(pull.base).ref),
      }, files);

      return { review, incomplete: files.length !== expected || files.some((file) => file.unavailable) };
    } catch (error) {
      return { error: error instanceof GitHubApiError ? error.code : 'invalid-server' };
    }
  }

  private async get(path: string, token: string, signal: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(API + path, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        redirect: 'manual',
        cache: 'no-store',
        signal,
      });
    } catch {
      throw new GitHubApiError('unreachable');
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      if (response.status === 401) throw new GitHubApiError('unauthorized');
      if (response.status === 403 || response.status === 429) throw new GitHubApiError('forbidden');
      if (response.status === 404) throw new GitHubApiError('not-found');
      if (response.status >= 300 && response.status < 400) throw new GitHubApiError('redirect');
      throw new GitHubApiError('invalid-server');
    }
    return response.json();
  }
}
