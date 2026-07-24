import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { CorosConfigService } from '../coros/coros.config';

export type WorkoutAuditEvent = {
  operation: string;
  accountId: string;
  externalWorkoutId?: string;
  corosWorkoutId?: string;
  requestFingerprint?: string;
  protocolVersion: string;
  startedAt: string;
  completedAt: string;
  result: 'success' | 'failed';
  errorCode?: string;
};

@Injectable()
export class WorkoutAuditService {
  constructor(private readonly config: CorosConfigService) {}

  async record(event: WorkoutAuditEvent): Promise<void> {
    const path = resolve(`${this.config.sessionStoragePath}.audit.jsonl`);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const { accountId, ...safe } = event;
    await appendFile(
      path,
      `${JSON.stringify({ ...safe, accountHash: createHash('sha256').update(accountId).digest('hex') })}\n`,
      { mode: 0o600 },
    );
  }
}
