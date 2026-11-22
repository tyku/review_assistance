import type { EvaluateReviewFilters } from '../../review/application/evaluate-review-filters';
import type { Review } from '../../review/domain/review';

export type LocalReviewError = 'git-missing' | 'not-repository' | 'empty' | 'too-large' | 'read-failed';
export type LocalReviewResult = { ok: true; review: Review } | { ok: false; error: LocalReviewError };

export interface LocalReviewSource {
  read(directory: string): Promise<LocalReviewResult>;
}

export class OpenLocalReview {
  constructor(
    private readonly source: LocalReviewSource,
    private readonly filters: EvaluateReviewFilters,
  ) {}

  async execute(directory: string): Promise<LocalReviewResult> {
    const result = await this.source.read(directory);
    if (!result.ok) return result;
    return { ok: true, review: await this.filters.execute(result.review) };
  }
}
