import type { Review } from '../../review/domain/review';
import type { LinkedReviewResult } from '../../review/application/linked-review';
import type { ProgressResult, ReviewProgressSnapshot } from '../../review/application/review-progress';

export const OPEN_EXAMPLE_CHANNEL = 'review:open-example';
export const UPDATE_PROGRESS_CHANNEL = 'review:update-progress';

export type OpenExampleResult = { ok: true; example: Review; progress?: ReviewProgressSnapshot } | { ok: false };
export type LinkedReviewScreenResult = LinkedReviewResult & { progress?: ReviewProgressSnapshot };

export interface ReviewBridge {
  openExample(): Promise<OpenExampleResult>;
  updateProgress(key: string, path: string, fingerprint: string, viewed?: boolean): Promise<ProgressResult>;
}
