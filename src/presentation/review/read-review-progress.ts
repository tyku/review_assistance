import { Logger } from '@nestjs/common';
import type { Review } from '../../review/domain/review';
import type { ReviewProgress } from '../../review/application/review-progress';

const logger = new Logger('ReviewProgress');

export async function readReviewProgress(progress: ReviewProgress, review: Review) {
  try {
    return await progress.open(review);
  } catch {
    logger.warn('progress read failed');
    return undefined;
  }
}
