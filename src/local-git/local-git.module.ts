import { Module } from '@nestjs/common';
import { EvaluateReviewFilters } from '../review/application/evaluate-review-filters';
import { ReviewFiltersModule } from '../review/review-filters.module';
import { OpenLocalReview } from './application/open-local-review';
import { GitWorkingTreeSource } from './infrastructure/git-working-tree.source';

@Module({
  imports: [ReviewFiltersModule],
  providers: [
    GitWorkingTreeSource,
    {
      provide: OpenLocalReview,
      inject: [GitWorkingTreeSource, EvaluateReviewFilters],
      useFactory: (source: GitWorkingTreeSource, filters: EvaluateReviewFilters) => new OpenLocalReview(source, filters),
    },
  ],
  exports: [OpenLocalReview],
})
export class LocalGitModule {}
