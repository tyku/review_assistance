import type { EvaluateReviewFilters } from '../../review/application/evaluate-review-filters';
import type { AccountConnection } from '../../connections/application/account-connection';
import type { LinkedReviewData, LinkedReviewError, LinkedReviewResult } from '../../review/application/linked-review';
import { parsePullRequestLink, type PullRequestRef } from '../domain/pull-request';

export interface PullRequestSource {
  read(reference: PullRequestRef, token: string): Promise<LinkedReviewData | { error: LinkedReviewError }>;
}

export class OpenPullRequest {
  constructor(
    private readonly connection: AccountConnection,
    private readonly source: PullRequestSource,
    private readonly filters: EvaluateReviewFilters,
  ) {}

  async execute(link: unknown): Promise<LinkedReviewResult> {
    const reference = parsePullRequestLink(link);
    if (!reference) return { ok: false, error: 'invalid-link' };

    const result = await this.connection.withCredentials(({ token }) => this.source.read(reference, token));
    if ('error' in result) return { ok: false, error: result.error };
    return { ok: true, ...result, review: await this.filters.execute(result.review) };
  }
}
