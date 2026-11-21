import { Logger } from '@nestjs/common';
import { ipcMain } from 'electron';
import type { ConnectionResult } from '../connections/application/account-connection';
import type { DesktopWindow } from '../desktop/infrastructure/desktop-window';
import type { LinkedReviewResult } from '../review/application/linked-review';
import type { OpenExampleResult } from './review/review-ipc';

type ActionResult = ConnectionResult | LinkedReviewResult | OpenExampleResult;

const logger = new Logger('DesktopActions');

export function registerLoggedIpc(
  window: DesktopWindow,
  channel: string,
  execute: (...args: unknown[]) => Promise<ActionResult>,
): void {
  ipcMain.handle(channel, async ({ sender, senderFrame }, ...args) => {
    if (!window.owns(sender) || !senderFrame || senderFrame !== sender.mainFrame) {
      logger.warn(`${channel} rejected reason=untrusted-sender`);
      return { ok: false };
    }

    const started = performance.now();
    logger.log(`${channel} started`);
    try {
      const result = await execute(...args);
      const duration = `durationMs=${Math.round(performance.now() - started)}`;
      if (!result.ok) {
        const reason = 'error' in result ? result.error : 'example-unavailable';
        const fallback = 'canUseSession' in result && result.canUseSession ? ' fallback=session' : '';
        logger.warn(`${channel} failed reason=${reason}${fallback} ${duration}`);
      } else if ('review' in result) {
        const sorting = result.languageSorting ? ` languageSorting=${result.languageSorting}` : '';
        const summary = `${channel} completed files=${result.review.files.length} incomplete=${result.incomplete}${sorting} ${duration}`;
        if (result.incomplete) logger.warn(summary);
        else logger.log(summary);
      } else if ('example' in result) {
        logger.log(`${channel} completed files=${result.example.files.length} ${duration}`);
      } else {
        const { status } = result;
        const storage = status.connected ? ` storage=${status.storage}` : '';
        logger.log(`${channel} completed connected=${status.connected}${storage} ${duration}`);
      }
      return result;
    } catch {
      logger.error(`${channel} failed reason=unexpected-error durationMs=${Math.round(performance.now() - started)}`);
      return { ok: false };
    }
  });
}
