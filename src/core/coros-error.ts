export const CorosErrorCode = {
  authRequired: 'COROS_AUTH_REQUIRED',
  authInProgress: 'COROS_AUTH_IN_PROGRESS',
  authExpired: 'COROS_AUTH_EXPIRED',
  authRevoked: 'COROS_AUTH_REVOKED',
  additionalVerificationRequired: 'COROS_ADDITIONAL_VERIFICATION_REQUIRED',
  sessionConflict: 'COROS_SESSION_CONFLICT',
  writeDisabled: 'COROS_WRITE_DISABLED',
  capabilityUnavailable: 'COROS_WRITE_CAPABILITY_UNAVAILABLE',
  protocolChanged: 'COROS_PROTOCOL_CHANGED',
  validationFailed: 'COROS_VALIDATION_FAILED',
  rateLimited: 'COROS_RATE_LIMITED',
  workoutNotFound: 'COROS_WORKOUT_NOT_FOUND',
  workoutCreateFailed: 'COROS_WORKOUT_CREATE_FAILED',
  workoutUpdateFailed: 'COROS_WORKOUT_UPDATE_FAILED',
  workoutDeleteFailed: 'COROS_WORKOUT_DELETE_FAILED',
  scheduleFailed: 'COROS_SCHEDULE_FAILED',
  duplicateExternalWorkout: 'COROS_DUPLICATE_EXTERNAL_WORKOUT',
} as const;

export type CorosErrorCode = (typeof CorosErrorCode)[keyof typeof CorosErrorCode];

export class CorosIntegrationError extends Error {
  constructor(
    public readonly code: CorosErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly requiresUserInteraction = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CorosIntegrationError';
  }
}
