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
          inject: [GITHUB_CONNECTION, GitHubApi],
          useFactory: (connection: AccountConnection, api: GitHubApi) => new OpenPullRequest(connection, api),
        },
      ],
      exports: [GITHUB_CONNECTION, OpenPullRequest],
    };
  }
}
