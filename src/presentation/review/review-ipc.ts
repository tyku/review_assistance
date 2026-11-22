import type { Review } from '../../review/domain/review';
import type { LinkedReviewResult } from '../../review/application/linked-review';
import type { ProgressResult, ReviewProgressSnapshot } from '../../review/application/review-progress';
import type { LocalReviewResult } from '../../local-git/application/open-local-review';

export const OPEN_EXAMPLE_CHANNEL = 'review:open-example';
export const OPEN_LOCAL_CHANNEL = 'review:open-local';
export const UPDATE_PROGRESS_CHANNEL = 'review:update-progress';

export type OpenExampleResult = { ok: true; example: Review; progress?: ReviewProgressSnapshot } | { ok: false };
export type LinkedReviewScreenResult = LinkedReviewResult & { progress?: ReviewProgressSnapshot };
export type LocalReviewScreenResult =
  | (LocalReviewResult & { progress?: ReviewProgressSnapshot })
  | { ok: false; error: 'cancelled' };

export interface ReviewBridge {
  openExample(): Promise<OpenExampleResult>;
  openLocal(): Promise<LocalReviewScreenResult>;
  updateProgress(key: string, path: string, fingerprint: string, viewed?: boolean): Promise<ProgressResult>;
}
