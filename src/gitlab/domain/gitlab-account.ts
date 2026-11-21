export interface GitLabCredentials {
  readonly address: string;
  readonly token: string;
  readonly username: string;
}

export function normalizeGitLabAddress(input: string): string | undefined {
  try {
    const text = input.trim();
    if (/[\s\\]/.test(text)) return;
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return;
    const address = url.origin + url.pathname.replace(/\/+$/, '');
    if (address.length <= 2048) return address;
    return undefined;
  } catch {
    return undefined;
  }
}
