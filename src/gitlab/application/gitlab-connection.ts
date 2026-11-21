import { normalizeGitLabAddress, type GitLabCredentials } from '../domain/gitlab-account';

export type ValidationError = 'unauthorized' | 'forbidden' | 'redirect' | 'invalid-server' | 'unreachable';
export type ConnectionError = ValidationError | 'invalid-address' | 'invalid-token' | 'storage';
export type ConnectionStatus =
  | { connected: false }
  | { connected: true; address: string; username: string; storage: 'keychain' | 'session' };
export type ConnectionResult =
  | { ok: true; status: ConnectionStatus }
  | { ok: false; error: ConnectionError; canUseSession?: boolean };

export interface GitLabIdentity {
  verify(address: string, token: string): Promise<{ username: string } | { error: ValidationError }>;
}

export interface GitLabCredentialStore {
  read(): Promise<GitLabCredentials | undefined>;
  write(credentials: GitLabCredentials): Promise<void>;
  remove(): Promise<void>;
}

export class GitLabConnection {
  private current?: GitLabCredentials;
  private pending?: GitLabCredentials;
  private storage: 'keychain' | 'session' = 'keychain';
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly identity: GitLabIdentity, private readonly store: GitLabCredentialStore) {}

  status(): Promise<ConnectionResult> {
    return this.serial(async () => {
      if (!await this.load()) return { ok: false, error: 'storage' };
      return this.success();
    });
  }

  connect(address: unknown, rawToken: unknown): Promise<ConnectionResult> {
    return this.serial(async () => {
      this.pending = undefined;
      const normalized = typeof address === 'string' ? normalizeGitLabAddress(address) : undefined;
      if (!normalized) return { ok: false, error: 'invalid-address' };
      const token = typeof rawToken === 'string' ? rawToken.trim() : '';
      if (!token || token.length > 2048 || /[^\x21-\x7e]/.test(token)) {
        return { ok: false, error: 'invalid-token' };
      }

      const result = await this.identity.verify(normalized, token);
      if ('error' in result) return { ok: false, error: result.error };
      const credentials = { address: normalized, token, username: result.username };

      try {
        await this.store.write(credentials);
      } catch {
        this.pending = credentials;
        return { ok: false, error: 'storage', canUseSession: true };
      }
      this.current = credentials;
      this.loaded = true;
      this.storage = 'keychain';
      return this.success();
    });
  }

  useSession(): Promise<ConnectionResult> {
    return this.serial(async () => {
      if (!this.pending) return { ok: false, error: 'storage' };
      // An existing saved token must be removed before replacing it with a session token.
      if (this.current && this.storage === 'keychain') {
        try {
          await this.store.remove();
        } catch {
          return { ok: false, error: 'storage' };
        }
      }
      this.current = this.pending;
      this.pending = undefined;
      this.loaded = true;
      this.storage = 'session';
      return this.success();
    });
  }

  discardPending(): Promise<ConnectionResult> {
    return this.serial(async () => {
      this.pending = undefined;
      return this.success();
    });
  }

  disconnect(): Promise<ConnectionResult> {
    return this.serial(async () => {
      this.pending = undefined;
      try {
        if (this.storage !== 'session') await this.store.remove();
      } catch {
        return { ok: false, error: 'storage' };
      }
      this.current = undefined;
      this.loaded = true;
      return this.success();
    });
  }

  private async load(): Promise<boolean> {
    if (this.loaded) return true;
    try {
      this.current = await this.store.read();
      this.loaded = true;
      return true;
    } catch {
      return false;
    }
  }

  private success(): ConnectionResult {
    const credentials = this.current;
    return {
      ok: true,
      status: credentials
        ? { connected: true, address: credentials.address, username: credentials.username, storage: this.storage }
        : { connected: false },
    };
  }

  private serial(action: () => Promise<ConnectionResult>): Promise<ConnectionResult> {
    const result = this.queue.then(action).catch((): ConnectionResult => ({ ok: false, error: 'storage' }));
    this.queue = result;
    return result;
  }
}
