import { EvaluateReviewFilters } from '../review/application/evaluate-review-filters';
import { ReviewFiltersModule } from '../review/review-filters.module';
import { Module, type DynamicModule } from '@nestjs/common';
import { AccountConnection } from '../connections/application/account-connection';
import { KeychainCredentialStore } from '../connections/infrastructure/keychain-credential.store';
import { OpenPullRequest } from './application/open-pull-request';
import { normalizeGitHubAddress } from './domain/pull-request';
import { GitHubApi } from './infrastructure/github-api';

export const GITHUB_CONNECTION = Symbol('GITHUB_CONNECTION');

@Module({})
export class GitHubModule {
  static forKeychain(helperPath: string): DynamicModule {
    return {
      module: GitHubModule,
      imports: [ReviewFiltersModule],
      providers: [
        GitHubApi,
        {
          provide: GITHUB_CONNECTION,
          inject: [GitHubApi],
          useFactory: (api: GitHubApi) => new AccountConnection(
            api,
            new KeychainCredentialStore(helperPath, 'github', normalizeGitHubAddress),
            normalizeGitHubAddress,
          ),
        },
        {
          provide: OpenPullRequest,
          inject: [GITHUB_CONNECTION, GitHubApi, EvaluateReviewFilters],
          useFactory: (connection: AccountConnection, api: GitHubApi, filters: EvaluateReviewFilters) =>
            new OpenPullRequest(connection, api, filters),
        },
      ],
      exports: [GITHUB_CONNECTION, OpenPullRequest],
    };
  }
}
