export interface Credentials {
  readonly address: string;
  readonly token: string;
  readonly username: string;
}

export type ValidationError = 'unauthorized' | 'forbidden' | 'redirect' | 'invalid-server' | 'unreachable';
export type AccountVerificationError = ValidationError
  | 'profile-read-denied'
  | 'profile-scope-missing'
  | 'profile-html-denial';
export type ConnectionError = AccountVerificationError | 'invalid-address' | 'invalid-token' | 'storage';
export type ConnectionStatus =
  | { connected: false }
  | { connected: true; address: string; username: string; storage: 'keychain' | 'session' };
export type ConnectionResult =
  | { ok: true; status: ConnectionStatus }
  | { ok: false; error: ConnectionError; canUseSession?: boolean };

export interface AccountIdentity {
  verify(address: string, token: string): Promise<{ username: string } | { error: AccountVerificationError }>;
}

export interface CredentialStore {
  read(): Promise<Credentials | undefined>;
  write(credentials: Credentials): Promise<void>;
  remove(): Promise<void>;
}

export class AccountConnection {
  private current?: Credentials;
  private pending?: Credentials;
  private storage: 'keychain' | 'session' = 'keychain';
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly identity: AccountIdentity,
    private readonly store: CredentialStore,
    private readonly normalizeAddress: (input: string) => string | undefined,
  ) {}

  status(): Promise<ConnectionResult> {
    return this.serial(async () => {
      if (!await this.load()) return { ok: false, error: 'storage' };
      return this.success();
    });
  }

  connect(address: unknown, rawToken: unknown): Promise<ConnectionResult> {
    return this.serial(async () => {
      this.pending = undefined;
      const normalized = typeof address === 'string' ? this.normalizeAddress(address) : undefined;
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

  withCredentials<Result>(
    action: (credentials: Credentials) => Promise<Result>,
  ): Promise<Result | { error: 'storage' | 'not-connected' }> {
    return this.enqueue(async () => {
      if (!await this.load()) return { error: 'storage' } as const;
      if (!this.current) return { error: 'not-connected' } as const;
      return action(this.current);
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

  private enqueue<Result>(action: () => Promise<Result>): Promise<Result> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }

  private serial(action: () => Promise<ConnectionResult>): Promise<ConnectionResult> {
    return this.enqueue(action).catch(() => ({ ok: false, error: 'storage' }));
  }
}
