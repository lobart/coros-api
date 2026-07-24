import { timingSafeEqual } from 'node:crypto';
import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';
import { CorosConfigService } from '../coros/coros.config';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(private readonly config: CorosConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.serviceToken;
    if (!expected) {
      throw new CorosIntegrationError(CorosErrorCode.authRequired, 'COROS_SERVICE_TOKEN не настроен.');
    }
    const authorization = String(context.switchToHttp().getRequest().headers.authorization ?? '');
    const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expectedBuffer = Buffer.from(expected);
    const presentedBuffer = Buffer.from(presented);
    const valid =
      expectedBuffer.length === presentedBuffer.length &&
      expectedBuffer.length > 0 &&
      timingSafeEqual(expectedBuffer, presentedBuffer);
    if (!valid) {
      throw new CorosIntegrationError(CorosErrorCode.authRequired, 'Требуется service-to-service авторизация.');
    }
    return true;
  }
}
