import { requestWithActivity } from '../../infrastructure/logging/http-activity';
import type { LinkedReviewError } from '../../review/application/linked-review';
import { createReview, type FileDiff } from '../../review/domain/review';
import { parseUnifiedDiff } from '../../review/infrastructure/unified-diff';
import type { MergeRequestSource } from '../application/open-merge-request';
import type { MergeRequestRef } from '../domain/merge-request';
import { classifyGitLabAccessDenial } from './gitlab-access-denial';

const PAGE_SIZE = 100;
const PAGE_LIMIT = 30;

class GitLabDiffError extends Error {
  constructor(readonly code: LinkedReviewError) {
    super(code);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GitLabDiffError('invalid-server');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new GitLabDiffError('invalid-server');
  return value;
}

function parseFile(value: unknown): FileDiff {
  const file = object(value);
  const path = string(file.new_path ?? file.old_path);
  const structuralChange = file.new_file === true || file.deleted_file === true || file.renamed_file === true ||
    (typeof file.a_mode === 'string' && typeof file.b_mode === 'string' && file.a_mode !== file.b_mode);
  if (!file.collapsed && !file.too_large && typeof file.diff === 'string' && file.diff) {
    try {
      const hunks = parseUnifiedDiff(file.diff.replace(/\r?\n$/, ''));
      if (hunks.some((hunk) => hunk.lines.some((line) => line.marker !== ' '))) return { path, hunks, structuralChange };
    } catch {
      // Keep files with missing or truncated patches in the review.
    }
  }
  return { path, hunks: [], unavailable: {}, structuralChange };
}

export class GitLabMergeRequestSource implements MergeRequestSource {
  constructor(private readonly request: typeof fetch = (...args) => fetch(...args)) {}

  async read(address: string, reference: MergeRequestRef, token: string): ReturnType<MergeRequestSource['read']> {
    const { project, number } = reference;
    const endpoint = `${address}/api/v4/projects/${encodeURIComponent(project)}/merge_requests/${number}`;
    const signal = AbortSignal.timeout(15000);
    try {
      const metadata = await this.get('load-review', endpoint, token, signal);
      const merge = object(await metadata.json());
      const changes = typeof merge.changes_count === 'string' ? merge.changes_count : '';
      const expected = /^\d+$/.test(changes) ? Number(changes) : undefined;
      let incomplete = merge.overflow === true || /^\d+\+$/.test(changes);
      const files: FileDiff[] = [];

      for (let page = 1; page <= PAGE_LIMIT; page++) {
        const response = await this.get('load-diffs', `${endpoint}/diffs?per_page=${PAGE_SIZE}&page=${page}`, token, signal, page);
        const values: unknown = await response.json();
        if (!Array.isArray(values) || values.length > PAGE_SIZE) return { error: 'invalid-server' };
        files.push(...values.map(parseFile));

        const next = response.headers.get('x-next-page');
        if (next === '' || (next === null && values.length < PAGE_SIZE)) break;
        if (values.length === 0 || (next !== null && next !== String(page + 1)) || page === PAGE_LIMIT) {
          incomplete = true;
          break;
        }
      }

      incomplete ||= expected !== undefined && files.length !== expected;
      if (files.length === 0) return { error: incomplete ? 'diff-unavailable' : 'empty' };

      const review = createReview({
        sourceAddress: address,
        project,
        reference: `MR !${number}`,
        title: string(merge.title),
        sourceBranch: string(merge.source_branch),
        targetBranch: string(merge.target_branch),
      }, files);
      return { review, coverageIncomplete: incomplete, incomplete: incomplete || files.some((file) => file.unavailable) };
    } catch (error) {
      return { error: error instanceof GitLabDiffError ? error.code : 'invalid-server' };
    }
  }

  private async get(
    operation: 'load-review' | 'load-diffs',
    url: string,
    token: string,
    signal: AbortSignal,
    page?: number,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await requestWithActivity('GitLab', operation, () => this.request(url, {
        headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
        redirect: 'manual',
        cache: 'no-store',
        signal,
      }), page);
    } catch {
      throw new GitLabDiffError('unreachable');
    }

    if (!response.ok) {
      if (response.status === 403) {
        const denial = await classifyGitLabAccessDenial(response);
        if (denial === 'project-read-missing') throw new GitLabDiffError('review-project-read-missing');
        if (denial === 'scope-missing') throw new GitLabDiffError('review-scope-missing');
        if (denial === 'html-denial') throw new GitLabDiffError('review-html-denial');
        throw new GitLabDiffError('forbidden');
      }
      void response.body?.cancel().catch(() => {});
      if (response.status === 401) throw new GitLabDiffError('unauthorized');
      if (response.status === 429) throw new GitLabDiffError('rate-limited');
      if (response.status === 404) throw new GitLabDiffError('not-found');
      if (response.status >= 300 && response.status < 400) throw new GitLabDiffError('redirect');
      throw new GitLabDiffError('invalid-server');
    }
    return response;
  }
}
