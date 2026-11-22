import { Logger } from '@nestjs/common';
import { ipcMain } from 'electron';
import type { ConnectionResult } from '../connections/application/account-connection';
import type { DesktopWindow } from '../desktop/infrastructure/desktop-window';
import type { LinkedReviewResult } from '../review/application/linked-review';
import type { ProgressResult } from '../review/application/review-progress';
import { LINGUIST_FILE_FILTER } from '../review/domain/file-filter';
import type { Review } from '../review/domain/review';
import { UPDATE_PROGRESS_CHANNEL, type OpenExampleResult, type LocalReviewScreenResult } from './review/review-ipc';

type ActionResult = ConnectionResult | LinkedReviewResult | OpenExampleResult | LocalReviewScreenResult | ProgressResult;

const logger = new Logger('DesktopActions');
const languageLogger = new Logger('Linguist');

function logDetectedLanguages(review: Review): void {
  if (!Logger.isLevelEnabled('debug')) return;
  const languages = new Set<string>();
  for (const file of review.files) {
    const language = file.filterResults?.find(({ filterId }) => filterId === LINGUIST_FILE_FILTER)?.detectedLanguage;
    if (language) languages.add(language);
  }
  languageLogger.debug(`detectedLanguages=${JSON.stringify([...languages].sort())}`);
}

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
    if (channel !== UPDATE_PROGRESS_CHANNEL) logger.log(`${channel} started`);
    try {
      const result = await execute(...args);
      const duration = `durationMs=${Math.round(performance.now() - started)}`;
      if (!result.ok) {
        const reason = 'error' in result ? result.error : 'example-unavailable';
        const fallback = 'canUseSession' in result && result.canUseSession ? ' fallback=session' : '';
        if (reason === 'cancelled') logger.log(`${channel} cancelled ${duration}`);
        else logger.warn(`${channel} failed reason=${reason}${fallback} ${duration}`);
      } else if ('review' in result) {
        const incomplete = 'incomplete' in result ? ` incomplete=${result.incomplete}` : '';
        const summary = `${channel} completed files=${result.review.files.length}${incomplete} ${duration}`;
        if ('incomplete' in result && result.incomplete) logger.warn(summary);
        else logger.log(summary);
        logDetectedLanguages(result.review);
      } else if ('example' in result) {
        logger.log(`${channel} completed files=${result.example.files.length} ${duration}`);
        logDetectedLanguages(result.example);
      } else if ('status' in result) {
        const { status } = result;
        const storage = status.connected ? ` storage=${status.storage}` : '';
        logger.log(`${channel} completed connected=${status.connected}${storage} ${duration}`);
      } else {
        logger.debug(`${channel} completed ${duration}`);
      }
      return result;
    } catch {
      logger.error(`${channel} failed reason=unexpected-error durationMs=${Math.round(performance.now() - started)}`);
      return { ok: false };
    }
  });
}
