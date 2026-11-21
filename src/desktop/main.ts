import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { app } from 'electron';
import { DesktopModule } from './desktop.module';

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const starting = NestFactory.createApplicationContext(DesktopModule.forApp(app.getAppPath()), {
    abortOnError: false,
    logger: ['error', 'warn'],
  });

  let closing = false;
  app.on('before-quit', function closeContext(event) {
    event.preventDefault();
    if (closing) return;
    closing = true;

    void starting.then((context) => context.close()).then(() => {
      app.removeListener('before-quit', closeContext);
      app.quit();
    }).catch(fail);
  });

  await starting;
}

function fail(error: unknown): void {
  console.error('Ошибка Review Assistance', error);
  app.exit(1);
}

void bootstrap().catch(fail);
