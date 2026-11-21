import { Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import type { Credentials, CredentialStore } from '../application/account-connection';

export class KeychainCredentialStore implements CredentialStore {
  private readonly logger = new Logger('Keychain');

  constructor(
    private readonly helperPath: string,
    private readonly provider: 'gitlab' | 'github',
    private readonly normalizeAddress: (input: string) => string | undefined,
  ) {}

  async read(): Promise<Credentials | undefined> {
    const result = await this.run('read');
    if (result === undefined) return;
    let data: Partial<Credentials> | null;
    try {
      data = JSON.parse(result);
    } catch {
      this.logger.error(`${this.provider} read failed reason=invalid-entry`);
      throw new Error('Invalid Keychain entry');
    }
    if (
      typeof data?.address !== 'string' || this.normalizeAddress(data.address) !== data.address ||
      typeof data.token !== 'string' || !data.token || typeof data.username !== 'string'
    ) {
      this.logger.error(`${this.provider} read failed reason=invalid-entry`);
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
      const activity = `${this.provider} ${operation}`;
      this.logger.log(`${activity} started`);
      const child = spawn(this.helperPath, [operation, this.provider], {
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 25_000,
      });
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data: string) => { output += data; });
      child.stdin.on('error', () => {});
      let startFailed = false;
      child.once('error', () => {
        startFailed = true;
        this.logger.warn(`${activity} failed reason=helper-unavailable`);
        reject(new Error('Keychain unavailable'));
      });
      child.once('close', (code, signal) => {
        if (startFailed) return;
        if (code === 0) {
          this.logger.log(`${activity} completed`);
          resolve(output);
        } else if (code === 2 && operation !== 'write') {
          this.logger.log(`${activity} completed entry=missing`);
          resolve(undefined);
        } else {
          this.logger.warn(`${activity} failed exitCode=${code ?? 'none'} signal=${signal ?? 'none'}`);
          reject(new Error('Keychain unavailable'));
        }
      });
      child.stdin.end(input);
    });
  }
}
