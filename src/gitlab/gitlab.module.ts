import { Module, type DynamicModule } from '@nestjs/common';
import { GitLabConnection } from './application/gitlab-connection';
import { GitLabHttpIdentity } from './infrastructure/gitlab-http.identity';
import { KeychainCredentialStore } from './infrastructure/keychain-credential.store';

@Module({})
export class GitLabModule {
  static forKeychain(helperPath: string): DynamicModule {
    return {
      module: GitLabModule,
      providers: [{
        provide: GitLabConnection,
        useFactory: () => new GitLabConnection(new GitLabHttpIdentity(), new KeychainCredentialStore(helperPath)),
      }],
      exports: [GitLabConnection],
    };
  }
}
