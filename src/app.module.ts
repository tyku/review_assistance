import { Module, type DynamicModule } from '@nestjs/common';
import { join } from 'node:path';
import { DesktopModule } from './desktop/desktop.module';
import { GitHubModule } from './github/github.module';
import { GitHubIpcHandler } from './presentation/github/github-ipc.handler';
import { GitLabModule } from './gitlab/gitlab.module';
import { GitLabIpcHandler } from './presentation/gitlab/gitlab-ipc.handler';
import { ReviewIpcHandler } from './presentation/review/review-ipc.handler';
import { ReviewModule } from './review/review.module';

@Module({
  providers: [ReviewIpcHandler, GitLabIpcHandler, GitHubIpcHandler],
})
export class AppModule {
  static forApp(root: string, userData: string): DynamicModule {
    const keychain = join(root, '.local', 'bin', 'gitlab-keychain');
    return {
      module: AppModule,
      imports: [
        DesktopModule.forWindow({
          page: join(root, 'ui', 'index.html'),
          preload: join(__dirname, 'presentation', 'preload.js'),
        }),
        GitLabModule.forKeychain(keychain, join(userData, 'repository-languages')),
        GitHubModule.forKeychain(keychain),
        ReviewModule.forFixture(join(root, 'fixtures', 'example.json'), join(userData, 'review-progress')),
      ],
    };
  }
}
