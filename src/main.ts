import 'reflect-metadata';
import { Logger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { app } from 'electron';
import { AppModule } from './app.module';

const logger = new Logger('ReviewAssistance');

async function bootstrap(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  logger.log('application starting');
  await app.whenReady();

  const logLevels: LogLevel[] = ['log', 'warn', 'error'];
  if (process.env.REVIEW_ASSISTANCE_DEBUG === '1') logLevels.push('debug');

  const starting = NestFactory.createApplicationContext(AppModule.forApp(app.getAppPath(), app.getPath('userData')), {
    abortOnError: false,
    logger: logLevels,
  });

  let closing = false;
  app.on('before-quit', function closeContext(event) {
    event.preventDefault();
    if (closing) return;
    closing = true;
    logger.log('application stopping');

    void starting.then((context) => context.close()).then(() => {
      logger.log('application stopped');
      app.removeListener('before-quit', closeContext);
      app.quit();
    }).catch(() => fail('shutdown'));
  });

  await starting;
  logger.log('application ready');
}

function fail(phase: 'startup' | 'shutdown'): void {
  logger.error(`application failed phase=${phase}`);
  app.exit(1);
}

void bootstrap().catch(() => fail('startup'));
