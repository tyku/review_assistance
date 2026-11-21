import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  RepositoryLanguageCache,
  RepositoryLanguageKey,
} from '../application/load-repository-languages';

export class DiskRepositoryLanguageCache implements RepositoryLanguageCache {
  private readonly logger = new Logger('RepositoryLanguageCache');

  constructor(private readonly directory: string) {}

  async read(key: RepositoryLanguageKey): Promise<readonly string[] | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(this.filename(key), 'utf8'));
      if (Array.isArray(value) && value.every((name) => typeof name === 'string' && name.trim())) {
        this.logger.log('languages cache hit');
        return value;
      }
      this.logger.warn('languages cache entry invalid');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('languages cache read failed');
    }
    return undefined;
  }

  async write(key: RepositoryLanguageKey, languages: readonly string[]): Promise<void> {
    const filename = this.filename(key);
    const temporary = filename + '.' + randomUUID();
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify(languages), { mode: 0o600 });
      await rename(temporary, filename);
      this.logger.log('languages cached');
    } catch {
      this.logger.warn('languages cache write failed');
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  private filename(key: RepositoryLanguageKey): string {
    const id = createHash('sha256').update(JSON.stringify([key.address, key.project])).digest('hex');
    return join(this.directory, id + '.json');
  }
}
