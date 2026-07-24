import { Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';
import { CorosConfigService } from '../coros/coros.config';
import { ServiceAuthGuard } from '../http/service-auth.guard';
import { COROS_SESSION_STORE, type CorosSessionStore } from '../session/coros-session';

@Controller('/api/v1/coros/accounts/:accountId')
@UseGuards(ServiceAuthGuard)
export class AuthController {
  constructor(
    private readonly config: CorosConfigService,
    @Inject(COROS_SESSION_STORE) private readonly sessions: CorosSessionStore,
  ) {}

  @Post('auth-sessions')
  createAuthSession(): never {
    if (!this.config.remoteBrowserAuthEnabled) {
      throw new CorosIntegrationError(
        CorosErrorCode.capabilityUnavailable,
        'Удалённый интерактивный браузер не настроен. Используйте локальную команду auth-browser.',
        false,
        true,
      );
    }
    throw new CorosIntegrationError(
      CorosErrorCode.capabilityUnavailable,
      'InteractiveAuthProvider для remote browser ещё не настроен.',
      false,
      true,
    );
  }

  @Get('status')
  async status(@Param('accountId') accountId: string) {
    const session = await this.sessions.load(accountId);
    if (!session) return { status: 'disconnected' };
    return {
      status: 'connected',
      region: session.region,
      validated_at: session.validatedAt,
      protocol_version: session.protocolVersion,
    };
  }

  @Delete('session')
  async disconnect(@Param('accountId') accountId: string) {
    await this.sessions.delete(accountId);
    return { status: 'disconnected' };
  }
}
