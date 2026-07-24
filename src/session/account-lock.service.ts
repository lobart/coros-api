import { Injectable } from '@nestjs/common';
import { CorosErrorCode, CorosIntegrationError } from '../core/coros-error';

@Injectable()
export class AccountLockService {
  private readonly active = new Set<string>();

  async runExclusive<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
    if (this.active.has(accountId)) {
      throw new CorosIntegrationError(
        CorosErrorCode.sessionConflict,
        'Для этого аккаунта COROS уже выполняется операция.',
      );
    }
    this.active.add(accountId);
    try {
      return await operation();
    } finally {
      this.active.delete(accountId);
    }
  }
}
