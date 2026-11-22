import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ipcMain } from 'electron';
import { registerLoggedIpc } from '../logged-ipc';
import { OpenExampleReview } from '../../review/application/open-example-review';
import { OPEN_EXAMPLE_CHANNEL, UPDATE_PROGRESS_CHANNEL } from './review-ipc';
import { DesktopWindow } from '../../desktop/infrastructure/desktop-window';
import { ReviewProgress } from '../../review/application/review-progress';
import { readReviewProgress } from './read-review-progress';

@Injectable()
export class ReviewIpcHandler implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly desktopWindow: DesktopWindow,
    private readonly openExample: OpenExampleReview,
    private readonly progress: ReviewProgress,
  ) {}

  onModuleInit(): void {
    registerLoggedIpc(this.desktopWindow, OPEN_EXAMPLE_CHANNEL, async () => {
      try {
        const example = await this.openExample.execute();
        return { ok: true, example, progress: await readReviewProgress(this.progress, example) };
      } catch {
        return { ok: false };
      }
    });
    registerLoggedIpc(this.desktopWindow, UPDATE_PROGRESS_CHANNEL, (key, path, fingerprint, viewed) =>
      this.progress.update(key, path, fingerprint, viewed));
  }

  onModuleDestroy(): void {
    ipcMain.removeHandler(OPEN_EXAMPLE_CHANNEL);
    ipcMain.removeHandler(UPDATE_PROGRESS_CHANNEL);
  }
}
