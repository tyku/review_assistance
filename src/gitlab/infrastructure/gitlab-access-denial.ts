type AccessDenial = 'scope-missing' | 'project-read-missing' | 'html-denial' | 'denied';

export async function classifyGitLabAccessDenial(response: Response): Promise<AccessDenial> {
  const challenge = response.headers.get('www-authenticate') ?? '';
  const scopeChallenge =
    /(?:^|[ ,])error\s*=\s*"?(?:insufficient_scope|insufficient_granular_scope)(?=[" ,]|$)/i.test(challenge);
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = /^application\/(?:[^;]+\+)?json(?:;|$)/i.test(contentType);
  if (!isJson) {
    void response.body?.cancel().catch(() => {});
    if (scopeChallenge) return 'scope-missing';
    return /^text\/html(?:;|$)/i.test(contentType) ? 'html-denial' : 'denied';
  }

  try {
    const data: { error?: unknown; message?: unknown } | null = await response.json();
    const requiredPermissions = typeof data?.message === 'string'
      ? /following (?:project|group|user|instance) permissions:\s*\[([^\]]+)\]/i.exec(data.message)
      : null;
    if (requiredPermissions?.[1].split(',').some((permission) => /^Project:\s*Read$/i.test(permission.trim()))) {
      return 'project-read-missing';
    }
    if (requiredPermissions || data?.error === 'insufficient_scope' || data?.error === 'insufficient_granular_scope') {
      return 'scope-missing';
    }
  } catch {
    // A malformed body does not override an explicit authentication challenge.
  }
  return scopeChallenge ? 'scope-missing' : 'denied';
}
