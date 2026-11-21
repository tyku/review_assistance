import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ipcMain } from 'electron';
import { registerLoggedIpc } from '../logged-ipc';
import type { AccountConnection } from '../../connections/application/account-connection';
import { DesktopWindow } from '../../desktop/infrastructure/desktop-window';
import { OpenPullRequest } from '../../github/application/open-pull-request';
import { GITHUB_ADDRESS } from '../../github/domain/pull-request';
import { GITHUB_CONNECTION } from '../../github/github.module';
import { GITHUB_CHANNELS } from './github-ipc';

@Injectable()
export class GitHubIpcHandler implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly window: DesktopWindow,
    @Inject(GITHUB_CONNECTION) private readonly connection: AccountConnection,
    private readonly pullRequest: OpenPullRequest,
  ) {}

  onModuleInit(): void {
    registerLoggedIpc(this.window, GITHUB_CHANNELS.status, () => this.connection.status());
    registerLoggedIpc(this.window, GITHUB_CHANNELS.connect, (token) => this.connection.connect(GITHUB_ADDRESS, token));
    registerLoggedIpc(this.window, GITHUB_CHANNELS.useSession, () => this.connection.useSession());
    registerLoggedIpc(this.window, GITHUB_CHANNELS.disconnect, () => this.connection.disconnect());
    registerLoggedIpc(this.window, GITHUB_CHANNELS.discardPending, () => this.connection.discardPending());
    registerLoggedIpc(this.window, GITHUB_CHANNELS.openPullRequest, (link) => this.pullRequest.execute(link));
  }

  onModuleDestroy(): void {
    for (const channel of Object.values(GITHUB_CHANNELS)) ipcMain.removeHandler(channel);
  }
}
