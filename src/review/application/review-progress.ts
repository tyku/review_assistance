import { createHash } from 'node:crypto';
import type { Review } from '../domain/review';

export interface FileProgress {
  readonly fingerprint: string;
  readonly opens: number;
  readonly viewed: boolean;
}

export interface StoredReviewProgress {
  lastFile?: string;
  files: Record<string, FileProgress>;
}

export interface ReviewProgressStore {
  read(key: string): Promise<StoredReviewProgress | undefined>;
  write(key: string, progress: StoredReviewProgress): Promise<void>;
}

export type ReviewProgressSnapshot = {
  key: string;
  files: readonly (FileProgress & { path: string })[];
  restoredPath?: string;
  hasOpenedFile: boolean;
};

export type ProgressResult =
  | { ok: true; fileProgress: FileProgress }
  | { ok: false; error: 'progress-storage' | 'stale-progress' };

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const isProgressKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export class ReviewProgress {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: ReviewProgressStore) {}

  open(review: Review): Promise<ReviewProgressSnapshot> {
    const project = review.sourceAddress === 'https://github.com' ? review.project.toLowerCase() : review.project;
    const key = hash(JSON.stringify([review.sourceAddress ?? 'example', project, review.reference]));
    return this.enqueue(async () => {
      const stored = await this.store.read(key) ?? { files: {} };
      let changed = false;
      let restoredPath: string | undefined;
      const files = review.files.map((file) => {
        const id = hash(file.path);
        const previous = stored.files[id];
        if (id === stored.lastFile) restoredPath = file.path;
        if (file.unavailable && previous) return { path: file.path, ...previous };
        const fingerprint = hash(JSON.stringify([file.hunks, file.structuralChange, file.unavailable]));
        if (previous?.fingerprint === fingerprint) return { path: file.path, ...previous };

        changed = true;
        const next = { fingerprint, opens: previous?.opens ?? 0, viewed: false };
        stored.files[id] = next;
        return { path: file.path, ...next };
      });
      if (changed) await this.store.write(key, stored);
      return { key, files, restoredPath, hasOpenedFile: stored.lastFile !== undefined };
    });
  }

  async update(key: unknown, path: unknown, fingerprint: unknown, viewed: unknown): Promise<ProgressResult> {
    if (!isProgressKey(key) || typeof path !== 'string' || !path.length || !isProgressKey(fingerprint)
      || (viewed !== undefined && typeof viewed !== 'boolean')) {
      return { ok: false, error: 'stale-progress' };
    }

    return this.enqueue<ProgressResult>(async () => {
      const stored = await this.store.read(key);
      const id = hash(path);
      const previous = stored?.files[id];
      if (!stored || !previous || previous.fingerprint !== fingerprint) return { ok: false, error: 'stale-progress' };
      if (viewed === undefined && stored.lastFile === id) return { ok: true, fileProgress: previous };
      if (viewed !== undefined && viewed === previous.viewed) return { ok: true, fileProgress: previous };

      const fileProgress = viewed === undefined
        ? { ...previous, opens: Math.min(previous.opens + 1, Number.MAX_SAFE_INTEGER) }
        : { ...previous, viewed };
      if (viewed === undefined) stored.lastFile = id;
      stored.files[id] = fileProgress;
      await this.store.write(key, stored);
      return { ok: true, fileProgress };
    }).catch(() => ({ ok: false, error: 'progress-storage' }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.pending;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.catch(() => {});
    return next;
  }
}
