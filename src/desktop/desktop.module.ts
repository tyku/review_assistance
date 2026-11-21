import { Module, type DynamicModule } from '@nestjs/common';
import { join } from 'node:path';
import { ReviewModule } from '../review/review.module';
import { DESKTOP_ROOT, DesktopWindow } from './infrastructure/desktop-window';
import { ReviewIpcHandler } from './infrastructure/review-ipc.handler';

@Module({
  providers: [DesktopWindow, ReviewIpcHandler],
})
export class DesktopModule {
  static forApp(root: string): DynamicModule {
    return {
      module: DesktopModule,
      imports: [ReviewModule.forFixture(join(root, 'fixtures', 'example.json'))],
      providers: [{ provide: DESKTOP_ROOT, useValue: root }],
    };
  }
}
