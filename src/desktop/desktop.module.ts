import { Module, type DynamicModule } from '@nestjs/common';
import { WINDOW_OPTIONS, DesktopWindow, type WindowOptions } from './infrastructure/desktop-window';

@Module({
  providers: [DesktopWindow],
  exports: [DesktopWindow],
})
export class DesktopModule {
  static forWindow(options: WindowOptions): DynamicModule {
    return {
      module: DesktopModule,
      providers: [{ provide: WINDOW_OPTIONS, useValue: options }],
    };
  }
}
