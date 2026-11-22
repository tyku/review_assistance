import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ipcMain } from 'electron';
import { registerLoggedIpc } from '../logged-ipc';
import { OpenExampleReview } from '../../review/application/open-example-review';
import { OPEN_EXAMPLE_CHANNEL, OPEN_LOCAL_CHANNEL, UPDATE_PROGRESS_CHANNEL } from './review-ipc';
import { DesktopWindow } from '../../desktop/infrastructure/desktop-window';
import { ReviewProgress } from '../../review/application/review-progress';
import { readReviewProgress } from './read-review-progress';
import { OpenLocalReview } from '../../local-git/application/open-local-review';

@Injectable()
export class ReviewIpcHandler implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly desktopWindow: DesktopWindow,
    private readonly openExample: OpenExampleReview,
    private readonly openLocal: OpenLocalReview,
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
    registerLoggedIpc(this.desktopWindow, OPEN_LOCAL_CHANNEL, async () => {
      const directory = await this.desktopWindow.chooseDirectory();
      if (!directory) return { ok: false, error: 'cancelled' };
      const result = await this.openLocal.execute(directory);
      if (!result.ok) return result;
      return { ...result, progress: await readReviewProgress(this.progress, result.review) };
    });
    registerLoggedIpc(this.desktopWindow, UPDATE_PROGRESS_CHANNEL, (key, path, fingerprint, viewed) =>
      this.progress.update(key, path, fingerprint, viewed));
  }

  onModuleDestroy(): void {
    ipcMain.removeHandler(OPEN_EXAMPLE_CHANNEL);
    ipcMain.removeHandler(OPEN_LOCAL_CHANNEL);
    ipcMain.removeHandler(UPDATE_PROGRESS_CHANNEL);
  }
}
