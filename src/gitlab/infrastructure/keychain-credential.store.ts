import { spawn } from 'node:child_process';
import { normalizeGitLabAddress, type GitLabCredentials } from '../domain/gitlab-account';
import type { GitLabCredentialStore } from '../application/gitlab-connection';

export class KeychainCredentialStore implements GitLabCredentialStore {
  constructor(private readonly helperPath: string) {}

  async read(): Promise<GitLabCredentials | undefined> {
    const result = await this.run('read');
    if (result === undefined) return;
    const data: Partial<GitLabCredentials> | null = JSON.parse(result);
    if (
      typeof data?.address !== 'string' || normalizeGitLabAddress(data.address) !== data.address ||
      typeof data.token !== 'string' || !data.token || typeof data.username !== 'string'
    ) {
      throw new Error('Invalid Keychain entry');
    }
    return { address: data.address, token: data.token, username: data.username };
  }

  async write(credentials: GitLabCredentials): Promise<void> {
    await this.run('write', JSON.stringify(credentials));
  }

  async remove(): Promise<void> {
    await this.run('remove');
  }

  private run(operation: 'read' | 'write' | 'remove', input?: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.helperPath, [operation], {
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
