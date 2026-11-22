import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ipcMain } from 'electron';
import { registerLoggedIpc } from '../logged-ipc';
import { DesktopWindow } from '../../desktop/infrastructure/desktop-window';
import type { AccountConnection } from '../../connections/application/account-connection';
import { OpenMergeRequest } from '../../gitlab/application/open-merge-request';
import { GITLAB_CONNECTION } from '../../gitlab/gitlab.module';
import { GITLAB_CHANNELS } from './gitlab-ipc';
import { ReviewProgress } from '../../review/application/review-progress';
import { readReviewProgress } from '../review/read-review-progress';

@Injectable()
export class GitLabIpcHandler implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly window: DesktopWindow,
    @Inject(GITLAB_CONNECTION) private readonly connection: AccountConnection,
    private readonly mergeRequest: OpenMergeRequest,
    private readonly progress: ReviewProgress,
  ) {}

  onModuleInit(): void {
    registerLoggedIpc(this.window, GITLAB_CHANNELS.status, () => this.connection.status());
    registerLoggedIpc(this.window, GITLAB_CHANNELS.connect, (address, token) => this.connection.connect(address, token));
    registerLoggedIpc(this.window, GITLAB_CHANNELS.useSession, () => this.connection.useSession());
    registerLoggedIpc(this.window, GITLAB_CHANNELS.disconnect, () => this.connection.disconnect());
    registerLoggedIpc(this.window, GITLAB_CHANNELS.discardPending, () => this.connection.discardPending());
    registerLoggedIpc(this.window, GITLAB_CHANNELS.openMergeRequest, async (link) => {
      const result = await this.mergeRequest.execute(link);
      if (!result.ok) return result;
      return { ...result, progress: await readReviewProgress(this.progress, result.review) };
    });
  }

  onModuleDestroy(): void {
    for (const channel of Object.values(GITLAB_CHANNELS)) {
      ipcMain.removeHandler(channel);
    }
  }
}
