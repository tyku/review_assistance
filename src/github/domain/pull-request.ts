export const GITHUB_ADDRESS = 'https://github.com';

export function normalizeGitHubAddress(value: string): string | undefined {
  return value === GITHUB_ADDRESS ? GITHUB_ADDRESS : undefined;
}

export interface PullRequestRef {
  owner: string;
  repository: string;
  number: number;
}

export function parsePullRequestLink(input: unknown): PullRequestRef | undefined {
  if (typeof input !== 'string' || input.length > 2048) return;
  const match = /^https:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)\/pull\/([1-9]\d*)(?:\/files)?\/?(?:[?#][^\s]*)?$/i
    .exec(input.trim());
  if (!match) return;

  const [, owner, repository, rawNumber] = match;
  if (repository === '.' || repository === '..') return;
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number)) return;
  return { owner, repository, number };
}
