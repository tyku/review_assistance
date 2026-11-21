import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ipcMain } from 'electron';
import { registerLoggedIpc } from '../logged-ipc';
import { OpenExampleReview } from '../../review/application/open-example-review';
import { OPEN_EXAMPLE_CHANNEL } from './review-ipc';
import { DesktopWindow } from '../../desktop/infrastructure/desktop-window';

@Injectable()
export class ReviewIpcHandler implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly desktopWindow: DesktopWindow,
    private readonly openExample: OpenExampleReview,
  ) {}

  onModuleInit(): void {
    registerLoggedIpc(this.desktopWindow, OPEN_EXAMPLE_CHANNEL, async () => {
      try {
        return { ok: true, example: await this.openExample.execute() };
      } catch {
        return { ok: false };
      }
    });
  }

  onModuleDestroy(): void {
    ipcMain.removeHandler(OPEN_EXAMPLE_CHANNEL);
  }
}
