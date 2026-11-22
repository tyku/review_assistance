import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isProgressKey, type FileProgress, type ReviewProgressStore, type StoredReviewProgress } from '../application/review-progress';

function validFile(value: unknown): value is FileProgress {
  if (typeof value !== 'object' || value === null) return false;
  const { fingerprint, opens, viewed } = value as Partial<FileProgress>;
  return isProgressKey(fingerprint) && typeof opens === 'number' && Number.isSafeInteger(opens)
    && opens >= 0 && typeof viewed === 'boolean';
}

export class DiskReviewProgressStore implements ReviewProgressStore {
  constructor(private readonly directory: string) {}

  async read(key: string): Promise<StoredReviewProgress | undefined> {
    let text: string;
    try {
      text = await readFile(join(this.directory, key + '.json'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }

    const data = JSON.parse(text) as Partial<StoredReviewProgress> | null;
    if (!data?.files || typeof data.files !== 'object' || Array.isArray(data.files)
      || Object.entries(data.files).some(([id, file]) => !isProgressKey(id) || !validFile(file))
      || (data.lastFile !== undefined && (!isProgressKey(data.lastFile) || !Object.hasOwn(data.files, data.lastFile)))) {
      throw new Error('Invalid review progress');
    }
    return { files: data.files, lastFile: data.lastFile };
  }

  async write(key: string, progress: StoredReviewProgress): Promise<void> {
    const filename = join(this.directory, key + '.json');
    const temporary = filename + '.' + randomUUID();
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify(progress), { mode: 0o600 });
      await rename(temporary, filename);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }
}
