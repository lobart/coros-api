import { ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';

@Catch(CorosIntegrationError)
export class CorosErrorFilter implements ExceptionFilter {
  catch(exception: CorosIntegrationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    response.status(this.status(exception.code)).json({
      code: exception.code,
      message: exception.message,
      retryable: exception.retryable,
      requires_user_interaction: exception.requiresUserInteraction,
    });
  }

  private status(code: CorosErrorCode): number {
    if (code === CorosErrorCode.authRequired || code === CorosErrorCode.authExpired) return HttpStatus.UNAUTHORIZED;
    if (code === CorosErrorCode.rateLimited) return HttpStatus.TOO_MANY_REQUESTS;
    if (code === CorosErrorCode.workoutNotFound) return HttpStatus.NOT_FOUND;
    if (code === CorosErrorCode.sessionConflict || code === CorosErrorCode.duplicateExternalWorkout) {
      return HttpStatus.CONFLICT;
    }
    if (code === CorosErrorCode.validationFailed) return HttpStatus.BAD_REQUEST;
    if (
      code === CorosErrorCode.writeDisabled ||
      code === CorosErrorCode.capabilityUnavailable ||
      code === CorosErrorCode.protocolChanged
    ) {
      return HttpStatus.NOT_IMPLEMENTED;
    }
    return HttpStatus.BAD_GATEWAY;
  }
}
