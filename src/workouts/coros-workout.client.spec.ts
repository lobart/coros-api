import type { HttpService } from '@nestjs/axios';
import { describe, expect, it, vi } from 'vitest';
import { CorosConfigService } from '../coros/coros.config';
import { AccountLockService } from '../session/account-lock.service';
import type { CorosSessionStore } from '../session/coros-session';
import { CorosWorkoutClient } from './coros-workout.client';

describe('CorosWorkoutClient', () => {
  it('loads an isolated session for every account', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { apiCode: 'ok', message: 'OK', result: '0000', data: {} },
    });
    const sessions: CorosSessionStore = {
      save: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      load: vi.fn(async (accountId: string) => ({
        accountId,
        region: accountId === 'a' ? ('eu' as const) : ('us' as const),
        accountUserId: `user-${accountId}`,
        accessToken: `token-${accountId}`,
        createdAt: '2026-07-24T00:00:00.000Z',
        validatedAt: '2026-07-24T00:00:00.000Z',
        protocolVersion: 'test',
      })),
    };
    const client = new CorosWorkoutClient(
      { axiosRef: { request } } as unknown as HttpService,
      new CorosConfigService(),
      new AccountLockService(),
      sessions,
    );

    await client.request('a', 'GET', '/account/query');
    await client.request('b', 'GET', '/account/query');

    expect(request.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        url: 'https://teameuapi.coros.com/account/query',
        headers: expect.objectContaining({ accessToken: 'token-a', YFHeader: '{"userId":"user-a"}' }),
      }),
    );
    expect(request.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        url: 'https://teamapi.coros.com/account/query',
        headers: expect.objectContaining({ accessToken: 'token-b', YFHeader: '{"userId":"user-b"}' }),
      }),
    );
  });

  it('does not retry an ambiguous write', async () => {
    const request = vi.fn().mockRejectedValue(new Error('timeout'));
    const sessions: CorosSessionStore = {
      save: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      load: vi.fn(async () => ({
        accountId: 'a',
        region: 'eu' as const,
        accountUserId: 'user-a',
        accessToken: 'token-a',
        createdAt: '2026-07-24T00:00:00.000Z',
        validatedAt: '2026-07-24T00:00:00.000Z',
        protocolVersion: 'test',
      })),
    };
    const client = new CorosWorkoutClient(
      { axiosRef: { request } } as unknown as HttpService,
      new CorosConfigService(),
      new AccountLockService(),
      sessions,
    );

    await expect(client.request('a', 'POST', '/training/program/add', { body: {}, write: true })).rejects.toThrow(
      'временно недоступен',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('classifies the provider result 1019 as an expired session', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      data: { message: 'Authorization expired', result: '1019', tlogId: 'safe-test-id' },
    });
    const sessions: CorosSessionStore = {
      save: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      load: vi.fn(async () => ({
        accountId: 'a',
        region: 'eu' as const,
        accountUserId: 'user-a',
        accessToken: 'token-a',
        createdAt: '2026-07-24T00:00:00.000Z',
        validatedAt: '2026-07-24T00:00:00.000Z',
        protocolVersion: 'test',
      })),
    };
    const client = new CorosWorkoutClient(
      { axiosRef: { request } } as unknown as HttpService,
      new CorosConfigService(),
      new AccountLockService(),
      sessions,
    );

    await expect(client.request('a', 'POST', '/training/program/query', { body: {} })).rejects.toMatchObject({
      code: 'COROS_AUTH_EXPIRED',
      requiresUserInteraction: true,
    });
  });
});
