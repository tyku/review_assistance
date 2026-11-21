import { LoadRepositoryLanguages } from '../review/application/load-repository-languages';
import { DiskRepositoryLanguageCache } from '../review/infrastructure/disk-repository-language.cache';
import { GitLabRepositoryLanguagesSource } from './infrastructure/gitlab-repository-languages.source';
import { EvaluateReviewFilters } from '../review/application/evaluate-review-filters';
import { ReviewFiltersModule } from '../review/review-filters.module';
import { Module, type DynamicModule } from '@nestjs/common';
import { AccountConnection } from '../connections/application/account-connection';
import { KeychainCredentialStore } from '../connections/infrastructure/keychain-credential.store';
import { OpenMergeRequest } from './application/open-merge-request';
import { GitLabMergeRequestSource } from './infrastructure/gitlab-merge-request.source';
import { normalizeGitLabAddress } from './domain/gitlab-account';
import { GitLabHttpIdentity } from './infrastructure/gitlab-http.identity';

export const GITLAB_CONNECTION = Symbol('GITLAB_CONNECTION');

@Module({})
export class GitLabModule {
  static forKeychain(helperPath: string, languageCacheDirectory: string): DynamicModule {
    return {
      module: GitLabModule,
      imports: [ReviewFiltersModule],
      providers: [
        GitLabMergeRequestSource,
        GitLabRepositoryLanguagesSource,
        {
          provide: LoadRepositoryLanguages,
          useFactory: () => new LoadRepositoryLanguages(new DiskRepositoryLanguageCache(languageCacheDirectory)),
        },
        {
          provide: GITLAB_CONNECTION,
          useFactory: () => new AccountConnection(
            new GitLabHttpIdentity(),
            new KeychainCredentialStore(helperPath, 'gitlab', normalizeGitLabAddress),
            normalizeGitLabAddress,
          ),
        },
        {
          provide: OpenMergeRequest,
          inject: [
            GITLAB_CONNECTION, GitLabMergeRequestSource, EvaluateReviewFilters,
            LoadRepositoryLanguages, GitLabRepositoryLanguagesSource,
          ],
          useFactory: (
            connection: AccountConnection, source: GitLabMergeRequestSource, filters: EvaluateReviewFilters,
            loadLanguages: LoadRepositoryLanguages, languageSource: GitLabRepositoryLanguagesSource,
          ) => new OpenMergeRequest(connection, source, filters, loadLanguages, languageSource),
        },
      ],
      exports: [GITLAB_CONNECTION, OpenMergeRequest],
    };
  }
}
