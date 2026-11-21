export interface RepositoryLanguageKey {
  readonly address: string;
  readonly project: string;
}

export type RepositoryLanguageResult =
  | { ok: true; languages: readonly string[] }
  | { ok: false; reason: 'forbidden' | 'unavailable' };

export interface RepositoryLanguageCache {
  read(key: RepositoryLanguageKey): Promise<readonly string[] | undefined>;
  write(key: RepositoryLanguageKey, languages: readonly string[]): Promise<void>;
}

export class LoadRepositoryLanguages {
  private readonly loaded = new Map<string, readonly string[]>();
  private readonly pending = new Map<string, Promise<RepositoryLanguageResult>>();

  constructor(private readonly cache: RepositoryLanguageCache) {}

  async execute(
    key: RepositoryLanguageKey,
    fetchLanguages: () => Promise<RepositoryLanguageResult>,
  ): Promise<RepositoryLanguageResult> {
    const id = JSON.stringify([key.address, key.project]);
    const known = this.loaded.get(id);
    if (known !== undefined) return { ok: true, languages: known };

    const active = this.pending.get(id);
    if (active) return active;

    const load = this.load(key, id, fetchLanguages);
    this.pending.set(id, load);
    try {
      return await load;
    } finally {
      this.pending.delete(id);
    }
  }

  private async load(
    key: RepositoryLanguageKey,
    id: string,
    fetchLanguages: () => Promise<RepositoryLanguageResult>,
  ): Promise<RepositoryLanguageResult> {
    const stored = await this.cache.read(key).catch(() => undefined);
    if (stored !== undefined) {
      this.loaded.set(id, stored);
      return { ok: true, languages: stored };
    }

    const result = await fetchLanguages().catch((): RepositoryLanguageResult => ({ ok: false, reason: 'unavailable' }));
    if (result.ok) {
      this.loaded.set(id, result.languages);
      await this.cache.write(key, result.languages).catch(() => {});
    }
    return result;
  }
}
