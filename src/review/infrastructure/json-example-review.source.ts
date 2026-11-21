import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import type { ExampleReviewSource } from '../application/open-example-review';
import { createReview, type Review } from '../domain/review';
import { parseUnifiedDiff } from './unified-diff';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class JsonExampleReviewSource implements ExampleReviewSource {
  private readonly logger = new Logger('ExampleReview');

  constructor(private readonly filename: string) {}

  async load(): Promise<Review> {
    try {
      return this.parse(await readFile(this.filename, 'utf8'));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      const reason = code === 'ENOENT' ? 'missing-file'
        : code === 'EACCES' || code === 'EPERM' ? 'access-denied'
        : error instanceof SyntaxError ? 'invalid-json'
        : code ? 'io-error' : 'invalid-example';
      this.logger.warn(`sample load failed reason=${reason}`);
      throw error;
    }
  }

  private parse(source: string): Review {
    const data: unknown = JSON.parse(source);
    if (!isRecord(data)) throw new Error('Invalid example');

    const { project, reference, title, sourceBranch, targetBranch, files } = data;
    if (
      typeof project !== 'string' ||
      typeof reference !== 'string' ||
      typeof title !== 'string' ||
      typeof sourceBranch !== 'string' ||
      typeof targetBranch !== 'string' ||
      !Array.isArray(files)
    ) {
      throw new Error('Invalid example header or file list');
    }

    const diffs = files.map((file: unknown) => {
      if (!isRecord(file) || typeof file.path !== 'string' || typeof file.patch !== 'string') {
        throw new Error('Invalid example file');
      }
      return { path: file.path, hunks: parseUnifiedDiff(file.patch) };
    });

    return createReview({ project, reference, title, sourceBranch, targetBranch }, diffs);
  }
}
