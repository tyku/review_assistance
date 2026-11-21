import type { Review } from '../../review/domain/review';

export const OPEN_EXAMPLE_CHANNEL = 'review:open-example';

export type OpenExampleResult = { ok: true; example: Review } | { ok: false };

export interface ReviewBridge {
  openExample(): Promise<OpenExampleResult>;
}
