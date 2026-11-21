import { Module, type DynamicModule } from '@nestjs/common';
import { join } from 'node:path';
import { DesktopModule } from './desktop/desktop.module';
import { GitLabModule } from './gitlab/gitlab.module';
import { GitLabIpcHandler } from './presentation/gitlab/gitlab-ipc.handler';
import { ReviewIpcHandler } from './presentation/review/review-ipc.handler';
import { ReviewModule } from './review/review.module';

@Module({
  providers: [ReviewIpcHandler, GitLabIpcHandler],
})
export class AppModule {
  static forApp(root: string): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DesktopModule.forWindow({
          page: join(root, 'ui', 'index.html'),
          preload: join(__dirname, 'presentation', 'preload.js'),
        }),
        GitLabModule.forKeychain(join(root, '.local', 'bin', 'gitlab-keychain')),
        ReviewModule.forFixture(join(root, 'fixtures', 'example.json')),
      ],
    };
  }
}
