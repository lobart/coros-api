import { randomUUID } from 'node:crypto';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { chromium, type Request } from 'playwright';
import { z } from 'zod';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';
import { CorosConfigService, type CorosRegion } from '../coros/coros.config';
import { AccountLockService } from '../session/account-lock.service';
import { COROS_SESSION_STORE, type CorosSession, type CorosSessionStore } from '../session/coros-session';
import type { InteractiveAuthProvider } from './interactive-auth.provider';

const AccountResponse = z.object({
  result: z.literal('0000'),
  data: z.record(z.string(), z.unknown()),
});

type CapturedAuth = { accessToken: string; accountUserId: string };

@Injectable()
export class PlaywrightAuthService implements InteractiveAuthProvider {
  private readonly logger = new Logger(PlaywrightAuthService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: CorosConfigService,
    private readonly locks: AccountLockService,
    @Inject(COROS_SESSION_STORE) private readonly store: CorosSessionStore,
  ) {}

  async authenticate(accountId: string, region: CorosRegion): Promise<CorosSession> {
    return await this.locks.runExclusive(accountId, async () => {
      const browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({
        recordHar: undefined,
        recordVideo: undefined,
      });
      const page = await context.newPage();
      let captured: CapturedAuth | null = null;
      page.on('request', (request) => {
        if (captured) return;
        void this.captureAuth(request).then((value) => {
          if (value) captured = value;
        });
      });

      this.logger.log('Открыто окно COROS. Введите данные, CAPTCHA и 2FA самостоятельно в браузере.');
      try {
        await page.goto('https://t.coros.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const deadline = Date.now() + 10 * 60_000;
        while (!captured && Date.now() < deadline && !page.isClosed()) {
          await page.waitForTimeout(500);
        }
        if (!captured) {
          throw new CorosIntegrationError(
            CorosErrorCode.additionalVerificationRequired,
            'Вход COROS не завершён. Продолжите подтверждение спортсменом и повторите попытку.',
            false,
            true,
          );
        }
        const candidate: CapturedAuth = captured;
        await this.validate(region, candidate);
        const now = new Date().toISOString();
        const session: CorosSession = {
          accountId,
          region,
          accountUserId: candidate.accountUserId,
          accessToken: candidate.accessToken,
          createdAt: now,
          validatedAt: now,
          protocolVersion: 'training-hub-web-v1',
        };
        await this.store.save(accountId, session);
        this.logger.log(`COROS session ${randomUUID().slice(0, 8)} подтверждена и сохранена в зашифрованном виде.`);
        return session;
      } finally {
        await context.close();
        await browser.close();
      }
    });
  }

  private async captureAuth(request: Request): Promise<CapturedAuth | null> {
    const url = new URL(request.url());
    if (!url.hostname.endsWith('coros.com')) return null;
    const headers = await request.allHeaders();
    const accessToken = headers.accesstoken;
    const yfHeader = headers.yfheader;
    if (!accessToken || !yfHeader) return null;
    try {
      const parsed = z
        .object({ userId: z.union([z.string(), z.number()]).transform(String) })
        .parse(JSON.parse(yfHeader));
      return { accessToken, accountUserId: parsed.userId };
    } catch {
      return null;
    }
  }

  private async validate(region: CorosRegion, session: CapturedAuth): Promise<void> {
    try {
      const response = await this.http.axiosRef.get(
        new URL('/account/query', this.config.apiUrlForRegion(region)).toString(),
        {
          timeout: 15_000,
          headers: {
            accessToken: session.accessToken,
            YFHeader: JSON.stringify({ userId: session.accountUserId }),
          },
        },
      );
      const parsed = AccountResponse.parse(response.data);
      const returnedId = String(parsed.data.userId ?? parsed.data.id ?? '');
      if (returnedId && returnedId !== session.accountUserId) {
        throw new CorosIntegrationError(
          CorosErrorCode.authRevoked,
          'Полученная COROS-сессия относится к другому аккаунту.',
        );
      }
    } catch (error) {
      if (error instanceof CorosIntegrationError) throw error;
      throw new CorosIntegrationError(
        CorosErrorCode.authExpired,
        'COROS-сессия не прошла read-only проверку.',
        false,
        true,
      );
    }
  }
}
