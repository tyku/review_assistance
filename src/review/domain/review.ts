import type { FileFilterAssessment } from './file-filter';
import { buildReadingOrder } from './reading-order';

export type DiffMarker = ' ' | '-' | '+';

export interface DiffLine {
  readonly marker: DiffMarker;
  readonly oldLine: number | null;
  readonly newLine: number | null;
  readonly text: string;
}

export interface DiffHunk {
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

export interface FileDiff {
  readonly path: string;
  readonly hunks: readonly DiffHunk[];
  readonly structuralChange?: boolean;
  readonly unavailable?: { added?: number; removed?: number };
}

export interface ChangedFile extends FileDiff {
  readonly filterResults?: readonly FileFilterAssessment[];
  readonly added?: number;
  readonly removed?: number;
}

export interface ReviewDetails {
  readonly sourceAddress?: string;
  readonly project: string;
  readonly reference: string;
  readonly title: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
}

export interface Review extends ReviewDetails {
  readonly files: readonly [ChangedFile, ...ChangedFile[]];
  readonly readingOrder: readonly string[];
}

export function createReview(details: ReviewDetails, diffs: readonly FileDiff[]): Review {
  if (Object.values(details).some((value) => !value.trim())) {
    throw new Error('Review details must be non-empty');
  }

  const paths = new Set<string>();
  const files = diffs.map(({ path, hunks, unavailable, structuralChange }) => {
    if (!path.trim() || paths.has(path)) {
      throw new Error('Invalid or duplicate file path');
    }
    paths.add(path);

    const diff = { path, hunks, ...(structuralChange ? { structuralChange } : {}) };
    if (unavailable) return { ...diff, added: unavailable.added, removed: unavailable.removed, unavailable };

    const lines = hunks.flatMap((hunk) => hunk.lines);
    const added = lines.filter((line) => line.marker === '+').length;
    const removed = lines.filter((line) => line.marker === '-').length;
    if (added + removed === 0) throw new Error('File has no changes');
    return { ...diff, added, removed };
  });

  const [first, ...rest] = files;
  if (!first) throw new Error('Review has no files');
  return { ...details, files: [first, ...rest], readingOrder: buildReadingOrder(files) };
}
