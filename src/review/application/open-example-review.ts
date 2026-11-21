import type { Review } from '../domain/review';

export interface ExampleReviewSource {
  load(): Promise<Review>;
}

export class OpenExampleReview {
  constructor(private readonly source: ExampleReviewSource) {}

  execute(): Promise<Review> {
    return this.source.load();
  }
}
