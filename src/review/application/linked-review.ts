import type { ValidationError } from '../../connections/application/account-connection';
import type { Review } from '../domain/review';

export type LinkedReviewError = ValidationError
  | 'invalid-link'
  | 'different-server'
  | 'not-connected'
  | 'storage'
  | 'review-scope-missing'
  | 'review-project-read-missing'
  | 'review-html-denial'
  | 'rate-limited'
  | 'not-found'
  | 'empty'
  | 'diff-unavailable';

export type LinkedReviewData = { review: Review; incomplete: boolean };
export type LinkedReviewResult = ({ ok: true } & LinkedReviewData) | { ok: false; error: LinkedReviewError };
