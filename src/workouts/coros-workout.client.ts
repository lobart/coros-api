import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { z } from 'zod';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';
import { CorosConfigService } from '../coros/coros.config';
import { AccountLockService } from '../session/account-lock.service';
import { COROS_SESSION_STORE, type CorosSession, type CorosSessionStore } from '../session/coros-session';

const Envelope = z.object({
  apiCode: z.string().optional(),
  message: z.string(),
  result: z.string(),
  data: z.unknown().optional(),
  tlogId: z.string().optional(),
});

@Injectable()
export class CorosWorkoutClient {
  private readonly requestWindows = new Map<string, number[]>();

  constructor(
    private readonly http: HttpService,
    private readonly config: CorosConfigService,
    private readonly locks: AccountLockService,
    @Inject(COROS_SESSION_STORE) private readonly sessions: CorosSessionStore,
  ) {}

  async request<T>(
    accountId: string,
    method: 'GET' | 'POST',
    path: string,
    options: {
      body?: unknown;
      query?: Record<string, string | number>;
      write?: boolean;
      lock?: boolean;
    } = {},
  ): Promise<T> {
    const operation = async () => {
      const session = await this.session(accountId);
      this.enforceRateLimit(accountId);
      const url = new URL(path, this.config.apiUrlForRegion(session.region));
      for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, String(value));
      let response: AxiosResponse<unknown>;
      try {
        response = await this.http.axiosRef.request({
          method,
          url: url.toString(),
          data: options.body,
          timeout: 20_000,
          maxRedirects: 0,
          headers: {
            'content-type': 'application/json',
            accessToken: session.accessToken,
            YFHeader: JSON.stringify({ userId: session.accountUserId }),
          },
          validateStatus: () => true,
        });
      } catch (error) {
        throw new CorosIntegrationError(
          options.write ? CorosErrorCode.workoutCreateFailed : CorosErrorCode.authRequired,
          'COROS Training Hub временно недоступен.',
          true,
          false,
          { cause: error },
        );
      }
      if (response.status === 429) {
        throw new CorosIntegrationError(CorosErrorCode.rateLimited, 'COROS ограничил частоту запросов.', true);
      }
      if (response.status === 401 || response.status === 403) {
        throw new CorosIntegrationError(CorosErrorCode.authExpired, 'Сессия COROS истекла или отозвана.', false, true);
      }
      const contentType = String(response.headers['content-type'] ?? '');
      if (!contentType.includes('json')) {
        throw new CorosIntegrationError(CorosErrorCode.protocolChanged, 'COROS вернул неожиданный Content-Type.');
      }
      const parsed = Envelope.safeParse(response.data);
      if (!parsed.success) {
        throw new CorosIntegrationError(CorosErrorCode.protocolChanged, 'Структура ответа COROS изменилась.');
      }
      if (parsed.data.result !== '0000') {
        const code = this.mapProviderError(parsed.data.result);
        throw new CorosIntegrationError(code, 'COROS отклонил операцию.', false, code === CorosErrorCode.authExpired);
      }
      return parsed.data.data as T;
    };
    return (options.lock ?? options.write) ? await this.locks.runExclusive(accountId, operation) : await operation();
  }

  private async session(accountId: string): Promise<CorosSession> {
    const session = await this.sessions.load(accountId);
    if (!session) {
      throw new CorosIntegrationError(
        CorosErrorCode.authRequired,
        'Спортсмен должен самостоятельно подключить COROS.',
        false,
        true,
      );
    }
    return session;
  }

  private enforceRateLimit(accountId: string): void {
    const now = Date.now();
    const recent = (this.requestWindows.get(accountId) ?? []).filter((timestamp) => now - timestamp < 60_000);
    if (recent.length >= 30) {
      throw new CorosIntegrationError(CorosErrorCode.rateLimited, 'Локальный лимит COROS: 30 запросов в минуту.', true);
    }
    recent.push(now);
    this.requestWindows.set(accountId, recent);
  }

  private mapProviderError(result: string): CorosErrorCode {
    if (['1019', '5006', '401', '403'].includes(result)) return CorosErrorCode.authExpired;
    return CorosErrorCode.protocolChanged;
  }
}
