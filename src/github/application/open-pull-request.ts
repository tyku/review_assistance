import type { AccountConnection, ValidationError } from '../../connections/application/account-connection';
import type { Review } from '../../review/domain/review';
import { parsePullRequestLink, type PullRequestRef } from '../domain/pull-request';

export type PullRequestError = ValidationError | 'invalid-link' | 'not-connected' | 'storage' | 'not-found' | 'empty';
type PullRequestData = { review: Review; incomplete: boolean };
export type PullRequestResult = ({ ok: true } & PullRequestData) | { ok: false; error: PullRequestError };

export interface PullRequestSource {
  read(reference: PullRequestRef, token: string): Promise<PullRequestData | { error: PullRequestError }>;
}

export class OpenPullRequest {
  constructor(private readonly connection: AccountConnection, private readonly source: PullRequestSource) {}

  async execute(link: unknown): Promise<PullRequestResult> {
    const reference = parsePullRequestLink(link);
    if (!reference) return { ok: false, error: 'invalid-link' };

    const result = await this.connection.withCredentials(({ token }) => this.source.read(reference, token));
    return 'error' in result ? { ok: false, error: result.error } : { ok: true, ...result };
  }
}
