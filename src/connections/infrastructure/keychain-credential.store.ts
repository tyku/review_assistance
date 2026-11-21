import { spawn } from 'node:child_process';
import type { Credentials, CredentialStore } from '../application/account-connection';

export class KeychainCredentialStore implements CredentialStore {
  constructor(
    private readonly helperPath: string,
    private readonly provider: 'gitlab' | 'github',
    private readonly normalizeAddress: (input: string) => string | undefined,
  ) {}

  async read(): Promise<Credentials | undefined> {
    const result = await this.run('read');
    if (result === undefined) return;
    const data: Partial<Credentials> | null = JSON.parse(result);
    if (
      typeof data?.address !== 'string' || this.normalizeAddress(data.address) !== data.address ||
      typeof data.token !== 'string' || !data.token || typeof data.username !== 'string'
    ) {
      throw new Error('Invalid Keychain entry');
    }
    return { address: data.address, token: data.token, username: data.username };
  }

  async write(credentials: Credentials): Promise<void> {
    await this.run('write', JSON.stringify(credentials));
  }

  async remove(): Promise<void> {
    await this.run('remove');
  }

  private run(operation: 'read' | 'write' | 'remove', input?: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.helperPath, [operation, this.provider], {
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 25_000,
      });
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data: string) => { output += data; });
      child.stdin.on('error', () => {});
      child.on('error', () => reject(new Error('Keychain unavailable')));
      child.on('close', (code) => {
        if (code === 0) resolve(output);
        else if (code === 2 && operation !== 'write') resolve(undefined);
        else reject(new Error('Keychain unavailable'));
      });
      child.stdin.end(input);
    });
  }
}
