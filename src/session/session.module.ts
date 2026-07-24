import { Module } from '@nestjs/common';
import { CorosConfigService } from '../coros/coros.config';
import { AccountLockService } from './account-lock.service';
import { COROS_SESSION_STORE } from './coros-session';
import { EncryptedFileCorosSessionStore } from './encrypted-file-session.store';

@Module({
  providers: [
    CorosConfigService,
    AccountLockService,
    EncryptedFileCorosSessionStore,
    { provide: COROS_SESSION_STORE, useExisting: EncryptedFileCorosSessionStore },
  ],
  exports: [AccountLockService, COROS_SESSION_STORE, CorosConfigService],
})
export class SessionModule {}
