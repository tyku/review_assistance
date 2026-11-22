import { Module, type DynamicModule } from '@nestjs/common';
import { OpenExampleReview, type ExampleReviewSource } from './application/open-example-review';
import { EvaluateReviewFilters } from './application/evaluate-review-filters';
import { ReviewFiltersModule } from './review-filters.module';
import { JsonExampleReviewSource } from './infrastructure/json-example-review.source';
import { ReviewProgress } from './application/review-progress';
import { DiskReviewProgressStore } from './infrastructure/disk-review-progress.store';

const EXAMPLE_REVIEW_SOURCE = Symbol('EXAMPLE_REVIEW_SOURCE');

@Module({})
export class ReviewModule {
  static forFixture(filename: string, progressDirectory: string): DynamicModule {
    return {
      module: ReviewModule,
      imports: [ReviewFiltersModule],
      providers: [
        {
          provide: EXAMPLE_REVIEW_SOURCE,
          useFactory: () => new JsonExampleReviewSource(filename),
        },
        {
          provide: OpenExampleReview,
          inject: [EXAMPLE_REVIEW_SOURCE, EvaluateReviewFilters],
          useFactory: (source: ExampleReviewSource, filters: EvaluateReviewFilters) =>
            new OpenExampleReview(source, filters),
        },
        {
          provide: ReviewProgress,
          useFactory: () => new ReviewProgress(new DiskReviewProgressStore(progressDirectory)),
        },
      ],
      exports: [OpenExampleReview, ReviewProgress],
    };
  }
}
