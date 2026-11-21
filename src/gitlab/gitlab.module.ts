import { Module, type DynamicModule } from '@nestjs/common';
import { AccountConnection } from '../connections/application/account-connection';
import { KeychainCredentialStore } from '../connections/infrastructure/keychain-credential.store';
import { normalizeGitLabAddress } from './domain/gitlab-account';
import { GitLabHttpIdentity } from './infrastructure/gitlab-http.identity';

export const GITLAB_CONNECTION = Symbol('GITLAB_CONNECTION');

@Module({})
export class GitLabModule {
  static forKeychain(helperPath: string): DynamicModule {
    return {
      module: GitLabModule,
      providers: [{
        provide: GITLAB_CONNECTION,
        useFactory: () => new AccountConnection(
          new GitLabHttpIdentity(),
          new KeychainCredentialStore(helperPath, 'gitlab', normalizeGitLabAddress),
          normalizeGitLabAddress,
        ),
      }],
      exports: [GITLAB_CONNECTION],
    };
  }
}
