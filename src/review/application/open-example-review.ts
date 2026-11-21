import type { Review } from '../domain/review';
import type { EvaluateReviewFilters } from './evaluate-review-filters';

export interface ExampleReviewSource {
  load(): Promise<Review>;
}

export class OpenExampleReview {
  constructor(
    private readonly source: ExampleReviewSource,
    private readonly filters: EvaluateReviewFilters,
  ) {}

  async execute(): Promise<Review> {
    return this.filters.execute(await this.source.load());
  }
}
