import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';
import { CorosConfigService } from '../coros/coros.config';
import { CorosSession, type CorosSessionMetadata, type CorosSessionStore } from './coros-session';

const Vault = z.record(z.string(), CorosSession);
const Envelope = z.object({
  version: z.literal(1),
  algorithm: z.literal('aes-256-gcm'),
  nonce: z.string(),
  authTag: z.string(),
  ciphertext: z.string(),
});

@Injectable()
export class EncryptedFileCorosSessionStore implements CorosSessionStore {
  private operation = Promise.resolve();

  constructor(private readonly config: CorosConfigService) {}

  async save(accountId: string, session: CorosSession): Promise<void> {
    await this.serial(async () => {
      const parsed = CorosSession.parse({ ...session, accountId });
      const vault = await this.readVault();
      const existing = vault[accountId];
      if (existing && existing.accountUserId !== parsed.accountUserId) {
        throw new CorosIntegrationError(
          CorosErrorCode.sessionConflict,
          'Этот accountId уже привязан к другому COROS account subject.',
        );
      }
      vault[accountId] = parsed;
      await this.writeVault(vault);
    });
  }

  async load(accountId: string): Promise<CorosSession | null> {
    return await this.serial(async () => {
      const vault = await this.readVault();
      return vault[accountId] ?? null;
    });
  }

  async delete(accountId: string): Promise<void> {
    await this.serial(async () => {
      const vault = await this.readVault();
      if (!(accountId in vault)) return;
      delete vault[accountId];
      await this.writeVault(vault);
    });
  }

  async list(): Promise<CorosSessionMetadata[]> {
    return await this.serial(async () => {
      const vault = await this.readVault();
      return Object.values(vault).map(({ accessToken: _secret, ...metadata }) => metadata);
    });
  }

  private async serial<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operation;
    let release: () => void = () => undefined;
    this.operation = new Promise<void>((resolveOperation) => {
      release = resolveOperation;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private key(): Buffer {
    const value = this.config.sessionEncryptionKey;
    if (!value) {
      throw new CorosIntegrationError(
        CorosErrorCode.authRequired,
        'COROS_SESSION_ENCRYPTION_KEY не настроен; plaintext-хранилище запрещено.',
      );
    }
    const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
    if (key.length !== 32) {
      throw new CorosIntegrationError(
        CorosErrorCode.validationFailed,
        'COROS_SESSION_ENCRYPTION_KEY должен содержать 32 байта в base64 или 64 hex-символа.',
      );
    }
    return key;
  }

  private path(): string {
    return resolve(this.config.sessionStoragePath);
  }

  private async readVault(): Promise<Record<string, CorosSession>> {
    let raw: string;
    try {
      raw = await readFile(this.path(), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    const envelope = Envelope.parse(JSON.parse(raw));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(envelope.nonce, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
    return Vault.parse(JSON.parse(plaintext.toString('utf8')));
  }

  private async writeVault(vault: Record<string, CorosSession>): Promise<void> {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), nonce);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(vault), 'utf8'), cipher.final()]);
    const envelope = {
      version: 1,
      algorithm: 'aes-256-gcm',
      nonce: nonce.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    } as const;
    const target = this.path();
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, target);
    await chmod(target, 0o600);
  }
}
