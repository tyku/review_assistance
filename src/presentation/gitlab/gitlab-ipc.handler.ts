import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ipcMain } from 'electron';
import { DesktopWindow } from '../../desktop/infrastructure/desktop-window';
import type { AccountConnection, ConnectionResult } from '../../connections/application/account-connection';
import { GITLAB_CONNECTION } from '../../gitlab/gitlab.module';
import { GITLAB_CHANNELS } from './gitlab-ipc';

@Injectable()
export class GitLabIpcHandler implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly window: DesktopWindow,
    @Inject(GITLAB_CONNECTION) private readonly connection: AccountConnection,
  ) {}

  onModuleInit(): void {
    this.handle(GITLAB_CHANNELS.status, () => this.connection.status());
    this.handle(GITLAB_CHANNELS.connect, (address, token) => this.connection.connect(address, token));
    this.handle(GITLAB_CHANNELS.useSession, () => this.connection.useSession());
    this.handle(GITLAB_CHANNELS.disconnect, () => this.connection.disconnect());
    this.handle(GITLAB_CHANNELS.discardPending, () => this.connection.discardPending());
  }

  onModuleDestroy(): void {
    for (const channel of Object.values(GITLAB_CHANNELS)) {
      ipcMain.removeHandler(channel);
    }
  }

  private handle(channel: string, action: (...args: unknown[]) => Promise<ConnectionResult>): void {
    ipcMain.handle(channel, ({ sender, senderFrame }, ...args) => {
      if (!this.window.owns(sender) || !senderFrame || senderFrame !== sender.mainFrame) {
        return Promise.resolve({ ok: false });
      }
      return action(...args);
    });
  }
}
