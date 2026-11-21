import type { ChangedFile } from './review';

export const OTHER_EXTENSION_FILTER = 'other-extension';
export const REPOSITORY_LANGUAGE_FILTER = 'repository-language';
export const TEST_PATH_FILTER = 'test-path';
export const FORMATTING_AND_COMMENTS_FILTER = 'formatting-and-comments';

export interface FileFilterInput {
  readonly file: ChangedFile;
  readonly diffComplete: boolean;
  readonly repositoryLanguages?: readonly string[];
}

export interface FileFilterResult {
  readonly outcome: 'match' | 'no-match' | 'unknown';
  readonly reason: string;
}

export interface FileFilter {
  readonly id: string;
  evaluate(input: FileFilterInput): FileFilterResult | Promise<FileFilterResult>;
}

export interface FileFilterAssessment extends FileFilterResult {
  readonly filterId: string;
}
