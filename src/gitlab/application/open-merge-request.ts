import type { AccountConnection } from '../../connections/application/account-connection';
import type { LinkedReviewData, LinkedReviewError, LinkedReviewResult } from '../../review/application/linked-review';
import { parseMergeRequestLink, type MergeRequestRef } from '../domain/merge-request';

export interface MergeRequestSource {
  read(address: string, reference: MergeRequestRef, token: string): Promise<LinkedReviewData | { error: LinkedReviewError }>;
}

export class OpenMergeRequest {
  constructor(private readonly connection: AccountConnection, private readonly source: MergeRequestSource) {}

  async execute(link: unknown): Promise<LinkedReviewResult> {
    const result = await this.connection.withCredentials(({ address, token }) => {
      const parsed = parseMergeRequestLink(link, address);
      if ('error' in parsed) return Promise.resolve(parsed);
      return this.source.read(address, parsed.reference, token);
    });
    return 'error' in result ? { ok: false, error: result.error } : { ok: true, ...result };
  }
}
