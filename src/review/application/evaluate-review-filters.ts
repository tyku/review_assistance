import type { FileFilter, FileFilterAssessment, FileFilterInput } from '../domain/file-filter';
import type { ChangedFile, Review } from '../domain/review';

export class EvaluateReviewFilters {
  constructor(private readonly filters: readonly FileFilter[]) {}

  async execute(review: Review, coverageComplete = true): Promise<Review> {
    const evaluate = async (file: ChangedFile): Promise<ChangedFile> => {
      const input = { file, diffComplete: coverageComplete && !file.unavailable };
      const filterResults = await Promise.all(this.filters.map((filter) => this.apply(filter, input)));
      return { ...file, filterResults };
    };

    const [first, ...rest] = await Promise.all(review.files.map(evaluate));
    return { ...review, files: [first, ...rest] };
  }

  private async apply(filter: FileFilter, input: FileFilterInput): Promise<FileFilterAssessment> {
    try {
      return { filterId: filter.id, ...await filter.evaluate(input) };
    } catch {
      return { filterId: filter.id, outcome: 'unknown', reason: 'Не удалось применить фильтр' };
    }
  }
}
