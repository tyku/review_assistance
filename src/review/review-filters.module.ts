import { Module } from '@nestjs/common';
import { EvaluateReviewFilters } from './application/evaluate-review-filters';
import { OTHER_EXTENSION_FILTER, TEST_PATH_FILTER } from './domain/file-filter';
import { FilePathFilter } from './domain/file-path.filter';
import { FormattingAndCommentsFilter } from './infrastructure/formatting-and-comments.filter';
import { LinguistFileFilter } from './infrastructure/linguist-file.filter';

@Module({
  providers: [{
    provide: EvaluateReviewFilters,
    useFactory: () => new EvaluateReviewFilters([
      new FilePathFilter(OTHER_EXTENSION_FILTER, /\.(?:md|txt|png|jpg|jpeg|tiff|log|pdf|bak|cpu|heap)$/i, (extension) =>
        `Расширение ${extension}`),
      new FilePathFilter(TEST_PATH_FILTER, /spec|test/i, (part) => `В пути есть ${part}`),
      new FormattingAndCommentsFilter(),
      new LinguistFileFilter(),
    ]),
  }],
  exports: [EvaluateReviewFilters],
})
export class ReviewFiltersModule {}
