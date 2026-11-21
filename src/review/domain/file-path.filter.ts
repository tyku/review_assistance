import type { FileFilter, FileFilterInput, FileFilterResult } from './file-filter';

export class FilePathFilter implements FileFilter {
  constructor(
    readonly id: string,
    private readonly pattern: RegExp,
    private readonly describe: (match: string) => string,
  ) {}

  evaluate({ file }: FileFilterInput): FileFilterResult {
    const match = file.path.match(this.pattern)?.[0];
    if (!match) return { outcome: 'no-match', reason: 'Путь не подходит под правило' };
    return { outcome: 'match', reason: this.describe(match.toLowerCase()) };
  }
}
