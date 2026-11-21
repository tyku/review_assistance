import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { OpenExampleReview } from '../../review/application/open-example-review';
import { OPEN_EXAMPLE_CHANNEL, type OpenExampleResult } from './review-ipc';
import { DesktopWindow } from '../../desktop/infrastructure/desktop-window';

@Injectable()
export class ReviewIpcHandler implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly desktopWindow: DesktopWindow,
    private readonly openExample: OpenExampleReview,
  ) {}

  onModuleInit(): void {
    ipcMain.handle(OPEN_EXAMPLE_CHANNEL, (event) => this.handleOpenExample(event));
  }

  onModuleDestroy(): void {
    ipcMain.removeHandler(OPEN_EXAMPLE_CHANNEL);
  }

  private async handleOpenExample({ sender, senderFrame }: IpcMainInvokeEvent): Promise<OpenExampleResult> {
    if (!this.desktopWindow.owns(sender) || !senderFrame || senderFrame !== sender.mainFrame) {
      return { ok: false };
    }

    try {
      return { ok: true, example: await this.openExample.execute() };
    } catch {
      return { ok: false };
    }
  }
}
