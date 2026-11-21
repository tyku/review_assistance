import { Logger } from '@nestjs/common';
import type { LoadRepositoryLanguages, RepositoryLanguageResult } from '../../review/application/load-repository-languages';
import type { EvaluateReviewFilters } from '../../review/application/evaluate-review-filters';
import type { AccountConnection } from '../../connections/application/account-connection';
import type { LinkedReviewData, LinkedReviewError, LinkedReviewResult } from '../../review/application/linked-review';
import { parseMergeRequestLink, type MergeRequestRef } from '../domain/merge-request';

interface MergeRequestData extends LinkedReviewData {
  readonly coverageIncomplete: boolean;
}

export interface MergeRequestSource {
  read(address: string, reference: MergeRequestRef, token: string): Promise<MergeRequestData | { error: LinkedReviewError }>;
}

export interface GitLabRepositoryLanguages {
  read(address: string, project: string, token: string): Promise<RepositoryLanguageResult>;
}

export class OpenMergeRequest {
  private readonly logger = new Logger('GitLabRepositoryLanguages');

  constructor(
    private readonly connection: AccountConnection,
    private readonly source: MergeRequestSource,
    private readonly filters: EvaluateReviewFilters,
    private readonly loadLanguages: LoadRepositoryLanguages,
    private readonly languageSource: GitLabRepositoryLanguages,
  ) {}

  async execute(link: unknown): Promise<LinkedReviewResult> {
    const result = await this.connection.withCredentials(async ({ address, token }): Promise<LinkedReviewResult> => {
      const parsed = parseMergeRequestLink(link, address);
      if ('error' in parsed) return { ok: false, error: parsed.error };

      const { reference } = parsed;
      const result = await this.source.read(address, reference, token);
      if ('error' in result) return { ok: false, error: result.error };

      const languages = await this.loadLanguages.execute({ address, project: reference.project }, () =>
        this.languageSource.read(address, reference.project, token),
      );
      const repositoryLanguages = languages.ok ? languages.languages : undefined;
      if (repositoryLanguages) {
        this.logger.debug(`languages=${JSON.stringify(repositoryLanguages)}`);
      }
      const { review, incomplete, coverageIncomplete } = result;
      return {
        ok: true,
        incomplete,
        languageSorting: languages.ok ? (languages.languages.length ? 'available' : 'empty') : languages.reason,
        review: await this.filters.execute(review, !coverageIncomplete, repositoryLanguages),
      };
    });
    return 'ok' in result ? result : { ok: false, error: result.error };
  }
}
