import type { EvaluateReviewFilters } from '../../review/application/evaluate-review-filters';
import type { AccountConnection } from '../../connections/application/account-connection';
import type { LinkedReviewData, LinkedReviewError, LinkedReviewResult } from '../../review/application/linked-review';
import { parseMergeRequestLink, type MergeRequestRef } from '../domain/merge-request';

interface MergeRequestData extends LinkedReviewData {
  readonly coverageIncomplete: boolean;
}

export interface MergeRequestSource {
  read(address: string, reference: MergeRequestRef, token: string): Promise<MergeRequestData | { error: LinkedReviewError }>;
}

export class OpenMergeRequest {
  constructor(
    private readonly connection: AccountConnection,
    private readonly source: MergeRequestSource,
    private readonly filters: EvaluateReviewFilters,
  ) {}

  async execute(link: unknown): Promise<LinkedReviewResult> {
    const result = await this.connection.withCredentials(async ({ address, token }): Promise<LinkedReviewResult> => {
      const parsed = parseMergeRequestLink(link, address);
      if ('error' in parsed) return { ok: false, error: parsed.error };

      const { reference } = parsed;
      const result = await this.source.read(address, reference, token);
      if ('error' in result) return { ok: false, error: result.error };

      const { review, incomplete, coverageIncomplete } = result;
      return {
        ok: true,
        incomplete,
        review: await this.filters.execute(review, !coverageIncomplete),
      };
    });
    return 'ok' in result ? result : { ok: false, error: result.error };
  }
}
