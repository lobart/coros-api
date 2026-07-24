import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorosConfigService } from '../coros/coros.config';
import { EncryptedFileCorosSessionStore } from './encrypted-file-session.store';

describe('EncryptedFileCorosSessionStore', () => {
  let path: string;

  beforeEach(() => {
    path = resolve(tmpdir(), `coros-session-${randomBytes(6).toString('hex')}.enc`);
    vi.stubEnv('COROS_SESSION_STORAGE_PATH', path);
    vi.stubEnv('COROS_SESSION_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encrypts sessions and isolates accounts', async () => {
    const store = new EncryptedFileCorosSessionStore(new CorosConfigService());
    await store.save('athlete-a', {
      accountId: 'athlete-a',
      region: 'eu',
      accountUserId: 'coros-a',
      accessToken: 'secret-a',
      createdAt: '2026-07-24T00:00:00.000Z',
      validatedAt: '2026-07-24T00:00:00.000Z',
      protocolVersion: 'test',
    });
    await store.save('athlete-b', {
      accountId: 'athlete-b',
      region: 'us',
      accountUserId: 'coros-b',
      accessToken: 'secret-b',
      createdAt: '2026-07-24T00:00:00.000Z',
      validatedAt: '2026-07-24T00:00:00.000Z',
      protocolVersion: 'test',
    });

    const raw = await readFile(path, 'utf8');
    expect(raw).not.toContain('secret-a');
    expect(raw).not.toContain('coros-a');
    expect((await store.load('athlete-a'))?.accessToken).toBe('secret-a');
    expect((await store.load('athlete-b'))?.accessToken).toBe('secret-b');
    expect(await store.list()).toEqual(
      expect.arrayContaining([
        expect.not.objectContaining({ accessToken: expect.anything() }),
        expect.objectContaining({ accountId: 'athlete-b' }),
      ]),
    );
    await access(path, constants.R_OK | constants.W_OK);
  });

  it('refuses plaintext fallback without a key', async () => {
    vi.stubEnv('COROS_SESSION_ENCRYPTION_KEY', '');
    const store = new EncryptedFileCorosSessionStore(new CorosConfigService());
    await expect(
      store.save('athlete-a', {
        accountId: 'athlete-a',
        region: 'eu',
        accountUserId: 'coros-a',
        accessToken: 'secret',
        createdAt: '2026-07-24T00:00:00.000Z',
        validatedAt: '2026-07-24T00:00:00.000Z',
        protocolVersion: 'test',
      }),
    ).rejects.toThrow('plaintext');
  });

  it('rejects a tampered ciphertext', async () => {
    const store = new EncryptedFileCorosSessionStore(new CorosConfigService());
    await store.save('athlete-a', {
      accountId: 'athlete-a',
      region: 'eu',
      accountUserId: 'coros-a',
      accessToken: 'secret',
      createdAt: '2026-07-24T00:00:00.000Z',
      validatedAt: '2026-07-24T00:00:00.000Z',
      protocolVersion: 'test',
    });
    const envelope = JSON.parse(await readFile(path, 'utf8'));
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    await writeFile(path, JSON.stringify(envelope));
    await chmod(path, 0o600);
    await expect(store.load('athlete-a')).rejects.toThrow();
  });

  it('does not replace an account alias with a different COROS subject', async () => {
    const store = new EncryptedFileCorosSessionStore(new CorosConfigService());
    const base = {
      accountId: 'athlete-a',
      region: 'eu' as const,
      accessToken: 'secret',
      createdAt: '2026-07-24T00:00:00.000Z',
      validatedAt: '2026-07-24T00:00:00.000Z',
      protocolVersion: 'test',
    };
    await store.save('athlete-a', { ...base, accountUserId: 'coros-a' });

    await expect(store.save('athlete-a', { ...base, accountUserId: 'coros-b' })).rejects.toThrow('привязан к другому');
    expect((await store.load('athlete-a'))?.accountUserId).toBe('coros-a');
  });
});
