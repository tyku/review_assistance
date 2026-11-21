export interface MergeRequestRef {
  project: string;
  number: number;
}

export function parseMergeRequestLink(
  link: unknown,
  address: string,
): { reference: MergeRequestRef } | { error: 'invalid-link' | 'different-server' } {
  if (typeof link !== 'string' || link.length > 4096) return { error: 'invalid-link' };

  try {
    const input = link.trim();
    if (!/^https:\/\//i.test(input) || /[\s\\]/.test(input)) return { error: 'invalid-link' };

    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password) return { error: 'invalid-link' };

    const base = new URL(address);
    const prefix = base.pathname.replace(/\/+$/, '') + '/';
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return { error: 'different-server' };

    const match = /^(.+)\/-\/merge_requests\/([1-9]\d*)(?:\/diffs(?:\.html)?)?\/?$/.exec(
      url.pathname.slice(prefix.length),
    );
    if (!match) return { error: 'invalid-link' };

    const project = match[1].split('/').map(decodeURIComponent);
    const validSegment = (segment: string) => /^[\w.-]+$/.test(segment) && segment !== '.' && segment !== '..';
    const number = Number(match[2]);
    if (project.length < 2 || !project.every(validSegment) || !Number.isSafeInteger(number)) {
      return { error: 'invalid-link' };
    }
    return { reference: { project: project.join('/'), number } };
  } catch {
    return { error: 'invalid-link' };
  }
}
