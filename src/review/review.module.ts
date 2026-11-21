import { Module, type DynamicModule } from '@nestjs/common';
import { OpenExampleReview, type ExampleReviewSource } from './application/open-example-review';
import { JsonExampleReviewSource } from './infrastructure/json-example-review.source';

const EXAMPLE_REVIEW_SOURCE = Symbol('EXAMPLE_REVIEW_SOURCE');

@Module({})
export class ReviewModule {
  static forFixture(filename: string): DynamicModule {
    return {
      module: ReviewModule,
      providers: [
        {
          provide: EXAMPLE_REVIEW_SOURCE,
          useFactory: () => new JsonExampleReviewSource(filename),
        },
        {
          provide: OpenExampleReview,
          inject: [EXAMPLE_REVIEW_SOURCE],
          useFactory: (source: ExampleReviewSource) => new OpenExampleReview(source),
        },
      ],
      exports: [OpenExampleReview],
    };
  }
}
